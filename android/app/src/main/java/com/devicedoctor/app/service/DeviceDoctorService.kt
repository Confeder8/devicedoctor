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
import kotlinx.coroutines.*

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

    companion object {
        const val NOTIFICATION_ID = 1001
        const val ACTION_START = "com.devicedoctor.app.action.START"
        const val ACTION_STOP = "com.devicedoctor.app.action.STOP"
    }
}
