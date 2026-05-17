import { describe, it, expect, vi } from 'vitest'
import type { ConsentRecord } from '@prisma/client'
import {
  getAffectedEntities,
  buildWithdrawalAlerts,
  createWithdrawalAlerts,
} from './consent-withdrawal'

// ─── Test Data ────────────────────────────────────────────────────────────────

function makeConsentRecord(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    id: 'consent-1',
    subjectId: 'subject-001',
    projectId: null,
    datasetId: null,
    purpose: 'Thu thập dữ liệu sức khỏe',
    dataTypes: ['health', 'personal'],
    thirdParty: null,
    consentMethod: 'written',
    consentDate: new Date('2024-01-15'),
    expiryDate: null,
    withdrawalDate: new Date('2024-06-01'),
    status: 'WITHDRAWN',
    documentUrl: null,
    ...overrides,
  }
}

// ─── getAffectedEntities ──────────────────────────────────────────────────────

describe('getAffectedEntities', () => {
  it('returns empty array when no project or dataset linked', () => {
    const record = makeConsentRecord()
    const result = getAffectedEntities(record)
    expect(result).toEqual([])
  })

  it('returns project entity when projectId is set', () => {
    const record = makeConsentRecord({ projectId: 'proj-1' })
    const result = getAffectedEntities(record)
    expect(result).toEqual([{ type: 'project', id: 'proj-1' }])
  })

  it('returns dataset entity when datasetId is set', () => {
    const record = makeConsentRecord({ datasetId: 'ds-1' })
    const result = getAffectedEntities(record)
    expect(result).toEqual([{ type: 'dataset', id: 'ds-1' }])
  })

  it('returns both project and dataset when both are set', () => {
    const record = makeConsentRecord({ projectId: 'proj-2', datasetId: 'ds-2' })
    const result = getAffectedEntities(record)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ type: 'project', id: 'proj-2' })
    expect(result).toContainEqual({ type: 'dataset', id: 'ds-2' })
  })
})

// ─── buildWithdrawalAlerts ────────────────────────────────────────────────────

describe('buildWithdrawalAlerts', () => {
  it('creates alerts for DPO users', () => {
    const record = makeConsentRecord()
    const alerts = buildWithdrawalAlerts(record, 'Nguyễn Văn A', ['dpo-1', 'dpo-2'])

    expect(alerts).toHaveLength(2)
    expect(alerts[0]!.userId).toBe('dpo-1')
    expect(alerts[0]!.type).toBe('CONSENT_WITHDRAWN')
    expect(alerts[0]!.title).toBe('Rút lại đồng ý thu thập dữ liệu')
    expect(alerts[0]!.message).toContain('Nguyễn Văn A')
    expect(alerts[0]!.message).toContain('Thu thập dữ liệu sức khỏe')
    expect(alerts[0]!.link).toBe('/data/consent?id=consent-1')
    expect(alerts[1]!.userId).toBe('dpo-2')
  })

  it('returns empty array when no DPO users and no project owner', () => {
    const record = makeConsentRecord()
    const alerts = buildWithdrawalAlerts(record, 'subject-001', [])
    expect(alerts).toEqual([])
  })

  it('includes project owner alert when projectId and projectOwnerId are set', () => {
    const record = makeConsentRecord({ projectId: 'proj-1' })
    const alerts = buildWithdrawalAlerts(record, 'subject-001', ['dpo-1'], 'owner-1')

    expect(alerts).toHaveLength(2)
    // DPO alert
    expect(alerts[0]!.userId).toBe('dpo-1')
    // Project owner alert
    expect(alerts[1]!.userId).toBe('owner-1')
    expect(alerts[1]!.title).toBe('Rút lại đồng ý — Dự án bị ảnh hưởng')
    expect(alerts[1]!.message).toContain('dự án')
    expect(alerts[1]!.message).toContain('subject-001')
  })

  it('does NOT include project owner alert when projectId is null', () => {
    const record = makeConsentRecord({ projectId: null })
    const alerts = buildWithdrawalAlerts(record, 'subject-001', ['dpo-1'], 'owner-1')

    // Only DPO alert, no project owner alert because projectId is null
    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.userId).toBe('dpo-1')
  })

  it('does NOT include project owner alert when projectOwnerId is null', () => {
    const record = makeConsentRecord({ projectId: 'proj-1' })
    const alerts = buildWithdrawalAlerts(record, 'subject-001', ['dpo-1'], null)

    expect(alerts).toHaveLength(1)
    expect(alerts[0]!.userId).toBe('dpo-1')
  })

  it('Vietnamese message format is correct', () => {
    const record = makeConsentRecord({ purpose: 'Nghiên cứu AI' })
    const alerts = buildWithdrawalAlerts(record, 'Trần Thị B', ['dpo-1'])

    expect(alerts[0]!.message).toBe(
      'Đồng ý thu thập dữ liệu đã bị rút lại bởi Trần Thị B. Mục đích: Nghiên cứu AI.'
    )
  })
})


// ─── createWithdrawalAlerts (integration with mock Prisma) ────────────────────

describe('createWithdrawalAlerts', () => {
  function createMockTx(options: {
    dpoRole?: { id: string } | null
    dpoUserRoles?: { userId: string }[]
    project?: { ownerId: string } | null
  } = {}) {
    const { dpoRole = { id: 'role-dpo' }, dpoUserRoles = [], project = null } = options

    const createdNotifications: unknown[] = []
    const createdAuditLogs: unknown[] = []

    const tx = {
      role: {
        findUnique: vi.fn().mockResolvedValue(dpoRole),
      },
      userRole: {
        findMany: vi.fn().mockResolvedValue(dpoUserRoles),
      },
      project: {
        findUnique: vi.fn().mockResolvedValue(project),
      },
      notification: {
        createMany: vi.fn().mockImplementation(async ({ data }) => {
          createdNotifications.push(...data)
          return { count: data.length }
        }),
      },
      auditLog: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          createdAuditLogs.push(data)
          return data
        }),
      },
    }

    return { tx, createdNotifications, createdAuditLogs }
  }

  it('creates notifications for DPO users', async () => {
    const { tx, createdNotifications } = createMockTx({
      dpoRole: { id: 'role-dpo' },
      dpoUserRoles: [{ userId: 'user-dpo-1' }, { userId: 'user-dpo-2' }],
    })

    const record = makeConsentRecord()
    const alerts = await createWithdrawalAlerts(tx as any, record, 'actor-1')

    expect(alerts).toHaveLength(2)
    expect(createdNotifications).toHaveLength(2)
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1)
  })

  it('creates notification for project owner when projectId is set', async () => {
    const { tx, createdNotifications } = createMockTx({
      dpoRole: { id: 'role-dpo' },
      dpoUserRoles: [{ userId: 'user-dpo-1' }],
      project: { ownerId: 'proj-owner-1' },
    })

    const record = makeConsentRecord({ projectId: 'proj-1' })
    const alerts = await createWithdrawalAlerts(tx as any, record, 'actor-1')

    expect(alerts).toHaveLength(2) // 1 DPO + 1 project owner
    expect(createdNotifications).toHaveLength(2)
    expect(createdNotifications[1]).toMatchObject({
      userId: 'proj-owner-1',
      type: 'CONSENT_WITHDRAWN',
    })
  })

  it('does not query project when projectId is null', async () => {
    const { tx } = createMockTx({
      dpoRole: { id: 'role-dpo' },
      dpoUserRoles: [{ userId: 'user-dpo-1' }],
    })

    const record = makeConsentRecord({ projectId: null })
    await createWithdrawalAlerts(tx as any, record, 'actor-1')

    expect(tx.project.findUnique).not.toHaveBeenCalled()
  })

  it('handles case when DPO role does not exist', async () => {
    const { tx, createdNotifications } = createMockTx({
      dpoRole: null,
    })

    const record = makeConsentRecord()
    const alerts = await createWithdrawalAlerts(tx as any, record, 'actor-1')

    expect(alerts).toHaveLength(0)
    expect(tx.notification.createMany).not.toHaveBeenCalled()
  })

  it('logs cascade in audit log', async () => {
    const { tx, createdAuditLogs } = createMockTx({
      dpoRole: { id: 'role-dpo' },
      dpoUserRoles: [{ userId: 'user-dpo-1' }],
    })

    const record = makeConsentRecord({ projectId: 'proj-1', datasetId: 'ds-1' })
    await createWithdrawalAlerts(tx as any, record, 'actor-1')

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
    expect(createdAuditLogs[0]).toMatchObject({
      userId: 'actor-1',
      action: 'CONSENT_WITHDRAWAL_CASCADE',
      targetType: 'ConsentRecord',
      targetId: 'consent-1',
    })

    const afterVal = (createdAuditLogs[0] as any).afterVal
    expect(afterVal.alertsSent).toBe(1) // only DPO, no project owner (project.findUnique returns null)
    expect(afterVal.dpoNotified).toBe(1)
    expect(afterVal.affectedEntities).toHaveLength(2)
  })

  it('does not create notifications when no recipients exist', async () => {
    const { tx } = createMockTx({
      dpoRole: { id: 'role-dpo' },
      dpoUserRoles: [],
    })

    const record = makeConsentRecord()
    const alerts = await createWithdrawalAlerts(tx as any, record, 'actor-1')

    expect(alerts).toHaveLength(0)
    expect(tx.notification.createMany).not.toHaveBeenCalled()
    // Audit log should still be created
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1)
  })
})
