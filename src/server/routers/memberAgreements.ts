import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'
import { runAgreementExpiryCheck, getExpiringAgreements } from '../services/agreement-expiry'

// ─── Valid Status Transitions ─────────────────────────────────────────────────

/**
 * Membership agreement lifecycle: draft → signed → active → expired
 * Only valid forward transitions are allowed.
 * Director can approve exception: signed not required before active.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['signed'],
  signed: ['active'],
  active: ['expired'],
}

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const agreementStatusEnum = z.enum(['draft', 'signed', 'active', 'expired'])

const createAgreementInput = z.object({
  enterpriseId: z.string().min(1, 'ID doanh nghiệp không được để trống'),
  tierId: z.string().min(1, 'ID cấp hội viên không được để trống'),
  effectiveDate: z.string().datetime().or(z.date()),
  expiryDate: z.string().datetime().or(z.date()).optional(),
  annualFee: z.number().positive('Phí thường niên phải lớn hơn 0'),
})

const updateStatusInput = z.object({
  id: z.string().min(1, 'ID thỏa thuận không được để trống'),
  status: agreementStatusEnum,
  directorException: z.boolean().optional(),
  changeNote: z.string().optional(),
})

const uploadSignedFileInput = z.object({
  id: z.string().min(1, 'ID thỏa thuận không được để trống'),
  signedFileUrl: z.string().url('URL file ký không hợp lệ'),
})

// ─── Member Agreements Router ─────────────────────────────────────────────────

export const memberAgreementsRouter = router({
  /**
   * List agreements for a specific enterprise member, with pagination.
   * Roles: Legal_Officer, Membership_Manager, Director, System_Admin
   */
  list: roleProtectedProcedure(['Legal_Officer', 'Membership_Manager', 'Director', 'System_Admin'])
    .input(z.object({
      enterpriseId: z.string().optional(),
      status: agreementStatusEnum.optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const {
        enterpriseId,
        status,
        page = 0,
        pageSize = 25,
      } = input ?? {}

      const where: Record<string, unknown> = {}
      if (enterpriseId) where.enterpriseId = enterpriseId
      if (status) where.status = status

      const [items, total] = await Promise.all([
        ctx.db.membershipAgreement.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: page * pageSize,
          take: pageSize,
          include: {
            enterprise: {
              select: { id: true, legalNameVi: true, legalNameEn: true, taxCode: true },
            },
            tier: {
              select: { id: true, name: true },
            },
          },
        }),
        ctx.db.membershipAgreement.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single agreement by ID, including version history.
   * Roles: Legal_Officer, Membership_Manager, Director, System_Admin
   */
  get: roleProtectedProcedure(['Legal_Officer', 'Membership_Manager', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const agreement = await ctx.db.membershipAgreement.findUnique({
        where: { id: input.id },
        include: {
          enterprise: {
            select: {
              id: true,
              legalNameVi: true,
              legalNameEn: true,
              taxCode: true,
              contactEmail: true,
            },
          },
          tier: { select: { id: true, name: true, annualFee: true } },
          versions: {
            orderBy: { version: 'desc' },
          },
        },
      })
      if (!agreement) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Thỏa thuận hội viên không tồn tại' })
      }
      return agreement
    }),

  /**
   * Create a new draft membership agreement.
   * Roles: Legal_Officer, Membership_Manager, Director, System_Admin
   */
  create: roleProtectedProcedure(['Legal_Officer', 'Membership_Manager', 'Director', 'System_Admin'])
    .input(createAgreementInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Validate enterprise exists
      const enterprise = await ctx.db.enterpriseMember.findUnique({
        where: { id: input.enterpriseId },
      })
      if (!enterprise) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Doanh nghiệp hội viên không tồn tại' })
      }

      // Validate tier exists
      const tier = await ctx.db.membershipTier.findUnique({
        where: { id: input.tierId },
      })
      if (!tier) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Cấp hội viên không tồn tại' })
      }

      const agreement = await ctx.db.$transaction(async (tx) => {
        const created = await tx.membershipAgreement.create({
          data: {
            enterpriseId: input.enterpriseId,
            tierId: input.tierId,
            effectiveDate: new Date(input.effectiveDate),
            expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
            annualFee: input.annualFee,
            status: 'draft',
          },
        })

        // Create initial version record
        await tx.membershipAgreementVersion.create({
          data: {
            agreementId: created.id,
            version: 1,
            status: 'draft',
            changedBy: userId,
            changeNote: 'Tạo thỏa thuận mới',
          },
        })

        // Audit log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'AGREEMENT_CREATED',
            targetType: 'MembershipAgreement',
            targetId: created.id,
            afterVal: {
              enterpriseId: input.enterpriseId,
              tierId: input.tierId,
              annualFee: input.annualFee,
              status: 'draft',
            },
          },
        })

        return created
      })

      return agreement
    }),

  /**
   * Transition agreement status (draft → signed → active → expired).
   * Validates transition rules:
   * - Only valid forward transitions allowed
   * - Signed file required before activating (unless Director exception)
   * Roles: Legal_Officer, Membership_Manager, Director, System_Admin
   */
  updateStatus: roleProtectedProcedure(['Legal_Officer', 'Membership_Manager', 'Director', 'System_Admin'])
    .input(updateStatusInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const agreement = await ctx.db.membershipAgreement.findUnique({
        where: { id: input.id },
      })
      if (!agreement) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Thỏa thuận hội viên không tồn tại' })
      }

      const currentStatus = agreement.status
      const newStatus = input.status

      // Validate transition
      if (!isValidTransition(currentStatus, newStatus)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Không thể chuyển trạng thái từ "${currentStatus}" sang "${newStatus}". Chỉ cho phép: ${VALID_TRANSITIONS[currentStatus]?.join(', ') ?? 'không có'}`,
        })
      }

      // Require signed file before activating (unless Director approves exception)
      if (newStatus === 'active' && !agreement.signedFileUrl && !input.directorException) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cần có file thỏa thuận đã ký trước khi kích hoạt. Giám đốc có thể phê duyệt ngoại lệ.',
        })
      }

      // If Director exception is used, verify user has Director role
      if (input.directorException) {
        const userRoles = ctx.session.roles ?? []
        if (!userRoles.includes('Director') && !userRoles.includes('System_Admin')) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Chỉ Giám đốc mới có thể phê duyệt ngoại lệ kích hoạt không cần file ký.',
          })
        }
      }

      // Get current version count for new version number
      const versionCount = await ctx.db.membershipAgreementVersion.count({
        where: { agreementId: input.id },
      })

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.membershipAgreement.update({
          where: { id: input.id },
          data: { status: newStatus },
        })

        // Create version record for the status change
        await tx.membershipAgreementVersion.create({
          data: {
            agreementId: input.id,
            version: versionCount + 1,
            status: newStatus,
            changedBy: userId,
            changeNote: input.changeNote ?? `Chuyển trạng thái: ${currentStatus} → ${newStatus}${input.directorException ? ' (ngoại lệ Giám đốc)' : ''}`,
          },
        })

        // Audit log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'AGREEMENT_STATUS_CHANGED',
            targetType: 'MembershipAgreement',
            targetId: input.id,
            beforeVal: { status: currentStatus },
            afterVal: {
              status: newStatus,
              directorException: input.directorException ?? false,
              changeNote: input.changeNote ?? null,
            },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Upload signed agreement file URL.
   * Roles: Legal_Officer, Membership_Manager, Director, System_Admin
   */
  upload: roleProtectedProcedure(['Legal_Officer', 'Membership_Manager', 'Director', 'System_Admin'])
    .input(uploadSignedFileInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const agreement = await ctx.db.membershipAgreement.findUnique({
        where: { id: input.id },
      })
      if (!agreement) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Thỏa thuận hội viên không tồn tại' })
      }

      // Can only upload file for draft or signed agreements
      if (!['draft', 'signed'].includes(agreement.status)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Không thể tải file cho thỏa thuận có trạng thái "${agreement.status}"`,
        })
      }

      // Get current version count
      const versionCount = await ctx.db.membershipAgreementVersion.count({
        where: { agreementId: input.id },
      })

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.membershipAgreement.update({
          where: { id: input.id },
          data: { signedFileUrl: input.signedFileUrl },
        })

        // Create version record for file upload
        await tx.membershipAgreementVersion.create({
          data: {
            agreementId: input.id,
            version: versionCount + 1,
            status: agreement.status,
            changedBy: userId,
            changeNote: 'Tải lên file thỏa thuận đã ký',
            fileUrl: input.signedFileUrl,
          },
        })

        // Audit log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'AGREEMENT_FILE_UPLOADED',
            targetType: 'MembershipAgreement',
            targetId: input.id,
            beforeVal: { signedFileUrl: agreement.signedFileUrl },
            afterVal: { signedFileUrl: input.signedFileUrl },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Check for expiring/expired agreements and create alerts.
   * Roles: Legal_Officer, Director, System_Admin
   */
  checkExpiry: roleProtectedProcedure(['Legal_Officer', 'Director', 'System_Admin'])
    .mutation(async ({ ctx }) => {
      const result = await runAgreementExpiryCheck(ctx.db)

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'AGREEMENT_EXPIRY_CHECK',
          targetType: 'MembershipAgreement',
          targetId: 'bulk',
          afterVal: {
            updatedToExpired: result.updatedToExpired,
            notificationsCreated: result.notificationsCreated,
            alertCount: result.alerts.length,
          },
        },
      })

      return result
    }),

  /**
   * List agreements expiring within N days.
   * Roles: Legal_Officer, Membership_Manager, Director, System_Admin
   */
  listExpiring: roleProtectedProcedure(['Legal_Officer', 'Membership_Manager', 'Director', 'System_Admin'])
    .input(z.object({
      withinDays: z.number().int().min(1).max(365).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const withinDays = input?.withinDays ?? 60
      return getExpiringAgreements(ctx.db, withinDays)
    }),
})
