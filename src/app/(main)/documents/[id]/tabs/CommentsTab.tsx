'use client'

import { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Avatar,
  Stack,
  IconButton,
  Skeleton,
  Divider,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import ReplyIcon from '@mui/icons-material/Reply'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { trpc } from '@/lib/trpc'

interface CommentsTabProps {
  documentId: string
}

interface Comment {
  id: string
  documentId: string
  authorId: string
  content: string
  replyToId: string | null
  createdAt: string | Date
  updatedAt: string | Date
  author: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

function CommentItem({
  comment,
  replies,
  onReply,
}: {
  comment: Comment
  replies: Comment[]
  onReply: (commentId: string) => void
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        <Avatar
          src={comment.author.avatarUrl ?? undefined}
          sx={{ width: 36, height: 36, bgcolor: 'primary.main' }}
        >
          {comment.author.name.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" fontWeight={600}>
              {comment.author.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {format(new Date(comment.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
            {comment.content}
          </Typography>
          <IconButton
            size="small"
            onClick={() => onReply(comment.id)}
            sx={{ mt: 0.5 }}
            aria-label="Trả lời"
          >
            <ReplyIcon fontSize="small" />
            <Typography variant="caption" sx={{ ml: 0.5 }}>
              Trả lời
            </Typography>
          </IconButton>

          {/* Replies */}
          {replies.length > 0 && (
            <Box sx={{ ml: 2, mt: 1, pl: 2, borderLeft: 2, borderColor: 'divider' }}>
              {replies.map((reply) => (
                <Box key={reply.id} sx={{ mb: 1.5 }}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <Avatar
                      src={reply.author.avatarUrl ?? undefined}
                      sx={{ width: 28, height: 28, bgcolor: 'secondary.main' }}
                    >
                      {reply.author.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2" fontWeight={600}>
                          {reply.author.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {format(new Date(reply.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ mt: 0.25, whiteSpace: 'pre-wrap' }}>
                        {reply.content}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Stack>
    </Box>
  )
}

export function CommentsTab({ documentId }: CommentsTabProps) {
  const [newComment, setNewComment] = useState('')
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const utils = trpc.useUtils()

  const { data: comments, isLoading } = trpc.documents.listComments.useQuery(
    { documentId },
    { enabled: !!documentId }
  )

  const addCommentMutation = trpc.documents.addComment.useMutation({
    onSuccess: () => {
      setNewComment('')
      setReplyToId(null)
      utils.documents.listComments.invalidate({ documentId })
    },
  })

  const handleSubmit = () => {
    if (!newComment.trim()) return
    addCommentMutation.mutate({
      documentId,
      content: newComment.trim(),
      replyToId: replyToId ?? undefined,
    })
  }

  const handleReply = (commentId: string) => {
    setReplyToId(commentId)
  }

  const cancelReply = () => {
    setReplyToId(null)
  }

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={100} sx={{ mb: 2, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 1 }} />
      </Box>
    )
  }

  // Separate top-level comments from replies
  const topLevelComments = (comments ?? []).filter((c: Comment) => !c.replyToId)
  const repliesMap = new Map<string, Comment[]>()
  for (const comment of (comments ?? []) as Comment[]) {
    if (comment.replyToId) {
      const existing = repliesMap.get(comment.replyToId) ?? []
      existing.push(comment)
      repliesMap.set(comment.replyToId, existing)
    }
  }

  const replyingToComment = replyToId
    ? (comments as Comment[] | undefined)?.find((c) => c.id === replyToId)
    : null

  return (
    <Box>
      {/* Add comment form */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        {replyToId && replyingToComment && (
          <Box sx={{ mb: 1.5, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Đang trả lời <strong>{replyingToComment.author.name}</strong>
              </Typography>
              <Button size="small" onClick={cancelReply}>
                Hủy
              </Button>
            </Stack>
          </Box>
        )}
        <Stack direction="row" spacing={2} alignItems="flex-end">
          <TextField
            multiline
            minRows={2}
            maxRows={5}
            placeholder={replyToId ? 'Viết câu trả lời...' : 'Viết bình luận...'}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            fullWidth
            size="small"
          />
          <Button
            variant="contained"
            endIcon={<SendIcon />}
            onClick={handleSubmit}
            disabled={!newComment.trim() || addCommentMutation.isPending}
            sx={{ minWidth: 100 }}
          >
            Gửi
          </Button>
        </Stack>
      </Paper>

      {/* Comments list */}
      {topLevelComments.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <ChatBubbleOutlineIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography color="text.secondary">
            Chưa có bình luận nào. Hãy là người đầu tiên bình luận!
          </Typography>
        </Paper>
      ) : (
        <Box>
          <Typography variant="h6" gutterBottom>
            Bình luận ({comments?.length ?? 0})
          </Typography>
          <Divider sx={{ mb: 2 }} />
          {topLevelComments.map((comment: Comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={repliesMap.get(comment.id) ?? []}
              onReply={handleReply}
            />
          ))}
        </Box>
      )}
    </Box>
  )
}
