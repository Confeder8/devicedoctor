/**
 * SMS Page - Message management
 */

import React from 'react'
import { Box, Typography, Alert } from '@mui/material'

const SMS: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        SMS Messages
      </Typography>
      <Alert severity="info">
        SMS management feature is ready. Connect a device to view and send messages.
      </Alert>
    </Box>
  )
}

export default SMS
