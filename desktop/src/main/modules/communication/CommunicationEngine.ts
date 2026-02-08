/**
 * Communication Engine - Manages all communication protocols
 */

import * as crypto from 'crypto'
import { SecurityManager } from '../security/SecurityManager'
import { WiFiClient } from './clients/WiFiClient'
import { BluetoothClient } from './clients/BluetoothClient'
import { EventEmitter } from 'events'

export type ConnectionType = 'wifi' | 'bluetooth' | 'internet'

export interface CommunicationOptions {
  deviceId: string
  connectionType: ConnectionType
  ipAddress?: string
  port?: number
  bluetoothAddress?: string
}

export class CommunicationEngine extends EventEmitter {
  private securityManager: SecurityManager
  private wifiClients: Map<string, WiFiClient> = new Map()
  private bluetoothClients: Map<string, BluetoothClient> = new Map()

  constructor(securityManager: SecurityManager) {
    super()
    this.securityManager = securityManager
  }

  /**
   * Connect to a device
   */
  async connect(options: CommunicationOptions): Promise<void> {
    const { deviceId, connectionType, ipAddress, port, bluetoothAddress } = options

    switch (connectionType) {
      case 'wifi':
        await this.connectWiFi(deviceId, ipAddress!, port || 8443)
        break
      case 'bluetooth':
        await this.connectBluetooth(deviceId, bluetoothAddress!)
        break
      case 'internet':
        throw new Error('Internet connection not yet implemented')
      default:
        throw new Error(`Unknown connection type: ${connectionType}`)
    }
  }

  /**
   * Disconnect from a device
   */
  async disconnect(deviceId: string): Promise<void> {
    const wifiClient = this.wifiClients.get(deviceId)
    if (wifiClient) {
      await wifiClient.disconnect()
      this.wifiClients.delete(deviceId)
    }

    const bluetoothClient = this.bluetoothClients.get(deviceId)
    if (bluetoothClient) {
      await bluetoothClient.disconnect()
      this.bluetoothClients.delete(deviceId)
    }

    this.emit('disconnected', deviceId)
  }

  /**
   * Send request to device
   */
  async sendRequest(deviceId: string, endpoint: string, method: string, body?: any): Promise<any> {
    const session = this.securityManager.getSession(deviceId)
    if (!session) {
      throw new Error('No active session for device')
    }

    // Build request
    const request: Record<string, any> = {
      version: '1.0',
      sessionId: session.sessionId,
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      endpoint,
      method,
      body: body || {}
    }

    // Sign request
    const requestJson = JSON.stringify(request)
    request.signature = this.securityManager.signMessage(requestJson, session.hmacKey)

    // Encrypt request
    const encrypted = this.securityManager.encryptData(
      JSON.stringify(request),
      session.sessionKey
    )

    // Send via appropriate client
    let response
    if (session.connectionType === 'wifi') {
      const client = this.wifiClients.get(deviceId)
      if (!client) {
        throw new Error('WiFi client not connected')
      }
      response = await client.sendRequest(encrypted)
    } else if (session.connectionType === 'bluetooth') {
      const client = this.bluetoothClients.get(deviceId)
      if (!client) {
        throw new Error('Bluetooth client not connected')
      }
      response = await client.sendRequest(encrypted)
    } else {
      throw new Error('Unsupported connection type')
    }

    // Decrypt response
    const decrypted = this.securityManager.decryptData(
      response.ciphertext,
      response.iv,
      response.authTag,
      session.sessionKey
    )

    const responseData = JSON.parse(decrypted)

    // Verify signature
    const { signature, ...responseWithoutSig } = responseData
    const isValid = this.securityManager.verifySignature(
      JSON.stringify(responseWithoutSig),
      signature,
      session.hmacKey
    )

    if (!isValid) {
      throw new Error('Response signature verification failed')
    }

    // Check for errors
    if (responseData.status === 'error') {
      throw new Error(responseData.error?.message || 'Unknown error')
    }

    return responseData.data
  }

  /**
   * Upload file to device
   */
  async uploadFile(
    deviceId: string,
    localPath: string,
    remotePath: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const client = this.wifiClients.get(deviceId)
    if (!client) {
      throw new Error('WiFi client not connected')
    }

    await client.uploadFile(localPath, remotePath, onProgress)
  }

  /**
   * Download file from device
   */
  async downloadFile(
    deviceId: string,
    remotePath: string,
    localPath: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const client = this.wifiClients.get(deviceId)
    if (!client) {
      throw new Error('WiFi client not connected')
    }

    await client.downloadFile(remotePath, localPath, onProgress)
  }

  /**
   * Get connection status
   */
  isConnected(deviceId: string): boolean {
    return this.wifiClients.has(deviceId) || this.bluetoothClients.has(deviceId)
  }

  /**
   * Get connection type
   */
  getConnectionType(deviceId: string): ConnectionType | null {
    if (this.wifiClients.has(deviceId)) return 'wifi'
    if (this.bluetoothClients.has(deviceId)) return 'bluetooth'
    return null
  }

  /**
   * Connect via WiFi
   */
  private async connectWiFi(deviceId: string, ipAddress: string, port: number): Promise<void> {
    const client = new WiFiClient(ipAddress, port, this.securityManager)

    await client.connect()

    // Setup event handlers
    client.on('message', (message) => {
      this.emit('message', { deviceId, message })
    })

    client.on('error', (error) => {
      this.emit('error', { deviceId, error })
    })

    client.on('disconnected', () => {
      this.wifiClients.delete(deviceId)
      this.emit('disconnected', deviceId)
    })

    this.wifiClients.set(deviceId, client)
    this.emit('connected', { deviceId, connectionType: 'wifi' })
  }

  /**
   * Connect via Bluetooth
   */
  private async connectBluetooth(deviceId: string, bluetoothAddress: string): Promise<void> {
    const client = new BluetoothClient(bluetoothAddress, this.securityManager)

    await client.connect()

    // Setup event handlers
    client.on('data', (data) => {
      this.emit('data', { deviceId, data })
    })

    client.on('error', (error) => {
      this.emit('error', { deviceId, error })
    })

    client.on('disconnected', () => {
      this.bluetoothClients.delete(deviceId)
      this.emit('disconnected', deviceId)
    })

    this.bluetoothClients.set(deviceId, client)
    this.emit('connected', { deviceId, connectionType: 'bluetooth' })
  }
}
