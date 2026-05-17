import { describe, it, expect, vi, beforeEach } from 'vitest'
import { router } from '../../trpc'
import { tiersRouter } from '../tiers'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    membershipTier: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: any) => Promise<any>) => {
      const tx = {
        membershipTier: {
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        auditLog: {
          create: vi.fn(),
        },
      }
      return fn(tx)
    }),
  }
}

type MockDb = ReturnType<typeof createMockDb>

function createAuthenticatedContext(db: MockDb, userId: string, roles: string[] = []) {
  return {
    db,
    session: {
      user: { id: userId, email: 'admin@test.com', name: 'Admin User' },
      roles,
    },
    headers: undefined,
  }
}

function createCaller(ctx: ReturnType<typeof createAuthenticatedContext>) {
  const appRouter = router({ tiers: tiersRouter })
  return appRouter.createCaller(ctx as any)
}

// ─── Tiers Router Tests ─────────────────────────────────────────────────────

describe('tiersRouter', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  // ─── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return all tiers ordered by annualFee', async () => {
      const mockTiers = [
        { id: 'tier-1', name: 'Associate', annualFee: '5000000', _count: { members: 2 } },
        { id: 'tier-2', name: 'Standard', annualFee: '15000000', _count: { members: 5 } },
      ]
      mockDb.membershipTier.findMany.mockResolvedValue(mockTiers)

      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Viewer'])
      const caller = createCaller(ctx)
      const result = await caller.tiers.list()

      expect(result).toEqual(mockTiers)
      expect(mockDb.membershipTier.findMany).toHaveBeenCalledWith({
        orderBy: { annualFee: 'asc' },
        include: { _count: { select: { members: true } } },
      })
    })

    it('should reject unauthenticated users', async () => {
      const ctx = { db: mockDb, session: null, headers: undefined }
      const appRouter = router({ tiers: tiersRouter })
      const caller = appRouter.createCaller(ctx as any)

      await expect(caller.tiers.list()).rejects.toThrow('Bạn cần đăng nhập')
    })
  })

  // ─── get ──────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('should return a tier by ID', async () => {
      const mockTier = {
        id: 'tier-1',
        name: 'Associate Member',
        annualFee: '5000000',
        benefits: { events: true },
        accessRights: { documents: 'read' },
        votingRight: false,
        projectRight: false,
        maxUsers: 3,
        _count: { members: 2 },
      }
      mockDb.membershipTier.findUnique.mockResolvedValue(mockTier)

      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Viewer'])
      const caller = createCaller(ctx)
      const result = await caller.tiers.get({ id: 'tier-1' })

      expect(result).toEqual(mockTier)
    })

    it('should throw NOT_FOUND for non-existent tier', async () => {
      mockDb.membershipTier.findUnique.mockResolvedValue(null)

      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Viewer'])
      const caller = createCaller(ctx)

      await expect(caller.tiers.get({ id: 'non-existent' })).rejects.toThrow(
        'Cấp hội viên không tồn tại'
      )
    })
  })

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const validInput = {
      name: 'Strategic Member',
      description: 'Hội viên chiến lược',
      annualFee: '50000000',
      benefits: { events: true, consulting: true },
      accessRights: { documents: 'full', projects: 'participate' },
      votingRight: true,
      projectRight: true,
      maxUsers: 10,
    }

    it('should create a tier when user is Director', async () => {
      mockDb.membershipTier.findUnique.mockResolvedValue(null) // no duplicate

      const createdTier = { id: 'new-tier-id', ...validInput }
      mockDb.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          membershipTier: { create: vi.fn().mockResolvedValue(createdTier) },
          auditLog: { create: vi.fn() },
        }
        return fn(tx)
      })

      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['Director'])
      const caller = createCaller(ctx)
      const result = await caller.tiers.create(validInput)

      expect(result).toEqual(createdTier)
    })

    it('should create a tier when user is System_Admin', async () => {
      mockDb.membershipTier.findUnique.mockResolvedValue(null)

      const createdTier = { id: 'new-tier-id', ...validInput }
      mockDb.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          membershipTier: { create: vi.fn().mockResolvedValue(createdTier) },
          auditLog: { create: vi.fn() },
        }
        return fn(tx)
      })

      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['System_Admin'])
      const caller = createCaller(ctx)
      const result = await caller.tiers.create(validInput)

      expect(result).toEqual(createdTier)
    })

    it('should reject non-admin users', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Membership_Manager'])
      const caller = createCaller(ctx)

      await expect(caller.tiers.create(validInput)).rejects.toThrow(
        'Bạn không có quyền thực hiện thao tác này'
      )
    })

    it('should reject duplicate tier name', async () => {
      mockDb.membershipTier.findUnique.mockResolvedValue({ id: 'existing', name: 'Strategic Member' })

      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['Director'])
      const caller = createCaller(ctx)

      await expect(caller.tiers.create(validInput)).rejects.toThrow(
        'Cấp hội viên "Strategic Member" đã tồn tại'
      )
    })
  })


  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update tier fields', async () => {
      const existingTier = {
        id: 'tier-1',
        name: 'Associate',
        annualFee: '5000000',
      }
      mockDb.membershipTier.findUnique
        .mockResolvedValueOnce(existingTier) // exists check
        .mockResolvedValueOnce(null) // no duplicate name

      const updatedTier = { ...existingTier, name: 'Associate Plus', annualFee: '7000000' }
      mockDb.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          membershipTier: { update: vi.fn().mockResolvedValue(updatedTier) },
          auditLog: { create: vi.fn() },
        }
        return fn(tx)
      })

      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['Director'])
      const caller = createCaller(ctx)
      const result = await caller.tiers.update({
        id: 'tier-1',
        name: 'Associate Plus',
        annualFee: '7000000',
      })

      expect(result).toEqual(updatedTier)
    })

    it('should throw NOT_FOUND for non-existent tier', async () => {
      mockDb.membershipTier.findUnique.mockResolvedValue(null)

      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['Director'])
      const caller = createCaller(ctx)

      await expect(
        caller.tiers.update({ id: 'non-existent', name: 'New Name' })
      ).rejects.toThrow('Cấp hội viên không tồn tại')
    })

    it('should reject duplicate name on update', async () => {
      const existingTier = { id: 'tier-1', name: 'Associate', annualFee: '5000000' }
      mockDb.membershipTier.findUnique
        .mockResolvedValueOnce(existingTier) // exists check
        .mockResolvedValueOnce({ id: 'tier-2', name: 'Standard' }) // duplicate found

      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['Director'])
      const caller = createCaller(ctx)

      await expect(
        caller.tiers.update({ id: 'tier-1', name: 'Standard' })
      ).rejects.toThrow('Cấp hội viên "Standard" đã tồn tại')
    })

    it('should reject non-admin users', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Viewer'])
      const caller = createCaller(ctx)

      await expect(
        caller.tiers.update({ id: 'tier-1', name: 'New Name' })
      ).rejects.toThrow('Bạn không có quyền thực hiện thao tác này')
    })
  })

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete tier with no members', async () => {
      mockDb.membershipTier.findUnique.mockResolvedValue({
        id: 'tier-1',
        name: 'Unused Tier',
        annualFee: '1000000',
        _count: { members: 0 },
      })

      mockDb.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          membershipTier: { delete: vi.fn() },
          auditLog: { create: vi.fn() },
        }
        return fn(tx)
      })

      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['System_Admin'])
      const caller = createCaller(ctx)
      const result = await caller.tiers.delete({ id: 'tier-1' })

      expect(result).toEqual({ success: true, deletedId: 'tier-1' })
    })

    it('should reject deletion when members are assigned', async () => {
      mockDb.membershipTier.findUnique.mockResolvedValue({
        id: 'tier-1',
        name: 'Active Tier',
        annualFee: '5000000',
        _count: { members: 3 },
      })

      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['Director'])
      const caller = createCaller(ctx)

      await expect(caller.tiers.delete({ id: 'tier-1' })).rejects.toThrow(
        'Không thể xóa cấp hội viên "Active Tier" vì còn 3 doanh nghiệp đang sử dụng'
      )
    })

    it('should throw NOT_FOUND for non-existent tier', async () => {
      mockDb.membershipTier.findUnique.mockResolvedValue(null)

      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['Director'])
      const caller = createCaller(ctx)

      await expect(caller.tiers.delete({ id: 'non-existent' })).rejects.toThrow(
        'Cấp hội viên không tồn tại'
      )
    })

    it('should reject non-admin users', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Membership_Manager'])
      const caller = createCaller(ctx)

      await expect(caller.tiers.delete({ id: 'tier-1' })).rejects.toThrow(
        'Bạn không có quyền thực hiện thao tác này'
      )
    })
  })
})
