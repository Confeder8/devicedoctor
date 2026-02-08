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

        // Initialize managers
        securityManager = SecurityManager(this)
        connectionManager = ConnectionManager(this, securityManager)

        // Start foreground with notification
        startForeground(NOTIFICATION_ID, createNotification())

        // Start connection services
        serviceScope.launch {
            try {
                connectionManager.startWiFiServer()
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
     * Auto-connect to desktop via tunnel.
     * The tunnel at DESKTOP_TUNNEL_HOST:DESKTOP_TUNNEL_PORT routes to the
     * desktop's HTTP server (port 7771). Android is the client — it polls
     * the desktop for pairing info, then sends heartbeats after pairing.
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

            // DNS check — resolve tunnel hostname once to diagnose connectivity
            try {
                Log.i(TAG, "DNS check: resolving $DESKTOP_TUNNEL_HOST ...")
                val addr = InetAddress.getByName(DESKTOP_TUNNEL_HOST)
                Log.i(TAG, "DNS check: $DESKTOP_TUNNEL_HOST -> ${addr.hostAddress}")
            } catch (e: Exception) {
                Log.e(TAG, "DNS check FAILED: ${e.javaClass.simpleName}: ${e.message}")
            }

            while (isActive) {
                val sessions = securityManager.getAllSessions()
                Log.i(TAG, "Loop: sessions=${sessions.size}")

                // Phase 1: Already paired — send heartbeats
                if (sessions.isNotEmpty()) {
                    try {
                        Log.i(TAG, "Heartbeat: sending to $DESKTOP_TUNNEL_HOST:$DESKTOP_TUNNEL_PORT")
                        val heartbeatUrl = URL("http://$DESKTOP_TUNNEL_HOST:$DESKTOP_TUNNEL_PORT/api/v1/heartbeat")
                        val conn = heartbeatUrl.openConnection() as HttpURLConnection
                        conn.requestMethod = "POST"
                        conn.setRequestProperty("Content-Type", "application/json")
                        conn.doOutput = true
                        conn.connectTimeout = 5000
                        conn.readTimeout = 5000

                        val session = sessions.firstOrNull()
                        val postBody = JSONObject().apply {
                            put("deviceId", session?.deviceId ?: "")
                            put("deviceName", android.os.Build.MODEL)
                            put("androidVersion", android.os.Build.VERSION.RELEASE)
                        }.toString()

                        conn.outputStream.use { it.write(postBody.toByteArray()) }

                        val code = conn.responseCode
                        Log.i(TAG, "Heartbeat: response=$code")
                        if (code == 200) {
                            val respBody = conn.inputStream.bufferedReader().readText()
                            val resp = JSONObject(respBody)
                            val desktopWantsConnected = resp.optBoolean("connected", true)
                            ConnectionManager.desktopConnected = desktopWantsConnected
                            if (!desktopWantsConnected) {
                                Log.i(TAG, "Heartbeat: Desktop requested disconnect")
                            }
                        } else {
                            ConnectionManager.desktopConnected = false
                        }
                    } catch (e: Exception) {
                        ConnectionManager.desktopConnected = false
                        Log.e(TAG, "Heartbeat error: ${e.javaClass.simpleName}: ${e.message}")
                    }
                    delay(10000)
                    continue
                }

                // Phase 2: No sessions — try to auto-pair with desktop
                try {
                    Log.i(TAG, "Auto-pair: GET http://$DESKTOP_TUNNEL_HOST:$DESKTOP_TUNNEL_PORT/api/v1/pairing/info")

                    val url = URL("http://$DESKTOP_TUNNEL_HOST:$DESKTOP_TUNNEL_PORT/api/v1/pairing/info")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 5000
                    conn.readTimeout = 5000

                    Log.i(TAG, "Auto-pair: connecting...")
                    val responseCode = conn.responseCode
                    Log.i(TAG, "Auto-pair: response=$responseCode")

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

                        val result = securityManager.completePairing(pairingData)

                        val completeUrl = URL("http://$DESKTOP_TUNNEL_HOST:$DESKTOP_TUNNEL_PORT/api/v1/pairing/complete")
                        val completeConn = completeUrl.openConnection() as HttpURLConnection
                        completeConn.requestMethod = "POST"
                        completeConn.setRequestProperty("Content-Type", "application/json")
                        completeConn.doOutput = true
                        completeConn.connectTimeout = 10000
                        completeConn.readTimeout = 10000

                        val postBody = JSONObject().apply {
                            put("androidPublicKey", result.androidPublicKey)
                            put("deviceId", result.session.deviceId)
                            put("challenge", result.challenge)
                            put("deviceName", android.os.Build.MODEL)
                            put("androidVersion", android.os.Build.VERSION.RELEASE)
                        }.toString()

                        completeConn.outputStream.use { it.write(postBody.toByteArray()) }

                        val completeCode = completeConn.responseCode
                        Log.i(TAG, "Auto-pair: complete response=$completeCode")

                        if (completeCode == 200) {
                            Log.i(TAG, "Auto-pair: Pairing successful!")
                            ConnectionManager.desktopConnected = true
                            withContext(Dispatchers.Main) {
                                updateNotification("Connected to ${pairingData.desktopName}")
                            }
                        } else {
                            Log.w(TAG, "Auto-pair: Desktop rejected pairing ($completeCode)")
                        }
                    } else {
                        Log.w(TAG, "Auto-pair: Desktop not ready ($responseCode)")
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
        // Tunnel forwards brjk01agv.localto.net:7580 → desktop's localhost:7771
        const val DESKTOP_TUNNEL_HOST = "brjk01agv.localto.net"
        const val DESKTOP_TUNNEL_PORT = 7580
    }
}
