import { z } from 'zod'
import { PaymentStatus } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'
import { runOverdueCheck, getOverdueFees } from '../services/fee-overdue'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const paymentStatusEnum = z.nativeEnum(PaymentStatus)

const recordPaymentInput = z.object({
  feeId: z.string().min(1, 'ID phí không được để trống'),
  amount: z.number().positive('Số tiền phải lớn hơn 0'),
  paymentDate: z.string().datetime().or(z.date()),
  paymentMethod: z.string().min(1, 'Phương thức thanh toán không được để trống'),
  paymentProof: z.string().optional(),
})

const requestWaiverInput = z.object({
  feeId: z.string().min(1, 'ID phí không được để trống'),
  reason: z.string().min(1, 'Lý do miễn giảm không được để trống'),
})

const approveWaiverInput = z.object({
  feeId: z.string().min(1, 'ID phí không được để trống'),
  approved: z.boolean(),
  comment: z.string().optional(),
})

// ─── Fees Router ──────────────────────────────────────────────────────────────

export const feesRouter = router({
  /**
   * List fee records with filtering (by year, member, status) and pagination.
   * Roles: Finance_Officer, Membership_Manager, Director, System_Admin
   */
  list: roleProtectedProcedure(['Finance_Officer', 'Membership_Manager', 'Director', 'System_Admin'])
    .input(z.object({
      year: z.number().int().optional(),
      enterpriseId: z.string().optional(),
      status: paymentStatusEnum.optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      sortField: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const {
        year,
        enterpriseId,
        status,
        search,
        page = 0,
        pageSize = 25,
        sortField = 'year',
        sortDirection = 'desc',
      } = input ?? {}

      const where: Record<string, unknown> = {}

      if (year) where.year = year
      if (enterpriseId) where.enterpriseId = enterpriseId
      if (status) where.paymentStatus = status

      if (search) {
        where.OR = [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { enterprise: { legalNameVi: { contains: search, mode: 'insensitive' } } },
          { enterprise: { legalNameEn: { contains: search, mode: 'insensitive' } } },
        ]
      }

      const allowedSortFields = ['year', 'amountDue', 'amountPaid', 'dueDate', 'paymentDate', 'paymentStatus']
      const orderBy: Record<string, string> = {}
      if (sortField && allowedSortFields.includes(sortField)) {
        orderBy[sortField] = sortDirection ?? 'desc'
      } else {
        orderBy.year = 'desc'
      }

      const [items, total] = await Promise.all([
        ctx.db.membershipFee.findMany({
          where,
          orderBy,
          skip: page * pageSize,
          take: pageSize,
          include: {
            enterprise: {
              select: { id: true, legalNameVi: true, legalNameEn: true, taxCode: true },
            },
          },
        }),
        ctx.db.membershipFee.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single fee record by ID.
   * Roles: Finance_Officer, Membership_Manager, Director, System_Admin
   */
  get: roleProtectedProcedure(['Finance_Officer', 'Membership_Manager', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const fee = await ctx.db.membershipFee.findUnique({
        where: { id: input.id },
        include: {
          enterprise: {
            select: {
              id: true,
              legalNameVi: true,
              legalNameEn: true,
              taxCode: true,
              contactEmail: true,
              tier: { select: { id: true, name: true, annualFee: true } },
            },
          },
        },
      })
      if (!fee) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi phí không tồn tại' })
      }
      return fee
    }),

  /**
   * Generate annual fee for a single member based on their tier.
   * Roles: Finance_Officer, Director, System_Admin
   */
  generate: roleProtectedProcedure(['Finance_Officer', 'Director', 'System_Admin'])
    .input(z.object({
      enterpriseId: z.string().min(1, 'ID doanh nghiệp không được để trống'),
      year: z.number().int().min(2020).max(2100),
      dueDate: z.string().datetime().or(z.date()),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Validate enterprise exists and get tier
      const enterprise = await ctx.db.enterpriseMember.findUnique({
        where: { id: input.enterpriseId },
        include: { tier: { select: { id: true, name: true, annualFee: true } } },
      })
      if (!enterprise) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp hội viên không tồn tại' })
      }

      // Check if fee already exists for this enterprise + year
      const existing = await ctx.db.membershipFee.findFirst({
        where: { enterpriseId: input.enterpriseId, year: input.year },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Phí thường niên năm ${input.year} đã được tạo cho doanh nghiệp này`,
        })
      }

      const fee = await ctx.db.$transaction(async (tx) => {
        const created = await tx.membershipFee.create({
          data: {
            enterpriseId: input.enterpriseId,
            year: input.year,
            amountDue: enterprise.tier.annualFee,
            amountPaid: 0,
            dueDate: new Date(input.dueDate),
            paymentStatus: PaymentStatus.NOT_INVOICED,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'FEE_GENERATED',
            targetType: 'MembershipFee',
            targetId: created.id,
            afterVal: {
              enterpriseId: input.enterpriseId,
              year: input.year,
              amountDue: enterprise.tier.annualFee.toString(),
              tierName: enterprise.tier.name,
            },
          },
        })

        return created
      })

      return fee
    }),

  /**
   * Generate fees for all active members for a given year.
   * Roles: Finance_Officer, Director, System_Admin
   */
  generateBulk: roleProtectedProcedure(['Finance_Officer', 'Director', 'System_Admin'])
    .input(z.object({
      year: z.number().int().min(2020).max(2100),
      dueDate: z.string().datetime().or(z.date()),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Get all active members with their tiers
      const activeMembers = await ctx.db.enterpriseMember.findMany({
        where: { membershipStatus: 'ACTIVE' },
        include: { tier: { select: { id: true, name: true, annualFee: true } } },
      })

      // Find which members already have fees for this year
      const existingFees = await ctx.db.membershipFee.findMany({
        where: {
          year: input.year,
          enterpriseId: { in: activeMembers.map((m) => m.id) },
        },
        select: { enterpriseId: true },
      })
      const existingEnterpriseIds = new Set(existingFees.map((f) => f.enterpriseId))

      // Filter to only members without existing fees
      const membersToGenerate = activeMembers.filter((m) => !existingEnterpriseIds.has(m.id))

      if (membersToGenerate.length === 0) {
        return { generated: 0, skipped: existingFees.length, total: activeMembers.length }
      }

      const fees = await ctx.db.$transaction(async (tx) => {
        const created = await Promise.all(
          membersToGenerate.map((member) =>
            tx.membershipFee.create({
              data: {
                enterpriseId: member.id,
                year: input.year,
                amountDue: member.tier.annualFee,
                amountPaid: 0,
                dueDate: new Date(input.dueDate),
                paymentStatus: PaymentStatus.NOT_INVOICED,
              },
            })
          )
        )

        await tx.auditLog.create({
          data: {
            userId,
            action: 'FEES_BULK_GENERATED',
            targetType: 'MembershipFee',
            targetId: 'bulk',
            afterVal: {
              year: input.year,
              generated: created.length,
              skipped: existingFees.length,
            },
          },
        })

        return created
      })

      return {
        generated: fees.length,
        skipped: existingFees.length,
        total: activeMembers.length,
      }
    }),

  /**
   * Record a payment for a fee (amount, date, method, proof).
   * Roles: Finance_Officer, Director, System_Admin
   */
  recordPayment: roleProtectedProcedure(['Finance_Officer', 'Director', 'System_Admin'])
    .input(recordPaymentInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const fee = await ctx.db.membershipFee.findUnique({ where: { id: input.feeId } })
      if (!fee) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi phí không tồn tại' })
      }

      // Cannot record payment for waived/cancelled/refunded fees
      if (['WAIVED', 'CANCELLED', 'REFUNDED'].includes(fee.paymentStatus)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Không thể ghi nhận thanh toán cho phí có trạng thái: ${fee.paymentStatus}`,
        })
      }

      // Calculate new amount paid
      const currentPaid = Number(fee.amountPaid)
      const newPaid = currentPaid + input.amount
      const amountDue = Number(fee.amountDue)

      // Determine new payment status
      let newStatus: PaymentStatus
      if (newPaid >= amountDue) {
        newStatus = PaymentStatus.PAID
      } else {
        newStatus = PaymentStatus.PARTIALLY_PAID
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.membershipFee.update({
          where: { id: input.feeId },
          data: {
            amountPaid: newPaid,
            paymentDate: new Date(input.paymentDate),
            paymentStatus: newStatus,
            paymentProof: input.paymentProof ?? fee.paymentProof,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'FEE_PAYMENT_RECORDED',
            targetType: 'MembershipFee',
            targetId: input.feeId,
            beforeVal: {
              amountPaid: currentPaid,
              paymentStatus: fee.paymentStatus,
            },
            afterVal: {
              amountPaid: newPaid,
              paymentStatus: newStatus,
              paymentMethod: input.paymentMethod,
              paymentProof: input.paymentProof ?? null,
            },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Request fee waiver/discount (requires reason).
   * Roles: Membership_Manager, Finance_Officer
   */
  requestWaiver: roleProtectedProcedure(['Membership_Manager', 'Finance_Officer'])
    .input(requestWaiverInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const fee = await ctx.db.membershipFee.findUnique({ where: { id: input.feeId } })
      if (!fee) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi phí không tồn tại' })
      }

      // Cannot request waiver for already paid/waived/cancelled fees
      if (['PAID', 'WAIVED', 'CANCELLED', 'REFUNDED'].includes(fee.paymentStatus)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Không thể yêu cầu miễn giảm cho phí có trạng thái: ${fee.paymentStatus}`,
        })
      }

      // Already has a pending waiver request
      if (fee.waiverReason && !fee.waiverStatus && !fee.approvedBy) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Đã có yêu cầu miễn giảm đang chờ phê duyệt cho phí này',
        })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.membershipFee.update({
          where: { id: input.feeId },
          data: {
            waiverReason: input.reason,
            waiverStatus: false, // pending approval
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'FEE_WAIVER_REQUESTED',
            targetType: 'MembershipFee',
            targetId: input.feeId,
            afterVal: {
              reason: input.reason,
              enterpriseId: fee.enterpriseId,
              year: fee.year,
            },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Approve or reject fee waiver (Director only).
   * Roles: Director, System_Admin
   */
  approveWaiver: roleProtectedProcedure(['Director', 'System_Admin'])
    .input(approveWaiverInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const fee = await ctx.db.membershipFee.findUnique({ where: { id: input.feeId } })
      if (!fee) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi phí không tồn tại' })
      }

      // Must have a waiver request pending
      if (!fee.waiverReason) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Không có yêu cầu miễn giảm nào cho phí này',
        })
      }

      // Already approved/rejected
      if (fee.approvedBy) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Yêu cầu miễn giảm đã được xử lý trước đó',
        })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const data: Record<string, unknown> = {
          waiverStatus: input.approved,
          approvedBy: userId,
        }

        // If approved, set payment status to WAIVED
        if (input.approved) {
          data.paymentStatus = PaymentStatus.WAIVED
        }

        const result = await tx.membershipFee.update({
          where: { id: input.feeId },
          data,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: input.approved ? 'FEE_WAIVER_APPROVED' : 'FEE_WAIVER_REJECTED',
            targetType: 'MembershipFee',
            targetId: input.feeId,
            beforeVal: {
              waiverReason: fee.waiverReason,
              paymentStatus: fee.paymentStatus,
            },
            afterVal: {
              approved: input.approved,
              comment: input.comment ?? null,
              paymentStatus: input.approved ? PaymentStatus.WAIVED : fee.paymentStatus,
            },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Trigger overdue fee detection manually.
   * Finds all fees past due_date that aren't PAID/WAIVED/CANCELLED/REFUNDED/OVERDUE,
   * marks them OVERDUE, optionally updates member status, creates notifications.
   * Roles: Finance_Officer, Director, System_Admin
   */
  checkOverdue: roleProtectedProcedure(['Finance_Officer', 'Director', 'System_Admin'])
    .input(z.object({
      updateMemberStatus: z.boolean().optional(),
      createNotifications: z.boolean().optional(),
    }).optional())
    .mutation(async ({ input, ctx }) => {
      const result = await runOverdueCheck(ctx.db, {
        updateMemberStatus: input?.updateMemberStatus,
        createNotifications: input?.createNotifications,
      })

      // Audit log for the overdue check run
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'FEE_OVERDUE_CHECK',
          targetType: 'MembershipFee',
          targetId: 'bulk',
          afterVal: {
            feesMarkedOverdue: result.feesMarkedOverdue,
            membersMarkedOverdue: result.membersMarkedOverdue,
            notificationsCreated: result.notificationsCreated,
          },
        },
      })

      return result
    }),

  /**
   * List all currently overdue fees.
   * Roles: Finance_Officer, Membership_Manager, Director, System_Admin
   */
  listOverdue: roleProtectedProcedure(['Finance_Officer', 'Membership_Manager', 'Director', 'System_Admin'])
    .query(async ({ ctx }) => {
      return getOverdueFees(ctx.db)
    }),
})
