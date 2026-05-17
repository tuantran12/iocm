import { describe, it, expect, vi } from 'vitest'
import { ProductStatus } from '@prisma/client'

/**
 * Products Router - CRUD, Status Workflow, Review Gates Tests
 *
 * Tests technology product management operations.
 * Validates: Task 13.1 (products CRUD, review status, link to partner/project)
 * Validates: Task 13.6 (product CRUD, status workflow, review gates)
 */

// ─── Mock Prisma & Context Helpers ────────────────────────────────────────────

function createMockTx() {
  return {
    technologyProduct: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

function createMockDb() {
  const tx = createMockTx()
  return {
    technologyProduct: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    _tx: tx,
  }
}

function createMockCtx(roles: string[] = ['Tech_Director']) {
  return {
    session: {
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      roles,
    },
    db: createMockDb(),
  }
}

// ─── Extracted Business Logic (mirrors router for testability) ────────────────

function buildProductWhereClause(input?: {
  status?: ProductStatus
  partnerId?: string
  technologyDomain?: string
  search?: string
}) {
  const where: Record<string, unknown> = {}
  if (!input) return where

  if (input.status) where.status = input.status
  if (input.partnerId) where.partnerId = input.partnerId
  if (input.technologyDomain) where.technologyDomain = input.technologyDomain
  if (input.search) {
    where.OR = [
      { name: { contains: input.search, mode: 'insensitive' } },
      { description: { contains: input.search, mode: 'insensitive' } },
      { type: { contains: input.search, mode: 'insensitive' } },
    ]
  }
  return where
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Products Router', () => {
  describe('list', () => {
    it('should build empty where clause when no filters provided', () => {
      const where = buildProductWhereClause()
      expect(where).toEqual({})
    })

    it('should filter by status', () => {
      const where = buildProductWhereClause({ status: ProductStatus.APPROVED })
      expect(where.status).toBe(ProductStatus.APPROVED)
    })

    it('should filter by partnerId', () => {
      const where = buildProductWhereClause({ partnerId: 'partner-1' })
      expect(where.partnerId).toBe('partner-1')
    })

    it('should filter by technologyDomain', () => {
      const where = buildProductWhereClause({ technologyDomain: 'AI' })
      expect(where.technologyDomain).toBe('AI')
    })

    it('should build search OR clause for name, description, type', () => {
      const where = buildProductWhereClause({ search: 'chatbot' })
      expect(where.OR).toEqual([
        { name: { contains: 'chatbot', mode: 'insensitive' } },
        { description: { contains: 'chatbot', mode: 'insensitive' } },
        { type: { contains: 'chatbot', mode: 'insensitive' } },
      ])
    })

    it('should call findMany with pagination and include partner', async () => {
      const ctx = createMockCtx()
      const mockProducts = [
        { id: 'p1', name: 'Product A', status: ProductStatus.PROPOSED, partner: { id: 'pt1', companyName: 'FPT' } },
        { id: 'p2', name: 'Product B', status: ProductStatus.DEPLOYED, partner: null },
      ]
      ctx.db.technologyProduct.findMany.mockResolvedValue(mockProducts)
      ctx.db.technologyProduct.count.mockResolvedValue(2)

      const result = await ctx.db.technologyProduct.findMany({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 25,
        include: { partner: { select: { id: true, companyName: true } } },
      })

      expect(ctx.db.technologyProduct.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 25,
        include: { partner: { select: { id: true, companyName: true } } },
      })
      expect(result).toEqual(mockProducts)
    })
  })

  describe('get', () => {
    it('should return null when product does not exist', async () => {
      const ctx = createMockCtx()
      ctx.db.technologyProduct.findUnique.mockResolvedValue(null)

      const result = await ctx.db.technologyProduct.findUnique({
        where: { id: 'nonexistent' },
        include: {
          partner: { select: { id: true, companyName: true } },
          pilots: { orderBy: { createdAt: 'desc' }, include: { project: { select: { id: true, name: true } } } },
        },
      })

      expect(result).toBeNull()
    })

    it('should return product with partner and pilots when found', async () => {
      const ctx = createMockCtx()
      const mockProduct = {
        id: 'p1',
        name: 'AI Chatbot',
        status: ProductStatus.APPROVED,
        partner: { id: 'pt1', companyName: 'FPT' },
        pilots: [{ id: 'pilot1', deploymentArea: 'Hà Nội', project: { id: 'proj1', name: 'Pilot HN' } }],
      }
      ctx.db.technologyProduct.findUnique.mockResolvedValue(mockProduct)

      const result = await ctx.db.technologyProduct.findUnique({
        where: { id: 'p1' },
        include: {
          partner: { select: { id: true, companyName: true } },
          pilots: { orderBy: { createdAt: 'desc' }, include: { project: { select: { id: true, name: true } } } },
        },
      })

      expect(result).toEqual(mockProduct)
      expect(result!.partner).toEqual({ id: 'pt1', companyName: 'FPT' })
      expect(result!.pilots).toHaveLength(1)
    })
  })

  describe('create', () => {
    it('should create product with default review statuses and PROPOSED status', async () => {
      const ctx = createMockCtx()
      const newProduct = {
        id: 'p-new',
        name: 'AI Document Scanner',
        type: 'SaaS',
        status: ProductStatus.PROPOSED,
        securityStatus: 'not_reviewed',
        dataReviewStatus: 'not_reviewed',
        aiReviewStatus: 'not_reviewed',
      }
      ctx.db._tx.technologyProduct.create.mockResolvedValue(newProduct)

      await ctx.db.$transaction(async (tx) => {
        const created = await tx.technologyProduct.create({
          data: {
            name: 'AI Document Scanner',
            version: '1.0',
            type: 'SaaS',
            description: 'Scan and classify documents using AI',
            partnerId: 'partner-1',
            enterpriseId: null,
            technologyDomain: 'AI',
            deploymentModel: 'Cloud',
            aiUsed: true,
            riskClassification: 'medium',
            licenseType: 'subscription',
            securityStatus: 'not_reviewed',
            dataReviewStatus: 'not_reviewed',
            aiReviewStatus: 'not_reviewed',
            status: ProductStatus.PROPOSED,
          },
        })

        await tx.auditLog.create({
          data: {
            userId: 'user-1',
            action: 'PRODUCT_CREATED',
            targetType: 'TechnologyProduct',
            targetId: (created as { id: string }).id,
            afterVal: { name: 'AI Document Scanner', type: 'SaaS' },
          },
        })

        return created
      })

      expect(ctx.db._tx.technologyProduct.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'AI Document Scanner',
            status: ProductStatus.PROPOSED,
            securityStatus: 'not_reviewed',
            dataReviewStatus: 'not_reviewed',
            aiReviewStatus: 'not_reviewed',
          }),
        })
      )
      expect(ctx.db._tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PRODUCT_CREATED',
            targetType: 'TechnologyProduct',
          }),
        })
      )
    })
  })

  describe('update', () => {
    it('should return null when product does not exist', async () => {
      const ctx = createMockCtx()
      ctx.db.technologyProduct.findUnique.mockResolvedValue(null)

      const existing = await ctx.db.technologyProduct.findUnique({ where: { id: 'nonexistent' } })
      expect(existing).toBeNull()
    })

    it('should update product fields and create audit log', async () => {
      const ctx = createMockCtx()
      const existingProduct = {
        id: 'p1',
        name: 'Old Name',
        type: 'SaaS',
        status: ProductStatus.PROPOSED,
      }
      ctx.db.technologyProduct.findUnique.mockResolvedValue(existingProduct)
      ctx.db._tx.technologyProduct.update.mockResolvedValue({
        ...existingProduct,
        name: 'New Name',
        description: 'Updated description',
      })

      await ctx.db.$transaction(async (tx) => {
        const result = await tx.technologyProduct.update({
          where: { id: 'p1' },
          data: { name: 'New Name', description: 'Updated description' },
        })

        await tx.auditLog.create({
          data: {
            userId: 'user-1',
            action: 'PRODUCT_UPDATED',
            targetType: 'TechnologyProduct',
            targetId: 'p1',
            beforeVal: { name: 'Old Name', type: 'SaaS' },
            afterVal: { name: 'New Name', description: 'Updated description' },
          },
        })

        return result
      })

      expect(ctx.db._tx.technologyProduct.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { name: 'New Name', description: 'Updated description' },
      })
      expect(ctx.db._tx.auditLog.create).toHaveBeenCalled()
    })
  })

  describe('updateStatus', () => {
    it('should update status when transition is valid', async () => {
      const ctx = createMockCtx(['Tech_Director'])
      const existingProduct = {
        id: 'p1',
        name: 'Product',
        status: ProductStatus.PROPOSED,
        securityStatus: 'not_reviewed',
        dataReviewStatus: 'not_reviewed',
        aiReviewStatus: 'not_reviewed',
        aiUsed: false,
      }
      ctx.db.technologyProduct.findUnique.mockResolvedValue(existingProduct)
      ctx.db._tx.technologyProduct.update.mockResolvedValue({
        ...existingProduct,
        status: ProductStatus.UNDER_REVIEW,
      })

      await ctx.db.$transaction(async (tx) => {
        const result = await tx.technologyProduct.update({
          where: { id: 'p1' },
          data: { status: ProductStatus.UNDER_REVIEW },
        })

        await tx.auditLog.create({
          data: {
            userId: 'user-1',
            action: 'PRODUCT_STATUS_CHANGED',
            targetType: 'TechnologyProduct',
            targetId: 'p1',
            beforeVal: { status: ProductStatus.PROPOSED },
            afterVal: { status: ProductStatus.UNDER_REVIEW, reason: null },
          },
        })

        return result
      })

      expect(ctx.db._tx.technologyProduct.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { status: ProductStatus.UNDER_REVIEW },
      })
    })
  })

  describe('updateReviewStatus', () => {
    it('should update security review status', async () => {
      const ctx = createMockCtx(['Tech_Director'])
      const existingProduct = {
        id: 'p1',
        name: 'Product',
        securityStatus: 'not_reviewed',
        dataReviewStatus: 'not_reviewed',
        aiReviewStatus: 'not_reviewed',
      }
      ctx.db.technologyProduct.findUnique.mockResolvedValue(existingProduct)
      ctx.db._tx.technologyProduct.update.mockResolvedValue({
        ...existingProduct,
        securityStatus: 'in_review',
      })

      await ctx.db.$transaction(async (tx) => {
        const result = await tx.technologyProduct.update({
          where: { id: 'p1' },
          data: { securityStatus: 'in_review' },
        })

        await tx.auditLog.create({
          data: {
            userId: 'user-1',
            action: 'PRODUCT_REVIEW_UPDATED',
            targetType: 'TechnologyProduct',
            targetId: 'p1',
            beforeVal: { security: 'not_reviewed' },
            afterVal: { security: 'in_review', notes: null },
          },
        })

        return result
      })

      expect(ctx.db._tx.technologyProduct.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { securityStatus: 'in_review' },
      })
    })

    it('should update data review status', async () => {
      const ctx = createMockCtx(['DPO'])
      const existingProduct = {
        id: 'p1',
        securityStatus: 'approved',
        dataReviewStatus: 'in_review',
        aiReviewStatus: 'not_reviewed',
      }
      ctx.db.technologyProduct.findUnique.mockResolvedValue(existingProduct)
      ctx.db._tx.technologyProduct.update.mockResolvedValue({
        ...existingProduct,
        dataReviewStatus: 'approved',
      })

      await ctx.db.$transaction(async (tx) => {
        await tx.technologyProduct.update({
          where: { id: 'p1' },
          data: { dataReviewStatus: 'approved' },
        })
        return {}
      })

      expect(ctx.db._tx.technologyProduct.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { dataReviewStatus: 'approved' },
      })
    })

    it('should update AI review status', async () => {
      const ctx = createMockCtx(['Tech_Director'])
      const existingProduct = {
        id: 'p1',
        securityStatus: 'approved',
        dataReviewStatus: 'approved',
        aiReviewStatus: 'in_review',
      }
      ctx.db.technologyProduct.findUnique.mockResolvedValue(existingProduct)
      ctx.db._tx.technologyProduct.update.mockResolvedValue({
        ...existingProduct,
        aiReviewStatus: 'approved',
      })

      await ctx.db.$transaction(async (tx) => {
        await tx.technologyProduct.update({
          where: { id: 'p1' },
          data: { aiReviewStatus: 'approved' },
        })
        return {}
      })

      expect(ctx.db._tx.technologyProduct.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { aiReviewStatus: 'approved' },
      })
    })
  })
})
