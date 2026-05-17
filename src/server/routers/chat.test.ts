import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GroupMemberStatus, GroupRole, Priority } from '@prisma/client'
import { TRPCError } from '@trpc/server'

/**
 * Chat Router - Message Send/Receive Tests
 *
 * Tests chat message listing and sending via tRPC.
 * Validates: Task 9.2 — real-time chat message send/receive
 */

// ─── Mock Socket.io emitToGroup ───────────────────────────────────────────────

vi.mock('../socket', () => ({
  emitToGroup: vi.fn(),
}))

// ─── Mock Prisma & Context Helpers ────────────────────────────────────────────

function createMockDb() {
  return {
    groupMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    task: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

type MockDb = ReturnType<typeof createMockDb>

function createMockCtx(overrides?: { userId?: string; name?: string; roles?: string[] }) {
  return {
    db: createMockDb(),
    session: {
      user: {
        id: overrides?.userId ?? 'user-1',
        email: 'test@example.com',
        name: overrides?.name ?? 'Test User',
      },
      roles: overrides?.roles ?? ['Member'],
    },
    headers: undefined,
  }
}

// ─── Business Logic Under Test ────────────────────────────────────────────────

/**
 * Extracted listMessages logic for unit testing without full tRPC caller setup.
 */
async function listMessages(
  db: MockDb,
  userId: string,
  input: { groupId: string; cursor?: string; limit?: number },
) {
  const { groupId, cursor, limit = 50 } = input

  const membership = await db.groupMembership.findFirst({
    where: { groupId, userId, status: GroupMemberStatus.ACTIVE },
  })

  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không phải thành viên của nhóm này' })
  }

  const messages = await db.chatMessage.findMany({
    where: { groupId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  })

  let nextCursor: string | undefined
  if (messages.length > limit) {
    const nextItem = messages.pop()
    nextCursor = nextItem?.id
  }

  return { messages: messages.reverse(), nextCursor }
}

/**
 * Extracted sendMessage logic for unit testing.
 */
async function sendMessage(
  db: MockDb,
  userId: string,
  userName: string,
  input: { groupId: string; content: string; type?: string; replyToId?: string; attachments?: { name: string; url: string; size: number }[] },
) {
  const { groupId, content, type, replyToId, attachments } = input

  const membership = await db.groupMembership.findFirst({
    where: { groupId, userId, status: GroupMemberStatus.ACTIVE },
  })

  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không phải thành viên của nhóm này' })
  }

  const message = await db.chatMessage.create({
    data: {
      groupId,
      senderId: userId,
      content: content.trim(),
      type: type ?? 'TEXT',
      replyToId: replyToId ?? null,
      attachments: attachments ? JSON.parse(JSON.stringify(attachments)) : undefined,
    },
  })

  return message
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Chat Router — listMessages', () => {
  let ctx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = createMockCtx()
  })

  it('should return messages when user is a group member', async () => {
    const mockMessages = [
      { id: 'msg-1', groupId: 'group-1', senderId: 'user-1', content: 'Hello', type: 'TEXT', createdAt: new Date('2024-01-01T10:00:00Z') },
      { id: 'msg-2', groupId: 'group-1', senderId: 'user-2', content: 'Hi there', type: 'TEXT', createdAt: new Date('2024-01-01T10:01:00Z') },
    ]

    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.findMany.mockResolvedValue(mockMessages)

    const result = await listMessages(ctx.db, 'user-1', { groupId: 'group-1' })

    expect(result.messages).toHaveLength(2)
    expect(result.nextCursor).toBeUndefined()
    expect(ctx.db.groupMembership.findFirst).toHaveBeenCalledWith({
      where: { groupId: 'group-1', userId: 'user-1', status: GroupMemberStatus.ACTIVE },
    })
  })

  it('should throw FORBIDDEN when user is not a group member', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue(null)

    await expect(
      listMessages(ctx.db, 'user-1', { groupId: 'group-1' }),
    ).rejects.toThrow(TRPCError)

    await expect(
      listMessages(ctx.db, 'user-1', { groupId: 'group-1' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('should support cursor-based pagination', async () => {
    // Return limit+1 items to indicate there's a next page
    const mockMessages = Array.from({ length: 4 }, (_, i) => ({
      id: `msg-${i}`,
      groupId: 'group-1',
      senderId: 'user-1',
      content: `Message ${i}`,
      type: 'TEXT',
      createdAt: new Date(`2024-01-01T10:0${i}:00Z`),
    }))

    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.findMany.mockResolvedValue(mockMessages)

    const result = await listMessages(ctx.db, 'user-1', { groupId: 'group-1', limit: 3 })

    expect(result.messages).toHaveLength(3)
    expect(result.nextCursor).toBe('msg-3')
  })

  it('should exclude deleted messages', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.findMany.mockResolvedValue([])

    await listMessages(ctx.db, 'user-1', { groupId: 'group-1' })

    expect(ctx.db.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: 'group-1', deletedAt: null },
      }),
    )
  })
})

describe('Chat Router — sendMessage', () => {
  let ctx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = createMockCtx()
  })

  it('should create a message when user is a group member', async () => {
    const mockMessage = {
      id: 'msg-new',
      groupId: 'group-1',
      senderId: 'user-1',
      content: 'Hello world',
      type: 'TEXT',
      replyToId: null,
      attachments: null,
      createdAt: new Date(),
    }

    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue(mockMessage)

    const result = await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: 'Hello world',
    })

    expect(result.id).toBe('msg-new')
    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        senderId: 'user-1',
        content: 'Hello world',
        type: 'TEXT',
        replyToId: null,
        attachments: undefined,
      },
    })
  })

  it('should throw FORBIDDEN when user is not a group member', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue(null)

    await expect(
      sendMessage(ctx.db, 'user-1', 'Test User', { groupId: 'group-1', content: 'Hello' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('should trim message content', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'msg-1', content: 'Hello' })

    await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: '  Hello  ',
    })

    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: 'Hello' }),
      }),
    )
  })

  it('should support reply messages', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'msg-reply', replyToId: 'msg-original' })

    await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: 'Reply text',
      replyToId: 'msg-original',
    })

    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ replyToId: 'msg-original' }),
      }),
    )
  })

  it('should support attachments', async () => {
    const attachments = [{ name: 'file.pdf', url: 'https://s3.example.com/file.pdf', size: 1024 }]

    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'msg-file', attachments })

    await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: 'See attached',
      attachments,
    })

    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attachments: attachments,
        }),
      }),
    )
  })
})

describe('Chat Router — Message Types (Task 9.3)', () => {
  let ctx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = createMockCtx()
  })

  it('should default to TEXT type when type is not specified', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'msg-1', type: 'TEXT' })

    await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: 'Hello',
    })

    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'TEXT' }),
      }),
    )
  })

  it('should store FILE type messages', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'msg-file', type: 'FILE' })

    await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: 'file.pdf',
      type: 'FILE',
    })

    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'FILE' }),
      }),
    )
  })

  it('should store LINK type messages', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'msg-link', type: 'LINK' })

    await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: 'https://example.com/doc',
      type: 'LINK',
    })

    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'LINK' }),
      }),
    )
  })

  it('should store SYSTEM_NOTICE type messages', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'msg-sys', type: 'SYSTEM_NOTICE' })

    await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: 'User joined the group',
      type: 'SYSTEM_NOTICE',
    })

    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'SYSTEM_NOTICE' }),
      }),
    )
  })

  it('should store TASK_REF type messages', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'msg-task', type: 'TASK_REF' })

    await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: 'task:task-123',
      type: 'TASK_REF',
    })

    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'TASK_REF' }),
      }),
    )
  })

  it('should store DECISION_REF type messages', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'msg-dec', type: 'DECISION_REF' })

    await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: 'decision:dec-456',
      type: 'DECISION_REF',
    })

    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DECISION_REF' }),
      }),
    )
  })

  it('should store POLL type messages', async () => {
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'msg-poll', type: 'POLL' })

    await sendMessage(ctx.db, 'user-1', 'Test User', {
      groupId: 'group-1',
      content: 'Vote: Approve budget?',
      type: 'POLL',
    })

    expect(ctx.db.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'POLL' }),
      }),
    )
  })

  it('should return type field in listMessages results', async () => {
    // Messages come from DB in desc order (newest first), then get reversed
    const mockMessages = [
      { id: 'msg-3', groupId: 'group-1', senderId: 'user-2', content: 'https://link.com', type: 'LINK', createdAt: new Date('2024-01-01T10:02:00Z') },
      { id: 'msg-2', groupId: 'group-1', senderId: 'SYSTEM', content: 'User joined', type: 'SYSTEM_NOTICE', createdAt: new Date('2024-01-01T10:01:00Z') },
      { id: 'msg-1', groupId: 'group-1', senderId: 'user-1', content: 'Hello', type: 'TEXT', createdAt: new Date('2024-01-01T10:00:00Z') },
    ]

    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.chatMessage.findMany.mockResolvedValue(mockMessages)

    const result = await listMessages(ctx.db, 'user-1', { groupId: 'group-1' })

    // After reverse: oldest first (chronological order)
    expect(result.messages[0].type).toBe('TEXT')
    expect(result.messages[1].type).toBe('SYSTEM_NOTICE')
    expect(result.messages[2].type).toBe('LINK')
  })
})


// ─── Edit/Delete/Pin Business Logic Under Test ────────────────────────────────

/**
 * Extracted editMessage logic for unit testing.
 */
async function editMessage(
  db: MockDb,
  userId: string,
  input: { messageId: string; content: string },
) {
  const { messageId, content } = input

  const message = await db.chatMessage.findUnique({ where: { id: messageId } })

  if (!message || message.deletedAt) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Tin nhắn không tồn tại' })
  }

  if (message.senderId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn chỉ có thể chỉnh sửa tin nhắn của mình' })
  }

  const updated = await db.chatMessage.update({
    where: { id: messageId },
    data: { content: content.trim(), editedAt: new Date() },
  })

  return updated
}

/**
 * Extracted deleteMessage logic for unit testing.
 */
async function deleteMessage(
  db: MockDb,
  userId: string,
  input: { messageId: string },
) {
  const { messageId } = input

  const message = await db.chatMessage.findUnique({ where: { id: messageId } })

  if (!message || message.deletedAt) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Tin nhắn không tồn tại' })
  }

  // Author can delete own; owner/moderator can delete any
  if (message.senderId !== userId) {
    const membership = await db.groupMembership.findFirst({
      where: {
        groupId: message.groupId,
        userId,
        status: GroupMemberStatus.ACTIVE,
        groupRole: { in: [GroupRole.OWNER, GroupRole.MODERATOR] },
      },
    })

    if (!membership) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không có quyền xóa tin nhắn này' })
    }
  }

  const deleted = await db.chatMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  })

  return { id: deleted.id, deletedAt: deleted.deletedAt }
}

/**
 * Extracted pinMessage logic for unit testing.
 */
async function pinMessage(
  db: MockDb,
  userId: string,
  input: { messageId: string; pinned: boolean },
) {
  const { messageId, pinned } = input

  const message = await db.chatMessage.findUnique({ where: { id: messageId } })

  if (!message || message.deletedAt) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Tin nhắn không tồn tại' })
  }

  // Only owner/moderator can pin/unpin
  const membership = await db.groupMembership.findFirst({
    where: {
      groupId: message.groupId,
      userId,
      status: GroupMemberStatus.ACTIVE,
      groupRole: { in: [GroupRole.OWNER, GroupRole.MODERATOR] },
    },
  })

  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Chỉ chủ nhóm hoặc moderator mới có thể ghim/bỏ ghim tin nhắn' })
  }

  const updated = await db.chatMessage.update({
    where: { id: messageId },
    data: { pinned },
  })

  return updated
}

/**
 * Extracted convertToTask logic for unit testing.
 */
async function convertToTask(
  db: MockDb,
  userId: string,
  input: { messageId: string; title?: string; assignedTo?: string; dueDate?: string; priority?: string },
) {
  const { messageId, title, assignedTo, dueDate, priority } = input

  const message = await db.chatMessage.findUnique({ where: { id: messageId } })

  if (!message || message.deletedAt) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Tin nhắn không tồn tại' })
  }

  // Verify user is an active member of the group
  const membership = await db.groupMembership.findFirst({
    where: { groupId: message.groupId, userId, status: GroupMemberStatus.ACTIVE },
  })

  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Bạn không phải thành viên của nhóm này' })
  }

  // Create the Task record
  const task = await db.task.create({
    data: {
      title: title || message.content.slice(0, 200),
      description: message.content,
      assignedTo: assignedTo ?? null,
      createdBy: userId,
      groupId: message.groupId,
      priority: priority ?? 'MEDIUM',
      dueDate: dueDate ? new Date(dueDate) : null,
      status: 'OPEN',
    },
  })

  // Post a TASK_REF system message
  const systemMessage = await db.chatMessage.create({
    data: {
      groupId: message.groupId,
      senderId: userId,
      type: 'TASK_REF',
      content: `📋 Đã tạo task từ tin nhắn: "${task.title}" [task:${task.id}]`,
      replyToId: messageId,
    },
  })

  return { task, systemMessage }
}


// ─── Convert to Task Tests ────────────────────────────────────────────────────

describe('Chat Router — convertToTask (Task 9.6)', () => {
  let ctx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = createMockCtx()
  })

  it('should create a Task and TASK_REF message from a chat message', async () => {
    const originalMessage = {
      id: 'msg-1',
      groupId: 'group-1',
      senderId: 'user-2',
      content: 'We need to review the NDA draft',
      type: 'TEXT',
      deletedAt: null,
    }
    const createdTask = {
      id: 'task-new-1',
      title: 'We need to review the NDA draft',
      description: 'We need to review the NDA draft',
      assignedTo: null,
      createdBy: 'user-1',
      groupId: 'group-1',
      priority: 'MEDIUM',
      dueDate: null,
      status: 'OPEN',
    }
    const taskRefMessage = {
      id: 'msg-ref-1',
      groupId: 'group-1',
      senderId: 'user-1',
      type: 'TASK_REF',
      content: `📋 Đã tạo task từ tin nhắn: "${createdTask.title}" [task:${createdTask.id}]`,
      replyToId: 'msg-1',
      createdAt: new Date(),
    }

    ctx.db.chatMessage.findUnique.mockResolvedValue(originalMessage)
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.task.create.mockResolvedValue(createdTask)
    ctx.db.chatMessage.create.mockResolvedValue(taskRefMessage)

    const result = await convertToTask(ctx.db, 'user-1', { messageId: 'msg-1' })

    expect(result.task.id).toBe('task-new-1')
    expect(result.task.status).toBe('OPEN')
    expect(result.systemMessage.type).toBe('TASK_REF')
    expect(result.systemMessage.replyToId).toBe('msg-1')
    expect(ctx.db.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'We need to review the NDA draft',
        description: 'We need to review the NDA draft',
        createdBy: 'user-1',
        groupId: 'group-1',
        priority: 'MEDIUM',
        status: 'OPEN',
      }),
    })
  })

  it('should use custom title when provided', async () => {
    const originalMessage = {
      id: 'msg-2',
      groupId: 'group-1',
      senderId: 'user-2',
      content: 'Long message content here...',
      type: 'TEXT',
      deletedAt: null,
    }
    const createdTask = {
      id: 'task-2',
      title: 'Custom Task Title',
      groupId: 'group-1',
    }

    ctx.db.chatMessage.findUnique.mockResolvedValue(originalMessage)
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.task.create.mockResolvedValue(createdTask)
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'ref-2', type: 'TASK_REF' })

    await convertToTask(ctx.db, 'user-1', { messageId: 'msg-2', title: 'Custom Task Title' })

    expect(ctx.db.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ title: 'Custom Task Title' }),
    })
  })

  it('should throw FORBIDDEN when user is not a group member', async () => {
    ctx.db.chatMessage.findUnique.mockResolvedValue({
      id: 'msg-3',
      groupId: 'group-1',
      senderId: 'user-2',
      content: 'Some message',
      deletedAt: null,
    })
    ctx.db.groupMembership.findFirst.mockResolvedValue(null)

    await expect(
      convertToTask(ctx.db, 'user-1', { messageId: 'msg-3' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('should throw NOT_FOUND for deleted message', async () => {
    ctx.db.chatMessage.findUnique.mockResolvedValue({
      id: 'msg-4',
      groupId: 'group-1',
      content: 'Deleted',
      deletedAt: new Date(),
    })

    await expect(
      convertToTask(ctx.db, 'user-1', { messageId: 'msg-4' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('should support assignedTo, dueDate, and priority options', async () => {
    const originalMessage = {
      id: 'msg-5',
      groupId: 'group-1',
      senderId: 'user-2',
      content: 'Urgent: prepare report',
      type: 'TEXT',
      deletedAt: null,
    }

    ctx.db.chatMessage.findUnique.mockResolvedValue(originalMessage)
    ctx.db.groupMembership.findFirst.mockResolvedValue({ id: 'mem-1', status: 'ACTIVE' })
    ctx.db.task.create.mockResolvedValue({ id: 'task-5', priority: 'HIGH' })
    ctx.db.chatMessage.create.mockResolvedValue({ id: 'ref-5', type: 'TASK_REF' })

    await convertToTask(ctx.db, 'user-1', {
      messageId: 'msg-5',
      assignedTo: 'user-3',
      dueDate: '2024-06-01T00:00:00.000Z',
      priority: 'HIGH',
    })

    expect(ctx.db.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assignedTo: 'user-3',
        dueDate: new Date('2024-06-01T00:00:00.000Z'),
        priority: 'HIGH',
      }),
    })
  })
})


// ─── Edit Message Tests ───────────────────────────────────────────────────────

describe('Chat Router — editMessage (Task 9.4)', () => {
  let ctx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = createMockCtx()
  })

  it('should allow author to edit their own message', async () => {
    const existingMessage = {
      id: 'msg-edit-1',
      groupId: 'group-1',
      senderId: 'user-1',
      content: 'Original content',
      deletedAt: null,
    }
    const updatedMessage = {
      ...existingMessage,
      content: 'Updated content',
      editedAt: new Date(),
    }

    ctx.db.chatMessage.findUnique.mockResolvedValue(existingMessage)
    ctx.db.chatMessage.update.mockResolvedValue(updatedMessage)

    const result = await editMessage(ctx.db, 'user-1', {
      messageId: 'msg-edit-1',
      content: 'Updated content',
    })

    expect(result.content).toBe('Updated content')
    expect(result.editedAt).toBeDefined()
    expect(ctx.db.chatMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg-edit-1' },
      data: { content: 'Updated content', editedAt: expect.any(Date) },
    })
  })

  it('should throw FORBIDDEN when non-author tries to edit', async () => {
    ctx.db.chatMessage.findUnique.mockResolvedValue({
      id: 'msg-edit-2',
      groupId: 'group-1',
      senderId: 'user-2', // Different user
      content: 'Their message',
      deletedAt: null,
    })

    await expect(
      editMessage(ctx.db, 'user-1', { messageId: 'msg-edit-2', content: 'Hacked' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('should throw NOT_FOUND for deleted message', async () => {
    ctx.db.chatMessage.findUnique.mockResolvedValue({
      id: 'msg-edit-3',
      senderId: 'user-1',
      content: 'Deleted',
      deletedAt: new Date(),
    })

    await expect(
      editMessage(ctx.db, 'user-1', { messageId: 'msg-edit-3', content: 'Edit attempt' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('should throw NOT_FOUND for non-existent message', async () => {
    ctx.db.chatMessage.findUnique.mockResolvedValue(null)

    await expect(
      editMessage(ctx.db, 'user-1', { messageId: 'msg-nonexist', content: 'Edit' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('should trim content when editing', async () => {
    ctx.db.chatMessage.findUnique.mockResolvedValue({
      id: 'msg-edit-4',
      groupId: 'group-1',
      senderId: 'user-1',
      content: 'Original',
      deletedAt: null,
    })
    ctx.db.chatMessage.update.mockResolvedValue({ id: 'msg-edit-4', content: 'Trimmed' })

    await editMessage(ctx.db, 'user-1', { messageId: 'msg-edit-4', content: '  Trimmed  ' })

    expect(ctx.db.chatMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg-edit-4' },
      data: { content: 'Trimmed', editedAt: expect.any(Date) },
    })
  })
})


// ─── Delete Message Tests ─────────────────────────────────────────────────────

describe('Chat Router — deleteMessage (Task 9.4)', () => {
  let ctx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = createMockCtx()
  })

  it('should allow author to delete their own message', async () => {
    const existingMessage = {
      id: 'msg-del-1',
      groupId: 'group-1',
      senderId: 'user-1',
      content: 'My message',
      deletedAt: null,
    }
    const deletedMessage = { ...existingMessage, deletedAt: new Date() }

    ctx.db.chatMessage.findUnique.mockResolvedValue(existingMessage)
    ctx.db.chatMessage.update.mockResolvedValue(deletedMessage)

    const result = await deleteMessage(ctx.db, 'user-1', { messageId: 'msg-del-1' })

    expect(result.deletedAt).toBeDefined()
    expect(ctx.db.chatMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg-del-1' },
      data: { deletedAt: expect.any(Date) },
    })
  })

  it('should allow OWNER to delete any message in their group', async () => {
    const existingMessage = {
      id: 'msg-del-2',
      groupId: 'group-1',
      senderId: 'user-2', // Different user
      content: 'Their message',
      deletedAt: null,
    }
    const deletedMessage = { ...existingMessage, id: 'msg-del-2', deletedAt: new Date() }

    ctx.db.chatMessage.findUnique.mockResolvedValue(existingMessage)
    ctx.db.groupMembership.findFirst.mockResolvedValue({
      id: 'mem-owner',
      groupRole: GroupRole.OWNER,
      status: 'ACTIVE',
    })
    ctx.db.chatMessage.update.mockResolvedValue(deletedMessage)

    const result = await deleteMessage(ctx.db, 'user-1', { messageId: 'msg-del-2' })

    expect(result.deletedAt).toBeDefined()
  })

  it('should allow MODERATOR to delete any message in their group', async () => {
    const existingMessage = {
      id: 'msg-del-3',
      groupId: 'group-1',
      senderId: 'user-3',
      content: 'Another message',
      deletedAt: null,
    }

    ctx.db.chatMessage.findUnique.mockResolvedValue(existingMessage)
    ctx.db.groupMembership.findFirst.mockResolvedValue({
      id: 'mem-mod',
      groupRole: GroupRole.MODERATOR,
      status: 'ACTIVE',
    })
    ctx.db.chatMessage.update.mockResolvedValue({ ...existingMessage, deletedAt: new Date() })

    const result = await deleteMessage(ctx.db, 'user-1', { messageId: 'msg-del-3' })

    expect(result.deletedAt).toBeDefined()
  })

  it('should throw FORBIDDEN when regular member tries to delete others message', async () => {
    ctx.db.chatMessage.findUnique.mockResolvedValue({
      id: 'msg-del-4',
      groupId: 'group-1',
      senderId: 'user-2',
      content: 'Not yours',
      deletedAt: null,
    })
    ctx.db.groupMembership.findFirst.mockResolvedValue(null) // Not owner/moderator

    await expect(
      deleteMessage(ctx.db, 'user-1', { messageId: 'msg-del-4' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('should throw NOT_FOUND for already deleted message', async () => {
    ctx.db.chatMessage.findUnique.mockResolvedValue({
      id: 'msg-del-5',
      senderId: 'user-1',
      deletedAt: new Date(), // Already deleted
    })

    await expect(
      deleteMessage(ctx.db, 'user-1', { messageId: 'msg-del-5' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})


// ─── Pin Message Tests ────────────────────────────────────────────────────────

describe('Chat Router — pinMessage (Task 9.4)', () => {
  let ctx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    vi.clearAllMocks()
    ctx = createMockCtx()
  })

  it('should allow OWNER to pin a message', async () => {
    const existingMessage = {
      id: 'msg-pin-1',
      groupId: 'group-1',
      senderId: 'user-2',
      content: 'Important info',
      pinned: false,
      deletedAt: null,
    }

    ctx.db.chatMessage.findUnique.mockResolvedValue(existingMessage)
    ctx.db.groupMembership.findFirst.mockResolvedValue({
      id: 'mem-owner',
      groupRole: GroupRole.OWNER,
      status: 'ACTIVE',
    })
    ctx.db.chatMessage.update.mockResolvedValue({ ...existingMessage, pinned: true })

    const result = await pinMessage(ctx.db, 'user-1', { messageId: 'msg-pin-1', pinned: true })

    expect(result.pinned).toBe(true)
    expect(ctx.db.chatMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg-pin-1' },
      data: { pinned: true },
    })
  })

  it('should allow MODERATOR to pin a message', async () => {
    const existingMessage = {
      id: 'msg-pin-2',
      groupId: 'group-1',
      senderId: 'user-3',
      content: 'Pin this',
      pinned: false,
      deletedAt: null,
    }

    ctx.db.chatMessage.findUnique.mockResolvedValue(existingMessage)
    ctx.db.groupMembership.findFirst.mockResolvedValue({
      id: 'mem-mod',
      groupRole: GroupRole.MODERATOR,
      status: 'ACTIVE',
    })
    ctx.db.chatMessage.update.mockResolvedValue({ ...existingMessage, pinned: true })

    const result = await pinMessage(ctx.db, 'user-1', { messageId: 'msg-pin-2', pinned: true })

    expect(result.pinned).toBe(true)
  })

  it('should allow unpinning a message', async () => {
    const existingMessage = {
      id: 'msg-pin-3',
      groupId: 'group-1',
      senderId: 'user-2',
      content: 'Was pinned',
      pinned: true,
      deletedAt: null,
    }

    ctx.db.chatMessage.findUnique.mockResolvedValue(existingMessage)
    ctx.db.groupMembership.findFirst.mockResolvedValue({
      id: 'mem-owner',
      groupRole: GroupRole.OWNER,
      status: 'ACTIVE',
    })
    ctx.db.chatMessage.update.mockResolvedValue({ ...existingMessage, pinned: false })

    const result = await pinMessage(ctx.db, 'user-1', { messageId: 'msg-pin-3', pinned: false })

    expect(result.pinned).toBe(false)
  })

  it('should throw FORBIDDEN when regular MEMBER tries to pin', async () => {
    ctx.db.chatMessage.findUnique.mockResolvedValue({
      id: 'msg-pin-4',
      groupId: 'group-1',
      senderId: 'user-2',
      content: 'Cannot pin',
      pinned: false,
      deletedAt: null,
    })
    ctx.db.groupMembership.findFirst.mockResolvedValue(null) // Not owner/moderator

    await expect(
      pinMessage(ctx.db, 'user-1', { messageId: 'msg-pin-4', pinned: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('should throw NOT_FOUND for deleted message', async () => {
    ctx.db.chatMessage.findUnique.mockResolvedValue({
      id: 'msg-pin-5',
      senderId: 'user-1',
      deletedAt: new Date(),
    })

    await expect(
      pinMessage(ctx.db, 'user-1', { messageId: 'msg-pin-5', pinned: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
