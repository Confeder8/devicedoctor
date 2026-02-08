/**
 * Files Page - File management
 */

import React from 'react'
import { Box, Typography } from '@mui/material'
import { Folder as FolderIcon } from '@mui/icons-material'

const Files: React.FC = () => {
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
          background: 'linear-gradient(135deg, rgba(0,184,148,0.12) 0%, rgba(85,239,196,0.08) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 3,
        }}
      >
        <FolderIcon sx={{ fontSize: 36, color: '#00B894' }} />
      </Box>
      <Typography variant="h6" sx={{ mb: 1, fontWeight: 600, color: '#2D3436' }}>
        No files to browse
      </Typography>
      <Typography variant="body2" sx={{ color: '#636E72', maxWidth: 320, textAlign: 'center' }}>
        Connect a device to browse and transfer files between your desktop and Android device.
      </Typography>
    </Box>
  )
}

export default Files
