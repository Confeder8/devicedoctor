/**
 * Contact Service - Handles contact operations
 */

import { CommunicationEngine } from '../modules/communication/CommunicationEngine'

export interface Contact {
  id: string
  displayName: string
  givenName?: string
  familyName?: string
  phoneNumbers: PhoneNumber[]
  emails: Email[]
  addresses?: Address[]
  organization?: string
  notes?: string
  photoUri?: string
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

export interface Address {
  type: string
  formattedAddress: string
  street?: string
  city?: string
  region?: string
  postCode?: string
  country?: string
}

export class ContactService {
  private communicationEngine: CommunicationEngine

  constructor(communicationEngine: CommunicationEngine) {
    this.communicationEngine = communicationEngine
  }

  /**
   * Get all contacts
   */
  async getAllContacts(
    deviceId: string,
    params?: { limit?: number; offset?: number; search?: string }
  ): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/contacts/all',
      'GET',
      params
    )
  }

  /**
   * Get single contact
   */
  async getContact(deviceId: string, contactId: string): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      `/contacts/${contactId}`,
      'GET'
    )
  }

  /**
   * Create contact
   */
  async createContact(deviceId: string, contact: Partial<Contact>): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/contacts/create',
      'POST',
      contact
    )
  }

  /**
   * Update contact
   */
  async updateContact(deviceId: string, contactId: string, contact: Partial<Contact>): Promise<void> {
    await this.communicationEngine.sendRequest(
      deviceId,
      `/contacts/${contactId}`,
      'PUT',
      contact
    )
  }

  /**
   * Delete contact
   */
  async deleteContact(deviceId: string, contactId: string): Promise<void> {
    await this.communicationEngine.sendRequest(
      deviceId,
      `/contacts/${contactId}`,
      'DELETE'
    )
  }

  /**
   * Sync contacts
   */
  async syncContacts(deviceId: string): Promise<any> {
    return await this.communicationEngine.sendRequest(
      deviceId,
      '/contacts/sync',
      'POST'
    )
  }
}
