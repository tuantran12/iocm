import { z } from 'zod'
import { RiskRating } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'
import { calculateOverallScore, calculateRiskRating } from '../services/due-diligence-scoring'
import { checkPartnerReviews } from '../services/partner-review-reminders'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const riskRatingEnum = z.nativeEnum(RiskRating)

const createPartnerInput = z.object({
  companyName: z.string().min(1, 'Tên công ty không được để trống'),
  enterpriseId: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
  legalRepresentative: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  technologyDomains: z.array(z.string()).optional(),
  coreProducts: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  relationshipStatus: z.string().optional(),
})

const updatePartnerInput = z.object({
  id: z.string(),
  companyName: z.string().min(1).optional(),
  enterpriseId: z.string().optional().nullable(),
  taxCode: z.string().optional().nullable(),
  legalRepresentative: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  technologyDomains: z.array(z.string()).optional(),
  coreProducts: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  relationshipStatus: z.string().optional(),
})

const createDueDiligenceInput = z.object({
  partnerId: z.string().min(1, 'Partner ID không được để trống'),
  reviewDate: z.coerce.date(),
  reviewers: z.any(),
  legalScore: z.number().int().min(0).max(100).optional().nullable(),
  technicalScore: z.number().int().min(0).max(100).optional().nullable(),
  securityScore: z.number().int().min(0).max(100).optional().nullable(),
  dataScore: z.number().int().min(0).max(100).optional().nullable(),
  aiScore: z.number().int().min(0).max(100).optional().nullable(),
  overallScore: z.number().int().min(0).max(100).optional().nullable(),
  riskRating: riskRatingEnum.optional().nullable(),
  decision: z.string().optional().nullable(),
  conditions: z.string().optional().nullable(),
  nextReview: z.coerce.date().optional().nullable(),
})

// ─── Partners Router ──────────────────────────────────────────────────────────

export const partnersRouter = router({
  /**
   * List technology partners with filtering, search, and pagination.
   * Roles: Partnership_Manager, Tech_Director, Director, System_Admin
   */
  list: roleProtectedProcedure(['Partnership_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({
      // Filters
      riskRating: riskRatingEnum.optional(),
      relationshipStatus: z.string().optional(),
      technologyDomain: z.string().optional(),
      search: z.string().optional(),
      // Pagination
      page: z.number().int().min(0).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      // Sort
      sortField: z.string().optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const {
        riskRating,
        relationshipStatus,
        technologyDomain,
        search,
        page = 0,
        pageSize = 25,
        sortField = 'createdAt',
        sortDirection = 'desc',
      } = input ?? {}

      const where: Record<string, unknown> = {}

      if (riskRating) where.riskRating = riskRating
      if (relationshipStatus) where.relationshipStatus = relationshipStatus
      if (technologyDomain) {
        where.technologyDomains = { has: technologyDomain }
      }

      if (search) {
        where.OR = [
          { companyName: { contains: search, mode: 'insensitive' } },
          { taxCode: { contains: search, mode: 'insensitive' } },
          { legalRepresentative: { contains: search, mode: 'insensitive' } },
        ]
      }

      const allowedSortFields = [
        'companyName', 'riskRating', 'relationshipStatus',
        'lastReviewDate', 'createdAt',
      ]
      const orderBy: Record<string, string> = {}
      if (sortField && allowedSortFields.includes(sortField)) {
        orderBy[sortField] = sortDirection ?? 'desc'
      } else {
        orderBy.createdAt = 'desc'
      }

      const [items, total] = await Promise.all([
        ctx.db.technologyPartner.findMany({
          where,
          orderBy,
          skip: page * pageSize,
          take: pageSize,
        }),
        ctx.db.technologyPartner.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Get single partner by ID with due diligences, agreements, products.
   * Roles: Partnership_Manager, Tech_Director, Director, System_Admin
   */
  get: roleProtectedProcedure(['Partnership_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const partner = await ctx.db.technologyPartner.findUnique({
        where: { id: input.id },
        include: {
          dueDiligences: { orderBy: { reviewDate: 'desc' } },
          agreements: { orderBy: { createdAt: 'desc' } },
          products: { orderBy: { createdAt: 'desc' } },
        },
      })
      if (!partner) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Đối tác công nghệ không tồn tại' })
      }
      return partner
    }),

  /**
   * Create new technology partner profile.
   * Roles: Partnership_Manager, Tech_Director, Director, System_Admin
   */
  create: roleProtectedProcedure(['Partnership_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(createPartnerInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const partner = await ctx.db.$transaction(async (tx) => {
        const created = await tx.technologyPartner.create({
          data: {
            companyName: input.companyName,
            enterpriseId: input.enterpriseId ?? null,
            taxCode: input.taxCode ?? null,
            legalRepresentative: input.legalRepresentative ?? null,
            address: input.address ?? null,
            technologyDomains: input.technologyDomains ?? [],
            coreProducts: input.coreProducts ?? [],
            certifications: input.certifications ?? [],
            relationshipStatus: input.relationshipStatus ?? 'new',
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PARTNER_CREATED',
            targetType: 'TechnologyPartner',
            targetId: created.id,
            afterVal: { companyName: input.companyName },
          },
        })

        return created
      })

      return partner
    }),

  /**
   * Update partner fields.
   * Roles: Partnership_Manager, Tech_Director, Director, System_Admin
   */
  update: roleProtectedProcedure(['Partnership_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(updatePartnerInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.technologyPartner.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Đối tác công nghệ không tồn tại' })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.technologyPartner.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PARTNER_UPDATED',
            targetType: 'TechnologyPartner',
            targetId: id,
            beforeVal: { companyName: existing.companyName, relationshipStatus: existing.relationshipStatus },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Create a due diligence review for a partner.
   * Roles: Legal_Officer, DPO, Tech_Director, Director, System_Admin
   */
  createDueDiligence: roleProtectedProcedure(['Legal_Officer', 'DPO', 'Tech_Director', 'Director', 'System_Admin'])
    .input(createDueDiligenceInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Validate partner exists
      const partner = await ctx.db.technologyPartner.findUnique({
        where: { id: input.partnerId },
      })
      if (!partner) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Đối tác công nghệ không tồn tại' })
      }

      // Auto-calculate overallScore if not explicitly provided
      const computedOverallScore = input.overallScore ?? calculateOverallScore({
        legalScore: input.legalScore,
        technicalScore: input.technicalScore,
        securityScore: input.securityScore,
        dataScore: input.dataScore,
        aiScore: input.aiScore,
      })

      // Auto-calculate riskRating if not explicitly provided
      const computedRiskRating = input.riskRating ??
        (computedOverallScore != null ? calculateRiskRating(computedOverallScore) : null)

      const dueDiligence = await ctx.db.$transaction(async (tx) => {
        const created = await tx.dueDiligence.create({
          data: {
            partnerId: input.partnerId,
            reviewDate: input.reviewDate,
            reviewers: input.reviewers ?? [],
            legalScore: input.legalScore ?? null,
            technicalScore: input.technicalScore ?? null,
            securityScore: input.securityScore ?? null,
            dataScore: input.dataScore ?? null,
            aiScore: input.aiScore ?? null,
            overallScore: computedOverallScore,
            riskRating: computedRiskRating,
            decision: input.decision ?? null,
            conditions: input.conditions ?? null,
            nextReview: input.nextReview ?? null,
          },
        })

        // Update partner's lastReviewDate and riskRating
        const partnerUpdate: Record<string, unknown> = { lastReviewDate: input.reviewDate }
        if (computedRiskRating) {
          partnerUpdate.riskRating = computedRiskRating
        }
        await tx.technologyPartner.update({
          where: { id: input.partnerId },
          data: partnerUpdate,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'DUE_DILIGENCE_CREATED',
            targetType: 'DueDiligence',
            targetId: created.id,
            afterVal: {
              partnerId: input.partnerId,
              overallScore: computedOverallScore,
              riskRating: computedRiskRating,
              decision: input.decision,
            },
          },
        })

        return created
      })

      return dueDiligence
    }),

  /**
   * Update partner's risk rating based on due diligence.
   * Roles: Partnership_Manager, Tech_Director, Director, System_Admin
   */
  updateRiskRating: roleProtectedProcedure(['Partnership_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({
      partnerId: z.string().min(1, 'Partner ID không được để trống'),
      riskRating: riskRatingEnum,
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const partner = await ctx.db.technologyPartner.findUnique({
        where: { id: input.partnerId },
      })
      if (!partner) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Đối tác công nghệ không tồn tại' })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.technologyPartner.update({
          where: { id: input.partnerId },
          data: { riskRating: input.riskRating },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'PARTNER_RISK_RATING_UPDATED',
            targetType: 'TechnologyPartner',
            targetId: input.partnerId,
            beforeVal: { riskRating: partner.riskRating },
            afterVal: { riskRating: input.riskRating, reason: input.reason ?? null },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Trigger partner review reminders check.
   * Finds partners overdue or approaching review, creates notifications.
   * Roles: Partnership_Manager, Tech_Director, Director, System_Admin
   */
  checkReviewReminders: roleProtectedProcedure(['Partnership_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({
      warningDays: z.number().int().min(1).optional(),
    }).optional())
    .mutation(async ({ input, ctx }) => {
      const warningDays = input?.warningDays ?? 30
      return checkPartnerReviews(ctx.db, warningDays)
    }),
})
