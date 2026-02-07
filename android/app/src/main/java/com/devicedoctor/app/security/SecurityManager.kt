package com.devicedoctor.app.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.google.gson.Gson
import java.security.*
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import javax.crypto.*
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Security Manager - Handles encryption, key exchange, and session management
 */
class SecurityManager(private val context: Context) {

    private val keyStore: KeyStore = KeyStore.getInstance("AndroidKeyStore").apply {
        load(null)
    }
    private val gson = Gson()
    private val preferences = context.getSharedPreferences("security", Context.MODE_PRIVATE)

    data class PairingData(
        val version: String,
        val type: String,
        val timestamp: Long,
        val expiresAt: Long,
        val desktopId: String,
        val desktopName: String,
        val ip: String,
        val port: Int,
        val publicKey: String,
        val pin: String,
        val signature: String = ""
    )

    data class Session(
        val sessionId: String,
        val deviceId: String,
        val desktopId: String,
        val sessionKey: ByteArray,
        val hmacKey: ByteArray,
        val sharedSecret: ByteArray,
        val createdAt: Long,
        val expiresAt: Long,
        var lastActivity: Long,
        val permissions: Map<String, Boolean>,
        val desktopIp: String
    )

    /**
     * Process pairing QR code
     */
    fun processPairingQR(qrData: String): PairingData {
        val pairingData = gson.fromJson(qrData, PairingData::class.java)

        // Validate pairing data
        require(pairingData.version == "1.0") { "Unsupported version" }
        require(pairingData.type == "devicedoctor_pairing") { "Invalid pairing type" }
        require(System.currentTimeMillis() < pairingData.expiresAt) { "QR code expired" }

        // Verify signature
        val dataCopy = pairingData.copy(signature = "")
        val dataToVerify = gson.toJson(dataCopy)
        val isValid = verifyPairingSignature(dataToVerify, pairingData.signature, pairingData.pin)
        require(isValid) { "Invalid signature" }

        return pairingData
    }

    /**
     * Complete pairing and establish session
     */
    data class PairingResult(
        val session: Session,
        val challenge: String,
        val androidPublicKey: String
    )

    fun completePairing(pairingData: PairingData): PairingResult {
        // Generate Android ECDH key pair
        val keyPairGenerator = KeyPairGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_EC,
            "AndroidKeyStore"
        )

        val parameterSpec = KeyGenParameterSpec.Builder(
            "devicedoctor_pairing_${System.currentTimeMillis()}",
            KeyProperties.PURPOSE_AGREE_KEY
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .build()

        keyPairGenerator.initialize(parameterSpec)
        val keyPair = keyPairGenerator.generateKeyPair()

        // Perform key agreement (ECDH)
        val keyAgreement = KeyAgreement.getInstance("ECDH")
        keyAgreement.init(keyPair.private)

        val desktopPublicKey = decodePublicKey(pairingData.publicKey)
        keyAgreement.doPhase(desktopPublicKey, true)
        val sharedSecret = keyAgreement.generateSecret()

        // Derive session keys using HKDF
        val salt = (pairingData.pin + pairingData.timestamp).toByteArray()
        val info = "DeviceDoctor v1.0 Session Keys".toByteArray()
        val keys = hkdf(sharedSecret, salt, info, 96)

        val sessionKey = keys.copyOfRange(0, 32)
        val hmacKey = keys.copyOfRange(32, 64)

        // Generate challenge for desktop
        val challenge = generateChallenge()

        // Create session
        val session = Session(
            sessionId = generateUUID(),
            deviceId = getDeviceId(),
            desktopId = pairingData.desktopId,
            sessionKey = sessionKey,
            hmacKey = hmacKey,
            sharedSecret = sharedSecret,
            createdAt = System.currentTimeMillis(),
            expiresAt = System.currentTimeMillis() + 24 * 60 * 60 * 1000, // 24 hours
            lastActivity = System.currentTimeMillis(),
            permissions = mapOf(
                "sms" to true,
                "contacts" to true,
                "files" to true,
                "apps" to true
            ),
            desktopIp = pairingData.ip
        )

        // Store session
        storeSession(session)

        // Return Android public key and challenge
        val androidPublicKey = Base64.encodeToString(keyPair.public.encoded, Base64.NO_WRAP)

        return PairingResult(session, challenge, androidPublicKey)
    }

    /**
     * Encrypt data using AES-256-GCM
     */
    fun encryptData(plaintext: String, sessionKey: ByteArray): EncryptedData {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = SecretKeySpec(sessionKey, "AES")

        cipher.init(Cipher.ENCRYPT_MODE, secretKey)
        val iv = cipher.iv

        val encrypted = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

        // GCM mode produces ciphertext + auth tag
        // Split them (last 16 bytes are auth tag)
        val ciphertext = encrypted.copyOfRange(0, encrypted.size - 16)
        val authTag = encrypted.copyOfRange(encrypted.size - 16, encrypted.size)

        return EncryptedData(
            ciphertext = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            iv = Base64.encodeToString(iv, Base64.NO_WRAP),
            authTag = Base64.encodeToString(authTag, Base64.NO_WRAP)
        )
    }

    /**
     * Decrypt data using AES-256-GCM
     */
    fun decryptData(encrypted: EncryptedData, sessionKey: ByteArray): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = SecretKeySpec(sessionKey, "AES")

        val iv = Base64.decode(encrypted.iv, Base64.NO_WRAP)
        val gcmSpec = GCMParameterSpec(128, iv)

        cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)

        // Combine ciphertext and auth tag
        val ciphertext = Base64.decode(encrypted.ciphertext, Base64.NO_WRAP)
        val authTag = Base64.decode(encrypted.authTag, Base64.NO_WRAP)
        val combined = ciphertext + authTag

        val decrypted = cipher.doFinal(combined)

        return String(decrypted, Charsets.UTF_8)
    }

    /**
     * Sign message with HMAC-SHA256
     */
    fun signMessage(message: String, hmacKey: ByteArray): String {
        val mac = Mac.getInstance("HmacSHA256")
        val keySpec = SecretKeySpec(hmacKey, "HmacSHA256")
        mac.init(keySpec)
        val signature = mac.doFinal(message.toByteArray())
        return Base64.encodeToString(signature, Base64.NO_WRAP)
    }

    /**
     * Verify message signature
     */
    fun verifySignature(message: String, signature: String, hmacKey: ByteArray): Boolean {
        val expectedSignature = signMessage(message, hmacKey)
        return MessageDigest.isEqual(
            signature.toByteArray(),
            expectedSignature.toByteArray()
        )
    }

    /**
     * Get session by device ID
     */
    fun getSession(deviceId: String): Session? {
        val sessionJson = preferences.getString("session_$deviceId", null) ?: return null
        val session = gson.fromJson(sessionJson, Session::class.java)

        // Check if session is expired
        if (System.currentTimeMillis() > session.expiresAt) {
            revokeSession(deviceId)
            return null
        }

        // Update last activity
        session.lastActivity = System.currentTimeMillis()

        return session
    }

    /**
     * Validate session
     */
    fun validateSession(sessionId: String): Boolean {
        // Check all stored sessions
        val allPrefs = preferences.all
        for ((key, value) in allPrefs) {
            if (key.startsWith("session_") && value is String) {
                val session = gson.fromJson(value, Session::class.java)
                if (session.sessionId == sessionId && System.currentTimeMillis() < session.expiresAt) {
                    return true
                }
            }
        }
        return false
    }

    /**
     * Revoke session
     */
    fun revokeSession(deviceId: String) {
        preferences.edit().remove("session_$deviceId").apply()
    }

    /**
     * Store session
     */
    private fun storeSession(session: Session) {
        val sessionJson = gson.toJson(session)
        preferences.edit().putString("session_${session.deviceId}", sessionJson).apply()
    }

    /**
     * HKDF implementation
     */
    private fun hkdf(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        // Extract
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(salt, "HmacSHA256"))
        val prk = mac.doFinal(ikm)

        // Expand
        mac.init(SecretKeySpec(prk, "HmacSHA256"))
        val result = ByteArray(length)
        var offset = 0
        var counter = 1
        var t = ByteArray(0)

        while (offset < length) {
            mac.reset()
            mac.update(t)
            mac.update(info)
            mac.update(counter.toByte())
            t = mac.doFinal()

            val toCopy = minOf(t.size, length - offset)
            System.arraycopy(t, 0, result, offset, toCopy)
            offset += toCopy
            counter++
        }

        return result
    }

    /**
     * Decode public key from base64
     */
    private fun decodePublicKey(base64Key: String): PublicKey {
        val keyBytes = Base64.decode(base64Key, Base64.NO_WRAP)
        val keySpec = X509EncodedKeySpec(keyBytes)
        val keyFactory = KeyFactory.getInstance("EC")
        return keyFactory.generatePublic(keySpec)
    }

    /**
     * Generate challenge
     */
    private fun generateChallenge(): String {
        val random = SecureRandom()
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    /**
     * Generate UUID
     */
    private fun generateUUID(): String {
        return java.util.UUID.randomUUID().toString()
    }

    /**
     * Get device ID
     */
    internal fun getDeviceId(): String {
        var deviceId = preferences.getString("device_id", null)
        if (deviceId == null) {
            deviceId = generateUUID()
            preferences.edit().putString("device_id", deviceId).apply()
        }
        return deviceId
    }

    /**
     * Get all active (non-expired) sessions
     */
    fun getAllSessions(): List<Session> {
        val sessions = mutableListOf<Session>()
        val allPrefs = preferences.all
        for ((key, value) in allPrefs) {
            if (key.startsWith("session_") && value is String) {
                try {
                    val session = gson.fromJson(value, Session::class.java)
                    if (System.currentTimeMillis() < session.expiresAt) {
                        sessions.add(session)
                    }
                } catch (_: Exception) {
                    // Skip malformed entries
                }
            }
        }
        return sessions
    }

    /**
     * Verify pairing signature
     */
    private fun verifyPairingSignature(data: String, signature: String, pin: String): Boolean {
        val mac = Mac.getInstance("HmacSHA256")
        val keySpec = SecretKeySpec(pin.toByteArray(), "HmacSHA256")
        mac.init(keySpec)
        val expectedSignature = Base64.encodeToString(
            mac.doFinal(data.toByteArray()),
            Base64.NO_WRAP
        )
        return signature == expectedSignature
    }

    data class EncryptedData(
        val ciphertext: String,
        val iv: String,
        val authTag: String
    )
}
