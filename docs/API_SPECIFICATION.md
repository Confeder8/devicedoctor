# DeviceDoctor - API Specification

## 📋 Table of Contents
1. [Protocol Overview](#protocol-overview)
2. [Base Communication Format](#base-communication-format)
3. [REST API Endpoints](#rest-api-endpoints)
4. [WebSocket Events](#websocket-events)
5. [Bluetooth Protocol](#bluetooth-protocol)
6. [Error Handling](#error-handling)
7. [Request/Response Examples](#requestresponse-examples)

---

## Protocol Overview

### Communication Channels

#### 1. Wi-Fi (Primary)
- **Protocol**: REST API (HTTPS) + WebSocket (WSS)
- **Port**: 8443 (HTTPS), 8444 (WSS)
- **Discovery**: mDNS service type `_devicedoctor._tcp.local.`
- **Format**: JSON over HTTPS
- **Encryption**: TLS 1.3 + AES-256 application layer

#### 2. Bluetooth (Secondary)
- **Protocol**: RFCOMM (Serial Port Profile)
- **UUID**: `00001101-0000-1000-8000-00805F9B34FB`
- **Fallback**: BLE (GATT) with custom service
- **BLE UUID**: `0000dd00-0000-1000-8000-00805F9B34FB`
- **Format**: Binary protocol with JSON payloads
- **Encryption**: AES-256 (no TLS)

#### 3. Internet/OTA (Optional)
- **Protocol**: HTTPS + WSS via relay server
- **Relay**: `relay.devicedoctor.app`
- **Alternative**: WebRTC peer-to-peer
- **Format**: Same as Wi-Fi, tunneled

---

## Base Communication Format

All requests and responses follow this structure:

### Request Format

```json
{
  "version": "1.0",
  "sessionId": "uuid-v4-session-identifier",
  "requestId": "uuid-v4-request-identifier",
  "timestamp": 1704099600000,
  "endpoint": "/api/sms/list",
  "method": "GET",
  "params": {
    "key": "value"
  },
  "body": {
    "data": "payload"
  },
  "signature": "hmac-sha256-signature"
}
```

### Response Format

```json
{
  "version": "1.0",
  "requestId": "uuid-v4-request-identifier",
  "timestamp": 1704099601000,
  "status": "success",
  "code": 200,
  "data": {
    "result": "data"
  },
  "error": null,
  "signature": "hmac-sha256-signature"
}
```

### Error Response Format

```json
{
  "version": "1.0",
  "requestId": "uuid-v4-request-identifier",
  "timestamp": 1704099601000,
  "status": "error",
  "code": 403,
  "data": null,
  "error": {
    "type": "PermissionDenied",
    "message": "READ_SMS permission not granted",
    "details": {
      "permission": "android.permission.READ_SMS",
      "granted": false
    }
  },
  "signature": "hmac-sha256-signature"
}
```

---

## REST API Endpoints

Base URL: `https://<device-ip>:8443/api/v1`

### Authentication & Session Management

#### 1. Initiate Pairing
```http
POST /pairing/initiate
Content-Type: application/json

Request:
{
  "desktopName": "John's Laptop",
  "desktopPublicKey": "base64-encoded-rsa-public-key",
  "pin": "123456"
}

Response:
{
  "status": "success",
  "data": {
    "androidPublicKey": "base64-encoded-rsa-public-key",
    "deviceId": "unique-android-device-id",
    "deviceName": "Samsung Galaxy S21",
    "androidVersion": "13",
    "capabilities": ["sms", "contacts", "files", "apps"]
  }
}
```

#### 2. Complete Pairing (Key Exchange)
```http
POST /pairing/complete
Content-Type: application/json

Request:
{
  "deviceId": "unique-android-device-id",
  "sharedSecretHash": "sha256-hash-of-derived-secret"
}

Response:
{
  "status": "success",
  "data": {
    "sessionId": "uuid-v4-session-id",
    "sessionKey": "encrypted-aes-session-key",
    "expiresIn": 3600000
  }
}
```

#### 3. Validate Session
```http
GET /session/validate
Headers:
  X-Session-Id: uuid-v4-session-id
  X-Session-Signature: hmac-signature

Response:
{
  "status": "success",
  "data": {
    "valid": true,
    "expiresIn": 2400000,
    "permissions": {
      "sms": true,
      "contacts": true,
      "files": true,
      "apps": true
    }
  }
}
```

#### 4. Revoke Session
```http
DELETE /session/revoke
Headers:
  X-Session-Id: uuid-v4-session-id

Response:
{
  "status": "success",
  "data": {
    "revoked": true
  }
}
```

---

### SMS Management

#### 1. List Conversations
```http
GET /sms/conversations
Headers:
  X-Session-Id: uuid-v4-session-id
Params:
  limit: 50 (optional)
  offset: 0 (optional)

Response:
{
  "status": "success",
  "data": {
    "conversations": [
      {
        "threadId": "123",
        "contactName": "John Doe",
        "phoneNumber": "+1234567890",
        "lastMessage": "Hey, how are you?",
        "lastMessageTimestamp": 1704099600000,
        "unreadCount": 2,
        "messageCount": 45
      }
    ],
    "total": 150,
    "hasMore": true
  }
}
```

#### 2. Get Messages in Thread
```http
GET /sms/messages/:threadId
Headers:
  X-Session-Id: uuid-v4-session-id
Params:
  limit: 50 (optional)
  offset: 0 (optional)

Response:
{
  "status": "success",
  "data": {
    "messages": [
      {
        "id": "456",
        "threadId": "123",
        "address": "+1234567890",
        "body": "Hey, how are you?",
        "timestamp": 1704099600000,
        "type": "inbox",
        "read": true,
        "isMms": false
      }
    ],
    "total": 45,
    "hasMore": false
  }
}
```

#### 3. Send SMS
```http
POST /sms/send
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: application/json

Request:
{
  "phoneNumber": "+1234567890",
  "message": "Hello from desktop!",
  "threadId": "123" (optional)
}

Response:
{
  "status": "success",
  "data": {
    "messageId": "789",
    "threadId": "123",
    "sentTimestamp": 1704099650000,
    "deliveryStatus": "sent"
  }
}
```

#### 4. Delete Message
```http
DELETE /sms/message/:messageId
Headers:
  X-Session-Id: uuid-v4-session-id

Response:
{
  "status": "success",
  "data": {
    "deleted": true
  }
}
```

#### 5. Mark as Read
```http
PATCH /sms/message/:messageId/read
Headers:
  X-Session-Id: uuid-v4-session-id

Response:
{
  "status": "success",
  "data": {
    "updated": true
  }
}
```

---

### Contacts Management

#### 1. List All Contacts
```http
GET /contacts/all
Headers:
  X-Session-Id: uuid-v4-session-id
Params:
  limit: 100 (optional)
  offset: 0 (optional)
  search: "john" (optional)

Response:
{
  "status": "success",
  "data": {
    "contacts": [
      {
        "id": "1001",
        "displayName": "John Doe",
        "phoneNumbers": [
          {
            "type": "mobile",
            "number": "+1234567890",
            "label": "Mobile"
          }
        ],
        "emails": [
          {
            "type": "work",
            "email": "john@example.com"
          }
        ],
        "photoUri": "content://contacts/photo/1001",
        "starred": false,
        "lastUpdated": 1704099600000
      }
    ],
    "total": 500,
    "hasMore": true
  }
}
```

#### 2. Get Single Contact
```http
GET /contacts/:contactId
Headers:
  X-Session-Id: uuid-v4-session-id

Response:
{
  "status": "success",
  "data": {
    "contact": {
      "id": "1001",
      "displayName": "John Doe",
      "givenName": "John",
      "familyName": "Doe",
      "phoneNumbers": [...],
      "emails": [...],
      "addresses": [...],
      "organization": "Acme Corp",
      "notes": "Met at conference",
      "photoUri": "content://contacts/photo/1001"
    }
  }
}
```

#### 3. Create Contact
```http
POST /contacts/create
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: application/json

Request:
{
  "displayName": "Jane Smith",
  "givenName": "Jane",
  "familyName": "Smith",
  "phoneNumbers": [
    {
      "type": "mobile",
      "number": "+1987654321"
    }
  ],
  "emails": [
    {
      "type": "personal",
      "email": "jane@example.com"
    }
  ]
}

Response:
{
  "status": "success",
  "data": {
    "contactId": "1002",
    "created": true
  }
}
```

#### 4. Update Contact
```http
PUT /contacts/:contactId
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: application/json

Request:
{
  "displayName": "Jane Doe Smith",
  "phoneNumbers": [
    {
      "type": "mobile",
      "number": "+1987654321"
    }
  ]
}

Response:
{
  "status": "success",
  "data": {
    "updated": true,
    "modifiedFields": ["displayName"]
  }
}
```

#### 5. Delete Contact
```http
DELETE /contacts/:contactId
Headers:
  X-Session-Id: uuid-v4-session-id

Response:
{
  "status": "success",
  "data": {
    "deleted": true
  }
}
```

---

### App Management

#### 1. List Installed Apps
```http
GET /apps/installed
Headers:
  X-Session-Id: uuid-v4-session-id
Params:
  includeSystem: false (optional)

Response:
{
  "status": "success",
  "data": {
    "apps": [
      {
        "packageName": "com.example.app",
        "appName": "My App",
        "versionName": "1.2.3",
        "versionCode": 123,
        "icon": "base64-encoded-icon-data",
        "size": 15728640,
        "installTime": 1704099600000,
        "updateTime": 1704099600000,
        "isSystemApp": false,
        "permissions": ["INTERNET", "CAMERA"]
      }
    ],
    "total": 120
  }
}
```

#### 2. Get App Details
```http
GET /apps/:packageName
Headers:
  X-Session-Id: uuid-v4-session-id

Response:
{
  "status": "success",
  "data": {
    "app": {
      "packageName": "com.example.app",
      "appName": "My App",
      "versionName": "1.2.3",
      "versionCode": 123,
      "icon": "base64-encoded-icon-data",
      "size": 15728640,
      "dataSize": 5242880,
      "cacheSize": 1048576,
      "installTime": 1704099600000,
      "updateTime": 1704099600000,
      "targetSdk": 33,
      "minSdk": 26,
      "permissions": [
        {
          "name": "INTERNET",
          "granted": true
        }
      ],
      "activities": ["MainActivity", "SettingsActivity"]
    }
  }
}
```

#### 3. Install APK
```http
POST /apps/install
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: multipart/form-data

Request:
{
  "apkFile": <binary-data>,
  "fileName": "app-release.apk",
  "fileSize": 15728640
}

Response:
{
  "status": "success",
  "data": {
    "installId": "install-uuid",
    "status": "installing",
    "progress": 0
  }
}

// Follow-up status check
GET /apps/install/:installId/status

Response:
{
  "status": "success",
  "data": {
    "installId": "install-uuid",
    "status": "completed",
    "progress": 100,
    "packageName": "com.example.app"
  }
}
```

#### 4. Uninstall App
```http
DELETE /apps/:packageName
Headers:
  X-Session-Id: uuid-v4-session-id

Response:
{
  "status": "success",
  "data": {
    "uninstalled": true
  }
}
```

---

### File Management

#### 1. List Directory
```http
GET /files/list
Headers:
  X-Session-Id: uuid-v4-session-id
Params:
  path: "/sdcard/Download" (required)
  sortBy: "name" | "size" | "modified" (optional)
  sortOrder: "asc" | "desc" (optional)

Response:
{
  "status": "success",
  "data": {
    "path": "/sdcard/Download",
    "entries": [
      {
        "name": "document.pdf",
        "path": "/sdcard/Download/document.pdf",
        "type": "file",
        "size": 1048576,
        "mimeType": "application/pdf",
        "modified": 1704099600000,
        "permissions": "rw-r--r--"
      },
      {
        "name": "Photos",
        "path": "/sdcard/Download/Photos",
        "type": "directory",
        "size": 0,
        "modified": 1704099500000
      }
    ],
    "totalSize": 104857600,
    "itemCount": 25
  }
}
```

#### 2. Upload File (Chunked)
```http
// Step 1: Initialize upload
POST /files/upload/init
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: application/json

Request:
{
  "fileName": "video.mp4",
  "fileSize": 104857600,
  "destinationPath": "/sdcard/Download/video.mp4",
  "mimeType": "video/mp4",
  "chunkSize": 1048576,
  "totalChunks": 100,
  "checksum": "sha256-hash-of-entire-file"
}

Response:
{
  "status": "success",
  "data": {
    "uploadId": "upload-uuid",
    "chunkSize": 1048576,
    "resumable": true
  }
}

// Step 2: Upload chunks
POST /files/upload/chunk
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: multipart/form-data

Request:
{
  "uploadId": "upload-uuid",
  "chunkIndex": 0,
  "chunkData": <binary-chunk-data>,
  "chunkChecksum": "sha256-hash-of-chunk"
}

Response:
{
  "status": "success",
  "data": {
    "received": true,
    "progress": 1
  }
}

// Step 3: Complete upload
POST /files/upload/complete
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: application/json

Request:
{
  "uploadId": "upload-uuid"
}

Response:
{
  "status": "success",
  "data": {
    "completed": true,
    "filePath": "/sdcard/Download/video.mp4",
    "fileSize": 104857600,
    "checksum": "sha256-hash-verified"
  }
}
```

#### 3. Download File (Chunked)
```http
GET /files/download
Headers:
  X-Session-Id: uuid-v4-session-id
Params:
  path: "/sdcard/Download/document.pdf" (required)
  chunkIndex: 0 (optional, for resumable download)
  chunkSize: 1048576 (optional)

Response:
Content-Type: application/octet-stream
Content-Length: 1048576
X-File-Size: 5242880
X-Total-Chunks: 5
X-Chunk-Index: 0
X-Checksum: sha256-hash

<binary-data>
```

#### 4. Delete File/Directory
```http
DELETE /files/delete
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: application/json

Request:
{
  "path": "/sdcard/Download/old-file.pdf",
  "recursive": false
}

Response:
{
  "status": "success",
  "data": {
    "deleted": true
  }
}
```

#### 5. Create Directory
```http
POST /files/mkdir
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: application/json

Request:
{
  "path": "/sdcard/Download/NewFolder"
}

Response:
{
  "status": "success",
  "data": {
    "created": true,
    "path": "/sdcard/Download/NewFolder"
  }
}
```

#### 6. Rename/Move File
```http
POST /files/move
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: application/json

Request:
{
  "sourcePath": "/sdcard/Download/old-name.pdf",
  "destinationPath": "/sdcard/Download/new-name.pdf"
}

Response:
{
  "status": "success",
  "data": {
    "moved": true
  }
}
```

---

### System & Device Info

#### 1. Get Device Info
```http
GET /device/info
Headers:
  X-Session-Id: uuid-v4-session-id

Response:
{
  "status": "success",
  "data": {
    "deviceId": "unique-device-id",
    "deviceName": "Samsung Galaxy S21",
    "manufacturer": "Samsung",
    "model": "SM-G991B",
    "androidVersion": "13",
    "sdkVersion": 33,
    "batteryLevel": 85,
    "batteryCharging": true,
    "storageTotal": 128000000000,
    "storageAvailable": 45000000000,
    "ramTotal": 8000000000,
    "ramAvailable": 4500000000,
    "networkType": "WiFi",
    "ipAddress": "192.168.1.100"
  }
}
```

#### 2. Get Permissions Status
```http
GET /device/permissions
Headers:
  X-Session-Id: uuid-v4-session-id

Response:
{
  "status": "success",
  "data": {
    "permissions": [
      {
        "name": "READ_SMS",
        "granted": true
      },
      {
        "name": "SEND_SMS",
        "granted": true
      },
      {
        "name": "READ_CONTACTS",
        "granted": true
      },
      {
        "name": "WRITE_CONTACTS",
        "granted": true
      },
      {
        "name": "READ_EXTERNAL_STORAGE",
        "granted": false
      }
    ]
  }
}
```

#### 3. Request Permission
```http
POST /device/permissions/request
Headers:
  X-Session-Id: uuid-v4-session-id
Content-Type: application/json

Request:
{
  "permissions": ["READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"]
}

Response:
{
  "status": "success",
  "data": {
    "requested": true,
    "message": "User will be prompted on device"
  }
}
```

---

## WebSocket Events

WebSocket URL: `wss://<device-ip>:8444/ws`

### Connection Handshake

```javascript
// Client connects
ws.connect("wss://192.168.1.100:8444/ws")

// Send authentication
ws.send({
  "type": "auth",
  "sessionId": "uuid-v4-session-id",
  "signature": "hmac-signature"
})

// Server responds
{
  "type": "auth_response",
  "status": "authenticated",
  "capabilities": ["realtime_sms", "realtime_notifications"]
}
```

### Event Types

#### 1. Incoming SMS
```json
{
  "type": "sms_received",
  "timestamp": 1704099600000,
  "data": {
    "messageId": "12345",
    "threadId": "123",
    "address": "+1234567890",
    "body": "New message from phone",
    "timestamp": 1704099600000,
    "contactName": "John Doe"
  }
}
```

#### 2. SMS Sent
```json
{
  "type": "sms_sent",
  "timestamp": 1704099650000,
  "data": {
    "messageId": "12346",
    "threadId": "123",
    "address": "+1234567890",
    "status": "delivered"
  }
}
```

#### 3. Contact Modified
```json
{
  "type": "contact_changed",
  "timestamp": 1704099700000,
  "data": {
    "contactId": "1001",
    "action": "updated",
    "fields": ["phoneNumbers", "emails"]
  }
}
```

#### 4. App Installed/Uninstalled
```json
{
  "type": "app_changed",
  "timestamp": 1704099800000,
  "data": {
    "packageName": "com.example.newapp",
    "action": "installed",
    "appName": "New App"
  }
}
```

#### 5. File System Change
```json
{
  "type": "file_changed",
  "timestamp": 1704099900000,
  "data": {
    "path": "/sdcard/Download/new-file.pdf",
    "action": "created",
    "size": 1048576
  }
}
```

#### 6. Device Status Update
```json
{
  "type": "device_status",
  "timestamp": 1704100000000,
  "data": {
    "batteryLevel": 80,
    "batteryCharging": false,
    "storageAvailable": 44500000000
  }
}
```

#### 7. Connection Status
```json
{
  "type": "connection_status",
  "timestamp": 1704100100000,
  "data": {
    "status": "connected",
    "latency": 25,
    "signalStrength": "excellent"
  }
}
```

#### 8. Error Event
```json
{
  "type": "error",
  "timestamp": 1704100200000,
  "data": {
    "errorType": "PermissionDenied",
    "message": "READ_SMS permission revoked by user",
    "severity": "high"
  }
}
```

---

## Bluetooth Protocol

### Protocol Structure

Bluetooth uses a binary framing protocol with JSON payloads:

```
┌──────────────────────────────────────────────────┐
│ Frame Format                                     │
├────────┬─────────────────────────────────────────┤
│ Byte   │ Description                             │
├────────┼─────────────────────────────────────────┤
│ 0-1    │ Magic bytes: 0xDD 0x01                  │
│ 2-3    │ Protocol version: 0x00 0x01             │
│ 4-7    │ Payload length (uint32, big-endian)     │
│ 8-11   │ Checksum (CRC32 of payload)             │
│ 12-15  │ Frame sequence number (uint32)          │
│ 16-47  │ Session ID (32 bytes)                   │
│ 48-N   │ Encrypted JSON payload                  │
└────────┴─────────────────────────────────────────┘
```

### Bluetooth Commands

Commands use the same JSON format as REST API, but sent over Bluetooth:

```json
{
  "command": "sms/list",
  "params": {
    "limit": 20
  }
}
```

Response:
```json
{
  "status": "success",
  "data": { /* ... */ }
}
```

### BLE GATT Service (Fallback)

**Service UUID**: `0000dd00-0000-1000-8000-00805F9B34FB`

**Characteristics:**
- **Command** (Write): `0000dd01-0000-1000-8000-00805F9B34FB`
- **Response** (Read + Notify): `0000dd02-0000-1000-8000-00805F9B34FB`
- **Status** (Notify): `0000dd03-0000-1000-8000-00805F9B34FB`

---

## Error Handling

### Error Codes

| Code | Type                  | Description                              |
|------|-----------------------|------------------------------------------|
| 200  | Success               | Request completed successfully           |
| 400  | BadRequest            | Invalid request format                   |
| 401  | Unauthorized          | Invalid or expired session               |
| 403  | PermissionDenied      | Android permission not granted           |
| 404  | NotFound              | Resource not found                       |
| 409  | Conflict              | Resource conflict (e.g., duplicate)      |
| 429  | TooManyRequests       | Rate limit exceeded                      |
| 500  | InternalServerError   | Unexpected error on Android              |
| 503  | ServiceUnavailable    | Service temporarily unavailable          |

### Error Response Examples

#### Permission Denied
```json
{
  "status": "error",
  "code": 403,
  "error": {
    "type": "PermissionDenied",
    "message": "READ_SMS permission not granted",
    "details": {
      "permission": "android.permission.READ_SMS",
      "granted": false,
      "canRequest": true
    },
    "actionable": true,
    "suggestedAction": "Request permission from user"
  }
}
```

#### Session Expired
```json
{
  "status": "error",
  "code": 401,
  "error": {
    "type": "Unauthorized",
    "message": "Session expired",
    "details": {
      "sessionId": "uuid-v4",
      "expiredAt": 1704099600000
    },
    "actionable": true,
    "suggestedAction": "Re-authenticate"
  }
}
```

#### Rate Limit
```json
{
  "status": "error",
  "code": 429,
  "error": {
    "type": "TooManyRequests",
    "message": "Rate limit exceeded",
    "details": {
      "limit": 100,
      "window": 60000,
      "retryAfter": 15000
    }
  }
}
```

---

## Request/Response Examples

### Complete Example: Send SMS

#### 1. Desktop to Android (Request)

```http
POST https://192.168.1.100:8443/api/v1/sms/send HTTP/1.1
Host: 192.168.1.100:8443
Content-Type: application/json
X-Session-Id: 550e8400-e29b-41d4-a716-446655440000
X-Session-Signature: a8b3d9e1f2c4...
Content-Length: 142

{
  "version": "1.0",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "requestId": "660e8400-e29b-41d4-a716-446655440001",
  "timestamp": 1704099600000,
  "endpoint": "/api/sms/send",
  "method": "POST",
  "body": {
    "phoneNumber": "+1234567890",
    "message": "Hello from DeviceDoctor!"
  },
  "signature": "hmac-sha256-signature-here"
}
```

#### 2. Android to Desktop (Response)

```http
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 245

{
  "version": "1.0",
  "requestId": "660e8400-e29b-41d4-a716-446655440001",
  "timestamp": 1704099601000,
  "status": "success",
  "code": 200,
  "data": {
    "messageId": "78945",
    "threadId": "123",
    "sentTimestamp": 1704099601000,
    "deliveryStatus": "sent",
    "parts": 1
  },
  "signature": "hmac-sha256-response-signature"
}
```

#### 3. WebSocket Confirmation

```json
{
  "type": "sms_sent",
  "timestamp": 1704099601500,
  "data": {
    "messageId": "78945",
    "threadId": "123",
    "status": "delivered",
    "deliveryTimestamp": 1704099601500
  }
}
```

---

## Performance Optimization

### Compression
- Enable gzip compression for HTTP responses > 1KB
- Use binary protocol for file transfers
- Compress file uploads/downloads automatically

### Caching
- Cache device info for 5 minutes
- Cache contact list for 2 minutes
- Cache app list for 10 minutes
- Real-time updates via WebSocket invalidate cache

### Rate Limiting
- Max 100 requests per minute per session
- File uploads: 1 concurrent transfer
- SMS sends: 10 per minute (carrier limits)

### Connection Management
- Keep WebSocket alive with 30-second heartbeat
- Reconnect automatically with exponential backoff
- Failover to Bluetooth if Wi-Fi drops

---

## Security Considerations

### Request Signing
All requests must include HMAC-SHA256 signature:
```javascript
const signature = hmacSHA256(
  sessionKey,
  `${method}|${endpoint}|${timestamp}|${JSON.stringify(body)}`
)
```

### Replay Attack Prevention
- Requests older than 5 minutes are rejected
- RequestId must be unique per session
- Server tracks used requestIds

### Man-in-the-Middle Protection
- TLS 1.3 with certificate pinning
- Application-layer AES-256 encryption
- Mutual authentication via key exchange

---

*API Specification v1.0 - Complete and production-ready*
