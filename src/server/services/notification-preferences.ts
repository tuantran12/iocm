import type { PrismaClient } from '@prisma/client'
import { NOTIFICATION_TYPES, type NotificationType } from './notification-types'

/**
 * Notification Preferences Service
 *
 * Manages user notification preferences — which notification types are muted.
 * Critical notifications cannot be muted.
 */

// ─── Critical vs Non-Critical Classification ──────────────────────────────────

/** Loại thông báo quan trọng — KHÔNG thể tắt */
export const CRITICAL_NOTIFICATION_TYPES: NotificationType[] = [
  NOTIFICATION_TYPES.DOCUMENT_OVERDUE,
  NOTIFICATION_TYPES.FEE_OVERDUE,
  NOTIFICATION_TYPES.CONTRACT_EXPIRING,
  NOTIFICATION_TYPES.KPI_OFF_TRACK,
  NOTIFICATION_TYPES.CONSENT_WITHDRAWN,
  NOTIFICATION_TYPES.TASK_OVERDUE,
  NOTIFICATION_TYPES.DOCUMENT_REJECTED,
]

/** Loại thông báo không quan trọng — có thể tắt */
export const MUTABLE_NOTIFICATION_TYPES: NotificationType[] = [
  NOTIFICATION_TYPES.EVENT_REMINDER,
  NOTIFICATION_TYPES.TASK_ASSIGNED,
  NOTIFICATION_TYPES.FEE_PAID,
  NOTIFICATION_TYPES.DOCUMENT_APPROVED,
]

// ─── Vietnamese Labels ────────────────────────────────────────────────────────

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
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
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  mutedTypes: NotificationType[]
}

export interface NotificationPreferenceItem {
  type: NotificationType
  label: string
  muted: boolean
  critical: boolean
}

// ─── Default Preferences ──────────────────────────────────────────────────────

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  mutedTypes: [],
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Get notification preferences for a user.
 * Returns default (all enabled) if no preferences are stored.
 */
export async function getUserNotificationPreferences(
  db: PrismaClient,
  userId: string,
): Promise<NotificationPreferences> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true },
  })

  if (!user?.notificationPrefs) {
    return DEFAULT_PREFERENCES
  }

  const prefs = user.notificationPrefs as unknown as NotificationPreferences

  // Validate stored preferences — filter out any invalid types
  const validMutedTypes = (prefs.mutedTypes ?? []).filter((t) =>
    MUTABLE_NOTIFICATION_TYPES.includes(t),
  )

  return { mutedTypes: validMutedTypes }
}

/**
 * Update notification preferences for a user.
 * Only allows muting non-critical notification types.
 * Silently ignores any critical types in the input.
 */
export async function updateUserNotificationPreferences(
  db: PrismaClient,
  userId: string,
  mutedTypes: string[],
): Promise<NotificationPreferences> {
  // Filter: only allow mutable types to be muted
  const validMutedTypes = mutedTypes.filter((t) =>
    MUTABLE_NOTIFICATION_TYPES.includes(t as NotificationType),
  ) as NotificationType[]

  const prefs: NotificationPreferences = { mutedTypes: validMutedTypes }

  await db.user.update({
    where: { id: userId },
    data: { notificationPrefs: prefs as unknown as Record<string, unknown> },
  })

  return prefs
}

/**
 * Get full preference list for UI display.
 * Returns all notification types with their muted status and whether they're critical.
 */
export function getPreferencesList(
  prefs: NotificationPreferences,
): NotificationPreferenceItem[] {
  const allTypes = Object.values(NOTIFICATION_TYPES) as NotificationType[]

  return allTypes.map((type) => ({
    type,
    label: NOTIFICATION_TYPE_LABELS[type],
    muted: prefs.mutedTypes.includes(type),
    critical: CRITICAL_NOTIFICATION_TYPES.includes(type),
  }))
}

/**
 * Check if a notification type is muted for a user.
 * Critical types are NEVER considered muted.
 */
export function isTypeMuted(
  prefs: NotificationPreferences,
  type: string,
): boolean {
  // Critical types can never be muted
  if (CRITICAL_NOTIFICATION_TYPES.includes(type as NotificationType)) {
    return false
  }

  return prefs.mutedTypes.includes(type as NotificationType)
}
