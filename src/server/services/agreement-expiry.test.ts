import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAgreementExpiryCheck, getExpiringAgreements } from './agreement-expiry'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    membershipAgreement: {
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

function makeAgreement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agr-1',
    enterpriseId: 'ent-1',
    tierId: 'tier-1',
    effectiveDate: daysAgo(365),
    expiryDate: daysFromNow(45),
    annualFee: 50000000,
    signedFileUrl: 'https://s3.example.com/signed.pdf',
    status: 'active',
    createdAt: daysAgo(365),
    enterprise: { id: 'ent-1', legalNameVi: 'Công ty ABC' },
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('agreement-expiry service', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('runAgreementExpiryCheck', () => {
    it('should return empty result when no agreements are expiring or expired', async () => {
      mockDb.membershipAgreement.findMany.mockResolvedValue([])

      const result = await runAgreementExpiryCheck(mockDb as any)

      expect(result.alerts).toHaveLength(0)
      expect(result.updatedToExpired).toBe(0)
      expect(result.notificationsCreated).toBe(0)
    })

    it('should detect and mark expired agreements (expiryDate < now, status = active)', async () => {
      const expiredAgreement = makeAgreement({
        id: 'agr-expired',
        expiryDate: daysAgo(5),
        status: 'active',
      })

      // First call: expired agreements query
      mockDb.membershipAgreement.findMany
        .mockResolvedValueOnce([expiredAgreement]) // expired query
        .mockResolvedValueOnce([]) // expiring query

      const result = await runAgreementExpiryCheck(mockDb as any)

      expect(result.updatedToExpired).toBe(1)
      expect(result.alerts).toHaveLength(1)
      expect(result.alerts[0]!.alertType).toBe('EXPIRED')
      expect(result.alerts[0]!.agreementId).toBe('agr-expired')

      expect(mockDb.membershipAgreement.update).toHaveBeenCalledWith({
        where: { id: 'agr-expired' },
        data: { status: 'expired' },
      })
    })

    it('should detect agreements expiring within threshold (default 60 days)', async () => {
      const expiringAgreement = makeAgreement({
        id: 'agr-expiring',
        expiryDate: daysFromNow(25), // within 60 days
        status: 'active',
      })

      mockDb.membershipAgreement.findMany
        .mockResolvedValueOnce([]) // no expired
        .mockResolvedValueOnce([expiringAgreement]) // expiring

      const result = await runAgreementExpiryCheck(mockDb as any)

      expect(result.alerts).toHaveLength(1)
      expect(result.alerts[0]!.alertType).toBe('EXPIRING')
      expect(result.alerts[0]!.daysUntilExpiry).toBeLessThanOrEqual(60)
    })

    it('should create notifications for Legal_Officer users', async () => {
      const expiringAgreement = makeAgreement({
        id: 'agr-1',
        expiryDate: daysFromNow(20),
      })

      mockDb.membershipAgreement.findMany
        .mockResolvedValueOnce([]) // no expired
        .mockResolvedValueOnce([expiringAgreement]) // expiring

      mockDb.userRole.findMany.mockResolvedValue([
        { userId: 'legal-1' },
        { userId: 'legal-2' },
      ])

      const result = await runAgreementExpiryCheck(mockDb as any)

      // 1 alert × 2 Legal Officers = 2 notifications
      expect(result.notificationsCreated).toBe(2)
      expect(mockDb.notification.create).toHaveBeenCalledTimes(2)

      const firstCall = mockDb.notification.create.mock.calls[0]![0]
      expect(firstCall.data.type).toBe('AGREEMENT_EXPIRING')
      expect(firstCall.data.title).toContain('sắp hết hạn')
      expect(firstCall.data.message).toContain('Công ty ABC')
    })

    it('should NOT create notifications when no Legal_Officer users exist', async () => {
      const expiredAgreement = makeAgreement({
        expiryDate: daysAgo(2),
        status: 'active',
      })

      mockDb.membershipAgreement.findMany
        .mockResolvedValueOnce([expiredAgreement])
        .mockResolvedValueOnce([])

      mockDb.userRole.findMany.mockResolvedValue([]) // no legal officers

      const result = await runAgreementExpiryCheck(mockDb as any)

      expect(result.updatedToExpired).toBe(1)
      expect(result.notificationsCreated).toBe(0)
    })

    it('should handle multiple expired and expiring agreements', async () => {
      const expired1 = makeAgreement({ id: 'agr-exp-1', expiryDate: daysAgo(10), status: 'active' })
      const expired2 = makeAgreement({ id: 'agr-exp-2', expiryDate: daysAgo(3), status: 'active' })
      const expiring1 = makeAgreement({ id: 'agr-ing-1', expiryDate: daysFromNow(15) })

      mockDb.membershipAgreement.findMany
        .mockResolvedValueOnce([expired1, expired2])
        .mockResolvedValueOnce([expiring1])

      const result = await runAgreementExpiryCheck(mockDb as any)

      expect(result.updatedToExpired).toBe(2)
      expect(result.alerts).toHaveLength(3)
      expect(mockDb.membershipAgreement.update).toHaveBeenCalledTimes(2)
    })
  })

  describe('getExpiringAgreements', () => {
    it('should query agreements expiring within specified days', async () => {
      const agreement = makeAgreement({ expiryDate: daysFromNow(30) })
      mockDb.membershipAgreement.findMany.mockResolvedValue([agreement])

      const result = await getExpiringAgreements(mockDb as any, 60)

      expect(result).toHaveLength(1)
      expect(mockDb.membershipAgreement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'active',
          }),
          orderBy: { expiryDate: 'asc' },
        })
      )
    })

    it('should return empty array when no agreements are expiring', async () => {
      mockDb.membershipAgreement.findMany.mockResolvedValue([])

      const result = await getExpiringAgreements(mockDb as any, 30)

      expect(result).toHaveLength(0)
    })
  })
})
