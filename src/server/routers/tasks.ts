import { z } from 'zod'
import { Priority, TaskStatus, GroupRole, GroupMemberStatus } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../trpc'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const priorityEnum = z.nativeEnum(Priority)
const taskStatusEnum = z.nativeEnum(TaskStatus)

const createTaskInput = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống'),
  description: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  documentId: z.string().optional().nullable(),
  priority: priorityEnum.optional(),
  dueDate: z.coerce.date().optional().nullable(),
})

const updateTaskInput = z.object({
  id: z.string(),
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  documentId: z.string().optional().nullable(),
  priority: priorityEnum.optional(),
  dueDate: z.coerce.date().optional().nullable(),
})

// ─── Valid status transitions ─────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.OPEN]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW, TaskStatus.BLOCKED, TaskStatus.CANCELLED],
  [TaskStatus.BLOCKED]: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.IN_REVIEW]: [TaskStatus.DONE, TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
  [TaskStatus.DONE]: [],
  [TaskStatus.CANCELLED]: [],
}

// ─── Helper: Check if user can manage a task ──────────────────────────────────

async function canManageTask(
  db: any,
  taskId: string,
  userId: string,
  userRoles: string[],
): Promise<boolean> {
  // System_Admin / Director bypass
  if (['System_Admin', 'Director'].some((r) => userRoles.includes(r))) {
    return true
  }

  const task = await db.task.findUnique({ where: { id: taskId } })
  if (!task) return false

  // Task creator or assignee
  if (task.createdBy === userId || task.assignedTo === userId) {
    return true
  }

  // Group owner/moderator
  if (task.groupId) {
    const membership = await db.groupMembership.findFirst({
      where: {
        groupId: task.groupId,
        userId,
        status: GroupMemberStatus.ACTIVE,
        groupRole: { in: [GroupRole.OWNER, GroupRole.MODERATOR] },
      },
    })
    if (membership) return true
  }

  return false
}

// ─── Helper: Check if user is a group member ──────────────────────────────────

async function isGroupMember(
  db: any,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const membership = await db.groupMembership.findFirst({
    where: {
      groupId,
      userId,
      status: GroupMemberStatus.ACTIVE,
    },
  })
  return !!membership
}


// ─── Tasks Router ─────────────────────────────────────────────────────────────

export const tasksRouter = router({
  /**
   * List tasks with filtering (by group, assignee, status, priority) and pagination.
   * Any authenticated user can list — results filtered by access.
   */
  list: protectedProcedure
    .input(z.object({
      groupId: z.string().optional(),
      assignedTo: z.string().optional(),
      status: taskStatusEnum.optional(),
      priority: priorityEnum.optional(),
      projectId: z.string().optional(),
      documentId: z.string().optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const {
        groupId,
        assignedTo,
        status,
        priority,
        projectId,
        documentId,
        search,
        page = 0,
        pageSize = 25,
      } = input ?? {}

      const where: Record<string, unknown> = {}

      if (groupId) where.groupId = groupId
      if (assignedTo) where.assignedTo = assignedTo
      if (status) where.status = status
      if (priority) where.priority = priority
      if (projectId) where.projectId = projectId
      if (documentId) where.documentId = documentId

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [items, total] = await Promise.all([
        ctx.db.task.findMany({
          where,
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
          skip: page * pageSize,
          take: pageSize,
        }),
        ctx.db.task.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single task by ID.
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const task = await ctx.db.task.findUnique({
        where: { id: input.id },
        include: { group: { select: { id: true, name: true, type: true } } },
      })

      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Công việc không tồn tại' })
      }

      return task
    }),

  /**
   * Create new task.
   * Any authenticated group member can create tasks within their group.
   * If no groupId, any authenticated user can create a personal task.
   */
  create: protectedProcedure
    .input(createTaskInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // If groupId provided, verify user is a member of that group
      if (input.groupId) {
        const isMember = await isGroupMember(ctx.db, input.groupId, userId)
        if (!isMember) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Bạn phải là thành viên nhóm để tạo công việc trong nhóm này',
          })
        }
      }

      const task = await ctx.db.$transaction(async (tx: any) => {
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
            targetId: created.id,
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
    }),

  /**
   * Update task fields.
   * Allowed: task creator, assignee, group owner/moderator, System_Admin, Director.
   */
  update: protectedProcedure
    .input(updateTaskInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const existing = await ctx.db.task.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Công việc không tồn tại' })
      }

      const hasAccess = await canManageTask(ctx.db, id, userId, userRoles)
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền cập nhật công việc này',
        })
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
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
            beforeVal: {
              title: existing.title,
              priority: existing.priority,
              dueDate: existing.dueDate,
            },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Assign/reassign task to a user.
   * Allowed: task creator, current assignee, group owner/moderator, System_Admin, Director.
   */
  assign: protectedProcedure
    .input(z.object({
      id: z.string(),
      assignedTo: z.string().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const existing = await ctx.db.task.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Công việc không tồn tại' })
      }

      const hasAccess = await canManageTask(ctx.db, input.id, userId, userRoles)
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền gán người thực hiện cho công việc này',
        })
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.task.update({
          where: { id: input.id },
          data: { assignedTo: input.assignedTo },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'TASK_ASSIGNED',
            targetType: 'Task',
            targetId: input.id,
            beforeVal: { assignedTo: existing.assignedTo },
            afterVal: { assignedTo: input.assignedTo },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Transition task status.
   * Valid transitions: OPEN → IN_PROGRESS → IN_REVIEW → DONE
   * Any status can go to BLOCKED or CANCELLED (except DONE/CANCELLED which are terminal).
   * Allowed: task assignee, creator, group owner/moderator, System_Admin, Director.
   */
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: taskStatusEnum,
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const existing = await ctx.db.task.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Công việc không tồn tại' })
      }

      // Validate status transition
      const allowedTransitions = VALID_TRANSITIONS[existing.status as TaskStatus]
      if (!allowedTransitions || !allowedTransitions.includes(input.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Không thể chuyển trạng thái từ ${existing.status} sang ${input.status}`,
        })
      }

      const hasAccess = await canManageTask(ctx.db, input.id, userId, userRoles)
      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không có quyền thay đổi trạng thái công việc này',
        })
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.task.update({
          where: { id: input.id },
          data: { status: input.status },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'TASK_STATUS_CHANGED',
            targetType: 'Task',
            targetId: input.id,
            beforeVal: { status: existing.status },
            afterVal: { status: input.status },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * List tasks assigned to the current user (personal dashboard).
   * Supports filtering by status and priority.
   */
  myTasks: protectedProcedure
    .input(z.object({
      status: taskStatusEnum.optional(),
      priority: priorityEnum.optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const {
        status,
        priority,
        page = 0,
        pageSize = 25,
      } = input ?? {}

      const where: Record<string, unknown> = { assignedTo: userId }

      if (status) where.status = status
      if (priority) where.priority = priority

      const [items, total] = await Promise.all([
        ctx.db.task.findMany({
          where,
          orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
          skip: page * pageSize,
          take: pageSize,
          include: { group: { select: { id: true, name: true } } },
        }),
        ctx.db.task.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),
})
