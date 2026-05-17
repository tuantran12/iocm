import { z } from 'zod'
import { Confidentiality } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const confidentialityEnum = z.nativeEnum(Confidentiality)

const createDataCatalogInput = z.object({
  name: z.string().min(1, 'Tên danh mục dữ liệu không được để trống'),
  description: z.string().optional().nullable(),
  ownerId: z.string().min(1, 'Người sở hữu không được để trống'),
  stewardId: z.string().optional().nullable(),
  confidentiality: confidentialityEnum.default('INTERNAL'),
  personalDataLevel: z.string().default('none'),
  riskLevel: z.string().default('low'),
  collectionMethod: z.string().optional().nullable(),
  legalBasis: z.string().optional().nullable(),
  retentionPeriod: z.string().optional().nullable(),
  storageLocation: z.string().optional().nullable(),
  encrypted: z.boolean().default(false),
  projectId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  partnerId: z.string().optional().nullable(),
})

const updateDataCatalogInput = z.object({
  id: z.string(),
  name: z.string().min(1, 'Tên danh mục dữ liệu không được để trống').optional(),
  description: z.string().optional().nullable(),
  ownerId: z.string().optional(),
  stewardId: z.string().optional().nullable(),
  confidentiality: confidentialityEnum.optional(),
  personalDataLevel: z.string().optional(),
  riskLevel: z.string().optional(),
  collectionMethod: z.string().optional().nullable(),
  legalBasis: z.string().optional().nullable(),
  retentionPeriod: z.string().optional().nullable(),
  storageLocation: z.string().optional().nullable(),
  encrypted: z.boolean().optional(),
  projectId: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  partnerId: z.string().optional().nullable(),
})

// ─── Data Catalog Router ──────────────────────────────────────────────────────

export const dataCatalogRouter = router({
  /**
   * List data catalog entries with optional filters.
   */
  list: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({
      confidentiality: confidentialityEnum.optional(),
      personalDataLevel: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const where: Record<string, unknown> = {}

      if (input?.confidentiality) {
        where.confidentiality = input.confidentiality
      }

      if (input?.personalDataLevel) {
        where.personalDataLevel = input.personalDataLevel
      }

      if (input?.search) {
        where.OR = [
          { name: { contains: input.search, mode: 'insensitive' } },
          { description: { contains: input.search, mode: 'insensitive' } },
        ]
      }

      const items = await ctx.db.dataCatalog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })

      return items
    }),

  /**
   * Get single data catalog entry by ID.
   */
  get: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const item = await ctx.db.dataCatalog.findUnique({
        where: { id: input.id },
      })
      if (!item) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Danh mục dữ liệu không tồn tại' })
      }
      return item
    }),

  /**
   * Create a new data catalog entry.
   */
  create: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(createDataCatalogInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const item = await ctx.db.$transaction(async (tx) => {
        const created = await tx.dataCatalog.create({
          data: {
            name: input.name,
            description: input.description ?? null,
            ownerId: input.ownerId,
            stewardId: input.stewardId ?? null,
            confidentiality: input.confidentiality,
            personalDataLevel: input.personalDataLevel,
            riskLevel: input.riskLevel,
            collectionMethod: input.collectionMethod ?? null,
            legalBasis: input.legalBasis ?? null,
            retentionPeriod: input.retentionPeriod ?? null,
            storageLocation: input.storageLocation ?? null,
            encrypted: input.encrypted,
            projectId: input.projectId ?? null,
            productId: input.productId ?? null,
            partnerId: input.partnerId ?? null,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DATA_CATALOG_CREATED',
            targetType: 'DataCatalog',
            targetId: created.id,
            afterVal: { name: input.name, confidentiality: input.confidentiality },
          },
        })

        return created
      })

      return item
    }),

  /**
   * Update a data catalog entry.
   */
  update: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(updateDataCatalogInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.dataCatalog.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Danh mục dữ liệu không tồn tại' })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.dataCatalog.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DATA_CATALOG_UPDATED',
            targetType: 'DataCatalog',
            targetId: id,
            beforeVal: { name: existing.name, confidentiality: existing.confidentiality },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Delete a data catalog entry.
   */
  delete: roleProtectedProcedure(['DPO', 'System_Admin', 'Legal_Officer', 'Director'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.dataCatalog.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Danh mục dữ liệu không tồn tại' })
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.dataCatalog.delete({ where: { id: input.id } })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DATA_CATALOG_DELETED',
            targetType: 'DataCatalog',
            targetId: input.id,
            beforeVal: { name: existing.name, confidentiality: existing.confidentiality },
          },
        })
      })

      return { success: true }
    }),
})
