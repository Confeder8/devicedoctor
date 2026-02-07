/**
 * File Service - Handles file operations
 */

import { CommunicationEngine } from '../modules/communication/CommunicationEngine'

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  mimeType?: string
  modified: number
  permissions?: string
}

export class FileService {
  private communicationEngine: CommunicationEngine

  constructor(communicationEngine: CommunicationEngine) {
    this.communicationEngine = communicationEngine
  }

  /**
   * List directory contents
   */
  async listDirectory(
    deviceId: string,
    path: string,
    params?: { sortBy?: string; sortOrder?: string }
  ): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/files/list',
      'GET',
      { path, ...params }
    )
  }

  /**
   * Upload file
   */
  async uploadFile(
    deviceId: string,
    localPath: string,
    remotePath: string,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    await this.communicationEngine.uploadFile(
      deviceId,
      localPath,
      remotePath,
      onProgress
    )

    return { success: true, remotePath }
  }

  /**
   * Download file
   */
  async downloadFile(
    deviceId: string,
    remotePath: string,
    localPath: string,
    onProgress?: (progress: number) => void
  ): Promise<any> {
    await this.communicationEngine.downloadFile(
      deviceId,
      remotePath,
      localPath,
      onProgress
    )

    return { success: true, localPath }
  }

  /**
   * Delete file or directory
   */
  async deleteFile(deviceId: string, path: string, recursive: boolean = false): Promise<void> {
    await this.communicationEngine.sendRequest(
      deviceId,
      '/files/delete',
      'DELETE',
      { path, recursive }
    )
  }

  /**
   * Create directory
   */
  async createDirectory(deviceId: string, path: string): Promise<void> {
    await this.communicationEngine.sendRequest(
      deviceId,
      '/files/mkdir',
      'POST',
      { path }
    )
  }

  /**
   * Move/rename file
   */
  async moveFile(deviceId: string, sourcePath: string, destinationPath: string): Promise<void> {
    await this.communicationEngine.sendRequest(
      deviceId,
      '/files/move',
      'POST',
      { sourcePath, destinationPath }
    )
  }
}
