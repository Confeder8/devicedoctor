/**
 * WiFi Client - Handles HTTP + WebSocket communication
 */

import axios, { AxiosInstance } from 'axios'
import { io, Socket } from 'socket.io-client'
import { EventEmitter } from 'events'
import { SecurityManager } from '../../security/SecurityManager'
import * as fs from 'fs-extra'
import * as path from 'path'
import * as crypto from 'crypto'

export class WiFiClient extends EventEmitter {
  private ipAddress: string
  private port: number
  private httpClient: AxiosInstance
  private wsClient: Socket | null = null
  private securityManager: SecurityManager
  private connected: boolean = false

  constructor(ipAddress: string, port: number, securityManager: SecurityManager) {
    super()
    this.ipAddress = ipAddress
    this.port = port
    this.securityManager = securityManager

    // Create HTTP client
    this.httpClient = axios.create({
      baseURL: `http://${ipAddress}:${port}/api/v1`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  /**
   * Connect to device
   */
  async connect(): Promise<void> {
    try {
      // Test connection — health endpoint is at root level on Android
      await axios.get(`http://${this.ipAddress}:${this.port}/health`, { timeout: 5000 })

      this.connected = true
    } catch (error) {
      throw new Error(`Failed to connect: ${(error as Error).message}`)
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
    if (this.wsClient) {
      this.wsClient.disconnect()
      this.wsClient = null
    }

    this.connected = false
    this.emit('disconnected')
  }

  /**
   * Send encrypted request
   */
  async sendRequest(encrypted: { ciphertext: string; iv: string; authTag: string }): Promise<any> {
    try {
      const response = await this.httpClient.post('/request', {
        encrypted: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.authTag
      })

      return response.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Request failed: ${error.response?.data?.message || error.message}`)
      }
      throw error
    }
  }

  /**
   * Upload file to device
   */
  async uploadFile(
    localPath: string,
    remotePath: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    // Read file
    const fileBuffer = await fs.readFile(localPath)
    const fileSize = fileBuffer.length
    const fileName = path.basename(localPath)

    // Calculate checksum
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('base64')

    // Compress file
    const zlib = require('zlib')
    const compressed = zlib.gzipSync(fileBuffer)

    // Split into chunks (1MB each)
    const chunkSize = 1024 * 1024
    const totalChunks = Math.ceil(compressed.length / chunkSize)

    // Initialize upload
    const initResponse = await this.httpClient.post('/files/upload/init', {
      fileName,
      fileSize,
      destinationPath: remotePath,
      chunkSize,
      totalChunks,
      checksum
    })

    const uploadId = initResponse.data.data.uploadId

    // Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, compressed.length)
      const chunk = compressed.slice(start, end)

      const chunkChecksum = crypto.createHash('sha256').update(chunk).digest('base64')

      await this.httpClient.post('/files/upload/chunk', {
        uploadId,
        chunkIndex: i,
        chunkData: chunk.toString('base64'),
        chunkChecksum
      })

      if (onProgress) {
        onProgress(((i + 1) / totalChunks) * 100)
      }
    }

    // Complete upload
    await this.httpClient.post('/files/upload/complete', { uploadId })
  }

  /**
   * Download file from device
   */
  async downloadFile(
    remotePath: string,
    localPath: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    // Get file info
    const infoResponse = await this.httpClient.get('/files/info', {
      params: { path: remotePath }
    })

    const fileSize = infoResponse.data.data.size
    const chunkSize = 1024 * 1024
    const totalChunks = Math.ceil(fileSize / chunkSize)

    // Download chunks
    const chunks: Buffer[] = []

    for (let i = 0; i < totalChunks; i++) {
      const response = await this.httpClient.get('/files/download', {
        params: {
          path: remotePath,
          chunkIndex: i,
          chunkSize
        },
        responseType: 'arraybuffer'
      })

      chunks.push(Buffer.from(response.data))

      if (onProgress) {
        onProgress(((i + 1) / totalChunks) * 100)
      }
    }

    // Combine chunks
    const compressed = Buffer.concat(chunks)

    // Decompress
    const zlib = require('zlib')
    const decompressed = zlib.gunzipSync(compressed)

    // Write to file
    await fs.writeFile(localPath, decompressed)
  }

  /**
   * Connect WebSocket for real-time updates
   */
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wsClient = io(`wss://${this.ipAddress}:${this.port + 1}`, {
        transports: ['websocket'],
        rejectUnauthorized: false
      })

      this.wsClient.on('connect', () => {
        // Authenticate WebSocket
        // This would use session ID from security manager
        resolve()
      })

      this.wsClient.on('connect_error', (error) => {
        reject(new Error(`WebSocket connection failed: ${error.message}`))
      })

      // Handle real-time events
      this.wsClient.on('sms_received', (data) => {
        this.emit('message', { type: 'sms_received', data })
      })

      this.wsClient.on('sms_sent', (data) => {
        this.emit('message', { type: 'sms_sent', data })
      })

      this.wsClient.on('contact_changed', (data) => {
        this.emit('message', { type: 'contact_changed', data })
      })

      this.wsClient.on('app_changed', (data) => {
        this.emit('message', { type: 'app_changed', data })
      })

      this.wsClient.on('file_changed', (data) => {
        this.emit('message', { type: 'file_changed', data })
      })

      this.wsClient.on('device_status', (data) => {
        this.emit('message', { type: 'device_status', data })
      })

      this.wsClient.on('error', (error) => {
        this.emit('error', error)
      })

      this.wsClient.on('disconnect', () => {
        this.emit('disconnected')
      })
    })
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected
  }
}
