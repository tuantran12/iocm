import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'

const submissionInput = z.object({
  dossierId: z.string().min(1, 'Mã bộ hồ sơ là bắt buộc'),
  submissionMethod: z.string().min(1, 'Phương thức nộp là bắt buộc'),
  submittedBy: z.string().min(1, 'Người nộp là bắt buộc'),
  submittedAt: z.string().min(1, 'Ngày nộp là bắt buộc'),
  receivingAuthority: z.string().min(1, 'Cơ quan tiếp nhận là bắt buộc'),
  receiptNumber: z.string().optional(),
  feeAmount: z.number().optional(),
  processingDeadline: z.string().optional(),
})

export const submissionsRouter = router({
  /** Danh sách lần nộp */
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.submissionRecord.findMany({
      orderBy: { submittedAt: 'desc' },
    })
  }),

  /** Ghi nhận lần nộp mới */
  create: protectedProcedure
    .input(submissionInput)
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.db.submissionRecord.create({
        data: {
          dossierId: input.dossierId,
          submissionMethod: input.submissionMethod,
          submittedBy: input.submittedBy,
          submittedAt: new Date(input.submittedAt),
          receivingAuthority: input.receivingAuthority,
          receiptNumber: input.receiptNumber,
          feeAmount: input.feeAmount,
          processingDeadline: input.processingDeadline
            ? new Date(input.processingDeadline)
            : undefined,
        },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'CREATE',
          targetType: 'SubmissionRecord',
          targetId: record.id,
          afterVal: input as object,
        },
      })
      return record
    }),

  /** Cập nhật trạng thái / phản hồi */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        currentStatus: z.string().optional(),
        authorityFeedback: z.string().optional(),
        resultStatus: z.string().optional(),
        certificateNumber: z.string().optional(),
        resultDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, resultDate, ...data } = input
      const record = await ctx.db.submissionRecord.update({
        where: { id },
        data: {
          ...data,
          ...(resultDate && { resultDate: new Date(resultDate) }),
        },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'UPDATE',
          targetType: 'SubmissionRecord',
          targetId: id,
          afterVal: input as object,
        },
      })
      return record
    }),

  /** Ghi nhận yêu cầu bổ sung */
  addSupplement: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        supplementDeadline: z.string().optional(),
        authorityFeedback: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const record = await ctx.db.submissionRecord.update({
        where: { id: input.id },
        data: {
          supplementRequired: true,
          currentStatus: 'supplement_requested',
          supplementDeadline: input.supplementDeadline
            ? new Date(input.supplementDeadline)
            : undefined,
          authorityFeedback: input.authorityFeedback,
        },
      })
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session!.user.id,
          action: 'ADD_SUPPLEMENT',
          targetType: 'SubmissionRecord',
          targetId: input.id,
          afterVal: input as object,
        },
      })
      return record
    }),
})
