'use client'

import { useState } from 'react'
import {
  AppBar as MuiAppBar,
  Toolbar,
  Typography,
  IconButton,
  InputBase,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Tooltip,
  alpha,
  styled,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import SearchIcon from '@mui/icons-material/Search'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import PersonIcon from '@mui/icons-material/Person'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import { useColorMode } from '@/lib/providers'
import { NotificationBell } from '@/components/NotificationBell'

interface AppBarProps {
  onMenuToggle: () => void
  drawerOpen: boolean
}

const Search = styled('div')(({ theme }) => ({
  position: 'relative',
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  '&:hover': {
    backgroundColor: alpha(theme.palette.common.white, 0.25),
  },
  marginRight: theme.spacing(2),
  marginLeft: theme.spacing(2),
  width: 'auto',
  [theme.breakpoints.down('sm')]: {
    display: 'none',
  },
}))

const SearchIconWrapper = styled('div')(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: '100%',
  position: 'absolute',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}))

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: 'inherit',
  width: '100%',
  '& .MuiInputBase-input': {
    padding: theme.spacing(1, 1, 1, 0),
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create('width'),
    width: '20ch',
    [theme.breakpoints.up('md')]: {
      width: '30ch',
    },
  },
}))

export function AppBar({ onMenuToggle, drawerOpen }: AppBarProps) {
  const { mode, toggleColorMode } = useColorMode()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const menuOpen = Boolean(anchorEl)

  const handleAvatarClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
  }

  return (
    <MuiAppBar
      position="fixed"
      sx={{
        zIndex: (t) => t.zIndex.drawer + 1,
        transition: (t) =>
          t.transitions.create(['width', 'margin'], {
            easing: t.transitions.easing.sharp,
            duration: t.transitions.duration.leavingScreen,
          }),
      }}
    >
      <Toolbar>
        {/* Hamburger menu button */}
        <IconButton
          color="inherit"
          aria-label="mở menu"
          edge="start"
          onClick={onMenuToggle}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>

        {/* Logo / App name */}
        <Typography
          variant="h6"
          noWrap
          component="div"
          sx={{ fontWeight: 700, letterSpacing: '0.05em' }}
        >
          IOCM
        </Typography>

        {/* Search */}
        <Search>
          <SearchIconWrapper>
            <SearchIcon />
          </SearchIconWrapper>
          <StyledInputBase
            placeholder="Tìm kiếm..."
            inputProps={{ 'aria-label': 'tìm kiếm' }}
          />
        </Search>

        <Box sx={{ flexGrow: 1 }} />

        {/* Dark mode toggle */}
        <Tooltip title={mode === 'light' ? 'Chế độ tối' : 'Chế độ sáng'}>
          <IconButton color="inherit" onClick={toggleColorMode} aria-label="chuyển đổi chế độ sáng/tối">
            {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
          </IconButton>
        </Tooltip>

        {/* Notifications */}
        <NotificationBell />

        {/* User avatar / menu */}
        <Tooltip title="Tài khoản">
          <IconButton
            onClick={handleAvatarClick}
            size="small"
            sx={{ ml: 1 }}
            aria-controls={menuOpen ? 'account-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={menuOpen ? 'true' : undefined}
            aria-label="menu tài khoản"
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
              A
            </Avatar>
          </IconButton>
        </Tooltip>

        {/* User dropdown menu */}
        <Menu
          id="account-menu"
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={handleMenuClose}
          onClick={handleMenuClose}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          slotProps={{
            paper: {
              sx: { width: 200, mt: 1 },
            },
          }}
        >
          <MenuItem>
            <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Hồ sơ</ListItemText>
          </MenuItem>
          <MenuItem>
            <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Cài đặt</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Đăng xuất</ListItemText>
          </MenuItem>
        </Menu>
      </Toolbar>
    </MuiAppBar>
  )
}
