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
  Divider,
} from '@mui/material'

interface SettingsState {
  autoConnect: boolean
  showNotifications: boolean
  startOnBoot: boolean
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsState>({
    autoConnect: true,
    showNotifications: true,
    startOnBoot: false,
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

  if (!loaded) return null

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            General
          </Typography>
          <List>
            <ListItem>
              <ListItemText
                primary="Auto-connect to devices"
                secondary="Automatically connect to previously paired devices"
              />
              <Switch
                checked={settings.autoConnect}
                onChange={(e) => handleToggle('autoConnect', e.target.checked)}
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                primary="Show notifications"
                secondary="Show desktop notifications for incoming messages"
              />
              <Switch
                checked={settings.showNotifications}
                onChange={(e) => handleToggle('showNotifications', e.target.checked)}
              />
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText
                primary="Start on system boot"
                secondary="Launch DeviceDoctor when your computer starts"
              />
              <Switch
                checked={settings.startOnBoot}
                onChange={(e) => handleToggle('startOnBoot', e.target.checked)}
              />
            </ListItem>
          </List>
        </CardContent>
      </Card>

      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            About
          </Typography>
          <Typography variant="body2" color="text.secondary">
            DeviceDoctor v1.0.0
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Secure wireless Android remote control
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}

export default Settings
