import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, roleProtectedProcedure } from '../trpc'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

// Prisma Json fields accept any valid JSON value
const jsonValue = z.record(z.unknown())

const createTierInput = z.object({
  name: z.string().min(1, 'Tên cấp hội viên không được để trống'),
  description: z.string().optional().nullable(),
  annualFee: z.union([z.string(), z.number()]).transform((v) => String(v)),
  benefits: jsonValue,
  accessRights: jsonValue,
  votingRight: z.boolean().default(false),
  projectRight: z.boolean().default(false),
  maxUsers: z.number().int().min(1).default(3),
})

const updateTierInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  annualFee: z.union([z.string(), z.number()]).transform((v) => String(v)).optional(),
  benefits: jsonValue.optional(),
  accessRights: jsonValue.optional(),
  votingRight: z.boolean().optional(),
  projectRight: z.boolean().optional(),
  maxUsers: z.number().int().min(1).optional(),
})

// ─── Tiers Router ─────────────────────────────────────────────────────────────

export const tiersRouter = router({
  /**
   * List all membership tiers.
   * Any authenticated user can view tiers (needed for application forms, etc.)
   */
  list: protectedProcedure
    .query(async ({ ctx }) => {
      const tiers = await ctx.db.membershipTier.findMany({
        orderBy: { annualFee: 'asc' },
        include: {
          _count: { select: { members: true } },
        },
      })
      return tiers
    }),

  /**
   * Get single tier by ID.
   * Any authenticated user can view tier details.
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tier = await ctx.db.membershipTier.findUnique({
        where: { id: input.id },
        include: {
          _count: { select: { members: true } },
        },
      })
      if (!tier) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Cấp hội viên không tồn tại' })
      }
      return tier
    }),

  /**
   * Create new membership tier.
   * Roles: Director, System_Admin only.
   */
  create: roleProtectedProcedure(['Director', 'System_Admin'])
    .input(createTierInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Check unique name
      const existing = await ctx.db.membershipTier.findUnique({
        where: { name: input.name },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Cấp hội viên "${input.name}" đã tồn tại`,
        })
      }

      const tier = await ctx.db.$transaction(async (tx) => {
        const created = await tx.membershipTier.create({
          data: {
            name: input.name,
            description: input.description ?? null,
            annualFee: input.annualFee,
            benefits: input.benefits as Prisma.InputJsonValue,
            accessRights: input.accessRights as Prisma.InputJsonValue,
            votingRight: input.votingRight,
            projectRight: input.projectRight,
            maxUsers: input.maxUsers,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'TIER_CREATED',
            targetType: 'MembershipTier',
            targetId: created.id,
            afterVal: { name: input.name, annualFee: input.annualFee },
          },
        })

        return created
      })

      return tier
    }),

  /**
   * Update membership tier fields.
   * Roles: Director, System_Admin only.
   */
  update: roleProtectedProcedure(['Director', 'System_Admin'])
    .input(updateTierInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.membershipTier.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Cấp hội viên không tồn tại' })
      }

      // Check unique name if changing
      if (updateData.name && updateData.name !== existing.name) {
        const duplicate = await ctx.db.membershipTier.findUnique({
          where: { name: updateData.name },
        })
        if (duplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Cấp hội viên "${updateData.name}" đã tồn tại`,
          })
        }
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.membershipTier.update({
          where: { id },
          data: {
            ...(updateData.name !== undefined && { name: updateData.name }),
            ...(updateData.description !== undefined && { description: updateData.description }),
            ...(updateData.annualFee !== undefined && { annualFee: updateData.annualFee }),
            ...(updateData.benefits !== undefined && { benefits: updateData.benefits as Prisma.InputJsonValue }),
            ...(updateData.accessRights !== undefined && { accessRights: updateData.accessRights as Prisma.InputJsonValue }),
            ...(updateData.votingRight !== undefined && { votingRight: updateData.votingRight }),
            ...(updateData.projectRight !== undefined && { projectRight: updateData.projectRight }),
            ...(updateData.maxUsers !== undefined && { maxUsers: updateData.maxUsers }),
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'TIER_UPDATED',
            targetType: 'MembershipTier',
            targetId: id,
            beforeVal: { name: existing.name, annualFee: String(existing.annualFee) },
            afterVal: updateData as unknown as Prisma.InputJsonValue,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Delete membership tier.
   * Only allowed if no members are assigned to this tier.
   * Roles: Director, System_Admin only.
   */
  delete: roleProtectedProcedure(['Director', 'System_Admin'])
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const tier = await ctx.db.membershipTier.findUnique({
        where: { id: input.id },
        include: { _count: { select: { members: true } } },
      })
      if (!tier) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Cấp hội viên không tồn tại' })
      }

      if (tier._count.members > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Không thể xóa cấp hội viên "${tier.name}" vì còn ${tier._count.members} doanh nghiệp đang sử dụng`,
        })
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.membershipTier.delete({ where: { id: input.id } })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'TIER_DELETED',
            targetType: 'MembershipTier',
            targetId: input.id,
            beforeVal: { name: tier.name, annualFee: String(tier.annualFee) },
          },
        })
      })

      return { success: true, deletedId: input.id }
    }),
})
