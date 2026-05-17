'use client'

import { createTheme, type ThemeOptions } from '@mui/material/styles'
import { viVN } from '@mui/material/locale'

/**
 * IOCM Theme — Material Design 3 inspired
 * Professional blue/teal palette for a legal/compliance institute
 * Vietnamese locale, Roboto with diacritics support, WCAG 2.1 AA
 */

// ─── Color Palette (Material Design 3 — Institute Professional) ───────────────

const palette = {
  primary: {
    main: '#1565C0',       // Blue 800 — trust, authority, professionalism
    light: '#5E92F3',
    dark: '#003C8F',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#00838F',       // Teal 800 — innovation, technology
    light: '#4FB3BF',
    dark: '#005662',
    contrastText: '#FFFFFF',
  },
  error: {
    main: '#D32F2F',
    light: '#EF5350',
    dark: '#C62828',
  },
  warning: {
    main: '#ED6C02',
    light: '#FF9800',
    dark: '#E65100',
  },
  success: {
    main: '#2E7D32',
    light: '#4CAF50',
    dark: '#1B5E20',
  },
  info: {
    main: '#0288D1',
    light: '#03A9F4',
    dark: '#01579B',
  },
}

const darkPalette = {
  primary: {
    main: '#90CAF9',       // Blue 200 — readable on dark backgrounds
    light: '#E3F2FD',
    dark: '#42A5F5',
    contrastText: '#0D1B2A',
  },
  secondary: {
    main: '#80DEEA',       // Teal 200
    light: '#B2EBF2',
    dark: '#4DD0E1',
    contrastText: '#0D1B2A',
  },
  error: {
    main: '#EF5350',
    light: '#E57373',
    dark: '#D32F2F',
  },
  warning: {
    main: '#FFA726',
    light: '#FFB74D',
    dark: '#F57C00',
  },
  success: {
    main: '#66BB6A',
    light: '#81C784',
    dark: '#388E3C',
  },
  info: {
    main: '#4FC3F7',
    light: '#81D4FA',
    dark: '#0288D1',
  },
}

// ─── Typography ───────────────────────────────────────────────────────────────

const typography: ThemeOptions['typography'] = {
  fontFamily: [
    'Roboto',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif',
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
    '"Segoe UI Symbol"',
  ].join(','),
  // Ensure Vietnamese diacritics render correctly
  h1: { fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.3 },
  h2: { fontSize: '1.875rem', fontWeight: 600, lineHeight: 1.35 },
  h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.4 },
  h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4 },
  h5: { fontSize: '1.125rem', fontWeight: 500, lineHeight: 1.5 },
  h6: { fontSize: '1rem', fontWeight: 500, lineHeight: 1.5 },
  body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
  body2: { fontSize: '0.875rem', lineHeight: 1.6 },
  button: { textTransform: 'none', fontWeight: 500 },
  caption: { fontSize: '0.75rem', lineHeight: 1.5 },
  overline: { fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.08em' },
}

// ─── Responsive Breakpoints ──────────────────────────────────────────────────

const breakpoints = {
  values: {
    xs: 0,
    sm: 600,
    md: 900,
    lg: 1200,
    xl: 1536,
  },
}

// ─── Component Overrides ─────────────────────────────────────────────────────

const components: ThemeOptions['components'] = {
  MuiCssBaseline: {
    styleOverrides: {
      // Ensure Vietnamese diacritics display properly
      html: {
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
      },
      body: {
        scrollbarWidth: 'thin',
      },
    },
  },
  MuiButton: {
    defaultProps: {
      size: 'medium',
      disableElevation: true,
    },
    styleOverrides: {
      root: {
        borderRadius: 8,
        padding: '8px 20px',
        fontWeight: 500,
      },
      containedPrimary: {
        '&:hover': {
          boxShadow: '0 2px 8px rgba(21, 101, 192, 0.3)',
        },
      },
    },
  },
  MuiTextField: {
    defaultProps: {
      size: 'small',
      fullWidth: true,
      variant: 'outlined',
    },
  },
  MuiCard: {
    defaultProps: {
      elevation: 0,
    },
    styleOverrides: {
      root: {
        borderRadius: 12,
        border: '1px solid',
        borderColor: 'rgba(0, 0, 0, 0.08)',
      },
    },
  },
  MuiPaper: {
    defaultProps: {
      elevation: 0,
    },
    styleOverrides: {
      root: {
        borderRadius: 12,
      },
    },
  },
  MuiAppBar: {
    defaultProps: {
      elevation: 0,
    },
    styleOverrides: {
      root: {
        borderBottom: '1px solid',
        borderColor: 'rgba(0, 0, 0, 0.08)',
      },
    },
  },
  MuiDrawer: {
    styleOverrides: {
      paper: {
        borderRight: '1px solid',
        borderColor: 'rgba(0, 0, 0, 0.08)',
      },
    },
  },
  MuiChip: {
    styleOverrides: {
      root: {
        borderRadius: 8,
        fontWeight: 500,
      },
    },
  },
  MuiTableHead: {
    styleOverrides: {
      root: {
        '& .MuiTableCell-head': {
          fontWeight: 600,
          backgroundColor: 'rgba(21, 101, 192, 0.04)',
        },
      },
    },
  },
  MuiDialog: {
    styleOverrides: {
      paper: {
        borderRadius: 16,
      },
    },
  },
  MuiTooltip: {
    defaultProps: {
      arrow: true,
    },
  },
  MuiTab: {
    styleOverrides: {
      root: {
        textTransform: 'none',
        fontWeight: 500,
        minHeight: 48,
      },
    },
  },
  MuiBreadcrumbs: {
    styleOverrides: {
      root: {
        fontSize: '0.875rem',
      },
    },
  },
  // NOTE: MuiDataGrid overrides will be added when @mui/x-data-grid is installed.
  // Recommended styles: density='comfortable', no border, rounded headers,
  // subtle row hover with primary color tint.
}

// ─── Light Theme (Default) ───────────────────────────────────────────────────

export const lightTheme = createTheme(
  {
    palette: {
      mode: 'light',
      ...palette,
      background: {
        default: '#F8FAFC',
        paper: '#FFFFFF',
      },
      text: {
        primary: '#1A2027',
        secondary: '#4A5568',
      },
      divider: 'rgba(0, 0, 0, 0.08)',
    },
    typography,
    breakpoints,
    components,
    shape: {
      borderRadius: 8,
    },
  },
  viVN, // Vietnamese locale for MUI component labels
)

// ─── Dark Theme ──────────────────────────────────────────────────────────────

export const darkTheme = createTheme(
  {
    palette: {
      mode: 'dark',
      ...darkPalette,
      background: {
        default: '#0D1B2A',
        paper: '#1B2838',
      },
      text: {
        primary: '#E2E8F0',
        secondary: '#A0AEC0',
      },
      divider: 'rgba(255, 255, 255, 0.08)',
    },
    typography,
    breakpoints,
    components: {
      ...components,
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: '1px solid',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderBottom: '1px solid',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: '1px solid',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          },
        },
      },
    },
    shape: {
      borderRadius: 8,
    },
  },
  viVN,
)

// Default export — light theme (as specified in design: "default light")
export const theme = lightTheme
