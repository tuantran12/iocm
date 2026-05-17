import { z } from 'zod'
import { LegalStatus } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure, roleProtectedProcedure } from '../trpc'
import {
  runExpiryCheck,
  getExpiringLegalBases,
  DEFAULT_EXPIRY_THRESHOLDS,
  DEFAULT_VERIFICATION_MAX_DAYS,
} from '../services/legal-basis-expiry'

const legalStatusEnum = z.nativeEnum(LegalStatus)

export const legalBasisRouter = router({
  /**
   * Chạy kiểm tra hết hạn căn cứ pháp lý.
   * - Phát hiện căn cứ sắp hết hạn
   * - Phát hiện căn cứ đã hết hạn
   * - Phát hiện căn cứ chưa xác minh quá lâu
   * - Tự động cập nhật status
   * - Tạo notifications cho Legal_Officer
   *
   * Có thể gọi on-access hoặc qua cron.
   * Yêu cầu role: Legal_Officer, System_Admin, hoặc Director.
   */
  checkExpiry: roleProtectedProcedure(['Legal_Officer', 'System_Admin', 'Director'])
    .input(
      z.object({
        expiryWarningDays: z.array(z.number().int().positive()).optional(),
        verificationMaxDays: z.number().int().positive().optional(),
      }).optional()
    )
    .mutation(async ({ input, ctx }) => {
      const result = await runExpiryCheck(ctx.db, {
        expiryWarningDays: input?.expiryWarningDays ?? [...DEFAULT_EXPIRY_THRESHOLDS],
        verificationMaxDays: input?.verificationMaxDays ?? DEFAULT_VERIFICATION_MAX_DAYS,
      })

      return result
    }),

  /**
   * Lấy danh sách căn cứ pháp lý sắp hết hạn trong N ngày.
   * Mặc định: 90 ngày.
   */
  getExpiringBases: protectedProcedure
    .input(
      z.object({
        withinDays: z.number().int().positive().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const withinDays = input?.withinDays ?? 90

      const bases = await getExpiringLegalBases(ctx.db, withinDays)

      // Enrich with days until expiry
      const now = new Date()
      return bases.map((basis) => ({
        ...basis,
        daysUntilExpiry: basis.expiryDate
          ? Math.floor((basis.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      }))
    }),

  /**
   * Liệt kê tất cả căn cứ pháp lý với filter và phân trang.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: legalStatusEnum.optional(),
        basisType: z.string().optional(),
        scope: z.string().optional(),
        search: z.string().optional(),
        sortField: z.string().optional(),
        sortDirection: z.enum(['asc', 'desc']).optional(),
        page: z.number().int().min(0).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const {
        status,
        basisType,
        scope,
        search,
        sortField = 'effectiveDate',
        sortDirection = 'desc',
        page = 0,
        pageSize = 25,
      } = input ?? {}

      const where: Record<string, unknown> = {}
      if (status) where.status = status
      if (basisType) where.basisType = basisType
      if (scope) where.scope = scope
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { documentNumber: { contains: search, mode: 'insensitive' } },
          { issuingAuth: { contains: search, mode: 'insensitive' } },
        ]
      }

      const allowedSortFields = [
        'documentNumber', 'title', 'issuingAuth', 'effectiveDate',
        'expiryDate', 'status', 'basisType', 'scope', 'lastVerified',
      ]
      const orderBy: Record<string, string> = {}
      if (sortField && allowedSortFields.includes(sortField)) {
        orderBy[sortField] = sortDirection ?? 'desc'
      } else {
        orderBy.effectiveDate = 'desc'
      }

      const [items, total] = await Promise.all([
        ctx.db.legalBasis.findMany({
          where,
          orderBy,
          skip: page * pageSize,
          take: pageSize,
          include: {
            documents: { select: { id: true, documentId: true } },
          },
        }),
        ctx.db.legalBasis.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Lấy chi tiết một căn cứ pháp lý kèm tài liệu liên kết.
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const basis = await ctx.db.legalBasis.findUnique({
        where: { id: input.id },
        include: {
          documents: {
            include: { document: { select: { id: true, code: true, name: true, status: true } } },
          },
        },
      })
      if (!basis) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Căn cứ pháp lý không tồn tại' })
      }
      return basis
    }),

  /**
   * Tạo mới căn cứ pháp lý.
   */
  create: roleProtectedProcedure(['Legal_Officer', 'System_Admin', 'Director', 'Core_Team_Member'])
    .input(
      z.object({
        documentNumber: z.string().min(1, 'Số hiệu văn bản không được để trống'),
        title: z.string().min(1, 'Tiêu đề không được để trống'),
        issuingAuth: z.string().min(1, 'Cơ quan ban hành không được để trống'),
        effectiveDate: z.date(),
        expiryDate: z.date().optional().nullable(),
        basisType: z.string(),
        scope: z.string(),
        summary: z.string().optional().nullable(),
        fullTextUrl: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check duplicate documentNumber
      const existing = await ctx.db.legalBasis.findUnique({
        where: { documentNumber: input.documentNumber },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Số hiệu "${input.documentNumber}" đã tồn tại trong hệ thống`,
        })
      }

      const created = await ctx.db.legalBasis.create({
        data: {
          ...input,
          lastVerified: new Date(),
          verifiedBy: ctx.session.user.id,
        },
      })

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'CREATE_LEGAL_BASIS',
          targetType: 'LegalBasis',
          targetId: created.id,
          afterVal: input as any,
        },
      })

      return created
    }),

  /**
   * Cập nhật căn cứ pháp lý.
   */
  update: roleProtectedProcedure(['Legal_Officer', 'System_Admin', 'Director', 'Core_Team_Member'])
    .input(
      z.object({
        id: z.string(),
        documentNumber: z.string().optional(),
        title: z.string().optional(),
        issuingAuth: z.string().optional(),
        effectiveDate: z.date().optional(),
        expiryDate: z.date().optional().nullable(),
        status: legalStatusEnum.optional(),
        basisType: z.string().optional(),
        scope: z.string().optional(),
        summary: z.string().optional().nullable(),
        fullTextUrl: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input
      const existing = await ctx.db.legalBasis.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Căn cứ pháp lý không tồn tại' })
      }

      // Check duplicate documentNumber if changing
      if (data.documentNumber && data.documentNumber !== existing.documentNumber) {
        const duplicate = await ctx.db.legalBasis.findUnique({
          where: { documentNumber: data.documentNumber },
        })
        if (duplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Số hiệu "${data.documentNumber}" đã tồn tại trong hệ thống`,
          })
        }
      }

      const updated = await ctx.db.legalBasis.update({ where: { id }, data })

      // Audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'UPDATE_LEGAL_BASIS',
          targetType: 'LegalBasis',
          targetId: id,
          beforeVal: existing as any,
          afterVal: data as any,
        },
      })

      return updated
    }),

  /**
   * Xác minh lại căn cứ pháp lý (cập nhật lastVerified).
   */
  verify: roleProtectedProcedure(['Legal_Officer', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.db.legalBasis.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Căn cứ pháp lý không tồn tại' })
      }
      return ctx.db.legalBasis.update({
        where: { id: input.id },
        data: {
          lastVerified: new Date(),
          verifiedBy: ctx.session.user.id,
        },
      })
    }),

  /**
   * Xóa mềm căn cứ pháp lý (đặt status = SUPERSEDED).
   */
  delete: roleProtectedProcedure(['Legal_Officer', 'System_Admin', 'Director', 'Core_Team_Member'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.db.legalBasis.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Căn cứ pháp lý không tồn tại' })
      }

      const updated = await ctx.db.legalBasis.update({
        where: { id: input.id },
        data: { status: LegalStatus.SUPERSEDED },
      })

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: 'DELETE_LEGAL_BASIS',
          targetType: 'LegalBasis',
          targetId: input.id,
          beforeVal: { status: existing.status } as any,
          afterVal: { status: LegalStatus.SUPERSEDED } as any,
        },
      })

      return updated
    }),

  /**
   * Tìm kiếm nhanh căn cứ pháp lý (autocomplete).
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1, 'Từ khóa tìm kiếm không được để trống'),
        limit: z.number().int().min(1).max(50).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { query, limit = 10 } = input

      return ctx.db.legalBasis.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { documentNumber: { contains: query, mode: 'insensitive' } },
            { issuingAuth: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          documentNumber: true,
          title: true,
          status: true,
          basisType: true,
          issuingAuth: true,
        },
        take: limit,
        orderBy: { title: 'asc' },
      })
    }),

  /**
   * Liên kết căn cứ pháp lý với tài liệu.
   */
  linkToDocument: roleProtectedProcedure(['Legal_Officer', 'System_Admin', 'Director', 'Core_Team_Member'])
    .input(
      z.object({
        legalBasisId: z.string(),
        documentId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify both exist
      const [basis, doc] = await Promise.all([
        ctx.db.legalBasis.findUnique({ where: { id: input.legalBasisId } }),
        ctx.db.documentItem.findUnique({ where: { id: input.documentId } }),
      ])
      if (!basis) throw new TRPCError({ code: 'NOT_FOUND', message: 'Căn cứ pháp lý không tồn tại' })
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tài liệu không tồn tại' })

      // Check if link already exists
      const existing = await ctx.db.documentLegalBasis.findUnique({
        where: { documentId_legalBasisId: { documentId: input.documentId, legalBasisId: input.legalBasisId } },
      })
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Liên kết đã tồn tại' })
      }

      return ctx.db.documentLegalBasis.create({
        data: {
          documentId: input.documentId,
          legalBasisId: input.legalBasisId,
        },
      })
    }),

  /**
   * Hủy liên kết căn cứ pháp lý với tài liệu.
   */
  unlinkFromDocument: roleProtectedProcedure(['Legal_Officer', 'System_Admin', 'Director', 'Core_Team_Member'])
    .input(
      z.object({
        legalBasisId: z.string(),
        documentId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.db.documentLegalBasis.findUnique({
        where: { documentId_legalBasisId: { documentId: input.documentId, legalBasisId: input.legalBasisId } },
      })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Liên kết không tồn tại' })
      }

      await ctx.db.documentLegalBasis.delete({
        where: { id: existing.id },
      })

      return { success: true }
    }),
})
