'use client'

import { useState } from 'react'
import { Box, Toolbar, useMediaQuery, useTheme } from '@mui/material'
import { AppBar } from './AppBar'
import { Sidebar, DRAWER_WIDTH, DRAWER_WIDTH_COLLAPSED } from './Sidebar'
import { Breadcrumb } from './Breadcrumb'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'))

  // Mobile: drawer open/close state
  const [mobileOpen, setMobileOpen] = useState(false)
  // Desktop: drawer collapsed state
  const [collapsed, setCollapsed] = useState(false)

  const handleMenuToggle = () => {
    if (isMobile) {
      setMobileOpen((prev) => !prev)
    } else {
      setCollapsed((prev) => !prev)
    }
  }

  const handleDrawerClose = () => {
    setMobileOpen(false)
  }

  const currentDrawerWidth = isMobile
    ? 0
    : collapsed
      ? DRAWER_WIDTH_COLLAPSED
      : DRAWER_WIDTH

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar onMenuToggle={handleMenuToggle} drawerOpen={!collapsed} />
      <Sidebar
        open={mobileOpen}
        onClose={handleDrawerClose}
        collapsed={collapsed}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { lg: `calc(100% - ${currentDrawerWidth}px)` },
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
        }}
      >
        <Toolbar /> {/* Spacer for fixed AppBar */}
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Breadcrumb />
          {children}
        </Box>
      </Box>
    </Box>
  )
}
