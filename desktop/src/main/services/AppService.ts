/**
 * App Service - Handles app management operations
 */

import { CommunicationEngine } from '../modules/communication/CommunicationEngine'

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
  permissions: string[]
}

export class AppService {
  private communicationEngine: CommunicationEngine

  constructor(communicationEngine: CommunicationEngine) {
    this.communicationEngine = communicationEngine
  }

  /**
   * Get installed apps
   */
  async getInstalledApps(deviceId: string, includeSystem: boolean = false): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/apps/installed',
      'GET',
      { includeSystem }
    )
  }

  /**
   * Get app details
   */
  async getAppDetails(deviceId: string, packageName: string): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      `/apps/${packageName}`,
      'GET'
    )
  }

  /**
   * Install APK
   */
  async installApk(
    deviceId: string,
    apkPath: string,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    // Use file service to upload APK
    const remotePath = `/sdcard/Download/${require('path').basename(apkPath)}`

    await this.communicationEngine.uploadFile(
      deviceId,
      apkPath,
      remotePath,
      onProgress
    )

    // Trigger installation
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/apps/install',
      'POST',
      { apkPath: remotePath }
    )
  }

  /**
   * Uninstall app
   */
  async uninstallApp(deviceId: string, packageName: string): Promise<void> {
    await this.communicationEngine.sendRequest(
      deviceId,
      `/apps/${packageName}`,
      'DELETE'
    )
  }
}
