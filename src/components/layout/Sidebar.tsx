'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Box,
  useMediaQuery,
  useTheme,
  Tooltip,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import DescriptionIcon from '@mui/icons-material/Description'
import GavelIcon from '@mui/icons-material/Gavel'
import SecurityIcon from '@mui/icons-material/Security'
import SettingsIcon from '@mui/icons-material/Settings'
import NotificationsIcon from '@mui/icons-material/Notifications'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import PeopleIcon from '@mui/icons-material/People'
import HomeWorkIcon from '@mui/icons-material/HomeWork'
import DevicesIcon from '@mui/icons-material/Devices'
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial'
import SendIcon from '@mui/icons-material/Send'

export const DRAWER_WIDTH = 240
export const DRAWER_WIDTH_COLLAPSED = 64

interface SidebarProps {
  open: boolean
  onClose: () => void
  collapsed: boolean
}

const menuItems = [
  { text: 'Thành lập Viện', icon: <AccountBalanceIcon />, href: '/founding' },
  { text: 'Kiểm toán', icon: <SecurityIcon />, href: '/audit-logs' },
  { text: 'Thông báo', icon: <NotificationsIcon />, href: '/notifications' },
  { text: 'Cài đặt', icon: <SettingsIcon />, href: '/settings' },
]

export function Sidebar({ open, onClose, collapsed }: SidebarProps) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'))
  const pathname = usePathname()

  const currentWidth = collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH

  const drawerContent = (
    <Box sx={{ overflow: 'auto' }}>
      <Toolbar /> {/* Spacer for AppBar */}
      <List sx={{ px: collapsed ? 0.5 : 1, pt: 1 }}>
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

          const button = (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              selected={isActive}
              onClick={isMobile ? onClose : undefined}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                minHeight: 44,
                justifyContent: collapsed && !isMobile ? 'center' : 'initial',
                px: collapsed && !isMobile ? 1.5 : 2,
                '&.Mui-selected': {
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  '& .MuiListItemIcon-root': {
                    color: 'primary.contrastText',
                  },
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: collapsed && !isMobile ? 0 : 40,
                  justifyContent: 'center',
                  color: isActive ? 'inherit' : 'text.secondary',
                }}
              >
                {item.icon}
              </ListItemIcon>
              {(!collapsed || isMobile) && (
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 400,
                  }}
                />
              )}
            </ListItemButton>
          )

          // Show tooltip when collapsed on desktop
          if (collapsed && !isMobile) {
            return (
              <Tooltip key={item.href} title={item.text} placement="right" arrow>
                {button}
              </Tooltip>
            )
          }

          return button
        })}
      </List>
    </Box>
  )

  // Mobile: temporary drawer
  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={open}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        {drawerContent}
      </Drawer>
    )
  }

  // Desktop: permanent drawer (collapsible)
  return (
    <Drawer
      variant="permanent"
      open
      sx={{
        width: currentWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: currentWidth,
          boxSizing: 'border-box',
          transition: theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          overflowX: 'hidden',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  )
}
