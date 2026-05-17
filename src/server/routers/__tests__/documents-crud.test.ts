import { describe, it, expect, vi, beforeEach } from 'vitest'
import { router } from '../../trpc'
import { documentsRouter } from '../documents'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    documentItem: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    documentVersion: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    completenessCheck: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  }
}

type MockDb = ReturnType<typeof createMockDb>

function createPublicContext(db: MockDb) {
  return { db, session: null, headers: undefined }
}

function createAuthenticatedContext(db: MockDb, userId = 'user-1') {
  return {
    db,
    session: {
      user: { id: userId, email: 'user@test.com', name: 'Test User' },
      roles: ['Core_Team_Member'],
    },
    headers: undefined,
  }
}

function createCaller(ctx: any) {
  const appRouter = router({ documents: documentsRouter })
  return appRouter.createCaller(ctx)
}

function createAuthCaller(db: MockDb, userId = 'user-1') {
  return createCaller(createAuthenticatedContext(db, userId))
}

// ─── Document CRUD Tests ────────────────────────────────────────────────────

describe('documentsRouter — CRUD', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('create', () => {
    it('should auto-generate document code in format DOC-YYYYMMDD-XXXX', async () => {
      const createdDoc = {
        id: 'doc-new',
        code: 'DOC-20250101-0001',
        name: 'Điều lệ Viện',
        type: 'regulation',
        cluster: 'CORE_FOUNDING',
        version: 1,
        status: 'NOT_STARTED',
      }

      mockDb.documentItem.count.mockResolvedValue(0)
      mockDb.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          documentItem: { create: vi.fn().mockResolvedValue(createdDoc) },
          completenessCheck: { createMany: vi.fn().mockResolvedValue({ count: 8 }) },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        }
        return cb(tx)
      })

      const caller = createAuthCaller(mockDb)

      const result = await caller.documents.create({
        name: 'Điều lệ Viện',
        type: 'regulation',
        cluster: 'CORE_FOUNDING',
      })

      expect(result.id).toBe('doc-new')

      // Verify the transaction creates doc with auto-generated code
      const txCallback = mockDb.$transaction.mock.calls[0]![0]
      const mockTx = {
        documentItem: { create: vi.fn().mockResolvedValue(createdDoc) },
        completenessCheck: { createMany: vi.fn().mockResolvedValue({ count: 8 }) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      }
      await txCallback(mockTx)

      const createCall = mockTx.documentItem.create.mock.calls[0]![0]
      expect(createCall.data.code).toMatch(/^DOC-\d{8}-0001$/)
      expect(createCall.data.name).toBe('Điều lệ Viện')
      expect(createCall.data.type).toBe('regulation')
      expect(createCall.data.cluster).toBe('CORE_FOUNDING')
    })

    it('should increment code sequence based on existing document count', async () => {
      const createdDoc = {
        id: 'doc-5',
        code: 'DOC-20250101-0005',
        name: 'Quy chế mới',
        type: 'policy',
        cluster: 'REGULATIONS',
      }

      mockDb.documentItem.count.mockResolvedValue(4) // 4 existing docs → next is 0005
      mockDb.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          documentItem: { create: vi.fn().mockResolvedValue(createdDoc) },
          completenessCheck: { createMany: vi.fn().mockResolvedValue({ count: 8 }) },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        }
        return cb(tx)
      })

      const caller = createAuthCaller(mockDb)

      await caller.documents.create({
        name: 'Quy chế mới',
        type: 'policy',
        cluster: 'REGULATIONS',
      })

      const txCallback = mockDb.$transaction.mock.calls[0]![0]
      const mockTx = {
        documentItem: { create: vi.fn().mockResolvedValue(createdDoc) },
        completenessCheck: { createMany: vi.fn().mockResolvedValue({ count: 8 }) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      }
      await txCallback(mockTx)

      const createCall = mockTx.documentItem.create.mock.calls[0]![0]
      expect(createCall.data.code).toMatch(/^DOC-\d{8}-0005$/)
    })

    it('should reject empty document name', async () => {
      const caller = createAuthCaller(mockDb)

      await expect(
        caller.documents.create({
          name: '',
          type: 'general',
          cluster: 'CORE_FOUNDING',
        })
      ).rejects.toThrow()
    })

    it('should accept optional fields (priority, deadline, ownerId)', async () => {
      const createdDoc = {
        id: 'doc-opt',
        code: 'DOC-20250101-0001',
        name: 'Tài liệu với options',
        type: 'report',
        cluster: 'FINANCE',
        priority: 'CRITICAL',
        deadline: new Date('2025-12-31'),
        ownerId: 'user-1',
      }

      mockDb.documentItem.count.mockResolvedValue(0)
      mockDb.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          documentItem: { create: vi.fn().mockResolvedValue(createdDoc) },
          completenessCheck: { createMany: vi.fn().mockResolvedValue({ count: 8 }) },
          auditLog: { create: vi.fn().mockResolvedValue({}) },
        }
        return cb(tx)
      })

      const caller = createAuthCaller(mockDb)

      const result = await caller.documents.create({
        name: 'Tài liệu với options',
        type: 'report',
        cluster: 'FINANCE',
        priority: 'CRITICAL',
        deadline: new Date('2025-12-31'),
        ownerId: 'user-1',
      })

      expect(result.id).toBe('doc-opt')
    })
  })

  describe('list', () => {
    it('should return paginated results with total count', async () => {
      const items = [
        { id: 'doc-1', code: 'DOC-001', name: 'Doc 1', checks: [] },
        { id: 'doc-2', code: 'DOC-002', name: 'Doc 2', checks: [] },
      ]

      mockDb.documentItem.findMany.mockResolvedValue(items)
      mockDb.documentItem.count.mockResolvedValue(10)

      const caller = createAuthCaller(mockDb)

      const result = await caller.documents.list({ page: 0, pageSize: 2 })

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(10)
      expect(result.page).toBe(0)
      expect(result.pageSize).toBe(2)
    })

    it('should filter by cluster', async () => {
      mockDb.documentItem.findMany.mockResolvedValue([])
      mockDb.documentItem.count.mockResolvedValue(0)

      const caller = createAuthCaller(mockDb)

      await caller.documents.list({ cluster: 'CORE_FOUNDING' })

      expect(mockDb.documentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ cluster: 'CORE_FOUNDING' }),
        })
      )
    })

    it('should filter by status', async () => {
      mockDb.documentItem.findMany.mockResolvedValue([])
      mockDb.documentItem.count.mockResolvedValue(0)

      const caller = createAuthCaller(mockDb)

      await caller.documents.list({ status: 'DRAFTING' })

      expect(mockDb.documentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'DRAFTING' }),
        })
      )
    })

    it('should filter by priority', async () => {
      mockDb.documentItem.findMany.mockResolvedValue([])
      mockDb.documentItem.count.mockResolvedValue(0)

      const caller = createAuthCaller(mockDb)

      await caller.documents.list({ priority: 'CRITICAL' })

      expect(mockDb.documentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ priority: 'CRITICAL' }),
        })
      )
    })

    it('should filter by ownerId', async () => {
      mockDb.documentItem.findMany.mockResolvedValue([])
      mockDb.documentItem.count.mockResolvedValue(0)

      const caller = createAuthCaller(mockDb)

      await caller.documents.list({ ownerId: 'user-1' })

      expect(mockDb.documentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ownerId: 'user-1' }),
        })
      )
    })

    it('should search by name or code (case insensitive)', async () => {
      mockDb.documentItem.findMany.mockResolvedValue([])
      mockDb.documentItem.count.mockResolvedValue(0)

      const caller = createAuthCaller(mockDb)

      await caller.documents.list({ search: 'điều lệ' })

      expect(mockDb.documentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'điều lệ', mode: 'insensitive' } },
              { code: { contains: 'điều lệ', mode: 'insensitive' } },
            ],
          }),
        })
      )
    })

    it('should handle empty/no filters (returns all with defaults)', async () => {
      mockDb.documentItem.findMany.mockResolvedValue([])
      mockDb.documentItem.count.mockResolvedValue(0)

      const caller = createAuthCaller(mockDb)

      const result = await caller.documents.list()

      expect(result.page).toBe(0)
      expect(result.pageSize).toBe(25)
      expect(mockDb.documentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 25,
        })
      )
    })

    it('should sort by specified field and direction', async () => {
      mockDb.documentItem.findMany.mockResolvedValue([])
      mockDb.documentItem.count.mockResolvedValue(0)

      const caller = createAuthCaller(mockDb)

      await caller.documents.list({ sortField: 'name', sortDirection: 'asc' })

      expect(mockDb.documentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        })
      )
    })

    it('should filter by deadline range', async () => {
      mockDb.documentItem.findMany.mockResolvedValue([])
      mockDb.documentItem.count.mockResolvedValue(0)

      const caller = createAuthCaller(mockDb)

      const before = new Date('2025-12-31')
      const after = new Date('2025-01-01')

      await caller.documents.list({ deadlineBefore: before, deadlineAfter: after })

      expect(mockDb.documentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deadline: { lte: before, gte: after },
          }),
        })
      )
    })
  })

  describe('get', () => {
    it('should return document with checks, legal bases, and versions', async () => {
      const doc = {
        id: 'doc-1',
        code: 'DOC-001',
        name: 'Điều lệ Viện',
        checks: [{ id: 'c1', question: 'Q1', passed: true }],
        legalBases: [{ id: 'lb1', legalBasis: { title: 'Luật 93/2025' } }],
        versions: [{ id: 'v1', version: 1 }],
        comments: [],
      }

      mockDb.documentItem.findUnique.mockResolvedValue(doc)

      const caller = createAuthCaller(mockDb)

      const result = await caller.documents.get({ id: 'doc-1' })

      expect(result).toEqual(doc)
      expect(mockDb.documentItem.findUnique).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        include: {
          checks: true,
          legalBases: { include: { legalBasis: true } },
          versions: { orderBy: { version: 'desc' } },
          comments: {
            include: { author: { select: { id: true, name: true, avatarUrl: true } } },
            orderBy: { createdAt: 'asc' },
          },
        },
      })
    })

    it('should throw NOT_FOUND when document does not exist', async () => {
      mockDb.documentItem.findUnique.mockResolvedValue(null)

      const caller = createAuthCaller(mockDb)

      await expect(
        caller.documents.get({ id: 'nonexistent' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  describe('update (authentication)', () => {
    it('should require authentication for update', async () => {
      const ctx = createPublicContext(mockDb)
      const caller = createCaller(ctx)

      await expect(
        caller.documents.update({ id: 'doc-1', name: 'New Name' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })
  })

  describe('archive (delete equivalent)', () => {
    it('System_Admin can archive a document (soft delete)', async () => {
      const ctx = {
        db: mockDb,
        session: {
          user: { id: 'admin-1', email: 'admin@test.com', name: 'Admin' },
          roles: ['System_Admin'],
        },
        headers: undefined,
      }
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'DRAFTING',
      })
      mockDb.documentItem.update.mockResolvedValue({
        id: 'doc-1',
        status: 'ARCHIVED',
      })
      mockDb.auditLog.create.mockResolvedValue({})

      const result = await caller.documents.updateStatus({
        id: 'doc-1',
        status: 'ARCHIVED',
      })

      expect(result.status).toBe('ARCHIVED')
    })

    it('regular user cannot archive from non-APPROVED state', async () => {
      const ctx = createAuthenticatedContext(mockDb)
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'DRAFTING',
      })

      await expect(
        caller.documents.updateStatus({ id: 'doc-1', status: 'ARCHIVED' })
      ).rejects.toThrow('Không thể chuyển trạng thái')
    })
  })

  describe('edge cases', () => {
    it('should reject invalid cluster enum value', async () => {
      const caller = createAuthCaller(mockDb)

      await expect(
        caller.documents.create({
          name: 'Test',
          type: 'general',
          cluster: 'INVALID_CLUSTER' as any,
        })
      ).rejects.toThrow()
    })

    it('should reject page size > 100', async () => {
      const caller = createAuthCaller(mockDb)

      await expect(
        caller.documents.list({ pageSize: 200 })
      ).rejects.toThrow()
    })

    it('should reject negative page number', async () => {
      const caller = createAuthCaller(mockDb)

      await expect(
        caller.documents.list({ page: -1 })
      ).rejects.toThrow()
    })

    it('should ignore invalid sort field and use default', async () => {
      mockDb.documentItem.findMany.mockResolvedValue([])
      mockDb.documentItem.count.mockResolvedValue(0)

      const caller = createAuthCaller(mockDb)

      await caller.documents.list({ sortField: 'nonexistent_field' })

      expect(mockDb.documentItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      )
    })
  })
})
