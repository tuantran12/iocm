import { z } from 'zod'
import { router, protectedProcedure } from '../trpc'
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  getPreferencesList,
  MUTABLE_NOTIFICATION_TYPES,
} from '../services/notification-preferences'

// ─── Notifications Router ─────────────────────────────────────────────────────

export const notificationsRouter = router({
  /**
   * List notifications for the current user.
   * Supports filtering by read/unread status.
   */
  list: protectedProcedure
    .input(
      z.object({
        read: z.boolean().optional(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(100).default(25),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const { read, page = 0, pageSize = 25 } = input ?? {}
      const userId = ctx.session.user.id

      const where: Record<string, unknown> = { userId }
      if (read !== undefined) {
        where.read = read
      }

      const [items, total] = await Promise.all([
        ctx.db.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: page * pageSize,
          take: pageSize,
        }),
        ctx.db.notification.count({ where }),
      ])

      return { items, total, page, pageSize }
    }),

  /**
   * Mark a single notification as read.
   */
  markRead: protectedProcedure
    .input(z.object({ id: z.string().min(1, 'ID thông báo không được để trống') }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id

      return ctx.db.notification.updateMany({
        where: { id: input.id, userId },
        data: { read: true },
      })
    }),

  /**
   * Mark all notifications as read for the current user.
   */
  markAllRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id

      return ctx.db.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      })
    }),

  /**
   * Get count of unread notifications for the current user.
   */
  unreadCount: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id

      const count = await ctx.db.notification.count({
        where: { userId, read: false },
      })

      return { count }
    }),

  /**
   * Lấy cài đặt thông báo của người dùng hiện tại.
   * Trả về danh sách loại thông báo với trạng thái tắt/bật và phân loại quan trọng.
   */
  getPreferences: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id
      const prefs = await getUserNotificationPreferences(ctx.db, userId)
      const items = getPreferencesList(prefs)

      return { mutedTypes: prefs.mutedTypes, items }
    }),

  /**
   * Cập nhật cài đặt thông báo — cho phép tắt các loại thông báo không quan trọng.
   * Loại quan trọng (quá hạn, hết hạn, KPI, rút đồng ý) không thể tắt.
   */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        mutedTypes: z.array(
          z.enum(MUTABLE_NOTIFICATION_TYPES as [string, ...string[]]),
        ),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id
      const prefs = await updateUserNotificationPreferences(
        ctx.db,
        userId,
        input.mutedTypes,
      )
      const items = getPreferencesList(prefs)

      return { mutedTypes: prefs.mutedTypes, items }
    }),
})
