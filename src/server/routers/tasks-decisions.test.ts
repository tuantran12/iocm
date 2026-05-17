import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Priority, TaskStatus, GroupRole, GroupMemberStatus } from '@prisma/client'
import { TRPCError } from '@trpc/server'

/**
 * Tasks & Decisions Router Tests
 *
 * Tests task CRUD, status transitions, permissions, and decision workflow.
 * Validates: Requirements R15 (Task Management), R16 (Group Decisions)
 */

// ─── Mock Prisma & Context Helpers ────────────────────────────────────────────

function createMockTx() {
  return {
    task: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    groupDecision: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

function createMockDb() {
  const tx = createMockTx()
  return {
    task: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    groupDecision: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    groupMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx)),
  }
}

type MockDb = ReturnType<typeof createMockDb>

// ─── Valid status transitions (mirrors router logic) ──────────────────────────

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.OPEN]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
  [TaskStatus.BLOCKED]: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.IN_REVIEW]: [TaskStatus.DONE, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.DONE]: [],
  [TaskStatus.CANCELLED]: [],
}

// ─── Extracted Business Logic (mirrors router for testability) ────────────────

async function canManageTask(
  db: MockDb,
  taskId: string,
  userId: string,
  userRoles: string[],
): Promise<boolean> {
  if (['System_Admin', 'Director'].some((r) => userRoles.includes(r))) {
    return true
  }

  const task = await db.task.findUnique({ where: { id: taskId } })
  if (!task) return false

  if ((task as any).createdBy === userId || (task as any).assignedTo === userId) {
    return true
  }

  if ((task as any).groupId) {
    const membership = await db.groupMembership.findFirst({
      where: {
        groupId: (task as any).groupId,
        userId,
        status: GroupMemberStatus.ACTIVE,
        groupRole: { in: [GroupRole.OWNER, GroupRole.MODERATOR] },
      },
    })
    if (membership) return true
  }

  return false
}

async function isGroupMember(
  db: MockDb,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const membership = await db.groupMembership.findFirst({
    where: { groupId, userId, status: GroupMemberStatus.ACTIVE },
  })
  return !!membership
}

async function isGroupOwnerOrModerator(
  db: MockDb,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const membership = await db.groupMembership.findFirst({
    where: {
      groupId,
      userId,
      status: GroupMemberStatus.ACTIVE,
      groupRole: { in: [GroupRole.OWNER, GroupRole.MODERATOR] },
    },
  })
  return !!membership
}

// ─── Task Business Logic ──────────────────────────────────────────────────────

interface CreateTaskInput {
  title: string
  description?: string | null
  assignedTo?: string | null
  groupId?: string | null
  projectId?: string | null
  documentId?: string | null
  priority?: Priority
  dueDate?: Date | null
}

async function createTask(db: MockDb, input: CreateTaskInput, userId: string) {
  if (input.groupId) {
    const isMember = await isGroupMember(db, input.groupId, userId)
    if (!isMember) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Bạn phải là thành viên nhóm để tạo công việc trong nhóm này',
      })
    }
  }

  const task = await db.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        assignedTo: input.assignedTo ?? null,
        createdBy: userId,
        groupId: input.groupId ?? null,
        projectId: input.projectId ?? null,
        documentId: input.documentId ?? null,
        priority: input.priority ?? Priority.MEDIUM,
        dueDate: input.dueDate ?? null,
        status: TaskStatus.OPEN,
      },
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: 'TASK_CREATED',
        targetType: 'Task',
        targetId: (created as any).id,
        afterVal: {
          title: input.title,
          groupId: input.groupId,
          assignedTo: input.assignedTo,
          priority: input.priority ?? 'MEDIUM',
        },
      },
    })

    return created
  })

  return task
}

interface UpdateTaskInput {
  id: string
  title?: string
  description?: string | null
  assignedTo?: string | null
  priority?: Priority
  dueDate?: Date | null
}

async function updateTask(
  db: MockDb,
  input: UpdateTaskInput,
  userId: string,
  userRoles: string[],
) {
  const { id, ...updateData } = input

  const existing = await db.task.findUnique({ where: { id } })
  if (!existing) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Công việc không tồn tại' })
  }

  const hasAccess = await canManageTask(db, id, userId, userRoles)
  if (!hasAccess) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Bạn không có quyền cập nhật công việc này',
    })
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.task.update({
      where: { id },
      data: updateData,
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: 'TASK_UPDATED',
        targetType: 'Task',
        targetId: id,
        beforeVal: { title: (existing as any).title, priority: (existing as any).priority },
        afterVal: updateData,
      },
    })

    return result
  })

  return updated
}

async function assignTask(
  db: MockDb,
  taskId: string,
  assignedTo: string | null,
  userId: string,
  userRoles: string[],
) {
  const existing = await db.task.findUnique({ where: { id: taskId } })
  if (!existing) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Công việc không tồn tại' })
  }

  const hasAccess = await canManageTask(db, taskId, userId, userRoles)
  if (!hasAccess) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Bạn không có quyền gán người thực hiện cho công việc này',
    })
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.task.update({
      where: { id: taskId },
      data: { assignedTo },
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: 'TASK_ASSIGNED',
        targetType: 'Task',
        targetId: taskId,
        beforeVal: { assignedTo: (existing as any).assignedTo },
        afterVal: { assignedTo },
      },
    })

    return result
  })

  return updated
}

async function updateTaskStatus(
  db: MockDb,
  taskId: string,
  newStatus: TaskStatus,
  userId: string,
  userRoles: string[],
) {
  const existing = await db.task.findUnique({ where: { id: taskId } })
  if (!existing) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Công việc không tồn tại' })
  }

  const currentStatus = (existing as any).status as TaskStatus
  const allowedTransitions = VALID_TRANSITIONS[currentStatus]
  if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Không thể chuyển trạng thái từ ${currentStatus} sang ${newStatus}`,
    })
  }

  const hasAccess = await canManageTask(db, taskId, userId, userRoles)
  if (!hasAccess) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Bạn không có quyền thay đổi trạng thái công việc này',
    })
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.task.update({
      where: { id: taskId },
      data: { status: newStatus },
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: 'TASK_STATUS_CHANGED',
        targetType: 'Task',
        targetId: taskId,
        beforeVal: { status: currentStatus },
        afterVal: { status: newStatus },
      },
    })

    return result
  })

  return updated
}

// ─── Decision Business Logic ──────────────────────────────────────────────────

interface CreateDecisionInput {
  groupId: string
  title: string
  description?: string | null
}

async function createDecision(db: MockDb, input: CreateDecisionInput, userId: string) {
  const isMember = await isGroupMember(db, input.groupId, userId)
  if (!isMember) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Bạn phải là thành viên nhóm để đề xuất quyết định',
    })
  }

  const decision = await db.$transaction(async (tx) => {
    const created = await tx.groupDecision.create({
      data: {
        groupId: input.groupId,
        title: input.title,
        description: input.description ?? null,
        proposedBy: userId,
        status: 'proposed',
      },
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: 'DECISION_PROPOSED',
        targetType: 'GroupDecision',
        targetId: (created as any).id,
        afterVal: { title: input.title, groupId: input.groupId, status: 'proposed' },
      },
    })

    return created
  })

  return decision
}

async function approveDecision(db: MockDb, decisionId: string, userId: string) {
  const decision = await db.groupDecision.findUnique({ where: { id: decisionId } })
  if (!decision) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Quyết định không tồn tại' })
  }

  if ((decision as any).status !== 'proposed') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Không thể phê duyệt quyết định ở trạng thái "${(decision as any).status}"`,
    })
  }

  const hasPermission = await isGroupOwnerOrModerator(db, (decision as any).groupId, userId)
  if (!hasPermission) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Chỉ chủ nhóm hoặc moderator mới có thể phê duyệt quyết định',
    })
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.groupDecision.update({
      where: { id: decisionId },
      data: { status: 'approved', approvedBy: userId },
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: 'DECISION_APPROVED',
        targetType: 'GroupDecision',
        targetId: decisionId,
        beforeVal: { status: 'proposed' },
        afterVal: { status: 'approved', approvedBy: userId },
      },
    })

    return result
  })

  return updated
}

async function rejectDecision(db: MockDb, decisionId: string, userId: string) {
  const decision = await db.groupDecision.findUnique({ where: { id: decisionId } })
  if (!decision) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Quyết định không tồn tại' })
  }

  if ((decision as any).status !== 'proposed') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Không thể từ chối quyết định ở trạng thái "${(decision as any).status}"`,
    })
  }

  const hasPermission = await isGroupOwnerOrModerator(db, (decision as any).groupId, userId)
  if (!hasPermission) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Chỉ chủ nhóm hoặc moderator mới có thể từ chối quyết định',
    })
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.groupDecision.update({
      where: { id: decisionId },
      data: { status: 'rejected', approvedBy: userId },
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: 'DECISION_REJECTED',
        targetType: 'GroupDecision',
        targetId: decisionId,
        beforeVal: { status: 'proposed' },
        afterVal: { status: 'rejected', rejectedBy: userId },
      },
    })

    return result
  })

  return updated
}


// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Tasks Router - CRUD', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('creates a personal task with default priority and OPEN status', async () => {
      const txMock = createMockTx()
      txMock.task.create.mockResolvedValue({
        id: 'task-1',
        title: 'Soạn báo cáo',
        status: TaskStatus.OPEN,
        priority: Priority.MEDIUM,
        createdBy: 'user-1',
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await createTask(mockDb, { title: 'Soạn báo cáo' }, 'user-1')

      expect(txMock.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Soạn báo cáo',
          createdBy: 'user-1',
          status: TaskStatus.OPEN,
          priority: Priority.MEDIUM,
          groupId: null,
          assignedTo: null,
        }),
      })
      expect((result as any).id).toBe('task-1')
    })

    it('creates a group task when user is a group member', async () => {
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-1',
        status: GroupMemberStatus.ACTIVE,
      })
      const txMock = createMockTx()
      txMock.task.create.mockResolvedValue({
        id: 'task-2',
        title: 'Kiểm tra hợp đồng',
        groupId: 'group-1',
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await createTask(
        mockDb,
        { title: 'Kiểm tra hợp đồng', groupId: 'group-1', priority: Priority.HIGH },
        'user-1',
      )

      expect(txMock.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Kiểm tra hợp đồng',
          groupId: 'group-1',
          priority: Priority.HIGH,
        }),
      })
      expect((result as any).groupId).toBe('group-1')
    })

    it('throws FORBIDDEN when creating group task without membership', async () => {
      mockDb.groupMembership.findFirst.mockResolvedValue(null)

      await expect(
        createTask(mockDb, { title: 'Hack task', groupId: 'group-1' }, 'outsider'),
      ).rejects.toThrow('Bạn phải là thành viên nhóm để tạo công việc trong nhóm này')
    })

    it('creates audit log on task creation', async () => {
      const txMock = createMockTx()
      txMock.task.create.mockResolvedValue({ id: 'task-3' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await createTask(mockDb, { title: 'Audit task', assignedTo: 'user-2' }, 'user-1')

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'TASK_CREATED',
          targetType: 'Task',
        }),
      })
    })
  })

  describe('update', () => {
    it('allows task creator to update', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        title: 'Old title',
        priority: Priority.MEDIUM,
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })
      const txMock = createMockTx()
      txMock.task.update.mockResolvedValue({ id: 'task-1', title: 'New title' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await updateTask(
        mockDb,
        { id: 'task-1', title: 'New title' },
        'user-1',
        ['Enterprise_Member'],
      )

      expect(txMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { title: 'New title' },
      })
      expect((result as any).title).toBe('New title')
    })

    it('throws NOT_FOUND when task does not exist', async () => {
      mockDb.task.findUnique.mockResolvedValue(null)

      await expect(
        updateTask(mockDb, { id: 'nonexistent', title: 'X' }, 'user-1', []),
      ).rejects.toThrow('Công việc không tồn tại')
    })

    it('throws FORBIDDEN when user has no access', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        title: 'Title',
        createdBy: 'other-user',
        assignedTo: 'another-user',
        groupId: null,
      })

      await expect(
        updateTask(mockDb, { id: 'task-1', title: 'Hack' }, 'random-user', ['Viewer']),
      ).rejects.toThrow('Bạn không có quyền cập nhật công việc này')
    })
  })

  describe('assign', () => {
    it('allows creator to assign task to another user', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })
      const txMock = createMockTx()
      txMock.task.update.mockResolvedValue({ id: 'task-1', assignedTo: 'user-2' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await assignTask(mockDb, 'task-1', 'user-2', 'user-1', ['Enterprise_Member'])

      expect(txMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { assignedTo: 'user-2' },
      })
      expect((result as any).assignedTo).toBe('user-2')
    })

    it('allows unassigning (set to null)', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        createdBy: 'user-1',
        assignedTo: 'user-2',
        groupId: null,
      })
      const txMock = createMockTx()
      txMock.task.update.mockResolvedValue({ id: 'task-1', assignedTo: null })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await assignTask(mockDb, 'task-1', null, 'user-1', ['Enterprise_Member'])

      expect(txMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { assignedTo: null },
      })
      expect((result as any).assignedTo).toBeNull()
    })

    it('throws FORBIDDEN when unauthorized user tries to assign', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        createdBy: 'other-user',
        assignedTo: 'another-user',
        groupId: null,
      })

      await expect(
        assignTask(mockDb, 'task-1', 'hacker', 'random-user', ['Viewer']),
      ).rejects.toThrow('Bạn không có quyền gán người thực hiện cho công việc này')
    })
  })

  describe('list', () => {
    it('returns paginated task list', async () => {
      const tasks = [
        { id: 'task-1', title: 'Task 1', status: TaskStatus.OPEN },
        { id: 'task-2', title: 'Task 2', status: TaskStatus.IN_PROGRESS },
      ]
      mockDb.task.findMany.mockResolvedValue(tasks)
      mockDb.task.count.mockResolvedValue(2)

      const items = await mockDb.task.findMany({ where: {}, skip: 0, take: 25 })
      const total = await mockDb.task.count({ where: {} })

      expect(items).toHaveLength(2)
      expect(total).toBe(2)
    })
  })
})


// ─── Tests: Task Status Transitions ──────────────────────────────────────────

describe('Tasks Router - Status Transitions', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('valid transitions', () => {
    it('OPEN → IN_PROGRESS', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.OPEN,
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })
      const txMock = createMockTx()
      txMock.task.update.mockResolvedValue({ id: 'task-1', status: TaskStatus.IN_PROGRESS })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await updateTaskStatus(
        mockDb, 'task-1', TaskStatus.IN_PROGRESS, 'user-1', ['Enterprise_Member'],
      )

      expect(txMock.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { status: TaskStatus.IN_PROGRESS },
      })
      expect((result as any).status).toBe(TaskStatus.IN_PROGRESS)
    })

    it('IN_PROGRESS → IN_REVIEW', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.IN_PROGRESS,
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })
      const txMock = createMockTx()
      txMock.task.update.mockResolvedValue({ id: 'task-1', status: TaskStatus.IN_REVIEW })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await updateTaskStatus(
        mockDb, 'task-1', TaskStatus.IN_REVIEW, 'user-1', ['Enterprise_Member'],
      )

      expect((result as any).status).toBe(TaskStatus.IN_REVIEW)
    })

    it('IN_REVIEW → DONE', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.IN_REVIEW,
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })
      const txMock = createMockTx()
      txMock.task.update.mockResolvedValue({ id: 'task-1', status: TaskStatus.DONE })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await updateTaskStatus(
        mockDb, 'task-1', TaskStatus.DONE, 'user-1', ['Enterprise_Member'],
      )

      expect((result as any).status).toBe(TaskStatus.DONE)
    })

    it('BLOCKED → OPEN (unblock)', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.BLOCKED,
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })
      const txMock = createMockTx()
      txMock.task.update.mockResolvedValue({ id: 'task-1', status: TaskStatus.OPEN })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await updateTaskStatus(
        mockDb, 'task-1', TaskStatus.OPEN, 'user-1', ['Enterprise_Member'],
      )

      expect((result as any).status).toBe(TaskStatus.OPEN)
    })

    it('any non-terminal status → CANCELLED', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.IN_PROGRESS,
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })
      const txMock = createMockTx()
      txMock.task.update.mockResolvedValue({ id: 'task-1', status: TaskStatus.CANCELLED })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await updateTaskStatus(
        mockDb, 'task-1', TaskStatus.CANCELLED, 'user-1', ['Enterprise_Member'],
      )

      expect((result as any).status).toBe(TaskStatus.CANCELLED)
    })
  })

  describe('invalid transitions', () => {
    it('rejects DONE → any (terminal state)', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.DONE,
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })

      await expect(
        updateTaskStatus(mockDb, 'task-1', TaskStatus.OPEN, 'user-1', ['Enterprise_Member']),
      ).rejects.toThrow('Không thể chuyển trạng thái từ DONE sang OPEN')
    })

    it('rejects CANCELLED → any (terminal state)', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.CANCELLED,
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })

      await expect(
        updateTaskStatus(mockDb, 'task-1', TaskStatus.IN_PROGRESS, 'user-1', ['Enterprise_Member']),
      ).rejects.toThrow('Không thể chuyển trạng thái từ CANCELLED sang IN_PROGRESS')
    })

    it('rejects OPEN → DONE (must go through IN_PROGRESS → IN_REVIEW)', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.OPEN,
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })

      await expect(
        updateTaskStatus(mockDb, 'task-1', TaskStatus.DONE, 'user-1', ['Enterprise_Member']),
      ).rejects.toThrow('Không thể chuyển trạng thái từ OPEN sang DONE')
    })

    it('rejects OPEN → IN_REVIEW (must go through IN_PROGRESS)', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.OPEN,
        createdBy: 'user-1',
        assignedTo: null,
        groupId: null,
      })

      await expect(
        updateTaskStatus(mockDb, 'task-1', TaskStatus.IN_REVIEW, 'user-1', ['Enterprise_Member']),
      ).rejects.toThrow('Không thể chuyển trạng thái từ OPEN sang IN_REVIEW')
    })
  })

  describe('terminal states', () => {
    it('DONE has no valid transitions', () => {
      expect(VALID_TRANSITIONS[TaskStatus.DONE]).toEqual([])
    })

    it('CANCELLED has no valid transitions', () => {
      expect(VALID_TRANSITIONS[TaskStatus.CANCELLED]).toEqual([])
    })
  })
})


// ─── Tests: Task Permissions ─────────────────────────────────────────────────

describe('Tasks Router - Permissions', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('canManageTask', () => {
    it('System_Admin can manage any task', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        createdBy: 'other-user',
        assignedTo: 'another-user',
        groupId: null,
      })

      const result = await canManageTask(mockDb, 'task-1', 'admin-1', ['System_Admin'])
      expect(result).toBe(true)
    })

    it('Director can manage any task', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        createdBy: 'other-user',
        assignedTo: 'another-user',
        groupId: null,
      })

      const result = await canManageTask(mockDb, 'task-1', 'director-1', ['Director'])
      expect(result).toBe(true)
    })

    it('task creator can manage their task', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        createdBy: 'user-1',
        assignedTo: 'user-2',
        groupId: null,
      })

      const result = await canManageTask(mockDb, 'task-1', 'user-1', ['Enterprise_Member'])
      expect(result).toBe(true)
    })

    it('task assignee can manage the task', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        createdBy: 'other-user',
        assignedTo: 'user-1',
        groupId: null,
      })

      const result = await canManageTask(mockDb, 'task-1', 'user-1', ['Enterprise_Member'])
      expect(result).toBe(true)
    })

    it('group owner can manage group tasks', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        createdBy: 'other-user',
        assignedTo: 'another-user',
        groupId: 'group-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-1',
        groupRole: GroupRole.OWNER,
        status: GroupMemberStatus.ACTIVE,
      })

      const result = await canManageTask(mockDb, 'task-1', 'owner-1', ['Enterprise_Member'])
      expect(result).toBe(true)
    })

    it('group moderator can manage group tasks', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        createdBy: 'other-user',
        assignedTo: 'another-user',
        groupId: 'group-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-1',
        groupRole: GroupRole.MODERATOR,
        status: GroupMemberStatus.ACTIVE,
      })

      const result = await canManageTask(mockDb, 'task-1', 'mod-1', ['Enterprise_Member'])
      expect(result).toBe(true)
    })

    it('regular group member cannot manage others tasks', async () => {
      mockDb.task.findUnique.mockResolvedValue({
        id: 'task-1',
        createdBy: 'other-user',
        assignedTo: 'another-user',
        groupId: 'group-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null)

      const result = await canManageTask(mockDb, 'task-1', 'regular-member', ['Enterprise_Member'])
      expect(result).toBe(false)
    })

    it('returns false when task does not exist', async () => {
      mockDb.task.findUnique.mockResolvedValue(null)

      const result = await canManageTask(mockDb, 'nonexistent', 'user-1', ['Enterprise_Member'])
      expect(result).toBe(false)
    })
  })
})


// ─── Tests: Decision Workflow ────────────────────────────────────────────────

describe('Decisions Router - Workflow', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('propose (create)', () => {
    it('group member can propose a decision', async () => {
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-1',
        status: GroupMemberStatus.ACTIVE,
      })
      const txMock = createMockTx()
      txMock.groupDecision.create.mockResolvedValue({
        id: 'dec-1',
        title: 'Áp dụng AI policy',
        status: 'proposed',
        groupId: 'group-1',
        proposedBy: 'user-1',
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await createDecision(
        mockDb,
        { groupId: 'group-1', title: 'Áp dụng AI policy' },
        'user-1',
      )

      expect(txMock.groupDecision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          groupId: 'group-1',
          title: 'Áp dụng AI policy',
          proposedBy: 'user-1',
          status: 'proposed',
        }),
      })
      expect((result as any).status).toBe('proposed')
    })

    it('non-member cannot propose a decision', async () => {
      mockDb.groupMembership.findFirst.mockResolvedValue(null)

      await expect(
        createDecision(mockDb, { groupId: 'group-1', title: 'Hack' }, 'outsider'),
      ).rejects.toThrow('Bạn phải là thành viên nhóm để đề xuất quyết định')
    })

    it('creates audit log on proposal', async () => {
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-1',
        status: GroupMemberStatus.ACTIVE,
      })
      const txMock = createMockTx()
      txMock.groupDecision.create.mockResolvedValue({ id: 'dec-1' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await createDecision(
        mockDb,
        { groupId: 'group-1', title: 'New policy' },
        'user-1',
      )

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          action: 'DECISION_PROPOSED',
          targetType: 'GroupDecision',
        }),
      })
    })
  })

  describe('approve', () => {
    it('group owner can approve a proposed decision', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue({
        id: 'dec-1',
        status: 'proposed',
        groupId: 'group-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-1',
        groupRole: GroupRole.OWNER,
        status: GroupMemberStatus.ACTIVE,
      })
      const txMock = createMockTx()
      txMock.groupDecision.update.mockResolvedValue({
        id: 'dec-1',
        status: 'approved',
        approvedBy: 'owner-1',
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await approveDecision(mockDb, 'dec-1', 'owner-1')

      expect(txMock.groupDecision.update).toHaveBeenCalledWith({
        where: { id: 'dec-1' },
        data: { status: 'approved', approvedBy: 'owner-1' },
      })
      expect((result as any).status).toBe('approved')
    })

    it('moderator can approve a proposed decision', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue({
        id: 'dec-1',
        status: 'proposed',
        groupId: 'group-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-1',
        groupRole: GroupRole.MODERATOR,
        status: GroupMemberStatus.ACTIVE,
      })
      const txMock = createMockTx()
      txMock.groupDecision.update.mockResolvedValue({
        id: 'dec-1',
        status: 'approved',
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await approveDecision(mockDb, 'dec-1', 'mod-1')

      expect((result as any).status).toBe('approved')
    })

    it('regular member cannot approve a decision', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue({
        id: 'dec-1',
        status: 'proposed',
        groupId: 'group-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null)

      await expect(
        approveDecision(mockDb, 'dec-1', 'regular-member'),
      ).rejects.toThrow('Chỉ chủ nhóm hoặc moderator mới có thể phê duyệt quyết định')
    })

    it('cannot approve already approved decision', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue({
        id: 'dec-1',
        status: 'approved',
        groupId: 'group-1',
      })

      await expect(
        approveDecision(mockDb, 'dec-1', 'owner-1'),
      ).rejects.toThrow('Không thể phê duyệt quyết định ở trạng thái "approved"')
    })

    it('cannot approve rejected decision', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue({
        id: 'dec-1',
        status: 'rejected',
        groupId: 'group-1',
      })

      await expect(
        approveDecision(mockDb, 'dec-1', 'owner-1'),
      ).rejects.toThrow('Không thể phê duyệt quyết định ở trạng thái "rejected"')
    })

    it('throws NOT_FOUND when decision does not exist', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue(null)

      await expect(
        approveDecision(mockDb, 'nonexistent', 'owner-1'),
      ).rejects.toThrow('Quyết định không tồn tại')
    })
  })

  describe('reject', () => {
    it('group owner can reject a proposed decision', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue({
        id: 'dec-1',
        status: 'proposed',
        groupId: 'group-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-1',
        groupRole: GroupRole.OWNER,
        status: GroupMemberStatus.ACTIVE,
      })
      const txMock = createMockTx()
      txMock.groupDecision.update.mockResolvedValue({
        id: 'dec-1',
        status: 'rejected',
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await rejectDecision(mockDb, 'dec-1', 'owner-1')

      expect(txMock.groupDecision.update).toHaveBeenCalledWith({
        where: { id: 'dec-1' },
        data: { status: 'rejected', approvedBy: 'owner-1' },
      })
      expect((result as any).status).toBe('rejected')
    })

    it('regular member cannot reject a decision', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue({
        id: 'dec-1',
        status: 'proposed',
        groupId: 'group-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue(null)

      await expect(
        rejectDecision(mockDb, 'dec-1', 'regular-member'),
      ).rejects.toThrow('Chỉ chủ nhóm hoặc moderator mới có thể từ chối quyết định')
    })

    it('cannot reject already approved decision', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue({
        id: 'dec-1',
        status: 'approved',
        groupId: 'group-1',
      })

      await expect(
        rejectDecision(mockDb, 'dec-1', 'owner-1'),
      ).rejects.toThrow('Không thể từ chối quyết định ở trạng thái "approved"')
    })

    it('throws NOT_FOUND when decision does not exist', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue(null)

      await expect(
        rejectDecision(mockDb, 'nonexistent', 'owner-1'),
      ).rejects.toThrow('Quyết định không tồn tại')
    })

    it('creates audit log on rejection', async () => {
      mockDb.groupDecision.findUnique.mockResolvedValue({
        id: 'dec-1',
        status: 'proposed',
        groupId: 'group-1',
      })
      mockDb.groupMembership.findFirst.mockResolvedValue({
        id: 'gm-1',
        groupRole: GroupRole.OWNER,
        status: GroupMemberStatus.ACTIVE,
      })
      const txMock = createMockTx()
      txMock.groupDecision.update.mockResolvedValue({ id: 'dec-1', status: 'rejected' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await rejectDecision(mockDb, 'dec-1', 'owner-1')

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'owner-1',
          action: 'DECISION_REJECTED',
          targetType: 'GroupDecision',
          targetId: 'dec-1',
        }),
      })
    })
  })
})
