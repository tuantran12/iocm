import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createSponsorshipInput = z.object({
  enterpriseId: z.string().optional().nullable(),
  sponsorName: z.string().min(1, 'Tên nhà tài trợ không được để trống'),
  type: z.string().min(1, 'Loại tài trợ không được để trống'),
  amount: z.number().positive('Số tiền phải lớn hơn 0').optional().nullable(),
  currency: z.string().default('VND'),
  purpose: z.string().optional().nullable(),
  restricted: z.boolean().default(false),
  projectId: z.string().optional().nullable(),
  agreementId: z.string().optional().nullable(),
  reportingDue: z.string().datetime().optional().nullable(),
  status: z.string().default('committed'),
})

const updateSponsorshipInput = z.object({
  id: z.string().min(1, 'ID tài trợ không được để trống'),
  enterpriseId: z.string().optional().nullable(),
  sponsorName: z.string().min(1, 'Tên nhà tài trợ không được để trống').optional(),
  type: z.string().min(1, 'Loại tài trợ không được để trống').optional(),
  amount: z.number().positive('Số tiền phải lớn hơn 0').optional().nullable(),
  currency: z.string().optional(),
  purpose: z.string().optional().nullable(),
  restricted: z.boolean().optional(),
  projectId: z.string().optional().nullable(),
  agreementId: z.string().optional().nullable(),
  reportingDue: z.string().datetime().optional().nullable(),
  status: z.string().optional(),
})

// ─── Finance Router ───────────────────────────────────────────────────────────

export const financeRouter = router({
  /**
   * Finance dashboard aggregation.
   * Returns: totalFeesCollected, totalFeesOverdue, totalSponsorships,
   *          feesByStatus, recentPayments.
   * Roles: Finance_Officer, Director, System_Admin
   */
  dashboard: roleProtectedProcedure(['Finance_Officer', 'Director', 'System_Admin'])
    .query(async ({ ctx }) => {
      const [
        feesCollectedResult,
        feesOverdueResult,
        sponsorshipsResult,
        feesByStatus,
        recentPayments,
      ] = await Promise.all([
        // Sum of PAID fees
        ctx.db.membershipFee.aggregate({
          where: { paymentStatus: 'PAID' },
          _sum: { amountPaid: true },
        }),
        // Sum of OVERDUE fees
        ctx.db.membershipFee.aggregate({
          where: { paymentStatus: 'OVERDUE' },
          _sum: { amountDue: true },
        }),
        // Sum of active sponsorships
        ctx.db.sponsorshipRecord.aggregate({
          where: { status: 'committed' },
          _sum: { amount: true },
        }),
        // Count per payment status
        ctx.db.membershipFee.groupBy({
          by: ['paymentStatus'],
          _count: { id: true },
        }),
        // Last 10 paid fees
        ctx.db.membershipFee.findMany({
          where: { paymentStatus: 'PAID' },
          orderBy: { paymentDate: 'desc' },
          take: 10,
          include: {
            enterprise: {
              select: { id: true, legalNameVi: true, legalNameEn: true },
            },
          },
        }),
      ])

      return {
        totalFeesCollected: feesCollectedResult._sum.amountPaid ?? 0,
        totalFeesOverdue: feesOverdueResult._sum.amountDue ?? 0,
        totalSponsorships: sponsorshipsResult._sum.amount ?? 0,
        feesByStatus: feesByStatus.map((item) => ({
          status: item.paymentStatus,
          count: item._count.id,
        })),
        recentPayments,
      }
    }),

  // ─── Sponsorship CRUD ─────────────────────────────────────────────────────

  /**
   * List sponsorships with optional status filter.
   * Roles: Finance_Officer, Director, System_Admin
   */
  sponsorshipsList: roleProtectedProcedure(['Finance_Officer', 'Director', 'System_Admin'])
    .input(z.object({
      status: z.string().optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const { status, search, page = 0, pageSize = 25 } = input ?? {}

      const where: Record<string, unknown> = {}
      if (status) where.status = status
      if (search) {
        where.OR = [
          { sponsorName: { contains: search, mode: 'insensitive' } },
          { purpose: { contains: search, mode: 'insensitive' } },
        ]
      }

      const [items, total] = await Promise.all([
        ctx.db.sponsorshipRecord.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: page * pageSize,
          take: pageSize,
          include: {
            enterprise: {
              select: { id: true, legalNameVi: true, legalNameEn: true },
            },
          },
        }),
        ctx.db.sponsorshipRecord.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single sponsorship by ID.
   * Roles: Finance_Officer, Director, System_Admin
   */
  sponsorshipsGet: roleProtectedProcedure(['Finance_Officer', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string().min(1, 'ID tài trợ không được để trống') }))
    .query(async ({ input, ctx }) => {
      const record = await ctx.db.sponsorshipRecord.findUnique({
        where: { id: input.id },
        include: {
          enterprise: {
            select: { id: true, legalNameVi: true, legalNameEn: true, taxCode: true },
          },
        },
      })
      if (!record) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi tài trợ không tồn tại' })
      }
      return record
    }),

  /**
   * Create sponsorship record.
   * Roles: Finance_Officer, Director, System_Admin
   */
  sponsorshipsCreate: roleProtectedProcedure(['Finance_Officer', 'Director', 'System_Admin'])
    .input(createSponsorshipInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Validate enterprise if provided
      if (input.enterpriseId) {
        const enterprise = await ctx.db.enterpriseMember.findUnique({
          where: { id: input.enterpriseId },
        })
        if (!enterprise) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp hội viên không tồn tại' })
        }
      }

      const record = await ctx.db.$transaction(async (tx) => {
        const created = await tx.sponsorshipRecord.create({
          data: {
            enterpriseId: input.enterpriseId ?? null,
            sponsorName: input.sponsorName,
            type: input.type,
            amount: input.amount ?? null,
            currency: input.currency,
            purpose: input.purpose ?? null,
            restricted: input.restricted,
            projectId: input.projectId ?? null,
            agreementId: input.agreementId ?? null,
            reportingDue: input.reportingDue ? new Date(input.reportingDue) : null,
            status: input.status,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'SPONSORSHIP_CREATED',
            targetType: 'SponsorshipRecord',
            targetId: created.id,
            afterVal: {
              sponsorName: input.sponsorName,
              type: input.type,
              amount: input.amount?.toString() ?? null,
              purpose: input.purpose ?? null,
            },
          },
        })

        return created
      })

      return record
    }),

  /**
   * Update sponsorship record.
   * Roles: Finance_Officer, Director, System_Admin
   */
  sponsorshipsUpdate: roleProtectedProcedure(['Finance_Officer', 'Director', 'System_Admin'])
    .input(updateSponsorshipInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const { id, ...data } = input

      const existing = await ctx.db.sponsorshipRecord.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi tài trợ không tồn tại' })
      }

      // Validate enterprise if being changed
      if (data.enterpriseId) {
        const enterprise = await ctx.db.enterpriseMember.findUnique({
          where: { id: data.enterpriseId },
        })
        if (!enterprise) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp hội viên không tồn tại' })
        }
      }

      const updateData: Record<string, unknown> = {}
      if (data.enterpriseId !== undefined) updateData.enterpriseId = data.enterpriseId
      if (data.sponsorName !== undefined) updateData.sponsorName = data.sponsorName
      if (data.type !== undefined) updateData.type = data.type
      if (data.amount !== undefined) updateData.amount = data.amount
      if (data.currency !== undefined) updateData.currency = data.currency
      if (data.purpose !== undefined) updateData.purpose = data.purpose
      if (data.restricted !== undefined) updateData.restricted = data.restricted
      if (data.projectId !== undefined) updateData.projectId = data.projectId
      if (data.agreementId !== undefined) updateData.agreementId = data.agreementId
      if (data.reportingDue !== undefined) {
        updateData.reportingDue = data.reportingDue ? new Date(data.reportingDue) : null
      }
      if (data.status !== undefined) updateData.status = data.status

      const record = await ctx.db.$transaction(async (tx) => {
        const updated = await tx.sponsorshipRecord.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'SPONSORSHIP_UPDATED',
            targetType: 'SponsorshipRecord',
            targetId: id,
            beforeVal: {
              sponsorName: existing.sponsorName,
              type: existing.type,
              amount: existing.amount?.toString() ?? null,
              status: existing.status,
            },
            afterVal: {
              sponsorName: updated.sponsorName,
              type: updated.type,
              amount: updated.amount?.toString() ?? null,
              status: updated.status,
            },
          },
        })

        return updated
      })

      return record
    }),

  /**
   * Delete sponsorship record.
   * Roles: Finance_Officer, Director, System_Admin
   */
  sponsorshipsDelete: roleProtectedProcedure(['Finance_Officer', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string().min(1, 'ID tài trợ không được để trống') }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.sponsorshipRecord.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi tài trợ không tồn tại' })
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.sponsorshipRecord.delete({ where: { id: input.id } })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'SPONSORSHIP_DELETED',
            targetType: 'SponsorshipRecord',
            targetId: input.id,
            beforeVal: {
              sponsorName: existing.sponsorName,
              type: existing.type,
              amount: existing.amount?.toString() ?? null,
              purpose: existing.purpose ?? null,
              status: existing.status,
            },
          },
        })
      })

      return { success: true }
    }),
})
