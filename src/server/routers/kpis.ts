import { z } from 'zod'
import { KPIType } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { router, roleProtectedProcedure } from '../trpc'
import { isKPIOffTrack, getKPIAlertInfo, DEFAULT_OFF_TRACK_THRESHOLD } from '../services/kpi-alerts'
import { generateImpactReport } from '../services/impact-report'

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const kpiTypeEnum = z.nativeEnum(KPIType)

const createKPIInput = z.object({
  projectId: z.string().min(1, 'Mã dự án không được để trống'),
  name: z.string().min(1, 'Tên KPI không được để trống'),
  type: kpiTypeEnum,
  unit: z.string().optional().nullable(),
  direction: z.string().default('increase_is_good'),
  baselineValue: z.number().optional().nullable(),
  targetValue: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  dataSource: z.string().optional().nullable(),
  frequency: z.string().optional().nullable(),
  responsible: z.string().optional().nullable(),
  evidenceUrl: z.string().optional().nullable(),
})

const updateKPIInput = z.object({
  id: z.string(),
  name: z.string().min(1, 'Tên KPI không được để trống').optional(),
  type: kpiTypeEnum.optional(),
  unit: z.string().optional().nullable(),
  direction: z.string().optional(),
  baselineValue: z.number().optional().nullable(),
  targetValue: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  dataSource: z.string().optional().nullable(),
  frequency: z.string().optional().nullable(),
  responsible: z.string().optional().nullable(),
  evidenceUrl: z.string().optional().nullable(),
})

const measureInput = z.object({
  id: z.string(),
  actual: z.number({ required_error: 'Giá trị đo lường không được để trống' }),
  evidenceUrl: z.string().optional().nullable(),
})

// ─── Achievement Calculation ──────────────────────────────────────────────────

/**
 * Calculate achievement percentage based on target, actual, and direction.
 * - direction='increase_is_good': achievement = (actual / target) * 100
 * - direction='decrease_is_good': achievement = (target / actual) * 100
 * - direction='maintain': achievement = 100 - abs(actual - target) / target * 100
 *
 * Returns null if target or actual is missing/zero (where division would fail).
 */
export function calculateAchievement(
  target: number | null | undefined,
  actual: number | null | undefined,
  direction: string
): number | null {
  if (target == null || actual == null || target === 0) {
    return null
  }

  switch (direction) {
    case 'increase_is_good':
      return (actual / target) * 100

    case 'decrease_is_good':
      if (actual === 0) return target > 0 ? Infinity : null
      return (target / actual) * 100

    case 'maintain':
      return 100 - (Math.abs(actual - target) / target) * 100

    default:
      // Default to increase_is_good
      return (actual / target) * 100
  }
}

// ─── KPIs Router ──────────────────────────────────────────────────────────────

export const kpisRouter = router({
  /**
   * List KPIs for a project with optional type filter.
   */
  list: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({
      projectId: z.string(),
      type: kpiTypeEnum.optional(),
    }))
    .query(async ({ input, ctx }) => {
      const where: Record<string, unknown> = { projectId: input.projectId }

      if (input.type) {
        where.type = input.type
      }

      const kpis = await ctx.db.kPIMetric.findMany({
        where,
        orderBy: { type: 'asc' },
      })

      return kpis
    }),

  /**
   * Get single KPI by ID.
   */
  get: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const kpi = await ctx.db.kPIMetric.findUnique({
        where: { id: input.id },
        include: {
          project: { select: { id: true, name: true, status: true } },
        },
      })
      if (!kpi) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KPI không tồn tại' })
      }
      return kpi
    }),

  /**
   * Create a new KPI for a project.
   */
  create: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(createKPIInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      // Verify project exists
      const project = await ctx.db.project.findUnique({ where: { id: input.projectId } })
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dự án không tồn tại' })
      }

      const kpi = await ctx.db.$transaction(async (tx) => {
        const created = await tx.kPIMetric.create({
          data: {
            projectId: input.projectId,
            name: input.name,
            type: input.type,
            unit: input.unit ?? null,
            direction: input.direction,
            baselineValue: input.baselineValue ?? null,
            targetValue: input.targetValue ?? null,
            currentValue: input.currentValue ?? null,
            dataSource: input.dataSource ?? null,
            frequency: input.frequency ?? null,
            responsible: input.responsible ?? null,
            evidenceUrl: input.evidenceUrl ?? null,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'KPI_CREATED',
            targetType: 'KPIMetric',
            targetId: created.id,
            afterVal: { name: input.name, type: input.type, projectId: input.projectId },
          },
        })

        return created
      })

      return kpi
    }),

  /**
   * Update KPI fields.
   */
  update: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(updateKPIInput)
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input
      const userId = ctx.session.user.id

      const existing = await ctx.db.kPIMetric.findUnique({ where: { id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KPI không tồn tại' })
      }

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.kPIMetric.update({
          where: { id },
          data: updateData,
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'KPI_UPDATED',
            targetType: 'KPIMetric',
            targetId: id,
            beforeVal: { name: existing.name, type: existing.type, targetValue: existing.targetValue },
            afterVal: updateData,
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Delete a KPI.
   */
  delete: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.kPIMetric.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KPI không tồn tại' })
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.kPIMetric.delete({ where: { id: input.id } })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'KPI_DELETED',
            targetType: 'KPIMetric',
            targetId: input.id,
            beforeVal: { name: existing.name, type: existing.type, projectId: existing.projectId },
          },
        })
      })

      return { success: true }
    }),

  /**
   * Record a measurement — updates currentValue and lastMeasured timestamp.
   */
  measure: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(measureInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      const existing = await ctx.db.kPIMetric.findUnique({ where: { id: input.id } })
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KPI không tồn tại' })
      }

      const now = new Date()

      const updated = await ctx.db.$transaction(async (tx) => {
        const result = await tx.kPIMetric.update({
          where: { id: input.id },
          data: {
            currentValue: input.actual,
            lastMeasured: now,
            evidenceUrl: input.evidenceUrl ?? existing.evidenceUrl,
          },
        })

        await tx.auditLog.create({
          data: {
            userId,
            action: 'KPI_MEASURED',
            targetType: 'KPIMetric',
            targetId: input.id,
            beforeVal: { currentValue: existing.currentValue, lastMeasured: existing.lastMeasured },
            afterVal: { currentValue: input.actual, lastMeasured: now.toISOString() },
          },
        })

        return result
      })

      return updated
    }),

  /**
   * Calculate achievement percentage for a KPI based on target, actual, and direction.
   * Returns the KPI data along with the calculated achievement percentage.
   */
  calculateAchievement: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const kpi = await ctx.db.kPIMetric.findUnique({ where: { id: input.id } })
      if (!kpi) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'KPI không tồn tại' })
      }

      const achievement = calculateAchievement(
        kpi.targetValue,
        kpi.currentValue,
        kpi.direction
      )

      return {
        ...kpi,
        achievement,
      }
    }),

  /**
   * List off-track KPIs for a project.
   * Returns KPIs with achievement below threshold (default 70%) along with alert info.
   */
  listOffTrack: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({
      projectId: z.string(),
      threshold: z.number().min(0).max(100).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const threshold = input.threshold ?? DEFAULT_OFF_TRACK_THRESHOLD

      // Verify project exists
      const project = await ctx.db.project.findUnique({ where: { id: input.projectId } })
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dự án không tồn tại' })
      }

      const kpis = await ctx.db.kPIMetric.findMany({
        where: { projectId: input.projectId },
        orderBy: { type: 'asc' },
      })

      const offTrackKPIs = kpis
        .filter((kpi) => isKPIOffTrack(kpi, threshold))
        .map((kpi) => ({
          ...kpi,
          alert: getKPIAlertInfo(kpi),
        }))

      return offTrackKPIs
    }),

  /**
   * Generate impact report for a project.
   * Aggregates all KPI data into a structured report with overall score and breakdown by type.
   */
  generateReport: roleProtectedProcedure(['Project_Manager', 'Tech_Director', 'Director', 'System_Admin'])
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true },
      })
      if (!project) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dự án không tồn tại' })
      }

      const kpis = await ctx.db.kPIMetric.findMany({
        where: { projectId: input.projectId },
        orderBy: { type: 'asc' },
      })

      return generateImpactReport(project, kpis)
    }),
})
