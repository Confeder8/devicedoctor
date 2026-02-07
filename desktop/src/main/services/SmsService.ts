/**
 * SMS Service - Handles SMS operations
 */

import { CommunicationEngine } from '../modules/communication/CommunicationEngine'

export interface Conversation {
  threadId: string
  contactName: string
  phoneNumber: string
  lastMessage: string
  lastMessageTimestamp: number
  unreadCount: number
  messageCount: number
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

export class SmsService {
  private communicationEngine: CommunicationEngine

  constructor(communicationEngine: CommunicationEngine) {
    this.communicationEngine = communicationEngine
  }

  /**
   * Get all conversations
   */
  async getConversations(deviceId: string, params?: { limit?: number; offset?: number }): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/sms/conversations',
      'GET',
      params
    )
  }

  /**
   * Get messages in a thread
   */
  async getMessages(
    deviceId: string,
    threadId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      `/sms/messages/${threadId}`,
      'GET',
      params
    )
  }

  /**
   * Send SMS
   */
  async sendMessage(deviceId: string, phoneNumber: string, message: string): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/sms/send',
      'POST',
      {
        phoneNumber,
        message
      }
    )
  }

  /**
   * Delete message
   */
  async deleteMessage(deviceId: string, messageId: string): Promise<void> {
    await this.communicationEngine.sendRequest(
      deviceId,
      `/sms/message/${messageId}`,
      'DELETE'
    )
  }

  /**
   * Mark message as read
   */
  async markAsRead(deviceId: string, messageId: string): Promise<void> {
    await this.communicationEngine.sendRequest(
      deviceId,
      `/sms/message/${messageId}/read`,
      'PATCH'
    )
  }
}
