import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'

const facilityInput = z.object({
  assetName: z.string().min(1, 'Tên tài sản là bắt buộc'),
  assetType: z.string().min(1, 'Loại tài sản là bắt buộc'),
  quantity: z.number().int().min(1).default(1),
  technicalSpecs: z.string().optional(),
  ownershipType: z.string().optional(),
  location: z.string().optional(),
  condition: z.string().optional(),
  relatedRegisteredField: z.string().optional(),
})

export const facilitiesRouter = router({
  /** Danh sách tài sản */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.facilityAsset.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }),

  /** Thêm tài sản */
  create: protectedProcedure
    .input(facilityInput)
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.instituteProfile.findFirst()
      if (!profile) {
        throw new Error('Chưa có hồ sơ Viện. Vui lòng tạo hồ sơ Viện trước.')
      }
      const asset = await ctx.db.facilityAsset.create({
        data: { ...input, instituteId: profile.id },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'CREATE',
          targetType: 'FacilityAsset',
          targetId: asset.id,
          afterVal: input as object,
        },
      })
      return asset
    }),

  /** Cập nhật tài sản */
  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(facilityInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const asset = await ctx.db.facilityAsset.update({
        where: { id },
        data,
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'UPDATE',
          targetType: 'FacilityAsset',
          targetId: id,
          afterVal: data as object,
        },
      })
      return asset
    }),

  /** Xóa tài sản */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.facilityAsset.delete({ where: { id: input.id } })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'DELETE',
          targetType: 'FacilityAsset',
          targetId: input.id,
        },
      })
      return { success: true }
    }),

  /** Tổng hợp tài sản */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const assets = await ctx.db.facilityAsset.findMany()
    const totalAssets = assets.length
    const totalQuantity = assets.reduce((sum, a) => sum + a.quantity, 0)

    // Nhóm theo loại
    const byType: Record<string, number> = {}
    for (const a of assets) {
      byType[a.assetType] = (byType[a.assetType] || 0) + a.quantity
    }

    // Nhóm theo lĩnh vực
    const byField: Record<string, number> = {}
    for (const a of assets) {
      const field = a.relatedRegisteredField || 'Chưa phân loại'
      byField[field] = (byField[field] || 0) + a.quantity
    }

    return { totalAssets, totalQuantity, byType, byField }
  }),
})
