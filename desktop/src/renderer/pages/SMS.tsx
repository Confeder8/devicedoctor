/**
 * SMS Page - Message management with conversation threads
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
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
  Badge,
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
} from '@mui/material'
import {
  Message as MessageIcon,
  Send,
  Search,
  Delete,
  MarkEmailRead,
  Add,
  DoneAll,
  Phone,
  Close,
} from '@mui/icons-material'

interface Conversation {
  threadId: string
  phoneNumber: string
  contactName?: string
  lastMessage: string
  lastMessageTimestamp: number
  unreadCount: number
}

interface SmsMessage {
  id: string
  threadId: string
  address: string
  body: string
  timestamp: number
  type: 'inbox' | 'sent' | 'draft'
  read: boolean
}

const SMS: React.FC = () => {
  const [devices, setDevices] = useState<any[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [selectedThread, setSelectedThread] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [messageText, setMessageText] = useState('')
  const [sending, setSending] = useState(false)
  const [newMessageOpen, setNewMessageOpen] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [newText, setNewText] = useState('')
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success'
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const connectedDevice = devices.find(d => d.connected)

  useEffect(() => {
    loadDevices()
    const cleanup = window.electronAPI.sms.onNewMessage((message: any) => {
      if (selectedThread && message.threadId === selectedThread.threadId) {
        setMessages(prev => [...prev, message])
      }
      loadConversations()
    })
    return cleanup
  }, [])

  useEffect(() => {
    if (connectedDevice) loadConversations()
  }, [connectedDevice?.deviceId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  const loadConversations = async () => {
    if (!connectedDevice) return
    try {
      const result = await window.electronAPI.sms.getConversations(connectedDevice.deviceId)
      setConversations(result?.conversations || result || [])
    } catch (e) {
      console.error('Failed to load conversations:', e)
    }
  }

  const loadMessages = useCallback(async (thread: Conversation) => {
    if (!connectedDevice) return
    setMessagesLoading(true)
    try {
      const result = await window.electronAPI.sms.getMessages(connectedDevice.deviceId, thread.threadId)
      setMessages(result?.messages || result || [])
    } catch (e) {
      console.error('Failed to load messages:', e)
    } finally {
      setMessagesLoading(false)
    }
  }, [connectedDevice])

  const handleSelectThread = (thread: Conversation) => {
    setSelectedThread(thread)
    loadMessages(thread)
  }

  const handleSendMessage = async () => {
    if (!connectedDevice || !selectedThread || !messageText.trim()) return
    setSending(true)
    try {
      await window.electronAPI.sms.send(connectedDevice.deviceId, selectedThread.phoneNumber, messageText.trim())
      setMessageText('')
      await loadMessages(selectedThread)
      setSnackbar({ open: true, message: 'Message sent', severity: 'success' })
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Failed to send', severity: 'error' })
    } finally {
      setSending(false)
    }
  }

  const handleNewMessage = async () => {
    if (!connectedDevice || !newPhone.trim() || !newText.trim()) return
    setSending(true)
    try {
      await window.electronAPI.sms.send(connectedDevice.deviceId, newPhone.trim(), newText.trim())
      setNewMessageOpen(false)
      setNewPhone('')
      setNewText('')
      await loadConversations()
      setSnackbar({ open: true, message: 'Message sent', severity: 'success' })
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Failed to send', severity: 'error' })
    } finally {
      setSending(false)
    }
  }

  const handleDeleteMessage = async (messageId: string) => {
    if (!connectedDevice) return
    try {
      await window.electronAPI.sms.delete(connectedDevice.deviceId, messageId)
      setMessages(prev => prev.filter(m => m.id !== messageId))
      setSnackbar({ open: true, message: 'Message deleted', severity: 'success' })
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message || 'Failed to delete', severity: 'error' })
    }
  }

  const handleMarkAsRead = async (messageId: string) => {
    if (!connectedDevice) return
    try {
      await window.electronAPI.sms.markAsRead(connectedDevice.deviceId, messageId)
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, read: true } : m))
    } catch (e) {
      console.error('Failed to mark as read:', e)
    }
  }

  const filteredConversations = conversations.filter(c =>
    (c.contactName?.toLowerCase() || c.phoneNumber).includes(searchQuery.toLowerCase()) ||
    c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  // Empty state: no connected device
  if (!loading && !connectedDevice) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 12 }}>
        <Box sx={{
          width: 72, height: 72, borderRadius: '18px',
          background: 'linear-gradient(135deg, rgba(108,92,231,0.12) 0%, rgba(162,155,254,0.08) 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3,
        }}>
          <MessageIcon sx={{ fontSize: 36, color: '#6C5CE7' }} />
        </Box>
        <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: '#2D3436' }}>No messages yet</Typography>
        <Typography variant="body2" sx={{ color: '#636E72', maxWidth: 320, textAlign: 'center' }}>
          Connect a device to view, send, and manage SMS messages from your desktop.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
      {/* Conversation List Sidebar */}
      <Box sx={{
        width: 340, borderRight: '1px solid #E8ECF1', display: 'flex', flexDirection: 'column',
        backgroundColor: '#FFFFFF', borderRadius: '16px 0 0 16px',
      }}>
        {/* Search & New Message */}
        <Box sx={{ p: 2, borderBottom: '1px solid #E8ECF1' }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <TextField
              size="small" fullWidth placeholder="Search conversations..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: '#B2BEC3' }} /></InputAdornment>,
              }}
            />
            <Tooltip title="New message">
              <IconButton onClick={() => setNewMessageOpen(true)} sx={{
                backgroundColor: 'rgba(108,92,231,0.08)', '&:hover': { backgroundColor: 'rgba(108,92,231,0.15)' },
              }}>
                <Add sx={{ color: '#6C5CE7' }} />
              </IconButton>
            </Tooltip>
          </Box>
          <Typography variant="body2" sx={{ color: '#636E72', fontSize: '0.75rem' }}>
            {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
          </Typography>
        </Box>

        {/* Conversation List */}
        <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
          ) : filteredConversations.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: '#636E72' }}>No conversations found</Typography>
            </Box>
          ) : (
            filteredConversations.map((conv) => (
              <ListItemButton
                key={conv.threadId}
                selected={selectedThread?.threadId === conv.threadId}
                onClick={() => handleSelectThread(conv)}
                sx={{
                  px: 2, py: 1.5,
                  '&.Mui-selected': { backgroundColor: 'rgba(108,92,231,0.06)', '&:hover': { backgroundColor: 'rgba(108,92,231,0.1)' } },
                }}
              >
                <ListItemAvatar>
                  <Badge badgeContent={conv.unreadCount || 0} color="primary" invisible={!conv.unreadCount}>
                    <Avatar sx={{
                      width: 44, height: 44,
                      background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
                      fontSize: '1rem', fontWeight: 600,
                    }}>
                      {(conv.contactName || conv.phoneNumber || '?')[0]?.toUpperCase()}
                    </Avatar>
                  </Badge>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Typography variant="subtitle2" noWrap sx={{ fontWeight: conv.unreadCount ? 700 : 500, color: '#2D3436' }}>
                      {conv.contactName || conv.phoneNumber}
                    </Typography>
                  }
                  secondary={
                    <Typography variant="body2" noWrap sx={{
                      fontSize: '0.78rem', color: conv.unreadCount ? '#2D3436' : '#636E72',
                      fontWeight: conv.unreadCount ? 500 : 400,
                    }}>
                      {conv.lastMessage}
                    </Typography>
                  }
                />
                <Typography variant="caption" sx={{ color: '#B2BEC3', fontSize: '0.7rem', ml: 1, whiteSpace: 'nowrap' }}>
                  {formatTime(conv.lastMessageTimestamp)}
                </Typography>
              </ListItemButton>
            ))
          )}
        </List>
      </Box>

      {/* Message Thread View */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#F8F9FC' }}>
        {!selectedThread ? (
          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <MessageIcon sx={{ fontSize: 48, color: '#B2BEC3', mb: 2 }} />
            <Typography variant="body1" sx={{ color: '#636E72' }}>Select a conversation to view messages</Typography>
          </Box>
        ) : (
          <>
            {/* Thread Header */}
            <Box sx={{
              px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 2,
              borderBottom: '1px solid #E8ECF1', backgroundColor: '#FFFFFF',
            }}>
              <Avatar sx={{
                width: 38, height: 38,
                background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
                fontSize: '0.9rem', fontWeight: 600,
              }}>
                {(selectedThread.contactName || selectedThread.phoneNumber || '?')[0]?.toUpperCase()}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#2D3436', lineHeight: 1.3 }}>
                  {selectedThread.contactName || selectedThread.phoneNumber}
                </Typography>
                <Typography variant="caption" sx={{ color: '#636E72' }}>
                  {selectedThread.phoneNumber}
                </Typography>
              </Box>
              <Tooltip title="Call">
                <IconButton size="small"><Phone sx={{ fontSize: 20, color: '#636E72' }} /></IconButton>
              </Tooltip>
            </Box>

            {/* Messages */}
            <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {messagesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
              ) : messages.length === 0 ? (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body2" sx={{ color: '#636E72' }}>No messages in this thread</Typography>
                </Box>
              ) : (
                messages.map((msg) => {
                  const isSent = msg.type === 'sent'
                  return (
                    <Box key={msg.id} sx={{
                      display: 'flex', justifyContent: isSent ? 'flex-end' : 'flex-start',
                      mb: 0.5, position: 'relative', '&:hover .msg-actions': { opacity: 1 },
                    }}>
                      <Box sx={{
                        maxWidth: '70%', px: 2, py: 1.2, borderRadius: isSent ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        backgroundColor: isSent ? '#6C5CE7' : '#FFFFFF',
                        color: isSent ? '#FFFFFF' : '#2D3436',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        position: 'relative',
                      }}>
                        <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.5, wordBreak: 'break-word' }}>
                          {msg.body}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, mt: 0.5 }}>
                          <Typography variant="caption" sx={{
                            fontSize: '0.65rem', color: isSent ? 'rgba(255,255,255,0.7)' : '#B2BEC3',
                          }}>
                            {formatTime(msg.timestamp)}
                          </Typography>
                          {isSent && <DoneAll sx={{ fontSize: 12, color: msg.read ? '#55EFC4' : 'rgba(255,255,255,0.5)' }} />}
                        </Box>
                      </Box>
                      {/* Hover actions */}
                      <Box className="msg-actions" sx={{
                        position: 'absolute', top: 0,
                        [isSent ? 'left' : 'right']: isSent ? 'auto' : 'auto',
                        [isSent ? 'right' : 'left']: isSent ? 'calc(70% + 8px)' : 'calc(70% + 8px)',
                        opacity: 0, transition: 'opacity 0.2s', display: 'flex', gap: 0.5,
                      }}>
                        {!msg.read && !isSent && (
                          <Tooltip title="Mark as read">
                            <IconButton size="small" onClick={() => handleMarkAsRead(msg.id)}>
                              <MarkEmailRead sx={{ fontSize: 16, color: '#636E72' }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => handleDeleteMessage(msg.id)}>
                            <Delete sx={{ fontSize: 16, color: '#E17055' }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </Box>

            {/* Message Input */}
            <Box sx={{
              px: 2.5, py: 1.5, borderTop: '1px solid #E8ECF1', backgroundColor: '#FFFFFF',
              display: 'flex', alignItems: 'center', gap: 1.5,
            }}>
              <TextField
                fullWidth size="small" placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() } }}
                multiline maxRows={3}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '20px', backgroundColor: '#F8F9FC' } }}
              />
              <IconButton
                onClick={handleSendMessage}
                disabled={!messageText.trim() || sending}
                sx={{
                  width: 42, height: 42,
                  background: messageText.trim() ? 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)' : '#E8ECF1',
                  color: '#FFFFFF', '&:hover': { background: 'linear-gradient(135deg, #5A4BD1 0%, #6C5CE7 100%)' },
                  '&.Mui-disabled': { backgroundColor: '#E8ECF1', color: '#B2BEC3' },
                }}
              >
                {sending ? <CircularProgress size={18} sx={{ color: '#FFFFFF' }} /> : <Send sx={{ fontSize: 18 }} />}
              </IconButton>
            </Box>
          </>
        )}
      </Box>

      {/* New Message Dialog */}
      <Dialog open={newMessageOpen} onClose={() => setNewMessageOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          New Message
          <IconButton onClick={() => setNewMessageOpen(false)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Phone Number" value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
            placeholder="+1234567890" sx={{ mb: 2, mt: 1 }}
          />
          <TextField
            fullWidth label="Message" value={newText} onChange={(e) => setNewText(e.target.value)}
            placeholder="Type your message..." multiline rows={3}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNewMessageOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleNewMessage} variant="contained" disabled={!newPhone.trim() || !newText.trim() || sending}>
            {sending ? <CircularProgress size={18} /> : 'Send'}
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

export default SMS
