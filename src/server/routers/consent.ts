import { z } from 'zod'
import { ConsentStatus } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'
import { createWithdrawalAlerts } from '../services/consent-withdrawal'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const consentStatusEnum = z.nativeEnum(ConsentStatus)

const createConsentInput = z.object({
  subjectId: z.string().min(1, 'Mã chủ thể dữ liệu không được để trống'),
  projectId: z.string().optional().nullable(),
  datasetId: z.string().optional().nullable(),
  purpose: z.string().min(1, 'Mục đích thu thập không được để trống'),
  dataTypes: z.array(z.string()).min(1, 'Loại dữ liệu không được để trống'),
  thirdParty: z.string().optional().nullable(),
  consentMethod: z.string().min(1, 'Phương thức đồng ý không được để trống'),
  consentDate: z.coerce.date(),
  expiryDate: z.coerce.date().optional().nullable(),
  documentUrl: z.string().optional().nullable(),
})

const updateConsentInput = z.object({
  id: z.string(),
  subjectId: z.string().optional(),
  projectId: z.string().optional().nullable(),
  datasetId: z.string().optional().nullable(),
  purpose: z.string().optional(),
  dataTypes: z.array(z.string()).optional(),
  thirdParty: z.string().optional().nullable(),
  consentMethod: z.string().optional(),
  consentDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional().nullable(),
  documentUrl: z.string().optional().nullable(),
})

// ─── Consent Router ───────────────────────────────────────────────────────────

export const consentRouter = router({
  /**
   * List consent records with optional filters.
   */
  list: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({
      status: consentStatusEnum.optional(),
      subjectId: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const where: Record<string, unknown> = {}

      if (input?.status) {
        where.status = input.status
      }

      if (input?.subjectId) {
        where.subjectId = input.subjectId
      }

      const records = await ctx.db.consentRecord.findMany({
        where,
        orderBy: { consentDate: 'desc' },
      })

      return records
    }),

  /**
   * Get single consent record by ID.
   */
  get: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const record = await ctx.db.consentRecord.findUnique({
        where: { id: input.id },
      })
      if (!record) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi đồng ý không tồn tại' })
      }
      return record
    }),

  /**
   * Create a new consent record.
   */
  create: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(createConsentInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const record = await ctx.db.$transaction(async (tx) => {
        const created = await tx.consentRecord.create({
          data: {
            subjectId: input.subjectId,
            projectId: input.projectId ?? null,
            datasetId: input.datasetId ?? null,
            purpose: input.purpose,
            dataTypes: input.dataTypes,
            thirdParty: input.thirdParty ?? null,
            consentMethod: input.consentMethod,
            consentDate: input.consentDate,
            expiryDate: input.expiryDate ?? null,
            status: 'ACTIVE',
            documentUrl: input.documentUrl ?? null,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'CONSENT_CREATED',
            targetType: 'ConsentRecord',
            targetId: created.id,
            afterVal: { subjectId: input.subjectId, purpose: input.purpose },
          },
        })

        return created
      })

      return record
    }),

  /**
   * Update a consent record.
   */
  update: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(updateConsentInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.consentRecord.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi đồng ý không tồn tại' })
      }

      if (existing.status === 'WITHDRAWN') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Không thể cập nhật bản ghi đã rút lại đồng ý',
        })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.consentRecord.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'CONSENT_UPDATED',
            targetType: 'ConsentRecord',
            targetId: id,
            beforeVal: { subjectId: existing.subjectId, purpose: existing.purpose, status: existing.status },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Withdraw consent — sets status to WITHDRAWN and records withdrawal date.
   */
  withdraw: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.consentRecord.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bản ghi đồng ý không tồn tại' })
      }

      if (existing.status === 'WITHDRAWN') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Đồng ý đã được rút lại trước đó',
        })
      }

      const now = new Date()

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.consentRecord.update({
          where: { id: input.id },
          data: {
            status: 'WITHDRAWN',
            withdrawalDate: now,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'CONSENT_WITHDRAWN',
            targetType: 'ConsentRecord',
            targetId: input.id,
            beforeVal: { status: existing.status },
            afterVal: { status: 'WITHDRAWN', withdrawalDate: now.toISOString() },
          },
        })

        // Cascading alerts: notify DPO and project owner
        await createWithdrawalAlerts(tx, result, userId)

        return result
      })

      return updated
    }),
})
