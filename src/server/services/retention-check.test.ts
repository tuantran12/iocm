import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseRetentionPeriod,
  checkRetentionForType,
  createArchivalWarnings,
  RETENTION_NOTIFICATION_TYPES,
  RETENTION_NOTIFICATION_TITLES,
  type RetentionItem,
} from './retention-check'

// ─── Mock Prisma Client ───────────────────────────────────────────────────────

function createMockDb() {
  return {
    retentionRule: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    documentItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    chatMessage: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    },
    consentRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    role: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Retention Check Service', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
    vi.clearAllMocks()
  })

  // ─── parseRetentionPeriod ─────────────────────────────────────────────────

  describe('parseRetentionPeriod', () => {
    it('should parse days correctly', () => {
      expect(parseRetentionPeriod('30d')).toBe(30)
      expect(parseRetentionPeriod('365d')).toBe(365)
      expect(parseRetentionPeriod('7d')).toBe(7)
    })

    it('should parse months correctly (1 month = 30 days)', () => {
      expect(parseRetentionPeriod('6m')).toBe(180)
      expect(parseRetentionPeriod('12m')).toBe(360)
      expect(parseRetentionPeriod('1m')).toBe(30)
    })

    it('should parse years correctly (1 year = 365 days)', () => {
      expect(parseRetentionPeriod('1y')).toBe(365)
      expect(parseRetentionPeriod('2y')).toBe(730)
      expect(parseRetentionPeriod('5y')).toBe(1825)
    })

    it('should return 365 for invalid format', () => {
      expect(parseRetentionPeriod('invalid')).toBe(365)
      expect(parseRetentionPeriod('')).toBe(365)
      expect(parseRetentionPeriod('abc')).toBe(365)
    })

    it('should handle whitespace', () => {
      expect(parseRetentionPeriod(' 30d ')).toBe(30)
      expect(parseRetentionPeriod(' 2y ')).toBe(730)
    })
  })


  // ─── checkRetentionForType ──────────────────────────────────────────────────

  describe('checkRetentionForType', () => {
    it('should return empty result when no retention rule exists', async () => {
      db.retentionRule.findUnique.mockResolvedValue(null)

      const result = await checkRetentionForType(db, 'DocumentItem')

      expect(result.objectType).toBe('DocumentItem')
      expect(result.retentionPeriod).toBe('N/A')
      expect(result.totalItemsChecked).toBe(0)
      expect(result.itemsDueForAction).toHaveLength(0)
    })

    it('should return empty result for unsupported objectType', async () => {
      db.retentionRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        objectType: 'UnknownType',
        retentionPeriod: '30d',
        approvalNeeded: true,
        archiveMethod: null,
        deletionMethod: null,
      })

      const result = await checkRetentionForType(db, 'UnknownType')

      expect(result.objectType).toBe('UnknownType')
      expect(result.retentionPeriod).toBe('30d')
      expect(result.totalItemsChecked).toBe(0)
      expect(result.itemsDueForAction).toHaveLength(0)
    })

    it('should find DocumentItem items older than retention period', async () => {
      const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) // 400 days ago
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago

      db.retentionRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        objectType: 'DocumentItem',
        retentionPeriod: '1y',
        approvalNeeded: true,
        archiveMethod: 'cold_storage',
        deletionMethod: 'permanent_delete',
        legalBasis: 'NĐ 01/2025',
      })

      db.documentItem.findMany.mockResolvedValue([
        { id: 'doc-1', name: 'Tài liệu cũ', createdAt: oldDate },
        { id: 'doc-2', name: 'Tài liệu mới', createdAt: recentDate },
      ])

      const result = await checkRetentionForType(db, 'DocumentItem')

      expect(result.objectType).toBe('DocumentItem')
      expect(result.retentionPeriod).toBe('1y')
      expect(result.totalItemsChecked).toBe(2)
      expect(result.itemsDueForAction).toHaveLength(1)
      expect(result.itemsDueForAction[0]!.id).toBe('doc-1')
      expect(result.itemsDueForAction[0]!.name).toBe('Tài liệu cũ')
      expect(result.itemsDueForAction[0]!.daysOverRetention).toBeGreaterThan(0)
      expect(result.approvalNeeded).toBe(true)
      expect(result.archiveMethod).toBe('cold_storage')
      expect(result.deletionMethod).toBe('permanent_delete')
    })

    it('should return no items when all are within retention period', async () => {
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)

      db.retentionRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        objectType: 'DocumentItem',
        retentionPeriod: '1y',
        approvalNeeded: false,
        archiveMethod: 'archive',
        deletionMethod: null,
      })

      db.documentItem.findMany.mockResolvedValue([
        { id: 'doc-1', name: 'Doc mới', createdAt: recentDate },
      ])

      const result = await checkRetentionForType(db, 'DocumentItem')

      expect(result.totalItemsChecked).toBe(1)
      expect(result.itemsDueForAction).toHaveLength(0)
    })

    it('should handle ChatMessage objectType', async () => {
      const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days ago

      db.retentionRule.findUnique.mockResolvedValue({
        id: 'rule-2',
        objectType: 'ChatMessage',
        retentionPeriod: '30d',
        approvalNeeded: false,
        archiveMethod: 'compress_archive',
        deletionMethod: null,
      })

      db.chatMessage.findMany.mockResolvedValue([
        { id: 'msg-1', content: 'Tin nhắn cũ cần lưu trữ', createdAt: oldDate },
      ])

      const result = await checkRetentionForType(db, 'ChatMessage')

      expect(result.totalItemsChecked).toBe(1)
      expect(result.itemsDueForAction).toHaveLength(1)
      expect(result.itemsDueForAction[0]!.name).toBe('Tin nhắn cũ cần lưu trữ')
      expect(result.approvalNeeded).toBe(false)
    })
  })


  // ─── createArchivalWarnings ─────────────────────────────────────────────────

  describe('createArchivalWarnings', () => {
    const sampleItems: RetentionItem[] = [
      { id: 'item-1', name: 'Tài liệu A', createdAt: new Date('2022-01-01'), daysOverRetention: 30 },
      { id: 'item-2', name: 'Tài liệu B', createdAt: new Date('2022-02-01'), daysOverRetention: 15 },
    ]

    it('should return 0 warnings when items list is empty', async () => {
      const result = await createArchivalWarnings(db, [], {
        objectType: 'DocumentItem',
        approvalNeeded: true,
        archiveMethod: null,
        deletionMethod: null,
      })

      expect(result.warningsCreated).toBe(0)
      expect(result.autoArchived).toBe(0)
      expect(result.pendingApproval).toBe(0)
    })

    it('should return 0 warnings when no DPO/System_Admin roles exist', async () => {
      db.role.findMany.mockResolvedValue([])

      const result = await createArchivalWarnings(db, sampleItems, {
        objectType: 'DocumentItem',
        approvalNeeded: true,
        archiveMethod: null,
        deletionMethod: 'permanent_delete',
      })

      expect(result.warningsCreated).toBe(0)
    })

    it('should return 0 warnings when no users have DPO/System_Admin roles', async () => {
      db.role.findMany.mockResolvedValue([
        { id: 'role-dpo', name: 'DPO' },
        { id: 'role-admin', name: 'System_Admin' },
      ])
      db.userRole.findMany.mockResolvedValue([])

      const result = await createArchivalWarnings(db, sampleItems, {
        objectType: 'DocumentItem',
        approvalNeeded: true,
        archiveMethod: null,
        deletionMethod: 'permanent_delete',
      })

      expect(result.warningsCreated).toBe(0)
    })

    it('should create DELETION_PENDING_APPROVAL notifications when approvalNeeded is true', async () => {
      db.role.findMany.mockResolvedValue([
        { id: 'role-dpo', name: 'DPO' },
        { id: 'role-admin', name: 'System_Admin' },
      ])
      db.userRole.findMany.mockResolvedValue([
        { userId: 'dpo-user-1' },
        { userId: 'admin-user-1' },
      ])

      const result = await createArchivalWarnings(db, sampleItems, {
        objectType: 'DocumentItem',
        approvalNeeded: true,
        archiveMethod: null,
        deletionMethod: 'permanent_delete',
      })

      expect(result.warningsCreated).toBe(2) // 2 users
      expect(result.pendingApproval).toBe(2) // 2 items pending
      expect(result.autoArchived).toBe(0)

      // Verify notification content
      const firstCall = db.notification.create.mock.calls[0][0]
      expect(firstCall.data.type).toBe(RETENTION_NOTIFICATION_TYPES.DELETION_PENDING_APPROVAL)
      expect(firstCall.data.title).toBe(RETENTION_NOTIFICATION_TITLES.DELETION_PENDING_APPROVAL)
      expect(firstCall.data.message).toContain('2 mục')
      expect(firstCall.data.message).toContain('DocumentItem')
      expect(firstCall.data.message).toContain('phê duyệt')
      expect(firstCall.data.message).toContain('permanent_delete')
      expect(firstCall.data.link).toBe('/settings/retention?objectType=DocumentItem')
    })

    it('should create AUTO_ARCHIVED notifications when approvalNeeded is false', async () => {
      db.role.findMany.mockResolvedValue([
        { id: 'role-dpo', name: 'DPO' },
      ])
      db.userRole.findMany.mockResolvedValue([
        { userId: 'dpo-user-1' },
      ])

      const result = await createArchivalWarnings(db, sampleItems, {
        objectType: 'ChatMessage',
        approvalNeeded: false,
        archiveMethod: 'compress_archive',
        deletionMethod: null,
      })

      expect(result.warningsCreated).toBe(1)
      expect(result.autoArchived).toBe(2) // 2 items auto-archived
      expect(result.pendingApproval).toBe(0)

      const firstCall = db.notification.create.mock.calls[0][0]
      expect(firstCall.data.type).toBe(RETENTION_NOTIFICATION_TYPES.AUTO_ARCHIVED)
      expect(firstCall.data.title).toBe(RETENTION_NOTIFICATION_TITLES.AUTO_ARCHIVED)
      expect(firstCall.data.message).toContain('tự động lưu trữ')
      expect(firstCall.data.message).toContain('compress_archive')
    })

    it('should be idempotent — skip if already notified today', async () => {
      db.role.findMany.mockResolvedValue([{ id: 'role-dpo', name: 'DPO' }])
      db.userRole.findMany.mockResolvedValue([{ userId: 'dpo-user-1' }])
      db.notification.findFirst.mockResolvedValue({ id: 'existing-notif' })

      const result = await createArchivalWarnings(db, sampleItems, {
        objectType: 'DocumentItem',
        approvalNeeded: true,
        archiveMethod: null,
        deletionMethod: 'permanent_delete',
      })

      expect(result.warningsCreated).toBe(0)
      expect(db.notification.create).not.toHaveBeenCalled()
    })

    it('should deduplicate user IDs when same user has multiple roles', async () => {
      db.role.findMany.mockResolvedValue([
        { id: 'role-dpo', name: 'DPO' },
        { id: 'role-admin', name: 'System_Admin' },
      ])
      // Same user has both DPO and System_Admin
      db.userRole.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-1' },
      ])

      const result = await createArchivalWarnings(db, sampleItems, {
        objectType: 'DocumentItem',
        approvalNeeded: true,
        archiveMethod: null,
        deletionMethod: null,
      })

      expect(result.warningsCreated).toBe(1) // Only 1 notification for deduplicated user
      expect(db.notification.create).toHaveBeenCalledTimes(1)
    })
  })
})
