import { type PrismaClient } from '@prisma/client'

/**
 * Thresholds for membership agreement expiry alerts (days before expiry).
 * Per requirement R11: alert Legal_Officer 60 and 30 days before expiry.
 */
export const AGREEMENT_EXPIRY_THRESHOLDS = [30, 60] as const

export interface AgreementExpiryAlert {
  agreementId: string
  enterpriseId: string
  enterpriseName: string
  alertType: 'EXPIRING' | 'EXPIRED'
  daysUntilExpiry: number
  expiryDate: Date
}

export interface AgreementExpiryCheckResult {
  alerts: AgreementExpiryAlert[]
  updatedToExpired: number
  notificationsCreated: number
}

/**
 * Run expiry check for all active membership agreements.
 * - Detects agreements that have expired (expiryDate < now, status = "active")
 * - Detects agreements expiring within threshold days
 * - Updates expired agreements status to "expired"
 * - Creates notifications for Legal_Officer (60 and 30 days before expiry)
 */
export async function runAgreementExpiryCheck(
  db: PrismaClient,
  config?: { expiryWarningDays?: number[] }
): Promise<AgreementExpiryCheckResult> {
  const expiryWarningDays = config?.expiryWarningDays ?? [...AGREEMENT_EXPIRY_THRESHOLDS]
  const now = new Date()
  const alerts: AgreementExpiryAlert[] = []
  let updatedToExpired = 0
  let notificationsCreated = 0

  // 1. Find and mark expired agreements (expiryDate < now, status still "active")
  const expiredAgreements = await db.membershipAgreement.findMany({
    where: {
      expiryDate: { lt: now },
      status: 'active',
    },
    include: {
      enterprise: { select: { id: true, legalNameVi: true } },
    },
  })

  for (const agreement of expiredAgreements) {
    await db.membershipAgreement.update({
      where: { id: agreement.id },
      data: { status: 'expired' },
    })
    updatedToExpired++

    alerts.push({
      agreementId: agreement.id,
      enterpriseId: agreement.enterpriseId,
      enterpriseName: agreement.enterprise.legalNameVi,
      alertType: 'EXPIRED',
      daysUntilExpiry: Math.floor(
        (agreement.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      ),
      expiryDate: agreement.expiryDate!,
    })
  }

  // 2. Find agreements expiring within the max threshold
  const maxWarningDays = Math.max(...expiryWarningDays)
  const warningDate = new Date(now.getTime() + maxWarningDays * 24 * 60 * 60 * 1000)

  const expiringAgreements = await db.membershipAgreement.findMany({
    where: {
      expiryDate: { gte: now, lte: warningDate },
      status: 'active',
    },
    include: {
      enterprise: { select: { id: true, legalNameVi: true } },
    },
  })

  for (const agreement of expiringAgreements) {
    const daysUntilExpiry = Math.floor(
      (agreement.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    alerts.push({
      agreementId: agreement.id,
      enterpriseId: agreement.enterpriseId,
      enterpriseName: agreement.enterprise.legalNameVi,
      alertType: 'EXPIRING',
      daysUntilExpiry,
      expiryDate: agreement.expiryDate!,
    })
  }

  // 3. Create notifications for Legal_Officer
  if (alerts.length > 0) {
    const legalOfficerRoles = await db.userRole.findMany({
      where: { role: { name: 'Legal_Officer' } },
      select: { userId: true },
    })
    const legalOfficerIds = [...new Set(legalOfficerRoles.map((r) => r.userId))]

    for (const userId of legalOfficerIds) {
      for (const alert of alerts) {
        const { title, message } = buildAlertContent(alert)

        await db.notification.create({
          data: {
            userId,
            type: `AGREEMENT_${alert.alertType}`,
            title,
            message,
            link: `/members/${alert.enterpriseId}/agreements/${alert.agreementId}`,
            read: false,
          },
        })
        notificationsCreated++
      }
    }
  }

  return { alerts, updatedToExpired, notificationsCreated }
}

/**
 * Get agreements expiring within N days.
 */
export async function getExpiringAgreements(db: PrismaClient, withinDays: number) {
  const now = new Date()
  const deadline = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000)

  return db.membershipAgreement.findMany({
    where: {
      expiryDate: { gte: now, lte: deadline },
      status: 'active',
    },
    include: {
      enterprise: { select: { id: true, legalNameVi: true, legalNameEn: true } },
      tier: { select: { id: true, name: true } },
    },
    orderBy: { expiryDate: 'asc' },
  })
}

function buildAlertContent(alert: AgreementExpiryAlert): { title: string; message: string } {
  if (alert.alertType === 'EXPIRED') {
    return {
      title: 'Thỏa thuận hội viên đã hết hạn',
      message: `Thỏa thuận hội viên của "${alert.enterpriseName}" đã hết hạn. Vui lòng liên hệ doanh nghiệp để gia hạn.`,
    }
  }
  return {
    title: 'Thỏa thuận hội viên sắp hết hạn',
    message: `Thỏa thuận hội viên của "${alert.enterpriseName}" sẽ hết hạn trong ${alert.daysUntilExpiry} ngày. Vui lòng chuẩn bị gia hạn.`,
  }
}
