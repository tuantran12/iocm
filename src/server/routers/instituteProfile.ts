import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'

// ─── Institute Profile Router ─────────────────────────────────────────────────

const instituteProfileInput = z.object({
  nameVi: z.string().min(1, 'Tên tiếng Việt là bắt buộc'),
  nameEn: z.string().optional(),
  abbreviation: z.string().optional(),
  instituteType: z.string().min(1, 'Loại hình tổ chức là bắt buộc'),
  founderType: z.string().optional(),
  registrationAuthority: z.string().optional(),
  plannedAddress: z.string().optional(),
  plannedFields: z.array(z.string()).default([]),
  headPersonName: z.string().optional(),
  status: z.string().default('planning'),
})

export const instituteProfileRouter = router({
  /**
   * Get the single institute profile (first record).
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.db.instituteProfile.findFirst({
      orderBy: { createdAt: 'asc' },
    })
    return profile
  }),

  /**
   * Create or update the institute profile.
   * If a profile exists, update it. Otherwise create a new one.
   */
  upsert: protectedProcedure
    .input(instituteProfileInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.instituteProfile.findFirst({
        orderBy: { createdAt: 'asc' },
      })

      if (existing) {
        return ctx.db.instituteProfile.update({
          where: { id: existing.id },
          data: input,
        })
      }

      return ctx.db.instituteProfile.create({
        data: input,
      })
    }),
})
