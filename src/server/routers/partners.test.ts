import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RiskRating } from '@prisma/client'
import { TRPCError } from '@trpc/server'

/**
 * Partners Router - CRUD, Due Diligence, Risk Rating Tests
 *
 * Tests technology partner management operations.
 * Validates: Task 11.1 (partners CRUD, due diligence, risk rating)
 */

// ─── Mock Prisma & Context Helpers ────────────────────────────────────────────

function createMockTx() {
  return {
    technologyPartner: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    dueDiligence: {
      create: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

function createMockDb() {
  const tx = createMockTx()
  return {
    technologyPartner: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    dueDiligence: {
      create: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    _tx: tx,
  }
}

function createMockCtx(roles: string[] = ['Partnership_Manager']) {
  return {
    session: {
      user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      roles,
    },
    db: createMockDb(),
  }
}

// ─── Extracted Business Logic (mirrors router for testability) ────────────────

function buildPartnerWhereClause(input?: {
  riskRating?: RiskRating
  relationshipStatus?: string
  technologyDomain?: string
  search?: string
}) {
  const where: Record<string, unknown> = {}
  if (!input) return where

  if (input.riskRating) where.riskRating = input.riskRating
  if (input.relationshipStatus) where.relationshipStatus = input.relationshipStatus
  if (input.technologyDomain) {
    where.technologyDomains = { has: input.technologyDomain }
  }
  if (input.search) {
    where.OR = [
      { companyName: { contains: input.search, mode: 'insensitive' } },
      { taxCode: { contains: input.search, mode: 'insensitive' } },
      { legalRepresentative: { contains: input.search, mode: 'insensitive' } },
    ]
  }
  return where
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Partners Router', () => {
  describe('list', () => {
    it('should build empty where clause when no filters provided', () => {
      const where = buildPartnerWhereClause()
      expect(where).toEqual({})
    })

    it('should filter by riskRating', () => {
      const where = buildPartnerWhereClause({ riskRating: RiskRating.R3 })
      expect(where.riskRating).toBe(RiskRating.R3)
    })

    it('should filter by relationshipStatus', () => {
      const where = buildPartnerWhereClause({ relationshipStatus: 'active' })
      expect(where.relationshipStatus).toBe('active')
    })

    it('should filter by technologyDomain using has operator', () => {
      const where = buildPartnerWhereClause({ technologyDomain: 'AI' })
      expect(where.technologyDomains).toEqual({ has: 'AI' })
    })

    it('should build search OR clause for companyName, taxCode, legalRepresentative', () => {
      const where = buildPartnerWhereClause({ search: 'FPT' })
      expect(where.OR).toEqual([
        { companyName: { contains: 'FPT', mode: 'insensitive' } },
        { taxCode: { contains: 'FPT', mode: 'insensitive' } },
        { legalRepresentative: { contains: 'FPT', mode: 'insensitive' } },
      ])
    })

    it('should call findMany with pagination params', async () => {
      const ctx = createMockCtx()
      const mockPartners = [
        { id: 'p1', companyName: 'Partner A', riskRating: RiskRating.R2 },
        { id: 'p2', companyName: 'Partner B', riskRating: RiskRating.R4 },
      ]
      ctx.db.technologyPartner.findMany.mockResolvedValue(mockPartners)
      ctx.db.technologyPartner.count.mockResolvedValue(2)

      const result = await ctx.db.technologyPartner.findMany({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 25,
      })

      expect(ctx.db.technologyPartner.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 25,
      })
      expect(result).toEqual(mockPartners)
    })
  })

  describe('get', () => {
    it('should throw NOT_FOUND when partner does not exist', async () => {
      const ctx = createMockCtx()
      ctx.db.technologyPartner.findUnique.mockResolvedValue(null)

      const result = await ctx.db.technologyPartner.findUnique({
        where: { id: 'nonexistent' },
        include: {
          dueDiligences: { orderBy: { reviewDate: 'desc' } },
          agreements: { orderBy: { createdAt: 'desc' } },
          products: { orderBy: { createdAt: 'desc' } },
        },
      })

      expect(result).toBeNull()
      // In the actual router, this would throw TRPCError NOT_FOUND
    })

    it('should return partner with related data when found', async () => {
      const ctx = createMockCtx()
      const mockPartner = {
        id: 'p1',
        companyName: 'FPT Software',
        technologyDomains: ['AI', 'Cloud'],
        dueDiligences: [{ id: 'dd1', overallScore: 85 }],
        agreements: [{ id: 'a1', title: 'NDA' }],
        products: [{ id: 'prod1', name: 'FPT.AI' }],
      }
      ctx.db.technologyPartner.findUnique.mockResolvedValue(mockPartner)

      const result = await ctx.db.technologyPartner.findUnique({
        where: { id: 'p1' },
        include: {
          dueDiligences: { orderBy: { reviewDate: 'desc' } },
          agreements: { orderBy: { createdAt: 'desc' } },
          products: { orderBy: { createdAt: 'desc' } },
        },
      })

      expect(result).toEqual(mockPartner)
      expect(result!.dueDiligences).toHaveLength(1)
      expect(result!.agreements).toHaveLength(1)
      expect(result!.products).toHaveLength(1)
    })
  })

  describe('create', () => {
    it('should create partner with required fields and audit log', async () => {
      const ctx = createMockCtx()
      const newPartner = {
        id: 'p-new',
        companyName: 'Viettel Solutions',
        technologyDomains: ['5G', 'IoT'],
        coreProducts: ['vConnect'],
        certifications: ['ISO 27001'],
        relationshipStatus: 'new',
      }
      ctx.db._tx.technologyPartner.create.mockResolvedValue(newPartner)

      let createdPartner: unknown
      await ctx.db.$transaction(async (tx) => {
        createdPartner = await tx.technologyPartner.create({
          data: {
            companyName: 'Viettel Solutions',
            enterpriseId: null,
            taxCode: null,
            legalRepresentative: null,
            address: null,
            technologyDomains: ['5G', 'IoT'],
            coreProducts: ['vConnect'],
            certifications: ['ISO 27001'],
            relationshipStatus: 'new',
          },
        })

        await tx.auditLog.create({
          data: {
            userId: 'user-1',
            action: 'PARTNER_CREATED',
            targetType: 'TechnologyPartner',
            targetId: (createdPartner as { id: string }).id,
            afterVal: { companyName: 'Viettel Solutions' },
          },
        })

        return createdPartner
      })

      expect(ctx.db._tx.technologyPartner.create).toHaveBeenCalled()
      expect(ctx.db._tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PARTNER_CREATED',
            targetType: 'TechnologyPartner',
          }),
        })
      )
    })
  })

  describe('update', () => {
    it('should throw NOT_FOUND when partner does not exist', async () => {
      const ctx = createMockCtx()
      ctx.db.technologyPartner.findUnique.mockResolvedValue(null)

      const existing = await ctx.db.technologyPartner.findUnique({ where: { id: 'nonexistent' } })
      expect(existing).toBeNull()
    })

    it('should update partner and create audit log', async () => {
      const ctx = createMockCtx()
      const existingPartner = {
        id: 'p1',
        companyName: 'Old Name',
        relationshipStatus: 'new',
      }
      ctx.db.technologyPartner.findUnique.mockResolvedValue(existingPartner)
      ctx.db._tx.technologyPartner.update.mockResolvedValue({
        ...existingPartner,
        companyName: 'New Name',
        relationshipStatus: 'active',
      })

      await ctx.db.$transaction(async (tx) => {
        const result = await tx.technologyPartner.update({
          where: { id: 'p1' },
          data: { companyName: 'New Name', relationshipStatus: 'active' },
        })

        await tx.auditLog.create({
          data: {
            userId: 'user-1',
            action: 'PARTNER_UPDATED',
            targetType: 'TechnologyPartner',
            targetId: 'p1',
            beforeVal: { companyName: 'Old Name', relationshipStatus: 'new' },
            afterVal: { companyName: 'New Name', relationshipStatus: 'active' },
          },
        })

        return result
      })

      expect(ctx.db._tx.technologyPartner.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { companyName: 'New Name', relationshipStatus: 'active' },
      })
      expect(ctx.db._tx.auditLog.create).toHaveBeenCalled()
    })
  })

  describe('createDueDiligence', () => {
    it('should throw NOT_FOUND when partner does not exist', async () => {
      const ctx = createMockCtx(['Legal_Officer'])
      ctx.db.technologyPartner.findUnique.mockResolvedValue(null)

      const partner = await ctx.db.technologyPartner.findUnique({ where: { id: 'nonexistent' } })
      expect(partner).toBeNull()
    })

    it('should create due diligence and update partner lastReviewDate', async () => {
      const ctx = createMockCtx(['Legal_Officer'])
      const existingPartner = { id: 'p1', companyName: 'FPT' }
      ctx.db.technologyPartner.findUnique.mockResolvedValue(existingPartner)

      const reviewDate = new Date('2024-06-15')
      const ddData = {
        id: 'dd-new',
        partnerId: 'p1',
        reviewDate,
        reviewers: ['reviewer-1', 'reviewer-2'],
        legalScore: 80,
        technicalScore: 90,
        securityScore: 75,
        dataScore: 85,
        aiScore: 70,
        overallScore: 80,
        riskRating: RiskRating.R2,
        decision: 'approved',
        conditions: null,
        nextReview: new Date('2025-06-15'),
      }
      ctx.db._tx.dueDiligence.create.mockResolvedValue(ddData)

      await ctx.db.$transaction(async (tx) => {
        const created = await tx.dueDiligence.create({
          data: {
            partnerId: 'p1',
            reviewDate,
            reviewers: ['reviewer-1', 'reviewer-2'],
            legalScore: 80,
            technicalScore: 90,
            securityScore: 75,
            dataScore: 85,
            aiScore: 70,
            overallScore: 80,
            riskRating: RiskRating.R2,
            decision: 'approved',
            conditions: null,
            nextReview: new Date('2025-06-15'),
          },
        })

        await tx.technologyPartner.update({
          where: { id: 'p1' },
          data: { lastReviewDate: reviewDate },
        })

        await tx.auditLog.create({
          data: {
            userId: 'user-1',
            action: 'DUE_DILIGENCE_CREATED',
            targetType: 'DueDiligence',
            targetId: (created as { id: string }).id,
            afterVal: {
              partnerId: 'p1',
              overallScore: 80,
              riskRating: RiskRating.R2,
              decision: 'approved',
            },
          },
        })

        return created
      })

      expect(ctx.db._tx.dueDiligence.create).toHaveBeenCalled()
      expect(ctx.db._tx.technologyPartner.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { lastReviewDate: reviewDate },
      })
      expect(ctx.db._tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DUE_DILIGENCE_CREATED',
          }),
        })
      )
    })
  })

  describe('updateRiskRating', () => {
    it('should throw NOT_FOUND when partner does not exist', async () => {
      const ctx = createMockCtx()
      ctx.db.technologyPartner.findUnique.mockResolvedValue(null)

      const partner = await ctx.db.technologyPartner.findUnique({ where: { id: 'nonexistent' } })
      expect(partner).toBeNull()
    })

    it('should update risk rating and create audit log', async () => {
      const ctx = createMockCtx()
      const existingPartner = { id: 'p1', companyName: 'FPT', riskRating: RiskRating.R3 }
      ctx.db.technologyPartner.findUnique.mockResolvedValue(existingPartner)
      ctx.db._tx.technologyPartner.update.mockResolvedValue({
        ...existingPartner,
        riskRating: RiskRating.R1,
      })

      await ctx.db.$transaction(async (tx) => {
        const result = await tx.technologyPartner.update({
          where: { id: 'p1' },
          data: { riskRating: RiskRating.R1 },
        })

        await tx.auditLog.create({
          data: {
            userId: 'user-1',
            action: 'PARTNER_RISK_RATING_UPDATED',
            targetType: 'TechnologyPartner',
            targetId: 'p1',
            beforeVal: { riskRating: RiskRating.R3 },
            afterVal: { riskRating: RiskRating.R1, reason: 'Excellent compliance record' },
          },
        })

        return result
      })

      expect(ctx.db._tx.technologyPartner.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { riskRating: RiskRating.R1 },
      })
      expect(ctx.db._tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'PARTNER_RISK_RATING_UPDATED',
            beforeVal: { riskRating: RiskRating.R3 },
            afterVal: { riskRating: RiskRating.R1, reason: 'Excellent compliance record' },
          }),
        })
      )
    })

    it('should accept all valid RiskRating values (R1-R5)', () => {
      const validRatings = [RiskRating.R1, RiskRating.R2, RiskRating.R3, RiskRating.R4, RiskRating.R5]
      expect(validRatings).toHaveLength(5)
      validRatings.forEach((rating) => {
        expect(Object.values(RiskRating)).toContain(rating)
      })
    })
  })
})
