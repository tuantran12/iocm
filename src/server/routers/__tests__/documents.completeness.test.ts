import { describe, it, expect, vi, beforeEach } from 'vitest'
import { router } from '../../trpc'
import { documentsRouter } from '../documents'
import { COMPLETENESS_QUESTIONS } from '../../completeness'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    documentItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
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

function createContext(db: MockDb) {
  return { db, session: null, headers: undefined }
}

function createAuthContext(db: MockDb, userId = 'user-1') {
  return {
    db,
    session: {
      user: { id: userId, email: 'user@test.com', name: 'Test User' },
      roles: ['Core_Team_Member'],
    },
    headers: undefined,
  }
}

function createCaller(db: MockDb) {
  const appRouter = router({ documents: documentsRouter })
  return appRouter.createCaller(createContext(db) as any)
}

function createAuthCaller(db: MockDb) {
  const appRouter = router({ documents: documentsRouter })
  return appRouter.createCaller(createAuthContext(db) as any)
}

function makeChecks(overrides: Partial<Record<string, { answer: string; passed: boolean }>> = {}) {
  return COMPLETENESS_QUESTIONS.map((q) => ({
    id: `check-${q.key}`,
    documentId: 'doc-1',
    question: q.key,
    answer: overrides[q.key]?.answer ?? null,
    passed: overrides[q.key]?.passed ?? false,
    updatedBy: null,
    updatedAt: new Date(),
  }))
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('documentsRouter — completeness check', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('create — initializes 8 completeness checks', () => {
    it('should create document and 8 completeness checks in transaction', async () => {
      const createdDoc = {
        id: 'doc-1',
        code: 'DOC-001',
        name: 'Test Document',
        type: 'general',
        cluster: 'CORE_FOUNDING',
      }

      // Mock $transaction to execute the callback
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
        name: 'Test Document',
        type: 'general',
        cluster: 'CORE_FOUNDING',
      })

      expect(result.id).toBe('doc-1')

      // Verify transaction was called
      expect(mockDb.$transaction).toHaveBeenCalledTimes(1)

      // Verify the transaction callback creates 8 checks
      const txCallback = mockDb.$transaction.mock.calls[0]![0]
      const mockTx = {
        documentItem: { create: vi.fn().mockResolvedValue(createdDoc) },
        completenessCheck: { createMany: vi.fn().mockResolvedValue({ count: 8 }) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      }
      await txCallback(mockTx)

      expect(mockTx.completenessCheck.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ documentId: 'doc-1', question: 'Q1', answer: null, passed: false }),
          expect.objectContaining({ documentId: 'doc-1', question: 'Q8', answer: null, passed: false }),
        ]),
      })
      expect(mockTx.completenessCheck.createMany.mock.calls[0]![0].data).toHaveLength(8)
    })
  })

  describe('getCompleteness', () => {
    it('should return checks with score 0 for uninitialized document', async () => {
      const checks = makeChecks()
      mockDb.completenessCheck.findMany.mockResolvedValue(checks)

      const caller = createCaller(mockDb)
      const result = await caller.documents.getCompleteness({ documentId: 'doc-1' })

      expect(result.checks).toHaveLength(8)
      expect(result.score).toBe(0)
      expect(result.canMarkOfficialRecord).toBe(false)
      expect(result.officialRecordBlockers).toHaveLength(7) // 7 required questions
    })

    it('should return score 1 when all checks pass', async () => {
      const checks = makeChecks(
        Object.fromEntries(
          COMPLETENESS_QUESTIONS.map((q) => [q.key, { answer: 'PASS', passed: true }])
        )
      )
      mockDb.completenessCheck.findMany.mockResolvedValue(checks)

      const caller = createCaller(mockDb)
      const result = await caller.documents.getCompleteness({ documentId: 'doc-1' })

      expect(result.score).toBe(1)
      expect(result.missingActions).toEqual([])
      expect(result.canMarkOfficialRecord).toBe(true)
    })

    it('should exclude NOT_APPLICABLE from score calculation', async () => {
      const checks = makeChecks({
        Q1: { answer: 'PASS', passed: true },
        Q2: { answer: 'PASS', passed: true },
        Q3: { answer: 'PASS', passed: true },
        Q4: { answer: 'NOT_APPLICABLE', passed: false },
        Q5: { answer: 'PASS', passed: true },
        Q6: { answer: 'FAIL', passed: false },
        Q7: { answer: 'NOT_APPLICABLE', passed: false },
        Q8: { answer: 'PASS', passed: true },
      })
      mockDb.completenessCheck.findMany.mockResolvedValue(checks)

      const caller = createCaller(mockDb)
      const result = await caller.documents.getCompleteness({ documentId: 'doc-1' })

      // 5 PASS out of 6 applicable = 5/6
      expect(result.score).toBeCloseTo(5 / 6)
    })

    it('should return missing actions for failed checks', async () => {
      const checks = makeChecks({
        Q1: { answer: 'PASS', passed: true },
        Q2: { answer: 'FAIL', passed: false },
        Q3: { answer: 'PASS', passed: true },
        Q4: { answer: 'PASS', passed: true },
        Q5: { answer: 'PASS', passed: true },
        Q6: { answer: 'PASS', passed: true },
        Q7: { answer: 'PASS', passed: true },
        Q8: { answer: 'PASS', passed: true },
      })
      mockDb.completenessCheck.findMany.mockResolvedValue(checks)

      const caller = createCaller(mockDb)
      const result = await caller.documents.getCompleteness({ documentId: 'doc-1' })

      expect(result.missingActions).toHaveLength(1)
      expect(result.missingActions[0]!.key).toBe('Q2')
      expect(result.missingActions[0]!.action).toBe('Liên kết căn cứ pháp lý hoặc căn cứ nội bộ')
    })
  })

  describe('updateCompleteness', () => {
    it('should update checks and recalculate score', async () => {
      const document = { id: 'doc-1', code: 'DOC-001', name: 'Test' }
      mockDb.documentItem.findUnique.mockResolvedValue(document)

      const updatedChecks = makeChecks({
        Q1: { answer: 'PASS', passed: true },
        Q2: { answer: 'PASS', passed: true },
        Q3: { answer: 'PASS', passed: true },
        Q4: { answer: 'PASS', passed: true },
        Q5: { answer: 'PASS', passed: true },
        Q6: { answer: 'PASS', passed: true },
        Q7: { answer: 'PASS', passed: true },
        Q8: { answer: 'PASS', passed: true },
      })

      mockDb.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          completenessCheck: {
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findMany: vi.fn().mockResolvedValue(updatedChecks),
          },
          documentItem: {
            update: vi.fn().mockResolvedValue({ ...document, completenessScore: 1 }),
          },
        }
        return cb(tx)
      })

      const caller = createCaller(mockDb)
      const result = await caller.documents.updateCompleteness({
        documentId: 'doc-1',
        updates: [
          { questionKey: 'Q1', answer: 'PASS' },
          { questionKey: 'Q2', answer: 'PASS' },
        ],
        updatedBy: 'user-1',
      })

      expect(result.score).toBe(1)
      expect(result.canMarkOfficialRecord).toBe(true)
    })

    it('should throw error when document does not exist', async () => {
      mockDb.documentItem.findUnique.mockResolvedValue(null)

      const caller = createCaller(mockDb)
      await expect(
        caller.documents.updateCompleteness({
          documentId: 'nonexistent',
          updates: [{ questionKey: 'Q1', answer: 'PASS' }],
        })
      ).rejects.toThrow('Tài liệu không tồn tại')
    })
  })

  describe('markOfficialRecord', () => {
    it('should allow marking when all required questions pass', async () => {
      const checks = makeChecks(
        Object.fromEntries(
          COMPLETENESS_QUESTIONS.map((q) => [q.key, { answer: 'PASS', passed: true }])
        )
      )
      mockDb.completenessCheck.findMany.mockResolvedValue(checks)
      mockDb.documentItem.update.mockResolvedValue({
        id: 'doc-1',
        status: 'APPROVED',
      })

      const caller = createCaller(mockDb)
      const result = await caller.documents.markOfficialRecord({ documentId: 'doc-1' })

      expect(result.status).toBe('APPROVED')
      expect(mockDb.documentItem.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { status: 'APPROVED' },
      })
    })

    it('should block marking when required questions fail', async () => {
      const checks = makeChecks({
        Q1: { answer: 'PASS', passed: true },
        Q2: { answer: 'FAIL', passed: false }, // Required, blocks
        Q3: { answer: 'PASS', passed: true },
        Q4: { answer: 'FAIL', passed: false }, // Not required, doesn't block
        Q5: { answer: 'PASS', passed: true },
        Q6: { answer: 'PASS', passed: true },
        Q7: { answer: 'PASS', passed: true },
        Q8: { answer: 'PASS', passed: true },
      })
      mockDb.completenessCheck.findMany.mockResolvedValue(checks)

      const caller = createCaller(mockDb)
      await expect(
        caller.documents.markOfficialRecord({ documentId: 'doc-1' })
      ).rejects.toThrow('Không thể đánh dấu tài liệu là bản gốc chính thức')
    })

    it('should allow marking when required questions are PASS or NOT_APPLICABLE', async () => {
      const checks = makeChecks({
        Q1: { answer: 'PASS', passed: true },
        Q2: { answer: 'NOT_APPLICABLE', passed: false },
        Q3: { answer: 'PASS', passed: true },
        Q4: { answer: 'FAIL', passed: false }, // Not required
        Q5: { answer: 'PASS', passed: true },
        Q6: { answer: 'PASS', passed: true },
        Q7: { answer: 'NOT_APPLICABLE', passed: false },
        Q8: { answer: 'PASS', passed: true },
      })
      mockDb.completenessCheck.findMany.mockResolvedValue(checks)
      mockDb.documentItem.update.mockResolvedValue({
        id: 'doc-1',
        status: 'APPROVED',
      })

      const caller = createCaller(mockDb)
      const result = await caller.documents.markOfficialRecord({ documentId: 'doc-1' })
      expect(result.status).toBe('APPROVED')
    })
  })
})
