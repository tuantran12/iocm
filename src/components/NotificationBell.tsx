'use client'

import { useState } from 'react'
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Typography,
  Box,
  Divider,
  Button,
  ListItemText,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import NotificationsIcon from '@mui/icons-material/Notifications'
import CircleIcon from '@mui/icons-material/Circle'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(date: Date | string): string {
  const now = new Date()
  const d = typeof date === 'string' ? new Date(date) : date
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'Vừa xong'
  if (diffMin < 60) return `${diffMin} phút trước`
  if (diffHour < 24) return `${diffHour} giờ trước`
  if (diffDay < 7) return `${diffDay} ngày trước`
  return d.toLocaleDateString('vi-VN')
}

function truncateMessage(msg: string | null | undefined, maxLen = 80): string {
  if (!msg) return ''
  return msg.length > maxLen ? msg.slice(0, maxLen) + '...' : msg
}

// ─── Component ───────────────────────────────────────────────────────────────

export function NotificationBell() {
  const router = useRouter()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  // Fetch unread count with auto-refresh every 30 seconds
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 30_000 },
  )

  // Fetch recent notifications (first page, unread first)
  const { data: listData, isLoading } = trpc.notifications.list.useQuery(
    { page: 0, pageSize: 10 },
    { enabled: open },
  )

  const utils = trpc.useUtils()

  const markReadMutation = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate()
      utils.notifications.list.invalidate()
    },
  })

  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate()
      utils.notifications.list.invalidate()
    },
  })

  const unreadCount = unreadData?.count ?? 0

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleNotificationClick = (notification: {
    id: string
    read: boolean
    link?: string | null
  }) => {
    if (!notification.read) {
      markReadMutation.mutate({ id: notification.id })
    }
    handleClose()
    if (notification.link) {
      router.push(notification.link)
    }
  }

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate()
  }

  const handleViewAll = () => {
    handleClose()
    router.push('/notifications')
  }

  return (
    <>
      <Tooltip title="Thông báo">
        <IconButton
          color="inherit"
          aria-label="thông báo"
          onClick={handleOpen}
          aria-controls={open ? 'notification-menu' : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
        >
          <Badge badgeContent={unreadCount} color="error" max={99}>
            <NotificationsIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        id="notification-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{
          paper: {
            sx: {
              width: 380,
              maxHeight: 480,
              mt: 1,
            },
          },
        }}
      >
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Thông báo
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              startIcon={<DoneAllIcon />}
              onClick={handleMarkAllRead}
              disabled={markAllReadMutation.isPending}
              sx={{ textTransform: 'none' }}
            >
              Đánh dấu tất cả đã đọc
            </Button>
          )}
        </Box>
        <Divider />

        {/* Notification list */}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : listData?.items && listData.items.length > 0 ? (
          listData.items.map((notification) => (
            <MenuItem
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              sx={{
                py: 1.5,
                px: 2,
                alignItems: 'flex-start',
                bgcolor: notification.read ? 'transparent' : 'action.hover',
                '&:hover': {
                  bgcolor: notification.read ? 'action.hover' : 'action.selected',
                },
              }}
            >
              {/* Unread indicator */}
              <Box sx={{ mr: 1.5, mt: 0.5, minWidth: 10 }}>
                {!notification.read && (
                  <CircleIcon sx={{ fontSize: 10, color: 'primary.main' }} />
                )}
              </Box>

              <ListItemText
                primary={
                  <Typography
                    variant="body2"
                    fontWeight={notification.read ? 400 : 600}
                    noWrap
                  >
                    {notification.title}
                  </Typography>
                }
                secondary={
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 0.25 }}
                    >
                      {truncateMessage(notification.message)}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      sx={{ display: 'block', mt: 0.5 }}
                    >
                      {timeAgo(notification.createdAt)}
                    </Typography>
                  </Box>
                }
              />
            </MenuItem>
          ))
        ) : (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Không có thông báo nào
            </Typography>
          </Box>
        )}

        {/* Footer */}
        <Divider />
        <Box sx={{ p: 1, textAlign: 'center' }}>
          <Button
            size="small"
            onClick={handleViewAll}
            sx={{ textTransform: 'none' }}
          >
            Xem tất cả
          </Button>
        </Box>
      </Menu>
    </>
  )
}

export default NotificationBell
