import { type PrismaClient, PaymentStatus, MembershipStatus } from '@prisma/client'

/**
 * Cấu hình cho phát hiện phí quá hạn.
 */
export interface OverdueCheckConfig {
  /** Có cập nhật membershipStatus của doanh nghiệp sang PAYMENT_OVERDUE không (mặc định: true) */
  updateMemberStatus: boolean
  /** Có tạo notification cho Finance_Officer không (mặc định: true) */
  createNotifications: boolean
}

export interface OverdueAlert {
  feeId: string
  enterpriseId: string
  enterpriseName: string
  year: number
  amountDue: number
  amountPaid: number
  dueDate: Date
  daysOverdue: number
  previousStatus: PaymentStatus
}

export interface OverdueCheckResult {
  alerts: OverdueAlert[]
  feesMarkedOverdue: number
  membersMarkedOverdue: number
  notificationsCreated: number
}

/** Các trạng thái phí KHÔNG cần kiểm tra quá hạn (đã hoàn tất hoặc đã xử lý) */
const EXCLUDED_STATUSES: PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.WAIVED,
  PaymentStatus.CANCELLED,
  PaymentStatus.REFUNDED,
  PaymentStatus.OVERDUE,
]

/**
 * Chạy kiểm tra phí quá hạn cho tất cả membership fees.
 * - Tìm fees có dueDate < now VÀ amountPaid < amountDue VÀ status chưa phải PAID/WAIVED/CANCELLED/REFUNDED/OVERDUE
 * - Cập nhật paymentStatus → OVERDUE
 * - Tùy chọn: cập nhật membershipStatus của enterprise → PAYMENT_OVERDUE
 * - Tạo notification cho Finance_Officer
 */
export async function runOverdueCheck(
  db: PrismaClient,
  config?: Partial<OverdueCheckConfig>
): Promise<OverdueCheckResult> {
  const updateMemberStatus = config?.updateMemberStatus ?? true
  const createNotifications = config?.createNotifications ?? true

  const now = new Date()
  const alerts: OverdueAlert[] = []
  let feesMarkedOverdue = 0
  let membersMarkedOverdue = 0
  let notificationsCreated = 0

  // 1. Tìm tất cả fees quá hạn: dueDate đã qua, chưa thanh toán đủ, status chưa xử lý
  const overdueFees = await db.membershipFee.findMany({
    where: {
      dueDate: { lt: now },
      paymentStatus: { notIn: EXCLUDED_STATUSES },
    },
    include: {
      enterprise: {
        select: { id: true, legalNameVi: true, membershipStatus: true },
      },
    },
  })

  // Lọc thêm: chỉ lấy fees có amountPaid < amountDue
  const feesToMark = overdueFees.filter(
    (fee) => Number(fee.amountPaid) < Number(fee.amountDue)
  )

  // 2. Cập nhật từng fee sang OVERDUE
  const affectedEnterpriseIds = new Set<string>()

  for (const fee of feesToMark) {
    const daysOverdue = Math.floor(
      (now.getTime() - fee.dueDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    await db.membershipFee.update({
      where: { id: fee.id },
      data: { paymentStatus: PaymentStatus.OVERDUE },
    })
    feesMarkedOverdue++

    affectedEnterpriseIds.add(fee.enterpriseId)

    alerts.push({
      feeId: fee.id,
      enterpriseId: fee.enterpriseId,
      enterpriseName: fee.enterprise.legalNameVi,
      year: fee.year,
      amountDue: Number(fee.amountDue),
      amountPaid: Number(fee.amountPaid),
      dueDate: fee.dueDate,
      daysOverdue,
      previousStatus: fee.paymentStatus,
    })
  }

  // 3. Cập nhật membershipStatus → PAYMENT_OVERDUE cho các enterprise bị ảnh hưởng
  if (updateMemberStatus && affectedEnterpriseIds.size > 0) {
    for (const enterpriseId of affectedEnterpriseIds) {
      // Chỉ cập nhật nếu enterprise đang ACTIVE (không ghi đè SUSPENDED/TERMINATED)
      const result = await db.enterpriseMember.updateMany({
        where: {
          id: enterpriseId,
          membershipStatus: MembershipStatus.ACTIVE,
        },
        data: { membershipStatus: MembershipStatus.PAYMENT_OVERDUE },
      })
      membersMarkedOverdue += result.count
    }
  }

  // 4. Tạo notifications cho Finance_Officer
  if (createNotifications && alerts.length > 0) {
    const financeOfficerRoles = await db.userRole.findMany({
      where: {
        role: { name: 'Finance_Officer' },
      },
      select: { userId: true },
    })

    const financeOfficerIds = [...new Set(financeOfficerRoles.map((r) => r.userId))]

    for (const userId of financeOfficerIds) {
      for (const alert of alerts) {
        await db.notification.create({
          data: {
            userId,
            type: 'FEE_OVERDUE',
            title: 'Phí thường niên quá hạn',
            message: `Doanh nghiệp "${alert.enterpriseName}" chưa thanh toán phí năm ${alert.year}. Quá hạn ${alert.daysOverdue} ngày. Số tiền còn thiếu: ${(alert.amountDue - alert.amountPaid).toLocaleString('vi-VN')} VNĐ.`,
            link: `/fees?enterpriseId=${alert.enterpriseId}`,
            read: false,
          },
        })
        notificationsCreated++
      }
    }
  }

  return { alerts, feesMarkedOverdue, membersMarkedOverdue, notificationsCreated }
}

/**
 * Lấy danh sách fees đang quá hạn (đã có status OVERDUE).
 */
export async function getOverdueFees(db: PrismaClient) {
  return db.membershipFee.findMany({
    where: { paymentStatus: PaymentStatus.OVERDUE },
    include: {
      enterprise: {
        select: { id: true, legalNameVi: true, legalNameEn: true, contactEmail: true },
      },
    },
    orderBy: { dueDate: 'asc' },
  })
}
