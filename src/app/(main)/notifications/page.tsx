'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  Paper,
  Button,
  Tabs,
  Tab,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Pagination,
  Skeleton,
  Divider,
  Stack,
} from '@mui/material'
import CircleIcon from '@mui/icons-material/Circle'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

type ReadFilter = 'all' | 'unread' | 'read'

const TAB_OPTIONS: { label: string; value: ReadFilter }[] = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Chưa đọc', value: 'unread' },
  { label: 'Đã đọc', value: 'read' },
]

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

function truncateMessage(msg: string | null | undefined, maxLen = 120): string {
  if (!msg) return ''
  return msg.length > maxLen ? msg.slice(0, maxLen) + '...' : msg
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter()

  // Tab / read filter state
  const [tabIndex, setTabIndex] = useState(0)
  const readFilter = TAB_OPTIONS[tabIndex].value

  // Pagination state
  const [page, setPage] = useState(0)
  const pageSize = 20

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue)
    setPage(0)
  }, [])

  // Build query input based on filter
  const queryInput = useMemo(() => {
    const input: { read?: boolean; page: number; pageSize: number } = {
      page,
      pageSize,
    }
    if (readFilter === 'unread') input.read = false
    if (readFilter === 'read') input.read = true
    return input
  }, [readFilter, page, pageSize])

  // tRPC queries
  const { data, isLoading } = trpc.notifications.list.useQuery(queryInput)
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  })

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

  const totalPages = useMemo(() => {
    if (!data?.total) return 0
    return Math.ceil(data.total / pageSize)
  }, [data?.total, pageSize])

  const handleNotificationClick = (notification: {
    id: string
    read: boolean
    link?: string | null
  }) => {
    if (!notification.read) {
      markReadMutation.mutate({ id: notification.id })
    }
    if (notification.link) {
      router.push(notification.link)
    }
  }

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate()
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Thông báo
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý tất cả thông báo của bạn.
            {unreadCount > 0 && ` Bạn có ${unreadCount} thông báo chưa đọc.`}
          </Typography>
        </Box>
        {unreadCount > 0 && (
          <Button
            variant="outlined"
            startIcon={<DoneAllIcon />}
            onClick={handleMarkAllRead}
            disabled={markAllReadMutation.isPending}
            sx={{ whiteSpace: 'nowrap', textTransform: 'none' }}
          >
            Đánh dấu tất cả đã đọc
          </Button>
        )}
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabIndex} onChange={handleTabChange} aria-label="Lọc thông báo">
            {TAB_OPTIONS.map((tab, idx) => (
              <Tab
                key={tab.value}
                label={tab.label}
                id={`notification-tab-${idx}`}
                aria-controls={`notification-tabpanel-${idx}`}
              />
            ))}
          </Tabs>
        </Box>

        {/* Notification List */}
        {isLoading ? (
          <Box sx={{ p: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Box key={i} sx={{ mb: 2 }}>
                <Skeleton variant="text" width="40%" height={24} />
                <Skeleton variant="text" width="80%" height={20} />
                <Skeleton variant="text" width="20%" height={16} />
              </Box>
            ))}
          </Box>
        ) : data?.items?.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <NotificationsNoneIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography color="text.secondary">
              {readFilter === 'unread'
                ? 'Không có thông báo chưa đọc.'
                : readFilter === 'read'
                  ? 'Không có thông báo đã đọc.'
                  : 'Không có thông báo nào.'}
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {data?.items?.map((notification: any, index: number) => (
              <Box key={notification.id}>
                {index > 0 && <Divider component="li" />}
                <ListItemButton
                  onClick={() => handleNotificationClick(notification)}
                  sx={{
                    py: 2,
                    px: 3,
                    bgcolor: notification.read ? 'transparent' : 'action.hover',
                    '&:hover': {
                      bgcolor: notification.read ? 'action.hover' : 'action.selected',
                    },
                  }}
                  aria-label={`${notification.title}${notification.read ? '' : ' — chưa đọc'}`}
                >
                  {/* Unread indicator */}
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    {!notification.read ? (
                      <CircleIcon sx={{ fontSize: 10, color: 'primary.main' }} />
                    ) : (
                      <Box sx={{ width: 10 }} />
                    )}
                  </ListItemIcon>

                  <ListItemText
                    primary={
                      <Typography
                        variant="body1"
                        fontWeight={notification.read ? 400 : 600}
                      >
                        {notification.title}
                      </Typography>
                    }
                    secondary={
                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">
                          {truncateMessage(notification.message)}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          {timeAgo(notification.createdAt)}
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItemButton>
              </Box>
            ))}
          </List>
        )}
      </Paper>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Pagination
            count={totalPages}
            page={page + 1}
            onChange={(_, newPage) => setPage(newPage - 1)}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}
    </Box>
  )
}
