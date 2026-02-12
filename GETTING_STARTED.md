# DeviceDoctor - Getting Started Guide

## 🚀 Quick Start

This guide will help you get DeviceDoctor up and running in minutes.

---

## Prerequisites

### For Desktop Development
- **Node.js** 20+ LTS ([Download](https://nodejs.org/))
- **npm** 10+ (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))

### For Android Development
- **Android Studio** Hedgehog or later ([Download](https://developer.android.com/studio))
- **JDK** 17 ([Download](https://adoptium.net/))
- **Android SDK** 26+ (Target 34)

---

## Installation

### 1. Clone or Extract Project

If you have the project files, navigate to the `devicedoctor` directory:

```bash
cd E:\AIcodes\devicedoctor
```

### 2. Install Desktop Dependencies

```bash
cd desktop
npm install
```

This will install all required dependencies (~500MB).

### 3. Setup Android Project

Open Android Studio:
1. File → Open
2. Navigate to `E:\AIcodes\devicedoctor\android`
3. Click OK
4. Wait for Gradle sync to complete

---

## Running the Applications

### Desktop Application (Development Mode)

```bash
cd desktop
npm run dev
```

This will:
- Start the Electron main process
- Launch the React development server
- Open the application window

The app will hot-reload when you make changes.

### Android Application

In Android Studio:
1. Connect an Android device via USB (or start an emulator)
2. Click Run → Run 'app'
3. Wait for build and installation

Or use command line:
```bash
cd android
./gradlew installDebug
```

---

## First Time Setup

### 1. Start Desktop App
- Open the desktop application
- You'll see the Dashboard with "No devices connected"

### 2. Start Android App
- Open DeviceDoctor on your Android device
- Grant all requested permissions:
  - SMS (Read, Send)
  - Contacts (Read, Write)
  - Storage (Read, Write)
  - Bluetooth
  - Camera (for QR scanning)
  - Notifications

### 3. Pair Devices

**On Desktop:**
1. Click "Add Device" button
2. A QR code will appear with a 6-digit PIN
3. Keep this window open

**On Android:**
1. Tap "Pair with Desktop"
2. Scan the QR code with your camera
3. Verify the 6-digit PIN matches
4. Tap "Confirm"

**Result:**
- Devices will pair automatically
- Desktop will show "Connected"
- You can now use all features!

---

## Testing Features

### SMS Messages
1. Click "SMS" in the desktop sidebar
2. View all your conversations
3. Click a conversation to view messages
4. Send a test message

### Contacts
1. Click "Contacts" in the sidebar
2. View all your contacts
3. Search, add, edit, or delete contacts

### Apps
1. Click "Apps" in the sidebar
2. View all installed apps
3. Install APK files from your computer
4. Uninstall apps remotely

### Files
1. Click "Files" in the sidebar
2. Browse your Android device storage
3. Upload files from computer to phone
4. Download files from phone to computer

---

## Building for Production

### Desktop Application

#### Windows
```bash
cd desktop
npm run build
npm run package:win
```
Output: `desktop/release/DeviceDoctor-Setup-1.0.0.exe`

#### macOS
```bash
npm run package:mac
```
Output: `desktop/release/DeviceDoctor-1.0.0.dmg`

#### Linux
```bash
npm run package:linux
```
Output: `desktop/release/DeviceDoctor-1.0.0.AppImage`

### Android Application

#### Using Android Studio
1. Build → Generate Signed Bundle / APK
2. Choose APK
3. Select release variant
4. Sign with your keystore
5. Output: `android/app/release/app-release.apk`

#### Using Command Line
```bash
cd android
./gradlew assembleRelease
```

Sign the APK:
```bash
jarsigner -keystore your-keystore.jks \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  your-key-alias

zipalign -v 4 \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  DeviceDoctor.apk
```

---

## Troubleshooting

### Desktop Issues

**Problem**: "Module not found" errors
**Solution**:
```bash
cd desktop
rm -rf node_modules package-lock.json
npm install
```

**Problem**: "Failed to start dev server"
**Solution**:
- Make sure port 3000 is not in use
- Kill any existing Node.js processes
- Try `npm run dev` again

**Problem**: "Cannot connect to device"
**Solution**:
- Ensure both devices are on same Wi-Fi network
- Check firewall isn't blocking ports 8443, 8444
- Verify Android service is running

### Android Issues

**Problem**: "Permission denied" errors
**Solution**:
- Go to Settings → Apps → DeviceDoctor → Permissions
- Manually grant all permissions
- Restart the app

**Problem**: "Service keeps stopping"
**Solution**:
- Disable battery optimization
- Settings → Apps → DeviceDoctor → Battery → Unrestricted

**Problem**: "Cannot scan QR code"
**Solution**:
- Grant camera permission
- Ensure QR code is clearly visible on desktop
- Try increasing brightness on desktop screen

### Connection Issues

**Problem**: Devices won't pair
**Solution**:
- Verify 6-digit PIN matches exactly
- Ensure QR code hasn't expired (5 min limit)
- Check both devices have internet/Wi-Fi
- Try pairing again

**Problem**: Connection drops frequently
**Solution**:
- Keep devices on same network
- Disable Wi-Fi power saving on Android
- Move devices closer to Wi-Fi router
- Check for network interference

---

## Development Tips

### Desktop Development

**Hot Reload**: Changes to React components reload automatically

**Debug Main Process**: Open Chrome and navigate to `chrome://inspect`

**Debug Renderer**: Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (Mac)

**Clear Storage**: Delete `~/.config/DeviceDoctor` (Linux/Mac) or `%APPDATA%\DeviceDoctor` (Windows)

### Android Development

**Logcat**: View logs in Android Studio (View → Tool Windows → Logcat)

**Debug Service**: Use `adb logcat | grep DeviceDoctor`

**Test Permissions**: Use `adb shell pm grant com.devicedoctor.app <permission>`

**Clear Data**: Settings → Apps → DeviceDoctor → Storage → Clear Data

---

## Performance Optimization

### Desktop
- Use production build for better performance
- Disable DevTools in production
- Enable hardware acceleration

### Android
- Exclude from battery optimization
- Grant "Autostart" permission (if available)
- Keep service in foreground

---

## Security Best Practices

1. **Never share session keys** - They're encrypted and device-specific
2. **Revoke old sessions** - Remove unused paired devices
3. **Use strong Wi-Fi password** - Secure your network
4. **Keep software updated** - Install updates when available
5. **Don't pair on public Wi-Fi** - Use your home/office network

---

## Getting Help

### Documentation
- `README.md` - Project overview
- `docs/ARCHITECTURE.md` - System design
- `docs/API_SPECIFICATION.md` - API reference
- `docs/SECURITY.md` - Security details

### Common Commands

**Desktop:**
```bash
npm run dev        # Development mode
npm run build      # Build production
npm run lint       # Check code quality
npm test          # Run tests
```

**Android:**
```bash
./gradlew build           # Build project
./gradlew installDebug    # Install debug APK
./gradlew clean          # Clean build
./gradlew assembleRelease # Build release APK
```

---

## Next Steps

1. ✅ Install and run both applications
2. ✅ Pair your devices
3. ✅ Test each feature (SMS, Contacts, Apps, Files)
4. ✅ Explore settings and customization
5. ✅ Build production versions when ready

---

**Congratulations! You're ready to use DeviceDoctor!** 🎉

For advanced usage and API details, see the full documentation in the `docs/` directory.
