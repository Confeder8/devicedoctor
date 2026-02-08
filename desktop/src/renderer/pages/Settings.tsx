/**
 * Settings Page
 */

import React, { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemText,
  Switch,
  TextField,
} from '@mui/material'
import {
  Settings as SettingsIcon,
  Language as TunnelIcon,
  Wifi as NetworkIcon,
  Info as InfoIcon,
} from '@mui/icons-material'

interface SettingsState {
  autoConnect: boolean
  showNotifications: boolean
  startOnBoot: boolean
  discoveryPort: number
  pairingPort: number
  tunnelHost: string
  tunnelPort: number
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsState>({
    autoConnect: true,
    showNotifications: true,
    startOnBoot: false,
    discoveryPort: 18445,
    pairingPort: 18443,
    tunnelHost: 'brjk01agv.localto.net',
    tunnelPort: 7580,
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await window.electronAPI.settings.getAll()
        setSettings({
          autoConnect: stored.autoConnect ?? true,
          showNotifications: stored.showNotifications ?? true,
          startOnBoot: stored.startOnBoot ?? false,
          discoveryPort: stored.discoveryPort ?? 18445,
          pairingPort: stored.pairingPort ?? 18443,
          tunnelHost: stored.tunnelHost ?? 'brjk01agv.localto.net',
          tunnelPort: stored.tunnelPort ?? 7580,
        })
      } catch (error) {
        console.error('Failed to load settings:', error)
      } finally {
        setLoaded(true)
      }
    }
    loadSettings()
  }, [])

  const handleToggle = async (key: keyof SettingsState, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    try {
      if (key === 'startOnBoot') {
        await window.electronAPI.settings.setStartOnBoot(value)
      } else {
        await window.electronAPI.settings.set(key, value)
      }
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error)
      // Revert on error
      setSettings(prev => ({ ...prev, [key]: !value }))
    }
  }

  const handlePortChange = async (key: 'discoveryPort' | 'pairingPort' | 'tunnelPort', value: string) => {
    const port = parseInt(value, 10)
    if (isNaN(port) || port < 1024 || port > 65535) return
    setSettings(prev => ({ ...prev, [key]: port }))
    try {
      await window.electronAPI.settings.set(key, port)
    } catch (error) {
      console.error(`Failed to update ${key}:`, error)
    }
  }

  const handleStringChange = async (key: 'tunnelHost', value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    try {
      await window.electronAPI.settings.set(key, value)
    } catch (error) {
      console.error(`Failed to update ${key}:`, error)
    }
  }

  if (!loaded) return null

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      {/* General Settings */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          {/* Section Header */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 3,
              py: 2,
              borderBottom: '1px solid #E8ECF1',
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(108,92,231,0.12) 0%, rgba(162,155,254,0.08) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SettingsIcon sx={{ fontSize: 18, color: '#6C5CE7' }} />
            </Box>
            <Typography variant="h6" sx={{ fontSize: '0.95rem' }}>
              General
            </Typography>
          </Box>

          <List sx={{ px: 1 }}>
            <ListItem sx={{ py: 1.5 }}>
              <ListItemText
                primary="Auto-connect to devices"
                secondary="Automatically connect to previously paired devices"
                primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: '#2D3436' }}
                secondaryTypographyProps={{ fontSize: '0.775rem' }}
              />
              <Switch
                checked={settings.autoConnect}
                onChange={(e) => handleToggle('autoConnect', e.target.checked)}
              />
            </ListItem>
            <ListItem sx={{ py: 1.5 }}>
              <ListItemText
                primary="Show notifications"
                secondary="Show desktop notifications for incoming messages"
                primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: '#2D3436' }}
                secondaryTypographyProps={{ fontSize: '0.775rem' }}
              />
              <Switch
                checked={settings.showNotifications}
                onChange={(e) => handleToggle('showNotifications', e.target.checked)}
              />
            </ListItem>
            <ListItem sx={{ py: 1.5 }}>
              <ListItemText
                primary="Start on system boot"
                secondary="Launch DeviceDoctor when your computer starts"
                primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: '#2D3436' }}
                secondaryTypographyProps={{ fontSize: '0.775rem' }}
              />
              <Switch
                checked={settings.startOnBoot}
                onChange={(e) => handleToggle('startOnBoot', e.target.checked)}
              />
            </ListItem>
          </List>
        </CardContent>
      </Card>

      {/* Tunnel Service */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 3,
              py: 2,
              borderBottom: '1px solid #E8ECF1',
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(0,184,148,0.12) 0%, rgba(85,239,196,0.08) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TunnelIcon sx={{ fontSize: 18, color: '#00B894' }} />
            </Box>
            <Typography variant="h6" sx={{ fontSize: '0.95rem' }}>
              Tunnel Service
            </Typography>
          </Box>

          <Box sx={{ px: 3, py: 2.5 }}>
            <Typography variant="body2" sx={{ mb: 2.5, color: '#636E72', lineHeight: 1.6 }}>
              Connect to your Android device through a tunnel service. Both devices
              connect to the tunnel automatically, regardless of what network they
              are on. No manual IP configuration needed.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Tunnel Host"
                size="small"
                value={settings.tunnelHost}
                onChange={(e) => handleStringChange('tunnelHost', e.target.value)}
                sx={{ flex: 2 }}
              />
              <TextField
                label="Tunnel Port"
                type="number"
                size="small"
                value={settings.tunnelPort}
                onChange={(e) => handlePortChange('tunnelPort', e.target.value)}
                inputProps={{ min: 1, max: 65535 }}
                sx={{ flex: 1 }}
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Pairing & Network */}
      <Card sx={{ mb: 2.5 }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 3,
              py: 2,
              borderBottom: '1px solid #E8ECF1',
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(253,203,110,0.15) 0%, rgba(253,203,110,0.08) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <NetworkIcon sx={{ fontSize: 18, color: '#E17055' }} />
            </Box>
            <Typography variant="h6" sx={{ fontSize: '0.95rem' }}>
              Pairing & Network
            </Typography>
          </Box>

          <Box sx={{ px: 3, py: 2.5 }}>
            <Typography variant="body2" sx={{ mb: 2.5, color: '#636E72', lineHeight: 1.6 }}>
              Configure ports used for device discovery and pairing. Changes take
              effect on the next pairing attempt. Both Android and desktop must use
              the same ports.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Discovery Port (UDP)"
                type="number"
                size="small"
                value={settings.discoveryPort}
                onChange={(e) => handlePortChange('discoveryPort', e.target.value)}
                inputProps={{ min: 1024, max: 65535 }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="Pairing Port (HTTP)"
                type="number"
                size="small"
                value={settings.pairingPort}
                onChange={(e) => handlePortChange('pairingPort', e.target.value)}
                inputProps={{ min: 1024, max: 65535 }}
                sx={{ flex: 1 }}
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 3,
              py: 2,
              borderBottom: '1px solid #E8ECF1',
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(108,92,231,0.12) 0%, rgba(162,155,254,0.08) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <InfoIcon sx={{ fontSize: 18, color: '#6C5CE7' }} />
            </Box>
            <Typography variant="h6" sx={{ fontSize: '0.95rem' }}>
              About
            </Typography>
          </Box>

          <Box sx={{ px: 3, py: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '1.1rem',
                flexShrink: 0,
              }}
            >
              D
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#2D3436' }}>
                DeviceDoctor v1.0.0
              </Typography>
              <Typography variant="body2" sx={{ color: '#636E72' }}>
                Secure wireless Android remote control
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}

export default Settings
