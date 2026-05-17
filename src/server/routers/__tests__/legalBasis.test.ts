import { describe, it, expect, vi, beforeEach } from 'vitest'
import { router } from '../../trpc'
import { legalBasisRouter } from '../legalBasis'

// ─── Mock the services module ───────────────────────────────────────────────
vi.mock('../../services/legal-basis-expiry', () => ({
  runExpiryCheck: vi.fn().mockResolvedValue({ updated: 0, notifications: 0 }),
  getExpiringLegalBases: vi.fn().mockResolvedValue([]),
  DEFAULT_EXPIRY_THRESHOLDS: [30, 60, 90],
  DEFAULT_VERIFICATION_MAX_DAYS: 180,
}))

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    legalBasis: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    documentItem: {
      findUnique: vi.fn(),
    },
    documentLegalBasis: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  }
}

type MockDb = ReturnType<typeof createMockDb>

function createAuthContext(db: MockDb, roles: string[] = ['Legal_Officer'], userId = 'user-1') {
  return {
    db,
    session: {
      user: { id: userId, email: 'legal@test.com', name: 'Legal Officer' },
      roles,
    },
    headers: undefined,
  }
}

function createUnauthContext(db: MockDb) {
  return { db, session: null, headers: undefined }
}

function createCaller(ctx: any) {
  const appRouter = router({ legalBasis: legalBasisRouter })
  return appRouter.createCaller(ctx)
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('legalBasisRouter', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('list', () => {
    it('should return paginated results with linked document count', async () => {
      const items = [
        { id: 'lb-1', documentNumber: '93/2025/QH15', title: 'Luật Khoa học', documents: [{ id: 'dlb-1', documentId: 'doc-1' }] },
        { id: 'lb-2', documentNumber: '08/2014/NĐ-CP', title: 'Nghị định 08', documents: [] },
      ]
      mockDb.legalBasis.findMany.mockResolvedValue(items)
      mockDb.legalBasis.count.mockResolvedValue(2)

      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      const result = await caller.legalBasis.list({ page: 0, pageSize: 10 })

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.page).toBe(0)
      expect(result.pageSize).toBe(10)
    })

    it('should filter by status', async () => {
      mockDb.legalBasis.findMany.mockResolvedValue([])
      mockDb.legalBasis.count.mockResolvedValue(0)

      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      await caller.legalBasis.list({ status: 'ACTIVE' })

      expect(mockDb.legalBasis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        })
      )
    })

    it('should filter by basisType', async () => {
      mockDb.legalBasis.findMany.mockResolvedValue([])
      mockDb.legalBasis.count.mockResolvedValue(0)

      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      await caller.legalBasis.list({ basisType: 'law' })

      expect(mockDb.legalBasis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ basisType: 'law' }),
        })
      )
    })

    it('should filter by scope', async () => {
      mockDb.legalBasis.findMany.mockResolvedValue([])
      mockDb.legalBasis.count.mockResolvedValue(0)

      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      await caller.legalBasis.list({ scope: 'mandatory' })

      expect(mockDb.legalBasis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scope: 'mandatory' }),
        })
      )
    })

    it('should search by title, documentNumber, or issuingAuth', async () => {
      mockDb.legalBasis.findMany.mockResolvedValue([])
      mockDb.legalBasis.count.mockResolvedValue(0)

      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      await caller.legalBasis.list({ search: 'Luật' })

      expect(mockDb.legalBasis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'Luật', mode: 'insensitive' } },
              { documentNumber: { contains: 'Luật', mode: 'insensitive' } },
              { issuingAuth: { contains: 'Luật', mode: 'insensitive' } },
            ],
          }),
        })
      )
    })

    it('should require authentication', async () => {
      const ctx = createUnauthContext(mockDb)
      const caller = createCaller(ctx)

      await expect(caller.legalBasis.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('should sort by specified field', async () => {
      mockDb.legalBasis.findMany.mockResolvedValue([])
      mockDb.legalBasis.count.mockResolvedValue(0)

      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      await caller.legalBasis.list({ sortField: 'title', sortDirection: 'asc' })

      expect(mockDb.legalBasis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { title: 'asc' },
        })
      )
    })
  })

  describe('get', () => {
    it('should return legal basis with linked documents', async () => {
      const lb = {
        id: 'lb-1',
        documentNumber: '93/2025/QH15',
        title: 'Luật Khoa học và Công nghệ',
        documents: [
          { id: 'dlb-1', document: { id: 'doc-1', code: 'DOC-001', name: 'Điều lệ', status: 'APPROVED' } },
        ],
      }
      mockDb.legalBasis.findUnique.mockResolvedValue(lb)

      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      const result = await caller.legalBasis.get({ id: 'lb-1' })

      expect(result.id).toBe('lb-1')
      expect(result.documents).toHaveLength(1)
    })

    it('should throw NOT_FOUND for non-existent legal basis', async () => {
      mockDb.legalBasis.findUnique.mockResolvedValue(null)

      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      await expect(caller.legalBasis.get({ id: 'nonexistent' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  describe('create', () => {
    it('should create legal basis and log audit', async () => {
      const created = {
        id: 'lb-new',
        documentNumber: '93/2025/QH15',
        title: 'Luật Khoa học và Công nghệ',
        issuingAuth: 'Quốc hội',
        effectiveDate: new Date('2025-07-01'),
        status: 'ACTIVE',
        basisType: 'law',
        scope: 'mandatory',
      }
      mockDb.legalBasis.findUnique.mockResolvedValue(null) // no duplicate
      mockDb.legalBasis.create.mockResolvedValue(created)
      mockDb.auditLog.create.mockResolvedValue({})

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      const result = await caller.legalBasis.create({
        documentNumber: '93/2025/QH15',
        title: 'Luật Khoa học và Công nghệ',
        issuingAuth: 'Quốc hội',
        effectiveDate: new Date('2025-07-01'),
        basisType: 'law',
        scope: 'mandatory',
      })

      expect(result.id).toBe('lb-new')
      expect(mockDb.legalBasis.create).toHaveBeenCalled()
      expect(mockDb.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_LEGAL_BASIS',
            targetType: 'LegalBasis',
          }),
        })
      )
    })

    it('should reject duplicate document_number', async () => {
      mockDb.legalBasis.findUnique.mockResolvedValue({ id: 'existing' })

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      await expect(
        caller.legalBasis.create({
          documentNumber: '93/2025/QH15',
          title: 'Duplicate',
          issuingAuth: 'Quốc hội',
          effectiveDate: new Date('2025-07-01'),
          basisType: 'law',
          scope: 'mandatory',
        })
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })

    it('should reject empty title', async () => {
      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      await expect(
        caller.legalBasis.create({
          documentNumber: '93/2025/QH15',
          title: '',
          issuingAuth: 'Quốc hội',
          effectiveDate: new Date('2025-07-01'),
          basisType: 'law',
          scope: 'mandatory',
        })
      ).rejects.toThrow()
    })

    it('should require authorized role (reject Viewer)', async () => {
      const ctx = createAuthContext(mockDb, ['Viewer'])
      const caller = createCaller(ctx)

      await expect(
        caller.legalBasis.create({
          documentNumber: '93/2025/QH15',
          title: 'Test',
          issuingAuth: 'Quốc hội',
          effectiveDate: new Date('2025-07-01'),
          basisType: 'law',
          scope: 'mandatory',
        })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('should allow Core_Team_Member role to create', async () => {
      mockDb.legalBasis.findUnique.mockResolvedValue(null)
      mockDb.legalBasis.create.mockResolvedValue({ id: 'lb-core' })
      mockDb.auditLog.create.mockResolvedValue({})

      const ctx = createAuthContext(mockDb, ['Core_Team_Member'])
      const caller = createCaller(ctx)

      const result = await caller.legalBasis.create({
        documentNumber: 'NĐ-08/2014',
        title: 'Nghị định 08',
        issuingAuth: 'Chính phủ',
        effectiveDate: new Date('2014-01-01'),
        basisType: 'decree',
        scope: 'mandatory',
      })

      expect(result.id).toBe('lb-core')
    })
  })

  describe('update', () => {
    it('should update legal basis fields and log audit', async () => {
      const existing = { id: 'lb-1', documentNumber: '93/2025/QH15', title: 'Old', status: 'ACTIVE' }
      mockDb.legalBasis.findUnique.mockResolvedValue(existing)
      mockDb.legalBasis.update.mockResolvedValue({ id: 'lb-1', title: 'Updated Title' })
      mockDb.auditLog.create.mockResolvedValue({})

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      const result = await caller.legalBasis.update({ id: 'lb-1', title: 'Updated Title' })

      expect(result.title).toBe('Updated Title')
      expect(mockDb.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UPDATE_LEGAL_BASIS',
            targetType: 'LegalBasis',
          }),
        })
      )
    })

    it('should throw NOT_FOUND for non-existent legal basis', async () => {
      mockDb.legalBasis.findUnique.mockResolvedValue(null)

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      await expect(
        caller.legalBasis.update({ id: 'nonexistent', title: 'Test' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('should reject duplicate documentNumber on update', async () => {
      const existing = { id: 'lb-1', documentNumber: 'OLD-001' }
      mockDb.legalBasis.findUnique
        .mockResolvedValueOnce(existing) // first call: find existing
        .mockResolvedValueOnce({ id: 'lb-other', documentNumber: 'TAKEN-001' }) // second call: duplicate check

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      await expect(
        caller.legalBasis.update({ id: 'lb-1', documentNumber: 'TAKEN-001' })
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })
  })

  describe('delete (soft delete)', () => {
    it('should set status to SUPERSEDED and log audit', async () => {
      mockDb.legalBasis.findUnique.mockResolvedValue({ id: 'lb-1', status: 'ACTIVE' })
      mockDb.legalBasis.update.mockResolvedValue({ id: 'lb-1', status: 'SUPERSEDED' })
      mockDb.auditLog.create.mockResolvedValue({})

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      const result = await caller.legalBasis.delete({ id: 'lb-1' })

      expect(result.status).toBe('SUPERSEDED')
      expect(mockDb.legalBasis.update).toHaveBeenCalledWith({
        where: { id: 'lb-1' },
        data: { status: 'SUPERSEDED' },
      })
      expect(mockDb.auditLog.create).toHaveBeenCalled()
    })

    it('should throw NOT_FOUND for non-existent', async () => {
      mockDb.legalBasis.findUnique.mockResolvedValue(null)

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      await expect(caller.legalBasis.delete({ id: 'nonexistent' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  describe('search', () => {
    it('should return lightweight results for autocomplete', async () => {
      const results = [
        { id: 'lb-1', documentNumber: '93/2025/QH15', title: 'Luật KH&CN', status: 'ACTIVE', basisType: 'law', issuingAuth: 'Quốc hội' },
      ]
      mockDb.legalBasis.findMany.mockResolvedValue(results)

      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      const result = await caller.legalBasis.search({ query: 'Luật' })

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('lb-1')
      expect(mockDb.legalBasis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      )
    })

    it('should reject empty query', async () => {
      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      await expect(caller.legalBasis.search({ query: '' })).rejects.toThrow()
    })

    it('should respect custom limit', async () => {
      mockDb.legalBasis.findMany.mockResolvedValue([])

      const ctx = createAuthContext(mockDb)
      const caller = createCaller(ctx)

      await caller.legalBasis.search({ query: 'test', limit: 5 })

      expect(mockDb.legalBasis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      )
    })
  })

  describe('linkToDocument', () => {
    it('should create DocumentLegalBasis record', async () => {
      mockDb.legalBasis.findUnique.mockResolvedValue({ id: 'lb-1' })
      mockDb.documentItem.findUnique.mockResolvedValue({ id: 'doc-1' })
      mockDb.documentLegalBasis.findUnique.mockResolvedValue(null) // no existing link
      mockDb.documentLegalBasis.create.mockResolvedValue({ id: 'dlb-1', documentId: 'doc-1', legalBasisId: 'lb-1' })

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      const result = await caller.legalBasis.linkToDocument({
        legalBasisId: 'lb-1',
        documentId: 'doc-1',
      })

      expect(result.id).toBe('dlb-1')
      expect(mockDb.documentLegalBasis.create).toHaveBeenCalledWith({
        data: { documentId: 'doc-1', legalBasisId: 'lb-1' },
      })
    })

    it('should reject if legal basis does not exist', async () => {
      mockDb.legalBasis.findUnique.mockResolvedValue(null)
      mockDb.documentItem.findUnique.mockResolvedValue({ id: 'doc-1' })

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      await expect(
        caller.legalBasis.linkToDocument({ legalBasisId: 'nonexistent', documentId: 'doc-1' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('should reject if document does not exist', async () => {
      mockDb.legalBasis.findUnique.mockResolvedValue({ id: 'lb-1' })
      mockDb.documentItem.findUnique.mockResolvedValue(null)

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      await expect(
        caller.legalBasis.linkToDocument({ legalBasisId: 'lb-1', documentId: 'nonexistent' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('should reject duplicate link', async () => {
      mockDb.legalBasis.findUnique.mockResolvedValue({ id: 'lb-1' })
      mockDb.documentItem.findUnique.mockResolvedValue({ id: 'doc-1' })
      mockDb.documentLegalBasis.findUnique.mockResolvedValue({ id: 'existing-link' })

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      await expect(
        caller.legalBasis.linkToDocument({ legalBasisId: 'lb-1', documentId: 'doc-1' })
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })
  })

  describe('unlinkFromDocument', () => {
    it('should delete DocumentLegalBasis record', async () => {
      mockDb.documentLegalBasis.findUnique.mockResolvedValue({ id: 'dlb-1', documentId: 'doc-1', legalBasisId: 'lb-1' })
      mockDb.documentLegalBasis.delete.mockResolvedValue({})

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      const result = await caller.legalBasis.unlinkFromDocument({
        legalBasisId: 'lb-1',
        documentId: 'doc-1',
      })

      expect(result.success).toBe(true)
      expect(mockDb.documentLegalBasis.delete).toHaveBeenCalledWith({
        where: { id: 'dlb-1' },
      })
    })

    it('should throw NOT_FOUND if link does not exist', async () => {
      mockDb.documentLegalBasis.findUnique.mockResolvedValue(null)

      const ctx = createAuthContext(mockDb, ['Legal_Officer'])
      const caller = createCaller(ctx)

      await expect(
        caller.legalBasis.unlinkFromDocument({ legalBasisId: 'lb-1', documentId: 'doc-1' })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })
})
