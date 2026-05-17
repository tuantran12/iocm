/**
 * Notification Type Constants & Vietnamese Labels
 *
 * Extracted to avoid circular dependencies between notification.ts and notification-preferences.ts.
 */

// ─── Notification Type Constants ──────────────────────────────────────────────

export const NOTIFICATION_TYPES = {
  DOCUMENT_OVERDUE: 'DOCUMENT_OVERDUE',
  DOCUMENT_APPROVED: 'DOCUMENT_APPROVED',
  DOCUMENT_REJECTED: 'DOCUMENT_REJECTED',
  FEE_OVERDUE: 'FEE_OVERDUE',
  FEE_PAID: 'FEE_PAID',
  CONTRACT_EXPIRING: 'CONTRACT_EXPIRING',
  KPI_OFF_TRACK: 'KPI_OFF_TRACK',
  CONSENT_WITHDRAWN: 'CONSENT_WITHDRAWN',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_OVERDUE: 'TASK_OVERDUE',
  EVENT_REMINDER: 'EVENT_REMINDER',
  ARCHIVAL_WARNING: 'ARCHIVAL_WARNING',
  DELETION_PENDING_APPROVAL: 'DELETION_PENDING_APPROVAL',
  AUTO_ARCHIVED: 'AUTO_ARCHIVED',
} as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES]

// ─── Vietnamese Title Templates ───────────────────────────────────────────────

export const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  DOCUMENT_OVERDUE: 'Tài liệu quá hạn',
  DOCUMENT_APPROVED: 'Tài liệu đã được phê duyệt',
  DOCUMENT_REJECTED: 'Tài liệu bị từ chối',
  FEE_OVERDUE: 'Phí thường niên quá hạn',
  FEE_PAID: 'Phí thường niên đã thanh toán',
  CONTRACT_EXPIRING: 'Hợp đồng sắp hết hạn',
  KPI_OFF_TRACK: 'KPI chưa đạt mục tiêu',
  CONSENT_WITHDRAWN: 'Rút lại đồng ý thu thập dữ liệu',
  TASK_ASSIGNED: 'Công việc mới được giao',
  TASK_OVERDUE: 'Công việc quá hạn',
  EVENT_REMINDER: 'Nhắc nhở sự kiện',
  ARCHIVAL_WARNING: 'Cảnh báo lưu trữ dữ liệu',
  DELETION_PENDING_APPROVAL: 'Yêu cầu phê duyệt xóa dữ liệu',
  AUTO_ARCHIVED: 'Dữ liệu đã được tự động lưu trữ',
}
