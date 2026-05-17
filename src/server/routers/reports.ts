import { z } from 'zod'
import { router, roleProtectedProcedure } from '../trpc'
import { generateImpactReport } from '../services/impact-report'
import type { KPIForReport } from '../services/impact-report'

// Roles allowed to access reports
const REPORT_ROLES = ['Director', 'System_Admin', 'Auditor', 'Finance_Officer']

// ─── Reports Router ───────────────────────────────────────────────────────────

export const reportsRouter = router({
  /**
   * Compliance report — documents grouped by cluster, status, and priority.
   * Returns aggregated data for compliance overview.
   */
  compliance: roleProtectedProcedure(REPORT_ROLES).query(async ({ ctx }) => {
    const [byCluster, byStatus, byPriority, total, approved] = await Promise.all([
      ctx.db.documentItem.groupBy({
        by: ['cluster'],
        _count: { id: true },
      }),
      ctx.db.documentItem.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      ctx.db.documentItem.groupBy({
        by: ['priority'],
        _count: { id: true },
      }),
      ctx.db.documentItem.count(),
      ctx.db.documentItem.count({ where: { status: 'APPROVED' } }),
    ])

    // For each cluster, get approved count
    const clusterApproved = await ctx.db.documentItem.groupBy({
      by: ['cluster'],
      where: { status: 'APPROVED' },
      _count: { id: true },
    })
    const approvedMap = Object.fromEntries(
      clusterApproved.map((c) => [c.cluster, c._count.id])
    )

    // For each cluster, get pending count (IN_REVIEW + PENDING_APPROVAL)
    const clusterPending = await ctx.db.documentItem.groupBy({
      by: ['cluster'],
      where: { status: { in: ['IN_REVIEW', 'PENDING_APPROVAL'] } },
      _count: { id: true },
    })
    const pendingMap = Object.fromEntries(
      clusterPending.map((c) => [c.cluster, c._count.id])
    )

    const overallCompletionPct =
      total > 0 ? Math.round((approved / total) * 100) : 0

    return {
      byCluster: byCluster.map((c) => ({
        cluster: c.cluster,
        total: c._count.id,
        approved: approvedMap[c.cluster] ?? 0,
        pending: pendingMap[c.cluster] ?? 0,
      })),
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count.id,
      })),
      byPriority: byPriority.map((p) => ({
        priority: p.priority,
        count: p._count.id,
      })),
      overallCompletionPct,
    }
  }),

  /**
   * Membership report — members grouped by tier, status, and fee status.
   * Returns tier distribution, status breakdown, and fee summary.
   */
  membership: roleProtectedProcedure(REPORT_ROLES).query(async ({ ctx }) => {
    const [byStatus, feesPaid, feesOverdue, feesWaived] = await Promise.all([
      ctx.db.enterpriseMember.groupBy({
        by: ['membershipStatus'],
        _count: { id: true },
      }),
      ctx.db.membershipFee.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { amountPaid: true },
      }),
      ctx.db.membershipFee.aggregate({
        where: { paymentStatus: 'OVERDUE' },
        _sum: { amountDue: true },
      }),
      ctx.db.membershipFee.count({
        where: { waiverStatus: true },
      }),
    ])

    // Get members by tier with tier names
    const byTierRaw = await ctx.db.enterpriseMember.groupBy({
      by: ['membershipTierId'],
      _count: { id: true },
    })

    const tierIds = byTierRaw.map((t) => t.membershipTierId)
    const tiers = tierIds.length > 0
      ? await ctx.db.membershipTier.findMany({
          where: { id: { in: tierIds } },
          select: { id: true, name: true },
        })
      : []
    const tierNameMap = Object.fromEntries(tiers.map((t) => [t.id, t.name]))

    return {
      byTier: byTierRaw.map((t) => ({
        tierId: t.membershipTierId,
        tierName: tierNameMap[t.membershipTierId] ?? t.membershipTierId,
        count: t._count.id,
      })),
      byStatus: byStatus.map((s) => ({
        status: s.membershipStatus,
        count: s._count.id,
      })),
      feesSummary: {
        collected: Number(feesPaid._sum.amountPaid ?? 0),
        overdue: Number(feesOverdue._sum.amountDue ?? 0),
        waived: feesWaived,
      },
    }
  }),

  /**
   * Project/Impact report — generates impact report for a specific project,
   * or aggregates across all active projects if no projectId is provided.
   * Reuses the existing generateImpactReport service.
   */
  projectImpact: roleProtectedProcedure(REPORT_ROLES)
    .input(
      z.object({
        projectId: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const projectId = input?.projectId

      if (projectId) {
        // Single project report
        const project = await ctx.db.project.findUnique({
          where: { id: projectId },
          select: { id: true, name: true },
        })

        if (!project) {
          return { projects: [], aggregate: null }
        }

        const kpis = await ctx.db.kPIMetric.findMany({
          where: { projectId },
        })

        const kpisForReport: KPIForReport[] = kpis.map((k) => ({
          id: k.id,
          projectId: k.projectId,
          name: k.name,
          type: k.type,
          unit: k.unit,
          direction: k.direction,
          baselineValue: k.baselineValue,
          targetValue: k.targetValue,
          currentValue: k.currentValue,
          dataSource: k.dataSource,
          frequency: k.frequency,
          responsible: k.responsible,
          evidenceUrl: k.evidenceUrl,
          lastMeasured: k.lastMeasured,
        }))

        const report = generateImpactReport(project, kpisForReport)
        return { projects: [report], aggregate: null }
      }

      // Aggregate across all active projects
      const activeProjects = await ctx.db.project.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
      })

      if (activeProjects.length === 0) {
        return { projects: [], aggregate: { totalProjects: 0, avgScore: null } }
      }

      const allKpis = await ctx.db.kPIMetric.findMany({
        where: { projectId: { in: activeProjects.map((p) => p.id) } },
      })

      // Group KPIs by project
      const kpisByProject = new Map<string, typeof allKpis>()
      for (const kpi of allKpis) {
        const existing = kpisByProject.get(kpi.projectId) ?? []
        existing.push(kpi)
        kpisByProject.set(kpi.projectId, existing)
      }

      const reports = activeProjects.map((project) => {
        const projectKpis = kpisByProject.get(project.id) ?? []
        const kpisForReport: KPIForReport[] = projectKpis.map((k) => ({
          id: k.id,
          projectId: k.projectId,
          name: k.name,
          type: k.type,
          unit: k.unit,
          direction: k.direction,
          baselineValue: k.baselineValue,
          targetValue: k.targetValue,
          currentValue: k.currentValue,
          dataSource: k.dataSource,
          frequency: k.frequency,
          responsible: k.responsible,
          evidenceUrl: k.evidenceUrl,
          lastMeasured: k.lastMeasured,
        }))
        return generateImpactReport(project, kpisForReport)
      })

      // Aggregate score across projects
      const scores = reports
        .map((r) => r.overallScore)
        .filter((s): s is number => s != null)
      const avgScore = scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null

      return {
        projects: reports,
        aggregate: {
          totalProjects: activeProjects.length,
          avgScore,
        },
      }
    }),
})
