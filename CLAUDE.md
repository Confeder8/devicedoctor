# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeviceDoctor is a secure wireless Android remote control system consisting of two apps:
- **Desktop** (Electron + React + TypeScript) — manages SMS, contacts, apps, and files on paired Android devices
- **Android** (Kotlin + Jetpack Compose) — companion app that runs an embedded HTTP/WebSocket server and exposes device APIs

The two apps communicate over Wi-Fi (primary), Bluetooth (secondary), or Internet relay (optional) using end-to-end encrypted sessions established via QR code + PIN pairing.

## Build & Dev Commands

### Desktop (`desktop/`)
```bash
npm install              # Install dependencies
npm run dev              # Run main + renderer concurrently
npm run dev:main         # Compile & run Electron main process only
npm run dev:renderer     # Vite dev server for React UI (port 3000)
npm run build            # Build main (tsc) + renderer (vite)
npm run lint             # ESLint on src/**/*.{ts,tsx}
npm run package:win      # electron-builder → NSIS installer
npm run package:mac      # electron-builder → DMG
npm run package:linux    # electron-builder → AppImage/deb
```

### Android (`android/`)
Open in Android Studio, then:
- **Sync**: File → Open → select `android/` directory, Gradle sync
- **Build**: Build → Make Project (or `./gradlew assembleDebug`)
- **Run**: Run → Run 'app' on device/emulator
- **Test**: `./gradlew test` (unit) / `./gradlew connectedAndroidTest` (instrumented)

Requires JDK 17, Android SDK 26+ (target 35), Kotlin via the compose compiler plugin.

## Architecture

### Desktop — Main Process (`desktop/src/main/`)

Entry point is `main.ts`, which bootstraps all modules and starts an HTTP server on **port 7771** (used by Android to complete pairing and poll status).

**Module layer** (`modules/`):
- `security/SecurityManager.ts` — ECDH key exchange, AES-256-GCM encryption/decryption, HMAC signing, session lifecycle, QR code generation. This is the cryptographic core; changes here must be mirrored on Android.
- `communication/CommunicationEngine.ts` — Protocol abstraction with pluggable clients (`WiFiClient`, `BluetoothClient`). All outbound requests to Android go through this layer.
- `device/DeviceManager.ts` — Tracks paired/connected devices, persists state via `electron-store`.
- `discovery/DiscoveryManager.ts` — UDP broadcast + mDNS to find Android devices on the LAN.

**Service layer** (`services/`) — Business logic for SMS, Contacts, Apps, Files. Each service proxies requests through `CommunicationEngine` to the Android REST API.

**IPC layer** (`ipc/IpcHandlers.ts`) — Registers all `ipcMain.handle` channels. The renderer never accesses Node APIs directly; everything goes through `preload.ts` which exposes a typed `window.electronAPI` via `contextBridge`.

### Desktop — Renderer (`desktop/src/renderer/`)

React 18 + Material-UI + React Router. Pages: Dashboard, SMS, Contacts, Apps, Files, Settings. State is managed with React hooks + Zustand; all backend calls go through `window.electronAPI`.

### Android (`android/app/src/main/java/com/devicedoctor/app/`)

- `service/DeviceDoctorService.kt` — Foreground service that keeps the connection alive, starts Ktor/WebSocket servers, sends heartbeats.
- `security/SecurityManager.kt` — Mirror of desktop crypto: ECDH, AES-256-GCM, HMAC, session management. Uses Android Keystore + Conscrypt.
- `connection/ConnectionManager.kt` — Starts Ktor HTTP server on **port 8443**, WebSocket on **8444**, UDP broadcast listener on **8445**, NSD service registration.
- `api/ApiRouter.kt` — Decrypts incoming requests → routes to manager wrappers → encrypts responses.
- `managers/` — Wrappers around Android platform APIs (SMS, Contacts, Apps, Files).
- `ui/MainActivity.kt` — Single-activity Jetpack Compose UI with permission handling, device discovery, PIN confirmation.

### Cross-Platform Protocol

Both platforms implement the same encryption pipeline:
1. **Key exchange**: ECDH (Curve25519) → HKDF-SHA256 key derivation
2. **Session encryption**: AES-256-GCM for payloads + HMAC-SHA256 for authentication
3. **Pairing**: QR code contains `{ip, port, publicKey, PIN, timestamp, signature}`
4. **Sessions**: 24-hour expiry, 1-hour idle timeout, sessionId + HMAC required on all requests

API endpoints (~40+) are documented in `docs/API_SPECIFICATION.md`. Key groups: `/pairing/*`, `/sms/*`, `/contacts/*`, `/apps/*`, `/files/*`, `/session/*`.

## Key Ports

| Port | Protocol | Owner   | Purpose |
|------|----------|---------|---------|
| 3000 | HTTP     | Desktop | Vite dev server (renderer) |
| 7771 | HTTP     | Desktop | Pairing/status server for Android |
| 8443 | HTTPS    | Android | Ktor REST API |
| 8444 | WSS      | Android | WebSocket notifications |
| 8445 | UDP      | Android | Discovery broadcast |

## Documentation

- `docs/ARCHITECTURE.md` — Full system design with component diagrams
- `docs/SECURITY.md` — Threat model, pairing flow, encryption details
- `docs/API_SPECIFICATION.md` — Complete REST API reference

## Important Patterns

- **IPC boundary**: Renderer is sandboxed. All main-process access goes through `preload.ts` → `IpcHandlers.ts`. When adding new functionality, add the channel in both files.
- **Crypto symmetry**: `SecurityManager` exists on both platforms with matching algorithms. Changes to encryption, key derivation, or session handling must be synchronized across desktop and Android.
- **Encrypted routing on Android**: Requests arrive encrypted at `ConnectionManager` → decrypted by `SecurityManager` → routed by `ApiRouter` → handled by manager wrappers → response encrypted and returned.
- **EventEmitter pattern**: Desktop modules communicate via Node.js `EventEmitter`. The main process listens to module events and forwards relevant ones to the renderer via IPC.
