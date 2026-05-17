'use client'

import {
  Box,
  Drawer,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Divider,
  Stack,
  CircularProgress,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import PushPinIcon from '@mui/icons-material/PushPin'
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined'
import { trpc } from '@/lib/trpc'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PinnedMessagesSidebarProps {
  groupId: string
  open: boolean
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateContent(content: string, maxLength = 120): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength) + '...'
}

// ─── Pinned Message Item ─────────────────────────────────────────────────────

interface PinnedMessageData {
  id: string
  senderId: string
  senderName?: string | null
  content: string
  createdAt: string | Date
}

function PinnedMessageItem({
  msg,
  onUnpin,
  isUnpinning,
  showDivider,
}: {
  msg: PinnedMessageData
  onUnpin: (id: string) => void
  isUnpinning: boolean
  showDivider: boolean
}) {
  return (
    <Box>
      <ListItem
        sx={{ px: 2, py: 1.5, alignItems: 'flex-start' }}
        secondaryAction={
          <IconButton
            edge="end"
            size="small"
            onClick={() => onUnpin(msg.id)}
            disabled={isUnpinning}
            aria-label="Bỏ ghim"
            title="Bỏ ghim"
          >
            <PushPinOutlinedIcon fontSize="small" color="warning" />
          </IconButton>
        }
      >
        <ListItemText
          primary={
            <Typography variant="body2" fontWeight={500}>
              {msg.senderName || msg.senderId}
            </Typography>
          }
          secondary={
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              <Typography
                variant="body2"
                color="text.primary"
                sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {truncateContent(msg.content)}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {formatTimestamp(msg.createdAt)}
              </Typography>
            </Stack>
          }
        />
      </ListItem>
      {showDivider && <Divider component="li" />}
    </Box>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PinnedMessagesSidebar({
  groupId,
  open,
  onClose,
}: PinnedMessagesSidebarProps) {
  const utils = trpc.useUtils()

  // Fetch pinned messages
  const { data: rawPinnedMessages, isLoading } = trpc.chat.getPinnedMessages.useQuery(
    { groupId },
    { enabled: open && !!groupId }
  )

  // Cast to simpler type to avoid TS2589 deep instantiation with tRPC + MUI
  const pinnedMessages: PinnedMessageData[] | undefined = (rawPinnedMessages as any[])?.map(
    (msg: any) => ({
      id: msg.id as string,
      senderId: msg.senderId as string,
      senderName: (msg.senderName as string) ?? null,
      content: msg.content as string,
      createdAt: msg.createdAt as string | Date,
    })
  )

  // Unpin mutation
  const unpinMutation = trpc.chat.pinMessage.useMutation({
    onSuccess: () => {
      utils.chat.getPinnedMessages.invalidate({ groupId })
    },
  })

  const handleUnpin = (messageId: string) => {
    unpinMutation.mutate({ messageId, pinned: false })
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="persistent"
      sx={{
        '& .MuiDrawer-paper': {
          width: 360,
          position: 'relative',
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <PushPinIcon color="primary" fontSize="small" />
          <Typography variant="subtitle1" fontWeight={600}>
            Tin nhắn đã ghim
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose} aria-label="Đóng">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : !pinnedMessages || pinnedMessages.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4, px: 2 }}>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Chưa có tin nhắn nào được ghim trong nhóm này.
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {pinnedMessages.map((msg, index) => (
              <PinnedMessageItem
                key={msg.id}
                msg={msg}
                onUnpin={handleUnpin}
                isUnpinning={unpinMutation.isPending}
                showDivider={index < pinnedMessages.length - 1}
              />
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  )
}
