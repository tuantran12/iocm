import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Chat System Messages Service Tests
 *
 * Tests programmatic creation of system messages for group events.
 * Validates: Task 9.3 — message types (system messages)
 */

// Mock socket emitToGroup
vi.mock('../socket', () => ({
  emitToGroup: vi.fn(),
}))

import { createSystemMessage, buildSystemContent } from './chat-system-messages'
import { emitToGroup } from '../socket'

function createMockDb() {
  return {
    chatMessage: {
      create: vi.fn().mockResolvedValue({
        id: 'sys-msg-1',
        groupId: 'group-1',
        senderId: 'SYSTEM',
        content: 'Test system message',
        type: 'SYSTEM_NOTICE',
        replyToId: null,
        attachments: null,
        createdAt: new Date('2024-01-01T12:00:00Z'),
      }),
    },
  } as any
}

describe('createSystemMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a SYSTEM_NOTICE message in the database', async () => {
    const db = createMockDb()

    const result = await createSystemMessage(db, {
      groupId: 'group-1',
      content: 'User X đã tham gia nhóm',
    })

    expect(db.chatMessage.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        senderId: 'SYSTEM',
        content: 'User X đã tham gia nhóm',
        type: 'SYSTEM_NOTICE',
      },
    })
    expect(result.id).toBe('sys-msg-1')
  })

  it('should use provided actorId as senderId', async () => {
    const db = createMockDb()

    await createSystemMessage(db, {
      groupId: 'group-1',
      content: 'Action performed',
      actorId: 'user-admin',
      actorName: 'Admin User',
    })

    expect(db.chatMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderId: 'user-admin',
      }),
    })
  })

  it('should broadcast via Socket.io with correct payload', async () => {
    const db = createMockDb()

    await createSystemMessage(db, {
      groupId: 'group-1',
      content: 'System event occurred',
      actorName: 'Admin',
    })

    expect(emitToGroup).toHaveBeenCalledWith('group-1', 'new_message', {
      id: 'sys-msg-1',
      groupId: 'group-1',
      senderId: 'SYSTEM',
      senderName: 'Admin',
      content: 'Test system message',
      type: 'SYSTEM_NOTICE',
      replyToId: null,
      attachments: null,
      createdAt: '2024-01-01T12:00:00.000Z',
    })
  })

  it('should default actorName to "Hệ thống" when not provided', async () => {
    const db = createMockDb()

    await createSystemMessage(db, {
      groupId: 'group-1',
      content: 'Auto event',
    })

    expect(emitToGroup).toHaveBeenCalledWith(
      'group-1',
      'new_message',
      expect.objectContaining({ senderName: 'Hệ thống' }),
    )
  })
})

describe('buildSystemContent', () => {
  it('should build member_joined message', () => {
    const content = buildSystemContent('member_joined', { userName: 'Nguyễn Văn A' })
    expect(content).toBe('Nguyễn Văn A đã tham gia nhóm')
  })

  it('should build member_left message', () => {
    const content = buildSystemContent('member_left', { userName: 'Trần Thị B' })
    expect(content).toBe('Trần Thị B đã rời nhóm')
  })

  it('should build member_removed message', () => {
    const content = buildSystemContent('member_removed', {
      userName: 'Lê Văn C',
      actorName: 'Admin',
    })
    expect(content).toBe('Lê Văn C đã bị xóa khỏi nhóm bởi Admin')
  })

  it('should build member_role_changed message', () => {
    const content = buildSystemContent('member_role_changed', {
      userName: 'Phạm D',
      newRole: 'MODERATOR',
    })
    expect(content).toBe('Phạm D đã được thay đổi vai trò thành MODERATOR')
  })

  it('should build group_created message', () => {
    const content = buildSystemContent('group_created', {
      groupName: 'Nhóm Pháp lý',
      actorName: 'Director',
    })
    expect(content).toBe('Nhóm "Nhóm Pháp lý" đã được tạo bởi Director')
  })

  it('should build group_archived message', () => {
    const content = buildSystemContent('group_archived', { actorName: 'Admin' })
    expect(content).toBe('Nhóm đã được lưu trữ bởi Admin')
  })

  it('should build decision_made message', () => {
    const content = buildSystemContent('decision_made', { title: 'Phê duyệt ngân sách Q1' })
    expect(content).toBe('Quyết định mới: Phê duyệt ngân sách Q1')
  })

  it('should build task_created message', () => {
    const content = buildSystemContent('task_created', { title: 'Soạn hợp đồng NDA' })
    expect(content).toBe('Nhiệm vụ mới: Soạn hợp đồng NDA')
  })
})
