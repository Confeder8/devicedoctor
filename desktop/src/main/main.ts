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
import { DeviceManager } from './modules/device/DeviceManager'
import { SecurityManager } from './modules/security/SecurityManager'
import { DiscoveryManager } from './modules/discovery/DiscoveryManager'
import { CommunicationEngine } from './modules/communication/CommunicationEngine'
import { registerIpcHandlers } from './ipc/IpcHandlers'
import Store from 'electron-store'

let isQuitting = false

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

    const iconPath = path.join(__dirname, '../../../assets/icon.png')
    if (fs.existsSync(iconPath)) {
      windowOptions.icon = iconPath
    }

    this.mainWindow = new BrowserWindow(windowOptions)

    // Load renderer - use app.isPackaged to detect dev mode
    if (!app.isPackaged) {
      this.mainWindow.loadURL('http://localhost:3000')
      this.mainWindow.webContents.openDevTools()
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
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
    const iconPath = path.join(__dirname, '../../../assets/tray-icon.png')
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
