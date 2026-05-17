import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  checkDocumentOverdue,
  checkFeeOverdue,
  checkContractExpiring,
  checkKPIOffTrack,
  runAllAlertChecks,
} from './alert-rules'

// ─── Mock Prisma Client ───────────────────────────────────────────────────────

function createMockDb() {
  return {
    documentItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    membershipFee: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    agreementRecord: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    kPIMetric: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notification: {
      create: vi.fn().mockResolvedValue({ id: 'notif-1' }),
      findFirst: vi.fn().mockResolvedValue(null), // no existing notification
    },
    role: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Alert Rules Service', () => {
  let db: ReturnType<typeof createMockDb>

  beforeEach(() => {
    db = createMockDb()
    vi.clearAllMocks()
  })


  describe('checkDocumentOverdue', () => {
    it('should return 0 alerts when no overdue documents', async () => {
      db.documentItem.findMany.mockResolvedValue([])

      const result = await checkDocumentOverdue(db)

      expect(result.type).toBe('DOCUMENT_OVERDUE')
      expect(result.itemsFound).toBe(0)
      expect(result.alertsCreated).toBe(0)
    })

    it('should create notification for overdue document owner', async () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      db.documentItem.findMany.mockResolvedValue([
        {
          id: 'doc-1',
          code: 'DOC-001',
          name: 'Điều lệ Viện',
          ownerId: 'user-owner-1',
          deadline: pastDate,
        },
      ])

      const result = await checkDocumentOverdue(db)

      expect(result.itemsFound).toBe(1)
      expect(result.alertsCreated).toBe(1)
      expect(db.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-owner-1',
          type: 'DOCUMENT_OVERDUE',
          title: 'Tài liệu quá hạn',
          link: '/documents/doc-1',
        }),
      })
      // Verify Vietnamese message content
      const callArgs = db.notification.create.mock.calls[0][0]
      expect(callArgs.data.message).toContain('Điều lệ Viện')
      expect(callArgs.data.message).toContain('DOC-001')
      expect(callArgs.data.message).toContain('5 ngày')
    })

    it('should skip notification if already notified today (idempotent)', async () => {
      const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      db.documentItem.findMany.mockResolvedValue([
        { id: 'doc-1', code: 'DOC-001', name: 'Test', ownerId: 'user-1', deadline: pastDate },
      ])
      // Already notified today
      db.notification.findFirst.mockResolvedValue({ id: 'existing-notif' })

      const result = await checkDocumentOverdue(db)

      expect(result.itemsFound).toBe(1)
      expect(result.alertsCreated).toBe(0)
      expect(db.notification.create).not.toHaveBeenCalled()
    })

    it('should handle multiple overdue documents', async () => {
      const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      db.documentItem.findMany.mockResolvedValue([
        { id: 'doc-1', code: 'DOC-001', name: 'Doc 1', ownerId: 'user-1', deadline: pastDate },
        { id: 'doc-2', code: 'DOC-002', name: 'Doc 2', ownerId: 'user-2', deadline: pastDate },
      ])

      const result = await checkDocumentOverdue(db)

      expect(result.itemsFound).toBe(2)
      expect(result.alertsCreated).toBe(2)
      expect(db.notification.create).toHaveBeenCalledTimes(2)
    })
  })


  describe('checkFeeOverdue', () => {
    it('should return 0 alerts when no overdue fees', async () => {
      db.membershipFee.findMany.mockResolvedValue([])

      const result = await checkFeeOverdue(db)

      expect(result.type).toBe('FEE_OVERDUE')
      expect(result.itemsFound).toBe(0)
      expect(result.alertsCreated).toBe(0)
    })

    it('should create notifications for Finance_Officer when fees overdue', async () => {
      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      db.membershipFee.findMany.mockResolvedValue([
        {
          id: 'fee-1',
          enterpriseId: 'ent-1',
          year: 2024,
          amountDue: 50000000,
          amountPaid: 0,
          dueDate: pastDate,
          paymentStatus: 'INVOICED',
          enterprise: { id: 'ent-1', legalNameVi: 'Công ty ABC' },
        },
      ])
      db.role.findUnique.mockResolvedValue({ id: 'role-finance', name: 'Finance_Officer' })
      db.userRole.findMany.mockResolvedValue([
        { userId: 'finance-user-1' },
        { userId: 'finance-user-2' },
      ])

      const result = await checkFeeOverdue(db)

      expect(result.itemsFound).toBe(1)
      expect(result.alertsCreated).toBe(2) // 2 finance officers
      expect(db.notification.create).toHaveBeenCalledTimes(2)

      const firstCall = db.notification.create.mock.calls[0][0]
      expect(firstCall.data.userId).toBe('finance-user-1')
      expect(firstCall.data.type).toBe('FEE_OVERDUE')
      expect(firstCall.data.message).toContain('Công ty ABC')
      expect(firstCall.data.message).toContain('2024')
    })

    it('should skip fees where amountPaid >= amountDue', async () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      db.membershipFee.findMany.mockResolvedValue([
        {
          id: 'fee-1',
          enterpriseId: 'ent-1',
          year: 2024,
          amountDue: 50000000,
          amountPaid: 50000000, // fully paid but status not updated
          dueDate: pastDate,
          paymentStatus: 'INVOICED',
          enterprise: { id: 'ent-1', legalNameVi: 'Công ty XYZ' },
        },
      ])

      const result = await checkFeeOverdue(db)

      expect(result.itemsFound).toBe(0)
      expect(result.alertsCreated).toBe(0)
    })

    it('should return 0 alerts when Finance_Officer role not found', async () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      db.membershipFee.findMany.mockResolvedValue([
        {
          id: 'fee-1',
          enterpriseId: 'ent-1',
          year: 2024,
          amountDue: 50000000,
          amountPaid: 0,
          dueDate: pastDate,
          paymentStatus: 'INVOICED',
          enterprise: { id: 'ent-1', legalNameVi: 'Công ty ABC' },
        },
      ])
      db.role.findUnique.mockResolvedValue(null)

      const result = await checkFeeOverdue(db)

      expect(result.itemsFound).toBe(1)
      expect(result.alertsCreated).toBe(0)
    })

    it('should be idempotent — skip if already notified today', async () => {
      const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      db.membershipFee.findMany.mockResolvedValue([
        {
          id: 'fee-1',
          enterpriseId: 'ent-1',
          year: 2024,
          amountDue: 50000000,
          amountPaid: 0,
          dueDate: pastDate,
          paymentStatus: 'INVOICED',
          enterprise: { id: 'ent-1', legalNameVi: 'Công ty ABC' },
        },
      ])
      db.role.findUnique.mockResolvedValue({ id: 'role-finance', name: 'Finance_Officer' })
      db.userRole.findMany.mockResolvedValue([{ userId: 'finance-user-1' }])
      db.notification.findFirst.mockResolvedValue({ id: 'existing' })

      const result = await checkFeeOverdue(db)

      expect(result.alertsCreated).toBe(0)
      expect(db.notification.create).not.toHaveBeenCalled()
    })
  })


  describe('checkContractExpiring', () => {
    it('should return 0 alerts when no expiring contracts', async () => {
      db.agreementRecord.findMany.mockResolvedValue([])

      const result = await checkContractExpiring(db)

      expect(result.type).toBe('CONTRACT_EXPIRING')
      expect(result.itemsFound).toBe(0)
      expect(result.alertsCreated).toBe(0)
    })

    it('should create notifications for Legal_Officer when contracts expiring within 30 days', async () => {
      const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days from now
      db.agreementRecord.findMany.mockResolvedValue([
        {
          id: 'agr-1',
          title: 'Hợp đồng triển khai AI',
          type: 'TECH_DEPLOYMENT',
          partyB: 'Công ty Tech ABC',
          expiryDate: futureDate,
        },
      ])
      db.role.findUnique.mockResolvedValue({ id: 'role-legal', name: 'Legal_Officer' })
      db.userRole.findMany.mockResolvedValue([{ userId: 'legal-user-1' }])

      const result = await checkContractExpiring(db)

      expect(result.itemsFound).toBe(1)
      expect(result.alertsCreated).toBe(1)

      const callArgs = db.notification.create.mock.calls[0][0]
      expect(callArgs.data.userId).toBe('legal-user-1')
      expect(callArgs.data.type).toBe('CONTRACT_EXPIRING')
      expect(callArgs.data.title).toBe('Hợp đồng sắp hết hạn')
      expect(callArgs.data.message).toContain('Hợp đồng triển khai AI')
      expect(callArgs.data.message).toContain('Công ty Tech ABC')
      expect(callArgs.data.link).toBe('/agreements/agr-1')
    })

    it('should use custom daysBeforeExpiry parameter', async () => {
      const futureDate = new Date(Date.now() + 50 * 24 * 60 * 60 * 1000) // 50 days from now
      db.agreementRecord.findMany.mockResolvedValue([
        {
          id: 'agr-2',
          title: 'NDA',
          type: 'NDA',
          partyB: 'Partner X',
          expiryDate: futureDate,
        },
      ])
      db.role.findUnique.mockResolvedValue({ id: 'role-legal', name: 'Legal_Officer' })
      db.userRole.findMany.mockResolvedValue([{ userId: 'legal-user-1' }])

      const result = await checkContractExpiring(db, 60) // 60 days threshold

      expect(result.itemsFound).toBe(1)
      expect(result.alertsCreated).toBe(1)
    })

    it('should return 0 alerts when Legal_Officer role not found', async () => {
      const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      db.agreementRecord.findMany.mockResolvedValue([
        { id: 'agr-1', title: 'Test', type: 'MOU', partyB: 'X', expiryDate: futureDate },
      ])
      db.role.findUnique.mockResolvedValue(null)

      const result = await checkContractExpiring(db)

      expect(result.itemsFound).toBe(1)
      expect(result.alertsCreated).toBe(0)
    })

    it('should be idempotent — skip if already notified today', async () => {
      const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      db.agreementRecord.findMany.mockResolvedValue([
        { id: 'agr-1', title: 'Test', type: 'MOU', partyB: 'X', expiryDate: futureDate },
      ])
      db.role.findUnique.mockResolvedValue({ id: 'role-legal', name: 'Legal_Officer' })
      db.userRole.findMany.mockResolvedValue([{ userId: 'legal-user-1' }])
      db.notification.findFirst.mockResolvedValue({ id: 'existing' })

      const result = await checkContractExpiring(db)

      expect(result.alertsCreated).toBe(0)
      expect(db.notification.create).not.toHaveBeenCalled()
    })
  })


  describe('checkKPIOffTrack', () => {
    it('should return 0 alerts when no KPIs off-track', async () => {
      db.kPIMetric.findMany.mockResolvedValue([])

      const result = await checkKPIOffTrack(db)

      expect(result.type).toBe('KPI_OFF_TRACK')
      expect(result.itemsFound).toBe(0)
      expect(result.alertsCreated).toBe(0)
    })

    it('should create notification for project owner when KPI off-track', async () => {
      db.kPIMetric.findMany.mockResolvedValue([
        {
          id: 'kpi-1',
          name: 'Số người dùng',
          targetValue: 1000,
          currentValue: 500, // 50% achievement — off-track
          direction: 'increase_is_good',
          project: { id: 'proj-1', name: 'Dự án AI', ownerId: 'pm-user-1' },
        },
      ])

      const result = await checkKPIOffTrack(db)

      expect(result.itemsFound).toBe(1)
      expect(result.alertsCreated).toBe(1)

      const callArgs = db.notification.create.mock.calls[0][0]
      expect(callArgs.data.userId).toBe('pm-user-1')
      expect(callArgs.data.type).toBe('KPI_OFF_TRACK')
      expect(callArgs.data.title).toBe('KPI chưa đạt mục tiêu')
      expect(callArgs.data.message).toContain('Số người dùng')
      expect(callArgs.data.message).toContain('Dự án AI')
      expect(callArgs.data.message).toContain('50.0%')
      expect(callArgs.data.link).toBe('/projects/proj-1/kpis')
    })

    it('should not alert for KPIs at or above 70% threshold', async () => {
      db.kPIMetric.findMany.mockResolvedValue([
        {
          id: 'kpi-1',
          name: 'Doanh thu',
          targetValue: 100,
          currentValue: 75, // 75% — at risk but not off-track
          direction: 'increase_is_good',
          project: { id: 'proj-1', name: 'Dự án X', ownerId: 'pm-1' },
        },
      ])

      const result = await checkKPIOffTrack(db)

      expect(result.itemsFound).toBe(0)
      expect(result.alertsCreated).toBe(0)
    })

    it('should handle decrease_is_good direction', async () => {
      db.kPIMetric.findMany.mockResolvedValue([
        {
          id: 'kpi-2',
          name: 'Tỷ lệ lỗi',
          targetValue: 5, // target: 5% error rate
          currentValue: 20, // actual: 20% error rate — off-track
          direction: 'decrease_is_good',
          project: { id: 'proj-2', name: 'Dự án QA', ownerId: 'pm-2' },
        },
      ])

      const result = await checkKPIOffTrack(db)

      // achievement = target/actual * 100 = 5/20 * 100 = 25% — off-track
      expect(result.itemsFound).toBe(1)
      expect(result.alertsCreated).toBe(1)
    })

    it('should be idempotent — skip if already notified today', async () => {
      db.kPIMetric.findMany.mockResolvedValue([
        {
          id: 'kpi-1',
          name: 'Test KPI',
          targetValue: 100,
          currentValue: 30,
          direction: 'increase_is_good',
          project: { id: 'proj-1', name: 'Test', ownerId: 'pm-1' },
        },
      ])
      db.notification.findFirst.mockResolvedValue({ id: 'existing' })

      const result = await checkKPIOffTrack(db)

      expect(result.itemsFound).toBe(1)
      expect(result.alertsCreated).toBe(0)
      expect(db.notification.create).not.toHaveBeenCalled()
    })
  })


  describe('runAllAlertChecks', () => {
    it('should run all checks and return summary', async () => {
      const result = await runAllAlertChecks(db)

      expect(result.documentOverdue).toBeDefined()
      expect(result.feeOverdue).toBeDefined()
      expect(result.contractExpiring).toBeDefined()
      expect(result.kpiOffTrack).toBeDefined()
      expect(result.totalAlertsCreated).toBe(0)
      expect(result.checkedAt).toBeInstanceOf(Date)
    })

    it('should sum up all alerts created', async () => {
      // Setup: 1 overdue document
      const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      db.documentItem.findMany.mockResolvedValue([
        { id: 'doc-1', code: 'D-1', name: 'Doc', ownerId: 'u-1', deadline: pastDate },
      ])

      // Setup: 1 off-track KPI
      db.kPIMetric.findMany.mockResolvedValue([
        {
          id: 'kpi-1',
          name: 'KPI',
          targetValue: 100,
          currentValue: 30,
          direction: 'increase_is_good',
          project: { id: 'p-1', name: 'Proj', ownerId: 'u-2' },
        },
      ])

      const result = await runAllAlertChecks(db)

      expect(result.totalAlertsCreated).toBe(2) // 1 doc + 1 kpi
      expect(result.documentOverdue.alertsCreated).toBe(1)
      expect(result.kpiOffTrack.alertsCreated).toBe(1)
      expect(result.feeOverdue.alertsCreated).toBe(0)
      expect(result.contractExpiring.alertsCreated).toBe(0)
    })
  })
})
