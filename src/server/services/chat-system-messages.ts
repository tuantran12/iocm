import type { PrismaClient } from '@prisma/client'
import { emitToGroup } from '../socket'

/**
 * System message templates for common group events.
 * These are created programmatically (no user session required).
 */

export type SystemMessageEvent =
  | 'member_joined'
  | 'member_left'
  | 'member_removed'
  | 'member_role_changed'
  | 'group_created'
  | 'group_archived'
  | 'decision_made'
  | 'task_created'

interface SystemMessageOptions {
  groupId: string
  content: string
  /** The user who triggered the event (for audit trail). Falls back to 'SYSTEM'. */
  actorId?: string
  actorName?: string
}

/**
 * Create a system message in a group chat and broadcast it via Socket.io.
 * Used for automated notifications like "User X joined the group".
 */
export async function createSystemMessage(
  db: PrismaClient,
  options: SystemMessageOptions,
) {
  const { groupId, content, actorId = 'SYSTEM', actorName = 'Hệ thống' } = options

  const message = await db.chatMessage.create({
    data: {
      groupId,
      senderId: actorId,
      content,
      type: 'SYSTEM_NOTICE',
    },
  })

  // Broadcast to group room via Socket.io
  emitToGroup(groupId, 'new_message', {
    id: message.id,
    groupId: message.groupId,
    senderId: message.senderId,
    senderName: actorName,
    content: message.content,
    type: message.type,
    replyToId: null,
    attachments: null,
    createdAt: message.createdAt.toISOString(),
  })

  return message
}

/**
 * Convenience helpers for common system message events.
 */
export function buildSystemContent(event: SystemMessageEvent, params: Record<string, string>): string {
  switch (event) {
    case 'member_joined':
      return `${params.userName} đã tham gia nhóm`
    case 'member_left':
      return `${params.userName} đã rời nhóm`
    case 'member_removed':
      return `${params.userName} đã bị xóa khỏi nhóm bởi ${params.actorName}`
    case 'member_role_changed':
      return `${params.userName} đã được thay đổi vai trò thành ${params.newRole}`
    case 'group_created':
      return `Nhóm "${params.groupName}" đã được tạo bởi ${params.actorName}`
    case 'group_archived':
      return `Nhóm đã được lưu trữ bởi ${params.actorName}`
    case 'decision_made':
      return `Quyết định mới: ${params.title}`
    case 'task_created':
      return `Nhiệm vụ mới: ${params.title}`
  }
}
