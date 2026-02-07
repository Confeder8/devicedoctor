/**
 * Shared types between main and renderer processes
 */

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

export interface Message {
  id: string
  threadId: string
  address: string
  body: string
  timestamp: number
  type: 'inbox' | 'sent' | 'draft'
  read: boolean
  isMms: boolean
}

export interface Contact {
  id: string
  displayName: string
  phoneNumbers: PhoneNumber[]
  emails: Email[]
  starred?: boolean
  lastUpdated?: number
}

export interface PhoneNumber {
  type: string
  number: string
  label?: string
}

export interface Email {
  type: string
  email: string
  label?: string
}

export interface AppInfo {
  packageName: string
  appName: string
  versionName: string
  versionCode: number
  icon: string
  size: number
  installTime: number
  updateTime: number
  isSystemApp: boolean
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  mimeType?: string
  modified: number
}
