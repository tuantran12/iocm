import { z } from 'zod'
import { AgreementType, AgreementStatus } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'
import { validateAgreementTransition } from '../services/agreement-lifecycle'
import { runAgreementRecordExpiryCheck } from '../services/agreement-record-expiry'
import {
  obligationSchema,
  obligationsArraySchema,
  updateObligationStatus,
  markOverdueObligations,
  type ObligationStatusType,
} from '../services/obligation-tracking'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const agreementTypeEnum = z.nativeEnum(AgreementType)
const agreementStatusEnum = z.nativeEnum(AgreementStatus)

const createAgreementInput = z.object({
  type: agreementTypeEnum,
  title: z.string().min(1, 'Tiêu đề không được để trống'),
  partyA: z.string().min(1, 'Bên A không được để trống'),
  partyB: z.string().min(1, 'Bên B không được để trống'),
  enterpriseId: z.string().optional().nullable(),
  partnerId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  effectiveDate: z.coerce.date().optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  signedFileUrl: z.string().optional().nullable(),
  keyObligations: z.array(obligationSchema).optional().nullable(),
  renewalNotice: z.coerce.date().optional().nullable(),
})

const updateAgreementInput = z.object({
  id: z.string(),
  type: agreementTypeEnum.optional(),
  title: z.string().min(1).optional(),
  partyA: z.string().min(1).optional(),
  partyB: z.string().min(1).optional(),
  enterpriseId: z.string().optional().nullable(),
  partnerId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  effectiveDate: z.coerce.date().optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  signedFileUrl: z.string().optional().nullable(),
  keyObligations: z.array(obligationSchema).optional().nullable(),
  renewalNotice: z.coerce.date().optional().nullable(),
})

// ─── Agreements Router ────────────────────────────────────────────────────────

export const agreementsRouter = router({
  /**
   * List agreements with filtering, search, and pagination.
   */
  list: roleProtectedProcedure(['Legal_Officer', 'Partnership_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({
      type: agreementTypeEnum.optional(),
      status: agreementStatusEnum.optional(),
      search: z.string().optional(),
      partnerId: z.string().optional(),
      enterpriseId: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      sortField: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const {
        type,
        status,
        search,
        partnerId,
        enterpriseId,
        page = 0,
        pageSize = 25,
        sortField = 'createdAt',
        sortDirection = 'desc',
      } = input ?? {}

      const where: Record<string, unknown> = {}

      if (type) where.type = type
      if (status) where.status = status
      if (partnerId) where.partnerId = partnerId
      if (enterpriseId) where.enterpriseId = enterpriseId

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { partyA: { contains: search, mode: 'insensitive' } },
          { partyB: { contains: search, mode: 'insensitive' } },
        ]
      }

      const allowedSortFields = [
        'title', 'type', 'status', 'effectiveDate', 'expiryDate', 'createdAt',
      ]
      const orderBy: Record<string, string> = {}
      if (sortField && allowedSortFields.includes(sortField)) {
        orderBy[sortField] = sortDirection ?? 'desc'
      } else {
        orderBy.createdAt = 'desc'
      }

      const [items, total] = await Promise.all([
        ctx.db.agreementRecord.findMany({
          where,
          orderBy,
          skip: page * pageSize,
          take: pageSize,
          include: {
            partner: { select: { id: true, companyName: true } },
            enterprise: { select: { id: true, legalNameVi: true } },
          },
        }),
        ctx.db.agreementRecord.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single agreement by ID with related entities.
   */
  get: roleProtectedProcedure(['Legal_Officer', 'Partnership_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const agreement = await ctx.db.agreementRecord.findUnique({
        where: { id: input.id },
        include: {
          partner: { select: { id: true, companyName: true } },
          enterprise: { select: { id: true, legalNameVi: true } },
        },
      })
      if (!agreement) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hợp đồng/thỏa thuận không tồn tại' })
      }
      return agreement
    }),

  /**
   * Create new agreement.
   */
  create: roleProtectedProcedure(['Legal_Officer', 'Partnership_Manager', 'Director', 'System_Admin'])
    .input(createAgreementInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const agreement = await ctx.db.$transaction(async (tx) => {
        const created = await tx.agreementRecord.create({
          data: {
            type: input.type,
            title: input.title,
            partyA: input.partyA,
            partyB: input.partyB,
            enterpriseId: input.enterpriseId ?? null,
            partnerId: input.partnerId ?? null,
            projectId: input.projectId ?? null,
            productId: input.productId ?? null,
            effectiveDate: input.effectiveDate ?? null,
            expiryDate: input.expiryDate ?? null,
            status: AgreementStatus.DRAFT,
            signedFileUrl: input.signedFileUrl ?? null,
            keyObligations: input.keyObligations ?? [],
            renewalNotice: input.renewalNotice ?? null,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'AGREEMENT_CREATED',
            targetType: 'AgreementRecord',
            targetId: created.id,
            afterVal: { title: input.title, type: input.type },
          },
        })

        return created
      })

      return agreement
    }),

  /**
   * Update agreement fields (not status — use updateStatus for that).
   */
  update: roleProtectedProcedure(['Legal_Officer', 'Partnership_Manager', 'Director', 'System_Admin'])
    .input(updateAgreementInput)
    .mutation(async ({ input, ctx }) => {
      const { id, keyObligations, ...rest } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.agreementRecord.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hợp đồng/thỏa thuận không tồn tại' })
      }

      // Build Prisma-compatible data object
      const data: Record<string, unknown> = { ...rest }
      if (keyObligations !== undefined) {
        data.keyObligations = keyObligations as unknown
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.agreementRecord.update({
          where: { id },
          data,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'AGREEMENT_UPDATED',
            targetType: 'AgreementRecord',
            targetId: id,
            beforeVal: { title: existing.title, type: existing.type, status: existing.status },
            afterVal: { title: rest.title, type: rest.type } as any,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Update agreement status with lifecycle validation.
   */
  updateStatus: roleProtectedProcedure(['Legal_Officer', 'Partnership_Manager', 'Director', 'System_Admin'])
    .input(z.object({
      id: z.string(),
      status: agreementStatusEnum,
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const existing = await ctx.db.agreementRecord.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hợp đồng/thỏa thuận không tồn tại' })
      }

      // Validate transition
      const validation = validateAgreementTransition(existing.status, input.status, userRoles)
      if (!validation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.message })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.agreementRecord.update({
          where: { id: input.id },
          data: { status: input.status },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'AGREEMENT_STATUS_CHANGED',
            targetType: 'AgreementRecord',
            targetId: input.id,
            beforeVal: { status: existing.status },
            afterVal: { status: input.status, reason: input.reason ?? null },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Update a single obligation's status within an agreement.
   */
  updateObligation: roleProtectedProcedure(['Legal_Officer', 'Partnership_Manager', 'Director', 'System_Admin'])
    .input(z.object({
      agreementId: z.string(),
      obligationId: z.string(),
      status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'WAIVED']),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const agreement = await ctx.db.agreementRecord.findUnique({
        where: { id: input.agreementId },
      })
      if (!agreement) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hợp đồng/thỏa thuận không tồn tại' })
      }

      // Parse existing obligations
      const rawObligations = agreement.keyObligations as unknown
      const parseResult = obligationsArraySchema.safeParse(rawObligations ?? [])
      if (!parseResult.success) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Dữ liệu nghĩa vụ không hợp lệ.',
        })
      }

      let updatedObligations
      try {
        updatedObligations = updateObligationStatus(
          parseResult.data,
          input.obligationId,
          input.status as ObligationStatusType,
          input.notes
        )
      } catch (err) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: (err as Error).message,
        })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.agreementRecord.update({
          where: { id: input.agreementId },
          data: { keyObligations: updatedObligations },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'OBLIGATION_STATUS_CHANGED',
            targetType: 'AgreementRecord',
            targetId: input.agreementId,
            afterVal: {
              obligationId: input.obligationId,
              status: input.status,
              notes: input.notes ?? null,
            },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Check and mark overdue obligations across all active agreements.
   */
  checkOverdueObligations: roleProtectedProcedure(['Legal_Officer', 'Director', 'System_Admin'])
    .mutation(async ({ ctx }) => {
      const activeAgreements = await ctx.db.agreementRecord.findMany({
        where: {
          status: { in: [AgreementStatus.ACTIVE, AgreementStatus.EXPIRING, AgreementStatus.SIGNED] },
          keyObligations: { not: { equals: null } },
        },
      })

      let totalMarked = 0

      for (const agreement of activeAgreements) {
        const rawObligations = agreement.keyObligations as unknown
        const parseResult = obligationsArraySchema.safeParse(rawObligations ?? [])
        if (!parseResult.success) continue

        const updated = markOverdueObligations(parseResult.data)
        const overdueCount = updated.filter(
          (o, i) => o.status === 'OVERDUE' && parseResult.data[i]?.status !== 'OVERDUE'
        ).length

        if (overdueCount > 0) {
          await ctx.db.agreementRecord.update({
            where: { id: agreement.id },
            data: { keyObligations: updated },
          })
          totalMarked += overdueCount
        }
      }

      return { totalMarked }
    }),

  /**
   * Run expiry check for all AgreementRecords.
   */
  checkExpiry: roleProtectedProcedure(['Legal_Officer', 'Director', 'System_Admin'])
    .input(z.object({
      expiryWarningDays: z.array(z.number().int().min(1)).optional(),
    }).optional())
    .mutation(async ({ input, ctx }) => {
      return runAgreementRecordExpiryCheck(ctx.db, {
        expiryWarningDays: input?.expiryWarningDays,
      })
    }),
})
