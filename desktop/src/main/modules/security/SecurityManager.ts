/**
 * Security Manager - Handles encryption, key exchange, and session management
 */

import * as crypto from 'crypto'
import * as http from 'http'
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

  constructor(store: Store) {
    super()
    this.store = store
    this.loadSessions()
  }

  /**
   * Initiate pairing process
   */
  async initiatePairing(desktopName: string): Promise<{ qrCode: string; pin: string }> {
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
      port: 8443,
      publicKey: this.pairingKeyPair.publicKey.toString('base64'),
      pin
    }

    // Sign pairing data
    const dataToSign = JSON.stringify({
      ...this.currentPairingData,
      signature: undefined
    })
    const hmac = crypto.createHmac('sha256', pin)
    this.currentPairingData.signature = hmac.update(dataToSign).digest('base64')

    // Generate QR code
    const qrCodeDataURL = await QRCode.toDataURL(
      JSON.stringify(this.currentPairingData),
      { errorCorrectionLevel: 'M', width: 400 }
    )

    // Start the pairing HTTP server
    await this.startPairingServer()

    return { qrCode: qrCodeDataURL, pin }
  }

  /**
   * Start temporary HTTP server to receive Android's pairing POST
   */
  private startPairingServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pairingServer) {
        this.pairingServer.close()
        this.pairingServer = null
      }

      this.pairingServer = http.createServer((req, res) => {
        // Set CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          res.end()
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

      this.pairingServer.listen(8443, '0.0.0.0', () => {
        console.log('Pairing server started on port 8443')
        resolve()
      })
    })
  }

  /**
   * Stop the pairing server
   */
  private stopPairingServer(): void {
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

    const androidPubKeyBuffer = Buffer.from(androidPublicKey, 'base64')
    const sharedSecret = ecdh.computeSecret(androidPubKeyBuffer)

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
   * Cancel ongoing pairing
   */
  cancelPairing(): void {
    this.pairingKeyPair = null
    this.currentPairingData = null
    this.stopPairingServer()
  }
}
