/**
 * DeviceDoctor - Main Process Entry Point
 *
 * This is the Electron main process that manages:
 * - Application lifecycle
 * - Window creation and management
 * - IPC communication with renderer
 * - System-level operations
 */

import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import * as os from 'os'
import { DeviceManager } from './modules/device/DeviceManager'
import { SecurityManager } from './modules/security/SecurityManager'
import { DiscoveryManager } from './modules/discovery/DiscoveryManager'
import { CommunicationEngine } from './modules/communication/CommunicationEngine'
import { registerIpcHandlers } from './ipc/IpcHandlers'
import Store from 'electron-store'

let isQuitting = false

// Prevent EPIPE crashes from broken tunnel connections
process.on('uncaughtException', (err: any) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    console.error('Caught EPIPE error (ignored):', err.message)
    return
  }
  console.error('Uncaught exception:', err)
  process.exit(1)
})

class DeviceDoctorApp {
  private mainWindow: BrowserWindow | null = null
  private tray: Tray | null = null
  private store: Store
  private deviceManager: DeviceManager
  private securityManager: SecurityManager
  private discoveryManager: DiscoveryManager
  private communicationEngine: CommunicationEngine
  private reconnectAttempts: Map<string, { count: number; nextAttemptAfter: number }> = new Map()

  constructor() {
    this.store = new Store({
      name: 'devicedoctor-config',
      encryptionKey: 'devicedoctor-encryption-key-v1'
    })

    // Initialize core modules
    this.securityManager = new SecurityManager(this.store)
    this.communicationEngine = new CommunicationEngine(this.securityManager)
    this.discoveryManager = new DiscoveryManager(this.communicationEngine)
    this.deviceManager = new DeviceManager(
      this.store,
      this.securityManager,
      this.communicationEngine,
      this.discoveryManager
    )

    this.init()
  }

  private async init() {
    // Wait for Electron to be ready
    await app.whenReady()

    // Create main window
    this.createMainWindow()

    // Register IPC handlers
    this.registerIpcHandlers()

    // Create system tray
    this.createTray()

    // Handle app activation (macOS)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow()
      }
    })

    // Handle all windows closed
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    // Initialize device discovery
    await this.discoveryManager.startDiscovery()

    // Start desktop server on port 7771 for Android to discover via tunnel
    this.startDesktopServer()

    // Auto-start pairing if no devices are currently paired
    this.startAutoPairingIfNeeded()

    // Restart auto-pairing when all devices are removed
    this.deviceManager.on('device:removed', () => {
      this.startAutoPairingIfNeeded()
    })

    // Stop auto-pairing when a device pairs successfully
    this.securityManager.on('pairing:complete', () => {
      console.log('Pairing complete, stopping auto-pairing broadcast')
      this.securityManager.cancelPairing()
    })
  }

  /**
   * Start HTTP server on port 7771 so Android can reach desktop via tunnel.
   * Desktop is the central server — Android connects to it, not the other way around.
   *
   * Endpoints:
   * - GET /health — health check
   * - GET /api/v1/pairing/info — pairing data for Android to auto-pair
   * - POST /api/v1/pairing/complete — Android completes pairing handshake
   * - GET /api/v1/status — connection state for Android to poll
   * - POST /api/v1/heartbeat — Android sends device info + checks for commands
   */
  private startDesktopServer() {
    const DESKTOP_PORT = 7771
    const server = http.createServer((req, res) => {
      const url = req.url || ''

      res.setHeader('Content-Type', 'application/json')

      if (req.method === 'GET' && url === '/health') {
        res.writeHead(200)
        res.end(JSON.stringify({ status: 'ok', app: 'DeviceDoctor Desktop' }))
        return
      }

      if (req.method === 'GET' && url === '/api/v1/pairing/info') {
        // Serve existing pairing data if an active pairing session is in progress
        const existing = this.securityManager.getCurrentPairingData()
        if (existing) {
          res.writeHead(200)
          res.end(JSON.stringify(existing))
          return
        }

        const hasSessions = this.securityManager.getAllSessions().length > 0
        if (hasSessions) {
          res.writeHead(200)
          res.end(JSON.stringify({ status: 'paired', desktopName: os.hostname() }))
          return
        }

        // No active pairing and no sessions — generate fresh pairing data
        this.securityManager.generatePairingInfo(os.hostname()).then((pairingData) => {
          res.writeHead(200)
          res.end(JSON.stringify(pairingData))
        }).catch((err: any) => {
          res.writeHead(500)
          res.end(JSON.stringify({ error: err.message }))
        })
        return
      }

      if (req.method === 'POST' && url === '/api/v1/pairing/complete') {
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', async () => {
          try {
            const data = JSON.parse(body)
            // Capture requester's IP address
            const remoteIp = req.socket.remoteAddress?.replace(/^::ffff:/, '') || ''
            data.ipAddress = data.ipAddress || remoteIp
            const result = await this.securityManager.completePairingFromAndroid(data)

            // Note: IpcHandlers listens for SecurityManager's pairing:complete event
            // and handles device registration + renderer notification. No duplicate send here.

            res.writeHead(200)
            res.end(JSON.stringify({
              status: 'success',
              sessionId: result.session.sessionId,
              challengeResponse: result.challengeResponse
            }))
          } catch (err: any) {
            res.writeHead(500)
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      // Status endpoint — Android polls this to know if desktop wants connected/disconnected
      if (req.method === 'GET' && url === '/api/v1/status') {
        const devices = this.deviceManager.getAllDevices()
        const sessions = this.securityManager.getAllSessions()
        res.writeHead(200)
        res.end(JSON.stringify({
          status: 'ok',
          desktopName: os.hostname(),
          hasSessions: sessions.length > 0,
          devices: devices.map(d => ({
            deviceId: d.deviceId,
            connected: d.connected,
            deviceName: d.deviceName
          }))
        }))
        return
      }

      // Heartbeat endpoint — Android sends device info, desktop updates device state
      if (req.method === 'POST' && url === '/api/v1/heartbeat') {
        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            const deviceId = data.deviceId

            if (deviceId) {
              const device = this.deviceManager.getDevice(deviceId)
              if (device) {
                // Update device with latest info from Android
                // Do NOT override 'connected' — that is controlled by user actions (connect/disconnect buttons)
                this.deviceManager.updateDevice(deviceId, {
                  lastSeen: Date.now(),
                  batteryLevel: data.batteryLevel,
                  storageAvailable: data.storageAvailable
                })

                // Auto-connect: if device is paired but not connected, and we have a valid session,
                // establish the WiFi link on first heartbeat (device just came online)
                if (!device.connected && device.paired && !this.communicationEngine.isConnected(deviceId) && device.ipAddress) {
                  const session = this.securityManager.getSession(deviceId)
                  if (session && !this.reconnectAttempts.has(deviceId)) {
                    console.log(`Heartbeat: auto-connecting paired device ${deviceId}`)
                    this.reconnectAttempts.set(deviceId, { count: 0, nextAttemptAfter: 0 })
                    this.communicationEngine.connectWithFallback(deviceId, device.ipAddress, this.store, device.androidPort || 8443).then((connInfo) => {
                      console.log(`WiFiClient auto-connected via ${connInfo.route} to ${connInfo.host}:${connInfo.port}`)
                      this.deviceManager.updateDevice(deviceId, { connected: true })
                      this.reconnectAttempts.delete(deviceId)
                      if (this.mainWindow) {
                        this.mainWindow.webContents.send('device:connected', this.deviceManager.getDevice(deviceId))
                      }
                    }).catch((err: any) => {
                      console.log(`WiFiClient auto-connect failed: ${err.message}`)
                      this.reconnectAttempts.delete(deviceId)
                    })
                  }
                }

                // Re-connect WiFiClient if device is supposed to be connected but WiFiClient is down
                if (device.connected && !this.communicationEngine.isConnected(deviceId) && device.ipAddress) {
                  const MAX_RECONNECT_ATTEMPTS = 5
                  const state = this.reconnectAttempts.get(deviceId) || { count: 0, nextAttemptAfter: 0 }

                  if (Date.now() < state.nextAttemptAfter) {
                    // Still in backoff period, skip this heartbeat
                  } else if (state.count >= MAX_RECONNECT_ATTEMPTS) {
                    // Give up — mark device as disconnected
                    console.log(`Heartbeat: max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${deviceId}, marking disconnected`)
                    this.deviceManager.disconnect(deviceId)
                    this.reconnectAttempts.delete(deviceId)
                    if (this.mainWindow) {
                      this.mainWindow.webContents.send('device:disconnected', deviceId)
                    }
                  } else {
                    const attempt = state.count + 1
                    const backoffMs = Math.min(2000 * Math.pow(2, state.count), 60000)
                    this.reconnectAttempts.set(deviceId, { count: attempt, nextAttemptAfter: Date.now() + backoffMs })
                    console.log(`Heartbeat: reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} for ${deviceId} (next backoff: ${backoffMs}ms)`)
                    this.communicationEngine.connectWithFallback(deviceId, device.ipAddress, this.store, device.androidPort || 8443).then((connInfo) => {
                      console.log(`WiFiClient auto-reconnected via ${connInfo.route} to ${connInfo.host}:${connInfo.port}`)
                      this.reconnectAttempts.delete(deviceId)
                    }).catch((err: any) => {
                      console.log(`WiFiClient reconnect failed: ${err.message}`)
                    })
                  }
                } else if (this.communicationEngine.isConnected(deviceId)) {
                  // Connection is healthy — reset reconnect state
                  this.reconnectAttempts.delete(deviceId)
                }
              }
            }

            // Respond with desktop's desired connection state
            // Default to false if device is unknown — don't tell Android it's connected when desktop has no record
            const desiredConnected = this.deviceManager.getDevice(deviceId)?.connected ?? false
            const pairingActive = this.securityManager.getCurrentPairingData() !== null
            res.writeHead(200)
            res.end(JSON.stringify({
              status: 'ok',
              connected: desiredConnected,
              pairingActive
            }))
          } catch (err: any) {
            res.writeHead(400)
            res.end(JSON.stringify({ error: err.message }))
          }
        })
        return
      }

      res.writeHead(404)
      res.end(JSON.stringify({ error: 'Not found' }))
    })

    server.listen(DESKTOP_PORT, '0.0.0.0', () => {
      console.log(`Desktop server listening on port ${DESKTOP_PORT}`)
    })

    server.on('error', (err: any) => {
      console.error(`Desktop server error: ${err.message}`)
    })
  }

  /**
   * Auto-start pairing if no devices are currently paired.
   * This makes the desktop discoverable to Android without user interaction.
   */
  private startAutoPairingIfNeeded() {
    const devices = this.deviceManager.getAllDevices()
    if (devices.length === 0) {
      console.log('No paired devices, auto-starting pairing...')
      this.securityManager.initiatePairing('DeviceDoctor Desktop').then(() => {
        console.log('Auto-pairing started — waiting for Android device')
      }).catch((err: any) => {
        console.error('Auto-pairing failed:', err.message)
      })
    }
  }

  private createMainWindow() {
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      title: 'DeviceDoctor',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      show: false,
      backgroundColor: '#ffffff'
    }

    const iconPath = path.join(__dirname, '../../../../assets/icon.png')
    if (fs.existsSync(iconPath)) {
      windowOptions.icon = iconPath
    }

    this.mainWindow = new BrowserWindow(windowOptions)

    // Load renderer - use app.isPackaged to detect dev mode
    if (!app.isPackaged) {
      const devPort = process.env.DEV_PORT || '3000'
      this.mainWindow.loadURL(`http://localhost:${devPort}`)
      this.mainWindow.webContents.openDevTools()
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
    }

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      this.mainWindow?.show()
    })

    // Handle window close
    this.mainWindow.on('close', (event) => {
      if (!isQuitting) {
        event.preventDefault()
        this.mainWindow?.hide()
      }
    })

    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })
  }

  private createTray() {
    const iconPath = path.join(__dirname, '../../../../assets/tray-icon.png')
    let trayIcon: Electron.NativeImage
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath)
    } else {
      // Create a minimal 16x16 empty tray icon as fallback
      trayIcon = nativeImage.createEmpty()
    }
    this.tray = new Tray(trayIcon)

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open DeviceDoctor',
        click: () => {
          this.mainWindow?.show()
        }
      },
      {
        label: 'Connected Devices',
        submenu: [
          {
            label: 'No devices connected',
            enabled: false
          }
        ]
      },
      { type: 'separator' },
      {
        label: 'Preferences',
        click: () => {
          this.mainWindow?.show()
          this.mainWindow?.webContents.send('navigate', '/settings')
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])

    this.tray.setContextMenu(contextMenu)
    this.tray.setToolTip('DeviceDoctor - No devices connected')

    this.tray.on('click', () => {
      this.mainWindow?.show()
    })
  }

  private registerIpcHandlers() {
    registerIpcHandlers(
      this.deviceManager,
      this.securityManager,
      this.discoveryManager,
      this.communicationEngine,
      this.store
    )

    // Window controls
    ipcMain.handle('window:minimize', () => {
      this.mainWindow?.minimize()
    })

    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize()
      } else {
        this.mainWindow?.maximize()
      }
    })

    ipcMain.handle('window:close', () => {
      this.mainWindow?.close()
    })

    // App info
    ipcMain.handle('app:version', () => {
      return app.getVersion()
    })

    ipcMain.handle('app:platform', () => {
      return process.platform
    })
  }
}

// Start application
new DeviceDoctorApp()
