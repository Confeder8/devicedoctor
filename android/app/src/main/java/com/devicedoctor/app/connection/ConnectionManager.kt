package com.devicedoctor.app.connection

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import com.devicedoctor.app.api.ApiRouter
import com.devicedoctor.app.security.SecurityManager
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.netty.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.serialization.gson.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import java.net.*
import java.time.Duration

/**
 * Connection Manager - Manages Wi-Fi and Bluetooth servers
 */
class ConnectionManager(
    private val context: Context,
    private val securityManager: SecurityManager
) {
    private var httpServer: NettyApplicationEngine? = null
    private var wsServer: NettyApplicationEngine? = null
    private var bluetoothServer: BluetoothServer? = null
    private var udpSocket: DatagramSocket? = null
    private var nsdManager: NsdManager? = null
    private val apiRouter = ApiRouter(context, securityManager)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        const val HTTP_PORT = 8443
        const val WS_PORT = 8444
        const val UDP_PORT = 8445
        private const val SERVICE_TYPE = "_devicedoctor._tcp"

        @Volatile
        @JvmStatic
        var desktopConnected: Boolean = false

        /** Active WebSocket sessions for broadcasting */
        private val wsConnections = java.util.concurrent.ConcurrentHashMap<String, WebSocketSession>()

        /**
         * Broadcast a JSON message to all connected WebSocket clients
         */
        @JvmStatic
        fun broadcastWebSocket(type: String, payload: Map<String, Any?>) {
            val message = com.google.gson.Gson().toJson(mapOf("type" to type, "data" to payload))
            wsConnections.values.forEach { session ->
                try {
                    kotlinx.coroutines.runBlocking {
                        session.send(Frame.Text(message))
                    }
                } catch (e: Exception) {
                    // Connection may have closed, ignore
                }
            }
        }
    }

    /**
     * Start Wi-Fi HTTP server
     */
    suspend fun startWiFiServer() = withContext(Dispatchers.IO) {
        try {
            httpServer = embeddedServer(Netty, port = HTTP_PORT) {
                install(ContentNegotiation) {
                    gson()
                }

                routing {
                    // Health check
                    get("/health") {
                        call.respond(mapOf("status" to "ok"))
                    }

                    // Encrypted request handler
                    post("/api/v1/request") {
                        try {
                            val encryptedRequest = call.receive<Map<String, String>>()
                            val response = apiRouter.handleEncryptedRequest(encryptedRequest)
                            call.respond(response)
                        } catch (e: Exception) {
                            call.respond(mapOf(
                                "status" to "error",
                                "error" to mapOf(
                                    "type" to "InternalServerError",
                                    "message" to (e.message ?: "Unknown error")
                                )
                            ))
                        }
                    }

                    // All API routes
                    route("/api/v1") {
                        // Pairing
                        post("/pairing/initiate") {
                            val request = call.receive<Map<String, Any>>()
                            val response = apiRouter.handlePairingInitiate(request)
                            // Pairing establishes crypto keys but does NOT mean "connected".
                            // The desktop heartbeat response is the authoritative connection state.
                            call.respond(response)
                        }

                        post("/pairing/complete") {
                            val request = call.receive<Map<String, Any>>()
                            val response = apiRouter.handlePairingComplete(request)
                            call.respond(response)
                        }

                        // Session
                        get("/session/validate") {
                            val sessionId = call.request.header("X-Session-Id")
                            val response = apiRouter.handleSessionValidate(sessionId)
                            call.respond(response)
                        }

                        delete("/session/revoke") {
                            val sessionId = call.request.header("X-Session-Id")
                            apiRouter.handleSessionRevoke(sessionId)
                            desktopConnected = false
                            call.respond(mapOf("status" to "success"))
                        }

                        // Connection status
                        post("/connection/disconnect") {
                            desktopConnected = false
                            call.respond(mapOf("status" to "success"))
                        }

                        post("/connection/connect") {
                            desktopConnected = true
                            call.respond(mapOf("status" to "success"))
                        }
                    }
                }
            }.start(wait = false)

            println("HTTP server started on port $HTTP_PORT")
        } catch (e: Exception) {
            e.printStackTrace()
            throw Exception("Failed to start HTTP server: ${e.message}")
        }
    }

    /**
     * Start WebSocket server for real-time updates
     */
    suspend fun startWebSocketServer() = withContext(Dispatchers.IO) {
        try {
            wsServer = embeddedServer(Netty, port = WS_PORT) {
                install(WebSockets) {
                    pingPeriod = Duration.ofSeconds(30)
                    timeout = Duration.ofSeconds(15)
                    maxFrameSize = Long.MAX_VALUE
                    masking = false
                }

                routing {
                    webSocket("/ws") {
                        val sessionId = java.util.UUID.randomUUID().toString()
                        wsConnections[sessionId] = this
                        println("WebSocket client connected: $sessionId")
                        try {
                            for (frame in incoming) {
                                when (frame) {
                                    is Frame.Text -> {
                                        val text = frame.readText()
                                        println("WebSocket message from $sessionId: $text")
                                    }
                                    else -> {}
                                }
                            }
                        } catch (e: Exception) {
                            e.printStackTrace()
                        } finally {
                            wsConnections.remove(sessionId)
                            println("WebSocket client disconnected: $sessionId")
                        }
                    }
                }
            }.start(wait = false)

            println("WebSocket server started on port $WS_PORT")
        } catch (e: Exception) {
            e.printStackTrace()
            throw Exception("Failed to start WebSocket server: ${e.message}")
        }
    }

    /**
     * Start Bluetooth RFCOMM server
     */
    suspend fun startBluetoothServer() = withContext(Dispatchers.IO) {
        try {
            bluetoothServer = BluetoothServer(context, securityManager, apiRouter)
            bluetoothServer?.start()
            println("Bluetooth server started")
        } catch (e: Exception) {
            e.printStackTrace()
            println("Failed to start Bluetooth server: ${e.message}")
        }
    }

    /**
     * Broadcast presence via UDP
     */
    fun broadcastPresence() {
        scope.launch {
            try {
                udpSocket = DatagramSocket(UDP_PORT)
                udpSocket?.broadcast = true

                // Listen for discovery requests
                while (isActive) {
                    val buffer = ByteArray(1024)
                    val packet = DatagramPacket(buffer, buffer.size)

                    try {
                        udpSocket?.receive(packet)

                        val message = String(packet.data, 0, packet.length)
                        if (message.contains("devicedoctor_discover")) {
                            // Send announcement response
                            sendAnnouncement(packet.address)
                        }
                    } catch (e: Exception) {
                        // Ignore timeout errors
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        // Start mDNS service advertisement
        startMDNSAdvertisement()
    }

    /**
     * Send UDP announcement
     */
    private fun sendAnnouncement(address: InetAddress) {
        scope.launch {
            try {
                val deviceInfo = mapOf(
                    "type" to "devicedoctor_announce",
                    "deviceId" to securityManager.getSession("default")?.deviceId,
                    "deviceName" to android.os.Build.MODEL,
                    "manufacturer" to android.os.Build.MANUFACTURER,
                    "model" to android.os.Build.MODEL,
                    "androidVersion" to android.os.Build.VERSION.RELEASE,
                    "port" to HTTP_PORT
                )

                val gson = com.google.gson.Gson()
                val json = gson.toJson(deviceInfo)
                val data = json.toByteArray()

                val packet = DatagramPacket(data, data.size, address, UDP_PORT)
                udpSocket?.send(packet)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    /**
     * Start mDNS service advertisement
     */
    private fun startMDNSAdvertisement() {
        try {
            nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager

            val serviceInfo = NsdServiceInfo().apply {
                serviceName = "DeviceDoctor-${android.os.Build.MODEL}"
                serviceType = SERVICE_TYPE
                port = HTTP_PORT
            }

            nsdManager?.registerService(
                serviceInfo,
                NsdManager.PROTOCOL_DNS_SD,
                object : NsdManager.RegistrationListener {
                    override fun onRegistrationFailed(serviceInfo: NsdServiceInfo?, errorCode: Int) {
                        println("mDNS registration failed: $errorCode")
                    }

                    override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo?, errorCode: Int) {
                        println("mDNS unregistration failed: $errorCode")
                    }

                    override fun onServiceRegistered(serviceInfo: NsdServiceInfo?) {
                        println("mDNS service registered: ${serviceInfo?.serviceName}")
                    }

                    override fun onServiceUnregistered(serviceInfo: NsdServiceInfo?) {
                        println("mDNS service unregistered")
                    }
                }
            )
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Stop all servers
     */
    suspend fun stopAll() = withContext(Dispatchers.IO) {
        httpServer?.stop(1000, 2000)
        wsServer?.stop(1000, 2000)
        bluetoothServer?.stop()
        udpSocket?.close()
        nsdManager?.unregisterService(object : NsdManager.RegistrationListener {
            override fun onRegistrationFailed(p0: NsdServiceInfo?, p1: Int) {}
            override fun onUnregistrationFailed(p0: NsdServiceInfo?, p1: Int) {}
            override fun onServiceRegistered(p0: NsdServiceInfo?) {}
            override fun onServiceUnregistered(p0: NsdServiceInfo?) {}
        })
        scope.cancel()
    }
}
