import { type PrismaClient } from '@prisma/client'

/**
 * Retention Check Service — Kiểm tra dữ liệu theo quy tắc lưu trữ.
 *
 * Các hàm:
 * - parseRetentionPeriod: chuyển chuỗi retention period thành số ngày
 * - checkRetentionForType: tìm items quá hạn lưu trữ cho một objectType
 * - createArchivalWarnings: tạo thông báo cho DPO/System_Admin về items cần lưu trữ/xóa
 *
 * Logic:
 * - Nếu approvalNeeded = true → chỉ cảnh báo, KHÔNG tự động xóa
 * - Nếu approvalNeeded = false → có thể tự động lưu trữ (archive)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetentionItem {
  id: string
  name: string
  createdAt: Date
  daysOverRetention: number
}

export interface RetentionCheckResult {
  objectType: string
  retentionPeriod: string
  totalItemsChecked: number
  itemsDueForAction: RetentionItem[]
  approvalNeeded: boolean
  archiveMethod: string | null
  deletionMethod: string | null
}

export interface ArchivalWarningResult {
  objectType: string
  warningsCreated: number
  autoArchived: number
  pendingApproval: number
}

// ─── Notification Constants ───────────────────────────────────────────────────

export const RETENTION_NOTIFICATION_TYPES = {
  ARCHIVAL_WARNING: 'ARCHIVAL_WARNING',
  DELETION_PENDING_APPROVAL: 'DELETION_PENDING_APPROVAL',
  AUTO_ARCHIVED: 'AUTO_ARCHIVED',
} as const

export const RETENTION_NOTIFICATION_TITLES = {
  ARCHIVAL_WARNING: 'Cảnh báo lưu trữ dữ liệu',
  DELETION_PENDING_APPROVAL: 'Yêu cầu phê duyệt xóa dữ liệu',
  AUTO_ARCHIVED: 'Dữ liệu đã được tự động lưu trữ',
} as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Chuyển chuỗi retention period thành số ngày.
 * Hỗ trợ: "30d", "6m", "1y", "365d", "2y", "12m"
 * Mặc định: 365 ngày nếu không parse được.
 */
export function parseRetentionPeriod(period: string): number {
  const match = period.trim().match(/^(\d+)\s*(d|m|y)$/i)
  if (!match) return 365

  const value = parseInt(match[1]!, 10)
  const unit = match[2]!.toLowerCase()

  switch (unit) {
    case 'd':
      return value
    case 'm':
      return value * 30
    case 'y':
      return value * 365
    default:
      return 365
  }
}


/**
 * Lấy ngày bắt đầu của ngày hiện tại (00:00:00) để kiểm tra idempotent.
 */
function getStartOfDay(date: Date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Kiểm tra xem đã có notification cùng type cho cùng user với link
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

// ─── Object Type → Prisma Model Mapping ───────────────────────────────────────

/**
 * Mapping từ objectType (trong RetentionRule) sang cách query Prisma.
 * Mỗi entry trả về danh sách items với id, name, createdAt.
 */
type ItemFetcher = (db: PrismaClient) => Promise<Array<{ id: string; name: string; createdAt: Date }>>

const OBJECT_TYPE_FETCHERS: Record<string, ItemFetcher> = {
  DocumentItem: async (db) => {
    const items = await db.documentItem.findMany({
      select: { id: true, name: true, createdAt: true },
    })
    return items
  },
  ChatMessage: async (db) => {
    const items = await db.chatMessage.findMany({
      select: { id: true, content: true, createdAt: true },
    })
    return items.map((m) => ({ id: m.id, name: m.content.slice(0, 50), createdAt: m.createdAt }))
  },
  AuditLog: async (db) => {
    const items = await db.auditLog.findMany({
      select: { id: true, action: true, timestamp: true },
    })
    return items.map((a) => ({ id: a.id, name: a.action, createdAt: a.timestamp }))
  },
  Notification: async (db) => {
    const items = await db.notification.findMany({
      select: { id: true, title: true, createdAt: true },
    })
    return items.map((n) => ({ id: n.id, name: n.title, createdAt: n.createdAt }))
  },
  ConsentRecord: async (db) => {
    const items = await db.consentRecord.findMany({
      select: { id: true, purpose: true, consentDate: true },
    })
    return items.map((c) => ({ id: c.id, name: c.purpose, createdAt: c.consentDate }))
  },
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Kiểm tra items của một objectType đã quá thời gian lưu trữ chưa.
 * Trả về danh sách items cần lưu trữ/xóa.
 */
export async function checkRetentionForType(
  db: PrismaClient,
  objectType: string,
): Promise<RetentionCheckResult> {
  // Tìm retention rule cho objectType
  const rule = await db.retentionRule.findUnique({
    where: { objectType },
  })

  if (!rule) {
    return {
      objectType,
      retentionPeriod: 'N/A',
      totalItemsChecked: 0,
      itemsDueForAction: [],
      approvalNeeded: true,
      archiveMethod: null,
      deletionMethod: null,
    }
  }

  const retentionDays = parseRetentionPeriod(rule.retentionPeriod)
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

  // Lấy fetcher cho objectType
  const fetcher = OBJECT_TYPE_FETCHERS[objectType]
  if (!fetcher) {
    return {
      objectType,
      retentionPeriod: rule.retentionPeriod,
      totalItemsChecked: 0,
      itemsDueForAction: [],
      approvalNeeded: rule.approvalNeeded,
      archiveMethod: rule.archiveMethod,
      deletionMethod: rule.deletionMethod,
    }
  }

  const allItems = await fetcher(db)
  const now = new Date()

  // Lọc items quá hạn lưu trữ
  const itemsDueForAction: RetentionItem[] = allItems
    .filter((item) => item.createdAt < cutoffDate)
    .map((item) => ({
      id: item.id,
      name: item.name,
      createdAt: item.createdAt,
      daysOverRetention: Math.floor(
        (now.getTime() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24) - retentionDays,
      ),
    }))

  return {
    objectType,
    retentionPeriod: rule.retentionPeriod,
    totalItemsChecked: allItems.length,
    itemsDueForAction,
    approvalNeeded: rule.approvalNeeded,
    archiveMethod: rule.archiveMethod,
    deletionMethod: rule.deletionMethod,
  }
}


/**
 * Tạo cảnh báo lưu trữ/xóa cho DPO và System_Admin.
 *
 * - Nếu approvalNeeded = true: tạo thông báo DELETION_PENDING_APPROVAL, items chờ phê duyệt
 * - Nếu approvalNeeded = false: tạo thông báo AUTO_ARCHIVED, items được tự động lưu trữ
 *
 * Idempotent: không tạo thông báo trùng lặp trong cùng ngày.
 */
export async function createArchivalWarnings(
  db: PrismaClient,
  items: RetentionItem[],
  rule: {
    objectType: string
    approvalNeeded: boolean
    archiveMethod: string | null
    deletionMethod: string | null
  },
): Promise<ArchivalWarningResult> {
  if (items.length === 0) {
    return {
      objectType: rule.objectType,
      warningsCreated: 0,
      autoArchived: 0,
      pendingApproval: 0,
    }
  }

  // Tìm DPO và System_Admin users
  const targetRoles = await db.role.findMany({
    where: { name: { in: ['DPO', 'System_Admin'] } },
  })

  if (targetRoles.length === 0) {
    return {
      objectType: rule.objectType,
      warningsCreated: 0,
      autoArchived: 0,
      pendingApproval: 0,
    }
  }

  const roleIds = targetRoles.map((r) => r.id)
  const userRoles = await db.userRole.findMany({
    where: { roleId: { in: roleIds } },
    select: { userId: true },
  })
  const targetUserIds = Array.from(new Set(userRoles.map((ur) => ur.userId)))

  if (targetUserIds.length === 0) {
    return {
      objectType: rule.objectType,
      warningsCreated: 0,
      autoArchived: 0,
      pendingApproval: 0,
    }
  }

  let warningsCreated = 0
  const autoArchived = rule.approvalNeeded ? 0 : items.length
  const pendingApproval = rule.approvalNeeded ? items.length : 0

  const notificationType = rule.approvalNeeded
    ? RETENTION_NOTIFICATION_TYPES.DELETION_PENDING_APPROVAL
    : RETENTION_NOTIFICATION_TYPES.AUTO_ARCHIVED

  const notificationTitle = rule.approvalNeeded
    ? RETENTION_NOTIFICATION_TITLES.DELETION_PENDING_APPROVAL
    : RETENTION_NOTIFICATION_TITLES.AUTO_ARCHIVED

  const link = `/settings/retention?objectType=${rule.objectType}`

  // Tạo message tổng hợp
  const message = rule.approvalNeeded
    ? `Có ${items.length} mục "${rule.objectType}" đã quá thời hạn lưu trữ và cần phê duyệt để xóa/lưu trữ. Phương pháp xóa: ${rule.deletionMethod ?? 'chưa xác định'}.`
    : `Có ${items.length} mục "${rule.objectType}" đã quá thời hạn lưu trữ và được tự động lưu trữ. Phương pháp: ${rule.archiveMethod ?? 'chưa xác định'}.`

  for (const userId of targetUserIds) {
    const alreadyNotified = await hasNotificationToday(db, userId, notificationType, link)
    if (alreadyNotified) continue

    await db.notification.create({
      data: {
        userId,
        type: notificationType,
        title: notificationTitle,
        message,
        link,
      },
    })
    warningsCreated++
  }

  return {
    objectType: rule.objectType,
    warningsCreated,
    autoArchived,
    pendingApproval,
  }
}
