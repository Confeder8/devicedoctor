# DeviceDoctor - Android Remote Control System

A secure, wireless Android remote control desktop application system that enables full device management without USB or ADB.

## 🎯 Project Overview

DeviceDoctor consists of two components:
1. **Desktop Application** (Electron + React + TypeScript) - Windows/macOS/Linux
2. **Android Companion App** (Kotlin + Jetpack Compose) - Android 8.0+

### Key Features
- 📱 **SMS Management** - Read, send, reply, delete messages
- 👥 **Contacts Management** - Full CRUD operations with sync
- 📦 **App Management** - List, install (APK), uninstall applications
- 📁 **File Management** - Browse, upload, download, manage files
- 🔐 **Secure Pairing** - QR code + PIN with end-to-end encryption
- 📡 **Multi-Protocol** - Wi-Fi, Bluetooth, and Internet/OTA support

### Security
- End-to-end encryption (ECDH + AES-256-GCM)
- TLS 1.3 transport security
- HMAC message authentication
- Session-based authentication
- Per-action permission validation

---

## 📊 Project Status

**Overall Progress**: 50% Complete

### ✅ Completed (50%)
- [x] Complete system architecture
- [x] API specifications (40+ endpoints)
- [x] Security design and implementation
- [x] Desktop application backend (100%)
  - [x] Security Manager
  - [x] Communication Engine (Wi-Fi, Bluetooth clients)
  - [x] Device Manager
  - [x] Discovery Manager
  - [x] All service modules (SMS, Contacts, Apps, Files)
  - [x] IPC handlers
- [x] Android project structure
- [x] Android Foreground Service
- [x] Android Security Manager

### 🔄 In Progress (30%)
- [ ] Android Connection Manager (Wi-Fi, Bluetooth servers)
- [ ] Android API Router
- [ ] Android service wrappers

### ⏳ Pending (20%)
- [ ] Desktop UI (React components)
- [ ] Android UI (Jetpack Compose)
- [ ] Integration testing
- [ ] Deployment packages

---

## 🚀 Getting Started

### Prerequisites

#### For Desktop Development
- Node.js 20+ LTS
- npm 10+
- Git

#### For Android Development
- Android Studio Hedgehog or later
- JDK 17
- Android SDK 26+ (Target 34)
- Kotlin 1.9+

### Installation

#### Desktop Application

```bash
# Navigate to desktop directory
cd desktop

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Package for distribution
npm run package:win   # Windows
npm run package:mac   # macOS
npm run package:linux # Linux
```

#### Android Application

```bash
# Open in Android Studio
# File -> Open -> Select android/ directory

# Sync Gradle
# Build -> Make Project

# Run on device/emulator
# Run -> Run 'app'

# Build APK
# Build -> Build Bundle(s) / APK(s) -> Build APK(s)
```

---

## 📁 Project Structure

```
devicedoctor/
├── docs/                          # Documentation
│   ├── ARCHITECTURE.md            # System architecture
│   ├── API_SPECIFICATION.md       # API documentation
│   ├── SECURITY.md                # Security design
│   ├── PROJECT_STATUS.md          # Progress tracking
│   └── IMPLEMENTATION_SUMMARY.md  # Development summary
│
├── desktop/                       # Desktop application
│   ├── src/
│   │   ├── main/                  # Electron main process
│   │   │   ├── main.ts            # Entry point
│   │   │   ├── preload.ts         # IPC bridge
│   │   │   ├── modules/           # Core modules
│   │   │   │   ├── security/      # Encryption & auth
│   │   │   │   ├── communication/ # Network clients
│   │   │   │   ├── device/        # Device management
│   │   │   │   └── discovery/     # Device discovery
│   │   │   ├── services/          # Business logic
│   │   │   └── ipc/               # IPC handlers
│   │   └── renderer/              # React UI (TODO)
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
└── android/                       # Android application
    ├── app/
    │   ├── build.gradle.kts
    │   └── src/main/
    │       ├── AndroidManifest.xml
    │       └── java/com/devicedoctor/app/
    │           ├── DeviceDoctorApplication.kt
    │           ├── service/       # Foreground service
    │           ├── security/      # Encryption & auth
    │           ├── connection/    # Network servers (TODO)
    │           ├── api/           # API router (TODO)
    │           ├── managers/      # Service wrappers (TODO)
    │           └── ui/            # Jetpack Compose UI (TODO)
    ├── build.gradle.kts
    └── settings.gradle.kts
```

---

## 🔧 Development

### Desktop Development

The desktop application is built with Electron, TypeScript, and React.

**Key Technologies:**
- Electron 28+ (Main + Renderer processes)
- TypeScript 5.3+
- React 18+ (UI framework)
- Material-UI (UI components)
- axios (HTTP client)
- socket.io (WebSocket client)
- Node.js crypto (encryption)

**Main Process Components:**
- `SecurityManager` - Key exchange, encryption, session management
- `CommunicationEngine` - Protocol abstraction (Wi-Fi, Bluetooth, Internet)
- `DeviceManager` - Device state and lifecycle
- `DiscoveryManager` - Device discovery (mDNS, UDP, Bluetooth)
- Service modules - Business logic for SMS, Contacts, Apps, Files

**IPC Communication:**
The preload script exposes a secure API to the renderer process via `contextBridge`. All IPC calls are handled by registered handlers in `IpcHandlers.ts`.

### Android Development

The Android application is built with Kotlin and Jetpack Compose.

**Key Technologies:**
- Kotlin 1.9+
- Jetpack Compose (Modern UI)
- Ktor (Embedded HTTP server)
- Socket.IO (WebSocket)
- Coroutines (Async operations)
- Android Keystore (Secure key storage)
- Conscrypt (Modern TLS)

**Core Components:**
- `DeviceDoctorService` - Foreground service (persistent connection)
- `SecurityManager` - Key exchange, encryption, session management
- `ConnectionManager` - Wi-Fi and Bluetooth servers (TODO)
- `ApiRouter` - Request routing and handling (TODO)
- Service wrappers - Android API access for SMS, Contacts, Apps, Files (TODO)

---

## 🔐 Security Architecture

### Pairing Flow

1. User opens desktop app and clicks "Add Device"
2. Desktop generates ECDH key pair and 6-digit PIN
3. Desktop displays QR code containing:
   - IP address and port
   - Desktop public key
   - PIN
   - Timestamp and signature
4. User scans QR code on Android
5. Android displays PIN for user confirmation
6. User confirms PIN matches on both devices
7. Android generates ECDH key pair
8. Both sides perform ECDH key exchange
9. Shared secret derived using HKDF
10. Session keys generated (AES-256 + HMAC)
11. Challenge-response authentication
12. Session established

### Encryption

- **Key Exchange**: ECDH (Curve25519)
- **Session Encryption**: AES-256-GCM
- **Message Authentication**: HMAC-SHA256
- **Transport Security**: TLS 1.3
- **Key Derivation**: HKDF-SHA256

### Session Management

- Sessions expire after 24 hours
- Idle timeout: 1 hour
- Sessions can be refreshed
- Sessions can be revoked by user
- All requests require valid session + HMAC signature

---

## 📡 Communication Protocols

### Wi-Fi (Primary)

- **REST API**: HTTPS on port 8443
  - All CRUD operations
  - File upload/download (chunked)
  - Request/response encrypted with AES-256-GCM

- **WebSocket**: WSS on port 8444
  - Real-time notifications
  - Incoming SMS
  - Device status updates
  - File system changes

### Bluetooth (Secondary)

- **RFCOMM**: Serial Port Profile
  - Binary framing protocol
  - CRC32 checksum
  - Same encryption as Wi-Fi

### Internet/OTA (Optional)

- **HTTPS + WebSocket**: Via relay server
  - Same protocol as Wi-Fi
  - Tunneled through secure relay

---

## 📋 API Endpoints

### Device Management
- `POST /pairing/initiate` - Start pairing process
- `POST /pairing/complete` - Complete key exchange
- `GET /session/validate` - Validate session
- `DELETE /session/revoke` - Revoke session

### SMS Management
- `GET /sms/conversations` - List all conversations
- `GET /sms/messages/:threadId` - Get messages in thread
- `POST /sms/send` - Send SMS
- `DELETE /sms/message/:id` - Delete message
- `PATCH /sms/message/:id/read` - Mark as read

### Contacts Management
- `GET /contacts/all` - List all contacts
- `GET /contacts/:id` - Get single contact
- `POST /contacts/create` - Create contact
- `PUT /contacts/:id` - Update contact
- `DELETE /contacts/:id` - Delete contact

### App Management
- `GET /apps/installed` - List installed apps
- `GET /apps/:packageName` - Get app details
- `POST /apps/install` - Install APK
- `DELETE /apps/:packageName` - Uninstall app

### File Management
- `GET /files/list` - List directory contents
- `POST /files/upload/init` - Initialize file upload
- `POST /files/upload/chunk` - Upload file chunk
- `POST /files/upload/complete` - Complete upload
- `GET /files/download` - Download file (chunked)
- `DELETE /files/delete` - Delete file/directory
- `POST /files/mkdir` - Create directory
- `POST /files/move` - Move/rename file

See `docs/API_SPECIFICATION.md` for complete API documentation.

---

## 🧪 Testing

### Desktop Testing

```bash
cd desktop
npm test              # Unit tests
npm run test:e2e      # End-to-end tests
npm run lint          # Linting
```

### Android Testing

```bash
cd android
./gradlew test              # Unit tests
./gradlew connectedTest     # Instrumented tests
```

---

## 📦 Building for Production

### Desktop

```bash
cd desktop

# Install dependencies
npm install

# Build React UI
npm run build:renderer

# Build main process
npm run build:main

# Package application
npm run package:win    # Creates Windows installer
npm run package:mac    # Creates macOS DMG
npm run package:linux  # Creates Linux AppImage/deb
```

Output: `desktop/release/DeviceDoctor-Setup-1.0.0.exe`

### Android

```bash
cd android

# Build release APK
./gradlew assembleRelease

# Sign APK
jarsigner -keystore release.keystore \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  devicedoctor

# Align APK
zipalign -v 4 \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  DeviceDoctor.apk
```

Output: `android/DeviceDoctor.apk`

---

## 🛠️ Troubleshooting

### Desktop Issues

**Issue**: Failed to connect to device
- Ensure both devices are on the same network
- Check firewall settings (allow port 8443, 8444)
- Verify Android service is running

**Issue**: QR code not scanning
- Ensure camera permission granted on Android
- Check QR code hasn't expired (5 minutes)
- Try regenerating QR code

**Issue**: Encryption errors
- Verify time sync between devices
- Check session hasn't expired
- Try re-pairing devices

### Android Issues

**Issue**: Service keeps stopping
- Disable battery optimization for DeviceDoctor
- Settings -> Apps -> DeviceDoctor -> Battery -> Unrestricted

**Issue**: Permissions not working
- Go to Settings -> Apps -> DeviceDoctor -> Permissions
- Manually grant all required permissions
- Restart the app

**Issue**: Can't install APKs
- Enable "Install from unknown sources"
- Settings -> Security -> Install unknown apps -> DeviceDoctor -> Allow

---

## 📄 License

MIT License - See LICENSE file for details

---

## 👥 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📞 Support

For issues and questions:
- GitHub Issues: https://github.com/devicedoctor/devicedoctor/issues
- Documentation: See `docs/` directory
- Email: support@devicedoctor.app

---

## 🗺️ Roadmap

### Phase 1: MVP (Current)
- [x] Core architecture
- [x] Desktop backend
- [x] Android backend (partial)
- [ ] Basic UI (desktop + Android)
- [ ] Pairing flow
- [ ] SMS management

### Phase 2: Feature Complete
- [ ] Contacts management
- [ ] App management
- [ ] File management
- [ ] Bluetooth support
- [ ] Real-time notifications

### Phase 3: Polish
- [ ] UI/UX refinement
- [ ] Performance optimization
- [ ] Comprehensive testing
- [ ] User documentation
- [ ] Deployment automation

### Phase 4: Advanced Features
- [ ] Multi-device support
- [ ] Cloud relay (Internet/OTA)
- [ ] Screen mirroring
- [ ] Automated backups
- [ ] Desktop notifications

### Phase 5: Enterprise
- [ ] Team collaboration
- [ ] Audit logs
- [ ] MDM integration
- [ ] Compliance reporting
- [ ] Advanced security features

---

**Built with ❤️ by the DeviceDoctor Team**
