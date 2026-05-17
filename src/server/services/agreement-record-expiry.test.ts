import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgreementStatus } from '@prisma/client'
import { runAgreementRecordExpiryCheck } from './agreement-record-expiry'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    agreementRecord: {
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

function makeAgreementRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agr-rec-1',
    type: 'NDA',
    title: 'NDA với Công ty XYZ',
    partyA: 'Viện',
    partyB: 'Công ty XYZ',
    status: AgreementStatus.ACTIVE,
    effectiveDate: daysAgo(180),
    expiryDate: daysFromNow(45),
    keyObligations: [],
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('agreement-record-expiry service', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  it('should return empty result when no agreements are expiring or expired', async () => {
    mockDb.agreementRecord.findMany.mockResolvedValue([])

    const result = await runAgreementRecordExpiryCheck(mockDb as any)

    expect(result.alerts).toHaveLength(0)
    expect(result.updatedToExpired).toBe(0)
    expect(result.updatedToExpiring).toBe(0)
    expect(result.notificationsCreated).toBe(0)
  })

  it('should detect and mark expired agreements (expiryDate < now)', async () => {
    const expired = makeAgreementRecord({
      id: 'agr-expired',
      expiryDate: daysAgo(5),
      status: AgreementStatus.ACTIVE,
    })

    mockDb.agreementRecord.findMany
      .mockResolvedValueOnce([expired]) // expired query
      .mockResolvedValueOnce([]) // expiring query

    const result = await runAgreementRecordExpiryCheck(mockDb as any)

    expect(result.updatedToExpired).toBe(1)
    expect(result.alerts).toHaveLength(1)
    expect(result.alerts[0]!.alertType).toBe('EXPIRED')
    expect(mockDb.agreementRecord.update).toHaveBeenCalledWith({
      where: { id: 'agr-expired' },
      data: { status: AgreementStatus.EXPIRED },
    })
  })

  it('should detect agreements expiring within threshold (default 90 days)', async () => {
    const expiring = makeAgreementRecord({
      id: 'agr-expiring',
      expiryDate: daysFromNow(25),
      status: AgreementStatus.ACTIVE,
    })

    mockDb.agreementRecord.findMany
      .mockResolvedValueOnce([]) // no expired
      .mockResolvedValueOnce([expiring]) // expiring

    const result = await runAgreementRecordExpiryCheck(mockDb as any)

    expect(result.updatedToExpiring).toBe(1)
    expect(result.alerts).toHaveLength(1)
    expect(result.alerts[0]!.alertType).toBe('EXPIRING')
    expect(mockDb.agreementRecord.update).toHaveBeenCalledWith({
      where: { id: 'agr-expiring' },
      data: { status: AgreementStatus.EXPIRING },
    })
  })

  it('should create notifications for Legal_Officer users', async () => {
    const expiring = makeAgreementRecord({
      id: 'agr-1',
      expiryDate: daysFromNow(20),
    })

    mockDb.agreementRecord.findMany
      .mockResolvedValueOnce([]) // no expired
      .mockResolvedValueOnce([expiring]) // expiring

    mockDb.userRole.findMany.mockResolvedValue([
      { userId: 'legal-1' },
      { userId: 'legal-2' },
    ])

    const result = await runAgreementRecordExpiryCheck(mockDb as any)

    expect(result.notificationsCreated).toBe(2)
    expect(mockDb.notification.create).toHaveBeenCalledTimes(2)

    const firstCall = mockDb.notification.create.mock.calls[0]![0]
    expect(firstCall.data.type).toBe('AGREEMENT_RECORD_EXPIRING')
    expect(firstCall.data.title).toContain('sắp hết hạn')
    expect(firstCall.data.message).toContain('Công ty XYZ')
  })

  it('should use custom expiry warning days', async () => {
    const expiring = makeAgreementRecord({
      id: 'agr-custom',
      expiryDate: daysFromNow(10),
      status: AgreementStatus.ACTIVE,
    })

    mockDb.agreementRecord.findMany
      .mockResolvedValueOnce([]) // no expired
      .mockResolvedValueOnce([expiring]) // expiring within 15 days

    const result = await runAgreementRecordExpiryCheck(mockDb as any, {
      expiryWarningDays: [15],
    })

    expect(result.alerts).toHaveLength(1)
    expect(result.updatedToExpiring).toBe(1)
  })

  it('should handle multiple expired and expiring agreements', async () => {
    const expired1 = makeAgreementRecord({ id: 'exp-1', expiryDate: daysAgo(10), status: AgreementStatus.ACTIVE })
    const expired2 = makeAgreementRecord({ id: 'exp-2', expiryDate: daysAgo(3), status: AgreementStatus.EXPIRING })
    const expiring1 = makeAgreementRecord({ id: 'ing-1', expiryDate: daysFromNow(15), status: AgreementStatus.ACTIVE })

    mockDb.agreementRecord.findMany
      .mockResolvedValueOnce([expired1, expired2])
      .mockResolvedValueOnce([expiring1])

    const result = await runAgreementRecordExpiryCheck(mockDb as any)

    expect(result.updatedToExpired).toBe(2)
    expect(result.updatedToExpiring).toBe(1)
    expect(result.alerts).toHaveLength(3)
  })

  it('should NOT create notifications when no Legal_Officer users exist', async () => {
    const expired = makeAgreementRecord({ expiryDate: daysAgo(2), status: AgreementStatus.ACTIVE })

    mockDb.agreementRecord.findMany
      .mockResolvedValueOnce([expired])
      .mockResolvedValueOnce([])

    mockDb.userRole.findMany.mockResolvedValue([])

    const result = await runAgreementRecordExpiryCheck(mockDb as any)

    expect(result.updatedToExpired).toBe(1)
    expect(result.notificationsCreated).toBe(0)
  })
})
