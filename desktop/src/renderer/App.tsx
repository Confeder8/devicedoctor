/**
 * Main App Component
 */

import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SMS from './pages/SMS'
import Contacts from './pages/Contacts'
import Apps from './pages/Apps'
import Files from './pages/Files'
import Settings from './pages/Settings'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#6C5CE7',
      light: '#A29BFE',
      dark: '#5A4BD1',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#00CEC9',
      light: '#55EFC4',
      dark: '#00B894',
    },
    background: {
      default: '#F8F9FC',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#2D3436',
      secondary: '#636E72',
    },
    success: {
      main: '#00B894',
      light: '#E8F8F5',
    },
    error: {
      main: '#E17055',
      light: '#FEF0ED',
    },
    warning: {
      main: '#FDCB6E',
      light: '#FFF9E6',
    },
    divider: '#E8ECF1',
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h4: {
      fontWeight: 700,
      fontSize: '1.75rem',
      letterSpacing: '-0.02em',
      color: '#2D3436',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.35rem',
      letterSpacing: '-0.01em',
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.05rem',
      letterSpacing: '-0.01em',
    },
    subtitle1: {
      fontWeight: 500,
      fontSize: '0.95rem',
    },
    body1: {
      fontSize: '0.9rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.825rem',
      lineHeight: 1.5,
      color: '#636E72',
    },
    button: {
      textTransform: 'none' as const,
      fontWeight: 600,
      letterSpacing: '0.01em',
    },
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    'none',
    '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
    '0 2px 6px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.06)',
    '0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)',
    '0 6px 16px rgba(0,0,0,0.08), 0 3px 6px rgba(0,0,0,0.05)',
    '0 8px 24px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.06)',
    '0 12px 32px rgba(0,0,0,0.12)',
    '0 16px 48px rgba(0,0,0,0.14)',
    '0 20px 56px rgba(0,0,0,0.16)',
    ...Array(16).fill('0 20px 56px rgba(0,0,0,0.16)'),
  ] as any,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#F8F9FC',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1px solid #E8ECF1',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '8px 20px',
          fontSize: '0.875rem',
          fontWeight: 600,
        },
        contained: {
          background: 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)',
          boxShadow: '0 2px 8px rgba(108, 92, 231, 0.3)',
          '&:hover': {
            background: 'linear-gradient(135deg, #5A4BD1 0%, #6C5CE7 100%)',
            boxShadow: '0 4px 12px rgba(108, 92, 231, 0.4)',
          },
        },
        outlined: {
          borderColor: '#E8ECF1',
          color: '#636E72',
          '&:hover': {
            borderColor: '#6C5CE7',
            color: '#6C5CE7',
            backgroundColor: 'rgba(108, 92, 231, 0.04)',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 44,
          height: 24,
          padding: 0,
        },
        switchBase: {
          padding: 2,
          '&.Mui-checked': {
            transform: 'translateX(20px)',
            color: '#fff',
            '& + .MuiSwitch-track': {
              backgroundColor: '#6C5CE7',
              opacity: 1,
            },
          },
        },
        thumb: {
          width: 20,
          height: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        },
        track: {
          borderRadius: 12,
          backgroundColor: '#DFE6E9',
          opacity: 1,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: '1px solid',
        },
        standardInfo: {
          backgroundColor: 'rgba(108, 92, 231, 0.06)',
          borderColor: 'rgba(108, 92, 231, 0.15)',
          color: '#5A4BD1',
        },
        standardSuccess: {
          backgroundColor: '#E8F8F5',
          borderColor: 'rgba(0, 184, 148, 0.2)',
        },
        standardError: {
          backgroundColor: '#FEF0ED',
          borderColor: 'rgba(225, 112, 85, 0.2)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            '& fieldset': {
              borderColor: '#E8ECF1',
            },
            '&:hover fieldset': {
              borderColor: '#A29BFE',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#6C5CE7',
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
          fontSize: '0.75rem',
        },
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: {
          fontWeight: 500,
          '&.Mui-active': {
            fontWeight: 600,
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1.15rem',
          fontWeight: 600,
        },
      },
    },
  },
})

const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="sms" element={<SMS />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="apps" element={<Apps />} />
            <Route path="files" element={<Files />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
