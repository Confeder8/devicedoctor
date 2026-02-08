/**
 * Layout Component - Dark sidebar + lightweight sticky header
 */

import React from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Typography,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material'
import {
  Dashboard as DashboardIcon,
  Message as MessageIcon,
  Contacts as ContactsIcon,
  Apps as AppsIcon,
  Folder as FolderIcon,
  Settings as SettingsIcon,
  FiberManualRecord as StatusDot,
} from '@mui/icons-material'

const drawerWidth = 220

const menuItems = [
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/dashboard' },
  { text: 'SMS', icon: <MessageIcon />, path: '/sms' },
  { text: 'Contacts', icon: <ContactsIcon />, path: '/contacts' },
  { text: 'Apps', icon: <AppsIcon />, path: '/apps' },
  { text: 'Files', icon: <FolderIcon />, path: '/files' },
]

const Layout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const currentPage =
    menuItems.find((item) => item.path === location.pathname)?.text ||
    (location.pathname === '/settings' ? 'Settings' : 'DeviceDoctor')

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* Dark Sidebar */}
      <Box
        component="nav"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          height: '100vh',
          backgroundColor: '#1E1E2E',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Brand Logo Area */}
        <Box
          sx={{
            px: 2.5,
            py: 2.5,
            background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '10px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              fontWeight: 700,
              color: '#fff',
            }}
          >
            D
          </Box>
          <Box>
            <Typography
              sx={{
                color: '#fff',
                fontSize: '0.95rem',
                fontWeight: 700,
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
              }}
            >
              DeviceDoctor
            </Typography>
            <Typography
              sx={{
                color: 'rgba(255,255,255,0.6)',
                fontSize: '0.65rem',
                fontWeight: 500,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Remote Control
            </Typography>
          </Box>
        </Box>

        {/* Nav Items */}
        <Box sx={{ flex: 1, py: 1.5, px: 1 }}>
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <ListItemButton
                key={item.text}
                onClick={() => navigate(item.path)}
                sx={{
                  borderRadius: '10px',
                  mb: 0.3,
                  py: 1,
                  px: 1.5,
                  position: 'relative',
                  backgroundColor: isActive
                    ? 'rgba(108, 92, 231, 0.15)'
                    : 'transparent',
                  '&:hover': {
                    backgroundColor: isActive
                      ? 'rgba(108, 92, 231, 0.2)'
                      : 'rgba(255,255,255,0.05)',
                  },
                  // Left accent border for active
                  '&::before': isActive
                    ? {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 3,
                        height: '60%',
                        borderRadius: '0 3px 3px 0',
                        backgroundColor: '#6C5CE7',
                      }
                    : {},
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 36,
                    color: isActive
                      ? '#A29BFE'
                      : 'rgba(255,255,255,0.4)',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontSize: '0.85rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive
                      ? '#FFFFFF'
                      : 'rgba(255,255,255,0.6)',
                  }}
                />
              </ListItemButton>
            )
          })}
        </Box>

        {/* Settings at bottom */}
        <Box sx={{ px: 1, pb: 1.5 }}>
          <ListItemButton
            onClick={() => navigate('/settings')}
            sx={{
              borderRadius: '10px',
              py: 1,
              px: 1.5,
              backgroundColor:
                location.pathname === '/settings'
                  ? 'rgba(108, 92, 231, 0.15)'
                  : 'transparent',
              '&:hover': {
                backgroundColor:
                  location.pathname === '/settings'
                    ? 'rgba(108, 92, 231, 0.2)'
                    : 'rgba(255,255,255,0.05)',
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 36,
                color:
                  location.pathname === '/settings'
                    ? '#A29BFE'
                    : 'rgba(255,255,255,0.4)',
              }}
            >
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText
              primary="Settings"
              primaryTypographyProps={{
                fontSize: '0.85rem',
                fontWeight:
                  location.pathname === '/settings' ? 600 : 400,
                color:
                  location.pathname === '/settings'
                    ? '#FFFFFF'
                    : 'rgba(255,255,255,0.6)',
              }}
            />
          </ListItemButton>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          backgroundColor: '#F8F9FC',
        }}
      >
        {/* Sticky Header */}
        <Box
          sx={{
            px: 3,
            py: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #E8ECF1',
            backgroundColor: 'rgba(248, 249, 252, 0.8)',
            backdropFilter: 'blur(12px)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              color: '#2D3436',
              letterSpacing: '-0.02em',
            }}
          >
            {currentPage}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StatusDot sx={{ fontSize: 8, color: '#00B894' }} />
            <Typography
              sx={{
                fontSize: '0.75rem',
                color: '#636E72',
                fontWeight: 500,
              }}
            >
              Ready
            </Typography>
          </Box>
        </Box>

        {/* Page Content */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            overflow: 'auto',
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}

export default Layout
