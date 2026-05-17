import { type PrismaClient, DocumentStatus, PaymentStatus, AgreementStatus } from '@prisma/client'
import { NOTIFICATION_TYPES, NOTIFICATION_TITLES } from './notification-types'
import { calculateAchievement } from '../routers/kpis'
import { DEFAULT_OFF_TRACK_THRESHOLD } from './kpi-alerts'

/**
 * Alert Rules Service — Phát hiện các mục quá hạn/sắp hết hạn và tạo thông báo.
 *
 * Các hàm:
 * - checkDocumentOverdue: tài liệu quá hạn
 * - checkFeeOverdue: phí thường niên quá hạn
 * - checkContractExpiring: hợp đồng sắp hết hạn
 * - checkKPIOffTrack: KPI lệch mục tiêu
 * - runAllAlertChecks: chạy tất cả kiểm tra
 *
 * Tất cả đều idempotent — không tạo thông báo trùng lặp cho cùng item trong cùng ngày.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlertCheckResult {
  type: string
  alertsCreated: number
  itemsFound: number
}

export interface AllAlertChecksSummary {
  documentOverdue: AlertCheckResult
  feeOverdue: AlertCheckResult
  contractExpiring: AlertCheckResult
  kpiOffTrack: AlertCheckResult
  totalAlertsCreated: number
  checkedAt: Date
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Lấy ngày bắt đầu của ngày hiện tại (00:00:00) để kiểm tra idempotent.
 */
function getStartOfDay(date: Date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}


/**
 * Kiểm tra xem đã có notification cùng type cho cùng user với link chứa itemId
 * được tạo trong ngày hôm nay chưa.
 */
async function hasNotificationToday(
  db: PrismaClient,
  userId: string,
  type: string,
  link: string,
): Promise<boolean> {
  const startOfDay = getStartOfDay()
  const existing = await db.notification.findFirst({
    where: {
      userId,
      type,
      link,
      createdAt: { gte: startOfDay },
    },
  })
  return existing !== null
}

// ─── Document Overdue ─────────────────────────────────────────────────────────

/** Trạng thái tài liệu đã hoàn thành — không cần cảnh báo */
const DOCUMENT_COMPLETED_STATUSES: DocumentStatus[] = [
  DocumentStatus.APPROVED,
  DocumentStatus.ARCHIVED,
]

/**
 * Tìm tài liệu có deadline < now và status chưa hoàn thành,
 * tạo thông báo DOCUMENT_OVERDUE cho owner của tài liệu.
 */
export async function checkDocumentOverdue(db: PrismaClient): Promise<AlertCheckResult> {
  const now = new Date()
  let alertsCreated = 0

  // Tìm tài liệu quá hạn: có deadline, deadline đã qua, status chưa hoàn thành, có owner
  const overdueDocuments = await db.documentItem.findMany({
    where: {
      deadline: { lt: now },
      status: { notIn: DOCUMENT_COMPLETED_STATUSES },
      ownerId: { not: null },
    },
    select: {
      id: true,
      code: true,
      name: true,
      ownerId: true,
      deadline: true,
    },
  })


  for (const doc of overdueDocuments) {
    const link = `/documents/${doc.id}`
    const alreadyNotified = await hasNotificationToday(
      db,
      doc.ownerId!,
      NOTIFICATION_TYPES.DOCUMENT_OVERDUE,
      link,
    )
    if (alreadyNotified) continue

    const daysOverdue = Math.floor(
      (now.getTime() - doc.deadline!.getTime()) / (1000 * 60 * 60 * 24),
    )

    await db.notification.create({
      data: {
        userId: doc.ownerId!,
        type: NOTIFICATION_TYPES.DOCUMENT_OVERDUE,
        title: NOTIFICATION_TITLES.DOCUMENT_OVERDUE,
        message: `Tài liệu "${doc.name}" (${doc.code}) đã quá hạn ${daysOverdue} ngày. Vui lòng cập nhật hoặc hoàn thiện.`,
        link,
      },
    })
    alertsCreated++
  }

  return {
    type: NOTIFICATION_TYPES.DOCUMENT_OVERDUE,
    itemsFound: overdueDocuments.length,
    alertsCreated,
  }
}

// ─── Fee Overdue ──────────────────────────────────────────────────────────────

/** Trạng thái phí đã xử lý — không cần cảnh báo */
const FEE_RESOLVED_STATUSES: PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.WAIVED,
  PaymentStatus.CANCELLED,
  PaymentStatus.REFUNDED,
]

/**
 * Tìm phí thường niên có dueDate < now và paymentStatus chưa thanh toán,
 * tạo thông báo FEE_OVERDUE cho tất cả Finance_Officer.
 */
export async function checkFeeOverdue(db: PrismaClient): Promise<AlertCheckResult> {
  const now = new Date()
  let alertsCreated = 0

  // Tìm phí quá hạn
  const overdueFees = await db.membershipFee.findMany({
    where: {
      dueDate: { lt: now },
      paymentStatus: { notIn: FEE_RESOLVED_STATUSES },
    },
    include: {
      enterprise: { select: { id: true, legalNameVi: true } },
    },
  })


  // Lọc fees có amountPaid < amountDue
  const unpaidFees = overdueFees.filter(
    (fee) => Number(fee.amountPaid) < Number(fee.amountDue),
  )

  if (unpaidFees.length === 0) {
    return { type: NOTIFICATION_TYPES.FEE_OVERDUE, itemsFound: 0, alertsCreated: 0 }
  }

  // Tìm tất cả Finance_Officer
  const financeRole = await db.role.findUnique({ where: { name: 'Finance_Officer' } })
  if (!financeRole) {
    return { type: NOTIFICATION_TYPES.FEE_OVERDUE, itemsFound: unpaidFees.length, alertsCreated: 0 }
  }

  const financeUserRoles = await db.userRole.findMany({
    where: { roleId: financeRole.id },
    select: { userId: true },
  })
  const financeUserIds = [...new Set(financeUserRoles.map((ur) => ur.userId))]

  if (financeUserIds.length === 0) {
    return { type: NOTIFICATION_TYPES.FEE_OVERDUE, itemsFound: unpaidFees.length, alertsCreated: 0 }
  }

  for (const fee of unpaidFees) {
    const link = `/fees?enterpriseId=${fee.enterpriseId}`
    const daysOverdue = Math.floor(
      (now.getTime() - fee.dueDate.getTime()) / (1000 * 60 * 60 * 24),
    )
    const amountRemaining = Number(fee.amountDue) - Number(fee.amountPaid)

    for (const userId of financeUserIds) {
      const alreadyNotified = await hasNotificationToday(
        db,
        userId,
        NOTIFICATION_TYPES.FEE_OVERDUE,
        link,
      )
      if (alreadyNotified) continue

      await db.notification.create({
        data: {
          userId,
          type: NOTIFICATION_TYPES.FEE_OVERDUE,
          title: NOTIFICATION_TITLES.FEE_OVERDUE,
          message: `Doanh nghiệp "${fee.enterprise.legalNameVi}" chưa thanh toán phí năm ${fee.year}. Quá hạn ${daysOverdue} ngày. Còn thiếu: ${amountRemaining.toLocaleString('vi-VN')} VNĐ.`,
          link,
        },
      })
      alertsCreated++
    }
  }

  return {
    type: NOTIFICATION_TYPES.FEE_OVERDUE,
    itemsFound: unpaidFees.length,
    alertsCreated,
  }
}

// ─── Contract Expiring ────────────────────────────────────────────────────────

/**
 * Tìm hợp đồng/thỏa thuận có expiryDate trong vòng N ngày tới và status ACTIVE,
 * tạo thông báo CONTRACT_EXPIRING cho tất cả Legal_Officer.
 */
export async function checkContractExpiring(
  db: PrismaClient,
  daysBeforeExpiry: number = 30,
): Promise<AlertCheckResult> {
  const now = new Date()
  const futureDate = new Date(now.getTime() + daysBeforeExpiry * 24 * 60 * 60 * 1000)
  let alertsCreated = 0


  // Tìm hợp đồng sắp hết hạn: expiryDate trong khoảng [now, now + N days], status ACTIVE
  const expiringAgreements = await db.agreementRecord.findMany({
    where: {
      expiryDate: { gte: now, lte: futureDate },
      status: AgreementStatus.ACTIVE,
    },
    select: {
      id: true,
      title: true,
      type: true,
      partyB: true,
      expiryDate: true,
    },
  })

  if (expiringAgreements.length === 0) {
    return { type: NOTIFICATION_TYPES.CONTRACT_EXPIRING, itemsFound: 0, alertsCreated: 0 }
  }

  // Tìm tất cả Legal_Officer
  const legalRole = await db.role.findUnique({ where: { name: 'Legal_Officer' } })
  if (!legalRole) {
    return { type: NOTIFICATION_TYPES.CONTRACT_EXPIRING, itemsFound: expiringAgreements.length, alertsCreated: 0 }
  }

  const legalUserRoles = await db.userRole.findMany({
    where: { roleId: legalRole.id },
    select: { userId: true },
  })
  const legalUserIds = [...new Set(legalUserRoles.map((ur) => ur.userId))]

  if (legalUserIds.length === 0) {
    return { type: NOTIFICATION_TYPES.CONTRACT_EXPIRING, itemsFound: expiringAgreements.length, alertsCreated: 0 }
  }

  for (const agreement of expiringAgreements) {
    const link = `/agreements/${agreement.id}`
    const daysUntilExpiry = Math.floor(
      (agreement.expiryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    )

    for (const userId of legalUserIds) {
      const alreadyNotified = await hasNotificationToday(
        db,
        userId,
        NOTIFICATION_TYPES.CONTRACT_EXPIRING,
        link,
      )
      if (alreadyNotified) continue

      await db.notification.create({
        data: {
          userId,
          type: NOTIFICATION_TYPES.CONTRACT_EXPIRING,
          title: NOTIFICATION_TITLES.CONTRACT_EXPIRING,
          message: `Hợp đồng "${agreement.title}" với "${agreement.partyB}" sẽ hết hạn trong ${daysUntilExpiry} ngày. Vui lòng chuẩn bị gia hạn hoặc kết thúc.`,
          link,
        },
      })
      alertsCreated++
    }
  }

  return {
    type: NOTIFICATION_TYPES.CONTRACT_EXPIRING,
    itemsFound: expiringAgreements.length,
    alertsCreated,
  }
}

// ─── KPI Off-Track ────────────────────────────────────────────────────────────

/**
 * Tìm KPI có achievement < 70%, tạo thông báo KPI_OFF_TRACK cho owner của project.
 */
export async function checkKPIOffTrack(db: PrismaClient): Promise<AlertCheckResult> {
  let alertsCreated = 0


  // Lấy tất cả KPIs có target và current value, kèm project owner
  const kpis = await db.kPIMetric.findMany({
    where: {
      targetValue: { not: null },
      currentValue: { not: null },
    },
    include: {
      project: { select: { id: true, name: true, ownerId: true } },
    },
  })

  // Lọc KPIs off-track (achievement < 70%)
  const offTrackKPIs = kpis.filter((kpi) => {
    const achievement = calculateAchievement(
      kpi.targetValue,
      kpi.currentValue,
      kpi.direction,
    )
    return achievement !== null && achievement < DEFAULT_OFF_TRACK_THRESHOLD
  })

  if (offTrackKPIs.length === 0) {
    return { type: NOTIFICATION_TYPES.KPI_OFF_TRACK, itemsFound: 0, alertsCreated: 0 }
  }

  for (const kpi of offTrackKPIs) {
    const link = `/projects/${kpi.project.id}/kpis`
    const ownerId = kpi.project.ownerId

    const alreadyNotified = await hasNotificationToday(
      db,
      ownerId,
      NOTIFICATION_TYPES.KPI_OFF_TRACK,
      link,
    )
    if (alreadyNotified) continue

    const achievement = calculateAchievement(
      kpi.targetValue,
      kpi.currentValue,
      kpi.direction,
    )

    await db.notification.create({
      data: {
        userId: ownerId,
        type: NOTIFICATION_TYPES.KPI_OFF_TRACK,
        title: NOTIFICATION_TITLES.KPI_OFF_TRACK,
        message: `KPI "${kpi.name}" trong dự án "${kpi.project.name}" chỉ đạt ${achievement?.toFixed(1)}% mục tiêu. Cần xem xét và điều chỉnh.`,
        link,
      },
    })
    alertsCreated++
  }

  return {
    type: NOTIFICATION_TYPES.KPI_OFF_TRACK,
    itemsFound: offTrackKPIs.length,
    alertsCreated,
  }
}

// ─── Run All Checks ───────────────────────────────────────────────────────────

/**
 * Chạy tất cả alert checks và trả về tổng kết.
 * Thường được gọi bởi cron job hoặc scheduled task.
 */
export async function runAllAlertChecks(db: PrismaClient): Promise<AllAlertChecksSummary> {
  const documentOverdue = await checkDocumentOverdue(db)
  const feeOverdue = await checkFeeOverdue(db)
  const contractExpiring = await checkContractExpiring(db)
  const kpiOffTrack = await checkKPIOffTrack(db)

  const totalAlertsCreated =
    documentOverdue.alertsCreated +
    feeOverdue.alertsCreated +
    contractExpiring.alertsCreated +
    kpiOffTrack.alertsCreated

  return {
    documentOverdue,
    feeOverdue,
    contractExpiring,
    kpiOffTrack,
    totalAlertsCreated,
    checkedAt: new Date(),
  }
}
