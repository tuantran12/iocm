import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'
import { checkRetentionForType, createArchivalWarnings } from '../services/retention-check'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const createRetentionRuleInput = z.object({
  objectType: z.string().min(1, 'Loại đối tượng không được để trống'),
  retentionPeriod: z.string().min(1, 'Thời gian lưu trữ không được để trống'),
  legalBasis: z.string().optional().nullable(),
  archiveMethod: z.string().optional().nullable(),
  deletionMethod: z.string().optional().nullable(),
  approvalNeeded: z.boolean().default(true),
})

const updateRetentionRuleInput = z.object({
  id: z.string(),
  objectType: z.string().min(1, 'Loại đối tượng không được để trống').optional(),
  retentionPeriod: z.string().min(1, 'Thời gian lưu trữ không được để trống').optional(),
  legalBasis: z.string().optional().nullable(),
  archiveMethod: z.string().optional().nullable(),
  deletionMethod: z.string().optional().nullable(),
  approvalNeeded: z.boolean().optional(),
})

// ─── Retention Rules Router ───────────────────────────────────────────────────

export const retentionRulesRouter = router({
  /**
   * List all retention rules.
   */
  list: roleProtectedProcedure(['System_Admin', 'DPO', 'Auditor'])
    .input(z.object({
      search: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const where: Record<string, unknown> = {}

      if (input?.search) {
        where.OR = [
          { objectType: { contains: input.search, mode: 'insensitive' } },
          { legalBasis: { contains: input.search, mode: 'insensitive' } },
        ]
      }

      const items = await ctx.db.retentionRule.findMany({
        where,
        orderBy: { objectType: 'asc' },
      })

      return items
    }),

  /**
   * Get single retention rule by ID.
   */
  get: roleProtectedProcedure(['System_Admin', 'DPO', 'Auditor'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const item = await ctx.db.retentionRule.findUnique({
        where: { id: input.id },
      })
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Quy tắc lưu trữ không tồn tại' })
      }
      return item
    }),

  /**
   * Create a new retention rule.
   */
  create: roleProtectedProcedure(['System_Admin', 'DPO', 'Auditor'])
    .input(createRetentionRuleInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Check uniqueness of objectType
      const existing = await ctx.db.retentionRule.findUnique({
        where: { objectType: input.objectType },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Quy tắc lưu trữ cho loại "${input.objectType}" đã tồn tại`,
        })
      }

      const item = await ctx.db.$transaction(async (tx) => {
        const created = await tx.retentionRule.create({
          data: {
            objectType: input.objectType,
            retentionPeriod: input.retentionPeriod,
            legalBasis: input.legalBasis ?? null,
            archiveMethod: input.archiveMethod ?? null,
            deletionMethod: input.deletionMethod ?? null,
            approvalNeeded: input.approvalNeeded,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'RETENTION_RULE_CREATED',
            targetType: 'RetentionRule',
            targetId: created.id,
            afterVal: { objectType: input.objectType, retentionPeriod: input.retentionPeriod },
          },
        })

        return created
      })

      return item
    }),

  /**
   * Update a retention rule.
   */
  update: roleProtectedProcedure(['System_Admin', 'DPO', 'Auditor'])
    .input(updateRetentionRuleInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.retentionRule.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Quy tắc lưu trữ không tồn tại' })
      }

      // If objectType is being changed, check uniqueness
      if (updateData.objectType && updateData.objectType !== existing.objectType) {
        const conflict = await ctx.db.retentionRule.findUnique({
          where: { objectType: updateData.objectType },
        })
        if (conflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Quy tắc lưu trữ cho loại "${updateData.objectType}" đã tồn tại`,
          })
        }
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.retentionRule.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'RETENTION_RULE_UPDATED',
            targetType: 'RetentionRule',
            targetId: id,
            beforeVal: { objectType: existing.objectType, retentionPeriod: existing.retentionPeriod },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Delete a retention rule.
   */
  delete: roleProtectedProcedure(['System_Admin', 'DPO', 'Auditor'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.retentionRule.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Quy tắc lưu trữ không tồn tại' })
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.retentionRule.delete({ where: { id: input.id } })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'RETENTION_RULE_DELETED',
            targetType: 'RetentionRule',
            targetId: input.id,
            beforeVal: { objectType: existing.objectType, retentionPeriod: existing.retentionPeriod },
          },
        })
      })

      return { success: true }
    }),

  /**
   * Kiểm tra retention cho một objectType cụ thể.
   * Tìm items quá hạn lưu trữ và tạo cảnh báo cho DPO/System_Admin.
   *
   * - Nếu approvalNeeded = true: items chờ phê duyệt, KHÔNG tự động xóa
   * - Nếu approvalNeeded = false: items được tự động lưu trữ
   */
  checkRetention: roleProtectedProcedure(['System_Admin', 'DPO', 'Auditor'])
    .input(z.object({ objectType: z.string().min(1, 'Loại đối tượng không được để trống') }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Kiểm tra retention cho objectType
      const checkResult = await checkRetentionForType(ctx.db, input.objectType)

      // Nếu không có items cần xử lý, trả về kết quả
      if (checkResult.itemsDueForAction.length === 0) {
        return {
          ...checkResult,
          warnings: {
            objectType: input.objectType,
            warningsCreated: 0,
            autoArchived: 0,
            pendingApproval: 0,
          },
        }
      }

      // Tạo cảnh báo
      const warningResult = await createArchivalWarnings(ctx.db, checkResult.itemsDueForAction, {
        objectType: input.objectType,
        approvalNeeded: checkResult.approvalNeeded,
        archiveMethod: checkResult.archiveMethod,
        deletionMethod: checkResult.deletionMethod,
      })

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          userId,
          action: 'RETENTION_CHECK_EXECUTED',
          targetType: 'RetentionRule',
          targetId: input.objectType,
          afterVal: {
            itemsFound: checkResult.itemsDueForAction.length,
            approvalNeeded: checkResult.approvalNeeded,
            warningsCreated: warningResult.warningsCreated,
          },
        },
      })

      return {
        ...checkResult,
        warnings: warningResult,
      }
    }),
})
