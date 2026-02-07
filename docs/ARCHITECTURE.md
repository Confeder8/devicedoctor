# DeviceDoctor - System Architecture

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [High-Level Architecture](#high-level-architecture)
4. [Component Breakdown](#component-breakdown)
5. [Data Flow](#data-flow)
6. [Deployment Architecture](#deployment-architecture)

---

## System Overview

**DeviceDoctor** is a cross-platform desktop application with an Android companion app that enables secure, wireless remote management of Android devices without USB or ADB dependency.

### Key Capabilities
- **SMS Management**: Read, send, reply, delete messages
- **Contacts Management**: Full CRUD operations with sync
- **App Management**: List, install (APK), uninstall applications
- **File Management**: Browse, upload, download, manage files

### Communication Protocols
- **Wi-Fi**: REST API + WebSocket (Primary)
- **Bluetooth**: RFCOMM + BLE fallback (Secondary)
- **Internet/OTA**: HTTPS + WebSocket or WebRTC (Optional)

### Security Model
- End-to-end encryption (RSA/ECDH + AES-256)
- QR code or PIN-based pairing
- Session-based authentication
- Per-action permission validation

---

## Technology Stack

### Desktop Application

**Recommended: Electron + Node.js**

#### Justification:
✅ **Cross-platform**: Windows, macOS, Linux from single codebase
✅ **Single EXE**: electron-builder can package to standalone executable
✅ **Rich ecosystem**: npm packages for networking, encryption, UI
✅ **Modern UI**: React/Vue/vanilla JS for responsive interface
✅ **WebSocket/HTTP**: Native support via Node.js
✅ **Bluetooth**: node-bluetooth-serial-port library
✅ **Fast development**: Rapid prototyping and iteration

#### Technology Choices:
```
Core:
├── Electron 28+ (Chromium + Node.js)
├── Node.js 20 LTS
└── TypeScript 5.3+ (type safety)

UI Framework:
├── React 18+ (component architecture)
├── Material-UI / Ant Design (modern components)
└── Electron Store (local data persistence)

Networking:
├── axios (HTTP client)
├── socket.io-client (WebSocket)
├── node-bluetooth-serial-port (Bluetooth)
└── express (if local server needed)

Security:
├── crypto (Node.js native - RSA/AES)
├── node-forge (additional crypto utilities)
└── qrcode (QR generation)

File Operations:
├── fs-extra (enhanced file system)
├── archiver (compression)
└── electron-dl (download management)
```

#### Alternative Stacks Considered:

**Option 2: .NET 8 (C# + WPF/MAUI)**
- ✅ Native Windows performance
- ✅ Strong typing, excellent debugging
- ✅ Built-in crypto libraries
- ❌ Less cross-platform (MAUI still maturing)
- ❌ Larger learning curve for web developers

**Option 3: JavaFX**
- ✅ True cross-platform
- ✅ Robust networking
- ❌ Heavier runtime
- ❌ Less modern UI components
- ❌ Smaller ecosystem vs npm

**Decision: Electron** - Best balance of cross-platform support, development speed, and ecosystem maturity.

---

### Android Companion App

**Technology: Kotlin + Android SDK**

```
Core:
├── Kotlin 1.9+
├── Android SDK 26+ (API Level 26 - Oreo)
├── Target SDK 34 (Android 14)
└── Gradle 8.2+

Architecture:
├── MVVM Architecture
├── Kotlin Coroutines (async operations)
├── LiveData / StateFlow (reactive data)
└── Room Database (local caching)

Networking:
├── Ktor Server (embedded HTTP server)
├── OkHttp (HTTP client)
├── Socket.IO Android (WebSocket)
└── Bluetooth API (RFCOMM + BLE)

Background Processing:
├── Foreground Service (persistent connection)
├── WorkManager (scheduled tasks)
└── WakeLock (maintain connections)

Security:
├── Android Keystore (key storage)
├── Conscrypt (modern TLS/crypto)
└── Biometric API (optional auth)

Permissions:
├── Runtime Permissions API
├── Scoped Storage (Android 10+)
└── Background Location (if needed)
```

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DESKTOP APPLICATION                       │
│                         (Electron + React)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    UI LAYER (React)                      │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐     │   │
│  │  │Dashboard│ │   SMS   │ │Contacts │ │   Files   │     │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └──────────┘     │   │
│  │  ┌─────────┐ ┌─────────────────────────────────────┐   │   │
│  │  │  Apps   │ │    Connection Status Indicator      │   │   │
│  │  └─────────┘ └─────────────────────────────────────┘   │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────────┐   │
│  │               SERVICE ORCHESTRATOR                       │   │
│  │    (Coordinates all service modules and state)          │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────────┐   │
│  │                  SERVICE MODULES                         │   │
│  │  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────┐ │   │
│  │  │SMS Service│ │Contact Svc│ │ App Svc  │ │File Svc │ │   │
│  │  └───────────┘ └───────────┘ └──────────┘ └─────────┘ │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────────┐   │
│  │            COMMUNICATION ENGINE                          │   │
│  │  ┌────────────┐ ┌────────────┐ ┌─────────────────┐    │   │
│  │  │ WiFi Client│ │ BT Client  │ │ Internet Client │    │   │
│  │  │(HTTP + WS) │ │(RFCOMM/BLE)│ │  (HTTPS + WS)   │    │   │
│  │  └────────────┘ └────────────┘ └─────────────────┘    │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────────┐   │
│  │            SECURITY & ENCRYPTION LAYER                   │   │
│  │  • RSA/ECDH Key Exchange  • AES-256 Encryption          │   │
│  │  • Session Management     • Certificate Validation       │   │
│  └──────────────────────┬──────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────▼──────────────────────────────────┐   │
│  │              DEVICE DISCOVERY MODULE                     │   │
│  │  • mDNS Service Discovery  • UDP Broadcast              │   │
│  │  • Bluetooth Scanning      • Pairing Manager            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────┬─────────────────────────────────────┘
                          │
                    NETWORK LAYER
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
    ┌───▼────┐      ┌────▼─────┐     ┌────▼──────┐
    │ Wi-Fi  │      │Bluetooth │     │ Internet  │
    │  LAN   │      │RFCOMM/BLE│     │HTTPS/WebRTC│
    └───┬────┘      └────┬─────┘     └────┬──────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────────┐
│                   ANDROID COMPANION APP                        │
│                      (Kotlin + Ktor)                           │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              FOREGROUND SERVICE                           │ │
│  │  • Persistent connection • Notification display          │ │
│  │  • Battery optimization exclusion                        │ │
│  └──────────────────────┬───────────────────────────────────┘ │
│                         │                                      │
│  ┌──────────────────────▼───────────────────────────────────┐ │
│  │              CONNECTION MANAGER                           │ │
│  │  • Multi-protocol listener (Wi-Fi/BT/Internet)          │ │
│  │  • Connection health monitoring                          │ │
│  └──────────────────────┬───────────────────────────────────┘ │
│                         │                                      │
│  ┌──────────────────────▼───────────────────────────────────┐ │
│  │           SECURITY & AUTH MODULE                         │ │
│  │  • Decrypt requests  • Encrypt responses                │ │
│  │  • Session validation • Permission checks               │ │
│  └──────────────────────┬───────────────────────────────────┘ │
│                         │                                      │
│  ┌──────────────────────▼───────────────────────────────────┐ │
│  │                  API ROUTER                              │ │
│  │  Routes requests to appropriate Android service         │ │
│  └──────────────────────┬───────────────────────────────────┘ │
│                         │                                      │
│  ┌──────────────────────▼───────────────────────────────────┐ │
│  │              ANDROID SERVICE WRAPPERS                    │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │ │
│  │  │   SMS    │ │ Contacts │ │  Apps    │ │  Files   │  │ │
│  │  │ Manager  │ │ Manager  │ │ Manager  │ │ Manager  │  │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘  │ │
│  └───────┼────────────┼────────────┼────────────┼─────────┘ │
│          │            │            │            │            │
│  ┌───────▼────────────▼────────────▼────────────▼─────────┐ │
│  │            ANDROID SYSTEM APIs                          │ │
│  │  • SmsManager  • ContactsProvider  • PackageManager    │ │
│  │  • MediaStore  • Scoped Storage    • Permission API    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### Desktop Application Components

#### 1. UI Layer
- **Technology**: React + Material-UI
- **Responsibility**: User interaction, data display, navigation
- **Components**:
  - Dashboard (device status, quick actions)
  - SMS Viewer (threaded conversations)
  - Contacts Editor (grid + form)
  - File Explorer (tree view + drag-drop)
  - App Manager (list + install/uninstall)
  - Settings Panel (connection preferences)

#### 2. Service Orchestrator
- **Technology**: TypeScript classes
- **Responsibility**: Coordinate between UI and services
- **Functions**:
  - State management (connected devices, active sessions)
  - Service lifecycle management
  - Error propagation and handling
  - Event aggregation

#### 3. Service Modules

##### SMS Service (`services/sms/`)
```typescript
interface SmsService {
  getConversations(): Promise<Conversation[]>
  getMessages(threadId: string): Promise<Message[]>
  sendMessage(phone: string, text: string): Promise<void>
  deleteMessage(messageId: string): Promise<void>
}
```

##### Contact Service (`services/contacts/`)
```typescript
interface ContactService {
  getAllContacts(): Promise<Contact[]>
  getContact(id: string): Promise<Contact>
  createContact(contact: Contact): Promise<string>
  updateContact(id: string, contact: Contact): Promise<void>
  deleteContact(id: string): Promise<void>
  syncContacts(): Promise<SyncResult>
}
```

##### App Service (`services/apps/`)
```typescript
interface AppService {
  getInstalledApps(): Promise<AppInfo[]>
  installApk(filePath: string): Promise<void>
  uninstallApp(packageName: string): Promise<void>
  getAppDetails(packageName: string): Promise<AppDetails>
}
```

##### File Service (`services/files/`)
```typescript
interface FileService {
  listDirectory(path: string): Promise<FileEntry[]>
  uploadFile(localPath: string, remotePath: string): Promise<void>
  downloadFile(remotePath: string, localPath: string): Promise<void>
  deleteFile(remotePath: string): Promise<void>
  createDirectory(path: string): Promise<void>
}
```

#### 4. Communication Engine

##### Wi-Fi Client (`comm/wifi/`)
```typescript
class WiFiClient {
  private httpClient: AxiosInstance
  private wsClient: Socket

  async connect(deviceIp: string, port: number): Promise<void>
  async sendRequest(endpoint: string, data: any): Promise<any>
  onRealtimeEvent(eventType: string, handler: Function): void
  disconnect(): void
}
```

##### Bluetooth Client (`comm/bluetooth/`)
```typescript
class BluetoothClient {
  async scan(): Promise<BluetoothDevice[]>
  async connectRFCOMM(device: BluetoothDevice): Promise<void>
  async connectBLE(device: BluetoothDevice): Promise<void>
  async send(data: Buffer): Promise<void>
  onData(handler: (data: Buffer) => void): void
}
```

##### Internet Client (`comm/internet/`)
```typescript
class InternetClient {
  async connectViaRelay(deviceId: string): Promise<void>
  async connectViaWebRTC(peerId: string): Promise<void>
  async sendEncrypted(data: any): Promise<any>
}
```

#### 5. Security Layer (`security/`)

```typescript
class SecurityManager {
  // Key exchange
  async generateKeyPair(): Promise<KeyPair>
  async performKeyExchange(publicKey: string): Promise<SharedSecret>

  // Encryption
  encryptData(data: string, sessionKey: string): string
  decryptData(encrypted: string, sessionKey: string): string

  // Session management
  createSession(deviceId: string, sharedSecret: string): Session
  validateSession(sessionId: string): boolean
  revokeSession(sessionId: string): void

  // Pairing
  generateQRCode(pairingData: PairingData): Promise<string>
  generatePIN(): string
}
```

#### 6. Device Discovery (`discovery/`)

```typescript
class DiscoveryManager {
  // mDNS discovery
  async startMDNSDiscovery(): Promise<void>
  onDeviceFound(handler: (device: Device) => void): void

  // UDP broadcast
  async broadcastDiscovery(): Promise<void>

  // Bluetooth scanning
  async scanBluetooth(): Promise<BluetoothDevice[]>

  // Pairing
  async initiatePairing(device: Device): Promise<PairingResult>
}
```

---

### Android Application Components

#### 1. Foreground Service (`DeviceDoctorService.kt`)

```kotlin
class DeviceDoctorService : Service() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Start foreground with notification
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())

        // Initialize connection managers
        wifiManager.start()
        bluetoothManager.start()

        return START_STICKY // Restart if killed
    }
}
```

#### 2. Connection Manager (`ConnectionManager.kt`)

```kotlin
class ConnectionManager(context: Context) {
    private val wifiServer: KtorServer
    private val bluetoothServer: BluetoothServerSocket

    suspend fun startWiFiServer(port: Int)
    suspend fun startBluetoothServer(uuid: UUID)
    fun handleIncomingConnection(connection: Connection)
    fun broadcastPresence() // mDNS + UDP
}
```

#### 3. Security Module (`SecurityManager.kt`)

```kotlin
class SecurityManager(private val keyStore: AndroidKeyStore) {
    fun generateKeyPair(): KeyPair
    fun performKeyExchange(clientPublicKey: ByteArray): ByteArray
    fun decryptRequest(encrypted: ByteArray, sessionKey: SecretKey): String
    fun encryptResponse(data: String, sessionKey: SecretKey): ByteArray
    fun validateSession(sessionId: String): Boolean
}
```

#### 4. API Router (`ApiRouter.kt`)

```kotlin
class ApiRouter(
    private val smsManager: SmsManager,
    private val contactManager: ContactManager,
    private val appManager: AppManager,
    private val fileManager: FileManager
) {
    suspend fun route(request: ApiRequest): ApiResponse {
        return when (request.endpoint) {
            "/sms/list" -> smsManager.listConversations()
            "/contacts/all" -> contactManager.getAllContacts()
            "/apps/list" -> appManager.getInstalledApps()
            "/files/list" -> fileManager.listDirectory(request.params["path"])
            // ... more endpoints
        }
    }
}
```

#### 5. Android Service Wrappers

##### SMS Manager (`SmsManagerWrapper.kt`)
```kotlin
class SmsManagerWrapper(private val context: Context) {
    @RequiresPermission(Manifest.permission.READ_SMS)
    fun getConversations(): List<Conversation>

    @RequiresPermission(Manifest.permission.READ_SMS)
    fun getMessages(threadId: Long): List<Message>

    @RequiresPermission(Manifest.permission.SEND_SMS)
    fun sendMessage(phone: String, text: String)

    @RequiresPermission(Manifest.permission.WRITE_SMS)
    fun deleteMessage(messageId: Long)
}
```

##### Contact Manager (`ContactManagerWrapper.kt`)
```kotlin
class ContactManagerWrapper(private val context: Context) {
    @RequiresPermission(Manifest.permission.READ_CONTACTS)
    fun getAllContacts(): List<Contact>

    @RequiresPermission(Manifest.permission.WRITE_CONTACTS)
    fun createContact(contact: Contact): Long

    @RequiresPermission(Manifest.permission.WRITE_CONTACTS)
    fun updateContact(id: Long, contact: Contact)

    @RequiresPermission(Manifest.permission.WRITE_CONTACTS)
    fun deleteContact(id: Long)
}
```

##### App Manager (`AppManagerWrapper.kt`)
```kotlin
class AppManagerWrapper(private val context: Context) {
    @RequiresPermission(Manifest.permission.QUERY_ALL_PACKAGES)
    fun getInstalledApps(): List<AppInfo>

    @RequiresPermission(Manifest.permission.REQUEST_INSTALL_PACKAGES)
    fun installApk(apkPath: String)

    @RequiresPermission(Manifest.permission.REQUEST_DELETE_PACKAGES)
    fun uninstallApp(packageName: String)
}
```

##### File Manager (`FileManagerWrapper.kt`)
```kotlin
class FileManagerWrapper(private val context: Context) {
    @RequiresPermission(Manifest.permission.READ_EXTERNAL_STORAGE)
    fun listDirectory(path: String): List<FileEntry>

    @RequiresPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
    fun uploadFile(data: ByteArray, path: String)

    @RequiresPermission(Manifest.permission.READ_EXTERNAL_STORAGE)
    fun downloadFile(path: String): ByteArray

    @RequiresPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
    fun deleteFile(path: String)
}
```

---

## Data Flow

### 1. Initial Pairing Flow

```
┌──────────┐                                        ┌──────────┐
│ Desktop  │                                        │ Android  │
│   App    │                                        │   App    │
└────┬─────┘                                        └────┬─────┘
     │                                                    │
     │ 1. User opens Desktop App                         │
     │────────────────────────────────────────────────── │
     │                                                    │
     │ 2. Start Device Discovery (mDNS/UDP)              │
     │───────────────────────────────────────────────────>│
     │                                                    │
     │                    3. Android broadcasts presence │
     │<───────────────────────────────────────────────────│
     │                                                    │
     │ 4. Display found device + "Pair" button           │
     │────────────────────────────────────────────────── │
     │                                                    │
     │ 5. User clicks "Pair"                             │
     │────────────────────────────────────────────────── │
     │                                                    │
     │ 6. Generate Desktop RSA KeyPair                   │
     │ 7. Generate 6-digit PIN                           │
     │ 8. Display QR Code (IP + Port + PublicKey + PIN)  │
     │────────────────────────────────────────────────── │
     │                                                    │
     │                         9. User scans QR on Android│
     │<───────────────────────────────────────────────────│
     │                                                    │
     │                  10. Android displays PIN to confirm│
     │<───────────────────────────────────────────────────│
     │                                                    │
     │                            11. User confirms PIN   │
     │                            12. Generate Android KeyPair│
     │                            13. Perform ECDH key exchange│
     │                            14. Derive AES session key│
     │<───────────────────────────────────────────────────│
     │ 15. Send encrypted "Hello" message                │
     │───────────────────────────────────────────────────>│
     │                                                    │
     │                  16. Decrypt + validate + respond  │
     │<───────────────────────────────────────────────────│
     │                                                    │
     │ 17. Store device credentials locally              │
     │ 18. Mark as "Paired"                              │
     │────────────────────────────────────────────────── │
     │                                                    │
     │ 19. Display "Connected" dashboard                 │
     │────────────────────────────────────────────────── │
```

### 2. SMS Read Flow

```
┌──────────┐                                        ┌──────────┐
│ Desktop  │                                        │ Android  │
└────┬─────┘                                        └────┬─────┘
     │                                                    │
     │ 1. User clicks "SMS" tab                          │
     │────────────────────────────────────────────────── │
     │                                                    │
     │ 2. UI requests SMS list from SmsService           │
     │────────────────────────────────────────────────── │
     │                                                    │
     │ 3. SmsService → Communication Engine              │
     │    Encrypt(GET /api/sms/conversations)            │
     │───────────────────────────────────────────────────>│
     │                                                    │
     │                        4. Decrypt request          │
     │                        5. Validate session         │
     │                        6. Check READ_SMS permission│
     │<───────────────────────────────────────────────────│
     │                                                    │
     │              7. SmsManagerWrapper.getConversations()│
     │<───────────────────────────────────────────────────│
     │                                                    │
     │              8. Query ContentProvider              │
     │              9. content://sms/conversations        │
     │<───────────────────────────────────────────────────│
     │                                                    │
     │             10. Build Conversation objects         │
     │             11. Encrypt response                   │
     │<───────────────────────────────────────────────────│
     │                                                    │
     │ 12. Decrypt response                              │
     │ 13. Parse conversations                           │
     │ 14. Update UI state                               │
     │────────────────────────────────────────────────── │
     │                                                    │
     │ 15. Render conversation list                      │
     │────────────────────────────────────────────────── │
```

### 3. File Upload Flow

```
┌──────────┐                                        ┌──────────┐
│ Desktop  │                                        │ Android  │
└────┬─────┘                                        └────┬─────┘
     │                                                    │
     │ 1. User drags file to File Explorer               │
     │────────────────────────────────────────────────── │
     │                                                    │
     │ 2. FileService.uploadFile(local, remote)          │
     │ 3. Read file → Compress (gzip)                    │
     │ 4. Split into chunks (1MB each)                   │
     │────────────────────────────────────────────────── │
     │                                                    │
     │ 5. POST /api/files/upload/init                    │
     │    { filename, size, chunks, hash }               │
     │───────────────────────────────────────────────────>│
     │                                                    │
     │                        6. Validate + create temp file│
     │                        7. Return uploadId          │
     │<───────────────────────────────────────────────────│
     │                                                    │
     │ 8. For each chunk:                                │
     │    POST /api/files/upload/chunk                   │
     │    { uploadId, chunkIndex, data }                 │
     │───────────────────────────────────────────────────>│
     │                                                    │
     │                        9. Write chunk to temp file │
     │                       10. Verify chunk hash        │
     │<───────────────────────────────────────────────────│
     │                                                    │
     │ 11. All chunks sent                               │
     │ 12. POST /api/files/upload/complete               │
     │     { uploadId }                                  │
     │───────────────────────────────────────────────────>│
     │                                                    │
     │                       13. Verify complete file hash│
     │                       14. Decompress               │
     │                       15. Move to final location   │
     │<───────────────────────────────────────────────────│
     │                                                    │
     │ 16. Update UI: "Upload complete"                  │
     │────────────────────────────────────────────────── │
```

---

## Deployment Architecture

### Desktop Application

```
DeviceDoctor/
├── DeviceDoctor.exe              # Electron packaged executable
├── resources/
│   ├── app.asar                  # Compressed application code
│   └── icon.ico                  # Application icon
├── locales/                      # i18n resources
└── LICENSE                       # Software license
```

**Build Process:**
```bash
# Install dependencies
npm install

# Build React UI
npm run build:ui

# Package Electron app
npm run package:win    # Windows EXE
npm run package:mac    # macOS DMG
npm run package:linux  # Linux AppImage
```

**Output:**
- `dist/DeviceDoctor-Setup-1.0.0.exe` (Windows installer)
- Single EXE with embedded Node.js runtime
- Size: ~150-200 MB (includes Chromium + Node)

### Android Application

```
app/
├── build.gradle.kts
├── src/main/
│   ├── AndroidManifest.xml
│   ├── java/com/devicedoctor/
│   │   ├── DeviceDoctorService.kt
│   │   ├── MainActivity.kt
│   │   ├── connection/
│   │   ├── security/
│   │   └── services/
│   └── res/
│       ├── layout/
│       ├── values/
│       └── xml/
└── release/
    └── app-release.apk           # Signed APK
```

**Build Process:**
```bash
# Build release APK
./gradlew assembleRelease

# Sign APK
jarsigner -keystore release.keystore app-release-unsigned.apk alias

# Align APK
zipalign -v 4 app-release-unsigned.apk DeviceDoctor.apk
```

**Output:**
- `DeviceDoctor.apk` (signed, aligned)
- Size: ~15-25 MB
- Min SDK: 26 (Android 8.0)
- Target SDK: 34 (Android 14)

---

## Performance Considerations

### Desktop Application
- **Memory**: Target < 200 MB idle, < 500 MB during file transfers
- **CPU**: Encryption overhead ~5-10% during active transfers
- **Network**: Support concurrent connections to multiple devices
- **Startup Time**: < 3 seconds cold start

### Android Application
- **Battery**: Foreground service with optimized wake locks
- **Memory**: Target < 100 MB RSS
- **Background**: WorkManager for non-critical tasks
- **Permissions**: Request only when needed, explain clearly

### Data Transfer
- **Compression**: gzip for text, skip for media files
- **Chunking**: 1 MB chunks for resumable transfers
- **Caching**: Cache frequently accessed data locally
- **Throttling**: Respect network conditions, reduce quality if needed

---

## Scalability & Future Extensions

### Phase 2 Enhancements
- Multiple device management (connect to 5+ devices)
- Desktop notifications for incoming SMS
- Automated backups (SMS, contacts, photos)
- Screen mirroring (view Android screen)

### Phase 3 Enterprise Features
- Cloud relay for remote access (outside LAN)
- Team collaboration (shared device access)
- Audit logs and compliance reporting
- MDM integration (Microsoft Intune, Google Workspace)

### Technical Debt Prevention
- Comprehensive unit tests (80%+ coverage)
- Integration tests for all communication paths
- Performance benchmarks (track over time)
- Security audits (quarterly penetration testing)

---

## Next Steps

1. ✅ Architecture design complete
2. ⏭️ Define communication protocols and API specs
3. ⏭️ Design security flows in detail
4. ⏭️ Begin desktop application structure
5. ⏭️ Begin Android application structure

---

*This architecture is designed for production deployment with security, scalability, and maintainability as core principles.*
