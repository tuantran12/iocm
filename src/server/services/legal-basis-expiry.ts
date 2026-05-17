import { type PrismaClient, LegalStatus } from '@prisma/client'

/**
 * Cấu hình mặc định cho phát hiện hết hạn căn cứ pháp lý.
 */
export const DEFAULT_EXPIRY_THRESHOLDS = [30, 60, 90] as const

export const DEFAULT_VERIFICATION_MAX_DAYS = 180 // 6 tháng không xác minh → cảnh báo

export interface ExpiryCheckConfig {
  /** Số ngày trước khi hết hạn để cảnh báo (mặc định: [30, 60, 90]) */
  expiryWarningDays: number[]
  /** Số ngày tối đa không xác minh trước khi cảnh báo (mặc định: 180) */
  verificationMaxDays: number
}

export interface ExpiryAlert {
  legalBasisId: string
  title: string
  documentNumber: string
  alertType: 'EXPIRING' | 'EXPIRED' | 'VERIFICATION_OVERDUE'
  daysUntilExpiry?: number
  daysSinceVerification?: number
  expiryDate?: Date | null
  lastVerified?: Date | null
}

export interface ExpiryCheckResult {
  alerts: ExpiryAlert[]
  updatedToExpiring: number
  updatedToExpired: number
  notificationsCreated: number
}

/**
 * Chạy kiểm tra hết hạn cho tất cả căn cứ pháp lý.
 * - Phát hiện căn cứ sắp hết hạn (trong threshold ngày)
 * - Phát hiện căn cứ đã hết hạn
 * - Phát hiện căn cứ chưa xác minh quá lâu
 * - Tự động cập nhật status EXPIRING/EXPIRED
 * - Tạo notification cho Legal_Officer
 */
export async function runExpiryCheck(
  db: PrismaClient,
  config?: Partial<ExpiryCheckConfig>
): Promise<ExpiryCheckResult> {
  const expiryWarningDays = config?.expiryWarningDays ?? [...DEFAULT_EXPIRY_THRESHOLDS]
  const verificationMaxDays = config?.verificationMaxDays ?? DEFAULT_VERIFICATION_MAX_DAYS

  const now = new Date()
  const alerts: ExpiryAlert[] = []
  let updatedToExpiring = 0
  let updatedToExpired = 0
  let notificationsCreated = 0

  // Lấy ngưỡng cảnh báo lớn nhất (ví dụ: 90 ngày)
  const maxWarningDays = Math.max(...expiryWarningDays)

  // 1. Phát hiện căn cứ đã hết hạn (expiry_date < now, status chưa phải EXPIRED/SUPERSEDED)
  const expiredBases = await db.legalBasis.findMany({
    where: {
      expiryDate: { lt: now },
      status: { in: [LegalStatus.ACTIVE, LegalStatus.EXPIRING] },
    },
  })

  for (const basis of expiredBases) {
    // Cập nhật status → EXPIRED
    await db.legalBasis.update({
      where: { id: basis.id },
      data: { status: LegalStatus.EXPIRED },
    })
    updatedToExpired++

    alerts.push({
      legalBasisId: basis.id,
      title: basis.title,
      documentNumber: basis.documentNumber,
      alertType: 'EXPIRED',
      expiryDate: basis.expiryDate,
      daysUntilExpiry: basis.expiryDate
        ? Math.floor((basis.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : undefined,
    })
  }

  // 2. Phát hiện căn cứ sắp hết hạn (trong maxWarningDays ngày)
  const warningDate = new Date(now.getTime() + maxWarningDays * 24 * 60 * 60 * 1000)

  const expiringBases = await db.legalBasis.findMany({
    where: {
      expiryDate: { gte: now, lte: warningDate },
      status: LegalStatus.ACTIVE,
    },
  })

  for (const basis of expiringBases) {
    const daysUntilExpiry = Math.floor(
      (basis.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Cập nhật status → EXPIRING
    await db.legalBasis.update({
      where: { id: basis.id },
      data: { status: LegalStatus.EXPIRING },
    })
    updatedToExpiring++

    alerts.push({
      legalBasisId: basis.id,
      title: basis.title,
      documentNumber: basis.documentNumber,
      alertType: 'EXPIRING',
      daysUntilExpiry,
      expiryDate: basis.expiryDate,
    })
  }

  // 3. Phát hiện căn cứ chưa xác minh quá lâu
  const verificationDeadline = new Date(
    now.getTime() - verificationMaxDays * 24 * 60 * 60 * 1000
  )

  const unverifiedBases = await db.legalBasis.findMany({
    where: {
      status: { in: [LegalStatus.ACTIVE, LegalStatus.EXPIRING] },
      OR: [
        { lastVerified: null },
        { lastVerified: { lt: verificationDeadline } },
      ],
    },
  })

  for (const basis of unverifiedBases) {
    const daysSinceVerification = basis.lastVerified
      ? Math.floor((now.getTime() - basis.lastVerified.getTime()) / (1000 * 60 * 60 * 24))
      : null

    alerts.push({
      legalBasisId: basis.id,
      title: basis.title,
      documentNumber: basis.documentNumber,
      alertType: 'VERIFICATION_OVERDUE',
      daysSinceVerification: daysSinceVerification ?? undefined,
      lastVerified: basis.lastVerified,
    })
  }

  // 4. Tạo notifications cho Legal_Officer
  if (alerts.length > 0) {
    // Tìm tất cả user có role Legal_Officer
    const legalOfficerRoles = await db.userRole.findMany({
      where: {
        role: { name: 'Legal_Officer' },
      },
      select: { userId: true },
    })

    const legalOfficerIds = [...new Set(legalOfficerRoles.map((r) => r.userId))]

    for (const userId of legalOfficerIds) {
      for (const alert of alerts) {
        const { title, message, link } = buildNotificationContent(alert)

        await db.notification.create({
          data: {
            userId,
            type: `LEGAL_BASIS_${alert.alertType}`,
            title,
            message,
            link: link,
            read: false,
          },
        })
        notificationsCreated++
      }
    }
  }

  return { alerts, updatedToExpiring, updatedToExpired, notificationsCreated }
}

/**
 * Lấy danh sách căn cứ pháp lý sắp hết hạn trong N ngày.
 */
export async function getExpiringLegalBases(
  db: PrismaClient,
  withinDays: number
) {
  const now = new Date()
  const deadline = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000)

  return db.legalBasis.findMany({
    where: {
      expiryDate: { gte: now, lte: deadline },
      status: { in: [LegalStatus.ACTIVE, LegalStatus.EXPIRING] },
    },
    orderBy: { expiryDate: 'asc' },
  })
}

/**
 * Tạo nội dung notification bằng tiếng Việt.
 */
function buildNotificationContent(alert: ExpiryAlert): {
  title: string
  message: string
  link: string
} {
  switch (alert.alertType) {
    case 'EXPIRED':
      return {
        title: 'Căn cứ pháp lý đã hết hiệu lực',
        message: `"${alert.title}" (${alert.documentNumber}) đã hết hiệu lực. Vui lòng kiểm tra và cập nhật các tài liệu liên quan.`,
        link: `/legal-basis/${alert.legalBasisId}`,
      }
    case 'EXPIRING':
      return {
        title: 'Căn cứ pháp lý sắp hết hiệu lực',
        message: `"${alert.title}" (${alert.documentNumber}) sẽ hết hiệu lực trong ${alert.daysUntilExpiry} ngày. Vui lòng chuẩn bị phương án thay thế.`,
        link: `/legal-basis/${alert.legalBasisId}`,
      }
    case 'VERIFICATION_OVERDUE':
      return {
        title: 'Căn cứ pháp lý cần xác minh lại',
        message: alert.daysSinceVerification
          ? `"${alert.title}" (${alert.documentNumber}) chưa được xác minh trong ${alert.daysSinceVerification} ngày. Vui lòng kiểm tra tính hiệu lực.`
          : `"${alert.title}" (${alert.documentNumber}) chưa từng được xác minh. Vui lòng kiểm tra tính hiệu lực.`,
        link: `/legal-basis/${alert.legalBasisId}`,
      }
  }
}
