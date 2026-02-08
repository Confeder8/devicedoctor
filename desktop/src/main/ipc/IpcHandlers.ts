/**
 * IPC Handlers - Registers all IPC handlers for renderer communication
 */

import { ipcMain, BrowserWindow, app } from 'electron'
import { DeviceManager } from '../modules/device/DeviceManager'
import { SecurityManager } from '../modules/security/SecurityManager'
import { DiscoveryManager } from '../modules/discovery/DiscoveryManager'
import { CommunicationEngine } from '../modules/communication/CommunicationEngine'
import { SmsService } from '../services/SmsService'
import { ContactService } from '../services/ContactService'
import { AppService } from '../services/AppService'
import { FileService } from '../services/FileService'
import Store from 'electron-store'

export function registerIpcHandlers(
  deviceManager: DeviceManager,
  securityManager: SecurityManager,
  discoveryManager: DiscoveryManager,
  communicationEngine: CommunicationEngine,
  store?: Store
) {
  // Initialize services
  const smsService = new SmsService(communicationEngine)
  const contactService = new ContactService(communicationEngine)
  const appService = new AppService(communicationEngine)
  const fileService = new FileService(communicationEngine)

  // Setup event forwarding to renderer
  const forwardEvent = (event: string, ...args: any[]) => {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(win => win.webContents.send(event, ...args))
  }

  // Device Manager events
  deviceManager.on('device:found', (device) => forwardEvent('device:found', device))
  deviceManager.on('device:connected', (device) => forwardEvent('device:connected', device))
  deviceManager.on('device:disconnected', (deviceId) => forwardEvent('device:disconnected', deviceId))
  deviceManager.on('device:updated', (device) => forwardEvent('device:updated', device))
  deviceManager.on('message', ({ deviceId, message }) => {
    // Forward specific message types
    forwardEvent(`${message.type}`, { deviceId, ...message.data })
  })

  // SecurityManager pairing:complete event — register device and forward to renderer
  securityManager.on('pairing:complete', (data) => {
    // Use tunnel settings for reconnection
    const tunnelHost = store ? (store.get('settings.tunnelHost', 'brjk01agv.localto.net') as string) : 'brjk01agv.localto.net'
    const tunnelPort = store ? (store.get('settings.tunnelPort', 7580) as number) : 7580

    // Register device in DeviceManager
    const device = {
      deviceId: data.deviceId,
      deviceName: data.deviceName || 'Android Device',
      manufacturer: '',
      model: data.deviceName || 'Android Device',
      androidVersion: data.androidVersion || 'Unknown',
      ipAddress: data.ipAddress || tunnelHost,
      connectionType: 'wifi' as const,
      connected: true,
      paired: true,
      lastSeen: Date.now(),
      pairedAt: Date.now(),
      capabilities: ['sms', 'contacts', 'apps', 'files']
    }
    deviceManager.addDevice(device)

    forwardEvent('pairing:complete', data)
  })

  // ===== Device Management =====

  ipcMain.handle('device:getAll', async () => {
    return deviceManager.getAllDevices()
  })

  ipcMain.handle('device:getById', async (_event, deviceId: string) => {
    return deviceManager.getDevice(deviceId)
  })

  ipcMain.handle('device:connect', async (_event, deviceId: string) => {
    await deviceManager.connect(deviceId)
    return { success: true }
  })

  ipcMain.handle('device:disconnect', async (_event, deviceId: string) => {
    await deviceManager.disconnect(deviceId)
  })

  ipcMain.handle('device:remove', async (_event, deviceId: string) => {
    await deviceManager.removeDevice(deviceId)
  })

  // ===== Pairing =====

  ipcMain.handle('pairing:start', async (_event, desktopName: string) => {
    const pairingData = await securityManager.initiatePairing(desktopName)
    return pairingData
  })

  ipcMain.handle('pairing:cancel', async () => {
    securityManager.cancelPairing()
  })

  ipcMain.handle('pairing:connectToDevice', async (_event, androidIp: string, androidPort: number) => {
    return await securityManager.connectToDevice(androidIp, androidPort)
  })

  // Note: Pairing completion is triggered by Android app via API
  // The SecurityManager handles it, then DeviceManager adds the device

  // ===== Settings =====

  ipcMain.handle('settings:getAll', async () => {
    if (!store) return {}
    return {
      autoConnect: store.get('settings.autoConnect', true),
      showNotifications: store.get('settings.showNotifications', true),
      startOnBoot: store.get('settings.startOnBoot', false),
      discoveryPort: store.get('settings.discoveryPort', 18445),
      pairingPort: store.get('settings.pairingPort', 18443),
      tunnelHost: store.get('settings.tunnelHost', 'brjk01agv.localto.net'),
      tunnelPort: store.get('settings.tunnelPort', 7580),
    }
  })

  ipcMain.handle('settings:set', async (_event, key: string, value: any) => {
    if (!store) return
    store.set(`settings.${key}`, value)
  })

  ipcMain.handle('settings:setStartOnBoot', async (_event, enabled: boolean) => {
    if (store) {
      store.set('settings.startOnBoot', enabled)
    }
    app.setLoginItemSettings({
      openAtLogin: enabled
    })
  })

  // ===== SMS Service =====

  ipcMain.handle('sms:getConversations', async (_event, deviceId: string, params?: any) => {
    return await smsService.getConversations(deviceId, params)
  })

  ipcMain.handle('sms:getMessages', async (_event, deviceId: string, threadId: string, params?: any) => {
    return await smsService.getMessages(deviceId, threadId, params)
  })

  ipcMain.handle('sms:send', async (_event, deviceId: string, phone: string, message: string) => {
    return await smsService.sendMessage(deviceId, phone, message)
  })

  ipcMain.handle('sms:delete', async (_event, deviceId: string, messageId: string) => {
    await smsService.deleteMessage(deviceId, messageId)
  })

  ipcMain.handle('sms:markAsRead', async (_event, deviceId: string, messageId: string) => {
    await smsService.markAsRead(deviceId, messageId)
  })

  // ===== Contact Service =====

  ipcMain.handle('contacts:getAll', async (_event, deviceId: string, params?: any) => {
    return await contactService.getAllContacts(deviceId, params)
  })

  ipcMain.handle('contacts:getById', async (_event, deviceId: string, contactId: string) => {
    return await contactService.getContact(deviceId, contactId)
  })

  ipcMain.handle('contacts:create', async (_event, deviceId: string, contact: any) => {
    return await contactService.createContact(deviceId, contact)
  })

  ipcMain.handle('contacts:update', async (_event, deviceId: string, contactId: string, contact: any) => {
    await contactService.updateContact(deviceId, contactId, contact)
  })

  ipcMain.handle('contacts:delete', async (_event, deviceId: string, contactId: string) => {
    await contactService.deleteContact(deviceId, contactId)
  })

  ipcMain.handle('contacts:sync', async (_event, deviceId: string) => {
    return await contactService.syncContacts(deviceId)
  })

  // ===== App Service =====

  ipcMain.handle('apps:getInstalled', async (_event, deviceId: string, includeSystem?: boolean) => {
    return await appService.getInstalledApps(deviceId, includeSystem)
  })

  ipcMain.handle('apps:getDetails', async (_event, deviceId: string, packageName: string) => {
    return await appService.getAppDetails(deviceId, packageName)
  })

  ipcMain.handle('apps:install', async (_event, deviceId: string, apkPath: string, progressChannel: string) => {
    return await appService.installApk(deviceId, apkPath, (progress) => {
      forwardEvent(progressChannel, progress)
    })
  })

  ipcMain.handle('apps:uninstall', async (_event, deviceId: string, packageName: string) => {
    await appService.uninstallApp(deviceId, packageName)
  })

  // ===== File Service =====

  ipcMain.handle('files:list', async (_event, deviceId: string, path: string, params?: any) => {
    return await fileService.listDirectory(deviceId, path, params)
  })

  ipcMain.handle('files:upload', async (_event, deviceId: string, localPath: string, remotePath: string, progressChannel: string) => {
    return await fileService.uploadFile(deviceId, localPath, remotePath, (progress) => {
      forwardEvent(progressChannel, progress)
    })
  })

  ipcMain.handle('files:download', async (_event, deviceId: string, remotePath: string, localPath: string, progressChannel: string) => {
    return await fileService.downloadFile(deviceId, remotePath, localPath, (progress) => {
      forwardEvent(progressChannel, progress)
    })
  })

  ipcMain.handle('files:delete', async (_event, deviceId: string, path: string, recursive?: boolean) => {
    await fileService.deleteFile(deviceId, path, recursive)
  })

  ipcMain.handle('files:mkdir', async (_event, deviceId: string, path: string) => {
    await fileService.createDirectory(deviceId, path)
  })

  ipcMain.handle('files:move', async (_event, deviceId: string, sourcePath: string, destPath: string) => {
    await fileService.moveFile(deviceId, sourcePath, destPath)
  })

  // ===== System =====

  ipcMain.handle('system:getDeviceInfo', async (_event, deviceId: string) => {
    return await deviceManager.getDeviceInfo(deviceId)
  })

  ipcMain.handle('system:getPermissions', async (_event, deviceId: string) => {
    return await deviceManager.getPermissions(deviceId)
  })

  ipcMain.handle('system:requestPermission', async (_event, deviceId: string, permissions: string[]) => {
    return await deviceManager.requestPermission(deviceId, permissions)
  })
}
