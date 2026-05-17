import { describe, it, expect, vi, beforeEach } from 'vitest'
import { router } from '../../trpc'
import { documentsRouter } from '../documents'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    documentItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

function createAuthenticatedContext(db: MockDb, userId: string, roles: string[]) {
  return {
    db,
    session: {
      user: { id: userId, email: 'test@iocm.vn', name: 'Test User' },
      roles,
    },
    headers: undefined,
  }
}

function createCaller(ctx: ReturnType<typeof createAuthenticatedContext>) {
  const appRouter = router({ documents: documentsRouter })
  return appRouter.createCaller(ctx as any)
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('documentsRouter — updateStatus (status workflow)', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('valid transitions', () => {
    it('should allow NOT_STARTED → DRAFTING', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'NOT_STARTED',
      })
      mockDb.documentItem.update.mockResolvedValue({
        id: 'doc-1',
        status: 'DRAFTING',
      })
      mockDb.auditLog.create.mockResolvedValue({})

      const result = await caller.documents.updateStatus({
        id: 'doc-1',
        status: 'DRAFTING',
      })

      expect(result.status).toBe('DRAFTING')
      expect(mockDb.documentItem.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { status: 'DRAFTING' },
      })
    })

    it('should allow DRAFTING → IN_REVIEW', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'DRAFTING',
      })
      mockDb.documentItem.update.mockResolvedValue({
        id: 'doc-1',
        status: 'IN_REVIEW',
      })
      mockDb.auditLog.create.mockResolvedValue({})

      const result = await caller.documents.updateStatus({
        id: 'doc-1',
        status: 'IN_REVIEW',
      })

      expect(result.status).toBe('IN_REVIEW')
    })

    it('should allow IN_REVIEW → PENDING_APPROVAL', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'IN_REVIEW',
      })
      mockDb.documentItem.update.mockResolvedValue({
        id: 'doc-1',
        status: 'PENDING_APPROVAL',
      })
      mockDb.auditLog.create.mockResolvedValue({})

      const result = await caller.documents.updateStatus({
        id: 'doc-1',
        status: 'PENDING_APPROVAL',
      })

      expect(result.status).toBe('PENDING_APPROVAL')
    })

    it('should allow PENDING_APPROVAL → APPROVED', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'PENDING_APPROVAL',
      })
      mockDb.documentItem.update.mockResolvedValue({
        id: 'doc-1',
        status: 'APPROVED',
      })
      mockDb.auditLog.create.mockResolvedValue({})

      const result = await caller.documents.updateStatus({
        id: 'doc-1',
        status: 'APPROVED',
      })

      expect(result.status).toBe('APPROVED')
    })
  })

  describe('audit logging', () => {
    it('should create audit log entry on status change', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'NOT_STARTED',
      })
      mockDb.documentItem.update.mockResolvedValue({
        id: 'doc-1',
        status: 'DRAFTING',
      })
      mockDb.auditLog.create.mockResolvedValue({})

      await caller.documents.updateStatus({ id: 'doc-1', status: 'DRAFTING' })

      expect(mockDb.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          action: 'DOCUMENT_STATUS_CHANGED',
          targetType: 'DocumentItem',
          targetId: 'doc-1',
          beforeVal: { status: 'NOT_STARTED' },
          afterVal: { status: 'DRAFTING' },
        },
      })
    })

    it('should NOT create audit log when status is unchanged', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'DRAFTING',
      })

      await caller.documents.updateStatus({ id: 'doc-1', status: 'DRAFTING' })

      expect(mockDb.auditLog.create).not.toHaveBeenCalled()
      expect(mockDb.documentItem.update).not.toHaveBeenCalled()
    })
  })

  describe('invalid transitions', () => {
    it('should reject NOT_STARTED → APPROVED', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'NOT_STARTED',
      })

      await expect(
        caller.documents.updateStatus({ id: 'doc-1', status: 'APPROVED' })
      ).rejects.toThrow('Không thể chuyển trạng thái')
    })

    it('should reject DRAFTING → APPROVED (skip IN_REVIEW)', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'DRAFTING',
      })

      await expect(
        caller.documents.updateStatus({ id: 'doc-1', status: 'APPROVED' })
      ).rejects.toThrow('Không thể chuyển trạng thái')
    })

    it('should reject APPROVED → DRAFTING (no going back)', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'APPROVED',
      })

      await expect(
        caller.documents.updateStatus({ id: 'doc-1', status: 'DRAFTING' })
      ).rejects.toThrow('Không thể chuyển trạng thái')
    })
  })

  describe('admin override — Any → ARCHIVED', () => {
    it('System_Admin can archive from any state', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['System_Admin'])
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

    it('Director can archive from any state', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'director-1', ['Director'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue({
        id: 'doc-1',
        status: 'IN_REVIEW',
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

    it('non-admin cannot archive from DRAFTING', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
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

  describe('document not found', () => {
    it('should throw NOT_FOUND when document does not exist', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Core_Team_Member'])
      const caller = createCaller(ctx)

      mockDb.documentItem.findUnique.mockResolvedValue(null)

      await expect(
        caller.documents.updateStatus({ id: 'nonexistent', status: 'DRAFTING' })
      ).rejects.toThrow('Tài liệu không tồn tại')
    })
  })

  describe('requires authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const ctx = { db: mockDb, session: null, headers: undefined }
      const appRouter = router({ documents: documentsRouter })
      const caller = appRouter.createCaller(ctx as any)

      await expect(
        caller.documents.updateStatus({ id: 'doc-1', status: 'DRAFTING' })
      ).rejects.toThrow('Bạn cần đăng nhập')
    })
  })
})
