import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runOverdueCheck, getOverdueFees } from './fee-overdue'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    membershipFee: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    enterpriseMember: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function makeFee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fee-1',
    enterpriseId: 'ent-1',
    year: 2024,
    amountDue: 10000000,
    amountPaid: 0,
    invoiceNumber: 'INV-2024-001',
    dueDate: daysAgo(10), // 10 days overdue by default
    paymentDate: null,
    paymentStatus: 'INVOICED',
    paymentProof: null,
    waiverStatus: false,
    waiverReason: null,
    approvedBy: null,
    enterprise: {
      id: 'ent-1',
      legalNameVi: 'Công ty ABC',
      membershipStatus: 'ACTIVE',
    },
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('fee-overdue service', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('runOverdueCheck', () => {
    it('should return empty result when no fees are overdue', async () => {
      mockDb.membershipFee.findMany.mockResolvedValue([])

      const result = await runOverdueCheck(mockDb as any)

      expect(result.alerts).toHaveLength(0)
      expect(result.feesMarkedOverdue).toBe(0)
      expect(result.membersMarkedOverdue).toBe(0)
      expect(result.notificationsCreated).toBe(0)
    })

    it('should detect and mark overdue fees (dueDate passed, amountPaid < amountDue)', async () => {
      const overdueFee = makeFee({
        id: 'fee-overdue',
        dueDate: daysAgo(15),
        amountDue: 10000000,
        amountPaid: 0,
        paymentStatus: 'INVOICED',
      })

      mockDb.membershipFee.findMany.mockResolvedValue([overdueFee])
      mockDb.enterpriseMember.updateMany.mockResolvedValue({ count: 1 })

      const result = await runOverdueCheck(mockDb as any)

      expect(result.feesMarkedOverdue).toBe(1)
      expect(result.alerts).toHaveLength(1)
      expect(result.alerts[0]!.feeId).toBe('fee-overdue')
      expect(result.alerts[0]!.daysOverdue).toBeGreaterThanOrEqual(15)
      expect(result.alerts[0]!.previousStatus).toBe('INVOICED')

      expect(mockDb.membershipFee.update).toHaveBeenCalledWith({
        where: { id: 'fee-overdue' },
        data: { paymentStatus: 'OVERDUE' },
      })
    })

    it('should NOT mark fee as overdue if amountPaid >= amountDue', async () => {
      const paidFee = makeFee({
        id: 'fee-paid',
        dueDate: daysAgo(5),
        amountDue: 10000000,
        amountPaid: 10000000, // fully paid
        paymentStatus: 'INVOICED',
      })

      mockDb.membershipFee.findMany.mockResolvedValue([paidFee])

      const result = await runOverdueCheck(mockDb as any)

      expect(result.feesMarkedOverdue).toBe(0)
      expect(result.alerts).toHaveLength(0)
      expect(mockDb.membershipFee.update).not.toHaveBeenCalled()
    })

    it('should detect partially paid fees that are overdue', async () => {
      const partialFee = makeFee({
        id: 'fee-partial',
        dueDate: daysAgo(7),
        amountDue: 10000000,
        amountPaid: 3000000, // partially paid but still owes
        paymentStatus: 'PARTIALLY_PAID',
      })

      mockDb.membershipFee.findMany.mockResolvedValue([partialFee])
      mockDb.enterpriseMember.updateMany.mockResolvedValue({ count: 1 })

      const result = await runOverdueCheck(mockDb as any)

      expect(result.feesMarkedOverdue).toBe(1)
      expect(result.alerts[0]!.amountDue).toBe(10000000)
      expect(result.alerts[0]!.amountPaid).toBe(3000000)
    })

    it('should update enterprise membershipStatus to PAYMENT_OVERDUE', async () => {
      const overdueFee = makeFee({
        enterpriseId: 'ent-active',
        enterprise: { id: 'ent-active', legalNameVi: 'Công ty XYZ', membershipStatus: 'ACTIVE' },
      })

      mockDb.membershipFee.findMany.mockResolvedValue([overdueFee])
      mockDb.enterpriseMember.updateMany.mockResolvedValue({ count: 1 })

      const result = await runOverdueCheck(mockDb as any)

      expect(result.membersMarkedOverdue).toBe(1)
      expect(mockDb.enterpriseMember.updateMany).toHaveBeenCalledWith({
        where: { id: 'ent-active', membershipStatus: 'ACTIVE' },
        data: { membershipStatus: 'PAYMENT_OVERDUE' },
      })
    })

    it('should NOT update membershipStatus when updateMemberStatus is false', async () => {
      const overdueFee = makeFee()
      mockDb.membershipFee.findMany.mockResolvedValue([overdueFee])

      const result = await runOverdueCheck(mockDb as any, { updateMemberStatus: false })

      expect(result.membersMarkedOverdue).toBe(0)
      expect(mockDb.enterpriseMember.updateMany).not.toHaveBeenCalled()
    })

    it('should create notifications for Finance_Officer users', async () => {
      const overdueFee = makeFee({ id: 'fee-1', year: 2024 })
      mockDb.membershipFee.findMany.mockResolvedValue([overdueFee])
      mockDb.enterpriseMember.updateMany.mockResolvedValue({ count: 1 })
      mockDb.userRole.findMany.mockResolvedValue([
        { userId: 'finance-1' },
        { userId: 'finance-2' },
      ])

      const result = await runOverdueCheck(mockDb as any)

      // 1 alert × 2 Finance Officers = 2 notifications
      expect(result.notificationsCreated).toBe(2)
      expect(mockDb.notification.create).toHaveBeenCalledTimes(2)

      const firstCall = mockDb.notification.create.mock.calls[0]![0]
      expect(firstCall.data.type).toBe('FEE_OVERDUE')
      expect(firstCall.data.title).toContain('quá hạn')
      expect(firstCall.data.message).toContain('Công ty ABC')
      expect(firstCall.data.message).toContain('2024')
      expect(firstCall.data.link).toContain('enterpriseId=ent-1')
    })

    it('should NOT create notifications when createNotifications is false', async () => {
      const overdueFee = makeFee()
      mockDb.membershipFee.findMany.mockResolvedValue([overdueFee])
      mockDb.enterpriseMember.updateMany.mockResolvedValue({ count: 1 })

      const result = await runOverdueCheck(mockDb as any, { createNotifications: false })

      expect(result.notificationsCreated).toBe(0)
      expect(mockDb.notification.create).not.toHaveBeenCalled()
    })

    it('should handle multiple overdue fees for different enterprises', async () => {
      const fee1 = makeFee({
        id: 'fee-1',
        enterpriseId: 'ent-1',
        enterprise: { id: 'ent-1', legalNameVi: 'Công ty A', membershipStatus: 'ACTIVE' },
      })
      const fee2 = makeFee({
        id: 'fee-2',
        enterpriseId: 'ent-2',
        enterprise: { id: 'ent-2', legalNameVi: 'Công ty B', membershipStatus: 'ACTIVE' },
      })

      mockDb.membershipFee.findMany.mockResolvedValue([fee1, fee2])
      mockDb.enterpriseMember.updateMany.mockResolvedValue({ count: 1 })

      const result = await runOverdueCheck(mockDb as any)

      expect(result.feesMarkedOverdue).toBe(2)
      expect(result.alerts).toHaveLength(2)
      // Should update both enterprises
      expect(mockDb.enterpriseMember.updateMany).toHaveBeenCalledTimes(2)
    })

    it('should deduplicate enterprise updates when multiple fees for same enterprise', async () => {
      const fee1 = makeFee({ id: 'fee-1', enterpriseId: 'ent-1', year: 2023 })
      const fee2 = makeFee({ id: 'fee-2', enterpriseId: 'ent-1', year: 2024 })

      mockDb.membershipFee.findMany.mockResolvedValue([fee1, fee2])
      mockDb.enterpriseMember.updateMany.mockResolvedValue({ count: 1 })

      const result = await runOverdueCheck(mockDb as any)

      expect(result.feesMarkedOverdue).toBe(2)
      // Only 1 enterprise update (deduplicated)
      expect(mockDb.enterpriseMember.updateMany).toHaveBeenCalledTimes(1)
    })
  })

  describe('getOverdueFees', () => {
    it('should query fees with OVERDUE status', async () => {
      const overdueFee = makeFee({ paymentStatus: 'OVERDUE' })
      mockDb.membershipFee.findMany.mockResolvedValue([overdueFee])

      const result = await getOverdueFees(mockDb as any)

      expect(result).toHaveLength(1)
      expect(mockDb.membershipFee.findMany).toHaveBeenCalledWith({
        where: { paymentStatus: 'OVERDUE' },
        include: {
          enterprise: {
            select: { id: true, legalNameVi: true, legalNameEn: true, contactEmail: true },
          },
        },
        orderBy: { dueDate: 'asc' },
      })
    })

    it('should return empty array when no overdue fees exist', async () => {
      mockDb.membershipFee.findMany.mockResolvedValue([])

      const result = await getOverdueFees(mockDb as any)

      expect(result).toHaveLength(0)
    })
  })
})
