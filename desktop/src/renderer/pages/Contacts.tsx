/**
 * Contacts Page - Contact management
 */

import React from 'react'
import { Box, Typography } from '@mui/material'
import { Contacts as ContactsIcon } from '@mui/icons-material'

const Contacts: React.FC = () => {
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
          background: 'linear-gradient(135deg, rgba(0,206,201,0.12) 0%, rgba(85,239,196,0.08) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 3,
        }}
      >
        <ContactsIcon sx={{ fontSize: 36, color: '#00CEC9' }} />
      </Box>
      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: '#2D3436' }}>
        No contacts available
      </Typography>
      <Typography variant="body2" sx={{ color: '#636E72', maxWidth: 320, textAlign: 'center' }}>
        Connect a device to browse and manage your contacts directly from the desktop.
      </Typography>
    </Box>
  )
}

export default Contacts
