import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'

const personnelInput = z.object({
  fullName: z.string().min(1, 'Họ tên là bắt buộc'),
  birthYear: z.number().optional(),
  gender: z.string().optional(),
  idNumber: z.string().optional(),
  qualification: z.string().min(1, 'Trình độ là bắt buộc'),
  specialization: z.string().min(1, 'Chuyên ngành là bắt buộc'),
  employmentType: z.string().min(1, 'Loại hình là bắt buộc'),
  matchingExpertise: z.boolean().default(false),
  plannedPosition: z.string().optional(),
  scientificTitle: z.string().optional(),
  formType: z.string().optional(),
  isHeadPerson: z.boolean().default(false),
  status: z.string().default('draft'),
})

export const establishmentPersonnelRouter = router({
  /** Danh sách nhân sự thành lập */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.establishmentPersonnel.findMany({
      orderBy: { createdAt: 'desc' },
    })
  }),

  /** Thêm nhân sự */
  create: protectedProcedure
    .input(personnelInput)
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.db.instituteProfile.findFirst()
      if (!profile) {
        throw new Error('Chưa có hồ sơ Viện. Vui lòng tạo hồ sơ Viện trước.')
      }
      const person = await ctx.db.establishmentPersonnel.create({
        data: { ...input, instituteId: profile.id },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'CREATE',
          targetType: 'EstablishmentPersonnel',
          targetId: person.id,
          afterVal: input as object,
        },
      })
      return person
    }),

  /** Cập nhật nhân sự */
  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(personnelInput.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input
      const person = await ctx.db.establishmentPersonnel.update({
        where: { id },
        data,
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'UPDATE',
          targetType: 'EstablishmentPersonnel',
          targetId: id,
          afterVal: data as object,
        },
      })
      return person
    }),

  /** Xóa nhân sự */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.establishmentPersonnel.delete({ where: { id: input.id } })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'DELETE',
          targetType: 'EstablishmentPersonnel',
          targetId: input.id,
        },
      })
      return { success: true }
    }),

  /** Kiểm tra điều kiện nhân sự theo quy định */
  validate: protectedProcedure.query(async ({ ctx }) => {
    const personnel = await ctx.db.establishmentPersonnel.findMany()
    const total = personnel.length

    // Điều kiện 1: >= 5 người có trình độ ĐH trở lên
    const universityLevels = ['dai_hoc', 'thac_si', 'tien_si', 'pgs', 'gs']
    const universityCount = personnel.filter((p) =>
      universityLevels.includes(p.qualification)
    ).length
    const hasMinUniversity = universityCount >= 5

    // Điều kiện 2: >= 40% là chính thức
    const fullTimeCount = personnel.filter(
      (p) => p.employmentType === 'chinh_thuc'
    ).length
    const fullTimePercent = total > 0 ? (fullTimeCount / total) * 100 : 0
    const hasMinFullTime = fullTimePercent >= 40

    // Điều kiện 3: >= 30% đúng chuyên môn
    const matchingCount = personnel.filter((p) => p.matchingExpertise).length
    const matchingPercent = total > 0 ? (matchingCount / total) * 100 : 0
    const hasMinMatching = matchingPercent >= 30

    // Điều kiện 4: Người đứng đầu có trình độ ĐH+
    const headPerson = personnel.find((p) => p.isHeadPerson)
    const headHasQualification = headPerson
      ? universityLevels.includes(headPerson.qualification)
      : false

    return {
      total,
      universityCount,
      hasMinUniversity,
      fullTimeCount,
      fullTimePercent: Math.round(fullTimePercent),
      hasMinFullTime,
      matchingCount,
      matchingPercent: Math.round(matchingPercent),
      hasMinMatching,
      headPerson: headPerson?.fullName ?? null,
      headHasQualification,
      allPassed: hasMinUniversity && hasMinFullTime && hasMinMatching && headHasQualification,
    }
  }),
})
