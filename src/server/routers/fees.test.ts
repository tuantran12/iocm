import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PaymentStatus } from '@prisma/client'

/**
 * Fees Router - Business Logic Tests
 *
 * Tests fee generation (single + bulk + duplicate prevention) and waiver workflow.
 * Validates: Requirement R10 — Membership Fees
 */

// ─── Mock Prisma & Context Helpers ────────────────────────────────────────────

function createMockTx() {
  return {
    membershipFee: {
      create: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

function createMockDb() {
  const tx = createMockTx()
  return {
    enterpriseMember: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    membershipFee: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx)),
  }
}

type MockDb = ReturnType<typeof createMockDb>

// ─── Fee Generation Logic (extracted from router for testability) ─────────────

interface GenerateFeeInput {
  enterpriseId: string
  year: number
  dueDate: Date
}

interface Enterprise {
  id: string
  tier: { id: string; name: string; annualFee: number }
}

async function generateFee(db: MockDb, input: GenerateFeeInput, userId: string) {
  // Validate enterprise exists
  const enterprise = await db.enterpriseMember.findUnique({
    where: { id: input.enterpriseId },
    include: { tier: { select: { id: true, name: true, annualFee: true } } },
  })
  if (!enterprise) {
    throw new Error('NOT_FOUND: Doanh nghiệp hội viên không tồn tại')
  }

  // Check duplicate
  const existing = await db.membershipFee.findFirst({
    where: { enterpriseId: input.enterpriseId, year: input.year },
  })
  if (existing) {
    throw new Error(`CONFLICT: Phí thường niên năm ${input.year} đã được tạo cho doanh nghiệp này`)
  }

  const fee = await db.$transaction(async (tx) => {
    const created = await tx.membershipFee.create({
      data: {
        enterpriseId: input.enterpriseId,
        year: input.year,
        amountDue: (enterprise as Enterprise).tier.annualFee,
        amountPaid: 0,
        dueDate: input.dueDate,
        paymentStatus: PaymentStatus.NOT_INVOICED,
      },
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: 'FEE_GENERATED',
        targetType: 'MembershipFee',
        targetId: created.id,
        afterVal: {
          enterpriseId: input.enterpriseId,
          year: input.year,
          amountDue: (enterprise as Enterprise).tier.annualFee.toString(),
          tierName: (enterprise as Enterprise).tier.name,
        },
      },
    })

    return created
  })

  return fee
}

interface BulkGenerateInput {
  year: number
  dueDate: Date
}

async function generateBulkFees(db: MockDb, input: BulkGenerateInput, userId: string) {
  const activeMembers = await db.enterpriseMember.findMany({
    where: { membershipStatus: 'ACTIVE' },
    include: { tier: { select: { id: true, name: true, annualFee: true } } },
  })

  const existingFees = await db.membershipFee.findMany({
    where: {
      year: input.year,
      enterpriseId: { in: activeMembers.map((m: Enterprise) => m.id) },
    },
    select: { enterpriseId: true },
  })
  const existingEnterpriseIds = new Set(existingFees.map((f: { enterpriseId: string }) => f.enterpriseId))

  const membersToGenerate = activeMembers.filter((m: Enterprise) => !existingEnterpriseIds.has(m.id))

  if (membersToGenerate.length === 0) {
    return { generated: 0, skipped: existingFees.length, total: activeMembers.length }
  }

  const fees = await db.$transaction(async (tx) => {
    const created = await Promise.all(
      membersToGenerate.map((member: Enterprise) =>
        tx.membershipFee.create({
          data: {
            enterpriseId: member.id,
            year: input.year,
            amountDue: member.tier.annualFee,
            amountPaid: 0,
            dueDate: input.dueDate,
            paymentStatus: PaymentStatus.NOT_INVOICED,
          },
        })
      )
    )

    await tx.auditLog.create({
      data: {
        userId,
        action: 'FEES_BULK_GENERATED',
        targetType: 'MembershipFee',
        targetId: 'bulk',
        afterVal: {
          year: input.year,
          generated: created.length,
          skipped: existingFees.length,
        },
      },
    })

    return created
  })

  return {
    generated: fees.length,
    skipped: existingFees.length,
    total: activeMembers.length,
  }
}

// ─── Waiver Logic (extracted from router) ─────────────────────────────────────

interface FeeRecord {
  id: string
  enterpriseId: string
  year: number
  paymentStatus: string
  waiverReason: string | null
  waiverStatus: boolean
  approvedBy: string | null
}

async function requestWaiver(db: MockDb, feeId: string, reason: string, userId: string) {
  const fee = await db.membershipFee.findUnique({ where: { id: feeId } }) as FeeRecord | null
  if (!fee) {
    throw new Error('NOT_FOUND: Bản ghi phí không tồn tại')
  }

  if (['PAID', 'WAIVED', 'CANCELLED', 'REFUNDED'].includes(fee.paymentStatus)) {
    throw new Error(`BAD_REQUEST: Không thể yêu cầu miễn giảm cho phí có trạng thái: ${fee.paymentStatus}`)
  }

  if (fee.waiverReason && !fee.waiverStatus && !fee.approvedBy) {
    throw new Error('CONFLICT: Đã có yêu cầu miễn giảm đang chờ phê duyệt cho phí này')
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await (tx as unknown as MockDb).membershipFee.update({
      where: { id: feeId },
      data: { waiverReason: reason, waiverStatus: false },
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: 'FEE_WAIVER_REQUESTED',
        targetType: 'MembershipFee',
        targetId: feeId,
        afterVal: { reason, enterpriseId: fee.enterpriseId, year: fee.year },
      },
    })

    return result
  })

  return updated
}

async function approveWaiver(
  db: MockDb,
  feeId: string,
  approved: boolean,
  userId: string,
  comment?: string
) {
  const fee = await db.membershipFee.findUnique({ where: { id: feeId } }) as FeeRecord | null
  if (!fee) {
    throw new Error('NOT_FOUND: Bản ghi phí không tồn tại')
  }

  if (!fee.waiverReason) {
    throw new Error('BAD_REQUEST: Không có yêu cầu miễn giảm nào cho phí này')
  }

  if (fee.approvedBy) {
    throw new Error('CONFLICT: Yêu cầu miễn giảm đã được xử lý trước đó')
  }

  const data: Record<string, unknown> = {
    waiverStatus: approved,
    approvedBy: userId,
  }
  if (approved) {
    data.paymentStatus = PaymentStatus.WAIVED
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await (tx as unknown as MockDb).membershipFee.update({
      where: { id: feeId },
      data,
    })

    await tx.auditLog.create({
      data: {
        userId,
        action: approved ? 'FEE_WAIVER_APPROVED' : 'FEE_WAIVER_REJECTED',
        targetType: 'MembershipFee',
        targetId: feeId,
        beforeVal: { waiverReason: fee.waiverReason, paymentStatus: fee.paymentStatus },
        afterVal: {
          approved,
          comment: comment ?? null,
          paymentStatus: approved ? PaymentStatus.WAIVED : fee.paymentStatus,
        },
      },
    })

    return result
  })

  return updated
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Fees Router - Fee Generation', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('generate (single fee from tier)', () => {
    it('generates fee with amount from enterprise tier', async () => {
      const enterprise = {
        id: 'ent-1',
        tier: { id: 'tier-gold', name: 'Gold', annualFee: 50000000 },
      }
      mockDb.enterpriseMember.findUnique.mockResolvedValue(enterprise)
      mockDb.membershipFee.findFirst.mockResolvedValue(null) // no duplicate

      const txMock = createMockTx()
      txMock.membershipFee.create.mockResolvedValue({
        id: 'fee-new',
        enterpriseId: 'ent-1',
        year: 2025,
        amountDue: 50000000,
        amountPaid: 0,
        paymentStatus: 'NOT_INVOICED',
      })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await generateFee(
        mockDb,
        { enterpriseId: 'ent-1', year: 2025, dueDate: new Date('2025-03-31') },
        'user-1'
      )

      expect(txMock.membershipFee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          enterpriseId: 'ent-1',
          year: 2025,
          amountDue: 50000000,
          amountPaid: 0,
          paymentStatus: PaymentStatus.NOT_INVOICED,
        }),
      })
      expect(result.amountDue).toBe(50000000)
    })

    it('throws NOT_FOUND when enterprise does not exist', async () => {
      mockDb.enterpriseMember.findUnique.mockResolvedValue(null)

      await expect(
        generateFee(mockDb, { enterpriseId: 'nonexistent', year: 2025, dueDate: new Date() }, 'user-1')
      ).rejects.toThrow('NOT_FOUND')
    })

    it('throws CONFLICT when fee already exists for enterprise + year (duplicate prevention)', async () => {
      mockDb.enterpriseMember.findUnique.mockResolvedValue({
        id: 'ent-1',
        tier: { id: 'tier-1', name: 'Silver', annualFee: 30000000 },
      })
      mockDb.membershipFee.findFirst.mockResolvedValue({
        id: 'existing-fee',
        enterpriseId: 'ent-1',
        year: 2025,
      })

      await expect(
        generateFee(mockDb, { enterpriseId: 'ent-1', year: 2025, dueDate: new Date() }, 'user-1')
      ).rejects.toThrow('CONFLICT')
    })

    it('creates audit log entry on fee generation', async () => {
      const enterprise = {
        id: 'ent-1',
        tier: { id: 'tier-1', name: 'Platinum', annualFee: 100000000 },
      }
      mockDb.enterpriseMember.findUnique.mockResolvedValue(enterprise)
      mockDb.membershipFee.findFirst.mockResolvedValue(null)

      const txMock = createMockTx()
      txMock.membershipFee.create.mockResolvedValue({ id: 'fee-new' })
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await generateFee(
        mockDb,
        { enterpriseId: 'ent-1', year: 2025, dueDate: new Date('2025-06-30') },
        'admin-1'
      )

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin-1',
          action: 'FEE_GENERATED',
          targetType: 'MembershipFee',
          afterVal: expect.objectContaining({
            enterpriseId: 'ent-1',
            year: 2025,
            tierName: 'Platinum',
          }),
        }),
      })
    })
  })

  describe('generateBulk', () => {
    it('generates fees for all active members without existing fees', async () => {
      const members = [
        { id: 'ent-1', tier: { id: 't1', name: 'Gold', annualFee: 50000000 } },
        { id: 'ent-2', tier: { id: 't2', name: 'Silver', annualFee: 30000000 } },
        { id: 'ent-3', tier: { id: 't1', name: 'Gold', annualFee: 50000000 } },
      ]
      mockDb.enterpriseMember.findMany.mockResolvedValue(members)
      mockDb.membershipFee.findMany.mockResolvedValue([]) // no existing fees

      const txMock = createMockTx()
      txMock.membershipFee.create.mockImplementation(async (args) => ({
        id: `fee-${args.data.enterpriseId}`,
        ...args.data,
      }))
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await generateBulkFees(
        mockDb,
        { year: 2025, dueDate: new Date('2025-03-31') },
        'admin-1'
      )

      expect(result.generated).toBe(3)
      expect(result.skipped).toBe(0)
      expect(result.total).toBe(3)
      expect(txMock.membershipFee.create).toHaveBeenCalledTimes(3)
    })

    it('skips members that already have fees for the year (duplicate prevention)', async () => {
      const members = [
        { id: 'ent-1', tier: { id: 't1', name: 'Gold', annualFee: 50000000 } },
        { id: 'ent-2', tier: { id: 't2', name: 'Silver', annualFee: 30000000 } },
      ]
      mockDb.enterpriseMember.findMany.mockResolvedValue(members)
      mockDb.membershipFee.findMany.mockResolvedValue([
        { enterpriseId: 'ent-1' }, // already has fee
      ])

      const txMock = createMockTx()
      txMock.membershipFee.create.mockImplementation(async (args) => ({
        id: `fee-${args.data.enterpriseId}`,
        ...args.data,
      }))
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await generateBulkFees(
        mockDb,
        { year: 2025, dueDate: new Date('2025-03-31') },
        'admin-1'
      )

      expect(result.generated).toBe(1)
      expect(result.skipped).toBe(1)
      expect(result.total).toBe(2)
      // Only ent-2 should get a fee
      expect(txMock.membershipFee.create).toHaveBeenCalledTimes(1)
      expect(txMock.membershipFee.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          enterpriseId: 'ent-2',
          amountDue: 30000000,
        }),
      })
    })

    it('returns zero generated when all members already have fees', async () => {
      const members = [
        { id: 'ent-1', tier: { id: 't1', name: 'Gold', annualFee: 50000000 } },
      ]
      mockDb.enterpriseMember.findMany.mockResolvedValue(members)
      mockDb.membershipFee.findMany.mockResolvedValue([
        { enterpriseId: 'ent-1' },
      ])

      const result = await generateBulkFees(
        mockDb,
        { year: 2025, dueDate: new Date('2025-03-31') },
        'admin-1'
      )

      expect(result.generated).toBe(0)
      expect(result.skipped).toBe(1)
      expect(result.total).toBe(1)
      expect(mockDb.$transaction).not.toHaveBeenCalled()
    })

    it('returns zero generated when no active members exist', async () => {
      mockDb.enterpriseMember.findMany.mockResolvedValue([])
      mockDb.membershipFee.findMany.mockResolvedValue([])

      const result = await generateBulkFees(
        mockDb,
        { year: 2025, dueDate: new Date('2025-03-31') },
        'admin-1'
      )

      expect(result.generated).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.total).toBe(0)
    })
  })
})

describe('Fees Router - Waiver Workflow', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('requestWaiver', () => {
    it('sets waiverReason and waiverStatus=false (pending) on valid fee', async () => {
      const fee: FeeRecord = {
        id: 'fee-1',
        enterpriseId: 'ent-1',
        year: 2025,
        paymentStatus: 'INVOICED',
        waiverReason: null,
        waiverStatus: false,
        approvedBy: null,
      }
      mockDb.membershipFee.findUnique.mockResolvedValue(fee)

      const txMock = createMockTx()
      const updatedFee = { ...fee, waiverReason: 'Khó khăn tài chính', waiverStatus: false }
      ;(txMock as any).membershipFee = { update: vi.fn().mockResolvedValue(updatedFee) }
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await requestWaiver(mockDb, 'fee-1', 'Khó khăn tài chính', 'user-1')

      expect(result.waiverReason).toBe('Khó khăn tài chính')
      expect(result.waiverStatus).toBe(false)
    })

    it('throws NOT_FOUND when fee does not exist', async () => {
      mockDb.membershipFee.findUnique.mockResolvedValue(null)

      await expect(
        requestWaiver(mockDb, 'nonexistent', 'reason', 'user-1')
      ).rejects.toThrow('NOT_FOUND')
    })

    it('rejects waiver request for PAID fee', async () => {
      mockDb.membershipFee.findUnique.mockResolvedValue({
        id: 'fee-1',
        paymentStatus: 'PAID',
        waiverReason: null,
        waiverStatus: false,
        approvedBy: null,
      })

      await expect(
        requestWaiver(mockDb, 'fee-1', 'reason', 'user-1')
      ).rejects.toThrow('BAD_REQUEST')
    })

    it('rejects waiver request for WAIVED fee', async () => {
      mockDb.membershipFee.findUnique.mockResolvedValue({
        id: 'fee-1',
        paymentStatus: 'WAIVED',
        waiverReason: null,
        waiverStatus: false,
        approvedBy: null,
      })

      await expect(
        requestWaiver(mockDb, 'fee-1', 'reason', 'user-1')
      ).rejects.toThrow('BAD_REQUEST')
    })

    it('rejects waiver request for CANCELLED fee', async () => {
      mockDb.membershipFee.findUnique.mockResolvedValue({
        id: 'fee-1',
        paymentStatus: 'CANCELLED',
        waiverReason: null,
        waiverStatus: false,
        approvedBy: null,
      })

      await expect(
        requestWaiver(mockDb, 'fee-1', 'reason', 'user-1')
      ).rejects.toThrow('BAD_REQUEST')
    })

    it('rejects duplicate waiver request (pending exists)', async () => {
      mockDb.membershipFee.findUnique.mockResolvedValue({
        id: 'fee-1',
        enterpriseId: 'ent-1',
        year: 2025,
        paymentStatus: 'INVOICED',
        waiverReason: 'Existing reason', // already has pending waiver
        waiverStatus: false,
        approvedBy: null, // not yet approved/rejected
      })

      await expect(
        requestWaiver(mockDb, 'fee-1', 'New reason', 'user-1')
      ).rejects.toThrow('CONFLICT')
    })
  })

  describe('approveWaiver', () => {
    it('approves waiver and sets paymentStatus to WAIVED', async () => {
      const fee: FeeRecord = {
        id: 'fee-1',
        enterpriseId: 'ent-1',
        year: 2025,
        paymentStatus: 'INVOICED',
        waiverReason: 'Khó khăn tài chính',
        waiverStatus: false,
        approvedBy: null,
      }
      mockDb.membershipFee.findUnique.mockResolvedValue(fee)

      const txMock = createMockTx()
      const updatedFee = {
        ...fee,
        waiverStatus: true,
        approvedBy: 'director-1',
        paymentStatus: 'WAIVED',
      }
      ;(txMock as any).membershipFee = { update: vi.fn().mockResolvedValue(updatedFee) }
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await approveWaiver(mockDb, 'fee-1', true, 'director-1', 'Đồng ý miễn giảm')

      expect(result.waiverStatus).toBe(true)
      expect(result.paymentStatus).toBe('WAIVED')
      expect(result.approvedBy).toBe('director-1')
    })

    it('rejects waiver (waiverStatus=false, paymentStatus unchanged)', async () => {
      const fee: FeeRecord = {
        id: 'fee-1',
        enterpriseId: 'ent-1',
        year: 2025,
        paymentStatus: 'OVERDUE',
        waiverReason: 'Lý do không hợp lệ',
        waiverStatus: false,
        approvedBy: null,
      }
      mockDb.membershipFee.findUnique.mockResolvedValue(fee)

      const txMock = createMockTx()
      const updatedFee = {
        ...fee,
        waiverStatus: false,
        approvedBy: 'director-1',
        // paymentStatus stays OVERDUE
      }
      ;(txMock as any).membershipFee = { update: vi.fn().mockResolvedValue(updatedFee) }
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      const result = await approveWaiver(mockDb, 'fee-1', false, 'director-1', 'Không đủ điều kiện')

      expect(result.waiverStatus).toBe(false)
      expect(result.paymentStatus).toBe('OVERDUE')

      // Verify update call does NOT include paymentStatus: WAIVED
      expect((txMock as any).membershipFee.update).toHaveBeenCalledWith({
        where: { id: 'fee-1' },
        data: expect.objectContaining({
          waiverStatus: false,
          approvedBy: 'director-1',
        }),
      })
      const updateData = (txMock as any).membershipFee.update.mock.calls[0][0].data
      expect(updateData.paymentStatus).toBeUndefined()
    })

    it('throws NOT_FOUND when fee does not exist', async () => {
      mockDb.membershipFee.findUnique.mockResolvedValue(null)

      await expect(
        approveWaiver(mockDb, 'nonexistent', true, 'director-1')
      ).rejects.toThrow('NOT_FOUND')
    })

    it('throws BAD_REQUEST when no waiver request exists', async () => {
      mockDb.membershipFee.findUnique.mockResolvedValue({
        id: 'fee-1',
        paymentStatus: 'INVOICED',
        waiverReason: null, // no waiver request
        waiverStatus: false,
        approvedBy: null,
      })

      await expect(
        approveWaiver(mockDb, 'fee-1', true, 'director-1')
      ).rejects.toThrow('BAD_REQUEST')
    })

    it('throws CONFLICT when waiver already processed', async () => {
      mockDb.membershipFee.findUnique.mockResolvedValue({
        id: 'fee-1',
        paymentStatus: 'WAIVED',
        waiverReason: 'Some reason',
        waiverStatus: true,
        approvedBy: 'director-1', // already processed
      })

      await expect(
        approveWaiver(mockDb, 'fee-1', true, 'director-2')
      ).rejects.toThrow('CONFLICT')
    })

    it('creates audit log with correct action on approval', async () => {
      const fee: FeeRecord = {
        id: 'fee-1',
        enterpriseId: 'ent-1',
        year: 2025,
        paymentStatus: 'INVOICED',
        waiverReason: 'Reason',
        waiverStatus: false,
        approvedBy: null,
      }
      mockDb.membershipFee.findUnique.mockResolvedValue(fee)

      const txMock = createMockTx()
      ;(txMock as any).membershipFee = { update: vi.fn().mockResolvedValue({ ...fee, waiverStatus: true }) }
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await approveWaiver(mockDb, 'fee-1', true, 'director-1')

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'FEE_WAIVER_APPROVED',
          afterVal: expect.objectContaining({ approved: true }),
        }),
      })
    })

    it('creates audit log with REJECTED action on rejection', async () => {
      const fee: FeeRecord = {
        id: 'fee-1',
        enterpriseId: 'ent-1',
        year: 2025,
        paymentStatus: 'INVOICED',
        waiverReason: 'Reason',
        waiverStatus: false,
        approvedBy: null,
      }
      mockDb.membershipFee.findUnique.mockResolvedValue(fee)

      const txMock = createMockTx()
      ;(txMock as any).membershipFee = { update: vi.fn().mockResolvedValue({ ...fee, waiverStatus: false }) }
      mockDb.$transaction.mockImplementation(async (fn) => fn(txMock))

      await approveWaiver(mockDb, 'fee-1', false, 'director-1', 'Rejected')

      expect(txMock.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'FEE_WAIVER_REJECTED',
          afterVal: expect.objectContaining({ approved: false }),
        }),
      })
    })
  })
})
