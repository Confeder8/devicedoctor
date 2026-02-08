package com.devicedoctor.app.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Wifi
import androidx.core.content.ContextCompat
import com.devicedoctor.app.security.SecurityManager
import com.devicedoctor.app.service.DeviceDoctorService
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.URL

enum class Screen {
    HOME, PERMISSIONS, DISCOVER_DESKTOPS, PIN_CONFIRMATION, PAIRING_RESULT, SETTINGS
}

class MainActivity : ComponentActivity() {

    private val permissionGroups = buildList {
        add(PermissionGroup("SMS", listOf(
            Manifest.permission.READ_SMS,
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS
        )))
        add(PermissionGroup("Contacts", listOf(
            Manifest.permission.READ_CONTACTS,
            Manifest.permission.WRITE_CONTACTS
        )))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            add(PermissionGroup("Bluetooth", listOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_SCAN
            )))
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(PermissionGroup("Notifications", listOf(
                Manifest.permission.POST_NOTIFICATIONS
            )))
        }
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2) {
            add(PermissionGroup("Storage", listOf(
                Manifest.permission.READ_EXTERNAL_STORAGE
            )))
        }
    }

    private val _permissionStates = mutableStateMapOf<String, Boolean>()

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        results.forEach { (permission, granted) ->
            _permissionStates[permission] = granted
        }
    }

    private lateinit var securityManager: SecurityManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startDeviceDoctorService()
        refreshPermissionStates()
        securityManager = SecurityManager(this)

        setContent {
            DeviceDoctorTheme {
                MainScreen(
                    permissionGroups = permissionGroups,
                    permissionStates = _permissionStates,
                    onGrantPermissions = ::requestAllPermissions,
                    securityManager = securityManager
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshPermissionStates()
    }

    private fun refreshPermissionStates() {
        permissionGroups.flatMap { it.permissions }.forEach { perm ->
            _permissionStates[perm] = ContextCompat.checkSelfPermission(
                this, perm
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    private fun requestAllPermissions() {
        val notGranted = permissionGroups
            .flatMap { it.permissions }
            .filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }

        if (notGranted.isNotEmpty()) {
            permissionLauncher.launch(notGranted.toTypedArray())
        }
    }

    private fun startDeviceDoctorService() {
        val intent = Intent(this, DeviceDoctorService::class.java).apply {
            action = DeviceDoctorService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }
}

data class PermissionGroup(val name: String, val permissions: List<String>)

@Composable
fun DeviceDoctorTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(),
        content = content
    )
}

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    permissionGroups: List<PermissionGroup>,
    permissionStates: Map<String, Boolean>,
    onGrantPermissions: () -> Unit,
    securityManager: SecurityManager
) {
    var currentScreen by remember { mutableStateOf(Screen.HOME) }
    var pairingData by remember { mutableStateOf<SecurityManager.PairingData?>(null) }
    var pairingSuccess by remember { mutableStateOf(false) }
    var pairingErrorMsg by remember { mutableStateOf("") }

    // Check for active sessions and connection status — poll every 3 seconds
    val sessions = remember { mutableStateListOf<SecurityManager.Session>() }
    var isDesktopConnected by remember { mutableStateOf(false) }
    LaunchedEffect(currentScreen) {
        if (currentScreen == Screen.HOME) {
            while (true) {
                val current = securityManager.getAllSessions()
                if (current.size != sessions.size) {
                    sessions.clear()
                    sessions.addAll(current)
                }
                isDesktopConnected = com.devicedoctor.app.connection.ConnectionManager.desktopConnected
                delay(3000)
            }
        }
    }

    when (currentScreen) {
        Screen.HOME -> HomeScreen(
            activeSessions = sessions,
            isDesktopConnected = isDesktopConnected,
            onPairClick = { currentScreen = Screen.DISCOVER_DESKTOPS },
            onPermissionsClick = { currentScreen = Screen.PERMISSIONS },
            onSettingsClick = { currentScreen = Screen.SETTINGS }
        )
        Screen.PERMISSIONS -> PermissionsScreen(
            permissionGroups = permissionGroups,
            permissionStates = permissionStates,
            onGrantPermissions = onGrantPermissions,
            onBack = { currentScreen = Screen.HOME }
        )
        Screen.DISCOVER_DESKTOPS -> DiscoverDesktopsScreen(
            securityManager = securityManager,
            onDesktopSelected = { data ->
                pairingData = data
                currentScreen = Screen.PIN_CONFIRMATION
            },
            onBack = { currentScreen = Screen.HOME }
        )
        Screen.PIN_CONFIRMATION -> PinConfirmationScreen(
            pairingData = pairingData!!,
            securityManager = securityManager,
            onPairingResult = { success, error ->
                pairingSuccess = success
                pairingErrorMsg = error
                currentScreen = Screen.PAIRING_RESULT
            },
            onBack = { currentScreen = Screen.HOME }
        )
        Screen.PAIRING_RESULT -> PairingResultScreen(
            success = pairingSuccess,
            errorMessage = pairingErrorMsg,
            onDone = { currentScreen = Screen.HOME }
        )
        Screen.SETTINGS -> SettingsScreen(
            securityManager = securityManager,
            onBack = { currentScreen = Screen.HOME }
        )
    }
}

// ==================== HOME SCREEN ====================

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    activeSessions: List<SecurityManager.Session>,
    isDesktopConnected: Boolean = false,
    onPairClick: () -> Unit,
    onPermissionsClick: () -> Unit,
    onSettingsClick: () -> Unit
) {
    val isConnected = isDesktopConnected && activeSessions.isNotEmpty()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("DeviceDoctor") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = if (isConnected) Icons.Filled.CheckCircle else Icons.Filled.PhoneAndroid,
                contentDescription = "Device",
                modifier = Modifier.size(120.dp),
                tint = if (isConnected) MaterialTheme.colorScheme.primary
                       else MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "DeviceDoctor",
                style = MaterialTheme.typography.headlineMedium
            )

            Spacer(modifier = Modifier.height(16.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = if (isConnected) "Status: Connected" else "Status: Disconnected",
                        style = MaterialTheme.typography.bodyLarge,
                        color = if (isConnected) MaterialTheme.colorScheme.primary
                               else MaterialTheme.colorScheme.onSurface
                    )

                    if (isConnected) {
                        Spacer(modifier = Modifier.height(8.dp))
                        activeSessions.forEach { session ->
                            Text(
                                text = "Desktop: ${session.desktopId.take(8)}... (${session.desktopIp})",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Button(
                        onClick = onPairClick,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(if (isConnected) "Pair Another Desktop" else "Pair with Desktop")
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedButton(
                        onClick = onPermissionsClick,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Grant Permissions")
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedButton(
                        onClick = onSettingsClick,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Settings")
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Text(
                text = "Service is running in the background",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

// ==================== PERMISSIONS SCREEN ====================

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PermissionsScreen(
    permissionGroups: List<PermissionGroup>,
    permissionStates: Map<String, Boolean>,
    onGrantPermissions: () -> Unit,
    onBack: () -> Unit
) {
    val allGranted = permissionGroups.all { group ->
        group.permissions.all { permissionStates[it] == true }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Permissions") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = if (allGranted) "All permissions granted"
                       else "Some permissions are needed for full functionality",
                style = MaterialTheme.typography.bodyMedium,
                color = if (allGranted) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.error
            )

            Spacer(modifier = Modifier.height(16.dp))

            permissionGroups.forEach { group ->
                val groupGranted = group.permissions.all { permissionStates[it] == true }
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (groupGranted) Icons.Filled.CheckCircle
                                          else Icons.Filled.Warning,
                            contentDescription = null,
                            tint = if (groupGranted) MaterialTheme.colorScheme.primary
                                   else MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = group.name,
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Spacer(modifier = Modifier.weight(1f))
                        Text(
                            text = if (groupGranted) "Granted" else "Denied",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (groupGranted) MaterialTheme.colorScheme.primary
                                    else MaterialTheme.colorScheme.error
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            if (!allGranted) {
                Button(
                    onClick = onGrantPermissions,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Grant All Permissions")
                }
            }
        }
    }
}

// ==================== DISCOVER DESKTOPS SCREEN ====================

data class DiscoveredDesktop(
    val desktopName: String,
    val desktopId: String,
    val ip: String,
    val port: Int,
    val timestamp: Long
)

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverDesktopsScreen(
    securityManager: SecurityManager,
    onDesktopSelected: (SecurityManager.PairingData) -> Unit,
    onBack: () -> Unit
) {
    val discoveredDesktops = remember { mutableStateListOf<DiscoveredDesktop>() }
    var isSearching by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showManualEntry by remember { mutableStateOf(false) }
    var manualIp by remember { mutableStateOf("") }
    var manualPort by remember { mutableStateOf("18443") }
    var isConnecting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // UDP Discovery listener
    DisposableEffect(Unit) {
        val discoveryPort = 18445
        var socket: DatagramSocket? = null
        val job = scope.launch(Dispatchers.IO) {
            try {
                socket = DatagramSocket(null)
                socket!!.reuseAddress = true
                socket!!.broadcast = true
                socket!!.bind(java.net.InetSocketAddress(discoveryPort))
                socket!!.soTimeout = 1000

                while (isActive) {
                    try {
                        val buf = ByteArray(4096)
                        val packet = DatagramPacket(buf, buf.size)
                        socket!!.receive(packet)
                        val data = String(packet.data, 0, packet.length)
                        val json = JSONObject(data)

                        if (json.optString("type") == "devicedoctor_pairing_available") {
                            val desktop = DiscoveredDesktop(
                                desktopName = json.optString("desktopName", "Unknown"),
                                desktopId = json.optString("desktopId", ""),
                                ip = json.optString("ip", packet.address.hostAddress ?: ""),
                                port = json.optInt("port", 18443),
                                timestamp = json.optLong("timestamp", 0)
                            )

                            withContext(Dispatchers.Main) {
                                val existing = discoveredDesktops.indexOfFirst { it.desktopId == desktop.desktopId }
                                if (existing >= 0) {
                                    discoveredDesktops[existing] = desktop
                                } else {
                                    discoveredDesktops.add(desktop)
                                }
                            }
                        }
                    } catch (_: java.net.SocketTimeoutException) {
                        // Expected, just loop again
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    if (discoveredDesktops.isEmpty()) {
                        errorMessage = "Discovery error: ${e.message}"
                    }
                }
            }
        }

        onDispose {
            job.cancel()
            try { socket?.close() } catch (_: Exception) {}
        }
    }

    fun fetchPairingDataAndConnect(ip: String, port: Int) {
        isConnecting = true
        errorMessage = null
        scope.launch {
            try {
                val pairingData = withContext(Dispatchers.IO) {
                    val url = URL("http://$ip:$port/api/v1/pairing/info")
                    val conn = url.openConnection() as HttpURLConnection
                    conn.requestMethod = "GET"
                    conn.connectTimeout = 5000
                    conn.readTimeout = 5000

                    val responseCode = conn.responseCode
                    if (responseCode != 200) {
                        throw Exception("Desktop not ready (status $responseCode)")
                    }

                    val body = conn.inputStream.bufferedReader().readText()
                    securityManager.processPairingQR(body)
                }
                onDesktopSelected(pairingData)
            } catch (e: Exception) {
                errorMessage = e.message ?: "Failed to connect"
                isConnecting = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Discover Desktops") },
                navigationIcon = {
                    IconButton(onClick = onBack, enabled = !isConnecting) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Icon(
                imageVector = Icons.Filled.Wifi,
                contentDescription = null,
                modifier = Modifier.size(48.dp),
                tint = MaterialTheme.colorScheme.primary
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Looking for desktops on your network...",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )

            Text(
                text = "Make sure you clicked \"Add Device\" in the desktop app first.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 4.dp, bottom = 16.dp)
            )

            if (isConnecting) {
                CircularProgressIndicator()
                Spacer(modifier = Modifier.height(8.dp))
                Text("Connecting...")
            } else {
                if (errorMessage != null) {
                    Text(
                        text = errorMessage!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }

                // Discovered desktops list
                if (discoveredDesktops.isNotEmpty()) {
                    Text(
                        text = "Found ${discoveredDesktops.size} desktop(s):",
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = 8.dp)
                    )

                    discoveredDesktops.forEach { desktop ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clickable { fetchPairingDataAndConnect(desktop.ip, desktop.port) }
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.Computer,
                                    contentDescription = null,
                                    modifier = Modifier.size(40.dp),
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = desktop.desktopName,
                                        style = MaterialTheme.typography.titleMedium
                                    )
                                    Text(
                                        text = "${desktop.ip}:${desktop.port}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                } else {
                    // Searching indicator
                    CircularProgressIndicator(modifier = Modifier.padding(16.dp))
                    Text(
                        text = "Searching...",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))
                Divider()
                Spacer(modifier = Modifier.height(16.dp))

                // Manual entry section
                TextButton(onClick = { showManualEntry = !showManualEntry }) {
                    Text(if (showManualEntry) "Hide manual entry" else "Enter IP address manually")
                }

                if (showManualEntry) {
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = manualIp,
                        onValueChange = { manualIp = it },
                        label = { Text("Desktop IP Address") },
                        placeholder = { Text("e.g. 192.168.1.100") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = manualPort,
                        onValueChange = { manualPort = it },
                        label = { Text("Pairing Port") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = {
                            val port = manualPort.toIntOrNull() ?: 18443
                            fetchPairingDataAndConnect(manualIp.trim(), port)
                        },
                        enabled = manualIp.isNotBlank(),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Connect")
                    }
                }
            }
        }
    }
}

// ==================== PIN CONFIRMATION SCREEN ====================

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PinConfirmationScreen(
    pairingData: SecurityManager.PairingData,
    securityManager: SecurityManager,
    onPairingResult: (success: Boolean, error: String) -> Unit,
    onBack: () -> Unit
) {
    var isPairing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Confirm Pairing") },
                navigationIcon = {
                    IconButton(onClick = onBack, enabled = !isPairing) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = "Desktop: ${pairingData.desktopName}",
                style = MaterialTheme.typography.titleLarge
            )

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "Confirm this PIN matches",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = pairingData.pin,
                fontSize = 48.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 8.sp
            )

            Spacer(modifier = Modifier.height(48.dp))

            if (isPairing) {
                CircularProgressIndicator()
                Spacer(modifier = Modifier.height(16.dp))
                Text("Establishing secure connection...")
            } else {
                Button(
                    onClick = {
                        isPairing = true
                        scope.launch {
                            try {
                                val result = withContext(Dispatchers.IO) {
                                    securityManager.completePairing(pairingData)
                                }

                                // POST to desktop
                                withContext(Dispatchers.IO) {
                                    val url = URL("http://${pairingData.ip}:${pairingData.port}/api/v1/pairing/complete")
                                    val conn = url.openConnection() as HttpURLConnection
                                    conn.requestMethod = "POST"
                                    conn.setRequestProperty("Content-Type", "application/json")
                                    conn.doOutput = true
                                    conn.connectTimeout = 10000
                                    conn.readTimeout = 10000

                                    val body = """
                                        {
                                            "androidPublicKey": "${result.androidPublicKey}",
                                            "deviceId": "${result.session.deviceId}",
                                            "challenge": "${result.challenge}"
                                        }
                                    """.trimIndent()

                                    conn.outputStream.use { os ->
                                        os.write(body.toByteArray())
                                    }

                                    val responseCode = conn.responseCode
                                    if (responseCode != 200) {
                                        throw Exception("Desktop responded with status $responseCode")
                                    }
                                }

                                onPairingResult(true, "")
                            } catch (e: Exception) {
                                onPairingResult(false, e.message ?: "Pairing failed")
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Confirm & Pair")
                }

                Spacer(modifier = Modifier.height(8.dp))

                OutlinedButton(
                    onClick = onBack,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Cancel")
                }
            }
        }
    }
}

// ==================== PAIRING RESULT SCREEN ====================

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PairingResultScreen(
    success: Boolean,
    errorMessage: String,
    onDone: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Pairing Result") })
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            if (success) {
                Icon(
                    imageVector = Icons.Filled.CheckCircle,
                    contentDescription = "Success",
                    modifier = Modifier.size(96.dp),
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = "Pairing Successful!",
                    style = MaterialTheme.typography.headlineSmall
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Your device is now connected to the desktop.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            } else {
                Icon(
                    imageVector = Icons.Filled.Error,
                    contentDescription = "Error",
                    modifier = Modifier.size(96.dp),
                    tint = MaterialTheme.colorScheme.error
                )
                Spacer(modifier = Modifier.height(24.dp))
                Text(
                    text = "Pairing Failed",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.error
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = errorMessage,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(48.dp))

            Button(
                onClick = onDone,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Done")
            }
        }
    }
}

// ==================== SETTINGS SCREEN ====================

@kotlin.OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    securityManager: SecurityManager,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    var serviceRunning by remember { mutableStateOf(true) }
    val sessions = remember { mutableStateListOf<SecurityManager.Session>() }

    LaunchedEffect(Unit) {
        sessions.clear()
        sessions.addAll(securityManager.getAllSessions())
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            // Service toggle
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Service", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Background Service")
                        Switch(
                            checked = serviceRunning,
                            onCheckedChange = { enabled ->
                                serviceRunning = enabled
                                val intent = Intent(context, DeviceDoctorService::class.java).apply {
                                    action = if (enabled) DeviceDoctorService.ACTION_START
                                             else DeviceDoctorService.ACTION_STOP
                                }
                                if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                    context.startForegroundService(intent)
                                } else {
                                    context.startService(intent)
                                }
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Device info
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Device Info", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    InfoRow("Device ID", securityManager.getDeviceId())
                    InfoRow("Model", "${Build.MANUFACTURER} ${Build.MODEL}")
                    InfoRow("Android Version", Build.VERSION.RELEASE)
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Network & Tunnel info
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Network & Tunnel", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    InfoRow("Local HTTP Port", "8443")
                    InfoRow("Tunnel Host", "brjk01agv.localto.net")
                    InfoRow("Tunnel Port", "7580")
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "The tunnel forwards traffic from the remote address to this device's local port 8443.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Connected desktops
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Connected Desktops", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))

                    if (sessions.isEmpty()) {
                        Text(
                            text = "No active sessions",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        sessions.forEach { session ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = session.desktopId.take(8) + "...",
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    Text(
                                        text = session.desktopIp,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                TextButton(
                                    onClick = {
                                        securityManager.revokeSession(session.deviceId)
                                        sessions.remove(session)
                                    },
                                    colors = ButtonDefaults.textButtonColors(
                                        contentColor = MaterialTheme.colorScheme.error
                                    )
                                ) {
                                    Text("Revoke")
                                }
                            }
                            if (session != sessions.last()) {
                                Divider()
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // About
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("About", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "DeviceDoctor v1.0.0",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "Secure wireless Android remote control",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}

@Composable
fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}
