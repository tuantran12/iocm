import { type PrismaClient, RiskRating } from '@prisma/client'

/**
 * Tần suất review theo risk rating (tháng).
 * R1: 24 tháng, R2: 12 tháng, R3: 6 tháng, R4: 3 tháng, R5: 1 tháng
 */
export const REVIEW_FREQUENCY_MONTHS: Record<RiskRating, number> = {
  R1: 24,
  R2: 12,
  R3: 6,
  R4: 3,
  R5: 1,
}

export interface PartnerReviewAlert {
  partnerId: string
  companyName: string
  riskRating: RiskRating
  alertType: 'OVERDUE' | 'APPROACHING'
  daysOverdue?: number
  daysUntilDue?: number
  nextReviewDate: Date | null
}

export interface PartnerReviewCheckResult {
  alerts: PartnerReviewAlert[]
  notificationsCreated: number
}

/**
 * Kiểm tra đối tác cần review dựa trên nextReview từ DueDiligence gần nhất.
 * - Nếu nextReview đã qua → OVERDUE
 * - Nếu nextReview trong vòng 30 ngày tới → APPROACHING
 * - Tạo notification cho Partnership_Manager
 */
export async function checkPartnerReviews(
  db: PrismaClient,
  warningDays = 30
): Promise<PartnerReviewCheckResult> {
  const now = new Date()
  const alerts: PartnerReviewAlert[] = []
  let notificationsCreated = 0

  // Lấy tất cả partners có risk rating
  const partners = await db.technologyPartner.findMany({
    where: {
      riskRating: { not: null },
    },
    include: {
      dueDiligences: {
        orderBy: { reviewDate: 'desc' },
        take: 1,
      },
    },
  })

  for (const partner of partners) {
    const latestDD = partner.dueDiligences[0]
    if (!latestDD) continue

    const nextReview = latestDD.nextReview
    if (!nextReview) continue

    const diffMs = nextReview.getTime() - now.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      // Overdue
      alerts.push({
        partnerId: partner.id,
        companyName: partner.companyName,
        riskRating: partner.riskRating!,
        alertType: 'OVERDUE',
        daysOverdue: Math.abs(diffDays),
        nextReviewDate: nextReview,
      })
    } else if (diffDays <= warningDays) {
      // Approaching
      alerts.push({
        partnerId: partner.id,
        companyName: partner.companyName,
        riskRating: partner.riskRating!,
        alertType: 'APPROACHING',
        daysUntilDue: diffDays,
        nextReviewDate: nextReview,
      })
    }
  }

  // Tạo notifications cho Partnership_Manager
  if (alerts.length > 0) {
    const managerRoles = await db.userRole.findMany({
      where: {
        role: { name: 'Partnership_Manager' },
      },
      select: { userId: true },
    })

    const managerIds = [...new Set(managerRoles.map((r) => r.userId))]

    for (const userId of managerIds) {
      for (const alert of alerts) {
        const { title, message, link } = buildNotificationContent(alert)

        await db.notification.create({
          data: {
            userId,
            type: `PARTNER_REVIEW_${alert.alertType}`,
            title,
            message,
            link,
            read: false,
          },
        })
        notificationsCreated++
      }
    }
  }

  return { alerts, notificationsCreated }
}

/**
 * Tạo nội dung notification bằng tiếng Việt.
 */
function buildNotificationContent(alert: PartnerReviewAlert): {
  title: string
  message: string
  link: string
} {
  switch (alert.alertType) {
    case 'OVERDUE':
      return {
        title: 'Đối tác quá hạn review',
        message: `"${alert.companyName}" (${alert.riskRating}) đã quá hạn review ${alert.daysOverdue} ngày. Vui lòng lên lịch thẩm định lại.`,
        link: `/partners/${alert.partnerId}`,
      }
    case 'APPROACHING':
      return {
        title: 'Đối tác sắp đến hạn review',
        message: `"${alert.companyName}" (${alert.riskRating}) sẽ đến hạn review trong ${alert.daysUntilDue} ngày. Vui lòng chuẩn bị thẩm định.`,
        link: `/partners/${alert.partnerId}`,
      }
  }
}
