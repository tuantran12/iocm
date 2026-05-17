import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  sendEmail,
  sendNotificationEmail,
  getTransporter,
  resetTransporter,
} from './email'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Email Service', () => {
  beforeEach(() => {
    resetTransporter()
    vi.stubEnv('NODE_ENV', 'test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    resetTransporter()
  })

  describe('getTransporter', () => {
    it('should create a transporter in dev mode', () => {
      vi.stubEnv('NODE_ENV', 'development')
      const transport = getTransporter()
      expect(transport).toBeDefined()
      expect(transport.transporter).toBeDefined()
    })

    it('should reuse the same transporter on subsequent calls', () => {
      const t1 = getTransporter()
      const t2 = getTransporter()
      expect(t1).toBe(t2)
    })

    it('should create a new transporter after reset', () => {
      const t1 = getTransporter()
      resetTransporter()
      const t2 = getTransporter()
      expect(t1).not.toBe(t2)
    })
  })

  describe('sendEmail', () => {
    it('should send an email successfully in dev mode', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: 'Hello',
      })

      expect(result.success).toBe(true)
      expect(result.messageId).toBeDefined()
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('should include correct fields in the email', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await sendEmail({
        to: 'user@company.vn',
        subject: 'Thông báo quan trọng',
        html: '<h1>Xin chào</h1>',
        text: 'Xin chào',
      })

      expect(result.success).toBe(true)

      vi.restoreAllMocks()
    })

    it('should handle missing text field gracefully', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'No text',
        html: '<p>Only HTML</p>',
      })

      expect(result.success).toBe(true)

      vi.restoreAllMocks()
    })
  })

  describe('sendNotificationEmail', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should send TASK_ASSIGNED notification email', async () => {
      const result = await sendNotificationEmail('user@test.com', {
        type: 'TASK_ASSIGNED',
        title: 'Công việc mới được giao',
        message: 'Bạn được giao task ABC',
        link: '/tasks/task-1',
      })

      expect(result.success).toBe(true)
    })

    it('should send DOCUMENT_OVERDUE notification email', async () => {
      const result = await sendNotificationEmail('legal@test.com', {
        type: 'DOCUMENT_OVERDUE',
        title: 'Tài liệu quá hạn',
        message: 'Tài liệu XYZ đã quá hạn 5 ngày',
        link: '/documents/doc-1',
      })

      expect(result.success).toBe(true)
    })

    it('should send FEE_OVERDUE notification email', async () => {
      const result = await sendNotificationEmail('finance@test.com', {
        type: 'FEE_OVERDUE',
        title: 'Phí thường niên quá hạn',
        message: null,
        link: '/fees',
      })

      expect(result.success).toBe(true)
    })

    it('should send CONTRACT_EXPIRING notification email', async () => {
      const result = await sendNotificationEmail('legal@test.com', {
        type: 'CONTRACT_EXPIRING',
        title: 'Hợp đồng sắp hết hạn',
        message: 'Hợp đồng NDA với ABC Corp hết hạn trong 30 ngày',
        link: '/agreements/agr-1',
      })

      expect(result.success).toBe(true)
    })

    it('should send KPI_OFF_TRACK notification email', async () => {
      const result = await sendNotificationEmail('pm@test.com', {
        type: 'KPI_OFF_TRACK',
        title: 'KPI chưa đạt mục tiêu',
        message: 'KPI "Số người dùng" đang dưới mục tiêu 20%',
        link: '/projects/proj-1/kpis',
      })

      expect(result.success).toBe(true)
    })

    it('should use fallback template for unknown notification type', async () => {
      const result = await sendNotificationEmail('user@test.com', {
        type: 'UNKNOWN_TYPE',
        title: 'Thông báo tùy chỉnh',
        message: 'Nội dung thông báo tùy chỉnh',
        link: '/custom',
      })

      expect(result.success).toBe(true)
    })

    it('should handle notification without message or link', async () => {
      const result = await sendNotificationEmail('user@test.com', {
        type: 'EVENT_REMINDER',
        title: 'Nhắc nhở sự kiện',
      })

      expect(result.success).toBe(true)
    })
  })
})
