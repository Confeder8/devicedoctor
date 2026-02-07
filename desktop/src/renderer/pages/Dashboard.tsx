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
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
} from '@mui/material'
import {
  PhoneAndroid,
  SignalWifi4Bar,
  Bluetooth,
  Add,
  CheckCircle,
  Error as ErrorIcon,
  Close,
} from '@mui/icons-material'

const pairingSteps = ['Generate QR', 'Scan & Confirm', 'Connected']

type PairingStatus = 'idle' | 'generating' | 'waiting' | 'success' | 'error'

const Dashboard: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Pairing dialog state
  const [pairingOpen, setPairingOpen] = useState(false)
  const [pairingData, setPairingData] = useState<{ qrCode: string; pin: string } | null>(null)
  const [pairingStatus, setPairingStatus] = useState<PairingStatus>('idle')
  const [pairingError, setPairingError] = useState('')
  const [activeStep, setActiveStep] = useState(0)

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

    return () => {
      cleanupFound()
      cleanupConnected()
      cleanupDisconnected()
    }
  }, [])

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
    setPairingData(null)
    setActiveStep(0)

    try {
      const data = await window.electronAPI.pairing.start('My Computer')
      setPairingData(data)
      setPairingStatus('waiting')
      setActiveStep(1)
    } catch (error: any) {
      setPairingStatus('error')
      setPairingError(error.message || 'Failed to start pairing')
    }
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
    if (pairingStatus === 'waiting' || pairingStatus === 'generating') {
      window.electronAPI.pairing.cancel()
    }
    setPairingOpen(false)
    setPairingStatus('idle')
    setPairingData(null)
    setPairingError('')
    setActiveStep(0)
  }, [pairingStatus])

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Dashboard</Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={handleAddDevice}
        >
          Add Device
        </Button>
      </Box>

      {devices.length === 0 && !loading && (
        <Alert severity="info">
          No devices connected. Click "Add Device" to pair your Android device.
        </Alert>
      )}

      <Grid container spacing={3}>
        {devices.map((device) => (
          <Grid item xs={12} md={6} lg={4} key={device.deviceId}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <PhoneAndroid sx={{ mr: 1, fontSize: 40 }} />
                  <Box>
                    <Typography variant="h6">{device.deviceName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {device.manufacturer} {device.model}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Chip
                    label={device.connected ? 'Connected' : 'Disconnected'}
                    color={device.connected ? 'success' : 'default'}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  <Chip
                    icon={
                      device.connectionType === 'wifi' ? (
                        <SignalWifi4Bar />
                      ) : (
                        <Bluetooth />
                      )
                    }
                    label={device.connectionType?.toUpperCase()}
                    size="small"
                  />
                </Box>

                <Typography variant="body2" color="text.secondary">
                  Android {device.androidVersion}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Last seen: {new Date(device.lastSeen).toLocaleString()}
                </Typography>

                <Box sx={{ mt: 2 }}>
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
          <Button onClick={handleClosePairing} size="small" sx={{ minWidth: 0 }}>
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
              <CircularProgress size={48} />
              <Typography sx={{ mt: 2 }}>Generating pairing code...</Typography>
            </Box>
          )}

          {pairingStatus === 'waiting' && pairingData && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Scan this QR code with your Android device, then confirm the PIN.
              </Typography>

              <Box
                component="img"
                src={pairingData.qrCode}
                alt="Pairing QR Code"
                sx={{ width: 280, height: 280, mb: 2 }}
              />

              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                PIN Code
              </Typography>
              <Typography
                variant="h3"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  letterSpacing: '0.3em',
                  mb: 2,
                }}
              >
                {pairingData.pin}
              </Typography>

              <Alert severity="info" sx={{ width: '100%' }}>
                Make sure the PIN shown on your Android device matches the one above.
              </Alert>
            </Box>
          )}

          {pairingStatus === 'success' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <CheckCircle color="success" sx={{ fontSize: 64, mb: 2 }} />
              <Typography variant="h6">Device Paired Successfully!</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Your Android device is now connected.
              </Typography>
            </Box>
          )}

          {pairingStatus === 'error' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
              <ErrorIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
              <Typography variant="h6" color="error">Pairing Failed</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {pairingError}
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions>
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
    </Box>
  )
}

export default Dashboard
