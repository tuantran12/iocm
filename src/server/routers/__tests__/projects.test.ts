import { describe, it, expect, vi, beforeEach } from 'vitest'
import { router } from '../../trpc'
import { projectsRouter } from '../projects'
import { TRPCError } from '@trpc/server'
import { ProjectStatus, TaskStatus, Priority } from '@prisma/client'

// --- Helpers ----------------------------------------------------------------

function createMockDb() {
  return {
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    pilotDeployment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    technologyProduct: {
      findUnique: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  }
}

type MockDb = ReturnType<typeof createMockDb>

function createAuthenticatedContext(
  db: MockDb,
  userId: string,
  roles: string[] = []
) {
  return {
    db,
    session: {
      user: { id: userId, email: 'user@test.com', name: 'Test User' },
      roles,
    },
    headers: undefined,
  }
}

function createPublicContext(db: MockDb) {
  return { db, session: null, headers: undefined }
}

function createCaller(ctx: any) {
  const appRouter = router({ projects: projectsRouter })
  return appRouter.createCaller(ctx)
}

/**
 * Helper to setup $transaction mock that executes the callback.
 * The projects router uses db.$transaction(async (tx) => { ... })
 * so we need to pass the db itself as the tx argument.
 */
function setupTransaction(db: MockDb) {
  db.$transaction.mockImplementation(async (fn: any) => {
    return fn(db)
  })
}

// --- Project CRUD Tests ------------------------------------------------------

describe('projectsRouter', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    setupTransaction(mockDb)
    vi.clearAllMocks()
  })

  // ─── RBAC Tests ─────────────────────────────────────────────────────────────

  describe('RBAC', () => {
    it('should deny unauthenticated access to projects.list', async () => {
      const ctx = createPublicContext(mockDb)
      const caller = createCaller(ctx)

      await expect(caller.projects.list()).rejects.toThrow(TRPCError)
      await expect(caller.projects.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })

    it('should deny access to projects.create for Viewer role', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Viewer'])
      const caller = createCaller(ctx)

      await expect(
        caller.projects.create({ name: 'Test', type: 'research' })
      ).rejects.toThrow(TRPCError)
      await expect(
        caller.projects.create({ name: 'Test', type: 'research' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('should deny access to projects.delete for Project_Manager (requires Director/System_Admin)', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'user-1', ['Project_Manager'])
      const caller = createCaller(ctx)

      await expect(
        caller.projects.delete({ id: 'proj-1' })
      ).rejects.toThrow(TRPCError)
      await expect(
        caller.projects.delete({ id: 'proj-1' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  // ─── Project CRUD ──────────────────────────────────────────────────────────

  describe('Project CRUD', () => {
    describe('create', () => {
      it('should create a project with valid input', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const mockProject = {
          id: 'proj-1',
          name: 'Dự án AI cho nông nghiệp',
          type: 'pilot',
          goal: 'Ứng dụng AI vào nông nghiệp',
          targetGroup: null,
          ownerId: 'pm-1',
          sponsorId: null,
          groupId: null,
          status: ProjectStatus.PROPOSED,
          startDate: null,
          endDate: null,
          budget: null,
          riskLevel: null,
          createdAt: new Date(),
        }

        mockDb.project.create.mockResolvedValue(mockProject)
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.create({
          name: 'Dự án AI cho nông nghiệp',
          type: 'pilot',
          goal: 'Ứng dụng AI vào nông nghiệp',
        })

        expect(result.id).toBe('proj-1')
        expect(result.name).toBe('Dự án AI cho nông nghiệp')
        expect(result.status).toBe(ProjectStatus.PROPOSED)
        expect(mockDb.auditLog.create).toHaveBeenCalled()
      })

      it('should reject empty project name', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        await expect(
          caller.projects.create({ name: '', type: 'pilot' })
        ).rejects.toThrow()
      })

      it('should reject empty project type', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        await expect(
          caller.projects.create({ name: 'Test Project', type: '' })
        ).rejects.toThrow()
      })
    })

    describe('list', () => {
      it('should list projects with pagination', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const mockProjects = [
          { id: 'proj-1', name: 'Project 1', status: ProjectStatus.ACTIVE, pilots: [], _count: { kpis: 2, pilots: 1 } },
          { id: 'proj-2', name: 'Project 2', status: ProjectStatus.PROPOSED, pilots: [], _count: { kpis: 0, pilots: 0 } },
        ]

        mockDb.project.findMany.mockResolvedValue(mockProjects)
        mockDb.project.count.mockResolvedValue(2)

        const result = await caller.projects.list({ page: 0, pageSize: 10 })

        expect(result.items).toHaveLength(2)
        expect(result.total).toBe(2)
        expect(result.page).toBe(0)
        expect(result.pageSize).toBe(10)
      })

      it('should filter projects by status', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findMany.mockResolvedValue([])
        mockDb.project.count.mockResolvedValue(0)

        await caller.projects.list({ status: ProjectStatus.ACTIVE })

        expect(mockDb.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ status: ProjectStatus.ACTIVE }),
          })
        )
      })
    })

    describe('get', () => {
      it('should return project with pilots and KPIs', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const mockProject = {
          id: 'proj-1',
          name: 'Test Project',
          status: ProjectStatus.ACTIVE,
          pilots: [{ id: 'pilot-1', status: 'active', product: { id: 'prod-1', name: 'AI Tool' } }],
          kpis: [{ id: 'kpi-1', name: 'Satisfaction', type: 'SATISFACTION' }],
        }

        mockDb.project.findUnique.mockResolvedValue(mockProject)

        const result = await caller.projects.get({ id: 'proj-1' })

        expect(result.id).toBe('proj-1')
        expect(result.pilots).toHaveLength(1)
        expect(result.kpis).toHaveLength(1)
      })

      it('should throw NOT_FOUND for non-existent project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.get({ id: 'non-existent' })
        ).rejects.toThrow(TRPCError)
        await expect(
          caller.projects.get({ id: 'non-existent' })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
    })

    describe('update', () => {
      it('should update project fields', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const existing = {
          id: 'proj-1',
          name: 'Old Name',
          type: 'pilot',
          status: ProjectStatus.PROPOSED,
        }

        const updated = { ...existing, name: 'New Name' }

        mockDb.project.findUnique.mockResolvedValue(existing)
        mockDb.project.update.mockResolvedValue(updated)
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.update({ id: 'proj-1', name: 'New Name' })

        expect(result.name).toBe('New Name')
        expect(mockDb.auditLog.create).toHaveBeenCalled()
      })

      it('should throw NOT_FOUND when updating non-existent project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.update({ id: 'non-existent', name: 'Test' })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
    })

    describe('delete', () => {
      it('should soft-delete project (set status to CANCELLED)', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['System_Admin'])
        const caller = createCaller(ctx)

        const existing = { id: 'proj-1', name: 'Project', status: ProjectStatus.ACTIVE }
        const deleted = { ...existing, status: ProjectStatus.CANCELLED }

        mockDb.project.findUnique.mockResolvedValue(existing)
        mockDb.project.update.mockResolvedValue(deleted)
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.delete({ id: 'proj-1' })

        expect(result.status).toBe(ProjectStatus.CANCELLED)
        expect(mockDb.project.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { status: ProjectStatus.CANCELLED },
          })
        )
      })

      it('should throw NOT_FOUND when deleting non-existent project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'admin-1', ['System_Admin'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.delete({ id: 'non-existent' })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
    })
  })

  // ─── Project Status Workflow ────────────────────────────────────────────────

  describe('Project Status Workflow', () => {
    it('should allow valid transition PROPOSED → PLANNING', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
      const caller = createCaller(ctx)

      const existing = { id: 'proj-1', status: ProjectStatus.PROPOSED, startDate: null }
      const updated = { ...existing, status: ProjectStatus.PLANNING }

      mockDb.project.findUnique.mockResolvedValue(existing)
      mockDb.project.update.mockResolvedValue(updated)
      mockDb.auditLog.create.mockResolvedValue({})

      const result = await caller.projects.updateStatus({
        id: 'proj-1',
        status: ProjectStatus.PLANNING,
      })

      expect(result.status).toBe(ProjectStatus.PLANNING)
    })

    it('should allow valid transition PLANNING → ACTIVE and set startDate', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
      const caller = createCaller(ctx)

      const existing = { id: 'proj-1', status: ProjectStatus.PLANNING, startDate: null }
      const updated = { ...existing, status: ProjectStatus.ACTIVE, startDate: new Date() }

      mockDb.project.findUnique.mockResolvedValue(existing)
      mockDb.project.update.mockResolvedValue(updated)
      mockDb.auditLog.create.mockResolvedValue({})

      const result = await caller.projects.updateStatus({
        id: 'proj-1',
        status: ProjectStatus.ACTIVE,
      })

      expect(result.status).toBe(ProjectStatus.ACTIVE)
      // Verify startDate was set in the update call
      const updateCall = mockDb.project.update.mock.calls[0]![0] as any
      expect(updateCall.data.startDate).toBeInstanceOf(Date)
    })

    it('should allow valid transition ACTIVE → COMPLETED and set endDate', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
      const caller = createCaller(ctx)

      const existing = { id: 'proj-1', status: ProjectStatus.ACTIVE, startDate: new Date() }
      const updated = { ...existing, status: ProjectStatus.COMPLETED, endDate: new Date() }

      mockDb.project.findUnique.mockResolvedValue(existing)
      mockDb.project.update.mockResolvedValue(updated)
      mockDb.auditLog.create.mockResolvedValue({})

      const result = await caller.projects.updateStatus({
        id: 'proj-1',
        status: ProjectStatus.COMPLETED,
      })

      expect(result.status).toBe(ProjectStatus.COMPLETED)
      const updateCall = mockDb.project.update.mock.calls[0]![0] as any
      expect(updateCall.data.endDate).toBeInstanceOf(Date)
    })

    it('should reject invalid transition PROPOSED → ACTIVE', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
      const caller = createCaller(ctx)

      const existing = { id: 'proj-1', status: ProjectStatus.PROPOSED, startDate: null }
      mockDb.project.findUnique.mockResolvedValue(existing)

      await expect(
        caller.projects.updateStatus({ id: 'proj-1', status: ProjectStatus.ACTIVE })
      ).rejects.toThrow(TRPCError)
      await expect(
        caller.projects.updateStatus({ id: 'proj-1', status: ProjectStatus.ACTIVE })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should reject transition from CANCELLED (terminal state)', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
      const caller = createCaller(ctx)

      const existing = { id: 'proj-1', status: ProjectStatus.CANCELLED, startDate: null }
      mockDb.project.findUnique.mockResolvedValue(existing)

      await expect(
        caller.projects.updateStatus({ id: 'proj-1', status: ProjectStatus.ACTIVE })
      ).rejects.toThrow(TRPCError)
      await expect(
        caller.projects.updateStatus({ id: 'proj-1', status: ProjectStatus.ACTIVE })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should reject invalid transition PROPOSED → COMPLETED', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
      const caller = createCaller(ctx)

      const existing = { id: 'proj-1', status: ProjectStatus.PROPOSED, startDate: null }
      mockDb.project.findUnique.mockResolvedValue(existing)

      await expect(
        caller.projects.updateStatus({ id: 'proj-1', status: ProjectStatus.COMPLETED })
      ).rejects.toThrow(TRPCError)
    })

    it('should allow Director to force-cancel from any state', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'dir-1', ['Director'])
      const caller = createCaller(ctx)

      const existing = { id: 'proj-1', status: ProjectStatus.ACTIVE, startDate: new Date() }
      const updated = { ...existing, status: ProjectStatus.CANCELLED, endDate: new Date() }

      mockDb.project.findUnique.mockResolvedValue(existing)
      mockDb.project.update.mockResolvedValue(updated)
      mockDb.auditLog.create.mockResolvedValue({})

      const result = await caller.projects.updateStatus({
        id: 'proj-1',
        status: ProjectStatus.CANCELLED,
        reason: 'Ngân sách bị cắt',
      })

      expect(result.status).toBe(ProjectStatus.CANCELLED)
    })

    it('should throw NOT_FOUND for non-existent project status update', async () => {
      const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
      const caller = createCaller(ctx)

      mockDb.project.findUnique.mockResolvedValue(null)

      await expect(
        caller.projects.updateStatus({ id: 'non-existent', status: ProjectStatus.PLANNING })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })

  // ─── Pilot Lifecycle ────────────────────────────────────────────────────────

  describe('Pilot Lifecycle', () => {
    describe('createPilot', () => {
      it('should create a pilot for an existing project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const mockProject = { id: 'proj-1', status: ProjectStatus.ACTIVE }
        const mockPilot = {
          id: 'pilot-1',
          projectId: 'proj-1',
          productId: null,
          deploymentArea: 'Hà Nội',
          beneficiaryGroup: 'Nông dân',
          beneficiaryCount: 100,
          status: 'planning',
          createdAt: new Date(),
        }

        mockDb.project.findUnique.mockResolvedValue(mockProject)
        mockDb.pilotDeployment.create.mockResolvedValue(mockPilot)
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.createPilot({
          projectId: 'proj-1',
          deploymentArea: 'Hà Nội',
          beneficiaryGroup: 'Nông dân',
          beneficiaryCount: 100,
        })

        expect(result.id).toBe('pilot-1')
        expect(result.deploymentArea).toBe('Hà Nội')
        expect(result.status).toBe('planning')
      })

      it('should reject creating pilot for CANCELLED project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue({
          id: 'proj-1',
          status: ProjectStatus.CANCELLED,
        })

        await expect(
          caller.projects.createPilot({
            projectId: 'proj-1',
            deploymentArea: 'Hà Nội',
          })
        ).rejects.toThrow(TRPCError)
        await expect(
          caller.projects.createPilot({
            projectId: 'proj-1',
            deploymentArea: 'Hà Nội',
          })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })

      it('should reject creating pilot for non-existent project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.createPilot({
            projectId: 'non-existent',
            deploymentArea: 'Hà Nội',
          })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should reject creating pilot with non-existent product', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue({
          id: 'proj-1',
          status: ProjectStatus.ACTIVE,
        })
        mockDb.technologyProduct.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.createPilot({
            projectId: 'proj-1',
            deploymentArea: 'Hà Nội',
            productId: 'non-existent-product',
          })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })

      it('should reject empty deploymentArea', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        await expect(
          caller.projects.createPilot({
            projectId: 'proj-1',
            deploymentArea: '',
          })
        ).rejects.toThrow()
      })
    })

    describe('updatePilot', () => {
      it('should update pilot fields', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const existing = {
          id: 'pilot-1',
          projectId: 'proj-1',
          status: 'planning',
          beneficiaryCount: 50,
        }
        const updated = { ...existing, beneficiaryCount: 200 }

        mockDb.pilotDeployment.findUnique.mockResolvedValue(existing)
        mockDb.pilotDeployment.update.mockResolvedValue(updated)
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.updatePilot({
          id: 'pilot-1',
          beneficiaryCount: 200,
        })

        expect(result.beneficiaryCount).toBe(200)
      })

      it('should throw NOT_FOUND for non-existent pilot', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.pilotDeployment.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.updatePilot({ id: 'non-existent', beneficiaryCount: 100 })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should reject update with non-existent product', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.pilotDeployment.findUnique.mockResolvedValue({
          id: 'pilot-1',
          status: 'planning',
        })
        mockDb.technologyProduct.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.updatePilot({ id: 'pilot-1', productId: 'bad-product' })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })
    })

    describe('updatePilotStatus', () => {
      it('should allow valid transition planning → deploying', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const existing = {
          id: 'pilot-1',
          status: 'planning',
          project: { id: 'proj-1', status: ProjectStatus.ACTIVE },
        }
        const updated = { ...existing, status: 'deploying' }

        mockDb.pilotDeployment.findUnique.mockResolvedValue(existing)
        mockDb.pilotDeployment.update.mockResolvedValue(updated)
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.updatePilotStatus({
          id: 'pilot-1',
          status: 'deploying',
        })

        expect(result.status).toBe('deploying')
      })

      it('should allow valid transition deploying → active', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const existing = {
          id: 'pilot-1',
          status: 'deploying',
          project: { id: 'proj-1', status: ProjectStatus.ACTIVE },
        }
        const updated = { ...existing, status: 'active' }

        mockDb.pilotDeployment.findUnique.mockResolvedValue(existing)
        mockDb.pilotDeployment.update.mockResolvedValue(updated)
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.updatePilotStatus({
          id: 'pilot-1',
          status: 'active',
        })

        expect(result.status).toBe('active')
      })

      it('should allow valid transition active → completed', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const existing = {
          id: 'pilot-1',
          status: 'active',
          project: { id: 'proj-1', status: ProjectStatus.ACTIVE },
        }
        const updated = { ...existing, status: 'completed' }

        mockDb.pilotDeployment.findUnique.mockResolvedValue(existing)
        mockDb.pilotDeployment.update.mockResolvedValue(updated)
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.updatePilotStatus({
          id: 'pilot-1',
          status: 'completed',
        })

        expect(result.status).toBe('completed')
      })

      it('should reject invalid transition planning → active (skip deploying)', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.pilotDeployment.findUnique.mockResolvedValue({
          id: 'pilot-1',
          status: 'planning',
          project: { id: 'proj-1', status: ProjectStatus.ACTIVE },
        })

        await expect(
          caller.projects.updatePilotStatus({ id: 'pilot-1', status: 'active' })
        ).rejects.toThrow(TRPCError)
        await expect(
          caller.projects.updatePilotStatus({ id: 'pilot-1', status: 'active' })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })

      it('should reject transition from completed (terminal state)', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.pilotDeployment.findUnique.mockResolvedValue({
          id: 'pilot-1',
          status: 'completed',
          project: { id: 'proj-1', status: ProjectStatus.ACTIVE },
        })

        await expect(
          caller.projects.updatePilotStatus({ id: 'pilot-1', status: 'active' })
        ).rejects.toThrow(TRPCError)
        await expect(
          caller.projects.updatePilotStatus({ id: 'pilot-1', status: 'active' })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })

      it('should reject transition from cancelled (terminal state)', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.pilotDeployment.findUnique.mockResolvedValue({
          id: 'pilot-1',
          status: 'cancelled',
          project: { id: 'proj-1', status: ProjectStatus.ACTIVE },
        })

        await expect(
          caller.projects.updatePilotStatus({ id: 'pilot-1', status: 'planning' })
        ).rejects.toThrow(TRPCError)
      })

      it('should throw NOT_FOUND for non-existent pilot', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.pilotDeployment.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.updatePilotStatus({ id: 'non-existent', status: 'deploying' })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
    })

    describe('deletePilot', () => {
      it('should delete an existing pilot', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.pilotDeployment.findUnique.mockResolvedValue({
          id: 'pilot-1',
          projectId: 'proj-1',
          deploymentArea: 'Hà Nội',
        })
        mockDb.pilotDeployment.delete.mockResolvedValue({})
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.deletePilot({ id: 'pilot-1' })

        expect(result.success).toBe(true)
        expect(mockDb.pilotDeployment.delete).toHaveBeenCalledWith({ where: { id: 'pilot-1' } })
      })

      it('should throw NOT_FOUND for non-existent pilot', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.pilotDeployment.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.deletePilot({ id: 'non-existent' })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
    })
  })

  // ─── Milestone Tracking ─────────────────────────────────────────────────────

  describe('Milestone Tracking', () => {
    describe('createMilestone', () => {
      it('should create a milestone for an existing project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue({
          id: 'proj-1',
          status: ProjectStatus.ACTIVE,
        })

        const mockMilestone = {
          id: 'ms-1',
          title: 'Hoàn thành thiết kế',
          description: null,
          dueDate: new Date('2025-06-30'),
          assignedTo: null,
          priority: Priority.HIGH,
          projectId: 'proj-1',
          isMilestone: true,
          createdBy: 'pm-1',
          status: TaskStatus.OPEN,
        }

        mockDb.task.create.mockResolvedValue(mockMilestone)
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.createMilestone({
          projectId: 'proj-1',
          title: 'Hoàn thành thiết kế',
          dueDate: new Date('2025-06-30'),
          priority: Priority.HIGH,
        })

        expect(result.id).toBe('ms-1')
        expect(result.title).toBe('Hoàn thành thiết kế')
        expect(result.isMilestone).toBe(true)
        expect(result.status).toBe(TaskStatus.OPEN)
      })

      it('should reject creating milestone for CANCELLED project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue({
          id: 'proj-1',
          status: ProjectStatus.CANCELLED,
        })

        await expect(
          caller.projects.createMilestone({
            projectId: 'proj-1',
            title: 'Test Milestone',
          })
        ).rejects.toThrow(TRPCError)
        await expect(
          caller.projects.createMilestone({
            projectId: 'proj-1',
            title: 'Test Milestone',
          })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })

      it('should reject creating milestone for non-existent project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.createMilestone({
            projectId: 'non-existent',
            title: 'Test',
          })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should reject empty milestone title', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        await expect(
          caller.projects.createMilestone({
            projectId: 'proj-1',
            title: '',
          })
        ).rejects.toThrow()
      })
    })

    describe('updateMilestone', () => {
      it('should update milestone fields', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const existing = {
          id: 'ms-1',
          title: 'Old Title',
          status: TaskStatus.OPEN,
          dueDate: new Date('2025-06-30'),
          isMilestone: true,
          projectId: 'proj-1',
        }
        const updated = { ...existing, title: 'New Title', status: TaskStatus.IN_PROGRESS }

        mockDb.task.findUnique.mockResolvedValue(existing)
        mockDb.task.update.mockResolvedValue(updated)
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.updateMilestone({
          id: 'ms-1',
          title: 'New Title',
          status: TaskStatus.IN_PROGRESS,
        })

        expect(result.title).toBe('New Title')
        expect(result.status).toBe(TaskStatus.IN_PROGRESS)
      })

      it('should throw NOT_FOUND for non-existent milestone', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.task.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.updateMilestone({ id: 'non-existent', title: 'Test' })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should reject updating a non-milestone task', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.task.findUnique.mockResolvedValue({
          id: 'task-1',
          title: 'Regular Task',
          isMilestone: false,
          status: TaskStatus.OPEN,
        })

        await expect(
          caller.projects.updateMilestone({ id: 'task-1', title: 'Updated' })
        ).rejects.toThrow(TRPCError)
        await expect(
          caller.projects.updateMilestone({ id: 'task-1', title: 'Updated' })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })
    })

    describe('deleteMilestone', () => {
      it('should delete an existing milestone', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.task.findUnique.mockResolvedValue({
          id: 'ms-1',
          title: 'Milestone to delete',
          isMilestone: true,
          projectId: 'proj-1',
        })
        mockDb.task.delete.mockResolvedValue({})
        mockDb.auditLog.create.mockResolvedValue({})

        const result = await caller.projects.deleteMilestone({ id: 'ms-1' })

        expect(result.success).toBe(true)
        expect(mockDb.task.delete).toHaveBeenCalledWith({ where: { id: 'ms-1' } })
      })

      it('should throw NOT_FOUND for non-existent milestone', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.task.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.deleteMilestone({ id: 'non-existent' })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })

      it('should reject deleting a non-milestone task', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.task.findUnique.mockResolvedValue({
          id: 'task-1',
          title: 'Regular Task',
          isMilestone: false,
        })

        await expect(
          caller.projects.deleteMilestone({ id: 'task-1' })
        ).rejects.toThrow(TRPCError)
        await expect(
          caller.projects.deleteMilestone({ id: 'task-1' })
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      })
    })

    describe('getMilestoneProgress', () => {
      it('should return progress for project milestones', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue({ id: 'proj-1', status: ProjectStatus.ACTIVE })
        mockDb.task.findMany.mockResolvedValue([
          { id: 'ms-1', status: TaskStatus.DONE, dueDate: new Date('2025-01-01') },
          { id: 'ms-2', status: TaskStatus.DONE, dueDate: new Date('2025-02-01') },
          { id: 'ms-3', status: TaskStatus.OPEN, dueDate: new Date('2030-12-01') }, // future — not overdue
          { id: 'ms-4', status: TaskStatus.IN_PROGRESS, dueDate: new Date('2024-01-01') }, // overdue
        ])

        const result = await caller.projects.getMilestoneProgress({ projectId: 'proj-1' })

        expect(result.total).toBe(4)
        expect(result.completed).toBe(2)
        expect(result.overdue).toBe(1)
        expect(result.percentage).toBe(50)
      })

      it('should return zero progress for project with no milestones', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue({ id: 'proj-1', status: ProjectStatus.ACTIVE })
        mockDb.task.findMany.mockResolvedValue([])

        const result = await caller.projects.getMilestoneProgress({ projectId: 'proj-1' })

        expect(result.total).toBe(0)
        expect(result.completed).toBe(0)
        expect(result.overdue).toBe(0)
        expect(result.percentage).toBe(0)
      })

      it('should throw NOT_FOUND for non-existent project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        mockDb.project.findUnique.mockResolvedValue(null)

        await expect(
          caller.projects.getMilestoneProgress({ projectId: 'non-existent' })
        ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      })
    })

    describe('listMilestones', () => {
      it('should list milestones for a project', async () => {
        const ctx = createAuthenticatedContext(mockDb, 'pm-1', ['Project_Manager'])
        const caller = createCaller(ctx)

        const mockMilestones = [
          { id: 'ms-1', title: 'Phase 1', status: TaskStatus.DONE, dueDate: new Date('2025-03-01'), isMilestone: true },
          { id: 'ms-2', title: 'Phase 2', status: TaskStatus.OPEN, dueDate: new Date('2025-06-01'), isMilestone: true },
        ]

        mockDb.task.findMany.mockResolvedValue(mockMilestones)

        const result = await caller.projects.listMilestones({ projectId: 'proj-1' })

        expect(result).toHaveLength(2)
        expect(result[0]!.title).toBe('Phase 1')
        expect(result[1]!.title).toBe('Phase 2')
      })
    })
  })
})
