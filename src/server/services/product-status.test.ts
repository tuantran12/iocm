import { describe, it, expect } from 'vitest'
import { ProductStatus } from '@prisma/client'
import {
  validateProductStatusTransition,
  validateReviewStatusTransition,
  checkReviewGates,
  VALID_PRODUCT_TRANSITIONS,
  PRODUCT_ADMIN_ROLES,
} from './product-status'

/**
 * Product Status Workflow & Review Gates Tests
 *
 * Validates: Task 13.2 (product status workflow)
 * Validates: Task 13.3 (product review gates)
 */

describe('validateProductStatusTransition', () => {
  describe('valid transitions', () => {
    it('PROPOSED → UNDER_REVIEW', () => {
      const result = validateProductStatusTransition(
        ProductStatus.PROPOSED,
        ProductStatus.UNDER_REVIEW
      )
      expect(result).toEqual({ valid: true })
    })

    it('UNDER_REVIEW → APPROVED (with all reviews passed)', () => {
      const result = validateProductStatusTransition(
        ProductStatus.UNDER_REVIEW,
        ProductStatus.APPROVED,
        [],
        { securityStatus: 'approved', dataReviewStatus: 'approved', aiReviewStatus: 'approved', aiUsed: true }
      )
      expect(result).toEqual({ valid: true })
    })

    it('UNDER_REVIEW → PROPOSED (rejected back)', () => {
      const result = validateProductStatusTransition(
        ProductStatus.UNDER_REVIEW,
        ProductStatus.PROPOSED
      )
      expect(result).toEqual({ valid: true })
    })

    it('APPROVED → PILOT_READY', () => {
      const result = validateProductStatusTransition(
        ProductStatus.APPROVED,
        ProductStatus.PILOT_READY
      )
      expect(result).toEqual({ valid: true })
    })

    it('PILOT_READY → DEPLOYED', () => {
      const result = validateProductStatusTransition(
        ProductStatus.PILOT_READY,
        ProductStatus.DEPLOYED
      )
      expect(result).toEqual({ valid: true })
    })

    it('DEPLOYED → RETIRED', () => {
      const result = validateProductStatusTransition(
        ProductStatus.DEPLOYED,
        ProductStatus.RETIRED
      )
      expect(result).toEqual({ valid: true })
    })

    it('SUSPENDED → PROPOSED (re-submit)', () => {
      const result = validateProductStatusTransition(
        ProductStatus.SUSPENDED,
        ProductStatus.PROPOSED
      )
      expect(result).toEqual({ valid: true })
    })

    it('same status is always valid (no-op)', () => {
      const result = validateProductStatusTransition(
        ProductStatus.PROPOSED,
        ProductStatus.PROPOSED
      )
      expect(result).toEqual({ valid: true })
    })
  })

  describe('invalid transitions', () => {
    it('PROPOSED → APPROVED (must go through UNDER_REVIEW)', () => {
      const result = validateProductStatusTransition(
        ProductStatus.PROPOSED,
        ProductStatus.APPROVED
      )
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('Đề xuất')
        expect(result.message).toContain('Đã duyệt')
      }
    })

    it('PROPOSED → DEPLOYED (skip steps)', () => {
      const result = validateProductStatusTransition(
        ProductStatus.PROPOSED,
        ProductStatus.DEPLOYED
      )
      expect(result.valid).toBe(false)
    })

    it('RETIRED → any (terminal state)', () => {
      const result = validateProductStatusTransition(
        ProductStatus.RETIRED,
        ProductStatus.PROPOSED
      )
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('trạng thái cuối')
      }
    })

    it('APPROVED → UNDER_REVIEW (cannot go back)', () => {
      const result = validateProductStatusTransition(
        ProductStatus.APPROVED,
        ProductStatus.UNDER_REVIEW
      )
      expect(result.valid).toBe(false)
    })
  })

  describe('review gates enforcement', () => {
    it('blocks APPROVED when security review not passed', () => {
      const result = validateProductStatusTransition(
        ProductStatus.UNDER_REVIEW,
        ProductStatus.APPROVED,
        [],
        { securityStatus: 'in_review', dataReviewStatus: 'approved', aiReviewStatus: 'approved', aiUsed: true }
      )
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('bảo mật')
      }
    })

    it('blocks APPROVED when data review not passed', () => {
      const result = validateProductStatusTransition(
        ProductStatus.UNDER_REVIEW,
        ProductStatus.APPROVED,
        [],
        { securityStatus: 'approved', dataReviewStatus: 'rejected', aiReviewStatus: 'approved', aiUsed: true }
      )
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('dữ liệu')
      }
    })

    it('blocks APPROVED when AI review not passed (aiUsed=true)', () => {
      const result = validateProductStatusTransition(
        ProductStatus.UNDER_REVIEW,
        ProductStatus.APPROVED,
        [],
        { securityStatus: 'approved', dataReviewStatus: 'approved', aiReviewStatus: 'not_reviewed', aiUsed: true }
      )
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('AI')
      }
    })

    it('allows APPROVED when AI review not passed but aiUsed=false', () => {
      const result = validateProductStatusTransition(
        ProductStatus.UNDER_REVIEW,
        ProductStatus.APPROVED,
        [],
        { securityStatus: 'approved', dataReviewStatus: 'approved', aiReviewStatus: 'not_reviewed', aiUsed: false }
      )
      expect(result).toEqual({ valid: true })
    })
  })

  describe('admin override', () => {
    it('admin can force-suspend from any non-terminal state', () => {
      const result = validateProductStatusTransition(
        ProductStatus.PROPOSED,
        ProductStatus.SUSPENDED,
        ['Tech_Director']
      )
      expect(result).toEqual({ valid: true })
    })

    it('admin can force-retire from any non-terminal state', () => {
      const result = validateProductStatusTransition(
        ProductStatus.APPROVED,
        ProductStatus.RETIRED,
        ['Director']
      )
      expect(result).toEqual({ valid: true })
    })

    it('admin cannot override RETIRED (already terminal)', () => {
      const result = validateProductStatusTransition(
        ProductStatus.RETIRED,
        ProductStatus.SUSPENDED,
        ['System_Admin']
      )
      expect(result.valid).toBe(false)
    })
  })
})

describe('validateReviewStatusTransition', () => {
  it('not_reviewed → in_review is valid', () => {
    const result = validateReviewStatusTransition('not_reviewed', 'in_review')
    expect(result).toEqual({ valid: true })
  })

  it('in_review → approved is valid', () => {
    const result = validateReviewStatusTransition('in_review', 'approved')
    expect(result).toEqual({ valid: true })
  })

  it('in_review → rejected is valid', () => {
    const result = validateReviewStatusTransition('in_review', 'rejected')
    expect(result).toEqual({ valid: true })
  })

  it('approved → in_review is valid (re-review)', () => {
    const result = validateReviewStatusTransition('approved', 'in_review')
    expect(result).toEqual({ valid: true })
  })

  it('rejected → in_review is valid (re-review)', () => {
    const result = validateReviewStatusTransition('rejected', 'in_review')
    expect(result).toEqual({ valid: true })
  })

  it('not_reviewed → approved is invalid (must go through in_review)', () => {
    const result = validateReviewStatusTransition('not_reviewed', 'approved')
    expect(result.valid).toBe(false)
  })

  it('not_reviewed → rejected is invalid', () => {
    const result = validateReviewStatusTransition('not_reviewed', 'rejected')
    expect(result.valid).toBe(false)
  })

  it('same status is always valid', () => {
    const result = validateReviewStatusTransition('approved', 'approved')
    expect(result).toEqual({ valid: true })
  })
})

describe('checkReviewGates', () => {
  it('passes when all reviews approved (with AI)', () => {
    const result = checkReviewGates({
      securityStatus: 'approved',
      dataReviewStatus: 'approved',
      aiReviewStatus: 'approved',
      aiUsed: true,
    })
    expect(result.passed).toBe(true)
    expect(result.failures).toHaveLength(0)
  })

  it('passes when security+data approved and AI not required', () => {
    const result = checkReviewGates({
      securityStatus: 'approved',
      dataReviewStatus: 'approved',
      aiReviewStatus: 'not_reviewed',
      aiUsed: false,
    })
    expect(result.passed).toBe(true)
    expect(result.failures).toHaveLength(0)
  })

  it('fails when security not approved', () => {
    const result = checkReviewGates({
      securityStatus: 'in_review',
      dataReviewStatus: 'approved',
      aiReviewStatus: 'approved',
      aiUsed: true,
    })
    expect(result.passed).toBe(false)
    expect(result.failures).toContain('Đánh giá bảo mật chưa được phê duyệt')
  })

  it('fails when data not approved', () => {
    const result = checkReviewGates({
      securityStatus: 'approved',
      dataReviewStatus: 'not_reviewed',
      aiReviewStatus: 'approved',
      aiUsed: true,
    })
    expect(result.passed).toBe(false)
    expect(result.failures).toContain('Đánh giá dữ liệu chưa được phê duyệt')
  })

  it('fails when AI required but not approved', () => {
    const result = checkReviewGates({
      securityStatus: 'approved',
      dataReviewStatus: 'approved',
      aiReviewStatus: 'rejected',
      aiUsed: true,
    })
    expect(result.passed).toBe(false)
    expect(result.failures).toContain('Đánh giá AI chưa được phê duyệt')
  })

  it('reports multiple failures', () => {
    const result = checkReviewGates({
      securityStatus: 'not_reviewed',
      dataReviewStatus: 'in_review',
      aiReviewStatus: 'rejected',
      aiUsed: true,
    })
    expect(result.passed).toBe(false)
    expect(result.failures).toHaveLength(3)
  })
})

describe('VALID_PRODUCT_TRANSITIONS map', () => {
  it('RETIRED has no valid transitions (terminal)', () => {
    expect(VALID_PRODUCT_TRANSITIONS[ProductStatus.RETIRED]).toEqual([])
  })

  it('all ProductStatus values are covered', () => {
    const allStatuses = Object.values(ProductStatus)
    allStatuses.forEach((status) => {
      expect(VALID_PRODUCT_TRANSITIONS).toHaveProperty(status)
    })
  })
})

describe('PRODUCT_ADMIN_ROLES', () => {
  it('includes System_Admin, Director, Tech_Director', () => {
    expect(PRODUCT_ADMIN_ROLES).toContain('System_Admin')
    expect(PRODUCT_ADMIN_ROLES).toContain('Director')
    expect(PRODUCT_ADMIN_ROLES).toContain('Tech_Director')
  })
})
