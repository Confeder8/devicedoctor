package com.devicedoctor.app.connection

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothServerSocket
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import com.devicedoctor.app.api.ApiRouter
import com.devicedoctor.app.security.SecurityManager
import kotlinx.coroutines.*
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.*

/**
 * Bluetooth RFCOMM Server
 */
class BluetoothServer(
    private val context: Context,
    private val securityManager: SecurityManager,
    private val apiRouter: ApiRouter
) {
    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var serverSocket: BluetoothServerSocket? = null
    private var isRunning = false
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        private val SERVICE_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        private const val SERVICE_NAME = "DeviceDoctor"
        private const val MAGIC_BYTE_1: Byte = 0xDD.toByte()
        private const val MAGIC_BYTE_2: Byte = 0x01.toByte()
    }

    /**
     * Start Bluetooth server
     */
    fun start() {
        if (bluetoothAdapter == null) {
            println("Bluetooth not available on this device")
            return
        }

        // Check Bluetooth permission
        if (ActivityCompat.checkSelfPermission(
                context,
                android.Manifest.permission.BLUETOOTH_CONNECT
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            println("Bluetooth permission not granted")
            return
        }

        scope.launch {
            try {
                serverSocket = bluetoothAdapter.listenUsingRfcommWithServiceRecord(
                    SERVICE_NAME,
                    SERVICE_UUID
                )

                isRunning = true
                println("Bluetooth server started, waiting for connections...")

                while (isRunning) {
                    try {
                        val socket = serverSocket?.accept() // Blocking call
                        socket?.let {
                            println("Bluetooth client connected")
                            handleClient(it)
                        }
                    } catch (e: IOException) {
                        if (isRunning) {
                            println("Bluetooth accept error: ${e.message}")
                        }
                        break
                    }
                }
            } catch (e: Exception) {
                println("Bluetooth server error: ${e.message}")
                e.printStackTrace()
            }
        }
    }

    /**
     * Handle Bluetooth client connection
     */
    private fun handleClient(socket: BluetoothSocket) {
        scope.launch {
            try {
                val inputStream = socket.inputStream
                val outputStream = socket.outputStream

                while (isRunning && socket.isConnected) {
                    try {
                        // Read frame
                        val frame = readFrame(inputStream) ?: break

                        // Parse request
                        val request = parseFrame(frame)

                        // Handle request
                        val response = apiRouter.handleEncryptedRequest(request)

                        // Build response frame
                        val responseFrame = buildFrame(response)

                        // Send response
                        outputStream.write(responseFrame)
                        outputStream.flush()
                    } catch (e: Exception) {
                        println("Bluetooth communication error: ${e.message}")
                        break
                    }
                }

                socket.close()
                println("Bluetooth client disconnected")
            } catch (e: Exception) {
                println("Bluetooth client handler error: ${e.message}")
            }
        }
    }

    /**
     * Read frame from input stream
     */
    private fun readFrame(inputStream: InputStream): ByteArray? {
        try {
            // Read magic bytes
            val magic1 = inputStream.read()
            val magic2 = inputStream.read()

            if (magic1 == -1 || magic2 == -1) return null
            if (magic1.toByte() != MAGIC_BYTE_1 || magic2.toByte() != MAGIC_BYTE_2) {
                println("Invalid magic bytes")
                return null
            }

            // Read protocol version (2 bytes)
            inputStream.skip(2)

            // Read payload length (4 bytes, big-endian)
            val lengthBytes = ByteArray(4)
            if (inputStream.read(lengthBytes) != 4) return null
            val payloadLength = bytesToInt(lengthBytes)

            // Skip checksum (4 bytes) and sequence number (4 bytes)
            inputStream.skip(8)

            // Skip session ID (32 bytes)
            inputStream.skip(32)

            // Read payload
            val payload = ByteArray(payloadLength)
            var totalRead = 0
            while (totalRead < payloadLength) {
                val read = inputStream.read(payload, totalRead, payloadLength - totalRead)
                if (read == -1) return null
                totalRead += read
            }

            return payload
        } catch (e: Exception) {
            println("Error reading frame: ${e.message}")
            return null
        }
    }

    /**
     * Parse frame payload as JSON
     */
    private fun parseFrame(payload: ByteArray): Map<String, String> {
        val json = String(payload, Charsets.UTF_8)
        return com.google.gson.Gson().fromJson(json, Map::class.java) as Map<String, String>
    }

    /**
     * Build response frame
     */
    private fun buildFrame(response: Map<String, Any>): ByteArray {
        val gson = com.google.gson.Gson()
        val json = gson.toJson(response)
        val payload = json.toByteArray(Charsets.UTF_8)

        val frame = ByteArray(48 + payload.size)
        var offset = 0

        // Magic bytes
        frame[offset++] = MAGIC_BYTE_1
        frame[offset++] = MAGIC_BYTE_2

        // Protocol version
        frame[offset++] = 0x00
        frame[offset++] = 0x01

        // Payload length
        intToBytes(payload.size).copyInto(frame, offset)
        offset += 4

        // Checksum (CRC32) - simplified for now
        intToBytes(0).copyInto(frame, offset)
        offset += 4

        // Sequence number
        intToBytes(System.currentTimeMillis().toInt()).copyInto(frame, offset)
        offset += 4

        // Session ID (32 bytes - zeros for now)
        offset += 32

        // Payload
        payload.copyInto(frame, offset)

        return frame
    }

    /**
     * Convert Int to bytes (big-endian)
     */
    private fun intToBytes(value: Int): ByteArray {
        return byteArrayOf(
            (value shr 24).toByte(),
            (value shr 16).toByte(),
            (value shr 8).toByte(),
            value.toByte()
        )
    }

    /**
     * Convert bytes to Int (big-endian)
     */
    private fun bytesToInt(bytes: ByteArray): Int {
        return ((bytes[0].toInt() and 0xFF) shl 24) or
                ((bytes[1].toInt() and 0xFF) shl 16) or
                ((bytes[2].toInt() and 0xFF) shl 8) or
                (bytes[3].toInt() and 0xFF)
    }

    /**
     * Stop Bluetooth server
     */
    fun stop() {
        isRunning = false
        try {
            serverSocket?.close()
        } catch (e: IOException) {
            println("Error closing Bluetooth server: ${e.message}")
        }
        scope.cancel()
    }
}
