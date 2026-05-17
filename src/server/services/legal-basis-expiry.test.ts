import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runExpiryCheck,
  getExpiringLegalBases,
  DEFAULT_EXPIRY_THRESHOLDS,
  DEFAULT_VERIFICATION_MAX_DAYS,
} from './legal-basis-expiry'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    legalBasis: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notification: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

type MockDb = ReturnType<typeof createMockDb>

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function makeLegalBasis(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lb-1',
    documentNumber: '93/2025/QH15',
    title: 'Luật Khoa học và Công nghệ',
    issuingAuth: 'Quốc hội',
    effectiveDate: new Date('2025-01-01'),
    expiryDate: null,
    status: 'ACTIVE',
    basisType: 'law',
    scope: 'mandatory',
    summary: null,
    fullTextUrl: null,
    lastVerified: new Date(),
    verifiedBy: 'user-1',
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('legal-basis-expiry service', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('runExpiryCheck', () => {
    it('should return empty alerts when no bases are expiring or expired', async () => {
      // All findMany calls return empty
      mockDb.legalBasis.findMany.mockResolvedValue([])

      const result = await runExpiryCheck(mockDb as any)

      expect(result.alerts).toHaveLength(0)
      expect(result.updatedToExpiring).toBe(0)
      expect(result.updatedToExpired).toBe(0)
      expect(result.notificationsCreated).toBe(0)
    })

    it('should detect and update expired legal bases', async () => {
      const expiredBasis = makeLegalBasis({
        id: 'lb-expired',
        expiryDate: daysAgo(5), // expired 5 days ago
        status: 'ACTIVE',
      })

      // First call: expired bases
      // Second call: expiring bases
      // Third call: unverified bases
      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([expiredBasis]) // expired
        .mockResolvedValueOnce([])             // expiring
        .mockResolvedValueOnce([])             // unverified

      const result = await runExpiryCheck(mockDb as any)

      expect(result.updatedToExpired).toBe(1)
      expect(result.alerts).toHaveLength(1)
      expect(result.alerts[0]!.alertType).toBe('EXPIRED')
      expect(result.alerts[0]!.legalBasisId).toBe('lb-expired')

      // Verify status was updated
      expect(mockDb.legalBasis.update).toHaveBeenCalledWith({
        where: { id: 'lb-expired' },
        data: { status: 'EXPIRED' },
      })
    })

    it('should detect and update expiring legal bases within threshold', async () => {
      const expiringBasis = makeLegalBasis({
        id: 'lb-expiring',
        expiryDate: daysFromNow(25), // expires in 25 days (within 30-day threshold)
        status: 'ACTIVE',
      })

      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([])              // expired
        .mockResolvedValueOnce([expiringBasis]) // expiring
        .mockResolvedValueOnce([])              // unverified

      const result = await runExpiryCheck(mockDb as any)

      expect(result.updatedToExpiring).toBe(1)
      expect(result.alerts).toHaveLength(1)
      expect(result.alerts[0]!.alertType).toBe('EXPIRING')
      expect(result.alerts[0]!.daysUntilExpiry).toBeLessThanOrEqual(25)

      expect(mockDb.legalBasis.update).toHaveBeenCalledWith({
        where: { id: 'lb-expiring' },
        data: { status: 'EXPIRING' },
      })
    })

    it('should detect unverified legal bases', async () => {
      const unverifiedBasis = makeLegalBasis({
        id: 'lb-unverified',
        lastVerified: daysAgo(200), // not verified for 200 days
        status: 'ACTIVE',
      })

      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([])               // expired
        .mockResolvedValueOnce([])               // expiring
        .mockResolvedValueOnce([unverifiedBasis]) // unverified

      const result = await runExpiryCheck(mockDb as any)

      expect(result.alerts).toHaveLength(1)
      expect(result.alerts[0]!.alertType).toBe('VERIFICATION_OVERDUE')
      expect(result.alerts[0]!.daysSinceVerification).toBeGreaterThanOrEqual(200)
    })

    it('should detect bases that have never been verified', async () => {
      const neverVerifiedBasis = makeLegalBasis({
        id: 'lb-never-verified',
        lastVerified: null,
        status: 'ACTIVE',
      })

      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([])                    // expired
        .mockResolvedValueOnce([])                    // expiring
        .mockResolvedValueOnce([neverVerifiedBasis])  // unverified

      const result = await runExpiryCheck(mockDb as any)

      expect(result.alerts).toHaveLength(1)
      expect(result.alerts[0]!.alertType).toBe('VERIFICATION_OVERDUE')
      expect(result.alerts[0]!.daysSinceVerification).toBeUndefined()
    })

    it('should create notifications for Legal_Officer users', async () => {
      const expiredBasis = makeLegalBasis({
        id: 'lb-expired',
        expiryDate: daysAgo(1),
        status: 'ACTIVE',
      })

      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([expiredBasis])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      // Two Legal Officers
      mockDb.userRole.findMany.mockResolvedValue([
        { userId: 'user-legal-1' },
        { userId: 'user-legal-2' },
      ])

      const result = await runExpiryCheck(mockDb as any)

      // 1 alert × 2 Legal Officers = 2 notifications
      expect(result.notificationsCreated).toBe(2)
      expect(mockDb.notification.create).toHaveBeenCalledTimes(2)

      // Verify notification content is in Vietnamese
      const firstCall = mockDb.notification.create.mock.calls[0]![0]
      expect(firstCall.data.type).toBe('LEGAL_BASIS_EXPIRED')
      expect(firstCall.data.title).toContain('hết hiệu lực')
      expect(firstCall.data.link).toBe('/legal-basis/lb-expired')
    })

    it('should use custom config for thresholds', async () => {
      const expiringBasis = makeLegalBasis({
        id: 'lb-custom',
        expiryDate: daysFromNow(50), // 50 days from now
        status: 'ACTIVE',
      })

      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([])              // expired
        .mockResolvedValueOnce([expiringBasis]) // expiring (within 60-day custom threshold)
        .mockResolvedValueOnce([])              // unverified

      const result = await runExpiryCheck(mockDb as any, {
        expiryWarningDays: [60],
        verificationMaxDays: 365,
      })

      expect(result.updatedToExpiring).toBe(1)
      expect(result.alerts[0]!.alertType).toBe('EXPIRING')
    })

    it('should not create notifications when no Legal_Officer exists', async () => {
      const expiredBasis = makeLegalBasis({
        id: 'lb-expired',
        expiryDate: daysAgo(1),
        status: 'ACTIVE',
      })

      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([expiredBasis])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      mockDb.userRole.findMany.mockResolvedValue([]) // No Legal Officers

      const result = await runExpiryCheck(mockDb as any)

      expect(result.notificationsCreated).toBe(0)
      expect(mockDb.notification.create).not.toHaveBeenCalled()
    })

    it('should handle multiple alerts of different types', async () => {
      const expired = makeLegalBasis({ id: 'lb-1', expiryDate: daysAgo(10), status: 'ACTIVE' })
      const expiring = makeLegalBasis({ id: 'lb-2', expiryDate: daysFromNow(20), status: 'ACTIVE' })
      const unverified = makeLegalBasis({ id: 'lb-3', lastVerified: daysAgo(200), status: 'ACTIVE' })

      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([expired])
        .mockResolvedValueOnce([expiring])
        .mockResolvedValueOnce([unverified])

      mockDb.userRole.findMany.mockResolvedValue([{ userId: 'user-legal-1' }])

      const result = await runExpiryCheck(mockDb as any)

      expect(result.alerts).toHaveLength(3)
      expect(result.updatedToExpired).toBe(1)
      expect(result.updatedToExpiring).toBe(1)
      // 3 alerts × 1 Legal Officer = 3 notifications
      expect(result.notificationsCreated).toBe(3)
    })
  })

  describe('getExpiringLegalBases', () => {
    it('should query bases expiring within specified days', async () => {
      const basis = makeLegalBasis({ expiryDate: daysFromNow(15) })
      mockDb.legalBasis.findMany.mockResolvedValue([basis])

      const result = await getExpiringLegalBases(mockDb as any, 30)

      expect(result).toHaveLength(1)
      expect(mockDb.legalBasis.findMany).toHaveBeenCalledWith({
        where: {
          expiryDate: { gte: expect.any(Date), lte: expect.any(Date) },
          status: { in: ['ACTIVE', 'EXPIRING'] },
        },
        orderBy: { expiryDate: 'asc' },
      })
    })

    it('should return empty array when no bases are expiring', async () => {
      mockDb.legalBasis.findMany.mockResolvedValue([])

      const result = await getExpiringLegalBases(mockDb as any, 90)

      expect(result).toHaveLength(0)
    })
  })

  describe('notification content (Vietnamese)', () => {
    it('should generate Vietnamese notification for EXPIRED alert', async () => {
      const expired = makeLegalBasis({
        id: 'lb-1',
        title: 'Nghị định 08/2014/NĐ-CP',
        documentNumber: '08/2014/NĐ-CP',
        expiryDate: daysAgo(1),
        status: 'ACTIVE',
      })

      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([expired])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      mockDb.userRole.findMany.mockResolvedValue([{ userId: 'user-1' }])

      await runExpiryCheck(mockDb as any)

      const notifData = mockDb.notification.create.mock.calls[0]![0].data
      expect(notifData.title).toBe('Căn cứ pháp lý đã hết hiệu lực')
      expect(notifData.message).toContain('Nghị định 08/2014/NĐ-CP')
      expect(notifData.message).toContain('08/2014/NĐ-CP')
      expect(notifData.message).toContain('hết hiệu lực')
    })

    it('should generate Vietnamese notification for EXPIRING alert', async () => {
      const expiring = makeLegalBasis({
        id: 'lb-2',
        title: 'Thông tư 03/2014/TT-BKHCN',
        documentNumber: '03/2014/TT-BKHCN',
        expiryDate: daysFromNow(28),
        status: 'ACTIVE',
      })

      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([expiring])
        .mockResolvedValueOnce([])

      mockDb.userRole.findMany.mockResolvedValue([{ userId: 'user-1' }])

      await runExpiryCheck(mockDb as any)

      const notifData = mockDb.notification.create.mock.calls[0]![0].data
      expect(notifData.title).toBe('Căn cứ pháp lý sắp hết hiệu lực')
      expect(notifData.message).toContain('Thông tư 03/2014/TT-BKHCN')
      expect(notifData.message).toContain('ngày')
    })

    it('should generate Vietnamese notification for VERIFICATION_OVERDUE alert', async () => {
      const unverified = makeLegalBasis({
        id: 'lb-3',
        title: 'Luật Doanh nghiệp',
        documentNumber: '59/2020/QH14',
        lastVerified: daysAgo(200),
        status: 'ACTIVE',
      })

      mockDb.legalBasis.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([unverified])

      mockDb.userRole.findMany.mockResolvedValue([{ userId: 'user-1' }])

      await runExpiryCheck(mockDb as any)

      const notifData = mockDb.notification.create.mock.calls[0]![0].data
      expect(notifData.title).toBe('Căn cứ pháp lý cần xác minh lại')
      expect(notifData.message).toContain('Luật Doanh nghiệp')
      expect(notifData.message).toContain('xác minh')
    })
  })
})
