package com.devicedoctor.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.devicedoctor.app.connection.ConnectionManager

/**
 * SMS Receiver - Handles incoming SMS for real-time notifications
 * Broadcasts new messages to connected desktop clients via WebSocket
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)

            for (smsMessage in messages) {
                val sender = smsMessage.originatingAddress ?: "Unknown"
                val body = smsMessage.messageBody ?: ""
                val timestamp = smsMessage.timestampMillis

                // Notify connected desktop clients via WebSocket
                if (ConnectionManager.desktopConnected) {
                    ConnectionManager.broadcastWebSocket(
                        type = "sms:newMessage",
                        payload = mapOf(
                            "address" to sender,
                            "body" to body,
                            "timestamp" to timestamp,
                            "type" to "inbox",
                            "read" to false
                        )
                    )
                }
            }
        }
    }
}
