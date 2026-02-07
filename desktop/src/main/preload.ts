/**
 * Preload Script - Bridge between Main and Renderer processes
 *
 * Exposes secure APIs to the renderer process via contextBridge
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Define API interface
export interface ElectronAPI {
  // Device Management
  device: {
    getAll: () => Promise<any[]>
    getById: (deviceId: string) => Promise<any>
    connect: (deviceId: string) => Promise<any>
    disconnect: (deviceId: string) => Promise<void>
    remove: (deviceId: string) => Promise<void>
    onDeviceFound: (callback: (device: any) => void) => () => void
    onDeviceConnected: (callback: (device: any) => void) => () => void
    onDeviceDisconnected: (callback: (deviceId: string) => void) => () => void
  }

  // Pairing
  pairing: {
    start: (desktopName: string) => Promise<{ qrCode: string; pin: string }>
    cancel: () => Promise<void>
    onPairingComplete: (callback: (device: any) => void) => () => void
  }

  // Settings
  settings: {
    getAll: () => Promise<{ autoConnect: boolean; showNotifications: boolean; startOnBoot: boolean }>
    set: (key: string, value: any) => Promise<void>
    setStartOnBoot: (enabled: boolean) => Promise<void>
  }

  // SMS
  sms: {
    getConversations: (deviceId: string, params?: any) => Promise<any>
    getMessages: (deviceId: string, threadId: string, params?: any) => Promise<any>
    send: (deviceId: string, phone: string, message: string) => Promise<any>
    delete: (deviceId: string, messageId: string) => Promise<void>
    markAsRead: (deviceId: string, messageId: string) => Promise<void>
    onNewMessage: (callback: (message: any) => void) => () => void
  }

  // Contacts
  contacts: {
    getAll: (deviceId: string, params?: any) => Promise<any>
    getById: (deviceId: string, contactId: string) => Promise<any>
    create: (deviceId: string, contact: any) => Promise<any>
    update: (deviceId: string, contactId: string, contact: any) => Promise<void>
    delete: (deviceId: string, contactId: string) => Promise<void>
    sync: (deviceId: string) => Promise<any>
    onContactChanged: (callback: (event: any) => void) => () => void
  }

  // Apps
  apps: {
    getInstalled: (deviceId: string, includeSystem?: boolean) => Promise<any>
    getDetails: (deviceId: string, packageName: string) => Promise<any>
    install: (deviceId: string, apkPath: string, onProgress: (progress: number) => void) => Promise<any>
    uninstall: (deviceId: string, packageName: string) => Promise<void>
    onAppChanged: (callback: (event: any) => void) => () => void
  }

  // Files
  files: {
    list: (deviceId: string, path: string, params?: any) => Promise<any>
    upload: (deviceId: string, localPath: string, remotePath: string, onProgress: (progress: number) => void) => Promise<any>
    download: (deviceId: string, remotePath: string, localPath: string, onProgress: (progress: number) => void) => Promise<any>
    delete: (deviceId: string, path: string, recursive?: boolean) => Promise<void>
    mkdir: (deviceId: string, path: string) => Promise<void>
    move: (deviceId: string, sourcePath: string, destPath: string) => Promise<void>
    onFileChanged: (callback: (event: any) => void) => () => void
  }

  // System
  system: {
    getDeviceInfo: (deviceId: string) => Promise<any>
    getPermissions: (deviceId: string) => Promise<any>
    requestPermission: (deviceId: string, permissions: string[]) => Promise<any>
    onDeviceStatus: (callback: (status: any) => void) => () => void
  }

  // Window controls
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
  }

  // App
  app: {
    getVersion: () => Promise<string>
    getPlatform: () => Promise<string>
  }
}

// Helper to create event listener cleaner
const createEventListener = (channel: string, callback: Function) => {
  const subscription = (_event: IpcRendererEvent, ...args: any[]) => callback(...args)
  ipcRenderer.on(channel, subscription)
  return () => ipcRenderer.removeListener(channel, subscription)
}

// Expose API to renderer
const electronAPI: ElectronAPI = {
  device: {
    getAll: () => ipcRenderer.invoke('device:getAll'),
    getById: (deviceId) => ipcRenderer.invoke('device:getById', deviceId),
    connect: (deviceId) => ipcRenderer.invoke('device:connect', deviceId),
    disconnect: (deviceId) => ipcRenderer.invoke('device:disconnect', deviceId),
    remove: (deviceId) => ipcRenderer.invoke('device:remove', deviceId),
    onDeviceFound: (callback) => createEventListener('device:found', callback),
    onDeviceConnected: (callback) => createEventListener('device:connected', callback),
    onDeviceDisconnected: (callback) => createEventListener('device:disconnected', callback)
  },

  pairing: {
    start: (desktopName) => ipcRenderer.invoke('pairing:start', desktopName),
    cancel: () => ipcRenderer.invoke('pairing:cancel'),
    onPairingComplete: (callback) => createEventListener('pairing:complete', callback)
  },

  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    setStartOnBoot: (enabled) => ipcRenderer.invoke('settings:setStartOnBoot', enabled)
  },

  sms: {
    getConversations: (deviceId, params) => ipcRenderer.invoke('sms:getConversations', deviceId, params),
    getMessages: (deviceId, threadId, params) => ipcRenderer.invoke('sms:getMessages', deviceId, threadId, params),
    send: (deviceId, phone, message) => ipcRenderer.invoke('sms:send', deviceId, phone, message),
    delete: (deviceId, messageId) => ipcRenderer.invoke('sms:delete', deviceId, messageId),
    markAsRead: (deviceId, messageId) => ipcRenderer.invoke('sms:markAsRead', deviceId, messageId),
    onNewMessage: (callback) => createEventListener('sms:newMessage', callback)
  },

  contacts: {
    getAll: (deviceId, params) => ipcRenderer.invoke('contacts:getAll', deviceId, params),
    getById: (deviceId, contactId) => ipcRenderer.invoke('contacts:getById', deviceId, contactId),
    create: (deviceId, contact) => ipcRenderer.invoke('contacts:create', deviceId, contact),
    update: (deviceId, contactId, contact) => ipcRenderer.invoke('contacts:update', deviceId, contactId, contact),
    delete: (deviceId, contactId) => ipcRenderer.invoke('contacts:delete', deviceId, contactId),
    sync: (deviceId) => ipcRenderer.invoke('contacts:sync', deviceId),
    onContactChanged: (callback) => createEventListener('contacts:changed', callback)
  },

  apps: {
    getInstalled: (deviceId, includeSystem) => ipcRenderer.invoke('apps:getInstalled', deviceId, includeSystem),
    getDetails: (deviceId, packageName) => ipcRenderer.invoke('apps:getDetails', deviceId, packageName),
    install: (deviceId, apkPath, onProgress) => {
      const channel = `apps:install:progress:${Date.now()}`
      const cleanup = createEventListener(channel, onProgress)
      return ipcRenderer.invoke('apps:install', deviceId, apkPath, channel).finally(cleanup)
    },
    uninstall: (deviceId, packageName) => ipcRenderer.invoke('apps:uninstall', deviceId, packageName),
    onAppChanged: (callback) => createEventListener('apps:changed', callback)
  },

  files: {
    list: (deviceId, path, params) => ipcRenderer.invoke('files:list', deviceId, path, params),
    upload: (deviceId, localPath, remotePath, onProgress) => {
      const channel = `files:upload:progress:${Date.now()}`
      const cleanup = createEventListener(channel, onProgress)
      return ipcRenderer.invoke('files:upload', deviceId, localPath, remotePath, channel).finally(cleanup)
    },
    download: (deviceId, remotePath, localPath, onProgress) => {
      const channel = `files:download:progress:${Date.now()}`
      const cleanup = createEventListener(channel, onProgress)
      return ipcRenderer.invoke('files:download', deviceId, remotePath, localPath, channel).finally(cleanup)
    },
    delete: (deviceId, path, recursive) => ipcRenderer.invoke('files:delete', deviceId, path, recursive),
    mkdir: (deviceId, path) => ipcRenderer.invoke('files:mkdir', deviceId, path),
    move: (deviceId, sourcePath, destPath) => ipcRenderer.invoke('files:move', deviceId, sourcePath, destPath),
    onFileChanged: (callback) => createEventListener('files:changed', callback)
  },

  system: {
    getDeviceInfo: (deviceId) => ipcRenderer.invoke('system:getDeviceInfo', deviceId),
    getPermissions: (deviceId) => ipcRenderer.invoke('system:getPermissions', deviceId),
    requestPermission: (deviceId, permissions) => ipcRenderer.invoke('system:requestPermission', deviceId, permissions),
    onDeviceStatus: (callback) => createEventListener('system:deviceStatus', callback)
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },

  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    getPlatform: () => ipcRenderer.invoke('app:platform')
  }
}

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Type declaration for window object
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
