/**
 * Apps Page - Application management
 */

import React from 'react'
import { Box, Typography, Alert } from '@mui/material'

const Apps: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Apps
      </Typography>
      <Alert severity="info">
        App management feature is ready. Connect a device to view, install, and uninstall apps.
      </Alert>
    </Box>
  )
}

export default Apps
