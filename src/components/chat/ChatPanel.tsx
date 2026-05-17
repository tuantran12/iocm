'use client'

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type DragEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react'
import {
  Box,
  Paper,
  TextField,
  IconButton,
  Avatar,
  Typography,
  Chip,
  Divider,
  CircularProgress,
  Stack,
  Tooltip,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import PushPinIcon from '@mui/icons-material/PushPin'
import ReplyIcon from '@mui/icons-material/Reply'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import LinkIcon from '@mui/icons-material/Link'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import GavelIcon from '@mui/icons-material/Gavel'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import CloseIcon from '@mui/icons-material/Close'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import { trpc } from '@/lib/trpc'
import { useGroupChat } from '@/lib/socket'
import type { NewMessagePayload } from '@/types/socket'
import PinnedMessagesSidebar from './PinnedMessagesSidebar'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  groupId: string
  senderId: string
  senderName?: string
  type: string
  content: string
  attachments?: { name: string; url: string; size: number }[] | null
  replyToId?: string | null
  pinned: boolean
  createdAt: string
  editedAt?: string | null
}

interface ChatPanelProps {
  groupId: string
  currentUserId: string
  currentUserName: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Message Bubble Component ────────────────────────────────────────────────

function MessageBubble({
  message,
  isOwn,
  onReply,
}: {
  message: ChatMessage
  isOwn: boolean
  onReply: (msg: ChatMessage) => void
}) {
  const renderContent = () => {
    switch (message.type) {
      case 'FILE':
        return (
          <Stack direction="row" spacing={1} alignItems="center">
            <InsertDriveFileIcon fontSize="small" color="action" />
            <Box>
              <Typography variant="body2">{message.content}</Typography>
              {message.attachments?.map((att, i) => (
                <Chip
                  key={i}
                  label={`${att.name} (${formatFileSize(att.size)})`}
                  size="small"
                  component="a"
                  href={att.url}
                  target="_blank"
                  clickable
                  icon={<InsertDriveFileIcon />}
                  sx={{ mt: 0.5 }}
                />
              ))}
            </Box>
          </Stack>
        )
      case 'LINK':
        return (
          <Stack direction="row" spacing={1} alignItems="center">
            <LinkIcon fontSize="small" color="primary" />
            <Typography
              variant="body2"
              component="a"
              href={message.content}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: 'primary.main', textDecoration: 'underline' }}
            >
              {message.content}
            </Typography>
          </Stack>
        )
      case 'SYSTEM_NOTICE':
        return (
          <Stack direction="row" spacing={1} alignItems="center">
            <InfoOutlinedIcon fontSize="small" color="info" />
            <Typography variant="body2" color="text.secondary" fontStyle="italic">
              {message.content}
            </Typography>
          </Stack>
        )
      case 'TASK_REF':
        return (
          <Stack direction="row" spacing={1} alignItems="center">
            <TaskAltIcon fontSize="small" color="success" />
            <Typography variant="body2">{message.content}</Typography>
          </Stack>
        )
      case 'DECISION_REF':
        return (
          <Stack direction="row" spacing={1} alignItems="center">
            <GavelIcon fontSize="small" color="warning" />
            <Typography variant="body2">{message.content}</Typography>
          </Stack>
        )
      default: // TEXT
        return <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{message.content}</Typography>
    }
  }

  // System messages render centered without bubble
  if (message.type === 'SYSTEM_NOTICE') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
        <Paper
          elevation={0}
          sx={{ px: 2, py: 0.5, bgcolor: 'action.hover', borderRadius: 2 }}
        >
          {renderContent()}
        </Paper>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: isOwn ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        gap: 1,
        mb: 1.5,
        '&:hover .reply-btn': { opacity: 1 },
      }}
    >
      {!isOwn && (
        <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem' }}>
          {getInitials(message.senderName || 'U')}
        </Avatar>
      )}
      <Box sx={{ maxWidth: '70%' }}>
        {!isOwn && (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {message.senderName || message.senderId}
          </Typography>
        )}
        <Paper
          elevation={1}
          sx={{
            px: 1.5,
            py: 1,
            borderRadius: 2,
            bgcolor: isOwn ? 'primary.main' : 'background.paper',
            color: isOwn ? 'primary.contrastText' : 'text.primary',
            position: 'relative',
          }}
        >
          {message.pinned && (
            <PushPinIcon
              sx={{
                position: 'absolute',
                top: -8,
                right: -8,
                fontSize: 16,
                color: 'warning.main',
                transform: 'rotate(45deg)',
              }}
            />
          )}
          {renderContent()}
        </Paper>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25, ml: 1 }}>
          <Typography variant="caption" color="text.disabled">
            {formatTime(message.createdAt)}
          </Typography>
          {message.editedAt && (
            <Typography variant="caption" color="text.disabled">
              (đã sửa)
            </Typography>
          )}
          <Tooltip title="Trả lời">
            <IconButton
              size="small"
              className="reply-btn"
              onClick={() => onReply(message)}
              sx={{ opacity: 0, transition: 'opacity 0.2s', p: 0.25 }}
            >
              <ReplyIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Box>
  )
}

// ─── Date Separator ──────────────────────────────────────────────────────────

function DateSeparator({ date }: { date: string }) {
  return (
    <Divider sx={{ my: 2 }}>
      <Chip label={formatDate(date)} size="small" variant="outlined" />
    </Divider>
  )
}

// ─── Typing Indicator ────────────────────────────────────────────────────────

function TypingIndicator({ typingUsers }: { typingUsers: Map<string, string> }) {
  if (typingUsers.size === 0) return null

  const names = Array.from(typingUsers.values())
  const text =
    names.length === 1
      ? `${names[0]} đang nhập...`
      : `${names.slice(0, 2).join(', ')} đang nhập...`

  return (
    <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5 }}>
      {text}
    </Typography>
  )
}

// ─── Main ChatPanel Component ────────────────────────────────────────────────

export default function ChatPanel({ groupId, currentUserId, currentUserName }: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [pinnedSidebarOpen, setPinnedSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // tRPC: load initial messages
  const {
    data: initialData,
    isLoading: isLoadingMessages,
  } = trpc.chat.listMessages.useQuery(
    { groupId, limit: 50 },
    { enabled: !!groupId }
  )

  // Real-time hook
  const {
    messages: realtimeMessages,
    typingUsers,
    sendMessage,
    sendTyping,
  } = useGroupChat(groupId, {
    userId: currentUserId,
    userName: currentUserName,
  })

  // Merge initial + realtime messages, deduplicate by id
  const allMessages: ChatMessage[] = useMemo(() => {
    const initial: ChatMessage[] = (initialData?.messages ?? []).map((m: any) => ({
      id: m.id,
      groupId: m.groupId,
      senderId: m.senderId,
      senderName: m.senderName ?? m.senderId,
      type: m.type,
      content: m.content,
      attachments: m.attachments as any,
      replyToId: m.replyToId,
      pinned: m.pinned ?? false,
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date(m.createdAt).toISOString(),
      editedAt: m.editedAt ? (typeof m.editedAt === 'string' ? m.editedAt : new Date(m.editedAt).toISOString()) : null,
    }))

    const realtime: ChatMessage[] = realtimeMessages.map((m: NewMessagePayload) => ({
      id: m.id,
      groupId: m.groupId,
      senderId: m.senderId,
      senderName: m.senderName ?? m.senderId,
      type: m.type,
      content: m.content,
      attachments: m.attachments as any,
      replyToId: m.replyToId,
      pinned: false,
      createdAt: m.createdAt,
      editedAt: null,
    }))

    const map = new Map<string, ChatMessage>()
    for (const msg of initial) map.set(msg.id, msg)
    for (const msg of realtime) map.set(msg.id, msg)

    return Array.from(map.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  }, [initialData, realtimeMessages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages.length])

  // ─── Typing indicator logic ──────────────────────────────────────────────────

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    sendTyping(true)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 2000)
  }

  // ─── Send message ────────────────────────────────────────────────────────────

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return

    sendMessage({
      content: trimmed,
      type: 'TEXT',
      replyToId: replyTo?.id,
    })

    setInputValue('')
    setReplyTo(null)
    sendTyping(false)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
  }, [inputValue, replyTo, sendMessage, sendTyping])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── File upload ─────────────────────────────────────────────────────────────

  const uploadFile = async (file: File) => {
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'chat')
      formData.append('entityId', groupId)

      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const json = await res.json()

      if (json.success && json.data) {
        sendMessage({
          content: file.name,
          type: 'FILE',
          attachments: [{ name: file.name, url: json.data.url, size: file.size }],
          replyToId: replyTo?.id,
        })
        setReplyTo(null)
      }
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ─── Drag & Drop ────────────────────────────────────────────────────────────

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  // ─── Reply handler ───────────────────────────────────────────────────────────

  const handleReply = (msg: ChatMessage) => {
    setReplyTo(msg)
  }

  // ─── Group messages by date ──────────────────────────────────────────────────

  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: ChatMessage[] }[] = []
    let currentDate = ''

    for (const msg of allMessages) {
      const msgDate = formatDate(msg.createdAt)
      if (msgDate !== currentDate) {
        currentDate = msgDate
        groups.push({ date: msg.createdAt, messages: [] })
      }
      groups[groups.length - 1].messages.push(msg)
    }

    return groups
  }, [allMessages])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Paper
      elevation={2}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 500,
        maxHeight: 700,
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
        border: isDragOver ? '2px dashed' : '2px solid transparent',
        borderColor: isDragOver ? 'primary.main' : 'transparent',
        transition: 'border-color 0.2s',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: 'rgba(25, 118, 210, 0.08)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <Stack alignItems="center" spacing={1}>
            <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main' }} />
            <Typography variant="body1" color="primary">
              Thả tệp để tải lên
            </Typography>
          </Stack>
        </Box>
      )}

      {/* Chat header with pinned messages toggle */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Tooltip title="Tin nhắn đã ghim">
          <IconButton
            size="small"
            onClick={() => setPinnedSidebarOpen((prev) => !prev)}
            color={pinnedSidebarOpen ? 'primary' : 'default'}
          >
            <PushPinIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Message list */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 1,
          bgcolor: 'grey.50',
        }}
      >
        {isLoadingMessages ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : allMessages.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện!
            </Typography>
          </Box>
        ) : (
          groupedMessages.map((group, gi) => (
            <Box key={gi}>
              <DateSeparator date={group.date} />
              {group.messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.senderId === currentUserId}
                  onReply={handleReply}
                />
              ))}
            </Box>
          ))
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Typing indicator */}
      <TypingIndicator typingUsers={typingUsers} />

      {/* Reply preview */}
      {replyTo && (
        <Box
          sx={{
            px: 2,
            py: 1,
            bgcolor: 'action.hover',
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <ReplyIcon fontSize="small" color="action" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">
              Trả lời {replyTo.senderName || replyTo.senderId}
            </Typography>
            <Typography variant="body2" noWrap>
              {replyTo.content}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setReplyTo(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Input area */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          bgcolor: 'background.paper',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={handleFileSelect}
        />
        <Tooltip title="Đính kèm tệp">
          <IconButton
            size="small"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <CircularProgress size={20} /> : <AttachFileIcon />}
          </IconButton>
        </Tooltip>
        <TextField
          fullWidth
          multiline
          maxRows={4}
          size="small"
          placeholder="Nhập tin nhắn..."
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
            },
          }}
        />
        <Tooltip title="Gửi (Enter)">
          <span>
            <IconButton
              color="primary"
              onClick={handleSend}
              disabled={!inputValue.trim() || isUploading}
            >
              <SendIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Pinned messages sidebar */}
      <PinnedMessagesSidebar
        groupId={groupId}
        open={pinnedSidebarOpen}
        onClose={() => setPinnedSidebarOpen(false)}
      />
    </Paper>
  )
}
