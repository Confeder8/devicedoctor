/**
 * Apps Page - Application management
 */

import React from 'react'
import { Box, Typography } from '@mui/material'
import { Apps as AppsIcon } from '@mui/icons-material'

const Apps: React.FC = () => {
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
          background: 'linear-gradient(135deg, rgba(253,203,110,0.15) 0%, rgba(253,203,110,0.08) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 3,
        }}
      >
        <AppsIcon sx={{ fontSize: 36, color: '#E17055' }} />
      </Box>
      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: '#2D3436' }}>
        No apps to display
      </Typography>
      <Typography variant="body2" sx={{ color: '#636E72', maxWidth: 320, textAlign: 'center' }}>
        Connect a device to view, install, and uninstall applications remotely.
      </Typography>
    </Box>
  )
}

export default Apps
