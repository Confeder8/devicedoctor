/**
 * Security Manager - Handles encryption, key exchange, and session management
 */

import * as crypto from 'crypto'
import * as http from 'http'
import * as dgram from 'dgram'
import { EventEmitter } from 'events'
import Store from 'electron-store'
import QRCode from 'qrcode'

export interface KeyPair {
  publicKey: Buffer
  privateKey: Buffer
}

export interface Session {
  sessionId: string
  deviceId: string
  desktopId: string
  sessionKey: Buffer
  hmacKey: Buffer
  sharedSecret: Buffer
  createdAt: number
  expiresAt: number
  lastActivity: number
  permissions: {
    sms: boolean
    contacts: boolean
    files: boolean
    apps: boolean
  }
  ipAddress: string
  connectionType: 'wifi' | 'bluetooth' | 'internet'
}

export interface PairingData {
  version: string
  type: string
  timestamp: number
  expiresAt: number
  desktopId: string
  desktopName: string
  ip: string
  port: number
  publicKey: string
  pin: string
  signature?: string
}

export class SecurityManager extends EventEmitter {
  private store: Store
  private activeSessions: Map<string, Session> = new Map()
  private pairingKeyPair: KeyPair | null = null
  private currentPairingData: PairingData | null = null
  private pairingServer: http.Server | null = null
  private broadcastSocket: dgram.Socket | null = null
  private broadcastInterval: NodeJS.Timeout | null = null

  constructor(store: Store) {
    super()
    this.store = store
    this.loadSessions()
  }

  /**
   * Convert raw EC public key to SPKI/X509 DER format for Android compatibility
   * prime256v1 uncompressed public key is 65 bytes (0x04 + 32 + 32)
   * SPKI wraps it with ASN.1 header
   */
  private rawEcPublicKeyToSpki(rawKey: Buffer): Buffer {
    // ASN.1 SPKI header for prime256v1/secp256r1 uncompressed point
    const spkiHeader = Buffer.from([
      0x30, 0x59, // SEQUENCE (89 bytes)
      0x30, 0x13, // SEQUENCE (19 bytes) - AlgorithmIdentifier
      0x06, 0x07, // OID (7 bytes) - ecPublicKey
      0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
      0x06, 0x08, // OID (8 bytes) - prime256v1
      0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
      0x03, 0x42, // BIT STRING (66 bytes)
      0x00        // no unused bits
    ])
    return Buffer.concat([spkiHeader, rawKey])
  }

  /**
   * Extract raw EC public key from SPKI/X509 DER format (from Android)
   */
  private spkiToRawEcPublicKey(spkiKey: Buffer): Buffer {
    // The raw key starts at offset 26 (after the SPKI header)
    return spkiKey.subarray(26)
  }

  /**
   * Get configured pairing port (default 18443)
   */
  getPairingPort(): number {
    return (this.store.get('settings.pairingPort', 18443) as number)
  }

  /**
   * Get configured discovery port (default 18445)
   */
  getDiscoveryPort(): number {
    return (this.store.get('settings.discoveryPort', 18445) as number)
  }

  /**
   * Initiate pairing process
   */
  async initiatePairing(desktopName: string): Promise<{ qrCode: string; pin: string }> {
    const pairingPort = this.getPairingPort()

    // Generate ECDH key pair
    const ecdh = crypto.createECDH('prime256v1')
    ecdh.generateKeys()

    this.pairingKeyPair = {
      publicKey: ecdh.getPublicKey(),
      privateKey: ecdh.getPrivateKey()
    }

    // Generate 6-digit PIN
    const pin = crypto.randomInt(100000, 999999).toString()

    // Get local IP
    const localIP = await this.getLocalIP()

    // Create pairing data
    this.currentPairingData = {
      version: '1.0',
      type: 'devicedoctor_pairing',
      timestamp: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      desktopId: this.getDesktopId(),
      desktopName,
      ip: localIP,
      port: pairingPort,
      publicKey: this.rawEcPublicKeyToSpki(this.pairingKeyPair.publicKey).toString('base64'),
      pin
    }

    // Sign pairing data — sort keys alphabetically to match Gson's serialization on Android
    const objToSign = { ...this.currentPairingData, signature: '' }
    const dataToSign = JSON.stringify(objToSign, Object.keys(objToSign).sort())
    const hmac = crypto.createHmac('sha256', pin)
    this.currentPairingData.signature = hmac.update(dataToSign).digest('base64')

    // Generate QR code (still available as fallback)
    const qrCodeDataURL = await QRCode.toDataURL(
      JSON.stringify(this.currentPairingData),
      { errorCorrectionLevel: 'M', width: 400 }
    )

    // Start the pairing HTTP server
    await this.startPairingServer()

    // Start broadcasting pairing availability on the network
    this.startPairingBroadcast(desktopName, localIP, pairingPort)

    return { qrCode: qrCodeDataURL, pin }
  }

  /**
   * Start temporary HTTP server to receive Android's pairing POST
   */
  private startPairingServer(): Promise<void> {
    const port = this.getPairingPort()

    return new Promise((resolve, reject) => {
      if (this.pairingServer) {
        this.pairingServer.close()
        this.pairingServer = null
      }

      this.pairingServer = http.createServer((req, res) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          res.end()
          return
        }

        // Auto-discovery: Android fetches pairing data via HTTP
        if (req.method === 'GET' && req.url === '/api/v1/pairing/info') {
          if (!this.currentPairingData) {
            res.writeHead(404)
            res.end(JSON.stringify({ status: 'no_active_pairing' }))
            return
          }
          res.writeHead(200)
          res.end(JSON.stringify(this.currentPairingData))
          return
        }

        if (req.method === 'POST' && req.url === '/api/v1/pairing/complete') {
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', async () => {
            try {
              const { androidPublicKey, deviceId, challenge } = JSON.parse(body)
              const result = await this.completePairing(androidPublicKey, deviceId, challenge)

              res.writeHead(200)
              res.end(JSON.stringify({
                status: 'success',
                sessionId: result.session.sessionId,
                challengeResponse: result.challengeResponse
              }))

              // Emit event for IPC forwarding
              this.emit('pairing:complete', {
                sessionId: result.session.sessionId,
                deviceId: result.session.deviceId,
                desktopId: result.session.desktopId
              })

              // Close server after successful pairing
              this.stopPairingServer()
            } catch (err: any) {
              res.writeHead(400)
              res.end(JSON.stringify({
                status: 'error',
                message: err.message || 'Pairing failed'
              }))
            }
          })
        } else if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200)
          res.end(JSON.stringify({ status: 'ok' }))
        } else {
          res.writeHead(404)
          res.end(JSON.stringify({ status: 'not_found' }))
        }
      })

      this.pairingServer.on('error', (err) => {
        console.error('Pairing server error:', err)
        reject(err)
      })

      this.pairingServer.listen(port, '0.0.0.0', () => {
        console.log(`Pairing server started on port ${port}`)
        resolve()
      })
    })
  }

  /**
   * Start broadcasting pairing availability via UDP
   */
  private startPairingBroadcast(desktopName: string, ip: string, pairingPort: number): void {
    this.stopPairingBroadcast()

    const discoveryPort = this.getDiscoveryPort()

    try {
      this.broadcastSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

      this.broadcastSocket.on('error', (err) => {
        console.error('Pairing broadcast error:', err)
      })

      this.broadcastSocket.bind(0, () => {
        this.broadcastSocket!.setBroadcast(true)

        const message = JSON.stringify({
          type: 'devicedoctor_pairing_available',
          desktopName,
          desktopId: this.getDesktopId(),
          ip,
          port: pairingPort,
          timestamp: Date.now()
        })

        // Broadcast immediately, then every 2 seconds
        const sendBroadcast = () => {
          this.broadcastSocket?.send(
            message, 0, message.length, discoveryPort, '255.255.255.255',
            (err) => { if (err) console.error('Broadcast send error:', err) }
          )
        }

        sendBroadcast()
        this.broadcastInterval = setInterval(sendBroadcast, 2000)
        console.log(`Pairing broadcast started on port ${discoveryPort}`)
      })
    } catch (err) {
      console.error('Failed to start pairing broadcast:', err)
    }
  }

  /**
   * Stop pairing broadcast
   */
  private stopPairingBroadcast(): void {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval)
      this.broadcastInterval = null
    }
    if (this.broadcastSocket) {
      try { this.broadcastSocket.close() } catch (_) {}
      this.broadcastSocket = null
    }
  }

  /**
   * Stop the pairing server
   */
  private stopPairingServer(): void {
    this.stopPairingBroadcast()
    if (this.pairingServer) {
      this.pairingServer.close()
      this.pairingServer = null
      console.log('Pairing server stopped')
    }
  }

  /**
   * Complete pairing after Android scans QR
   */
  async completePairing(
    androidPublicKey: string,
    deviceId: string,
    challenge: string
  ): Promise<{ session: Session; challengeResponse: string }> {
    if (!this.pairingKeyPair || !this.currentPairingData) {
      throw new Error('No active pairing session')
    }

    // Derive shared secret using ECDH
    const ecdh = crypto.createECDH('prime256v1')
    ecdh.setPrivateKey(this.pairingKeyPair.privateKey)

    const androidPubKeySpki = Buffer.from(androidPublicKey, 'base64')
    // Android sends SPKI-encoded key; extract raw EC point for ECDH
    const androidPubKeyRaw = this.spkiToRawEcPublicKey(androidPubKeySpki)
    const sharedSecret = ecdh.computeSecret(androidPubKeyRaw)

    // Derive session keys using HKDF
    const salt = Buffer.from(this.currentPairingData.pin + this.currentPairingData.timestamp)
    const info = Buffer.from('DeviceDoctor v1.0 Session Keys')

    const keyMaterial = crypto.hkdfSync(
      'sha256',
      sharedSecret,
      salt,
      info,
      96 // 3 keys x 32 bytes
    )

    const keys = Buffer.from(keyMaterial)
    const sessionKey = keys.subarray(0, 32)
    const hmacKey = keys.subarray(32, 64)

    // Solve challenge
    const challengeResponse = crypto
      .createHmac('sha256', hmacKey)
      .update(challenge)
      .digest('base64')

    // Create session
    const session: Session = {
      sessionId: crypto.randomUUID(),
      deviceId,
      desktopId: this.currentPairingData.desktopId,
      sessionKey,
      hmacKey,
      sharedSecret,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      lastActivity: Date.now(),
      permissions: {
        sms: true,
        contacts: true,
        files: true,
        apps: true
      },
      ipAddress: this.currentPairingData.ip,
      connectionType: 'wifi'
    }

    // Store session
    await this.storeSession(session)

    // Add to active sessions
    this.activeSessions.set(session.deviceId, session)

    // Clear pairing data
    this.pairingKeyPair = null
    this.currentPairingData = null

    return { session, challengeResponse }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  encryptData(plaintext: string, sessionKey: Buffer): { ciphertext: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12) // 96-bit nonce for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv)

    let encrypted = cipher.update(plaintext, 'utf8', 'base64')
    encrypted += cipher.final('base64')

    const authTag = cipher.getAuthTag()

    return {
      ciphertext: encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  decryptData(ciphertext: string, iv: string, authTag: string, sessionKey: Buffer): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(authTag, 'base64'))

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }

  /**
   * Sign message with HMAC-SHA256
   */
  signMessage(message: string, hmacKey: Buffer): string {
    const hmac = crypto.createHmac('sha256', hmacKey)
    hmac.update(message)
    return hmac.digest('base64')
  }

  /**
   * Verify message signature
   */
  verifySignature(message: string, signature: string, hmacKey: Buffer): boolean {
    const expectedSignature = this.signMessage(message, hmacKey)
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    )
  }

  /**
   * Get session by device ID
   */
  getSession(deviceId: string): Session | undefined {
    const session = this.activeSessions.get(deviceId)

    // Check if session is expired
    if (session && Date.now() > session.expiresAt) {
      this.revokeSession(deviceId)
      return undefined
    }

    // Update last activity
    if (session) {
      session.lastActivity = Date.now()
    }

    return session
  }

  /**
   * Validate session
   */
  validateSession(sessionId: string): boolean {
    for (const session of this.activeSessions.values()) {
      if (session.sessionId === sessionId && Date.now() < session.expiresAt) {
        return true
      }
    }
    return false
  }

  /**
   * Revoke session
   */
  revokeSession(deviceId: string): void {
    this.activeSessions.delete(deviceId)
    const sessions = this.store.get('sessions', {}) as Record<string, any>
    delete sessions[deviceId]
    this.store.set('sessions', sessions)
  }

  /**
   * Refresh session
   */
  async refreshSession(deviceId: string): Promise<Session> {
    const session = this.getSession(deviceId)
    if (!session) {
      throw new Error('Session not found')
    }

    // Extend expiration
    session.expiresAt = Date.now() + 24 * 60 * 60 * 1000

    // Update storage
    await this.storeSession(session)

    return session
  }

  /**
   * Store session securely
   */
  private async storeSession(session: Session): Promise<void> {
    const sessions = this.store.get('sessions', {}) as Record<string, any>

    sessions[session.deviceId] = {
      sessionId: session.sessionId,
      sessionKey: session.sessionKey.toString('base64'),
      hmacKey: session.hmacKey.toString('base64'),
      sharedSecret: session.sharedSecret.toString('base64'),
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      deviceId: session.deviceId,
      desktopId: session.desktopId,
      permissions: session.permissions,
      ipAddress: session.ipAddress,
      connectionType: session.connectionType
    }

    this.store.set('sessions', sessions)
  }

  /**
   * Load sessions from storage
   */
  private loadSessions(): void {
    const sessions = this.store.get('sessions', {}) as Record<string, any>

    for (const [deviceId, sessionData] of Object.entries(sessions)) {
      // Skip expired sessions
      if (Date.now() > sessionData.expiresAt) {
        continue
      }

      const session: Session = {
        sessionId: sessionData.sessionId,
        deviceId: sessionData.deviceId,
        desktopId: sessionData.desktopId,
        sessionKey: Buffer.from(sessionData.sessionKey, 'base64'),
        hmacKey: Buffer.from(sessionData.hmacKey, 'base64'),
        sharedSecret: Buffer.from(sessionData.sharedSecret, 'base64'),
        createdAt: sessionData.createdAt,
        expiresAt: sessionData.expiresAt,
        lastActivity: Date.now(),
        permissions: sessionData.permissions,
        ipAddress: sessionData.ipAddress,
        connectionType: sessionData.connectionType
      }

      this.activeSessions.set(deviceId, session)
    }
  }

  /**
   * Get desktop ID (generate if not exists)
   */
  private getDesktopId(): string {
    let desktopId = this.store.get('desktopId') as string

    if (!desktopId) {
      desktopId = crypto.randomUUID()
      this.store.set('desktopId', desktopId)
    }

    return desktopId
  }

  /**
   * Get local IP address
   */
  private async getLocalIP(): Promise<string> {
    const os = await import('os')
    const nets = os.networkInterfaces()

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        // Skip internal and non-IPv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          return net.address
        }
      }
    }

    return '127.0.0.1'
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.activeSessions.values())
  }

  /**
   * Connect directly to an Android device by IP and port
   * Desktop pushes pairing data to Android's HTTP server
   */
  async connectToDevice(androidIp: string, androidPort: number): Promise<{ session: Session; pin: string; deviceName: string; androidVersion: string }> {
    // Generate ECDH key pair
    const ecdh = crypto.createECDH('prime256v1')
    ecdh.generateKeys()

    this.pairingKeyPair = {
      publicKey: ecdh.getPublicKey(),
      privateKey: ecdh.getPrivateKey()
    }

    // Generate 6-digit PIN
    const pin = crypto.randomInt(100000, 999999).toString()

    // Get local IP
    const localIP = await this.getLocalIP()

    // Build pairing payload to send to Android
    const pairingPayload = {
      version: '1.0',
      type: 'devicedoctor_pairing',
      timestamp: Date.now(),
      desktopId: this.getDesktopId(),
      desktopName: require('os').hostname(),
      ip: localIP,
      port: this.getPairingPort(),
      publicKey: this.rawEcPublicKeyToSpki(this.pairingKeyPair.publicKey).toString('base64'),
      pin
    }

    // Sign the payload — sort keys alphabetically to match Gson's serialization on Android
    const hmac = crypto.createHmac('sha256', pin)
    const objToSign = { ...pairingPayload, signature: '' }
    const signature = hmac.update(JSON.stringify(objToSign, Object.keys(objToSign).sort())).digest('base64')

    const payload = { ...pairingPayload, signature }

    // Set currentPairingData so completePairing can use it
    this.currentPairingData = {
      ...pairingPayload,
      type: 'devicedoctor_pairing',
      expiresAt: Date.now() + 5 * 60 * 1000,
      signature
    }

    // POST to Android device
    const postData = JSON.stringify(payload)

    const response = await new Promise<any>((resolve, reject) => {
      const req = http.request({
        hostname: androidIp,
        port: androidPort,
        path: '/api/v1/pairing/initiate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 10000
      }, (res) => {
        let body = ''
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => {
          console.log(`Pairing response status: ${res.statusCode}, body length: ${body.length}`)
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Android device returned HTTP ${res.statusCode}: ${body.substring(0, 200)}`))
            return
          }
          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new Error(`Invalid response from Android device (not JSON): ${body.substring(0, 200)}`))
          }
        })
      })

      req.on('error', (err) => reject(new Error(`Cannot reach Android device: ${err.message}`)))
      req.on('timeout', () => { req.destroy(); reject(new Error('Connection timed out')) })
      req.write(postData)
      req.end()
    })

    console.log('Pairing response from Android:', JSON.stringify(response, null, 2))

    if (response.status === 'error') {
      throw new Error(response.error?.message || 'Android rejected pairing')
    }

    const data = response.data || response
    const { androidPublicKey, deviceId, challenge, deviceName, androidVersion } = data

    if (!androidPublicKey || !deviceId || !challenge) {
      throw new Error(`Incomplete response from Android device. Got keys: ${Object.keys(data).join(', ')}`)
    }

    // Complete pairing on desktop side
    const result = await this.completePairing(androidPublicKey, deviceId, challenge)

    // Emit event with device metadata
    this.emit('pairing:complete', {
      sessionId: result.session.sessionId,
      deviceId: result.session.deviceId,
      desktopId: result.session.desktopId,
      deviceName: deviceName || 'Android Device',
      androidVersion: androidVersion || 'Unknown',
      ipAddress: androidIp
    })

    return { session: result.session, pin, deviceName: deviceName || 'Android Device', androidVersion: androidVersion || 'Unknown' }
  }

  /**
   * Generate pairing info for Android to discover via tunnel.
   * Called by the desktop HTTP server on port 7771.
   */
  async generatePairingInfo(desktopName: string): Promise<any> {
    // Generate ECDH key pair if not already done
    const ecdh = crypto.createECDH('prime256v1')
    ecdh.generateKeys()

    this.pairingKeyPair = {
      publicKey: ecdh.getPublicKey(),
      privateKey: ecdh.getPrivateKey()
    }

    const pin = crypto.randomInt(100000, 999999).toString()
    const localIP = await this.getLocalIP()

    this.currentPairingData = {
      version: '1.0',
      type: 'devicedoctor_pairing',
      timestamp: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      desktopId: this.getDesktopId(),
      desktopName,
      ip: localIP,
      port: this.getPairingPort(),
      publicKey: this.rawEcPublicKeyToSpki(this.pairingKeyPair.publicKey).toString('base64'),
      pin
    }

    // Sort keys alphabetically to match Gson's serialization order on Android
    const dataToSign = JSON.stringify({ ...this.currentPairingData, signature: '' }, Object.keys({ ...this.currentPairingData, signature: '' }).sort())
    const hmac = crypto.createHmac('sha256', pin)
    this.currentPairingData.signature = hmac.update(dataToSign).digest('base64')

    return this.currentPairingData
  }

  /**
   * Complete pairing initiated by Android (Android POSTs its keys to desktop).
   * Emits 'pairing:complete' so IpcHandlers can register the device in DeviceManager.
   */
  async completePairingFromAndroid(data: {
    androidPublicKey: string
    deviceId: string
    challenge: string
    deviceName?: string
    manufacturer?: string
    model?: string
    androidVersion?: string
    androidPort?: number
    ipAddress?: string
  }): Promise<{ session: Session; challengeResponse: string }> {
    const result = await this.completePairing(data.androidPublicKey, data.deviceId, data.challenge)

    // Emit event so IpcHandlers registers the device in DeviceManager
    this.emit('pairing:complete', {
      sessionId: result.session.sessionId,
      deviceId: result.session.deviceId,
      desktopId: result.session.desktopId,
      deviceName: data.deviceName || 'Android Device',
      manufacturer: data.manufacturer || '',
      model: data.model || data.deviceName || 'Android Device',
      androidVersion: data.androidVersion || 'Unknown',
      androidPort: data.androidPort || 8443,
      ipAddress: data.ipAddress || ''
    })

    return result
  }

  /**
   * Get current pairing data if an active pairing session exists
   */
  getCurrentPairingData(): PairingData | null {
    if (this.currentPairingData && Date.now() < this.currentPairingData.expiresAt) {
      return this.currentPairingData
    }
    return null
  }

  /**
   * Cancel ongoing pairing
   */
  cancelPairing(): void {
    this.pairingKeyPair = null
    this.currentPairingData = null
    this.stopPairingServer()
  }
}
