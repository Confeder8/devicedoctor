package com.devicedoctor.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import org.conscrypt.Conscrypt
import java.security.Security

/**
 * DeviceDoctor Application Class
 */
class DeviceDoctorApplication : Application() {

    override fun onCreate() {
        super.onCreate()

        // Install Conscrypt for modern TLS support
        Security.insertProviderAt(Conscrypt.newProvider(), 1)

        // Create notification channels
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)

            // Foreground Service Channel
            val serviceChannel = NotificationChannel(
                CHANNEL_SERVICE,
                "DeviceDoctor Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background service for device connection"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(serviceChannel)

            // Messages Channel
            val messagesChannel = NotificationChannel(
                CHANNEL_MESSAGES,
                "SMS Messages",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Incoming SMS messages"
            }
            notificationManager.createNotificationChannel(messagesChannel)

            // Alerts Channel
            val alertsChannel = NotificationChannel(
                CHANNEL_ALERTS,
                "Alerts",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Important alerts and notifications"
            }
            notificationManager.createNotificationChannel(alertsChannel)
        }
    }

    companion object {
        const val CHANNEL_SERVICE = "device_doctor_service"
        const val CHANNEL_MESSAGES = "device_doctor_messages"
        const val CHANNEL_ALERTS = "device_doctor_alerts"
    }
}
