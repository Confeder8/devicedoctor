/**
 * Apps Page - Application management with grid view, details, install/uninstall
 */

import React, { useEffect, useState, useMemo } from 'react'
import {
  Box,
  Typography,
  TextField,
  IconButton,
  InputAdornment,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Snackbar,
  Alert,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Switch,
  FormControlLabel,
  LinearProgress,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material'
import {
  Apps as AppsIcon,
  Search,
  Delete,
  Close,
  CloudUpload,
  ViewModule,
  ViewList,
  Android,
} from '@mui/icons-material'

interface AppInfo {
  packageName: string
  appName: string
  versionName: string
  versionCode: number
  icon: string
  size: number
  installTime: number
  updateTime: number
  isSystemApp: boolean
}

const Apps: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([])
  const [apps, setApps] = useState<AppInfo[]>([])
  const [selectedApp, setSelectedApp] = useState<AppInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSystem, setShowSystem] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [detailOpen, setDetailOpen] = useState(false)
  const [uninstallOpen, setUninstallOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [installing, setInstalling] = useState(false)
  const [apkPath, setApkPath] = useState('')
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  })

  const connectedDevice = devices.find(d => d.connected)

  useEffect(() => {
    loadDevices()
    const cleanup = window.electronAPI.apps.onAppChanged(() => loadApps())
    return cleanup
  }, [])

  useEffect(() => {
    if (connectedDevice) loadApps()
  }, [connectedDevice?.deviceId, showSystem])

  const loadDevices = async () => {
    try {
      const deviceList = await window.electronAPI.device.getAll()
      setDevices(deviceList)
    } catch (e) {
      console.error('Failed to load devices:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadApps = async () => {
    if (!connectedDevice) return
    try {
      const result = await window.electronAPI.apps.getInstalled(connectedDevice.deviceId, showSystem)
      setApps(result?.apps || result || [])
    } catch (e) {
      console.error('Failed to load apps:', e)
    }
  }

  const handleUninstall = async () => {
    if (!connectedDevice || !selectedApp) return
    try {
      await window.electronAPI.apps.uninstall(connectedDevice.deviceId, selectedApp.packageName)
      setUninstallOpen(false)
      setSelectedApp(null)
      setDetailOpen(false)
      await loadApps()
      setSnackbar({ open: true, message: `${selectedApp.appName} uninstalled`, severity: 'success' })
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Uninstall failed', severity: 'error' })
    }
  }

  const handleInstall = async () => {
    if (!connectedDevice || !apkPath.trim()) return
    setInstalling(true)
    setInstallProgress(0)
    try {
      await window.electronAPI.apps.install(connectedDevice.deviceId, apkPath.trim(), (progress) => {
        setInstallProgress(progress)
      })
      setInstallOpen(false)
      setApkPath('')
      await loadApps()
      setSnackbar({ open: true, message: 'APK installed successfully', severity: 'success' })
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Install failed', severity: 'error' })
    } finally {
      setInstalling(false)
      setInstallProgress(0)
    }
  }

  const filteredApps = useMemo(() =>
    apps
      .filter(a => a.appName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.packageName?.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a.appName.localeCompare(b.appName)),
    [apps, searchQuery]
  )

  const formatSize = (bytes: number) => {
    if (!bytes) return 'Unknown'
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (ts: number) => {
    if (!ts) return 'Unknown'
    return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  }

  if (!loading && !connectedDevice) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12 }}>
        <Box sx={{
          width: 72, height: 72, borderRadius: '18px',
          background: 'linear-gradient(135deg, rgba(253,203,110,0.15) 0%, rgba(253,203,110,0.08) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
        }}>
          <AppsIcon sx={{ fontSize: 36, color: '#E17055' }} />
        </Box>
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: '#2D3436' }}>No apps to display</Typography>
        <Typography variant="body2" sx={{ color: '#636E72', maxWidth: 320, textAlign: 'center' }}>
          Connect a device to view, install, and uninstall applications remotely.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <Box sx={{
        px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 2,
        backgroundColor: '#FFFFFF', borderRadius: '16px', mb: 2, border: '1px solid #E8ECF1',
      }}>
        <TextField
          size="small" placeholder="Search apps..." sx={{ flex: 1, maxWidth: 400 }}
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: '#B2BEC3' }} /></InputAdornment>,
          }}
        />
        <FormControlLabel
          control={<Switch size="small" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} />}
          label={<Typography variant="body2" sx={{ fontSize: '0.8rem', color: '#636E72' }}>System apps</Typography>}
        />
        <ToggleButtonGroup
          value={viewMode} exclusive
          onChange={(_, v) => { if (v) setViewMode(v) }}
          size="small"
        >
          <ToggleButton value="grid"><ViewModule sx={{ fontSize: 18 }} /></ToggleButton>
          <ToggleButton value="list"><ViewList sx={{ fontSize: 18 }} /></ToggleButton>
        </ToggleButtonGroup>
        <Button
          variant="contained" size="small" startIcon={<CloudUpload />}
          onClick={() => setInstallOpen(true)}
        >
          Install APK
        </Button>
        <Typography variant="body2" sx={{ color: '#636E72', fontSize: '0.75rem', ml: 'auto' }}>
          {filteredApps.length} app{filteredApps.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* App Grid/List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : filteredApps.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ color: '#636E72' }}>
              {searchQuery ? 'No apps match your search' : 'No apps found'}
            </Typography>
          </Box>
        ) : viewMode === 'grid' ? (
          <Grid container spacing={2}>
            {filteredApps.map((app) => (
              <Grid item xs={6} sm={4} md={3} lg={2} key={app.packageName}>
                <Card sx={{ cursor: 'pointer', transition: 'transform 0.15s', '&:hover': { transform: 'translateY(-2px)' } }}>
                  <CardActionArea onClick={() => { setSelectedApp(app); setDetailOpen(true) }} sx={{ p: 2, textAlign: 'center' }}>
                    {app.icon ? (
                      <Box component="img" src={`data:image/png;base64,${app.icon}`}
                        sx={{ width: 48, height: 48, borderRadius: '12px', mb: 1.5, objectFit: 'contain' }}
                      />
                    ) : (
                      <Box sx={{
                        width: 48, height: 48, borderRadius: '12px', mb: 1.5, mx: 'auto',
                        background: 'linear-gradient(135deg, #E17055 0%, #FDCB6E 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Android sx={{ color: '#FFFFFF', fontSize: 24 }} />
                      </Box>
                    )}
                    <Typography variant="body2" noWrap sx={{ fontWeight: 500, color: '#2D3436', fontSize: '0.8rem' }}>
                      {app.appName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#B2BEC3' }}>{formatSize(app.size)}</Typography>
                    {app.isSystemApp && (
                      <Chip label="System" size="small" sx={{
                        mt: 0.5, fontSize: '0.6rem', height: 18,
                        backgroundColor: 'rgba(178,190,195,0.15)', color: '#636E72',
                      }} />
                    )}
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          /* List view */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filteredApps.map((app) => (
              <Card key={app.packageName} sx={{ cursor: 'pointer' }}
                onClick={() => { setSelectedApp(app); setDetailOpen(true) }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  {app.icon ? (
                    <Box component="img" src={`data:image/png;base64,${app.icon}`}
                      sx={{ width: 40, height: 40, borderRadius: '10px', mr: 2, objectFit: 'contain' }}
                    />
                  ) : (
                    <Box sx={{
                      width: 40, height: 40, borderRadius: '10px', mr: 2,
                      background: 'linear-gradient(135deg, #E17055 0%, #FDCB6E 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Android sx={{ color: '#FFFFFF', fontSize: 20 }} />
                    </Box>
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 500, color: '#2D3436' }}>
                      {app.appName}
                    </Typography>
                    <Typography variant="caption" noWrap sx={{ color: '#636E72' }}>
                      {app.packageName}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ color: '#B2BEC3', mx: 2 }}>v{app.versionName}</Typography>
                  <Typography variant="caption" sx={{ color: '#B2BEC3', mx: 2 }}>{formatSize(app.size)}</Typography>
                  {app.isSystemApp && (
                    <Chip label="System" size="small" sx={{
                      fontSize: '0.65rem', height: 20,
                      backgroundColor: 'rgba(178,190,195,0.15)', color: '#636E72',
                    }} />
                  )}
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Box>

      {/* App Detail Dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          App Details
          <IconButton onClick={() => setDetailOpen(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        {selectedApp && (
          <DialogContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              {selectedApp.icon ? (
                <Box component="img" src={`data:image/png;base64,${selectedApp.icon}`}
                  sx={{ width: 64, height: 64, borderRadius: '16px', mr: 2, objectFit: 'contain' }}
                />
              ) : (
                <Box sx={{
                  width: 64, height: 64, borderRadius: '16px', mr: 2,
                  background: 'linear-gradient(135deg, #E17055 0%, #FDCB6E 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Android sx={{ color: '#FFFFFF', fontSize: 32 }} />
                </Box>
              )}
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>{selectedApp.appName}</Typography>
                <Typography variant="body2" sx={{ color: '#636E72' }}>{selectedApp.packageName}</Typography>
              </Box>
            </Box>

            <Box sx={{ backgroundColor: '#F8F9FC', borderRadius: '12px', p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.8 }}>
                <Typography variant="body2" sx={{ color: '#636E72' }}>Version</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{selectedApp.versionName} ({selectedApp.versionCode})</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.8 }}>
                <Typography variant="body2" sx={{ color: '#636E72' }}>Size</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{formatSize(selectedApp.size)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.8 }}>
                <Typography variant="body2" sx={{ color: '#636E72' }}>Installed</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{formatDate(selectedApp.installTime)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.8 }}>
                <Typography variant="body2" sx={{ color: '#636E72' }}>Last Updated</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{formatDate(selectedApp.updateTime)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.8 }}>
                <Typography variant="body2" sx={{ color: '#636E72' }}>Type</Typography>
                <Chip label={selectedApp.isSystemApp ? 'System' : 'User'} size="small"
                  sx={{
                    fontSize: '0.7rem', height: 22,
                    backgroundColor: selectedApp.isSystemApp ? 'rgba(178,190,195,0.15)' : 'rgba(0,184,148,0.1)',
                    color: selectedApp.isSystemApp ? '#636E72' : '#00B894',
                  }}
                />
              </Box>
            </Box>
          </DialogContent>
        )}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDetailOpen(false)} color="inherit">Close</Button>
          {selectedApp && !selectedApp.isSystemApp && (
            <Button onClick={() => { setDetailOpen(false); setUninstallOpen(true) }} variant="contained" color="error"
              startIcon={<Delete />}>
              Uninstall
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Uninstall Confirmation */}
      <Dialog open={uninstallOpen} onClose={() => setUninstallOpen(false)}>
        <DialogTitle>Uninstall App</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to uninstall <strong>{selectedApp?.appName}</strong>? This will remove all app data.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUninstallOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleUninstall} variant="contained" color="error">Uninstall</Button>
        </DialogActions>
      </Dialog>

      {/* Install APK Dialog */}
      <Dialog open={installOpen} onClose={() => { if (!installing) setInstallOpen(false) }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Install APK
          <IconButton onClick={() => { if (!installing) setInstallOpen(false) }} size="small" disabled={installing}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#636E72', mb: 2 }}>
            Enter the path to the APK file on your computer to install it on the connected device.
          </Typography>
          <TextField
            fullWidth label="APK File Path" value={apkPath}
            onChange={(e) => setApkPath(e.target.value)}
            placeholder="C:\Downloads\app.apk" disabled={installing}
            sx={{ mb: 2 }}
          />
          {installing && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" sx={{ color: '#636E72' }}>Uploading...</Typography>
                <Typography variant="body2" sx={{ color: '#636E72' }}>{Math.round(installProgress)}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={installProgress}
                sx={{ borderRadius: 4, height: 6, backgroundColor: '#E8ECF1', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #6C5CE7, #A29BFE)' } }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setInstallOpen(false)} color="inherit" disabled={installing}>Cancel</Button>
          <Button onClick={handleInstall} variant="contained" disabled={!apkPath.trim() || installing}
            startIcon={installing ? <CircularProgress size={16} /> : <CloudUpload />}>
            {installing ? 'Installing...' : 'Install'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}

export default Apps
