import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createNotification,
  createBulkNotifications,
  notifyRoleUsers,
  NOTIFICATION_TYPES,
  NOTIFICATION_TITLES,
} from './notification'

// ─── Mock Prisma Client ───────────────────────────────────────────────────────

function createMockDb() {
  return {
    notification: {
      create: vi.fn().mockResolvedValue({ id: 'notif-1', userId: 'user-1', type: 'TASK_ASSIGNED', title: 'Công việc mới được giao', message: null, link: null, read: false, createdAt: new Date() }),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    role: {
      findUnique: vi.fn(),
    },
    userRole: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ notificationPrefs: null }),
    },
  } as unknown as Parameters<typeof createNotification>[0]
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Notification Service', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
  })

  describe('NOTIFICATION_TYPES', () => {
    it('should have all required notification types', () => {
      expect(NOTIFICATION_TYPES.DOCUMENT_OVERDUE).toBe('DOCUMENT_OVERDUE')
      expect(NOTIFICATION_TYPES.DOCUMENT_APPROVED).toBe('DOCUMENT_APPROVED')
      expect(NOTIFICATION_TYPES.DOCUMENT_REJECTED).toBe('DOCUMENT_REJECTED')
      expect(NOTIFICATION_TYPES.FEE_OVERDUE).toBe('FEE_OVERDUE')
      expect(NOTIFICATION_TYPES.FEE_PAID).toBe('FEE_PAID')
      expect(NOTIFICATION_TYPES.CONTRACT_EXPIRING).toBe('CONTRACT_EXPIRING')
      expect(NOTIFICATION_TYPES.KPI_OFF_TRACK).toBe('KPI_OFF_TRACK')
      expect(NOTIFICATION_TYPES.CONSENT_WITHDRAWN).toBe('CONSENT_WITHDRAWN')
      expect(NOTIFICATION_TYPES.TASK_ASSIGNED).toBe('TASK_ASSIGNED')
      expect(NOTIFICATION_TYPES.TASK_OVERDUE).toBe('TASK_OVERDUE')
      expect(NOTIFICATION_TYPES.EVENT_REMINDER).toBe('EVENT_REMINDER')
    })
  })

  describe('NOTIFICATION_TITLES', () => {
    it('should have Vietnamese titles for all types', () => {
      expect(NOTIFICATION_TITLES.DOCUMENT_OVERDUE).toBe('Tài liệu quá hạn')
      expect(NOTIFICATION_TITLES.TASK_ASSIGNED).toBe('Công việc mới được giao')
      expect(NOTIFICATION_TITLES.FEE_OVERDUE).toBe('Phí thường niên quá hạn')
      expect(NOTIFICATION_TITLES.CONTRACT_EXPIRING).toBe('Hợp đồng sắp hết hạn')
      expect(NOTIFICATION_TITLES.EVENT_REMINDER).toBe('Nhắc nhở sự kiện')
    })
  })

  describe('createNotification', () => {
    it('should create a single notification', async () => {
      await createNotification(db, {
        userId: 'user-1',
        type: NOTIFICATION_TYPES.TASK_ASSIGNED,
        title: NOTIFICATION_TITLES.TASK_ASSIGNED,
        message: 'Bạn được giao công việc mới',
        link: '/tasks/task-1',
      })

      expect((db as any).notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          type: 'TASK_ASSIGNED',
          title: 'Công việc mới được giao',
          message: 'Bạn được giao công việc mới',
          link: '/tasks/task-1',
        },
      })
    })

    it('should handle null message and link', async () => {
      await createNotification(db, {
        userId: 'user-2',
        type: NOTIFICATION_TYPES.FEE_PAID,
        title: NOTIFICATION_TITLES.FEE_PAID,
      })

      expect((db as any).notification.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          type: 'FEE_PAID',
          title: 'Phí thường niên đã thanh toán',
          message: null,
          link: null,
        },
      })
    })
  })

  describe('createBulkNotifications', () => {
    it('should create multiple notifications at once', async () => {
      const notifications = [
        { userId: 'user-1', type: NOTIFICATION_TYPES.TASK_ASSIGNED, title: 'Task 1' },
        { userId: 'user-2', type: NOTIFICATION_TYPES.TASK_ASSIGNED, title: 'Task 2' },
      ]

      const result = await createBulkNotifications(db, notifications)

      expect(result).toEqual({ count: 2 })
      expect((db as any).notification.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', type: 'TASK_ASSIGNED', title: 'Task 1', message: null, link: null },
          { userId: 'user-2', type: 'TASK_ASSIGNED', title: 'Task 2', message: null, link: null },
        ],
      })
    })

    it('should return count 0 for empty array', async () => {
      const result = await createBulkNotifications(db, [])

      expect(result).toEqual({ count: 0 })
      expect((db as any).notification.createMany).not.toHaveBeenCalled()
    })
  })

  describe('notifyRoleUsers', () => {
    it('should notify all users with the specified role', async () => {
      ;(db as any).role.findUnique.mockResolvedValue({ id: 'role-dpo', name: 'DPO' })
      ;(db as any).userRole.findMany.mockResolvedValue([
        { userId: 'user-a' },
        { userId: 'user-b' },
      ])

      await notifyRoleUsers(db, 'DPO', {
        type: NOTIFICATION_TYPES.CONSENT_WITHDRAWN,
        title: NOTIFICATION_TITLES.CONSENT_WITHDRAWN,
        message: 'Đồng ý đã bị rút lại',
        link: '/data/consent',
      })

      expect((db as any).notification.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-a', type: 'CONSENT_WITHDRAWN', title: 'Rút lại đồng ý thu thập dữ liệu', message: 'Đồng ý đã bị rút lại', link: '/data/consent' },
          { userId: 'user-b', type: 'CONSENT_WITHDRAWN', title: 'Rút lại đồng ý thu thập dữ liệu', message: 'Đồng ý đã bị rút lại', link: '/data/consent' },
        ],
      })
    })

    it('should return count 0 when role not found', async () => {
      ;(db as any).role.findUnique.mockResolvedValue(null)

      const result = await notifyRoleUsers(db, 'NonExistentRole', {
        type: NOTIFICATION_TYPES.TASK_ASSIGNED,
        title: 'Test',
      })

      expect(result).toEqual({ count: 0 })
      expect((db as any).notification.createMany).not.toHaveBeenCalled()
    })

    it('should return count 0 when no users have the role', async () => {
      ;(db as any).role.findUnique.mockResolvedValue({ id: 'role-x', name: 'X' })
      ;(db as any).userRole.findMany.mockResolvedValue([])

      const result = await notifyRoleUsers(db, 'X', {
        type: NOTIFICATION_TYPES.TASK_ASSIGNED,
        title: 'Test',
      })

      expect(result).toEqual({ count: 0 })
      expect((db as any).notification.createMany).not.toHaveBeenCalled()
    })

    it('should deduplicate user IDs', async () => {
      ;(db as any).role.findUnique.mockResolvedValue({ id: 'role-1', name: 'Director' })
      ;(db as any).userRole.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-1' },
        { userId: 'user-2' },
      ])

      await notifyRoleUsers(db, 'Director', {
        type: NOTIFICATION_TYPES.DOCUMENT_OVERDUE,
        title: NOTIFICATION_TITLES.DOCUMENT_OVERDUE,
      })

      expect((db as any).notification.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'user-1', type: 'DOCUMENT_OVERDUE', title: 'Tài liệu quá hạn', message: null, link: null },
          { userId: 'user-2', type: 'DOCUMENT_OVERDUE', title: 'Tài liệu quá hạn', message: null, link: null },
        ],
      })
    })
  })
})
