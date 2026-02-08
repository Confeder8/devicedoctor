/**
 * Device Manager - Manages connected devices and their state
 */

import Store from 'electron-store'
import { EventEmitter } from 'events'
import { SecurityManager } from '../security/SecurityManager'
import { CommunicationEngine } from '../communication/CommunicationEngine'
import { DiscoveryManager } from '../discovery/DiscoveryManager'

export interface Device {
  deviceId: string
  deviceName: string
  manufacturer: string
  model: string
  androidVersion: string
  ipAddress: string
  bluetoothAddress?: string
  connectionType: 'wifi' | 'bluetooth' | 'internet'
  connected: boolean
  paired: boolean
  lastSeen: number
  pairedAt?: number
  capabilities: string[]
  batteryLevel?: number
  storageAvailable?: number
}

export class DeviceManager extends EventEmitter {
  private store: Store
  private securityManager: SecurityManager
  private communicationEngine: CommunicationEngine
  private discoveryManager: DiscoveryManager
  private devices: Map<string, Device> = new Map()

  constructor(
    store: Store,
    securityManager: SecurityManager,
    communicationEngine: CommunicationEngine,
    discoveryManager: DiscoveryManager
  ) {
    super()
    this.store = store
    this.securityManager = securityManager
    this.communicationEngine = communicationEngine
    this.discoveryManager = discoveryManager

    this.loadDevices()
    this.setupEventHandlers()
  }

  /**
   * Get all devices
   */
  getAllDevices(): Device[] {
    return Array.from(this.devices.values())
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId)
  }

  /**
   * Get connected devices
   */
  getConnectedDevices(): Device[] {
    return this.getAllDevices().filter(d => d.connected)
  }

  /**
   * Get paired devices
   */
  getPairedDevices(): Device[] {
    return this.getAllDevices().filter(d => d.paired)
  }

  /**
   * Add device (from discovery or pairing)
   */
  addDevice(device: Device): void {
    this.devices.set(device.deviceId, device)
    this.saveDevices()
    this.emit('device:added', device)
  }

  /**
   * Update device
   */
  updateDevice(deviceId: string, updates: Partial<Device>): void {
    const device = this.devices.get(deviceId)
    if (!device) return

    Object.assign(device, updates)
    this.devices.set(deviceId, device)
    this.saveDevices()
    this.emit('device:updated', device)
  }

  /**
   * Remove device
   */
  async removeDevice(deviceId: string): Promise<void> {
    // Disconnect if connected
    if (this.communicationEngine.isConnected(deviceId)) {
      await this.communicationEngine.disconnect(deviceId)
    }

    // Revoke session
    this.securityManager.revokeSession(deviceId)

    // Remove from devices
    this.devices.delete(deviceId)
    this.saveDevices()
    this.emit('device:removed', deviceId)
  }

  /**
   * Connect to device.
   * Since the tunnel is one-way (Android → Desktop), we can't directly
   * reach Android. We just set local state. Android picks it up via
   * polling the /api/v1/heartbeat endpoint.
   */
  async connect(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId)
    if (!device) {
      throw new Error('Device not found')
    }

    if (!device.paired) {
      throw new Error('Device not paired')
    }

    // Check if session exists
    const session = this.securityManager.getSession(deviceId)
    if (!session) {
      throw new Error('No valid session. Please pair device again.')
    }

    // Update device status — Android will see this via heartbeat polling
    this.updateDevice(deviceId, {
      connected: true,
      lastSeen: Date.now()
    })

    this.emit('device:connected', device)
  }

  /**
   * Disconnect from device.
   * Sets local state to disconnected. Android picks it up via heartbeat polling.
   */
  async disconnect(deviceId: string): Promise<void> {
    this.updateDevice(deviceId, {
      connected: false
    })

    this.emit('device:disconnected', deviceId)
  }

  /**
   * Get device info
   */
  async getDeviceInfo(deviceId: string): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/device/info',
      'GET'
    )
  }

  /**
   * Get device permissions
   */
  async getPermissions(deviceId: string): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/device/permissions',
      'GET'
    )
  }

  /**
   * Request permission
   */
  async requestPermission(deviceId: string, permissions: string[]): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/device/permissions/request',
      'POST',
      { permissions }
    )
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Discovery events
    this.discoveryManager.on('device:found', (deviceInfo) => {
      // Check if device is already known
      const existing = Array.from(this.devices.values()).find(
        d => d.ipAddress === deviceInfo.ipAddress
      )

      if (existing) {
        this.updateDevice(existing.deviceId, {
          lastSeen: Date.now()
        })
      } else {
        // Emit found event for UI to handle pairing
        this.emit('device:found', deviceInfo)
      }
    })

    // Communication events
    this.communicationEngine.on('connected', ({ deviceId, connectionType }) => {
      this.updateDevice(deviceId, {
        connected: true,
        connectionType,
        lastSeen: Date.now()
      })
      this.emit('device:connected', this.devices.get(deviceId))
    })

    this.communicationEngine.on('disconnected', (deviceId) => {
      this.updateDevice(deviceId, {
        connected: false
      })
      this.emit('device:disconnected', deviceId)
    })

    this.communicationEngine.on('message', ({ deviceId, message }) => {
      // Forward real-time messages to UI
      this.emit('message', { deviceId, message })
    })

    this.communicationEngine.on('error', ({ deviceId, error }) => {
      console.error(`Communication error for device ${deviceId}:`, error)
      this.emit('error', { deviceId, error })
    })
  }

  /**
   * Load devices from storage
   */
  private loadDevices(): void {
    const devices = this.store.get('devices', {}) as Record<string, Device>

    for (const [deviceId, device] of Object.entries(devices)) {
      // Reset connected status on load
      device.connected = false
      this.devices.set(deviceId, device)
    }
  }

  /**
   * Save devices to storage
   */
  private saveDevices(): void {
    const devices: Record<string, Device> = {}

    for (const [deviceId, device] of this.devices) {
      devices[deviceId] = device
    }

    this.store.set('devices', devices)
  }

  /**
   * Auto-reconnect to previously connected devices
   */
  async autoReconnect(): Promise<void> {
    const pairedDevices = this.getPairedDevices()

    for (const device of pairedDevices) {
      try {
        await this.connect(device.deviceId)
        console.log(`Auto-reconnected to ${device.deviceName}`)
      } catch (error) {
        console.error(`Failed to auto-reconnect to ${device.deviceName}:`, error)
      }
    }
  }
}
