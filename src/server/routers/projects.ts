import { z } from 'zod'
import { ProjectStatus, TaskStatus, Priority } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'
import {
  validateProjectStatusTransition,
  PROJECT_STATUS_LABELS,
} from '../services/project-status'
import {
  validatePilotStatusTransition,
  PILOT_STATUSES,
  PILOT_STATUS_LABELS,
} from '../services/pilot-status'
import { calculateMilestoneProgress } from '../services/milestone-progress'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const projectStatusEnum = z.nativeEnum(ProjectStatus)

const createProjectInput = z.object({
  name: z.string().min(1, 'Tên dự án không được để trống'),
  type: z.string().min(1, 'Loại dự án không được để trống'),
  goal: z.string().optional().nullable(),
  targetGroup: z.string().optional().nullable(),
  sponsorId: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  budget: z.number().optional().nullable(),
  riskLevel: z.string().optional().nullable(),
})

const updateProjectInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  goal: z.string().optional().nullable(),
  targetGroup: z.string().optional().nullable(),
  sponsorId: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  budget: z.number().optional().nullable(),
  riskLevel: z.string().optional().nullable(),
})

// ─── Pilots Schemas ───────────────────────────────────────────────────────────

const createPilotInput = z.object({
  projectId: z.string(),
  productId: z.string().optional().nullable(),
  deploymentArea: z.string().min(1, 'Khu vực triển khai không được để trống'),
  beneficiaryGroup: z.string().optional().nullable(),
  beneficiaryCount: z.number().int().min(0).optional().nullable(),
  consentStrategy: z.string().optional().nullable(),
  riskAssessment: z.string().optional().nullable(),
  successCriteria: z.any().optional().nullable(),
  status: z.string().optional(),
})

const updatePilotInput = z.object({
  id: z.string(),
  productId: z.string().optional().nullable(),
  deploymentArea: z.string().min(1).optional(),
  beneficiaryGroup: z.string().optional().nullable(),
  beneficiaryCount: z.number().int().min(0).optional().nullable(),
  consentStrategy: z.string().optional().nullable(),
  riskAssessment: z.string().optional().nullable(),
  successCriteria: z.any().optional().nullable(),
  status: z.string().optional(),
})

// ─── Milestones Schema (stored as JSON on project or separate) ────────────────
// Note: Milestones are tracked via Tasks linked to project (task.projectId) with isMilestone=true

const createMilestoneInput = z.object({
  projectId: z.string(),
  title: z.string().min(1, 'Tên mốc tiến độ không được để trống'),
  description: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  priority: z.nativeEnum(Priority).optional(),
})

const updateMilestoneInput = z.object({
  id: z.string(),
  title: z.string().min(1, 'Tên mốc tiến độ không được để trống').optional(),
  description: z.string().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  assignedTo: z.string().optional().nullable(),
  priority: z.nativeEnum(Priority).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
})

// ─── Projects Router ──────────────────────────────────────────────────────────

export const projectsRouter = router({
  /**
   * List projects with filtering, search, and pagination.
   */
  list: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({
      status: projectStatusEnum.optional(),
      type: z.string().optional(),
      ownerId: z.string().optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      sortField: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const {
        status,
        type,
        ownerId,
        search,
        page = 0,
        pageSize = 25,
        sortField = 'createdAt',
        sortDirection = 'desc',
      } = input ?? {}

      const where: Record<string, unknown> = {}

      if (status) where.status = status
      if (type) where.type = type
      if (ownerId) where.ownerId = ownerId

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { goal: { contains: search, mode: 'insensitive' } },
          { type: { contains: search, mode: 'insensitive' } },
        ]
      }

      const allowedSortFields = ['name', 'type', 'status', 'startDate', 'endDate', 'createdAt']
      const orderBy: Record<string, string> = {}
      if (sortField && allowedSortFields.includes(sortField)) {
        orderBy[sortField] = sortDirection ?? 'desc'
      } else {
        orderBy.createdAt = 'desc'
      }

      const [items, total] = await Promise.all([
        ctx.db.project.findMany({
          where,
          orderBy,
          skip: page * pageSize,
          take: pageSize,
          include: {
            pilots: { select: { id: true, status: true, deploymentArea: true } },
            _count: { select: { kpis: true, pilots: true } },
          },
        }),
        ctx.db.project.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single project by ID with pilots and KPIs.
   */
  get: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          pilots: {
            orderBy: { createdAt: 'desc' },
            include: {
              product: { select: { id: true, name: true } },
            },
          },
          kpis: { orderBy: { type: 'asc' } },
        },
      })
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dự án không tồn tại' })
      }
      return project
    }),

  /**
   * Create new project.
   */
  create: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(createProjectInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const project = await ctx.db.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            name: input.name,
            type: input.type,
            goal: input.goal ?? null,
            targetGroup: input.targetGroup ?? null,
            ownerId: userId,
            sponsorId: input.sponsorId ?? null,
            groupId: input.groupId ?? null,
            status: ProjectStatus.PROPOSED,
            startDate: input.startDate ?? null,
            endDate: input.endDate ?? null,
            budget: input.budget ?? null,
            riskLevel: input.riskLevel ?? null,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PROJECT_CREATED',
            targetType: 'Project',
            targetId: created.id,
            afterVal: { name: input.name, type: input.type },
          },
        })

        return created
      })

      return project
    }),

  /**
   * Update project fields (not status).
   */
  update: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(updateProjectInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.project.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dự án không tồn tại' })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.project.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PROJECT_UPDATED',
            targetType: 'Project',
            targetId: id,
            beforeVal: { name: existing.name, type: existing.type },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Delete project (soft — sets status to CANCELLED).
   */
  delete: roleProtectedProcedure(['Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.project.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dự án không tồn tại' })
      }

      const deleted = await ctx.db.$transaction(async (tx) => {
        const result = await tx.project.update({
          where: { id: input.id },
          data: { status: ProjectStatus.CANCELLED },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PROJECT_DELETED',
            targetType: 'Project',
            targetId: input.id,
            beforeVal: { status: existing.status },
            afterVal: { status: ProjectStatus.CANCELLED },
          },
        })

        return result
      })

      return deleted
    }),

  /**
   * Update project status with workflow validation.
   * Enforces valid state transitions and records timestamp.
   */
  updateStatus: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({
      id: z.string(),
      status: projectStatusEnum,
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const project = await ctx.db.project.findUnique({ where: { id: input.id } })
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dự án không tồn tại' })
      }

      // Validate transition
      const validation = validateProjectStatusTransition(
        project.status,
        input.status,
        userRoles
      )

      if (!validation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.message })
      }

      // Determine date fields to update based on transition
      const dateUpdates: Record<string, Date | null> = {}
      const now = new Date()

      if (input.status === ProjectStatus.ACTIVE && !project.startDate) {
        dateUpdates.startDate = now
      }
      if (input.status === ProjectStatus.COMPLETED || input.status === ProjectStatus.CANCELLED) {
        dateUpdates.endDate = now
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.project.update({
          where: { id: input.id },
          data: {
            status: input.status,
            ...dateUpdates,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PROJECT_STATUS_CHANGED',
            targetType: 'Project',
            targetId: input.id,
            beforeVal: { status: project.status },
            afterVal: { status: input.status, reason: input.reason ?? null, changedAt: now.toISOString() },
          },
        })

        return result
      })

      return updated
    }),

  // ─── Pilots CRUD ──────────────────────────────────────────────────────────

  /**
   * List pilots for a project.
   */
  listPilots: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const pilots = await ctx.db.pilotDeployment.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: 'desc' },
        include: {
          product: { select: { id: true, name: true } },
        },
      })
      return pilots
    }),

  /**
   * Create pilot deployment.
   * Validates: project not CANCELLED, productId references valid TechnologyProduct.
   */
  createPilot: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(createPilotInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Verify project exists
      const project = await ctx.db.project.findUnique({ where: { id: input.projectId } })
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dự án không tồn tại' })
      }

      // Cannot create pilot for a CANCELLED project
      if (project.status === ProjectStatus.CANCELLED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Không thể tạo pilot cho dự án đã bị hủy',
        })
      }

      // Validate productId references a valid TechnologyProduct
      if (input.productId) {
        const product = await ctx.db.technologyProduct.findUnique({
          where: { id: input.productId },
        })
        if (!product) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Sản phẩm công nghệ không tồn tại',
          })
        }
      }

      const pilot = await ctx.db.$transaction(async (tx) => {
        const created = await tx.pilotDeployment.create({
          data: {
            projectId: input.projectId,
            productId: input.productId ?? null,
            deploymentArea: input.deploymentArea,
            beneficiaryGroup: input.beneficiaryGroup ?? null,
            beneficiaryCount: input.beneficiaryCount ?? null,
            consentStrategy: input.consentStrategy ?? null,
            riskAssessment: input.riskAssessment ?? null,
            successCriteria: input.successCriteria ?? null,
            status: input.status ?? 'planning',
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PILOT_CREATED',
            targetType: 'PilotDeployment',
            targetId: created.id,
            afterVal: { projectId: input.projectId, deploymentArea: input.deploymentArea, productId: input.productId ?? null },
          },
        })

        return created
      })

      return pilot
    }),

  /**
   * Update pilot deployment fields (not status — use updatePilotStatus for that).
   */
  updatePilot: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(updatePilotInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.pilotDeployment.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pilot không tồn tại' })
      }

      // Validate productId if being updated
      if (updateData.productId) {
        const product = await ctx.db.technologyProduct.findUnique({
          where: { id: updateData.productId },
        })
        if (!product) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Sản phẩm công nghệ không tồn tại',
          })
        }
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.pilotDeployment.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PILOT_UPDATED',
            targetType: 'PilotDeployment',
            targetId: id,
            beforeVal: { status: existing.status, beneficiaryCount: existing.beneficiaryCount },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Delete pilot deployment.
   */
  deletePilot: roleProtectedProcedure(['Project_Manager', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.pilotDeployment.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pilot không tồn tại' })
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.pilotDeployment.delete({ where: { id: input.id } })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PILOT_DELETED',
            targetType: 'PilotDeployment',
            targetId: input.id,
            beforeVal: { projectId: existing.projectId, deploymentArea: existing.deploymentArea },
          },
        })
      })

      return { success: true }
    }),

  /**
   * Update pilot status with workflow validation.
   * Enforces valid state transitions: planning → deploying → active → completed → (terminal)
   */
  updatePilotStatus: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({
      id: z.string(),
      status: z.enum(['planning', 'deploying', 'active', 'completed', 'cancelled']),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const pilot = await ctx.db.pilotDeployment.findUnique({
        where: { id: input.id },
        include: { project: { select: { id: true, status: true } } },
      })
      if (!pilot) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Pilot không tồn tại' })
      }

      // Validate transition
      const validation = validatePilotStatusTransition(
        pilot.status,
        input.status,
        userRoles
      )

      if (!validation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.message })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.pilotDeployment.update({
          where: { id: input.id },
          data: { status: input.status },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PILOT_STATUS_CHANGED',
            targetType: 'PilotDeployment',
            targetId: input.id,
            beforeVal: { status: pilot.status },
            afterVal: { status: input.status, reason: input.reason ?? null },
          },
        })

        return result
      })

      return updated
    }),

  // ─── Milestones (via Tasks linked to project with isMilestone=true) ─────────

  /**
   * List milestones for a project.
   */
  listMilestones: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const tasks = await ctx.db.task.findMany({
        where: { projectId: input.projectId, isMilestone: true },
        orderBy: { dueDate: 'asc' },
      })
      return tasks
    }),

  /**
   * Create a milestone for a project.
   */
  createMilestone: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(createMilestoneInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const project = await ctx.db.project.findUnique({ where: { id: input.projectId } })
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dự án không tồn tại' })
      }

      if (project.status === ProjectStatus.CANCELLED) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Không thể tạo mốc tiến độ cho dự án đã bị hủy',
        })
      }

      const milestone = await ctx.db.$transaction(async (tx) => {
        const created = await tx.task.create({
          data: {
            title: input.title,
            description: input.description ?? null,
            dueDate: input.dueDate ?? null,
            assignedTo: input.assignedTo ?? null,
            priority: input.priority ?? Priority.MEDIUM,
            projectId: input.projectId,
            isMilestone: true,
            createdBy: userId,
            status: TaskStatus.OPEN,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'MILESTONE_CREATED',
            targetType: 'Task',
            targetId: created.id,
            afterVal: { title: input.title, projectId: input.projectId },
          },
        })

        return created
      })

      return milestone
    }),

  /**
   * Update a milestone's fields (title, description, dueDate, assignedTo, priority, status).
   */
  updateMilestone: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(updateMilestoneInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.task.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Mốc tiến độ không tồn tại' })
      }

      if (!existing.isMilestone) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Bản ghi này không phải là mốc tiến độ',
        })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.task.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'MILESTONE_UPDATED',
            targetType: 'Task',
            targetId: id,
            beforeVal: { title: existing.title, status: existing.status, dueDate: existing.dueDate },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Delete a milestone.
   */
  deleteMilestone: roleProtectedProcedure(['Project_Manager', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.task.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Mốc tiến độ không tồn tại' })
      }

      if (!existing.isMilestone) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Bản ghi này không phải là mốc tiến độ',
        })
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.task.delete({ where: { id: input.id } })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'MILESTONE_DELETED',
            targetType: 'Task',
            targetId: input.id,
            beforeVal: { title: existing.title, projectId: existing.projectId },
          },
        })
      })

      return { success: true }
    }),

  /**
   * Get milestone progress for a project.
   * Returns: total milestones, completed, overdue, percentage.
   */
  getMilestoneProgress: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const project = await ctx.db.project.findUnique({ where: { id: input.projectId } })
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dự án không tồn tại' })
      }

      const milestones = await ctx.db.task.findMany({
        where: { projectId: input.projectId, isMilestone: true },
        select: { id: true, status: true, dueDate: true },
      })

      return calculateMilestoneProgress(milestones)
    }),
})
