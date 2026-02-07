package com.devicedoctor.app.managers

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import java.io.File

/**
 * App Manager Wrapper - Handles app management operations
 */
class AppManagerWrapper(private val context: Context) {

    /**
     * Get installed apps
     */
    fun getInstalledApps(params: Map<String, Any>): Map<String, Any> {
        val apps = mutableListOf<Map<String, Any>>()
        val includeSystem = params["includeSystem"] as? Boolean ?: false

        try {
            val packageManager = context.packageManager
            val packages = packageManager.getInstalledApplications(PackageManager.GET_META_DATA)

            for (packageInfo in packages) {
                // Filter system apps if requested
                if (!includeSystem && (packageInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0) {
                    continue
                }

                val appName = packageManager.getApplicationLabel(packageInfo).toString()
                val packageName = packageInfo.packageName

                // Get package info
                val pkgInfo = try {
                    packageManager.getPackageInfo(packageName, 0)
                } catch (e: Exception) {
                    continue
                }

                // Get app icon as base64
                val icon = try {
                    val drawable = packageManager.getApplicationIcon(packageName)
                    val bitmap = android.graphics.drawable.BitmapDrawable::class.java.cast(drawable)?.bitmap
                    if (bitmap != null) {
                        val stream = java.io.ByteArrayOutputStream()
                        bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, stream)
                        Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
                    } else {
                        ""
                    }
                } catch (e: Exception) {
                    ""
                }

                apps.add(
                    mapOf(
                        "packageName" to packageName,
                        "appName" to appName,
                        "versionName" to (pkgInfo.versionName ?: "Unknown"),
                        "versionCode" to pkgInfo.longVersionCode,
                        "icon" to icon,
                        "size" to getAppSize(packageName),
                        "installTime" to pkgInfo.firstInstallTime,
                        "updateTime" to pkgInfo.lastUpdateTime,
                        "isSystemApp" to ((packageInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
                    )
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return mapOf(
            "status" to "success",
            "data" to mapOf(
                "apps" to apps,
                "total" to apps.size
            )
        )
    }

    /**
     * Get app details
     */
    fun getAppDetails(packageName: String): Map<String, Any> {
        return try {
            val packageManager = context.packageManager
            val packageInfo = packageManager.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS)
            val applicationInfo = packageManager.getApplicationInfo(packageName, 0)

            val appName = packageManager.getApplicationLabel(applicationInfo).toString()
            val permissions = packageInfo.requestedPermissions?.toList() ?: emptyList()

            mapOf(
                "status" to "success",
                "data" to mapOf(
                    "app" to mapOf(
                        "packageName" to packageName,
                        "appName" to appName,
                        "versionName" to (packageInfo.versionName ?: "Unknown"),
                        "versionCode" to packageInfo.longVersionCode,
                        "size" to getAppSize(packageName),
                        "dataSize" to 0, // Simplified
                        "cacheSize" to 0, // Simplified
                        "installTime" to packageInfo.firstInstallTime,
                        "updateTime" to packageInfo.lastUpdateTime,
                        "targetSdk" to applicationInfo.targetSdkVersion,
                        "minSdk" to applicationInfo.minSdkVersion,
                        "permissions" to permissions.map { permission ->
                            mapOf(
                                "name" to permission,
                                "granted" to true // Simplified
                            )
                        }
                    )
                )
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "AppNotFound",
                    "message" to "App not found: $packageName"
                )
            )
        }
    }

    /**
     * Install APK
     */
    fun installApk(body: Map<String, Any>): Map<String, Any> {
        return try {
            val apkPath = body["apkPath"] as String
            val apkFile = File(apkPath)

            if (!apkFile.exists()) {
                return mapOf(
                    "status" to "error",
                    "error" to mapOf(
                        "type" to "FileNotFound",
                        "message" to "APK file not found: $apkPath"
                    )
                )
            }

            // Use FileProvider to get content URI
            val apkUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            // Create install intent
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }

            context.startActivity(intent)

            mapOf(
                "status" to "success",
                "data" to mapOf(
                    "installId" to System.currentTimeMillis().toString(),
                    "status" to "installing"
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "InstallFailed",
                    "message" to (e.message ?: "Failed to install APK")
                )
            )
        }
    }

    /**
     * Uninstall app
     */
    fun uninstallApp(packageName: String): Map<String, Any> {
        return try {
            val intent = Intent(Intent.ACTION_DELETE).apply {
                data = Uri.parse("package:$packageName")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }

            context.startActivity(intent)

            mapOf(
                "status" to "success",
                "data" to mapOf("uninstalled" to true)
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "UninstallFailed",
                    "message" to (e.message ?: "Failed to uninstall app")
                )
            )
        }
    }

    /**
     * Get app size (simplified)
     */
    private fun getAppSize(packageName: String): Long {
        return try {
            val applicationInfo = context.packageManager.getApplicationInfo(packageName, 0)
            File(applicationInfo.sourceDir).length()
        } catch (e: Exception) {
            0L
        }
    }
}
