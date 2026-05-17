import { describe, it, expect } from 'vitest'
import { DocumentStatus } from '@prisma/client'
import { validateStatusTransition, VALID_TRANSITIONS, ADMIN_ROLES } from './document-status'

describe('validateStatusTransition', () => {
  describe('valid transitions', () => {
    it('NOT_STARTED → DRAFTING', () => {
      const result = validateStatusTransition(DocumentStatus.NOT_STARTED, DocumentStatus.DRAFTING)
      expect(result).toEqual({ valid: true })
    })

    it('DRAFTING → NEEDS_INFO', () => {
      const result = validateStatusTransition(DocumentStatus.DRAFTING, DocumentStatus.NEEDS_INFO)
      expect(result).toEqual({ valid: true })
    })

    it('DRAFTING → IN_REVIEW', () => {
      const result = validateStatusTransition(DocumentStatus.DRAFTING, DocumentStatus.IN_REVIEW)
      expect(result).toEqual({ valid: true })
    })

    it('NEEDS_INFO → DRAFTING', () => {
      const result = validateStatusTransition(DocumentStatus.NEEDS_INFO, DocumentStatus.DRAFTING)
      expect(result).toEqual({ valid: true })
    })

    it('NEEDS_INFO → IN_REVIEW', () => {
      const result = validateStatusTransition(DocumentStatus.NEEDS_INFO, DocumentStatus.IN_REVIEW)
      expect(result).toEqual({ valid: true })
    })

    it('IN_REVIEW → DRAFTING (rejected)', () => {
      const result = validateStatusTransition(DocumentStatus.IN_REVIEW, DocumentStatus.DRAFTING)
      expect(result).toEqual({ valid: true })
    })

    it('IN_REVIEW → PENDING_APPROVAL', () => {
      const result = validateStatusTransition(DocumentStatus.IN_REVIEW, DocumentStatus.PENDING_APPROVAL)
      expect(result).toEqual({ valid: true })
    })

    it('PENDING_APPROVAL → APPROVED', () => {
      const result = validateStatusTransition(DocumentStatus.PENDING_APPROVAL, DocumentStatus.APPROVED)
      expect(result).toEqual({ valid: true })
    })

    it('PENDING_APPROVAL → DRAFTING (rejected)', () => {
      const result = validateStatusTransition(DocumentStatus.PENDING_APPROVAL, DocumentStatus.DRAFTING)
      expect(result).toEqual({ valid: true })
    })

    it('APPROVED → ARCHIVED', () => {
      const result = validateStatusTransition(DocumentStatus.APPROVED, DocumentStatus.ARCHIVED)
      expect(result).toEqual({ valid: true })
    })

    it('APPROVED → EXPIRED', () => {
      const result = validateStatusTransition(DocumentStatus.APPROVED, DocumentStatus.EXPIRED)
      expect(result).toEqual({ valid: true })
    })
  })

  describe('same status (no-op)', () => {
    it('allows same status transition', () => {
      const result = validateStatusTransition(DocumentStatus.DRAFTING, DocumentStatus.DRAFTING)
      expect(result).toEqual({ valid: true })
    })
  })

  describe('invalid transitions', () => {
    it('NOT_STARTED → APPROVED is invalid', () => {
      const result = validateStatusTransition(DocumentStatus.NOT_STARTED, DocumentStatus.APPROVED)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('Không thể chuyển trạng thái')
        expect(result.message).toContain('Chưa bắt đầu')
        expect(result.message).toContain('Đã phê duyệt')
      }
    })

    it('DRAFTING → APPROVED is invalid (must go through IN_REVIEW)', () => {
      const result = validateStatusTransition(DocumentStatus.DRAFTING, DocumentStatus.APPROVED)
      expect(result.valid).toBe(false)
    })

    it('APPROVED → DRAFTING is invalid', () => {
      const result = validateStatusTransition(DocumentStatus.APPROVED, DocumentStatus.DRAFTING)
      expect(result.valid).toBe(false)
    })

    it('ARCHIVED → DRAFTING is invalid (terminal state)', () => {
      const result = validateStatusTransition(DocumentStatus.ARCHIVED, DocumentStatus.DRAFTING)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('không cho phép chuyển đổi')
      }
    })

    it('EXPIRED → DRAFTING is invalid (terminal state)', () => {
      const result = validateStatusTransition(DocumentStatus.EXPIRED, DocumentStatus.DRAFTING)
      expect(result.valid).toBe(false)
    })

    it('NOT_STARTED → IN_REVIEW is invalid (must draft first)', () => {
      const result = validateStatusTransition(DocumentStatus.NOT_STARTED, DocumentStatus.IN_REVIEW)
      expect(result.valid).toBe(false)
    })
  })

  describe('admin override — Any → ARCHIVED', () => {
    it('System_Admin can archive from NOT_STARTED', () => {
      const result = validateStatusTransition(
        DocumentStatus.NOT_STARTED,
        DocumentStatus.ARCHIVED,
        ['System_Admin']
      )
      expect(result).toEqual({ valid: true })
    })

    it('Director can archive from DRAFTING', () => {
      const result = validateStatusTransition(
        DocumentStatus.DRAFTING,
        DocumentStatus.ARCHIVED,
        ['Director']
      )
      expect(result).toEqual({ valid: true })
    })

    it('System_Admin can archive from IN_REVIEW', () => {
      const result = validateStatusTransition(
        DocumentStatus.IN_REVIEW,
        DocumentStatus.ARCHIVED,
        ['System_Admin']
      )
      expect(result).toEqual({ valid: true })
    })

    it('non-admin cannot archive from NOT_STARTED', () => {
      const result = validateStatusTransition(
        DocumentStatus.NOT_STARTED,
        DocumentStatus.ARCHIVED,
        ['Viewer']
      )
      expect(result.valid).toBe(false)
    })

    it('non-admin cannot archive from DRAFTING', () => {
      const result = validateStatusTransition(
        DocumentStatus.DRAFTING,
        DocumentStatus.ARCHIVED,
        ['Core_Team_Member']
      )
      expect(result.valid).toBe(false)
    })
  })

  describe('error messages are in Vietnamese', () => {
    it('includes Vietnamese status labels', () => {
      const result = validateStatusTransition(DocumentStatus.DRAFTING, DocumentStatus.APPROVED)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('Đang soạn thảo')
        expect(result.message).toContain('Đã phê duyệt')
        expect(result.message).toContain('Các trạng thái hợp lệ')
      }
    })
  })
})

describe('VALID_TRANSITIONS', () => {
  it('covers all DocumentStatus values', () => {
    const allStatuses = Object.values(DocumentStatus)
    for (const status of allStatuses) {
      expect(VALID_TRANSITIONS).toHaveProperty(status)
    }
  })
})

describe('ADMIN_ROLES', () => {
  it('includes System_Admin and Director', () => {
    expect(ADMIN_ROLES).toContain('System_Admin')
    expect(ADMIN_ROLES).toContain('Director')
  })
})
