import type { PrismaClient } from '@prisma/client'
import {
  getUserNotificationPreferences,
  isTypeMuted,
} from './notification-preferences'
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TITLES,
  type NotificationType,
} from './notification-types'

/**
 * Notification Service — Centralized notification creation for key system events.
 *
 * Provides:
 * - createNotification: single notification
 * - createBulkNotifications: batch creation
 * - notifyRoleUsers: notify all users with a specific role
 * - Predefined notification type constants
 * - Vietnamese title templates
 */

// Re-export types and constants for backward compatibility
export { NOTIFICATION_TYPES, NOTIFICATION_TITLES, type NotificationType }

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateNotificationInput {
  userId: string
  type: string
  title: string
  message?: string | null
  link?: string | null
}


// Prisma transaction client type (excludes top-level methods)
type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Creates a single notification record.
 * Checks user preferences — skips creation if the type is muted.
 * Can be used with either a full PrismaClient or a transaction client.
 */
export async function createNotification(
  db: PrismaTransactionClient | PrismaClient,
  input: CreateNotificationInput,
) {
  // Check user notification preferences (skip if muted)
  const prefs = await getUserNotificationPreferences(
    db as PrismaClient,
    input.userId,
  )
  if (isTypeMuted(prefs, input.type)) {
    return null
  }

  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message ?? null,
      link: input.link ?? null,
    },
  })
}

/**
 * Creates multiple notification records at once.
 * Filters out notifications for users who have muted the type.
 * Uses createMany for efficiency.
 */
export async function createBulkNotifications(
  db: PrismaTransactionClient | PrismaClient,
  notifications: CreateNotificationInput[],
) {
  if (notifications.length === 0) return { count: 0 }

  // Filter out muted notifications per user
  const filtered: CreateNotificationInput[] = []
  for (const n of notifications) {
    const prefs = await getUserNotificationPreferences(
      db as PrismaClient,
      n.userId,
    )
    if (!isTypeMuted(prefs, n.type)) {
      filtered.push(n)
    }
  }

  if (filtered.length === 0) return { count: 0 }

  return db.notification.createMany({
    data: filtered.map((n) => ({
      userId: n.userId,
      type: n.type,
      title: n.title,
      message: n.message ?? null,
      link: n.link ?? null,
    })),
  })
}

/**
 * Notifies all users with a specific role.
 * Finds users by role name and creates notifications for each.
 */
export async function notifyRoleUsers(
  db: PrismaTransactionClient | PrismaClient,
  roleName: string,
  notification: Omit<CreateNotificationInput, 'userId'>,
) {
  const role = await db.role.findUnique({ where: { name: roleName } })
  if (!role) return { count: 0 }

  const userRoles = await db.userRole.findMany({
    where: { roleId: role.id },
    select: { userId: true },
  })

  const uniqueUserIds = [...new Set(userRoles.map((ur) => ur.userId))]
  if (uniqueUserIds.length === 0) return { count: 0 }

  return db.notification.createMany({
    data: uniqueUserIds.map((userId) => ({
      userId,
      type: notification.type,
      title: notification.title,
      message: notification.message ?? null,
      link: notification.link ?? null,
    })),
  })
}
