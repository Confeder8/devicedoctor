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
            // The simple conversations view uses _id (not thread_id) and has no address column
            val uri = Uri.parse("content://mms-sms/conversations?simple=true")
            val projection = arrayOf(
                "_id",
                "snippet",
                "date",
                "message_count"
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
                    val threadId = it.getLong(it.getColumnIndexOrThrow("_id"))
                    val snippet = it.getString(it.getColumnIndexOrThrow("snippet")) ?: ""
                    val date = it.getLong(it.getColumnIndexOrThrow("date"))
                    val msgCount = it.getInt(it.getColumnIndexOrThrow("message_count"))

                    // Look up the address from the most recent SMS in this thread
                    val address = getThreadAddress(threadId)

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
     * Get the phone address for a conversation thread
     */
    private fun getThreadAddress(threadId: Long): String {
        try {
            val cursor = context.contentResolver.query(
                Uri.parse("content://sms/"),
                arrayOf(Telephony.Sms.ADDRESS),
                "${Telephony.Sms.THREAD_ID} = ?",
                arrayOf(threadId.toString()),
                "${Telephony.Sms.DATE} DESC LIMIT 1"
            )
            cursor?.use {
                if (it.moveToFirst()) {
                    return it.getString(0) ?: "Unknown"
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return "Unknown"
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

            // Write the sent message to the SMS content provider so it appears
            // in conversation queries (only the default SMS app does this automatically)
            val now = System.currentTimeMillis()
            val values = android.content.ContentValues().apply {
                put(Telephony.Sms.ADDRESS, phoneNumber)
                put(Telephony.Sms.BODY, message)
                put(Telephony.Sms.TYPE, Telephony.Sms.MESSAGE_TYPE_SENT)
                put(Telephony.Sms.DATE, now)
                put(Telephony.Sms.READ, 1)
            }
            val insertedUri = context.contentResolver.insert(
                Uri.parse("content://sms/sent"), values
            )
            val messageId = insertedUri?.lastPathSegment ?: now.toString()

            mapOf(
                "status" to "success",
                "data" to mapOf(
                    "messageId" to messageId,
                    "sentTimestamp" to now,
                    "deliveryStatus" to "sent",
                    "message" to mapOf(
                        "id" to messageId,
                        "address" to phoneNumber,
                        "body" to message,
                        "timestamp" to now,
                        "type" to "sent",
                        "read" to true
                    )
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
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
