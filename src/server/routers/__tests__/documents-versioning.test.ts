import { describe, it, expect, vi, beforeEach } from 'vitest'
import { router } from '../../trpc'
import { documentsRouter } from '../documents'
import { TRPCError } from '@trpc/server'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    documentItem: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
    $transaction: vi.fn(),
  }
}

type MockDb = ReturnType<typeof createMockDb>

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

function createPublicContext(db: MockDb) {
  return { db, session: null, headers: undefined }
}

function createCaller(ctx: any) {
  const appRouter = router({ documents: documentsRouter })
  return appRouter.createCaller(ctx)
}

// ─── Document Versioning Tests ──────────────────────────────────────────────

describe('documentsRouter - versioning', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('update (auto-versioning)', () => {
    it('should create a version snapshot and increment version on update', async () => {
      const currentDoc = {
        id: 'doc-1',
        code: 'DOC-001',
        name: 'Điều lệ Viện',
        type: 'regulation',
        cluster: 'CORE_FOUNDING',
        version: 1,
        status: 'DRAFTING',
        confidentiality: 'INTERNAL',
        priority: 'HIGH',
        deadline: null,
        effectiveDate: null,
        expiryDate: null,
        riskIfMissing: 'Không thể thành lập Viện',
        fileUrl: 'https://s3.example.com/old-file.pdf',
        ownerId: 'user-1',
        reviewerId: null,
        approverId: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      const updatedDoc = { ...currentDoc, name: 'Điều lệ Viện (cập nhật)', version: 2 }

      mockDb.documentItem.findUnique.mockResolvedValue(currentDoc)
      mockDb.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          documentVersion: { create: vi.fn().mockResolvedValue({ id: 'ver-1' }) },
          documentItem: { update: vi.fn().mockResolvedValue(updatedDoc) },
        }
        return fn(tx)
      })

      const ctx = createAuthenticatedContext(mockDb)
      const caller = createCaller(ctx)

      const result = await caller.documents.update({
        id: 'doc-1',
        name: 'Điều lệ Viện (cập nhật)',
        changeNote: 'Cập nhật tên tài liệu',
      })

      expect(result.version).toBe(2)
      expect(result.name).toBe('Điều lệ Viện (cập nhật)')

      // Verify transaction was called
      expect(mockDb.$transaction).toHaveBeenCalledTimes(1)

      // Verify the transaction function creates version and updates doc
      const txFn = mockDb.$transaction.mock.calls[0]![0]
      const mockTx = {
        documentVersion: { create: vi.fn().mockResolvedValue({ id: 'ver-1' }) },
        documentItem: { update: vi.fn().mockResolvedValue(updatedDoc) },
      }
      await txFn(mockTx)

      // Check version snapshot was created with correct data
      expect(mockTx.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: 'doc-1',
          version: 1,
          changedBy: 'user-1',
          changeNote: 'Cập nhật tên tài liệu',
          fileUrl: 'https://s3.example.com/old-file.pdf',
        }),
      })

      // Check document was updated with version increment
      expect(mockTx.documentItem.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: expect.objectContaining({
          name: 'Điều lệ Viện (cập nhật)',
          version: { increment: 1 },
        }),
      })
    })

    it('should throw NOT_FOUND when document does not exist', async () => {
      mockDb.documentItem.findUnique.mockResolvedValue(null)

      const ctx = createAuthenticatedContext(mockDb)
      const caller = createCaller(ctx)

      await expect(
        caller.documents.update({ id: 'nonexistent', name: 'Test' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('should require authentication', async () => {
      const ctx = createPublicContext(mockDb)
      const caller = createCaller(ctx)

      await expect(
        caller.documents.update({ id: 'doc-1', name: 'Test' })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('should store content snapshot as JSON with all relevant fields', async () => {
      const currentDoc = {
        id: 'doc-2',
        code: 'DOC-002',
        name: 'Quy chế tài chính',
        type: 'policy',
        cluster: 'FINANCE',
        version: 3,
        status: 'IN_REVIEW',
        confidentiality: 'RESTRICTED',
        priority: 'CRITICAL',
        deadline: new Date('2024-06-01'),
        effectiveDate: new Date('2024-03-01'),
        expiryDate: null,
        riskIfMissing: 'Vi phạm quy định',
        fileUrl: null,
        ownerId: 'user-2',
        reviewerId: 'user-3',
        approverId: 'user-4',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-02-15'),
      }

      mockDb.documentItem.findUnique.mockResolvedValue(currentDoc)
      mockDb.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          documentVersion: { create: vi.fn().mockResolvedValue({ id: 'ver-3' }) },
          documentItem: { update: vi.fn().mockResolvedValue({ ...currentDoc, version: 4 }) },
        }
        return fn(tx)
      })

      const ctx = createAuthenticatedContext(mockDb, 'user-5')
      const caller = createCaller(ctx)

      await caller.documents.update({
        id: 'doc-2',
        priority: 'HIGH',
      })

      // Extract the transaction function and verify content
      const txFn = mockDb.$transaction.mock.calls[0]![0]
      const mockTx = {
        documentVersion: { create: vi.fn().mockResolvedValue({ id: 'ver-3' }) },
        documentItem: { update: vi.fn().mockResolvedValue({ ...currentDoc, version: 4 }) },
      }
      await txFn(mockTx)

      const createCall = mockTx.documentVersion.create.mock.calls[0]![0]
      const content = JSON.parse(createCall.data.content)

      expect(content.name).toBe('Quy chế tài chính')
      expect(content.type).toBe('policy')
      expect(content.cluster).toBe('FINANCE')
      expect(content.status).toBe('IN_REVIEW')
      expect(content.confidentiality).toBe('RESTRICTED')
      expect(content.priority).toBe('CRITICAL')
      expect(content.ownerId).toBe('user-2')
      expect(content.reviewerId).toBe('user-3')
      expect(content.approverId).toBe('user-4')
      expect(createCall.data.changedBy).toBe('user-5')
      expect(createCall.data.version).toBe(3)
    })
  })

  describe('listVersions', () => {
    it('should return versions ordered by version descending', async () => {
      const versions = [
        { id: 'v3', documentId: 'doc-1', version: 3, changedBy: 'user-1', createdAt: new Date() },
        { id: 'v2', documentId: 'doc-1', version: 2, changedBy: 'user-2', createdAt: new Date() },
        { id: 'v1', documentId: 'doc-1', version: 1, changedBy: 'user-1', createdAt: new Date() },
      ]

      mockDb.documentVersion.findMany.mockResolvedValue(versions)

      const ctx = createPublicContext(mockDb)
      const caller = createCaller(ctx)

      const result = await caller.documents.listVersions({ documentId: 'doc-1' })

      expect(result).toHaveLength(3)
      expect(result[0]!.version).toBe(3)
      expect(result[2]!.version).toBe(1)
      expect(mockDb.documentVersion.findMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-1' },
        orderBy: { version: 'desc' },
      })
    })

    it('should return empty array when no versions exist', async () => {
      mockDb.documentVersion.findMany.mockResolvedValue([])

      const ctx = createPublicContext(mockDb)
      const caller = createCaller(ctx)

      const result = await caller.documents.listVersions({ documentId: 'doc-new' })
      expect(result).toHaveLength(0)
    })
  })

  describe('getVersion', () => {
    it('should return a specific version by number', async () => {
      const version = {
        id: 'v2',
        documentId: 'doc-1',
        version: 2,
        content: '{"name":"Old Name"}',
        fileUrl: null,
        changedBy: 'user-1',
        changeNote: 'Updated name',
        createdAt: new Date(),
      }

      mockDb.documentVersion.findFirst.mockResolvedValue(version)

      const ctx = createPublicContext(mockDb)
      const caller = createCaller(ctx)

      const result = await caller.documents.getVersion({ documentId: 'doc-1', version: 2 })

      expect(result.id).toBe('v2')
      expect(result.version).toBe(2)
      expect(result.changeNote).toBe('Updated name')
      expect(mockDb.documentVersion.findFirst).toHaveBeenCalledWith({
        where: { documentId: 'doc-1', version: 2 },
      })
    })

    it('should throw NOT_FOUND when version does not exist', async () => {
      mockDb.documentVersion.findFirst.mockResolvedValue(null)

      const ctx = createPublicContext(mockDb)
      const caller = createCaller(ctx)

      await expect(
        caller.documents.getVersion({ documentId: 'doc-1', version: 99 })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })
})
