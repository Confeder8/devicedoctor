package com.devicedoctor.app.managers

import android.content.Context
import android.os.Environment
import android.util.Base64
import java.io.File
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

/**
 * File Manager Wrapper - Handles file operations
 */
class FileManagerWrapper(private val context: Context) {

    private val uploadSessions = mutableMapOf<String, UploadSession>()

    data class UploadSession(
        val fileName: String,
        val fileSize: Long,
        val totalChunks: Int,
        val checksum: String,
        val tempFile: File,
        var receivedChunks: Int = 0
    )

    /**
     * List directory contents
     */
    fun listDirectory(params: Map<String, Any>): Map<String, Any> {
        return try {
            val path = params["path"] as? String ?: Environment.getExternalStorageDirectory().absolutePath
            val sortBy = params["sortBy"] as? String ?: "name"
            val sortOrder = params["sortOrder"] as? String ?: "asc"

            val directory = File(path)
            if (!directory.exists() || !directory.isDirectory) {
                return mapOf(
                    "status" to "error",
                    "error" to mapOf(
                        "type" to "DirectoryNotFound",
                        "message" to "Directory not found: $path"
                    )
                )
            }

            val entries = directory.listFiles()?.map { file ->
                mapOf(
                    "name" to file.name,
                    "path" to file.absolutePath,
                    "type" to if (file.isDirectory) "directory" else "file",
                    "size" to if (file.isFile) file.length() else 0,
                    "mimeType" to getMimeType(file),
                    "modified" to file.lastModified(),
                    "permissions" to getPermissions(file)
                )
            }?.sortedWith(compareBy<Map<String, Any>> {
                when (sortBy) {
                    "size" -> it["size"] as Long
                    "modified" -> it["modified"] as Long
                    else -> it["name"] as String
                }
            }.let { comparator ->
                if (sortOrder == "desc") comparator.reversed() else comparator
            }) ?: emptyList()

            mapOf(
                "status" to "success",
                "data" to mapOf(
                    "path" to path,
                    "entries" to entries,
                    "totalSize" to entries.sumOf { (it["size"] as? Long) ?: 0L },
                    "itemCount" to entries.size
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "ListDirectoryFailed",
                    "message" to (e.message ?: "Failed to list directory")
                )
            )
        }
    }

    /**
     * Initialize file upload
     */
    fun initUpload(body: Map<String, Any>): Map<String, Any> {
        return try {
            val fileName = body["fileName"] as String
            val fileSize = (body["fileSize"] as Double).toLong()
            val totalChunks = (body["totalChunks"] as Double).toInt()
            val checksum = body["checksum"] as String

            val uploadId = generateUploadId()
            val tempFile = File(context.cacheDir, "upload_$uploadId.tmp")

            uploadSessions[uploadId] = UploadSession(
                fileName = fileName,
                fileSize = fileSize,
                totalChunks = totalChunks,
                checksum = checksum,
                tempFile = tempFile
            )

            mapOf(
                "status" to "success",
                "data" to mapOf(
                    "uploadId" to uploadId,
                    "chunkSize" to 1048576,
                    "resumable" to true
                )
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "UploadInitFailed",
                    "message" to (e.message ?: "Failed to initialize upload")
                )
            )
        }
    }

    /**
     * Upload file chunk
     */
    fun uploadChunk(body: Map<String, Any>): Map<String, Any> {
        return try {
            val uploadId = body["uploadId"] as String
            val chunkIndex = (body["chunkIndex"] as Double).toInt()
            val chunkData = body["chunkData"] as String

            val session = uploadSessions[uploadId]
                ?: return mapOf(
                    "status" to "error",
                    "error" to mapOf(
                        "type" to "InvalidUploadId",
                        "message" to "Upload session not found"
                    )
                )

            // Decode and write chunk
            val chunkBytes = Base64.decode(chunkData, Base64.NO_WRAP)
            session.tempFile.appendBytes(chunkBytes)
            session.receivedChunks++

            mapOf(
                "status" to "success",
                "data" to mapOf(
                    "received" to true,
                    "progress" to session.receivedChunks
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "UploadChunkFailed",
                    "message" to (e.message ?: "Failed to upload chunk")
                )
            )
        }
    }

    /**
     * Complete file upload
     */
    fun completeUpload(body: Map<String, Any>): Map<String, Any> {
        return try {
            val uploadId = body["uploadId"] as String

            val session = uploadSessions[uploadId]
                ?: return mapOf(
                    "status" to "error",
                    "error" to mapOf(
                        "type" to "InvalidUploadId",
                        "message" to "Upload session not found"
                    )
                )

            // Decompress file
            val destinationPath = body["destinationPath"] as? String
                ?: "${Environment.getExternalStorageDirectory()}/Download/${session.fileName}"

            val destination = File(destinationPath)
            destination.parentFile?.mkdirs()

            // Decompress from temp file
            GZIPInputStream(session.tempFile.inputStream()).use { input ->
                destination.outputStream().use { output ->
                    input.copyTo(output)
                }
            }

            // Clean up
            session.tempFile.delete()
            uploadSessions.remove(uploadId)

            mapOf(
                "status" to "success",
                "data" to mapOf(
                    "completed" to true,
                    "filePath" to destination.absolutePath,
                    "fileSize" to destination.length()
                )
            )
        } catch (e: Exception) {
            e.printStackTrace()
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "UploadCompleteFailed",
                    "message" to (e.message ?: "Failed to complete upload")
                )
            )
        }
    }

    /**
     * Download file
     */
    fun downloadFile(params: Map<String, Any>): Map<String, Any> {
        return try {
            val path = params["path"] as String
            val chunkIndex = (params["chunkIndex"] as? Double)?.toInt() ?: 0
            val chunkSize = (params["chunkSize"] as? Double)?.toInt() ?: 1048576

            val file = File(path)
            if (!file.exists() || !file.isFile) {
                return mapOf(
                    "status" to "error",
                    "error" to mapOf(
                        "type" to "FileNotFound",
                        "message" to "File not found: $path"
                    )
                )
            }

            // Compress and read chunk
            val compressed = file.inputStream().use { input ->
                val output = java.io.ByteArrayOutputStream()
                GZIPOutputStream(output).use { gzip ->
                    input.copyTo(gzip)
                }
                output.toByteArray()
            }

            val start = chunkIndex * chunkSize
            val end = minOf(start + chunkSize, compressed.size)
            val chunk = compressed.copyOfRange(start, end)

            mapOf(
                "status" to "success",
                "data" to Base64.encodeToString(chunk, Base64.NO_WRAP),
                "fileSize" to file.length(),
                "totalChunks" to ((compressed.size + chunkSize - 1) / chunkSize),
                "chunkIndex" to chunkIndex
            )
        } catch (e: Exception) {
            e.printStackTrace()
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "DownloadFailed",
                    "message" to (e.message ?: "Failed to download file")
                )
            )
        }
    }

    /**
     * Delete file or directory
     */
    fun deleteFile(body: Map<String, Any>): Map<String, Any> {
        return try {
            val path = body["path"] as String
            val recursive = body["recursive"] as? Boolean ?: false

            val file = File(path)
            if (!file.exists()) {
                return mapOf(
                    "status" to "error",
                    "error" to mapOf(
                        "type" to "FileNotFound",
                        "message" to "File not found: $path"
                    )
                )
            }

            val deleted = if (recursive && file.isDirectory) {
                file.deleteRecursively()
            } else {
                file.delete()
            }

            mapOf(
                "status" to "success",
                "data" to mapOf("deleted" to deleted)
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "DeleteFailed",
                    "message" to (e.message ?: "Failed to delete file")
                )
            )
        }
    }

    /**
     * Create directory
     */
    fun createDirectory(body: Map<String, Any>): Map<String, Any> {
        return try {
            val path = body["path"] as String
            val directory = File(path)

            val created = directory.mkdirs()

            mapOf(
                "status" to "success",
                "data" to mapOf(
                    "created" to created,
                    "path" to directory.absolutePath
                )
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "CreateDirectoryFailed",
                    "message" to (e.message ?: "Failed to create directory")
                )
            )
        }
    }

    /**
     * Move/rename file
     */
    fun moveFile(body: Map<String, Any>): Map<String, Any> {
        return try {
            val sourcePath = body["sourcePath"] as String
            val destPath = body["destinationPath"] as String

            val source = File(sourcePath)
            val dest = File(destPath)

            if (!source.exists()) {
                return mapOf(
                    "status" to "error",
                    "error" to mapOf(
                        "type" to "FileNotFound",
                        "message" to "Source file not found: $sourcePath"
                    )
                )
            }

            val moved = source.renameTo(dest)

            mapOf(
                "status" to "success",
                "data" to mapOf("moved" to moved)
            )
        } catch (e: Exception) {
            mapOf(
                "status" to "error",
                "error" to mapOf(
                    "type" to "MoveFailed",
                    "message" to (e.message ?: "Failed to move file")
                )
            )
        }
    }

    /**
     * Get MIME type
     */
    private fun getMimeType(file: File): String {
        return when (file.extension.lowercase()) {
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "gif" -> "image/gif"
            "pdf" -> "application/pdf"
            "txt" -> "text/plain"
            "mp4" -> "video/mp4"
            "mp3" -> "audio/mpeg"
            else -> "application/octet-stream"
        }
    }

    /**
     * Get file permissions string
     */
    private fun getPermissions(file: File): String {
        return buildString {
            append(if (file.canRead()) "r" else "-")
            append(if (file.canWrite()) "w" else "-")
            append(if (file.canExecute()) "x" else "-")
        }
    }

    /**
     * Generate upload ID
     */
    private fun generateUploadId(): String {
        return java.util.UUID.randomUUID().toString()
    }
}
