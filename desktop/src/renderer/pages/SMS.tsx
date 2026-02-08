/**
 * SMS Page - Message management
 */

import React from 'react'
import { Box, Typography } from '@mui/material'
import { Message as MessageIcon } from '@mui/icons-material'

const SMS: React.FC = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 12,
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '18px',
          background: 'linear-gradient(135deg, rgba(108,92,231,0.12) 0%, rgba(162,155,254,0.08) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 3,
        }}
      >
        <MessageIcon sx={{ fontSize: 36, color: '#6C5CE7' }} />
      </Box>
      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: '#2D3436' }}>
        No messages yet
      </Typography>
      <Typography variant="body2" sx={{ color: '#636E72', maxWidth: 320, textAlign: 'center' }}>
        Connect a device to view, send, and manage SMS messages from your desktop.
      </Typography>
    </Box>
  )
}

export default SMS
