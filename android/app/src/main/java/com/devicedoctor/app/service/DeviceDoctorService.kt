package com.devicedoctor.app.service

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.devicedoctor.app.DeviceDoctorApplication
import com.devicedoctor.app.R
import com.devicedoctor.app.connection.ConnectionManager
import com.devicedoctor.app.security.SecurityManager
import com.devicedoctor.app.ui.MainActivity
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL

/**
 * Foreground Service for DeviceDoctor
 * Maintains persistent connection with desktop clients
 */
class DeviceDoctorService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private lateinit var wakeLock: PowerManager.WakeLock
    private lateinit var connectionManager: ConnectionManager
    private lateinit var securityManager: SecurityManager

    override fun onCreate() {
        super.onCreate()

        // Acquire wake lock to keep service running
        val powerManager = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "DeviceDoctor::ServiceWakeLock"
        )
        wakeLock.acquire(10*60*1000L /*10 minutes*/)

        // Reset connection state — desktop must confirm via heartbeat
        ConnectionManager.desktopConnected = false

        // Initialize managers
        securityManager = SecurityManager(this)
        connectionManager = ConnectionManager(this, securityManager)

        // Start foreground with notification
        startForeground(NOTIFICATION_ID, createNotification())

        // Start connection services
        serviceScope.launch {
            try {
                connectionManager.startWiFiServer()
                connectionManager.startWebSocketServer()
                connectionManager.startBluetoothServer()
                connectionManager.broadcastPresence()
            } catch (e: Exception) {
                // Handle startup errors
                e.printStackTrace()
            }
        }

        // Auto-connect to desktop via tunnel
        autoConnectViaTunnel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                // Service already started in onCreate
            }
            ACTION_STOP -> {
                stopSelf()
            }
        }

        // Restart service if killed
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null // Not a bound service
    }

    override fun onDestroy() {
        super.onDestroy()

        // Mark disconnected immediately
        ConnectionManager.desktopConnected = false

        // Stop connection services
        serviceScope.launch {
            connectionManager.stopAll()
        }

        // Release wake lock
        if (wakeLock.isHeld) {
            wakeLock.release()
        }

        // Cancel all coroutines
        serviceScope.cancel()
    }

    private fun createNotification(): Notification {
        val notificationIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, DeviceDoctorApplication.CHANNEL_SERVICE)
            .setContentTitle("DeviceDoctor Active")
            .setContentText("Ready to connect with desktop")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    fun updateNotification(text: String) {
        val notification = NotificationCompat.Builder(this, DeviceDoctorApplication.CHANNEL_SERVICE)
            .setContentTitle("DeviceDoctor Active")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    /**
     * Resolve the desktop address to use for heartbeats / pairing.
     * Priority:
     *   1. Session's desktopIp + DESKTOP_PORT (stored during pairing)
     *   2. Tunnel host + tunnel port (configured or hardcoded fallback)
     *   3. Emulator loopback 10.0.2.2 + DESKTOP_PORT (emulator-only)
     * Returns list of (host, port) pairs to try in order.
     */
    private fun getDesktopEndpoints(session: com.devicedoctor.app.security.SecurityManager.Session? = null): List<Pair<String, Int>> {
        val endpoints = mutableListOf<Pair<String, Int>>()

        // 1. Session's stored desktop IP (from pairing QR data)
        val desktopIp = session?.desktopIp
        if (!desktopIp.isNullOrBlank() && desktopIp != "0.0.0.0") {
            endpoints.add(desktopIp to DESKTOP_PORT)
        }

        // 2. Tunnel relay
        if (DESKTOP_TUNNEL_HOST.isNotBlank()) {
            endpoints.add(DESKTOP_TUNNEL_HOST to DESKTOP_TUNNEL_PORT)
        }

        // 3. Emulator loopback fallback
        endpoints.add(EMULATOR_HOST to DESKTOP_PORT)

        return endpoints.distinct()
    }

    /**
     * Try an HTTP request against multiple desktop endpoints.
     * Returns the (connection, host, port) for the first successful one, or null.
     */
    private fun tryEndpoints(
        endpoints: List<Pair<String, Int>>,
        path: String,
        method: String = "GET",
        body: String? = null,
        connectTimeout: Int = 5000,
        readTimeout: Int = 5000
    ): Triple<HttpURLConnection, String, Int>? {
        for ((host, port) in endpoints) {
            try {
                val url = URL("http://$host:$port$path")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = method
                conn.connectTimeout = connectTimeout
                conn.readTimeout = readTimeout
                if (body != null) {
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.doOutput = true
                    conn.outputStream.use { it.write(body.toByteArray()) }
                }
                // Trigger the connection — if this throws, try next endpoint
                val code = conn.responseCode
                Log.i(TAG, "tryEndpoints: $method $path -> $host:$port => $code")
                return Triple(conn, host, port)
            } catch (e: Exception) {
                Log.w(TAG, "tryEndpoints: $host:$port$path failed: ${e.message}")
            }
        }
        return null
    }

    /**
     * Auto-connect to desktop via tunnel or direct IP.
     * Android is the client — it polls the desktop for pairing info, then
     * sends heartbeats after pairing.
     *
     * Flow:
     * 1. If no sessions: poll /api/v1/pairing/info, auto-pair when desktop is ready
     * 2. If has sessions: send heartbeat to /api/v1/heartbeat every 10s
     *    - Heartbeat includes device info (battery, storage, etc.)
     *    - Desktop responds with desired connection state
     */
    private fun autoConnectViaTunnel() {
        Log.i(TAG, "autoConnectViaTunnel: method called")
        serviceScope.launch(Dispatchers.IO) {
            Log.i(TAG, "autoConnectViaTunnel: coroutine started, waiting 5s...")
            delay(5000)
            Log.i(TAG, "autoConnectViaTunnel: delay done, entering loop. isActive=$isActive")

            while (isActive) {
                val sessions = securityManager.getAllSessions()
                Log.i(TAG, "Loop: sessions=${sessions.size}")

                // Phase 1: Already paired — send heartbeats
                if (sessions.isNotEmpty()) {
                    val session = sessions.first()
                    val endpoints = getDesktopEndpoints(session)
                    try {
                        val postBody = JSONObject().apply {
                            put("deviceId", session.deviceId)
                            put("deviceName", android.os.Build.MODEL)
                            put("androidVersion", android.os.Build.VERSION.RELEASE)
                        }.toString()

                        val result = tryEndpoints(endpoints, "/api/v1/heartbeat", "POST", postBody)
                        if (result != null) {
                            val (conn, host, port) = result
                            val code = conn.responseCode
                            Log.i(TAG, "Heartbeat: response=$code from $host:$port")
                            if (code == 200) {
                                val respBody = conn.inputStream.bufferedReader().readText()
                                val resp = JSONObject(respBody)
                                val desktopWantsConnected = resp.optBoolean("connected", false)
                                ConnectionManager.desktopConnected = desktopWantsConnected
                                if (!desktopWantsConnected) {
                                    Log.i(TAG, "Heartbeat: Desktop requested disconnect")
                                }

                                val pairingActive = resp.optBoolean("pairingActive", false)
                                if (pairingActive) {
                                    Log.i(TAG, "Heartbeat: Desktop has active pairing, clearing local sessions to re-pair")
                                    securityManager.clearAllSessions()
                                    continue
                                }
                            } else {
                                ConnectionManager.desktopConnected = false
                            }
                        } else {
                            ConnectionManager.desktopConnected = false
                            Log.e(TAG, "Heartbeat: all endpoints unreachable")
                        }
                    } catch (e: Exception) {
                        ConnectionManager.desktopConnected = false
                        Log.e(TAG, "Heartbeat error: ${e.javaClass.simpleName}: ${e.message}")
                    }
                    delay(10000)
                    continue
                }

                // Phase 2: No sessions — try to auto-pair with desktop
                val endpoints = getDesktopEndpoints()
                try {
                    val result = tryEndpoints(endpoints, "/api/v1/pairing/info")
                    if (result != null) {
                        val (conn, host, port) = result
                        val responseCode = conn.responseCode
                        Log.i(TAG, "Auto-pair: response=$responseCode from $host:$port")

                        if (responseCode == 200) {
                            val body = conn.inputStream.bufferedReader().readText()
                            Log.i(TAG, "Auto-pair: body=${body.take(200)}")
                            val json = JSONObject(body)

                            if (json.optString("status") == "paired") {
                                Log.i(TAG, "Auto-pair: Desktop already paired, skipping")
                                delay(10000)
                                continue
                            }

                            val pairingData = securityManager.processPairingQR(body)
                            Log.i(TAG, "Auto-pair: Found desktop '${pairingData.desktopName}', completing pairing...")

                            val pairingResult = securityManager.completePairing(pairingData)

                            val completeBody = JSONObject().apply {
                                put("androidPublicKey", pairingResult.androidPublicKey)
                                put("deviceId", pairingResult.session.deviceId)
                                put("challenge", pairingResult.challenge)
                                put("deviceName", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
                                put("manufacturer", android.os.Build.MANUFACTURER)
                                put("model", android.os.Build.MODEL)
                                put("androidVersion", android.os.Build.VERSION.RELEASE)
                                put("androidPort", ConnectionManager.HTTP_PORT)
                            }.toString()

                            // Complete pairing via the same endpoint that responded
                            val completeResult = tryEndpoints(
                                listOf(host to port), "/api/v1/pairing/complete", "POST", completeBody,
                                connectTimeout = 10000, readTimeout = 10000
                            )

                            val completeCode = completeResult?.first?.responseCode ?: -1
                            Log.i(TAG, "Auto-pair: complete response=$completeCode")

                            if (completeCode == 200) {
                                Log.i(TAG, "Auto-pair: Pairing successful!")
                                withContext(Dispatchers.Main) {
                                    updateNotification("Paired with ${pairingData.desktopName}")
                                }
                            } else {
                                Log.w(TAG, "Auto-pair: Desktop rejected pairing ($completeCode)")
                            }
                        } else {
                            Log.w(TAG, "Auto-pair: Desktop not ready ($responseCode)")
                        }
                    } else {
                        Log.w(TAG, "Auto-pair: all endpoints unreachable")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Auto-pair error: ${e.javaClass.simpleName}: ${e.message}")
                }

                delay(10000)
            }
        }
    }

    companion object {
        private const val TAG = "DDService"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.devicedoctor.app.action.START"
        const val ACTION_STOP = "com.devicedoctor.app.action.STOP"
        // Desktop's HTTP server port (always 7771)
        const val DESKTOP_PORT = 7771
        // Tunnel relay for production (internet relay)
        const val DESKTOP_TUNNEL_HOST = "brjk01agv.localto.net"
        const val DESKTOP_TUNNEL_PORT = 7580
        // Emulator loopback: 10.0.2.2 maps to host's localhost
        const val EMULATOR_HOST = "10.0.2.2"
    }
}
