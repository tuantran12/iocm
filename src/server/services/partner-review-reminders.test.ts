import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkPartnerReviews, REVIEW_FREQUENCY_MONTHS } from './partner-review-reminders'

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {
    technologyPartner: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    notification: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

type MockDb = ReturnType<typeof createMockDb>

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function makePartner(overrides: Record<string, unknown> = {}) {
  return {
    id: 'partner-1',
    companyName: 'Công ty ABC',
    riskRating: 'R3',
    relationshipStatus: 'active',
    dueDiligences: [],
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('partner-review-reminders service', () => {
  let mockDb: MockDb

  beforeEach(() => {
    mockDb = createMockDb()
    vi.clearAllMocks()
  })

  describe('REVIEW_FREQUENCY_MONTHS', () => {
    it('should define correct review frequencies per risk rating', () => {
      expect(REVIEW_FREQUENCY_MONTHS.R1).toBe(24)
      expect(REVIEW_FREQUENCY_MONTHS.R2).toBe(12)
      expect(REVIEW_FREQUENCY_MONTHS.R3).toBe(6)
      expect(REVIEW_FREQUENCY_MONTHS.R4).toBe(3)
      expect(REVIEW_FREQUENCY_MONTHS.R5).toBe(1)
    })
  })

  describe('checkPartnerReviews', () => {
    it('should return empty alerts when no partners have risk ratings', async () => {
      mockDb.technologyPartner.findMany.mockResolvedValue([])

      const result = await checkPartnerReviews(mockDb as any)

      expect(result.alerts).toHaveLength(0)
      expect(result.notificationsCreated).toBe(0)
    })

    it('should return empty alerts when partners have no due diligences', async () => {
      mockDb.technologyPartner.findMany.mockResolvedValue([
        makePartner({ dueDiligences: [] }),
      ])

      const result = await checkPartnerReviews(mockDb as any)

      expect(result.alerts).toHaveLength(0)
      expect(result.notificationsCreated).toBe(0)
    })

    it('should return empty alerts when nextReview is null', async () => {
      mockDb.technologyPartner.findMany.mockResolvedValue([
        makePartner({
          dueDiligences: [{ nextReview: null, reviewDate: new Date() }],
        }),
      ])

      const result = await checkPartnerReviews(mockDb as any)

      expect(result.alerts).toHaveLength(0)
      expect(result.notificationsCreated).toBe(0)
    })

    it('should detect overdue partner reviews', async () => {
      const overduePartner = makePartner({
        id: 'partner-overdue',
        companyName: 'Công ty Quá Hạn',
        riskRating: 'R4',
        dueDiligences: [{ nextReview: daysAgo(10), reviewDate: daysAgo(100) }],
      })

      mockDb.technologyPartner.findMany.mockResolvedValue([overduePartner])

      const result = await checkPartnerReviews(mockDb as any)

      expect(result.alerts).toHaveLength(1)
      expect(result.alerts[0]!.alertType).toBe('OVERDUE')
      expect(result.alerts[0]!.partnerId).toBe('partner-overdue')
      expect(result.alerts[0]!.companyName).toBe('Công ty Quá Hạn')
      expect(result.alerts[0]!.riskRating).toBe('R4')
      expect(result.alerts[0]!.daysOverdue).toBeGreaterThanOrEqual(10)
    })

    it('should detect approaching partner reviews within warning days', async () => {
      const approachingPartner = makePartner({
        id: 'partner-approaching',
        companyName: 'Công ty Sắp Hạn',
        riskRating: 'R3',
        dueDiligences: [{ nextReview: daysFromNow(15), reviewDate: daysAgo(170) }],
      })

      mockDb.technologyPartner.findMany.mockResolvedValue([approachingPartner])

      const result = await checkPartnerReviews(mockDb as any)

      expect(result.alerts).toHaveLength(1)
      expect(result.alerts[0]!.alertType).toBe('APPROACHING')
      expect(result.alerts[0]!.partnerId).toBe('partner-approaching')
      expect(result.alerts[0]!.daysUntilDue).toBeLessThanOrEqual(15)
    })

    it('should not alert for partners with nextReview far in the future', async () => {
      const safePartner = makePartner({
        id: 'partner-safe',
        riskRating: 'R1',
        dueDiligences: [{ nextReview: daysFromNow(365), reviewDate: daysAgo(30) }],
      })

      mockDb.technologyPartner.findMany.mockResolvedValue([safePartner])

      const result = await checkPartnerReviews(mockDb as any)

      expect(result.alerts).toHaveLength(0)
    })

    it('should respect custom warningDays parameter', async () => {
      const partner = makePartner({
        id: 'partner-custom',
        riskRating: 'R2',
        dueDiligences: [{ nextReview: daysFromNow(50), reviewDate: daysAgo(300) }],
      })

      mockDb.technologyPartner.findMany.mockResolvedValue([partner])

      // Default 30 days → no alert
      const result30 = await checkPartnerReviews(mockDb as any, 30)
      expect(result30.alerts).toHaveLength(0)

      // Custom 60 days → alert
      const result60 = await checkPartnerReviews(mockDb as any, 60)
      expect(result60.alerts).toHaveLength(1)
      expect(result60.alerts[0]!.alertType).toBe('APPROACHING')
    })

    it('should create notifications for Partnership_Manager users', async () => {
      const overduePartner = makePartner({
        id: 'partner-overdue',
        companyName: 'Công ty XYZ',
        riskRating: 'R5',
        dueDiligences: [{ nextReview: daysAgo(5), reviewDate: daysAgo(35) }],
      })

      mockDb.technologyPartner.findMany.mockResolvedValue([overduePartner])
      mockDb.userRole.findMany.mockResolvedValue([
        { userId: 'manager-1' },
        { userId: 'manager-2' },
      ])

      const result = await checkPartnerReviews(mockDb as any)

      // 1 alert × 2 managers = 2 notifications
      expect(result.notificationsCreated).toBe(2)
      expect(mockDb.notification.create).toHaveBeenCalledTimes(2)

      const firstCall = mockDb.notification.create.mock.calls[0]![0]
      expect(firstCall.data.type).toBe('PARTNER_REVIEW_OVERDUE')
      expect(firstCall.data.title).toContain('quá hạn review')
      expect(firstCall.data.message).toContain('Công ty XYZ')
      expect(firstCall.data.link).toBe('/partners/partner-overdue')
    })

    it('should not create notifications when no Partnership_Manager exists', async () => {
      const overduePartner = makePartner({
        id: 'partner-overdue',
        riskRating: 'R3',
        dueDiligences: [{ nextReview: daysAgo(5), reviewDate: daysAgo(185) }],
      })

      mockDb.technologyPartner.findMany.mockResolvedValue([overduePartner])
      mockDb.userRole.findMany.mockResolvedValue([])

      const result = await checkPartnerReviews(mockDb as any)

      expect(result.alerts).toHaveLength(1)
      expect(result.notificationsCreated).toBe(0)
      expect(mockDb.notification.create).not.toHaveBeenCalled()
    })

    it('should handle multiple partners with different alert types', async () => {
      const overdue = makePartner({
        id: 'p1',
        companyName: 'Overdue Corp',
        riskRating: 'R5',
        dueDiligences: [{ nextReview: daysAgo(15), reviewDate: daysAgo(45) }],
      })
      const approaching = makePartner({
        id: 'p2',
        companyName: 'Approaching Corp',
        riskRating: 'R3',
        dueDiligences: [{ nextReview: daysFromNow(10), reviewDate: daysAgo(170) }],
      })
      const safe = makePartner({
        id: 'p3',
        companyName: 'Safe Corp',
        riskRating: 'R1',
        dueDiligences: [{ nextReview: daysFromNow(200), reviewDate: daysAgo(500) }],
      })

      mockDb.technologyPartner.findMany.mockResolvedValue([overdue, approaching, safe])
      mockDb.userRole.findMany.mockResolvedValue([{ userId: 'manager-1' }])

      const result = await checkPartnerReviews(mockDb as any)

      expect(result.alerts).toHaveLength(2)
      expect(result.alerts[0]!.alertType).toBe('OVERDUE')
      expect(result.alerts[1]!.alertType).toBe('APPROACHING')
      // 2 alerts × 1 manager = 2 notifications
      expect(result.notificationsCreated).toBe(2)
    })

    it('should deduplicate manager user IDs', async () => {
      const overduePartner = makePartner({
        id: 'partner-1',
        riskRating: 'R4',
        dueDiligences: [{ nextReview: daysAgo(3), reviewDate: daysAgo(93) }],
      })

      mockDb.technologyPartner.findMany.mockResolvedValue([overduePartner])
      // Same user with multiple role assignments
      mockDb.userRole.findMany.mockResolvedValue([
        { userId: 'manager-1' },
        { userId: 'manager-1' },
      ])

      const result = await checkPartnerReviews(mockDb as any)

      // Deduplicated: only 1 notification per alert
      expect(result.notificationsCreated).toBe(1)
      expect(mockDb.notification.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('notification content (Vietnamese)', () => {
    it('should generate Vietnamese notification for OVERDUE alert', async () => {
      const partner = makePartner({
        id: 'p-overdue',
        companyName: 'Công ty Trễ Hạn',
        riskRating: 'R4',
        dueDiligences: [{ nextReview: daysAgo(7), reviewDate: daysAgo(97) }],
      })

      mockDb.technologyPartner.findMany.mockResolvedValue([partner])
      mockDb.userRole.findMany.mockResolvedValue([{ userId: 'user-1' }])

      await checkPartnerReviews(mockDb as any)

      const notifData = mockDb.notification.create.mock.calls[0]![0].data
      expect(notifData.title).toBe('Đối tác quá hạn review')
      expect(notifData.message).toContain('Công ty Trễ Hạn')
      expect(notifData.message).toContain('R4')
      expect(notifData.message).toContain('ngày')
      expect(notifData.link).toBe('/partners/p-overdue')
    })

    it('should generate Vietnamese notification for APPROACHING alert', async () => {
      const partner = makePartner({
        id: 'p-approaching',
        companyName: 'Công ty Sắp Đến Hạn',
        riskRating: 'R2',
        dueDiligences: [{ nextReview: daysFromNow(20), reviewDate: daysAgo(345) }],
      })

      mockDb.technologyPartner.findMany.mockResolvedValue([partner])
      mockDb.userRole.findMany.mockResolvedValue([{ userId: 'user-1' }])

      await checkPartnerReviews(mockDb as any)

      const notifData = mockDb.notification.create.mock.calls[0]![0].data
      expect(notifData.title).toBe('Đối tác sắp đến hạn review')
      expect(notifData.message).toContain('Công ty Sắp Đến Hạn')
      expect(notifData.message).toContain('R2')
      expect(notifData.message).toContain('ngày')
      expect(notifData.link).toBe('/partners/p-approaching')
    })
  })
})
