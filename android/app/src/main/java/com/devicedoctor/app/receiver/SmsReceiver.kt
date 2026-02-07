package com.devicedoctor.app.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * SMS Receiver - Handles incoming SMS for real-time notifications
 */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)

            for (smsMessage in messages) {
                val sender = smsMessage.originatingAddress ?: "Unknown"
                val body = smsMessage.messageBody ?: ""

                // TODO: Notify connected desktop clients via WebSocket
                println("SMS received from $sender: $body")
            }
        }
    }
}
