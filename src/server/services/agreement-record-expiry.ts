import { type PrismaClient, AgreementStatus } from '@prisma/client'

/**
 * Default expiry alert thresholds for AgreementRecord (days before expiry).
 */
export const AGREEMENT_RECORD_EXPIRY_THRESHOLDS = [30, 60, 90] as const

export interface AgreementRecordExpiryAlert {
  agreementId: string
  title: string
  type: string
  partyB: string
  alertType: 'EXPIRING' | 'EXPIRED'
  daysUntilExpiry: number
  expiryDate: Date
}

export interface AgreementRecordExpiryResult {
  alerts: AgreementRecordExpiryAlert[]
  updatedToExpiring: number
  updatedToExpired: number
  notificationsCreated: number
}

/**
 * Run expiry check for all active AgreementRecords.
 * - Marks ACTIVE agreements past expiry as EXPIRED
 * - Marks ACTIVE agreements within threshold as EXPIRING
 * - Creates notifications for Legal_Officer
 */
export async function runAgreementRecordExpiryCheck(
  db: PrismaClient,
  config?: { expiryWarningDays?: number[] }
): Promise<AgreementRecordExpiryResult> {
  const expiryWarningDays = config?.expiryWarningDays ?? [...AGREEMENT_RECORD_EXPIRY_THRESHOLDS]
  const now = new Date()
  const alerts: AgreementRecordExpiryAlert[] = []
  let updatedToExpiring = 0
  let updatedToExpired = 0
  let notificationsCreated = 0

  // 1. Find and mark expired agreements (expiryDate < now, status ACTIVE or EXPIRING)
  const expiredAgreements = await db.agreementRecord.findMany({
    where: {
      expiryDate: { lt: now },
      status: { in: [AgreementStatus.ACTIVE, AgreementStatus.EXPIRING] },
    },
  })

  for (const agreement of expiredAgreements) {
    await db.agreementRecord.update({
      where: { id: agreement.id },
      data: { status: AgreementStatus.EXPIRED },
    })
    updatedToExpired++

    alerts.push({
      agreementId: agreement.id,
      title: agreement.title,
      type: agreement.type,
      partyB: agreement.partyB,
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

  const expiringAgreements = await db.agreementRecord.findMany({
    where: {
      expiryDate: { gte: now, lte: warningDate },
      status: AgreementStatus.ACTIVE,
    },
  })

  for (const agreement of expiringAgreements) {
    const daysUntilExpiry = Math.floor(
      (agreement.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    await db.agreementRecord.update({
      where: { id: agreement.id },
      data: { status: AgreementStatus.EXPIRING },
    })
    updatedToExpiring++

    alerts.push({
      agreementId: agreement.id,
      title: agreement.title,
      type: agreement.type,
      partyB: agreement.partyB,
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
            type: `AGREEMENT_RECORD_${alert.alertType}`,
            title,
            message,
            link: `/agreements/${alert.agreementId}`,
            read: false,
          },
        })
        notificationsCreated++
      }
    }
  }

  return { alerts, updatedToExpiring, updatedToExpired, notificationsCreated }
}

function buildAlertContent(alert: AgreementRecordExpiryAlert): { title: string; message: string } {
  if (alert.alertType === 'EXPIRED') {
    return {
      title: 'Hợp đồng/thỏa thuận đã hết hạn',
      message: `"${alert.title}" với "${alert.partyB}" đã hết hạn. Vui lòng xem xét gia hạn hoặc lưu trữ.`,
    }
  }
  return {
    title: 'Hợp đồng/thỏa thuận sắp hết hạn',
    message: `"${alert.title}" với "${alert.partyB}" sẽ hết hạn trong ${alert.daysUntilExpiry} ngày. Vui lòng chuẩn bị gia hạn.`,
  }
}
