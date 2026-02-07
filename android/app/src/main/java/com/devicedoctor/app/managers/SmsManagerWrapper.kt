package com.devicedoctor.app.managers

import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.Telephony
import android.telephony.SmsManager

/**
 * SMS Manager Wrapper - Handles SMS operations
 */
class SmsManagerWrapper(private val context: Context) {

    /**
     * Get all SMS conversations
     */
    fun getConversations(params: Map<String, Any>): Map<String, Any> {
        val conversations = mutableListOf<Map<String, Any>>()
        val limit = (params["limit"] as? Double)?.toInt() ?: 50
        val offset = (params["offset"] as? Double)?.toInt() ?: 0

        try {
            val uri = Uri.parse("content://mms-sms/conversations?simple=true")
            val projection = arrayOf(
                Telephony.Sms.Conversations.THREAD_ID,
                Telephony.Sms.Conversations.SNIPPET,
                "date",
                "msg_count",
                "address"
            )

            val cursor: Cursor? = context.contentResolver.query(
                uri,
                projection,
                null,
                null,
                "date DESC LIMIT $limit OFFSET $offset"
            )

            cursor?.use {
                while (it.moveToNext()) {
                    val threadId = it.getLong(it.getColumnIndexOrThrow(Telephony.Sms.Conversations.THREAD_ID))
                    val snippet = it.getString(it.getColumnIndexOrThrow(Telephony.Sms.Conversations.SNIPPET)) ?: ""
                    val date = it.getLong(it.getColumnIndexOrThrow("date"))
                    val msgCount = it.getInt(it.getColumnIndexOrThrow("msg_count"))
                    val address = it.getString(it.getColumnIndexOrThrow("address")) ?: "Unknown"

                    conversations.add(
                        mapOf(
                            "threadId" to threadId.toString(),
                            "contactName" to getContactName(address),
                            "phoneNumber" to address,
                            "lastMessage" to snippet,
                            "lastMessageTimestamp" to date,
                            "unreadCount" to 0, // Simplified
                            "messageCount" to msgCount
                        )
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return mapOf(
            "status" to "success",
            "data" to mapOf(
                "conversations" to conversations,
                "total" to conversations.size,
                "hasMore" to (conversations.size == limit)
            )
        )
    }

    /**
     * Get messages in a thread
     */
    fun getMessages(threadId: String, params: Map<String, Any>): Map<String, Any> {
        val messages = mutableListOf<Map<String, Any>>()
        val limit = (params["limit"] as? Double)?.toInt() ?: 50

        try {
            val uri = Uri.parse("content://sms/")
            val projection = arrayOf(
                Telephony.Sms._ID,
                Telephony.Sms.THREAD_ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                Telephony.Sms.TYPE,
                Telephony.Sms.READ
            )

            val selection = "${Telephony.Sms.THREAD_ID} = ?"
            val selectionArgs = arrayOf(threadId)

            val cursor: Cursor? = context.contentResolver.query(
                uri,
                projection,
                selection,
                selectionArgs,
                "${Telephony.Sms.DATE} DESC LIMIT $limit"
            )

            cursor?.use {
                while (it.moveToNext()) {
                    val id = it.getLong(it.getColumnIndexOrThrow(Telephony.Sms._ID))
                    val address = it.getString(it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS))
                    val body = it.getString(it.getColumnIndexOrThrow(Telephony.Sms.BODY))
                    val date = it.getLong(it.getColumnIndexOrThrow(Telephony.Sms.DATE))
                    val type = it.getInt(it.getColumnIndexOrThrow(Telephony.Sms.TYPE))
                    val read = it.getInt(it.getColumnIndexOrThrow(Telephony.Sms.READ))

                    val typeString = when (type) {
                        Telephony.Sms.MESSAGE_TYPE_INBOX -> "inbox"
                        Telephony.Sms.MESSAGE_TYPE_SENT -> "sent"
                        Telephony.Sms.MESSAGE_TYPE_DRAFT -> "draft"
                        else -> "unknown"
                    }

                    messages.add(
                        mapOf(
                            "id" to id.toString(),
                            "threadId" to threadId,
                            "address" to address,
                            "body" to body,
                            "timestamp" to date,
                            "type" to typeString,
                            "read" to (read == 1),
                            "isMms" to false
                        )
                    )
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return mapOf(
            "status" to "success",
            "data" to mapOf(
                "messages" to messages,
                "total" to messages.size,
                "hasMore" to false
            )
        )
    }

    /**
     * Send SMS
     */
    fun sendMessage(body: Map<String, Any>): Map<String, Any> {
        return try {
            val phoneNumber = body["phoneNumber"] as String
            val message = body["message"] as String

            val smsManager = context.getSystemService(SmsManager::class.java)
            smsManager.sendTextMessage(phoneNumber, null, message, null, null)

            mapOf(
                "status" to "success",
                "data" to mapOf(
                    "messageId" to System.currentTimeMillis().toString(),
                    "sentTimestamp" to System.currentTimeMillis(),
                    "deliveryStatus" to "sent"
                )
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "SmsSendFailed",
                    "message" to (e.message ?: "Failed to send SMS")
                )
            )
        }
    }

    /**
     * Delete message
     */
    fun deleteMessage(messageId: String): Map<String, Any> {
        return try {
            val uri = Uri.parse("content://sms/$messageId")
            val deleted = context.contentResolver.delete(uri, null, null)

            mapOf(
                "status" to "success",
                "data" to mapOf("deleted" to (deleted > 0))
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "SmsDeleteFailed",
                    "message" to (e.message ?: "Failed to delete SMS")
                )
            )
        }
    }

    /**
     * Mark message as read
     */
    fun markAsRead(messageId: String): Map<String, Any> {
        return try {
            val uri = Uri.parse("content://sms/$messageId")
            val values = android.content.ContentValues().apply {
                put(Telephony.Sms.READ, 1)
            }
            context.contentResolver.update(uri, values, null, null)

            mapOf(
                "status" to "success",
                "data" to mapOf("updated" to true)
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "SmsUpdateFailed",
                    "message" to (e.message ?: "Failed to mark as read")
                )
            )
        }
    }

    /**
     * Get contact name from phone number
     */
    private fun getContactName(phoneNumber: String): String {
        try {
            val uri = Uri.withAppendedPath(
                android.provider.ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(phoneNumber)
            )
            val projection = arrayOf(android.provider.ContactsContract.PhoneLookup.DISPLAY_NAME)
            val cursor = context.contentResolver.query(uri, projection, null, null, null)

            cursor?.use {
                if (it.moveToFirst()) {
                    return it.getString(0) ?: phoneNumber
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return phoneNumber
    }
}
