import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'

export const registrationDossierRouter = router({
  /** Lấy bộ hồ sơ mới nhất */
  get: protectedProcedure.query(async ({ ctx }) => {
    const dossier = await ctx.db.registrationDossier.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    })
    return dossier
  }),

  /** Tạo bộ hồ sơ mới */
  create: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1, 'Mã hồ sơ là bắt buộc'),
        registrationAuthority: z.string().min(1, 'Cơ quan đăng ký là bắt buộc'),
        submissionMethod: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.instituteProfile.findFirst()
      if (!profile) {
        throw new Error('Chưa có hồ sơ Viện. Vui lòng tạo hồ sơ Viện trước.')
      }
      const dossier = await ctx.db.registrationDossier.create({
        data: {
          instituteId: profile.id,
          code: input.code,
          registrationAuthority: input.registrationAuthority,
          submissionMethod: input.submissionMethod,
        },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'CREATE',
          targetType: 'RegistrationDossier',
          targetId: dossier.id,
          afterVal: input as object,
        },
      })
      return dossier
    }),

  /** Thêm tài liệu vào bộ hồ sơ */
  addItem: protectedProcedure
    .input(
      z.object({
        dossierId: z.string(),
        documentId: z.string(),
        requirementLevel: z.string().default('mandatory_for_submission'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.registrationDossierItem.create({
        data: {
          dossierId: input.dossierId,
          documentId: input.documentId,
          requirementLevel: input.requirementLevel,
        },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'ADD_ITEM',
          targetType: 'RegistrationDossierItem',
          targetId: item.id,
          afterVal: input as object,
        },
      })
      return item
    }),

  /** Xóa mục khỏi bộ hồ sơ */
  removeItem: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.registrationDossierItem.delete({
        where: { id: input.itemId },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'DELETE',
          targetType: 'RegistrationDossierItem',
          targetId: input.itemId,
        },
      })
      return { success: true }
    }),

  /** Cập nhật trạng thái mục */
  updateItemStatus: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        status: z.enum(['missing', 'draft', 'ready', 'submitted', 'accepted', 'needs_revision']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.registrationDossierItem.update({
        where: { id: input.itemId },
        data: { itemStatus: input.status },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'UPDATE_STATUS',
          targetType: 'RegistrationDossierItem',
          targetId: input.itemId,
          afterVal: { status: input.status },
        },
      })
      return item
    }),

  /** Tính điểm sẵn sàng: ready_items / required_items */
  getReadiness: protectedProcedure.query(async ({ ctx }) => {
    const dossier = await ctx.db.registrationDossier.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    })
    if (!dossier || dossier.items.length === 0) {
      return { total: 0, ready: 0, score: 0 }
    }
    const required = dossier.items.filter(
      (i) => i.requirementLevel === 'mandatory_for_submission'
    )
    const ready = required.filter(
      (i) => i.itemStatus === 'ready' || i.itemStatus === 'submitted' || i.itemStatus === 'accepted'
    )
    const total = required.length
    const score = total > 0 ? Math.round((ready.length / total) * 100) : 0
    return { total, ready: ready.length, score }
  }),
})
