import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUEST_TYPES = ['access', 'correction', 'deletion', 'restriction', 'withdrawal'] as const
const REQUEST_STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'rejected'] as const

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const requestTypeEnum = z.enum(REQUEST_TYPES)
const requestStatusEnum = z.enum(REQUEST_STATUSES)

const createRequestInput = z.object({
  subjectId: z.string().min(1, 'Mã chủ thể dữ liệu không được để trống'),
  type: requestTypeEnum,
  receivedDate: z.coerce.date(),
  deadline: z.coerce.date().optional().nullable(),
  decision: z.string().optional().nullable(),
  actionTaken: z.string().optional().nullable(),
})

// ─── Data Subject Requests Router ─────────────────────────────────────────────

export const dataRequestsRouter = router({
  /**
   * List data subject requests with optional filters.
   */
  list: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({
      status: requestStatusEnum.optional(),
      type: requestTypeEnum.optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const where: Record<string, unknown> = {}

      if (input?.status) {
        where.status = input.status
      }

      if (input?.type) {
        where.type = input.type
      }

      const requests = await ctx.db.dataSubjectRequest.findMany({
        where,
        orderBy: { receivedDate: 'desc' },
      })

      return requests
    }),

  /**
   * Get single data subject request by ID.
   */
  get: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const request = await ctx.db.dataSubjectRequest.findUnique({
        where: { id: input.id },
      })
      if (!request) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Yêu cầu chủ thể dữ liệu không tồn tại' })
      }
      return request
    }),

  /**
   * Create a new data subject request.
   */
  create: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(createRequestInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const request = await ctx.db.$transaction(async (tx) => {
        const created = await tx.dataSubjectRequest.create({
          data: {
            subjectId: input.subjectId,
            type: input.type,
            receivedDate: input.receivedDate,
            deadline: input.deadline ?? null,
            decision: input.decision ?? null,
            actionTaken: input.actionTaken ?? null,
            status: 'open',
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DATA_REQUEST_CREATED',
            targetType: 'DataSubjectRequest',
            targetId: created.id,
            afterVal: { subjectId: input.subjectId, type: input.type },
          },
        })

        return created
      })

      return request
    }),

  /**
   * Assign a data subject request to a user.
   */
  assign: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({
      id: z.string(),
      assignedTo: z.string().min(1, 'Người được giao không được để trống'),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.dataSubjectRequest.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Yêu cầu chủ thể dữ liệu không tồn tại' })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.dataSubjectRequest.update({
          where: { id: input.id },
          data: {
            assignedTo: input.assignedTo,
            status: 'assigned',
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DATA_REQUEST_ASSIGNED',
            targetType: 'DataSubjectRequest',
            targetId: input.id,
            beforeVal: { assignedTo: existing.assignedTo, status: existing.status },
            afterVal: { assignedTo: input.assignedTo, status: 'assigned' },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Update the status of a data subject request.
   */
  updateStatus: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({
      id: z.string(),
      status: requestStatusEnum,
      decision: z.string().optional().nullable(),
      actionTaken: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.dataSubjectRequest.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Yêu cầu chủ thể dữ liệu không tồn tại' })
      }

      if (existing.status === 'resolved') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Không thể thay đổi trạng thái yêu cầu đã giải quyết',
        })
      }

      const updatePayload: Record<string, unknown> = { status: input.status }
      if (input.decision !== undefined) updatePayload.decision = input.decision
      if (input.actionTaken !== undefined) updatePayload.actionTaken = input.actionTaken

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.dataSubjectRequest.update({
          where: { id: input.id },
          data: updatePayload,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DATA_REQUEST_STATUS_UPDATED',
            targetType: 'DataSubjectRequest',
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
   * Resolve a data subject request — sets status to 'resolved' and closedDate to now.
   */
  resolve: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({
      id: z.string(),
      decision: z.string().min(1, 'Quyết định xử lý không được để trống'),
      actionTaken: z.string().min(1, 'Hành động đã thực hiện không được để trống'),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.dataSubjectRequest.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Yêu cầu chủ thể dữ liệu không tồn tại' })
      }

      if (existing.status === 'resolved') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Yêu cầu đã được giải quyết trước đó',
        })
      }

      const now = new Date()

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.dataSubjectRequest.update({
          where: { id: input.id },
          data: {
            status: 'resolved',
            decision: input.decision,
            actionTaken: input.actionTaken,
            closedDate: now,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DATA_REQUEST_RESOLVED',
            targetType: 'DataSubjectRequest',
            targetId: input.id,
            beforeVal: { status: existing.status },
            afterVal: { status: 'resolved', closedDate: now.toISOString(), decision: input.decision },
          },
        })

        return result
      })

      return updated
    }),
})
