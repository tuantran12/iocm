import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { GroupMemberStatus, GroupRole, Priority } from '@prisma/client'
import { router, protectedProcedure } from '../trpc'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const listMessagesInput = z.object({
  groupId: z.string().min(1, 'groupId is required'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const sendMessageInput = z.object({
  groupId: z.string().min(1, 'groupId is required'),
  content: z.string().min(1, 'Nội dung tin nhắn không được để trống'),
  type: z.enum(['TEXT', 'FILE', 'LINK', 'SYSTEM_NOTICE', 'TASK_REF', 'DECISION_REF', 'POLL']).optional(),
  replyToId: z.string().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string(),
    size: z.number(),
  })).optional(),
})

const editMessageInput = z.object({
  messageId: z.string().min(1, 'messageId is required'),
  content: z.string().min(1, 'Nội dung tin nhắn không được để trống'),
})

const deleteMessageInput = z.object({
  messageId: z.string().min(1, 'messageId is required'),
})

const pinMessageInput = z.object({
  messageId: z.string().min(1, 'messageId is required'),
  pinned: z.boolean(),
})

const getPinnedMessagesInput = z.object({
  groupId: z.string().min(1, 'groupId is required'),
})

const convertToTaskInput = z.object({
  messageId: z.string().min(1, 'messageId is required'),
  title: z.string().min(1).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
})

const convertToDecisionInput = z.object({
  messageId: z.string().min(1, 'messageId is required'),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
})

// ─── Chat Router ──────────────────────────────────────────────────────────────

export const chatRouter = router({
  /**
   * List messages for a group with cursor-based pagination.
   * Returns messages in reverse chronological order (newest first).
   * User must be an active member of the group.
   */
  listMessages: protectedProcedure
    .input(listMessagesInput)
    .query(async ({ input, ctx }) => {
      const { groupId, cursor, limit = 50 } = input
      const userId = ctx.session!.user.id

      // Verify user is an active member of the group
      const membership = await ctx.db.groupMembership.findFirst({
        where: {
          groupId,
          userId,
          status: GroupMemberStatus.ACTIVE,
        },
      })

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không phải thành viên của nhóm này',
        })
      }

      const messages = await ctx.db.chatMessage.findMany({
        where: {
          groupId,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // Fetch one extra to determine if there's a next page
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      })

      let nextCursor: string | undefined
      if (messages.length > limit) {
        const nextItem = messages.pop()
        nextCursor = nextItem?.id
      }

      return {
        messages: messages.reverse(), // Return in chronological order (oldest first)
        nextCursor,
      }
    }),

  /**
   * Send a message to a group via tRPC (alternative to Socket.io send_message).
   * Persists to DB and broadcasts via Socket.io to group room.
   * User must be an active member of the group.
   */
  sendMessage: protectedProcedure
    .input(sendMessageInput)
    .mutation(async ({ input, ctx }) => {
      const { groupId, content, type, replyToId, attachments } = input
      const userId = ctx.session!.user.id
      const userName = ctx.session!.user.name

      // Verify user is an active member of the group
      const membership = await ctx.db.groupMembership.findFirst({
        where: {
          groupId,
          userId,
          status: GroupMemberStatus.ACTIVE,
        },
      })

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không phải thành viên của nhóm này',
        })
      }

      // Persist message
      const message = await ctx.db.chatMessage.create({
        data: {
          groupId,
          senderId: userId,
          content: content.trim(),
          type: type ?? 'TEXT',
          replyToId: replyToId ?? null,
          attachments: attachments ? JSON.parse(JSON.stringify(attachments)) : undefined,
        },
      })

      // Broadcast via Socket.io to group room
      const { emitToGroup } = await import('../socket')
      emitToGroup(groupId, 'new_message', {
        id: message.id,
        groupId: message.groupId,
        senderId: message.senderId,
        senderName: userName,
        content: message.content,
        type: message.type,
        replyToId: message.replyToId,
        attachments: message.attachments,
        createdAt: message.createdAt.toISOString(),
      })

      return message
    }),

  /**
   * Edit a message. Only the message author can edit their own message.
   * Updates content and sets editedAt timestamp.
   */
  editMessage: protectedProcedure
    .input(editMessageInput)
    .mutation(async ({ input, ctx }) => {
      const { messageId, content } = input
      const userId = ctx.session!.user.id

      // Fetch the message
      const message = await ctx.db.chatMessage.findUnique({
        where: { id: messageId },
      })

      if (!message || message.deletedAt) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tin nhắn không tồn tại',
        })
      }

      // Only the author can edit
      if (message.senderId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn chỉ có thể chỉnh sửa tin nhắn của mình',
        })
      }

      // Update message content and editedAt
      const updated = await ctx.db.chatMessage.update({
        where: { id: messageId },
        data: {
          content: content.trim(),
          editedAt: new Date(),
        },
      })

      // Broadcast edit event via Socket.io
      const { emitToGroup } = await import('../socket')
      emitToGroup(message.groupId, 'message_edited', {
        id: updated.id,
        groupId: updated.groupId,
        content: updated.content,
        editedAt: updated.editedAt!.toISOString(),
      })

      return updated
    }),

  /**
   * Soft-delete a message. Author can delete own messages.
   * Owner/Moderator can delete any message in their group.
   * Sets deletedAt timestamp (keeps record for audit).
   */
  deleteMessage: protectedProcedure
    .input(deleteMessageInput)
    .mutation(async ({ input, ctx }) => {
      const { messageId } = input
      const userId = ctx.session!.user.id

      // Fetch the message
      const message = await ctx.db.chatMessage.findUnique({
        where: { id: messageId },
      })

      if (!message || message.deletedAt) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tin nhắn không tồn tại',
        })
      }

      // Check permissions: author can delete own, owner/moderator can delete any
      if (message.senderId !== userId) {
        const membership = await ctx.db.groupMembership.findFirst({
          where: {
            groupId: message.groupId,
            userId,
            status: GroupMemberStatus.ACTIVE,
            groupRole: { in: [GroupRole.OWNER, GroupRole.MODERATOR] },
          },
        })

        if (!membership) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Bạn không có quyền xóa tin nhắn này',
          })
        }
      }

      // Soft delete
      const deleted = await ctx.db.chatMessage.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      })

      // Broadcast delete event via Socket.io
      const { emitToGroup } = await import('../socket')
      emitToGroup(message.groupId, 'message_deleted', {
        id: deleted.id,
        groupId: deleted.groupId,
        deletedAt: deleted.deletedAt!.toISOString(),
      })

      return { id: deleted.id, deletedAt: deleted.deletedAt }
    }),

  /**
   * Pin or unpin a message. Only group owner or moderator can pin/unpin.
   */
  pinMessage: protectedProcedure
    .input(pinMessageInput)
    .mutation(async ({ input, ctx }) => {
      const { messageId, pinned } = input
      const userId = ctx.session!.user.id

      // Fetch the message
      const message = await ctx.db.chatMessage.findUnique({
        where: { id: messageId },
      })

      if (!message || message.deletedAt) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tin nhắn không tồn tại',
        })
      }

      // Only owner/moderator can pin/unpin
      const membership = await ctx.db.groupMembership.findFirst({
        where: {
          groupId: message.groupId,
          userId,
          status: GroupMemberStatus.ACTIVE,
          groupRole: { in: [GroupRole.OWNER, GroupRole.MODERATOR] },
        },
      })

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Chỉ chủ nhóm hoặc moderator mới có thể ghim/bỏ ghim tin nhắn',
        })
      }

      // Update pinned status
      const updated = await ctx.db.chatMessage.update({
        where: { id: messageId },
        data: { pinned },
      })

      // Broadcast pin event via Socket.io
      const { emitToGroup } = await import('../socket')
      emitToGroup(message.groupId, 'message_pinned', {
        id: updated.id,
        groupId: updated.groupId,
        pinned: updated.pinned,
      })

      return updated
    }),

  /**
   * Get all pinned messages for a group.
   * User must be an active member of the group.
   */
  getPinnedMessages: protectedProcedure
    .input(getPinnedMessagesInput)
    .query(async ({ input, ctx }) => {
      const { groupId } = input
      const userId = ctx.session!.user.id

      // Verify user is an active member of the group
      const membership = await ctx.db.groupMembership.findFirst({
        where: {
          groupId,
          userId,
          status: GroupMemberStatus.ACTIVE,
        },
      })

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không phải thành viên của nhóm này',
        })
      }

      const pinnedMessages = await ctx.db.chatMessage.findMany({
        where: {
          groupId,
          pinned: true,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      })

      return pinnedMessages
    }),

  /**
   * Convert a chat message into a Task.
   * Creates a Task record linked to the group and posts a TASK_REF system message.
   * User must be an active member of the group.
   */
  convertToTask: protectedProcedure
    .input(convertToTaskInput)
    .mutation(async ({ input, ctx }) => {
      const { messageId, title, assignedTo, dueDate, priority } = input
      const userId = ctx.session!.user.id

      // Fetch the original message
      const message = await ctx.db.chatMessage.findUnique({
        where: { id: messageId },
      })

      if (!message || message.deletedAt) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tin nhắn không tồn tại',
        })
      }

      // Verify user is an active member of the group
      const membership = await ctx.db.groupMembership.findFirst({
        where: {
          groupId: message.groupId,
          userId,
          status: GroupMemberStatus.ACTIVE,
        },
      })

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không phải thành viên của nhóm này',
        })
      }

      // Create the Task record
      const task = await ctx.db.task.create({
        data: {
          title: title || message.content.slice(0, 200),
          description: message.content,
          assignedTo: assignedTo ?? null,
          createdBy: userId,
          groupId: message.groupId,
          priority: priority ? (priority as Priority) : 'MEDIUM',
          dueDate: dueDate ? new Date(dueDate) : null,
          status: 'OPEN',
        },
      })

      // Post a TASK_REF system message referencing the created task
      const systemMessage = await ctx.db.chatMessage.create({
        data: {
          groupId: message.groupId,
          senderId: userId,
          type: 'TASK_REF',
          content: `📋 Đã tạo task từ tin nhắn: "${task.title}" [task:${task.id}]`,
          replyToId: messageId,
        },
      })

      // Broadcast via Socket.io
      const { emitToGroup } = await import('../socket')
      emitToGroup(message.groupId, 'new_message', {
        id: systemMessage.id,
        groupId: systemMessage.groupId,
        senderId: systemMessage.senderId,
        content: systemMessage.content,
        type: systemMessage.type,
        replyToId: systemMessage.replyToId,
        createdAt: systemMessage.createdAt.toISOString(),
      })

      return { task, systemMessage }
    }),

  /**
   * Convert a chat message into a GroupDecision.
   * Creates a GroupDecision record linked to the group and posts a DECISION_REF system message.
   * User must be an active member of the group.
   */
  convertToDecision: protectedProcedure
    .input(convertToDecisionInput)
    .mutation(async ({ input, ctx }) => {
      const { messageId, title, description } = input
      const userId = ctx.session!.user.id

      // Fetch the original message
      const message = await ctx.db.chatMessage.findUnique({
        where: { id: messageId },
      })

      if (!message || message.deletedAt) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tin nhắn không tồn tại',
        })
      }

      // Verify user is an active member of the group
      const membership = await ctx.db.groupMembership.findFirst({
        where: {
          groupId: message.groupId,
          userId,
          status: GroupMemberStatus.ACTIVE,
        },
      })

      if (!membership) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không phải thành viên của nhóm này',
        })
      }

      // Create the GroupDecision record
      const decision = await ctx.db.groupDecision.create({
        data: {
          groupId: message.groupId,
          title: title || message.content.slice(0, 200),
          description: description || message.content,
          proposedBy: message.senderId,
          status: 'proposed',
        },
      })

      // Post a DECISION_REF system message referencing the created decision
      const systemMessage = await ctx.db.chatMessage.create({
        data: {
          groupId: message.groupId,
          senderId: userId,
          type: 'DECISION_REF',
          content: `📌 Đã tạo quyết định từ tin nhắn: "${decision.title}" [decision:${decision.id}]`,
          replyToId: messageId,
        },
      })

      // Broadcast via Socket.io
      const { emitToGroup } = await import('../socket')
      emitToGroup(message.groupId, 'new_message', {
        id: systemMessage.id,
        groupId: systemMessage.groupId,
        senderId: systemMessage.senderId,
        content: systemMessage.content,
        type: systemMessage.type,
        replyToId: systemMessage.replyToId,
        createdAt: systemMessage.createdAt.toISOString(),
      })

      return { decision, systemMessage }
    }),
})
