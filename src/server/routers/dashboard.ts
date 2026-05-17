import { router, protectedProcedure } from '../trpc'

// ─── Dashboard Router ─────────────────────────────────────────────────────────

export const dashboardRouter = router({
  /**
   * Establishment-focused dashboard stats.
   * Returns: readiness score, critical missing items, personnel, dossier, submission status.
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id

    const [
      // Documents readiness
      documentsTotal,
      documentsReady,
      documentsCriticalMissing,
      // Personnel
      personnelTotal,
      personnelEligible,
      // Dossier
      dossier,
      dossierItems,
      // Submissions
      submissions,
      // Institute profile
      profile,
      // Alerts
      unreadNotifications,
      recentAlerts,
    ] = await Promise.all([
      ctx.db.documentItem.count(),
      ctx.db.documentItem.count({
        where: { status: { in: ['APPROVED', 'SIGNED'] } },
      }),
      ctx.db.documentItem.findMany({
        where: {
          cluster: 'CORE_FOUNDING',
          status: { notIn: ['APPROVED', 'SIGNED'] },
          priority: { in: ['CRITICAL', 'HIGH'] },
        },
        select: { id: true, code: true, name: true, status: true, priority: true },
        take: 10,
      }),
      ctx.db.establishmentPersonnel.count(),
      ctx.db.establishmentPersonnel.count({
        where: { matchingExpertise: true, status: { not: 'draft' } },
      }),
      ctx.db.registrationDossier.findFirst({
        orderBy: { createdAt: 'desc' },
      }),
      ctx.db.registrationDossierItem.groupBy({
        by: ['itemStatus'],
        _count: { id: true },
      }),
      ctx.db.submissionRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      ctx.db.instituteProfile.findFirst({
        orderBy: { createdAt: 'asc' },
      }),
      ctx.db.notification.count({
        where: { userId, read: false },
      }),
      ctx.db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ])

    const readinessScore = documentsTotal > 0
      ? Math.round((documentsReady / documentsTotal) * 100)
      : 0

    const dossierStatusMap = Object.fromEntries(
      dossierItems.map((d) => [d.itemStatus, d._count.id])
    )

    return {
      readiness: {
        score: readinessScore,
        documentsReady,
        documentsTotal,
      },
      criticalMissing: documentsCriticalMissing,
      personnel: {
        total: personnelTotal,
        eligible: personnelEligible,
      },
      dossier: {
        current: dossier,
        itemsByStatus: dossierStatusMap,
      },
      submissions,
      profile,
      alerts: {
        unreadCount: unreadNotifications,
        recent: recentAlerts,
      },
    }
  }),
})
