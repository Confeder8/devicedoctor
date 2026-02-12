/**
 * Dashboard Page
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
  IconButton,
} from '@mui/material'
import {
  PhoneAndroid,
  SignalWifi4Bar,
  Bluetooth,
  Add,
  CheckCircle,
  Error as ErrorIcon,
  Close,
  DevicesOther,
  Delete,
  Language,
  Usb,
} from '@mui/icons-material'

const pairingSteps = ['Connecting', 'Pairing', 'Connected']

type PairingStatus = 'idle' | 'generating' | 'connecting' | 'success' | 'error'

const Dashboard: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Pairing dialog state
  const [pairingOpen, setPairingOpen] = useState(false)
  const [pairingStatus, setPairingStatus] = useState<PairingStatus>('idle')
  const [pairingError, setPairingError] = useState('')
  const [activeStep, setActiveStep] = useState(0)

  // Connection info state
  const [connectionInfoMap, setConnectionInfoMap] = useState<Record<string, { route: string; host: string; port: number }>>({})

  // Remove device dialog state
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [deviceToRemove, setDeviceToRemove] = useState<any>(null)

  useEffect(() => {
    loadDevices()

    // Listen for device events
    const cleanupFound = window.electronAPI.device.onDeviceFound((device) => {
      setDevices(prev => {
        const exists = prev.find(d => d.deviceId === device.deviceId)
        if (exists) return prev.map(d => d.deviceId === device.deviceId ? device : d)
        return [...prev, device]
      })
    })

    const cleanupConnected = window.electronAPI.device.onDeviceConnected((device) => {
      setDevices(prev =>
        prev.map(d => d.deviceId === device.deviceId ? { ...d, ...device, connected: true } : d)
      )
    })

    const cleanupDisconnected = window.electronAPI.device.onDeviceDisconnected((deviceId) => {
      setDevices(prev =>
        prev.map(d => d.deviceId === deviceId ? { ...d, connected: false } : d)
      )
    })

    const cleanupUpdated = window.electronAPI.device.onDeviceUpdated((device) => {
      setDevices(prev => {
        const exists = prev.find(d => d.deviceId === device.deviceId)
        if (exists) return prev.map(d => d.deviceId === device.deviceId ? { ...d, ...device } : d)
        return [...prev, device]
      })
    })

    const cleanupRemoved = window.electronAPI.device.onDeviceRemoved((deviceId) => {
      setDevices(prev => prev.filter(d => d.deviceId !== deviceId))
    })

    return () => {
      cleanupFound()
      cleanupConnected()
      cleanupDisconnected()
      cleanupUpdated()
      cleanupRemoved()
    }
  }, [])

  // Fetch connection info for connected devices
  useEffect(() => {
    const fetchConnectionInfo = async () => {
      const newMap: Record<string, { route: string; host: string; port: number }> = {}
      for (const device of devices) {
        if (device.connected) {
          try {
            const info = await window.electronAPI.device.getConnectionInfo(device.deviceId)
            if (info) {
              newMap[device.deviceId] = info
            }
          } catch {
            // ignore
          }
        }
      }
      setConnectionInfoMap(newMap)
    }
    fetchConnectionInfo()
  }, [devices])

  const loadDevices = async () => {
    try {
      const deviceList = await window.electronAPI.device.getAll()
      setDevices(deviceList)
    } catch (error) {
      console.error('Failed to load devices:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddDevice = async () => {
    setPairingOpen(true)
    setPairingStatus('generating')
    setPairingError('')
    setActiveStep(0)

    try {
      // Start pairing server and broadcast — Android will auto-discover and connect
      await window.electronAPI.pairing.start('DeviceDoctor Desktop')
      setPairingStatus('connecting')
      setActiveStep(1)
      // Now waiting for Android to fetch pairing data via tunnel and complete pairing
      // The onPairingComplete listener (registered in useEffect) will handle success
    } catch (error: any) {
      setPairingStatus('error')
      setPairingError(error.message || 'Failed to start pairing')
    }
  }

  const handleRemoveDevice = (device: any) => {
    setDeviceToRemove(device)
    setRemoveDialogOpen(true)
  }

  const confirmRemoveDevice = async () => {
    if (deviceToRemove) {
      try {
        await window.electronAPI.device.remove(deviceToRemove.deviceId)
      } catch (error) {
        console.error('Failed to remove device:', error)
      }
    }
    setRemoveDialogOpen(false)
    setDeviceToRemove(null)
  }

  // Listen for pairing completion
  useEffect(() => {
    const cleanup = window.electronAPI.pairing.onPairingComplete((device) => {
      setPairingStatus('success')
      setActiveStep(2)
      // Reload devices after a short delay
      setTimeout(() => loadDevices(), 1000)
    })

    return cleanup
  }, [])

  const handleClosePairing = useCallback(() => {
    if (pairingStatus === 'connecting') {
      window.electronAPI.pairing.cancel()
    }
    setPairingOpen(false)
    setPairingStatus('idle')
    setPairingError('')
    setActiveStep(0)
  }, [pairingStatus])

  return (
    <Box>
      {/* Add Device Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={handleAddDevice}
        >
          Add Device
        </Button>
      </Box>

      {/* Empty State */}
      {devices.length === 0 && !loading && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            py: 10,
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(108,92,231,0.12) 0%, rgba(162,155,254,0.12) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 3,
            }}
          >
            <DevicesOther sx={{ fontSize: 40, color: '#6C5CE7' }} />
          </Box>
          <Typography
            variant="h6"
            sx={{ mb: 1, color: '#2D3436', fontWeight: 600 }}
          >
            No devices connected
          </Typography>
          <Typography
            variant="body2"
            sx={{ mb: 3, color: '#636E72', maxWidth: 360, textAlign: 'center' }}
          >
            Pair your Android device to start managing SMS, contacts, apps, and files remotely.
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleAddDevice}
          >
            Pair Your First Device
          </Button>
        </Box>
      )}

      {/* Device Cards */}
      <Grid container spacing={3}>
        {devices.map((device) => (
          <Grid item xs={12} md={6} lg={4} key={device.deviceId}>
            <Card sx={{ overflow: 'hidden' }}>
              {/* Top gradient accent bar */}
              <Box
                sx={{
                  height: 4,
                  background: device.connected
                    ? 'linear-gradient(90deg, #00B894 0%, #55EFC4 100%)'
                    : 'linear-gradient(90deg, #B2BEC3 0%, #DFE6E9 100%)',
                }}
              />
              <CardContent sx={{ pt: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  {/* Icon in rounded container */}
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '14px',
                      background: device.connected
                        ? 'linear-gradient(135deg, rgba(0,184,148,0.1) 0%, rgba(85,239,196,0.1) 100%)'
                        : 'linear-gradient(135deg, rgba(178,190,195,0.1) 0%, rgba(223,230,233,0.15) 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mr: 2,
                    }}
                  >
                    <PhoneAndroid
                      sx={{
                        fontSize: 26,
                        color: device.connected ? '#00B894' : '#B2BEC3',
                      }}
                    />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: 600, color: '#2D3436', lineHeight: 1.3 }}
                      noWrap
                    >
                      {device.deviceName}
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#636E72' }} noWrap>
                      {device.manufacturer} {device.model}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => handleRemoveDevice(device)}
                    sx={{ color: '#B2BEC3', '&:hover': { color: '#E17055' } }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>

                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <Chip
                    label={device.connected ? 'Connected' : 'Disconnected'}
                    size="small"
                    sx={{
                      backgroundColor: device.connected
                        ? 'rgba(0,184,148,0.1)'
                        : 'rgba(178,190,195,0.15)',
                      color: device.connected ? '#00B894' : '#636E72',
                      fontWeight: 600,
                      border: 'none',
                    }}
                  />
                  {(() => {
                    const connInfo = connectionInfoMap[device.deviceId]
                    if (connInfo) {
                      const routeConfig: Record<string, { icon: React.ReactElement; label: string }> = {
                        tunnel: { icon: <Language sx={{ fontSize: '14px !important' }} />, label: 'Tunnel' },
                        adb: { icon: <Usb sx={{ fontSize: '14px !important' }} />, label: 'ADB' },
                        direct: { icon: <SignalWifi4Bar sx={{ fontSize: '14px !important' }} />, label: 'Direct' },
                      }
                      const cfg = routeConfig[connInfo.route] || routeConfig.direct
                      return (
                        <Chip
                          icon={cfg.icon}
                          label={cfg.label}
                          size="small"
                          sx={{
                            backgroundColor: 'rgba(108,92,231,0.08)',
                            color: '#6C5CE7',
                            fontWeight: 500,
                            border: 'none',
                            '& .MuiChip-icon': { color: '#6C5CE7' },
                          }}
                        />
                      )
                    }
                    return (
                      <Chip
                        icon={
                          device.connectionType === 'wifi' ? (
                            <SignalWifi4Bar sx={{ fontSize: '14px !important' }} />
                          ) : (
                            <Bluetooth sx={{ fontSize: '14px !important' }} />
                          )
                        }
                        label={device.connectionType?.toUpperCase()}
                        size="small"
                        sx={{
                          backgroundColor: 'rgba(108,92,231,0.08)',
                          color: '#6C5CE7',
                          fontWeight: 500,
                          border: 'none',
                          '& .MuiChip-icon': { color: '#6C5CE7' },
                        }}
                      />
                    )
                  })()}
                </Box>

                {/* Info section with subtle background */}
                <Box
                  sx={{
                    backgroundColor: '#F8F9FC',
                    borderRadius: '10px',
                    p: 1.5,
                    mb: 2,
                  }}
                >
                  <Typography variant="body2" sx={{ color: '#636E72', fontSize: '0.8rem' }}>
                    Android {device.androidVersion}
                  </Typography>
                  {connectionInfoMap[device.deviceId] && (
                    <Typography variant="body2" sx={{ color: '#636E72', fontSize: '0.8rem' }}>
                      {connectionInfoMap[device.deviceId].host}:{connectionInfoMap[device.deviceId].port} ({connectionInfoMap[device.deviceId].route})
                    </Typography>
                  )}
                  <Typography variant="body2" sx={{ color: '#636E72', fontSize: '0.8rem' }}>
                    Last seen: {new Date(device.lastSeen).toLocaleString()}
                  </Typography>
                </Box>

                <Box>
                  {device.connected ? (
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={() =>
                        window.electronAPI.device.disconnect(device.deviceId)
                      }
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      fullWidth
                      onClick={() =>
                        window.electronAPI.device.connect(device.deviceId)
                      }
                    >
                      Connect
                    </Button>
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Pairing Dialog */}
      <Dialog
        open={pairingOpen}
        onClose={handleClosePairing}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Pair with Android Device
          <Button onClick={handleClosePairing} size="small" sx={{ minWidth: 0, color: '#636E72' }}>
            <Close />
          </Button>
        </DialogTitle>

        <DialogContent>
          <Stepper activeStep={activeStep} sx={{ mb: 3, mt: 1 }}>
            {pairingSteps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {pairingStatus === 'generating' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <CircularProgress size={48} sx={{ color: '#6C5CE7' }} />
              <Typography sx={{ mt: 2, fontWeight: 500 }}>Generating pairing data...</Typography>
            </Box>
          )}

          {pairingStatus === 'connecting' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <CircularProgress size={48} sx={{ color: '#6C5CE7', mb: 2 }} />
              <Typography sx={{ fontWeight: 500 }}>Waiting for Android device...</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                Open DeviceDoctor on your Android device and tap "Pair with Desktop".
                It will connect automatically.
              </Typography>
            </Box>
          )}

          {pairingStatus === 'success' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(0,184,148,0.12) 0%, rgba(85,239,196,0.12) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                }}
              >
                <CheckCircle sx={{ fontSize: 40, color: '#00B894' }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Device Paired Successfully!</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Your Android device is now connected.
              </Typography>
            </Box>
          )}

          {pairingStatus === 'error' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(225,112,85,0.12) 0%, rgba(225,112,85,0.06) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mb: 2,
                }}
              >
                <ErrorIcon sx={{ fontSize: 40, color: '#E17055' }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: '#E17055' }}>Pairing Failed</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                {pairingError}
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          {pairingStatus === 'success' || pairingStatus === 'error' ? (
            <Button onClick={handleClosePairing} variant="contained">
              Done
            </Button>
          ) : (
            <Button onClick={handleClosePairing} color="inherit">
              Cancel
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Remove Device Confirmation Dialog */}
      <Dialog
        open={removeDialogOpen}
        onClose={() => setRemoveDialogOpen(false)}
      >
        <DialogTitle>Remove Device</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Remove {deviceToRemove?.deviceName || 'this device'}? This will unpair
            the device and revoke its session.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button onClick={confirmRemoveDevice} color="error" variant="contained">
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Dashboard
