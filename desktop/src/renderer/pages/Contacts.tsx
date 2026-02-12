/**
 * Contacts Page - Contact management with search, CRUD, and sync
 */

import React, { useEffect, useState, useMemo } from 'react'
import {
  Box,
  Typography,
  TextField,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
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
  CardContent,
} from '@mui/material'
import {
  Contacts as ContactsIcon,
  Search,
  Edit,
  Delete,
  Phone,
  Email,
  Close,
  Sync,
  PersonAdd,
  Star,
  ContentCopy,
} from '@mui/icons-material'

interface PhoneNumber {
  type: string
  number: string
  label?: string
}

interface EmailAddr {
  type: string
  email: string
  label?: string
}

interface Contact {
  id: string
  displayName: string
  phoneNumbers: PhoneNumber[]
  emails: EmailAddr[]
  starred?: boolean
  lastUpdated?: number
}

const Contacts: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [editForm, setEditForm] = useState({ displayName: '', phone: '', email: '' })
  const [isNew, setIsNew] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  })

  const connectedDevice = devices.find(d => d.connected)

  useEffect(() => {
    loadDevices()
    const cleanup = window.electronAPI.contacts.onContactChanged(() => {
      loadContacts()
    })
    return cleanup
  }, [])

  useEffect(() => {
    if (connectedDevice) loadContacts()
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

  const loadContacts = async () => {
    if (!connectedDevice) return
    try {
      const result = await window.electronAPI.contacts.getAll(connectedDevice.deviceId)
      setContacts(result?.contacts || result || [])
    } catch (e) {
      console.error('Failed to load contacts:', e)
    }
  }

  const handleSync = async () => {
    if (!connectedDevice) return
    setSyncing(true)
    try {
      await window.electronAPI.contacts.sync(connectedDevice.deviceId)
      await loadContacts()
      setSnackbar({ open: true, message: 'Contacts synced', severity: 'success' })
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Sync failed', severity: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  const handleCreateContact = () => {
    setIsNew(true)
    setEditForm({ displayName: '', phone: '', email: '' })
    setEditOpen(true)
  }

  const handleEditContact = () => {
    if (!selectedContact) return
    setIsNew(false)
    setEditForm({
      displayName: selectedContact.displayName,
      phone: selectedContact.phoneNumbers?.[0]?.number || '',
      email: selectedContact.emails?.[0]?.email || '',
    })
    setEditOpen(true)
  }

  const handleSaveContact = async () => {
    if (!connectedDevice || !editForm.displayName.trim()) return
    try {
      const contactData: any = {
        displayName: editForm.displayName.trim(),
        phoneNumbers: editForm.phone.trim() ? [{ type: 'Mobile', number: editForm.phone.trim() }] : [],
        emails: editForm.email.trim() ? [{ type: 'Home', email: editForm.email.trim() }] : [],
      }

      if (isNew) {
        await window.electronAPI.contacts.create(connectedDevice.deviceId, contactData)
        setSnackbar({ open: true, message: 'Contact created', severity: 'success' })
      } else if (selectedContact) {
        await window.electronAPI.contacts.update(connectedDevice.deviceId, selectedContact.id, contactData)
        setSnackbar({ open: true, message: 'Contact updated', severity: 'success' })
      }
      setEditOpen(false)
      await loadContacts()
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Failed to save', severity: 'error' })
    }
  }

  const handleDeleteContact = async () => {
    if (!connectedDevice || !selectedContact) return
    try {
      await window.electronAPI.contacts.delete(connectedDevice.deviceId, selectedContact.id)
      setSelectedContact(null)
      setDeleteOpen(false)
      await loadContacts()
      setSnackbar({ open: true, message: 'Contact deleted', severity: 'success' })
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Failed to delete', severity: 'error' })
    }
  }

  const filteredContacts = useMemo(() =>
    contacts
      .filter(c => c.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phoneNumbers?.some(p => p.number.includes(searchQuery)) ||
        c.emails?.some(e => e.email.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '')),
    [contacts, searchQuery]
  )

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ')
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase()
  }

  const avatarColors = ['#6C5CE7', '#00CEC9', '#E17055', '#00B894', '#FDCB6E', '#A29BFE']
  const getAvatarColor = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length]

  if (!loading && !connectedDevice) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12 }}>
        <Box sx={{
          width: 72, height: 72, borderRadius: '18px',
          background: 'linear-gradient(135deg, rgba(0,206,201,0.12) 0%, rgba(85,239,196,0.08) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
        }}>
          <ContactsIcon sx={{ fontSize: 36, color: '#00CEC9' }} />
        </Box>
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: '#2D3436' }}>No contacts available</Typography>
        <Typography variant="body2" sx={{ color: '#636E72', maxWidth: 320, textAlign: 'center' }}>
          Connect a device to browse and manage your contacts directly from the desktop.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      {/* Contact List */}
      <Box sx={{
        width: 360, borderRight: '1px solid #E8ECF1', display: 'flex', flexDirection: 'column',
        backgroundColor: '#FFFFFF', borderRadius: '16px 0 0 16px',
      }}>
        {/* Header */}
        <Box sx={{ p: 2, borderBottom: '1px solid #E8ECF1' }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <TextField
              size="small" fullWidth placeholder="Search contacts..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: '#B2BEC3' }} /></InputAdornment>,
              }}
            />
            <Tooltip title="Sync contacts">
              <IconButton onClick={handleSync} disabled={syncing} sx={{
                backgroundColor: 'rgba(0,206,201,0.08)', '&:hover': { backgroundColor: 'rgba(0,206,201,0.15)' },
              }}>
                {syncing ? <CircularProgress size={20} /> : <Sync sx={{ color: '#00CEC9' }} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Add contact">
              <IconButton onClick={handleCreateContact} sx={{
                backgroundColor: 'rgba(0,206,201,0.08)', '&:hover': { backgroundColor: 'rgba(0,206,201,0.15)' },
              }}>
                <PersonAdd sx={{ color: '#00CEC9' }} />
              </IconButton>
            </Tooltip>
          </Box>
          <Typography variant="body2" sx={{ color: '#636E72', fontSize: '0.75rem' }}>
            {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
          </Typography>
        </Box>

        {/* List */}
        <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
          ) : filteredContacts.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: '#636E72' }}>
                {searchQuery ? 'No contacts match your search' : 'No contacts found'}
              </Typography>
            </Box>
          ) : (
            filteredContacts.map((contact) => (
              <ListItemButton
                key={contact.id}
                selected={selectedContact?.id === contact.id}
                onClick={() => setSelectedContact(contact)}
                sx={{
                  px: 2, py: 1.2,
                  '&.Mui-selected': { backgroundColor: 'rgba(0,206,201,0.06)', '&:hover': { backgroundColor: 'rgba(0,206,201,0.1)' } },
                }}
              >
                <ListItemAvatar>
                  <Avatar sx={{
                    width: 42, height: 42, fontSize: '0.85rem', fontWeight: 600,
                    backgroundColor: getAvatarColor(contact.displayName),
                  }}>
                    {getInitials(contact.displayName)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Typography variant="subtitle2" noWrap sx={{ fontWeight: 500, color: '#2D3436' }}>
                      {contact.displayName}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="body2" noWrap sx={{ fontSize: '0.78rem', color: '#636E72' }}>
                      {contact.phoneNumbers?.[0]?.number || contact.emails?.[0]?.email || 'No details'}
                    </Typography>
                  }
                />
                {contact.starred && <Star sx={{ fontSize: 16, color: '#FDCB6E' }} />}
              </ListItemButton>
            ))
          )}
        </List>
      </Box>

      {/* Contact Detail View */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#F8F9FC', overflow: 'auto' }}>
        {!selectedContact ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <ContactsIcon sx={{ fontSize: 48, color: '#B2BEC3', mb: 2 }} />
            <Typography variant="body1" sx={{ color: '#636E72' }}>Select a contact to view details</Typography>
          </Box>
        ) : (
          <Box sx={{ p: 3, maxWidth: 600, mx: 'auto', width: '100%' }}>
            {/* Contact Header */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
              <Avatar sx={{
                width: 80, height: 80, fontSize: '2rem', fontWeight: 600, mb: 2,
                backgroundColor: getAvatarColor(selectedContact.displayName),
              }}>
                {getInitials(selectedContact.displayName)}
              </Avatar>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#2D3436', mb: 0.5 }}>
                {selectedContact.displayName}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Tooltip title="Edit">
                  <IconButton onClick={handleEditContact} sx={{
                    backgroundColor: 'rgba(108,92,231,0.08)', '&:hover': { backgroundColor: 'rgba(108,92,231,0.15)' },
                  }}>
                    <Edit sx={{ fontSize: 20, color: '#6C5CE7' }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                  <IconButton onClick={() => setDeleteOpen(true)} sx={{
                    backgroundColor: 'rgba(225,112,85,0.08)', '&:hover': { backgroundColor: 'rgba(225,112,85,0.15)' },
                  }}>
                    <Delete sx={{ fontSize: 20, color: '#E17055' }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Phone Numbers */}
            {selectedContact.phoneNumbers?.length > 0 && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ color: '#636E72', mb: 1.5, fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Phone Numbers
                  </Typography>
                  {selectedContact.phoneNumbers.map((phone, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', py: 1, borderBottom: i < selectedContact.phoneNumbers.length - 1 ? '1px solid #F0F2F5' : 'none' }}>
                      <Phone sx={{ fontSize: 18, color: '#00CEC9', mr: 1.5 }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: '#2D3436' }}>{phone.number}</Typography>
                        <Typography variant="caption" sx={{ color: '#636E72' }}>{phone.type || phone.label || 'Phone'}</Typography>
                      </Box>
                      <Tooltip title="Copy">
                        <IconButton size="small" onClick={() => { navigator.clipboard.writeText(phone.number) }}>
                          <ContentCopy sx={{ fontSize: 14, color: '#B2BEC3' }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Email Addresses */}
            {selectedContact.emails?.length > 0 && (
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="subtitle2" sx={{ color: '#636E72', mb: 1.5, fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Email Addresses
                  </Typography>
                  {selectedContact.emails.map((email, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', py: 1, borderBottom: i < selectedContact.emails.length - 1 ? '1px solid #F0F2F5' : 'none' }}>
                      <Email sx={{ fontSize: 18, color: '#6C5CE7', mr: 1.5 }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, color: '#2D3436' }}>{email.email}</Typography>
                        <Typography variant="caption" sx={{ color: '#636E72' }}>{email.type || email.label || 'Email'}</Typography>
                      </Box>
                      <Tooltip title="Copy">
                        <IconButton size="small" onClick={() => { navigator.clipboard.writeText(email.email) }}>
                          <ContentCopy sx={{ fontSize: 14, color: '#B2BEC3' }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* No details fallback */}
            {(!selectedContact.phoneNumbers?.length && !selectedContact.emails?.length) && (
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <Typography variant="body2" sx={{ color: '#636E72' }}>No phone numbers or emails</Typography>
                  <Button size="small" onClick={handleEditContact} sx={{ mt: 1 }}>Add details</Button>
                </CardContent>
              </Card>
            )}
          </Box>
        )}
      </Box>

      {/* Edit / Create Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isNew ? 'New Contact' : 'Edit Contact'}
          <IconButton onClick={() => setEditOpen(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Name" value={editForm.displayName}
            onChange={(e) => setEditForm(f => ({ ...f, displayName: e.target.value }))}
            sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            fullWidth label="Phone Number" value={editForm.phone}
            onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="+1234567890" sx={{ mb: 2 }}
          />
          <TextField
            fullWidth label="Email" value={editForm.email}
            onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
            placeholder="name@example.com"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleSaveContact} variant="contained" disabled={!editForm.displayName.trim()}>
            {isNew ? 'Create' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Contact</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{selectedContact?.displayName}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleDeleteContact} variant="contained" color="error">Delete</Button>
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

export default Contacts
