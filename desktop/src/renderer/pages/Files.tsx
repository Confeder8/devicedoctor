/**
 * Files Page - File browser with upload/download, breadcrumbs, and directory management
 */

import React, { useEffect, useState, useMemo } from 'react'
import {
  Box,
  Typography,
  TextField,
  IconButton,
  InputAdornment,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tooltip,
  Snackbar,
  Alert,
  Card,
  LinearProgress,
  Breadcrumbs,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import {
  Folder as FolderIcon,
  InsertDriveFile,
  Search,
  Delete,
  CloudUpload,
  CloudDownload,
  CreateNewFolder,
  ArrowBack,
  Home,
  MoreVert,
  Image,
  VideoFile,
  AudioFile,
  PictureAsPdf,
  Description,
  FolderOpen,
  NavigateNext,
} from '@mui/icons-material'

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  mimeType?: string
  modified: number
}

type SortKey = 'name' | 'size' | 'modified'
type SortDir = 'asc' | 'desc'

const Files: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([])
  const [files, setFiles] = useState<FileEntry[]>([])
  const [currentPath, setCurrentPath] = useState('/sdcard')
  const [loading, setLoading] = useState(true)
  const [filesLoading, setFilesLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Dialogs
  const [mkdirOpen, setMkdirOpen] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; file: FileEntry } | null>(null)

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  })

  const connectedDevice = devices.find(d => d.connected)

  useEffect(() => {
    loadDevices()
    const cleanup = window.electronAPI.files.onFileChanged(() => loadFiles(currentPath))
    return cleanup
  }, [])

  useEffect(() => {
    if (connectedDevice) loadFiles(currentPath)
  }, [connectedDevice?.deviceId])

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

  const loadFiles = async (path: string) => {
    if (!connectedDevice) return
    setFilesLoading(true)
    try {
      const result = await window.electronAPI.files.list(connectedDevice.deviceId, path)
      setFiles(result?.files || result || [])
      setCurrentPath(path)
    } catch (e) {
      console.error('Failed to load files:', e)
    } finally {
      setFilesLoading(false)
    }
  }

  const navigateTo = (path: string) => {
    loadFiles(path)
    setSearchQuery('')
  }

  const handleFileClick = (file: FileEntry) => {
    if (file.type === 'directory') {
      navigateTo(file.path)
    } else {
      setSelectedFile(file)
    }
  }

  const handleGoUp = () => {
    const parent = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/'
    navigateTo(parent)
  }

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault()
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, file })
  }

  const handleMkdir = async () => {
    if (!connectedDevice || !newDirName.trim()) return
    try {
      const dirPath = `${currentPath}/${newDirName.trim()}`
      await window.electronAPI.files.mkdir(connectedDevice.deviceId, dirPath)
      setMkdirOpen(false)
      setNewDirName('')
      await loadFiles(currentPath)
      setSnackbar({ open: true, message: 'Directory created', severity: 'success' })
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Failed to create directory', severity: 'error' })
    }
  }

  const handleDelete = async () => {
    if (!connectedDevice || !selectedFile) return
    try {
      await window.electronAPI.files.delete(connectedDevice.deviceId, selectedFile.path, selectedFile.type === 'directory')
      setDeleteOpen(false)
      setSelectedFile(null)
      await loadFiles(currentPath)
      setSnackbar({ open: true, message: `${selectedFile.name} deleted`, severity: 'success' })
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Delete failed', severity: 'error' })
    }
  }

  const handleUpload = async () => {
    if (!connectedDevice) return
    // Prompt user for file path (in real app this would use a file dialog)
    const localPath = prompt('Enter the local file path to upload:')
    if (!localPath) return
    const fileName = localPath.split(/[/\\]/).pop() || 'upload'
    const remotePath = `${currentPath}/${fileName}`

    setUploadProgress(0)
    try {
      await window.electronAPI.files.upload(connectedDevice.deviceId, localPath, remotePath, (progress) => {
        setUploadProgress(progress)
      })
      setUploadProgress(null)
      await loadFiles(currentPath)
      setSnackbar({ open: true, message: 'File uploaded', severity: 'success' })
    } catch (e: any) {
      setUploadProgress(null)
      setSnackbar({ open: true, message: e.message || 'Upload failed', severity: 'error' })
    }
  }

  const handleDownload = async (file: FileEntry) => {
    if (!connectedDevice || file.type === 'directory') return
    const localPath = prompt(`Save "${file.name}" to (enter local path):`, `C:\\Downloads\\${file.name}`)
    if (!localPath) return

    setDownloadProgress(0)
    try {
      await window.electronAPI.files.download(connectedDevice.deviceId, file.path, localPath, (progress) => {
        setDownloadProgress(progress)
      })
      setDownloadProgress(null)
      setSnackbar({ open: true, message: 'File downloaded', severity: 'success' })
    } catch (e: any) {
      setDownloadProgress(null)
      setSnackbar({ open: true, message: e.message || 'Download failed', severity: 'error' })
    }
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredFiles = useMemo(() => {
    const result = files.filter(f => f.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    // Directories first, then sort
    const dirs = result.filter(f => f.type === 'directory')
    const fileItems = result.filter(f => f.type === 'file')

    const compare = (a: FileEntry, b: FileEntry) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortKey === 'size') cmp = (a.size || 0) - (b.size || 0)
      else if (sortKey === 'modified') cmp = (a.modified || 0) - (b.modified || 0)
      return sortDir === 'asc' ? cmp : -cmp
    }

    return [...dirs.sort(compare), ...fileItems.sort(compare)]
  }, [files, searchQuery, sortKey, sortDir])

  const formatSize = (bytes: number) => {
    if (!bytes || bytes <= 0) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const formatDate = (ts: number) => {
    if (!ts) return '-'
    return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const getFileIcon = (file: FileEntry) => {
    if (file.type === 'directory') return <FolderIcon sx={{ fontSize: 22, color: '#FDCB6E' }} />
    const mime = file.mimeType || ''
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','bmp','svg','webp'].includes(ext))
      return <Image sx={{ fontSize: 22, color: '#E17055' }} />
    if (mime.startsWith('video/') || ['mp4','avi','mkv','mov','webm'].includes(ext))
      return <VideoFile sx={{ fontSize: 22, color: '#6C5CE7' }} />
    if (mime.startsWith('audio/') || ['mp3','wav','ogg','flac','aac'].includes(ext))
      return <AudioFile sx={{ fontSize: 22, color: '#00CEC9' }} />
    if (mime === 'application/pdf' || ext === 'pdf')
      return <PictureAsPdf sx={{ fontSize: 22, color: '#E17055' }} />
    if (['doc','docx','txt','rtf','odt','xls','xlsx','ppt','pptx'].includes(ext))
      return <Description sx={{ fontSize: 22, color: '#0984E3' }} />
    return <InsertDriveFile sx={{ fontSize: 22, color: '#B2BEC3' }} />
  }

  const breadcrumbParts = currentPath.split('/').filter(Boolean)

  if (!loading && !connectedDevice) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12 }}>
        <Box sx={{
          width: 72, height: 72, borderRadius: '18px',
          background: 'linear-gradient(135deg, rgba(0,184,148,0.12) 0%, rgba(85,239,196,0.08) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
        }}>
          <FolderIcon sx={{ fontSize: 36, color: '#00B894' }} />
        </Box>
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: '#2D3436' }}>No files to browse</Typography>
        <Typography variant="body2" sx={{ color: '#636E72', maxWidth: 320, textAlign: 'center' }}>
          Connect a device to browse and transfer files between your desktop and Android device.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <Box sx={{
        px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5,
        backgroundColor: '#FFFFFF', borderRadius: '16px', mb: 2, border: '1px solid #E8ECF1',
      }}>
        <Tooltip title="Go up">
          <IconButton size="small" onClick={handleGoUp} disabled={currentPath === '/'}>
            <ArrowBack sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Home">
          <IconButton size="small" onClick={() => navigateTo('/sdcard')}>
            <Home sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>

        {/* Breadcrumbs */}
        <Breadcrumbs separator={<NavigateNext sx={{ fontSize: 16 }} />} sx={{ flex: 1, mx: 1 }}>
          <Link component="button" underline="hover" onClick={() => navigateTo('/')}
            sx={{ fontSize: '0.82rem', color: '#636E72', cursor: 'pointer' }}>
            /
          </Link>
          {breadcrumbParts.map((part, i) => {
            const path = '/' + breadcrumbParts.slice(0, i + 1).join('/')
            const isLast = i === breadcrumbParts.length - 1
            return isLast ? (
              <Typography key={path} variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#2D3436' }}>
                {part}
              </Typography>
            ) : (
              <Link key={path} component="button" underline="hover" onClick={() => navigateTo(path)}
                sx={{ fontSize: '0.82rem', color: '#636E72', cursor: 'pointer' }}>
                {part}
              </Link>
            )
          })}
        </Breadcrumbs>

        <TextField
          size="small" placeholder="Search..." sx={{ width: 200 }}
          value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 16, color: '#B2BEC3' }} /></InputAdornment>,
          }}
        />
        <Tooltip title="New folder">
          <IconButton onClick={() => setMkdirOpen(true)} sx={{
            backgroundColor: 'rgba(0,184,148,0.08)', '&:hover': { backgroundColor: 'rgba(0,184,148,0.15)' },
          }}>
            <CreateNewFolder sx={{ fontSize: 20, color: '#00B894' }} />
          </IconButton>
        </Tooltip>
        <Button variant="contained" size="small" startIcon={<CloudUpload />} onClick={handleUpload}>
          Upload
        </Button>
      </Box>

      {/* Progress bars */}
      {uploadProgress !== null && (
        <Box sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, px: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#636E72' }}>Uploading...</Typography>
            <Typography variant="caption" sx={{ color: '#636E72' }}>{Math.round(uploadProgress)}%</Typography>
          </Box>
          <LinearProgress variant="determinate" value={uploadProgress}
            sx={{ borderRadius: 4, height: 4, backgroundColor: '#E8ECF1', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #00B894, #55EFC4)' } }}
          />
        </Box>
      )}
      {downloadProgress !== null && (
        <Box sx={{ mb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, px: 0.5 }}>
            <Typography variant="caption" sx={{ color: '#636E72' }}>Downloading...</Typography>
            <Typography variant="caption" sx={{ color: '#636E72' }}>{Math.round(downloadProgress)}%</Typography>
          </Box>
          <LinearProgress variant="determinate" value={downloadProgress}
            sx={{ borderRadius: 4, height: 4, backgroundColor: '#E8ECF1', '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #6C5CE7, #A29BFE)' } }}
          />
        </Box>
      )}

      {/* File Table */}
      <Card sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {filesLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : (
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40 }} />
                  <TableCell>
                    <TableSortLabel active={sortKey === 'name'} direction={sortKey === 'name' ? sortDir : 'asc'}
                      onClick={() => handleSort('name')}>
                      Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ width: 100 }}>
                    <TableSortLabel active={sortKey === 'size'} direction={sortKey === 'size' ? sortDir : 'asc'}
                      onClick={() => handleSort('size')}>
                      Size
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ width: 180 }}>
                    <TableSortLabel active={sortKey === 'modified'} direction={sortKey === 'modified' ? sortDir : 'asc'}
                      onClick={() => handleSort('modified')}>
                      Modified
                    </TableSortLabel>
                  </TableCell>
                  <TableCell sx={{ width: 50 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredFiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ textAlign: 'center', py: 6 }}>
                      <FolderOpen sx={{ fontSize: 40, color: '#B2BEC3', mb: 1 }} />
                      <Typography variant="body2" sx={{ color: '#636E72' }}>
                        {searchQuery ? 'No files match your search' : 'This directory is empty'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFiles.map((file) => (
                    <TableRow
                      key={file.path}
                      hover
                      sx={{ cursor: 'pointer', '&:hover': { backgroundColor: 'rgba(108,92,231,0.03)' } }}
                      onClick={() => handleFileClick(file)}
                      onContextMenu={(e) => handleContextMenu(e, file)}
                    >
                      <TableCell sx={{ py: 1 }}>{getFileIcon(file)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: file.type === 'directory' ? 600 : 400, color: '#2D3436' }}>
                          {file.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: '#636E72' }}>
                          {file.type === 'directory' ? '-' : formatSize(file.size)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: '#636E72' }}>{formatDate(file.modified)}</Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file) }}>
                          <MoreVert sx={{ fontSize: 16, color: '#B2BEC3' }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {/* Status bar */}
        <Box sx={{ px: 2, py: 0.8, borderTop: '1px solid #E8ECF1', backgroundColor: '#F8F9FC', display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="caption" sx={{ color: '#636E72' }}>
            {filteredFiles.length} item{filteredFiles.length !== 1 ? 's' : ''}
          </Typography>
          <Typography variant="caption" sx={{ color: '#636E72' }}>{currentPath}</Typography>
        </Box>
      </Card>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        {contextMenu?.file.type === 'file' && (
          <MenuItem onClick={() => { handleDownload(contextMenu!.file); setContextMenu(null) }}>
            <ListItemIcon><CloudDownload sx={{ fontSize: 18 }} /></ListItemIcon>
            <ListItemText>Download</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { setSelectedFile(contextMenu!.file); setDeleteOpen(true); setContextMenu(null) }}>
          <ListItemIcon><Delete sx={{ fontSize: 18, color: '#E17055' }} /></ListItemIcon>
          <ListItemText sx={{ '& .MuiTypography-root': { color: '#E17055' } }}>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Create Directory Dialog */}
      <Dialog open={mkdirOpen} onClose={() => setMkdirOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New Folder</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Folder Name" value={newDirName}
            onChange={(e) => setNewDirName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleMkdir() }}
            autoFocus sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMkdirOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleMkdir} variant="contained" disabled={!newDirName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete {selectedFile?.type === 'directory' ? 'Folder' : 'File'}</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{selectedFile?.name}</strong>?
            {selectedFile?.type === 'directory' && ' This will delete all contents inside.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error">Delete</Button>
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

export default Files
