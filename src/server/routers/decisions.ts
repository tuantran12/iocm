import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { GroupMemberStatus, GroupRole } from '@prisma/client'
import { router, protectedProcedure } from '../trpc'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const decisionStatusEnum = z.enum(['proposed', 'approved', 'rejected'])

const listDecisionsInput = z.object({
  groupId: z.string().min(1, 'groupId is required'),
  status: decisionStatusEnum.optional(),
  page: z.number().int().min(0).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
})

const getDecisionInput = z.object({
  id: z.string().min(1, 'id is required'),
})

const createDecisionInput = z.object({
  groupId: z.string().min(1, 'groupId is required'),
  title: z.string().min(1, 'Tiêu đề không được để trống'),
  description: z.string().optional().nullable(),
})

const approveDecisionInput = z.object({
  id: z.string().min(1, 'id is required'),
})

const rejectDecisionInput = z.object({
  id: z.string().min(1, 'id is required'),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function isGroupMember(
  db: any,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const membership = await db.groupMembership.findFirst({
    where: { groupId, userId, status: GroupMemberStatus.ACTIVE },
  })
  return !!membership
}

async function isGroupOwnerOrModerator(
  db: any,
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

// ─── Decisions Router ─────────────────────────────────────────────────────────

export const decisionsRouter = router({
  /**
   * List decisions for a group with optional status filter and pagination.
   * User must be an active member of the group.
   */
  list: protectedProcedure
    .input(listDecisionsInput)
    .query(async ({ input, ctx }) => {
      const { groupId, status, page = 0, pageSize = 25 } = input
      const userId = ctx.session.user.id

      const isMember = await isGroupMember(ctx.db, groupId, userId)
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không phải thành viên của nhóm này',
        })
      }

      const where: Record<string, unknown> = { groupId }
      if (status) where.status = status

      const [items, total] = await Promise.all([
        ctx.db.groupDecision.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: page * pageSize,
          take: pageSize,
        }),
        ctx.db.groupDecision.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get a single decision by ID.
   * User must be an active member of the decision's group.
   */
  get: protectedProcedure
    .input(getDecisionInput)
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const decision = await ctx.db.groupDecision.findUnique({
        where: { id: input.id },
        include: { group: { select: { id: true, name: true, type: true } } },
      })

      if (!decision) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Quyết định không tồn tại',
        })
      }

      const isMember = await isGroupMember(ctx.db, decision.groupId, userId)
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn không phải thành viên của nhóm này',
        })
      }

      return decision
    }),

  /**
   * Propose a new decision within a group.
   * Any active group member can propose a decision.
   * Status starts as "proposed".
   */
  create: protectedProcedure
    .input(createDecisionInput)
    .mutation(async ({ input, ctx }) => {
      const { groupId, title, description } = input
      const userId = ctx.session.user.id

      const isMember = await isGroupMember(ctx.db, groupId, userId)
      if (!isMember) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Bạn phải là thành viên nhóm để đề xuất quyết định',
        })
      }

      const decision = await ctx.db.$transaction(async (tx: any) => {
        const created = await tx.groupDecision.create({
          data: {
            groupId,
            title,
            description: description ?? null,
            proposedBy: userId,
            status: 'proposed',
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DECISION_PROPOSED',
            targetType: 'GroupDecision',
            targetId: created.id,
            afterVal: { title, groupId, status: 'proposed' },
          },
        })

        return created
      })

      return decision
    }),

  /**
   * Approve a decision. Only group owner or moderator can approve.
   * Decision must be in "proposed" status.
   */
  approve: protectedProcedure
    .input(approveDecisionInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const decision = await ctx.db.groupDecision.findUnique({
        where: { id: input.id },
      })

      if (!decision) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Quyết định không tồn tại',
        })
      }

      if (decision.status !== 'proposed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Không thể phê duyệt quyết định ở trạng thái "${decision.status}"`,
        })
      }

      const hasPermission = await isGroupOwnerOrModerator(ctx.db, decision.groupId, userId)
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Chỉ chủ nhóm hoặc moderator mới có thể phê duyệt quyết định',
        })
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.groupDecision.update({
          where: { id: input.id },
          data: {
            status: 'approved',
            approvedBy: userId,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DECISION_APPROVED',
            targetType: 'GroupDecision',
            targetId: input.id,
            beforeVal: { status: 'proposed' },
            afterVal: { status: 'approved', approvedBy: userId },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Reject a decision. Only group owner or moderator can reject.
   * Decision must be in "proposed" status.
   */
  reject: protectedProcedure
    .input(rejectDecisionInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const decision = await ctx.db.groupDecision.findUnique({
        where: { id: input.id },
      })

      if (!decision) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Quyết định không tồn tại',
        })
      }

      if (decision.status !== 'proposed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Không thể từ chối quyết định ở trạng thái "${decision.status}"`,
        })
      }

      const hasPermission = await isGroupOwnerOrModerator(ctx.db, decision.groupId, userId)
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Chỉ chủ nhóm hoặc moderator mới có thể từ chối quyết định',
        })
      }

      const updated = await ctx.db.$transaction(async (tx: any) => {
        const result = await tx.groupDecision.update({
          where: { id: input.id },
          data: {
            status: 'rejected',
            approvedBy: userId, // Track who rejected
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DECISION_REJECTED',
            targetType: 'GroupDecision',
            targetId: input.id,
            beforeVal: { status: 'proposed' },
            afterVal: { status: 'rejected', rejectedBy: userId },
          },
        })

        return result
      })

      return updated
    }),
})
