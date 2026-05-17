import { z } from 'zod'
import { ProductStatus } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'
import {
  validateProductStatusTransition,
  validateReviewStatusTransition,
  type ReviewStatus,
} from '../services/product-status'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const productStatusEnum = z.nativeEnum(ProductStatus)

const reviewStatusEnum = z.enum(['not_reviewed', 'in_review', 'approved', 'rejected'])

const createProductInput = z.object({
  name: z.string().min(1, 'Tên sản phẩm không được để trống'),
  version: z.string().optional().nullable(),
  type: z.string().min(1, 'Loại sản phẩm không được để trống'),
  description: z.string().optional().nullable(),
  partnerId: z.string().optional().nullable(),
  enterpriseId: z.string().optional().nullable(),
  technologyDomain: z.string().optional().nullable(),
  deploymentModel: z.string().optional().nullable(),
  aiUsed: z.boolean().optional(),
  riskClassification: z.string().optional().nullable(),
  licenseType: z.string().optional().nullable(),
})

const updateProductInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  version: z.string().optional().nullable(),
  type: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  partnerId: z.string().optional().nullable(),
  enterpriseId: z.string().optional().nullable(),
  technologyDomain: z.string().optional().nullable(),
  deploymentModel: z.string().optional().nullable(),
  aiUsed: z.boolean().optional(),
  riskClassification: z.string().optional().nullable(),
  licenseType: z.string().optional().nullable(),
})

// ─── Products Router ──────────────────────────────────────────────────────────

export const productsRouter = router({
  /**
   * List products with filtering, search, and pagination.
   */
  list: roleProtectedProcedure(['Tech_Director', 'Partnership_Manager', 'Director', 'System_Admin'])
    .input(z.object({
      status: productStatusEnum.optional(),
      partnerId: z.string().optional(),
      technologyDomain: z.string().optional(),
      search: z.string().optional(),
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      sortField: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const {
        status,
        partnerId,
        technologyDomain,
        search,
        page = 0,
        pageSize = 25,
        sortField = 'createdAt',
        sortDirection = 'desc',
      } = input ?? {}

      const where: Record<string, unknown> = {}

      if (status) where.status = status
      if (partnerId) where.partnerId = partnerId
      if (technologyDomain) where.technologyDomain = technologyDomain

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { type: { contains: search, mode: 'insensitive' } },
        ]
      }

      const allowedSortFields = ['name', 'type', 'status', 'technologyDomain', 'createdAt']
      const orderBy: Record<string, string> = {}
      if (sortField && allowedSortFields.includes(sortField)) {
        orderBy[sortField] = sortDirection ?? 'desc'
      } else {
        orderBy.createdAt = 'desc'
      }

      const [items, total] = await Promise.all([
        ctx.db.technologyProduct.findMany({
          where,
          orderBy,
          skip: page * pageSize,
          take: pageSize,
          include: {
            partner: { select: { id: true, companyName: true } },
          },
        }),
        ctx.db.technologyProduct.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single product by ID with partner and pilots.
   */
  get: roleProtectedProcedure(['Tech_Director', 'Partnership_Manager', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const product = await ctx.db.technologyProduct.findUnique({
        where: { id: input.id },
        include: {
          partner: { select: { id: true, companyName: true } },
          pilots: {
            orderBy: { createdAt: 'desc' },
            include: {
              project: { select: { id: true, name: true } },
            },
          },
        },
      })
      if (!product) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sản phẩm công nghệ không tồn tại' })
      }
      return product
    }),

  /**
   * Create new technology product.
   */
  create: roleProtectedProcedure(['Tech_Director', 'Partnership_Manager', 'Director', 'System_Admin'])
    .input(createProductInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const product = await ctx.db.$transaction(async (tx) => {
        const created = await tx.technologyProduct.create({
          data: {
            name: input.name,
            version: input.version ?? null,
            type: input.type,
            description: input.description ?? null,
            partnerId: input.partnerId ?? null,
            enterpriseId: input.enterpriseId ?? null,
            technologyDomain: input.technologyDomain ?? null,
            deploymentModel: input.deploymentModel ?? null,
            aiUsed: input.aiUsed ?? false,
            riskClassification: input.riskClassification ?? null,
            licenseType: input.licenseType ?? null,
            securityStatus: 'not_reviewed',
            dataReviewStatus: 'not_reviewed',
            aiReviewStatus: 'not_reviewed',
            status: ProductStatus.PROPOSED,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PRODUCT_CREATED',
            targetType: 'TechnologyProduct',
            targetId: created.id,
            afterVal: { name: input.name, type: input.type },
          },
        })

        return created
      })

      return product
    }),

  /**
   * Update product fields (not status).
   */
  update: roleProtectedProcedure(['Tech_Director', 'Partnership_Manager', 'Director', 'System_Admin'])
    .input(updateProductInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.technologyProduct.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sản phẩm công nghệ không tồn tại' })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.technologyProduct.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PRODUCT_UPDATED',
            targetType: 'TechnologyProduct',
            targetId: id,
            beforeVal: { name: existing.name, type: existing.type },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Update product status with workflow validation.
   * Enforces review gates when transitioning to APPROVED.
   */
  updateStatus: roleProtectedProcedure(['Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({
      id: z.string(),
      status: productStatusEnum,
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const userRoles = ctx.session.roles ?? []

      const product = await ctx.db.technologyProduct.findUnique({ where: { id: input.id } })
      if (!product) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sản phẩm công nghệ không tồn tại' })
      }

      // Validate transition with review gates
      const validation = validateProductStatusTransition(
        product.status,
        input.status,
        userRoles,
        {
          securityStatus: product.securityStatus,
          dataReviewStatus: product.dataReviewStatus,
          aiReviewStatus: product.aiReviewStatus,
          aiUsed: product.aiUsed,
        }
      )

      if (!validation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.message })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.technologyProduct.update({
          where: { id: input.id },
          data: { status: input.status },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PRODUCT_STATUS_CHANGED',
            targetType: 'TechnologyProduct',
            targetId: input.id,
            beforeVal: { status: product.status },
            afterVal: { status: input.status, reason: input.reason ?? null },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Update a review status (security, data, or AI).
   * Validates review status transitions.
   */
  updateReviewStatus: roleProtectedProcedure(['Tech_Director', 'DPO', 'Legal_Officer', 'Director', 'System_Admin'])
    .input(z.object({
      id: z.string(),
      reviewType: z.enum(['security', 'data', 'ai']),
      status: reviewStatusEnum,
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const product = await ctx.db.technologyProduct.findUnique({ where: { id: input.id } })
      if (!product) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Sản phẩm công nghệ không tồn tại' })
      }

      // Determine current review status field
      const fieldMap: Record<string, string> = {
        security: 'securityStatus',
        data: 'dataReviewStatus',
        ai: 'aiReviewStatus',
      }
      const field = fieldMap[input.reviewType]!
      const currentReviewStatus = (product as unknown as Record<string, string>)[field] as ReviewStatus

      // Validate review status transition
      const validation = validateReviewStatusTransition(currentReviewStatus, input.status)
      if (!validation.valid) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validation.message })
      }

      const updateData: Record<string, string> = { [field]: input.status }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.technologyProduct.update({
          where: { id: input.id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PRODUCT_REVIEW_UPDATED',
            targetType: 'TechnologyProduct',
            targetId: input.id,
            beforeVal: { [input.reviewType]: currentReviewStatus },
            afterVal: { [input.reviewType]: input.status, notes: input.notes ?? null },
          },
        })

        return result
      })

      return updated
    }),
})
