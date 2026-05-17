import { describe, it, expect, vi, beforeEach } from 'vitest'
import { financeRouter } from './finance'
import { router } from '../trpc'
import { TRPCError } from '@trpc/server'

// ─── Mock DB ──────────────────────────────────────────────────────────────────

function createMockDb() {
  const auditLogCreate = vi.fn().mockResolvedValue({})
  const tx = {
    sponsorshipRecord: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: auditLogCreate },
  }

  return {
    membershipFee: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    sponsorshipRecord: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    enterpriseMember: {
      findUnique: vi.fn(),
    },
    auditLog: { create: auditLogCreate },
    $transaction: vi.fn(async (fn: unknown) => {
      if (typeof fn === 'function') return fn(tx)
      return fn
    }),
    _tx: tx,
    _auditLogCreate: auditLogCreate,
  }
}

function createMockCtx(db: ReturnType<typeof createMockDb>) {
  return {
    db,
    session: {
      user: { id: 'user-1', email: 'test@test.com', name: 'Test' },
      roles: ['Finance_Officer'],
    },
  }
}

// ─── Helper: call procedure directly ─────────────────────────────────────────

const testRouter = router({ finance: financeRouter })

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('financeRouter', () => {
  let db: ReturnType<typeof createMockDb>
  let ctx: ReturnType<typeof createMockCtx>

  beforeEach(() => {
    db = createMockDb()
    ctx = createMockCtx(db)
  })

  describe('dashboard', () => {
    it('should return aggregated finance data', async () => {
      db.membershipFee.aggregate
        .mockResolvedValueOnce({ _sum: { amountPaid: 500000000 } }) // PAID
        .mockResolvedValueOnce({ _sum: { amountDue: 100000000 } }) // OVERDUE
      db.sponsorshipRecord.aggregate.mockResolvedValue({ _sum: { amount: 200000000 } })
      db.membershipFee.groupBy.mockResolvedValue([
        { paymentStatus: 'PAID', _count: { id: 5 } },
        { paymentStatus: 'OVERDUE', _count: { id: 2 } },
        { paymentStatus: 'NOT_INVOICED', _count: { id: 3 } },
      ])
      db.membershipFee.findMany.mockResolvedValue([
        { id: 'fee-1', amountPaid: 50000000, paymentDate: new Date(), enterprise: { id: 'e1', legalNameVi: 'DN A', legalNameEn: null } },
      ])

      const caller = testRouter.createCaller(ctx as never)
      const result = await caller.finance.dashboard()

      expect(result.totalFeesCollected).toBe(500000000)
      expect(result.totalFeesOverdue).toBe(100000000)
      expect(result.totalSponsorships).toBe(200000000)
      expect(result.feesByStatus).toHaveLength(3)
      expect(result.feesByStatus[0]).toEqual({ status: 'PAID', count: 5 })
      expect(result.recentPayments).toHaveLength(1)
    })

    it('should return 0 when no data exists', async () => {
      db.membershipFee.aggregate
        .mockResolvedValueOnce({ _sum: { amountPaid: null } })
        .mockResolvedValueOnce({ _sum: { amountDue: null } })
      db.sponsorshipRecord.aggregate.mockResolvedValue({ _sum: { amount: null } })
      db.membershipFee.groupBy.mockResolvedValue([])
      db.membershipFee.findMany.mockResolvedValue([])

      const caller = testRouter.createCaller(ctx as never)
      const result = await caller.finance.dashboard()

      expect(result.totalFeesCollected).toBe(0)
      expect(result.totalFeesOverdue).toBe(0)
      expect(result.totalSponsorships).toBe(0)
      expect(result.feesByStatus).toHaveLength(0)
      expect(result.recentPayments).toHaveLength(0)
    })
  })

  describe('sponsorshipsList', () => {
    it('should list sponsorships with pagination', async () => {
      const mockItems = [
        { id: 's1', sponsorName: 'Sponsor A', type: 'cash', amount: 100000000, status: 'committed', createdAt: new Date(), enterprise: null },
      ]
      db.sponsorshipRecord.findMany.mockResolvedValue(mockItems)
      db.sponsorshipRecord.count.mockResolvedValue(1)

      const caller = testRouter.createCaller(ctx as never)
      const result = await caller.finance.sponsorshipsList({ page: 0, pageSize: 10 })

      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.page).toBe(0)
      expect(result.pageSize).toBe(10)
    })

    it('should filter by status', async () => {
      db.sponsorshipRecord.findMany.mockResolvedValue([])
      db.sponsorshipRecord.count.mockResolvedValue(0)

      const caller = testRouter.createCaller(ctx as never)
      await caller.finance.sponsorshipsList({ status: 'completed' })

      expect(db.sponsorshipRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'completed' }),
        })
      )
    })
  })

  describe('sponsorshipsGet', () => {
    it('should return a sponsorship by ID', async () => {
      const mockRecord = { id: 's1', sponsorName: 'Sponsor A', type: 'cash', enterprise: null }
      db.sponsorshipRecord.findUnique.mockResolvedValue(mockRecord)

      const caller = testRouter.createCaller(ctx as never)
      const result = await caller.finance.sponsorshipsGet({ id: 's1' })

      expect(result).toEqual(mockRecord)
    })

    it('should throw NOT_FOUND for non-existent sponsorship', async () => {
      db.sponsorshipRecord.findUnique.mockResolvedValue(null)

      const caller = testRouter.createCaller(ctx as never)
      await expect(caller.finance.sponsorshipsGet({ id: 'nonexistent' }))
        .rejects.toThrow(TRPCError)
    })
  })

  describe('sponsorshipsCreate', () => {
    it('should create a sponsorship record with audit log', async () => {
      const created = { id: 's-new', sponsorName: 'New Sponsor', type: 'cash', amount: 50000000 }
      db._tx.sponsorshipRecord.create.mockResolvedValue(created)

      const caller = testRouter.createCaller(ctx as never)
      const result = await caller.finance.sponsorshipsCreate({
        sponsorName: 'New Sponsor',
        type: 'cash',
        amount: 50000000,
        purpose: 'Hỗ trợ dự án',
      })

      expect(result).toEqual(created)
      expect(db._auditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'SPONSORSHIP_CREATED',
            targetType: 'SponsorshipRecord',
          }),
        })
      )
    })

    it('should throw NOT_FOUND if enterpriseId is invalid', async () => {
      db.enterpriseMember.findUnique.mockResolvedValue(null)

      const caller = testRouter.createCaller(ctx as never)
      await expect(caller.finance.sponsorshipsCreate({
        sponsorName: 'Sponsor',
        type: 'cash',
        enterpriseId: 'invalid-id',
      })).rejects.toThrow(TRPCError)
    })
  })

  describe('sponsorshipsUpdate', () => {
    it('should update a sponsorship record', async () => {
      const existing = { id: 's1', sponsorName: 'Old', type: 'cash', amount: 100000000, status: 'committed' }
      const updated = { ...existing, sponsorName: 'Updated', amount: 200000000 }
      db.sponsorshipRecord.findUnique.mockResolvedValue(existing)
      db._tx.sponsorshipRecord.update.mockResolvedValue(updated)

      const caller = testRouter.createCaller(ctx as never)
      const result = await caller.finance.sponsorshipsUpdate({
        id: 's1',
        sponsorName: 'Updated',
        amount: 200000000,
      })

      expect(result.sponsorName).toBe('Updated')
      expect(db._auditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SPONSORSHIP_UPDATED' }),
        })
      )
    })

    it('should throw NOT_FOUND for non-existent sponsorship', async () => {
      db.sponsorshipRecord.findUnique.mockResolvedValue(null)

      const caller = testRouter.createCaller(ctx as never)
      await expect(caller.finance.sponsorshipsUpdate({ id: 'bad', sponsorName: 'X' }))
        .rejects.toThrow(TRPCError)
    })
  })

  describe('sponsorshipsDelete', () => {
    it('should delete a sponsorship and create audit log', async () => {
      const existing = { id: 's1', sponsorName: 'Sponsor', type: 'cash', amount: 100000000, purpose: 'Test', status: 'committed' }
      db.sponsorshipRecord.findUnique.mockResolvedValue(existing)
      db._tx.sponsorshipRecord.delete.mockResolvedValue(existing)

      const caller = testRouter.createCaller(ctx as never)
      const result = await caller.finance.sponsorshipsDelete({ id: 's1' })

      expect(result).toEqual({ success: true })
      expect(db._auditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SPONSORSHIP_DELETED' }),
        })
      )
    })

    it('should throw NOT_FOUND for non-existent sponsorship', async () => {
      db.sponsorshipRecord.findUnique.mockResolvedValue(null)

      const caller = testRouter.createCaller(ctx as never)
      await expect(caller.finance.sponsorshipsDelete({ id: 'bad' }))
        .rejects.toThrow(TRPCError)
    })
  })
})
