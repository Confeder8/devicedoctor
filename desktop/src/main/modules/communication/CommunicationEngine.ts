/**
 * Communication Engine - Manages all communication protocols
 */

import * as crypto from 'crypto'
import { SecurityManager } from '../security/SecurityManager'
import { WiFiClient } from './clients/WiFiClient'
import { BluetoothClient } from './clients/BluetoothClient'
import { EventEmitter } from 'events'
import Store from 'electron-store'

export type ConnectionType = 'wifi' | 'bluetooth' | 'internet'
export type ConnectionRoute = 'tunnel' | 'direct' | 'adb'

export interface ConnectionInfo {
  route: ConnectionRoute
  host: string
  port: number
}

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
  private connectionInfoMap: Map<string, ConnectionInfo> = new Map()

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
   * Connect with fallback: tries ADB (if localhost), then tunnel, then direct.
   * First successful connection wins and is stored in connectionInfoMap.
   */
  async connectWithFallback(deviceId: string, ipAddress: string, store?: Store): Promise<ConnectionInfo> {
    const isLocalhost = ipAddress === '127.0.0.1' || ipAddress === '::1'
    const pairingPort = store ? (store.get('settings.pairingPort', 18443) as number) : 18443
    const tunnelHost = store ? (store.get('settings.tunnelHost', '') as string) : ''
    const tunnelPort = store ? (store.get('settings.tunnelPort', 0) as number) : 0

    interface Attempt { route: ConnectionRoute; host: string; port: number }
    const attempts: Attempt[] = []

    // 1. ADB: only if IP is localhost
    if (isLocalhost) {
      attempts.push({ route: 'adb', host: '127.0.0.1', port: pairingPort })
    }

    // 2. Tunnel: if configured
    if (tunnelHost && tunnelPort) {
      attempts.push({ route: 'tunnel', host: tunnelHost, port: tunnelPort })
    }

    // 3. Direct WiFi
    if (!isLocalhost) {
      attempts.push({ route: 'direct', host: ipAddress, port: 8443 })
    }

    for (const attempt of attempts) {
      try {
        console.log(`Trying ${attempt.route} connection to ${attempt.host}:${attempt.port}...`)
        await this.connect({
          deviceId,
          connectionType: 'wifi',
          ipAddress: attempt.host,
          port: attempt.port
        })
        const info: ConnectionInfo = { route: attempt.route, host: attempt.host, port: attempt.port }
        this.connectionInfoMap.set(deviceId, info)
        console.log(`Connected via ${attempt.route} to ${attempt.host}:${attempt.port}`)
        return info
      } catch (err: any) {
        console.log(`${attempt.route} connection failed: ${err.message}`)
      }
    }

    throw new Error(`All connection attempts failed for ${ipAddress}`)
  }

  /**
   * Get connection info for a device
   */
  getConnectionInfo(deviceId: string): ConnectionInfo | null {
    return this.connectionInfoMap.get(deviceId) || null
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

    this.connectionInfoMap.delete(deviceId)
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
      response = await client.sendRequest(encrypted, session.sessionId)
    } else if (session.connectionType === 'bluetooth') {
      const client = this.bluetoothClients.get(deviceId)
      if (!client) {
        throw new Error('Bluetooth client not connected')
      }
      response = await client.sendRequest(encrypted)
    } else {
      throw new Error('Unsupported connection type')
    }

    // Handle unencrypted error responses from Android
    if (response.status === 'error') {
      throw new Error(response.error?.message || 'Request failed on device')
    }

    // Decrypt response
    if (!response.ciphertext || !response.iv || !response.authTag) {
      throw new Error('Invalid encrypted response from device')
    }

    const decrypted = this.securityManager.decryptData(
      response.ciphertext,
      response.iv,
      response.authTag,
      session.sessionKey
    )

    const responseData = JSON.parse(decrypted)

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
