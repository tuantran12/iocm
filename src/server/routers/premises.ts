import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'

const premisesInput = z.object({
  addressFull: z.string().min(1, 'Địa chỉ là bắt buộc'),
  ownershipType: z.string().min(1, 'Loại sở hữu là bắt buộc'),
  legalDocumentType: z.string().optional(),
  contractNumber: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  areaM2: z.number().optional(),
  status: z.string().default('draft'),
})

export const premisesRouter = router({
  /** Danh sách trụ sở */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.premisesRecord.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }),

  /** Thêm trụ sở */
  create: protectedProcedure
    .input(premisesInput)
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.instituteProfile.findFirst()
      if (!profile) {
        throw new Error('Chưa có hồ sơ Viện. Vui lòng tạo hồ sơ Viện trước.')
      }
      const record = await ctx.db.premisesRecord.create({
        data: {
          instituteId: profile.id,
          addressFull: input.addressFull,
          ownershipType: input.ownershipType,
          legalDocumentType: input.legalDocumentType,
          contractNumber: input.contractNumber,
          validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
          validTo: input.validTo ? new Date(input.validTo) : undefined,
          areaM2: input.areaM2,
          status: input.status,
        },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'CREATE',
          targetType: 'PremisesRecord',
          targetId: record.id,
          afterVal: input as object,
        },
      })
      return record
    }),

  /** Cập nhật trụ sở */
  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(premisesInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, validFrom, validTo, ...rest } = input
      const record = await ctx.db.premisesRecord.update({
        where: { id },
        data: {
          ...rest,
          ...(validFrom !== undefined && { validFrom: validFrom ? new Date(validFrom) : null }),
          ...(validTo !== undefined && { validTo: validTo ? new Date(validTo) : null }),
        },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'UPDATE',
          targetType: 'PremisesRecord',
          targetId: id,
          afterVal: input as object,
        },
      })
      return record
    }),

  /** Xóa trụ sở */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.premisesRecord.delete({ where: { id: input.id } })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'DELETE',
          targetType: 'PremisesRecord',
          targetId: input.id,
        },
      })
      return { success: true }
    }),
})
