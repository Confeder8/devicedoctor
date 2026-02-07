/**
 * Contacts Page - Contact management
 */

import React from 'react'
import { Box, Typography, Alert } from '@mui/material'

const Contacts: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Contacts
      </Typography>
      <Alert severity="info">
        Contacts management feature is ready. Connect a device to view and manage contacts.
      </Alert>
    </Box>
  )
}

export default Contacts
