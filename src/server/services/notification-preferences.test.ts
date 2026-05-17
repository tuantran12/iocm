import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  getPreferencesList,
  isTypeMuted,
  CRITICAL_NOTIFICATION_TYPES,
  MUTABLE_NOTIFICATION_TYPES,
  DEFAULT_PREFERENCES,
  NOTIFICATION_TYPE_LABELS,
} from './notification-preferences'
import { NOTIFICATION_TYPES } from './notification-types'

// ─── Mock Prisma Client ───────────────────────────────────────────────────────

function createMockDb() {
  return {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as Parameters<typeof getUserNotificationPreferences>[0]
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Notification Preferences Service', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
  })

  describe('Constants', () => {
    it('should classify critical types correctly', () => {
      expect(CRITICAL_NOTIFICATION_TYPES).toContain(NOTIFICATION_TYPES.DOCUMENT_OVERDUE)
      expect(CRITICAL_NOTIFICATION_TYPES).toContain(NOTIFICATION_TYPES.FEE_OVERDUE)
      expect(CRITICAL_NOTIFICATION_TYPES).toContain(NOTIFICATION_TYPES.CONTRACT_EXPIRING)
      expect(CRITICAL_NOTIFICATION_TYPES).toContain(NOTIFICATION_TYPES.KPI_OFF_TRACK)
      expect(CRITICAL_NOTIFICATION_TYPES).toContain(NOTIFICATION_TYPES.CONSENT_WITHDRAWN)
    })

    it('should classify mutable types correctly', () => {
      expect(MUTABLE_NOTIFICATION_TYPES).toContain(NOTIFICATION_TYPES.EVENT_REMINDER)
      expect(MUTABLE_NOTIFICATION_TYPES).toContain(NOTIFICATION_TYPES.TASK_ASSIGNED)
      expect(MUTABLE_NOTIFICATION_TYPES).toContain(NOTIFICATION_TYPES.FEE_PAID)
      expect(MUTABLE_NOTIFICATION_TYPES).toContain(NOTIFICATION_TYPES.DOCUMENT_APPROVED)
    })

    it('should have Vietnamese labels for all types', () => {
      const allTypes = Object.values(NOTIFICATION_TYPES)
      for (const type of allTypes) {
        expect(NOTIFICATION_TYPE_LABELS[type]).toBeDefined()
        expect(NOTIFICATION_TYPE_LABELS[type].length).toBeGreaterThan(0)
      }
    })

    it('should have default preferences with empty mutedTypes', () => {
      expect(DEFAULT_PREFERENCES).toEqual({ mutedTypes: [] })
    })
  })

  describe('getUserNotificationPreferences', () => {
    it('should return default preferences when user has no prefs stored', async () => {
      ;(db as any).user.findUnique.mockResolvedValue({ notificationPrefs: null })

      const prefs = await getUserNotificationPreferences(db, 'user-1')

      expect(prefs).toEqual({ mutedTypes: [] })
    })

    it('should return stored preferences', async () => {
      ;(db as any).user.findUnique.mockResolvedValue({
        notificationPrefs: { mutedTypes: ['EVENT_REMINDER', 'FEE_PAID'] },
      })

      const prefs = await getUserNotificationPreferences(db, 'user-1')

      expect(prefs.mutedTypes).toContain('EVENT_REMINDER')
      expect(prefs.mutedTypes).toContain('FEE_PAID')
    })

    it('should filter out invalid types from stored preferences', async () => {
      ;(db as any).user.findUnique.mockResolvedValue({
        notificationPrefs: { mutedTypes: ['EVENT_REMINDER', 'INVALID_TYPE', 'DOCUMENT_OVERDUE'] },
      })

      const prefs = await getUserNotificationPreferences(db, 'user-1')

      // Only EVENT_REMINDER is valid mutable type
      expect(prefs.mutedTypes).toEqual(['EVENT_REMINDER'])
    })

    it('should return default when user not found', async () => {
      ;(db as any).user.findUnique.mockResolvedValue(null)

      const prefs = await getUserNotificationPreferences(db, 'nonexistent')

      expect(prefs).toEqual({ mutedTypes: [] })
    })
  })

  describe('updateUserNotificationPreferences', () => {
    it('should save valid mutable types', async () => {
      ;(db as any).user.update.mockResolvedValue({})

      const prefs = await updateUserNotificationPreferences(db, 'user-1', [
        'EVENT_REMINDER',
        'TASK_ASSIGNED',
      ])

      expect(prefs.mutedTypes).toEqual(['EVENT_REMINDER', 'TASK_ASSIGNED'])
      expect((db as any).user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { notificationPrefs: { mutedTypes: ['EVENT_REMINDER', 'TASK_ASSIGNED'] } },
      })
    })

    it('should silently ignore critical types', async () => {
      ;(db as any).user.update.mockResolvedValue({})

      const prefs = await updateUserNotificationPreferences(db, 'user-1', [
        'EVENT_REMINDER',
        'DOCUMENT_OVERDUE', // critical — should be ignored
        'FEE_OVERDUE',      // critical — should be ignored
      ])

      expect(prefs.mutedTypes).toEqual(['EVENT_REMINDER'])
    })

    it('should silently ignore invalid types', async () => {
      ;(db as any).user.update.mockResolvedValue({})

      const prefs = await updateUserNotificationPreferences(db, 'user-1', [
        'TASK_ASSIGNED',
        'TOTALLY_FAKE_TYPE',
      ])

      expect(prefs.mutedTypes).toEqual(['TASK_ASSIGNED'])
    })

    it('should allow empty array (unmute all)', async () => {
      ;(db as any).user.update.mockResolvedValue({})

      const prefs = await updateUserNotificationPreferences(db, 'user-1', [])

      expect(prefs.mutedTypes).toEqual([])
    })
  })

  describe('getPreferencesList', () => {
    it('should return all types with correct structure', () => {
      const items = getPreferencesList({ mutedTypes: [] })

      expect(items.length).toBe(Object.keys(NOTIFICATION_TYPES).length)
      for (const item of items) {
        expect(item).toHaveProperty('type')
        expect(item).toHaveProperty('label')
        expect(item).toHaveProperty('muted')
        expect(item).toHaveProperty('critical')
      }
    })

    it('should mark muted types correctly', () => {
      const items = getPreferencesList({ mutedTypes: ['EVENT_REMINDER'] })

      const eventItem = items.find((i) => i.type === 'EVENT_REMINDER')
      expect(eventItem?.muted).toBe(true)

      const taskItem = items.find((i) => i.type === 'TASK_ASSIGNED')
      expect(taskItem?.muted).toBe(false)
    })

    it('should mark critical types correctly', () => {
      const items = getPreferencesList({ mutedTypes: [] })

      const criticalItem = items.find((i) => i.type === 'DOCUMENT_OVERDUE')
      expect(criticalItem?.critical).toBe(true)

      const mutableItem = items.find((i) => i.type === 'EVENT_REMINDER')
      expect(mutableItem?.critical).toBe(false)
    })
  })

  describe('isTypeMuted', () => {
    it('should return true for muted non-critical types', () => {
      expect(isTypeMuted({ mutedTypes: ['EVENT_REMINDER'] }, 'EVENT_REMINDER')).toBe(true)
    })

    it('should return false for non-muted types', () => {
      expect(isTypeMuted({ mutedTypes: ['EVENT_REMINDER'] }, 'TASK_ASSIGNED')).toBe(false)
    })

    it('should NEVER return true for critical types even if in mutedTypes', () => {
      // Even if somehow a critical type ends up in mutedTypes, isTypeMuted should return false
      const prefs = { mutedTypes: ['DOCUMENT_OVERDUE' as any] }
      expect(isTypeMuted(prefs, 'DOCUMENT_OVERDUE')).toBe(false)
    })

    it('should return false for empty mutedTypes', () => {
      expect(isTypeMuted({ mutedTypes: [] }, 'EVENT_REMINDER')).toBe(false)
    })
  })
})
