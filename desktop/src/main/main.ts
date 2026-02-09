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
          res.end(JSON.stringify({ status: 'paired', desktopName: require('os').hostname() }))
          return
        }

        // No active pairing and no sessions — generate fresh pairing data
        this.securityManager.generatePairingInfo(require('os').hostname()).then((pairingData) => {
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
          desktopName: require('os').hostname(),
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
                // DeviceManager.updateDevice emits 'device:updated' → IpcHandlers → renderer
                this.deviceManager.updateDevice(deviceId, {
                  lastSeen: Date.now(),
                  batteryLevel: data.batteryLevel,
                  storageAvailable: data.storageAvailable,
                  connected: true
                })

                // Auto-reconnect WiFiClient if not connected (e.g., after ADB forward was re-established)
                if (!this.communicationEngine.isConnected(deviceId) && device.ipAddress) {
                  const port = (device.ipAddress === '127.0.0.1' || device.ipAddress === '::1') ? 18443 : 8443
                  console.log(`Heartbeat: WiFiClient not connected, attempting reconnect to ${device.ipAddress}:${port}`)
                  this.communicationEngine.connect({
                    deviceId,
                    connectionType: 'wifi',
                    ipAddress: device.ipAddress,
                    port
                  }).then(() => {
                    console.log(`WiFiClient auto-reconnected to ${device.ipAddress}:${port}`)
                  }).catch((err: any) => {
                    console.log(`WiFiClient reconnect failed: ${err.message}`)
                  })
                }
              }
            }

            // Respond with desktop's desired connection state
            const desiredConnected = this.deviceManager.getDevice(deviceId)?.connected ?? true
            res.writeHead(200)
            res.end(JSON.stringify({
              status: 'ok',
              connected: desiredConnected
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
