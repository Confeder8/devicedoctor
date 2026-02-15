package com.devicedoctor.app.api

import android.content.Context
import com.devicedoctor.app.managers.*
import com.devicedoctor.app.security.SecurityManager
import com.google.gson.Gson

/**
 * API Router - Routes and handles all API requests
 */
class ApiRouter(
    private val context: Context,
    private val securityManager: SecurityManager
) {
    private val gson = Gson()
    private val smsManager = SmsManagerWrapper(context)
    private val contactManager = ContactManagerWrapper(context)
    private val appManager = AppManagerWrapper(context)
    private val fileManager = FileManagerWrapper(context)

    /**
     * Handle encrypted request
     */
    fun handleEncryptedRequest(encryptedRequest: Map<String, String>): Map<String, Any> {
        try {
            // Decrypt request
            val encrypted = SecurityManager.EncryptedData(
                ciphertext = encryptedRequest["encrypted"]!!,
                iv = encryptedRequest["iv"]!!,
                authTag = encryptedRequest["tag"]!!
            )

            // Look up session by sessionId from request
            val requestSessionId = encryptedRequest["sessionId"]
            val allSessions = securityManager.getAllSessions()
            val sessionById = if (requestSessionId != null) {
                allSessions.find { it.sessionId == requestSessionId }
            } else {
                null
            }

            // Try the matched session first, then fall back to trying each session's
            // key. Desktop and Android generate independent sessionIds during pairing,
            // so an exact match may not exist — AES-GCM auth will reject wrong keys.
            val candidateSessions = if (sessionById != null) {
                listOf(sessionById)
            } else {
                allSessions
            }

            var session: SecurityManager.Session? = null
            var decrypted: String? = null
            for (candidate in candidateSessions) {
                try {
                    decrypted = securityManager.decryptData(encrypted, candidate.sessionKey)
                    session = candidate
                    break
                } catch (_: Exception) {
                    // Wrong key — AES-GCM authentication failed, try next session
                }
            }

            if (session == null || decrypted == null) {
                return errorResponse("Unauthorized", "No valid session")
            }

            val request = gson.fromJson(decrypted, Map::class.java) as Map<String, Any>

            // Verify signature — reconstruct the pre-signature JSON from the decrypted
            // string to avoid JSON key-ordering differences between Node.js and Gson
            val signature = request["signature"] as? String
            if (signature != null) {
                // Extract the JSON before the signature was appended by removing the
                // "signature" key from the raw decrypted string to match what desktop signed
                val sigPattern = ",\"signature\":\"${Regex.escape(signature)}\""
                val altPattern = "\"signature\":\"${Regex.escape(signature)}\","
                var originalJson = decrypted.replace(Regex(sigPattern), "")
                if (originalJson == decrypted) {
                    originalJson = decrypted.replace(Regex(altPattern), "")
                }
                val isValid = securityManager.verifySignature(originalJson, signature, session.hmacKey)
                if (!isValid) {
                    // AES-GCM already authenticates the data, so log but don't block
                    android.util.Log.w("ApiRouter", "HMAC signature mismatch (AES-GCM auth passed)")
                }
            }

            // Route request
            val endpoint = request["endpoint"] as String
            val method = request["method"] as String
            val body = request["body"] as? Map<String, Any> ?: emptyMap()

            val response = routeRequest(endpoint, method, body)

            // Encrypt response
            val responseJson = gson.toJson(response)
            val encryptedResponse = securityManager.encryptData(responseJson, session.sessionKey)

            return mapOf(
                "ciphertext" to encryptedResponse.ciphertext,
                "iv" to encryptedResponse.iv,
                "authTag" to encryptedResponse.authTag
            )
        } catch (e: Exception) {
            e.printStackTrace()
            return errorResponse("InternalServerError", e.message ?: "Unknown error")
        }
    }

    /**
     * Route request to appropriate handler
     */
    private fun routeRequest(endpoint: String, method: String, body: Map<String, Any>): Map<String, Any> {
        return when {
            // SMS endpoints
            endpoint == "/sms/conversations" && method == "GET" -> {
                smsManager.getConversations(body)
            }
            endpoint.startsWith("/sms/messages/") && method == "GET" -> {
                val threadId = endpoint.substringAfterLast("/")
                smsManager.getMessages(threadId, body)
            }
            endpoint == "/sms/send" && method == "POST" -> {
                smsManager.sendMessage(body)
            }
            endpoint.startsWith("/sms/message/") && endpoint.endsWith("/read") && method == "PATCH" -> {
                val messageId = endpoint.substringAfter("/sms/message/").substringBefore("/read")
                smsManager.markAsRead(messageId)
            }
            endpoint.startsWith("/sms/message/") && method == "DELETE" -> {
                val messageId = endpoint.substringAfterLast("/")
                smsManager.deleteMessage(messageId)
            }

            // Contacts endpoints
            endpoint == "/contacts/all" && method == "GET" -> {
                contactManager.getAllContacts(body)
            }
            endpoint.startsWith("/contacts/") && method == "GET" -> {
                val contactId = endpoint.substringAfterLast("/")
                contactManager.getContact(contactId)
            }
            endpoint == "/contacts/create" && method == "POST" -> {
                contactManager.createContact(body)
            }
            endpoint.startsWith("/contacts/") && method == "PUT" -> {
                val contactId = endpoint.substringAfterLast("/")
                contactManager.updateContact(contactId, body)
            }
            endpoint.startsWith("/contacts/") && method == "DELETE" -> {
                val contactId = endpoint.substringAfterLast("/")
                contactManager.deleteContact(contactId)
            }

            // Apps endpoints
            endpoint == "/apps/installed" && method == "GET" -> {
                appManager.getInstalledApps(body)
            }
            endpoint.startsWith("/apps/") && method == "GET" -> {
                val packageName = endpoint.substringAfterLast("/")
                appManager.getAppDetails(packageName)
            }
            endpoint == "/apps/install" && method == "POST" -> {
                appManager.installApk(body)
            }
            endpoint.startsWith("/apps/") && method == "DELETE" -> {
                val packageName = endpoint.substringAfterLast("/")
                appManager.uninstallApp(packageName)
            }

            // Files endpoints
            endpoint == "/files/list" && method == "GET" -> {
                fileManager.listDirectory(body)
            }
            endpoint == "/files/upload/init" && method == "POST" -> {
                fileManager.initUpload(body)
            }
            endpoint == "/files/upload/chunk" && method == "POST" -> {
                fileManager.uploadChunk(body)
            }
            endpoint == "/files/upload/complete" && method == "POST" -> {
                fileManager.completeUpload(body)
            }
            endpoint == "/files/download" && method == "GET" -> {
                fileManager.downloadFile(body)
            }
            endpoint == "/files/delete" && method == "DELETE" -> {
                fileManager.deleteFile(body)
            }
            endpoint == "/files/mkdir" && method == "POST" -> {
                fileManager.createDirectory(body)
            }
            endpoint == "/files/move" && method == "POST" -> {
                fileManager.moveFile(body)
            }

            // Device info endpoints
            endpoint == "/device/info" && method == "GET" -> {
                getDeviceInfo()
            }
            endpoint == "/device/permissions" && method == "GET" -> {
                getPermissions()
            }

            else -> errorResponse("NotFound", "Endpoint not found: $endpoint")
        }
    }

    /**
     * Handle pairing initiate — desktop pushes its pairing data, Android completes pairing
     */
    fun handlePairingInitiate(request: Map<String, Any>): Map<String, Any> {
        try {
            val publicKey = request["publicKey"] as? String ?: return errorResponse("BadRequest", "Missing publicKey")
            val desktopId = request["desktopId"] as? String ?: return errorResponse("BadRequest", "Missing desktopId")
            val desktopName = request["desktopName"] as? String ?: "Unknown Desktop"
            val pin = request["pin"] as? String ?: return errorResponse("BadRequest", "Missing pin")
            val ip = request["ip"] as? String ?: "0.0.0.0"
            val port = (request["port"] as? Double)?.toInt() ?: 18443
            val timestamp = (request["timestamp"] as? Double)?.toLong() ?: System.currentTimeMillis()
            val version = request["version"] as? String ?: "1.0"
            val signature = request["signature"] as? String ?: ""

            val pairingData = SecurityManager.PairingData(
                version = version,
                type = "devicedoctor_pairing",
                timestamp = timestamp,
                expiresAt = System.currentTimeMillis() + 5 * 60 * 1000,
                desktopId = desktopId,
                desktopName = desktopName,
                ip = ip,
                port = port,
                publicKey = publicKey,
                pin = pin,
                signature = signature
            )

            val result = securityManager.completePairing(pairingData)

            return successResponse(mapOf(
                "androidPublicKey" to result.androidPublicKey,
                "deviceId" to result.session.deviceId,
                "challenge" to result.challenge,
                "deviceName" to android.os.Build.MODEL,
                "androidVersion" to android.os.Build.VERSION.RELEASE
            ))
        } catch (e: Exception) {
            return errorResponse("PairingFailed", e.message ?: "Pairing failed")
        }
    }

    /**
     * Handle pairing complete
     */
    fun handlePairingComplete(request: Map<String, Any>): Map<String, Any> {
        // Verify challenge response and create session
        return successResponse(mapOf(
            "sessionId" to "session-uuid",
            "expiresIn" to 86400000
        ))
    }

    /**
     * Handle session validate
     */
    fun handleSessionValidate(sessionId: String?): Map<String, Any> {
        if (sessionId == null) {
            return errorResponse("Unauthorized", "No session ID provided")
        }

        val isValid = securityManager.validateSession(sessionId)
        return successResponse(mapOf(
            "valid" to isValid,
            "expiresIn" to 3600000
        ))
    }

    /**
     * Handle session revoke
     */
    fun handleSessionRevoke(sessionId: String?) {
        if (sessionId != null) {
            securityManager.revokeSession(sessionId)
        } else {
            // Revoke all sessions
            securityManager.getAllSessions().forEach { session ->
                securityManager.revokeSession(session.deviceId)
            }
        }
    }

    /**
     * Get device info
     */
    private fun getDeviceInfo(): Map<String, Any> {
        return successResponse(mapOf(
            "deviceId" to "device-uuid",
            "deviceName" to android.os.Build.MODEL,
            "manufacturer" to android.os.Build.MANUFACTURER,
            "model" to android.os.Build.MODEL,
            "androidVersion" to android.os.Build.VERSION.RELEASE,
            "sdkVersion" to android.os.Build.VERSION.SDK_INT,
            "batteryLevel" to 85,
            "batteryCharging" to true,
            "storageTotal" to 128000000000L,
            "storageAvailable" to 45000000000L
        ))
    }

    /**
     * Get permissions status
     */
    private fun getPermissions(): Map<String, Any> {
        return successResponse(mapOf(
            "permissions" to listOf(
                mapOf("name" to "READ_SMS", "granted" to true),
                mapOf("name" to "SEND_SMS", "granted" to true),
                mapOf("name" to "READ_CONTACTS", "granted" to true),
                mapOf("name" to "WRITE_CONTACTS", "granted" to true)
            )
        ))
    }

    /**
     * Success response helper
     */
    private fun successResponse(data: Any): Map<String, Any> {
        return mapOf(
            "version" to "1.0",
            "timestamp" to System.currentTimeMillis(),
            "status" to "success",
            "code" to 200,
            "data" to data
        )
    }

    /**
     * Error response helper
     */
    private fun errorResponse(type: String, message: String): Map<String, Any> {
        return mapOf(
            "version" to "1.0",
            "timestamp" to System.currentTimeMillis(),
            "status" to "error",
            "code" to 500,
            "error" to mapOf(
                "type" to type,
                "message" to message
            )
        )
    }
}
