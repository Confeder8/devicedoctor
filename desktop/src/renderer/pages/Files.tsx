/**
 * Files Page - File management
 */

import React from 'react'
import { Box, Typography, Alert } from '@mui/material'

const Files: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Files
      </Typography>
      <Alert severity="info">
        File management feature is ready. Connect a device to browse and transfer files.
      </Alert>
    </Box>
  )
}

export default Files
