import { describe, it, expect } from 'vitest'
import { AgreementStatus } from '@prisma/client'
import {
  validateAgreementTransition,
  VALID_AGREEMENT_TRANSITIONS,
  AGREEMENT_STATUS_LABELS,
} from './agreement-lifecycle'

describe('agreement-lifecycle', () => {
  describe('validateAgreementTransition', () => {
    it('should allow same status (no-op)', () => {
      const result = validateAgreementTransition(AgreementStatus.DRAFT, AgreementStatus.DRAFT)
      expect(result.valid).toBe(true)
    })

    it('should allow DRAFT → LEGAL_REVIEW', () => {
      const result = validateAgreementTransition(AgreementStatus.DRAFT, AgreementStatus.LEGAL_REVIEW)
      expect(result.valid).toBe(true)
    })

    it('should allow DRAFT → NEGOTIATION', () => {
      const result = validateAgreementTransition(AgreementStatus.DRAFT, AgreementStatus.NEGOTIATION)
      expect(result.valid).toBe(true)
    })

    it('should allow LEGAL_REVIEW → PENDING_SIGNATURE', () => {
      const result = validateAgreementTransition(AgreementStatus.LEGAL_REVIEW, AgreementStatus.PENDING_SIGNATURE)
      expect(result.valid).toBe(true)
    })

    it('should allow PENDING_SIGNATURE → SIGNED', () => {
      const result = validateAgreementTransition(AgreementStatus.PENDING_SIGNATURE, AgreementStatus.SIGNED)
      expect(result.valid).toBe(true)
    })

    it('should allow SIGNED → ACTIVE', () => {
      const result = validateAgreementTransition(AgreementStatus.SIGNED, AgreementStatus.ACTIVE)
      expect(result.valid).toBe(true)
    })

    it('should allow ACTIVE → EXPIRING', () => {
      const result = validateAgreementTransition(AgreementStatus.ACTIVE, AgreementStatus.EXPIRING)
      expect(result.valid).toBe(true)
    })

    it('should allow ACTIVE → TERMINATED', () => {
      const result = validateAgreementTransition(AgreementStatus.ACTIVE, AgreementStatus.TERMINATED)
      expect(result.valid).toBe(true)
    })

    it('should allow EXPIRING → EXPIRED', () => {
      const result = validateAgreementTransition(AgreementStatus.EXPIRING, AgreementStatus.EXPIRED)
      expect(result.valid).toBe(true)
    })

    it('should allow EXPIRING → ACTIVE (renewal)', () => {
      const result = validateAgreementTransition(AgreementStatus.EXPIRING, AgreementStatus.ACTIVE)
      expect(result.valid).toBe(true)
    })

    it('should reject DRAFT → ACTIVE (skip steps)', () => {
      const result = validateAgreementTransition(AgreementStatus.DRAFT, AgreementStatus.ACTIVE)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('Bản nháp')
        expect(result.message).toContain('Hiệu lực')
      }
    })

    it('should reject ARCHIVED → any (terminal state)', () => {
      const result = validateAgreementTransition(AgreementStatus.ARCHIVED, AgreementStatus.DRAFT)
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('trạng thái cuối cùng')
      }
    })

    it('should reject EXPIRED → ACTIVE (cannot reactivate expired)', () => {
      const result = validateAgreementTransition(AgreementStatus.EXPIRED, AgreementStatus.ACTIVE)
      expect(result.valid).toBe(false)
    })

    it('should allow admin to archive from any state', () => {
      const adminRoles = ['Director']
      const result = validateAgreementTransition(
        AgreementStatus.DRAFT,
        AgreementStatus.ARCHIVED,
        adminRoles
      )
      expect(result.valid).toBe(true)
    })

    it('should allow System_Admin to archive from any state', () => {
      const result = validateAgreementTransition(
        AgreementStatus.ACTIVE,
        AgreementStatus.ARCHIVED,
        ['System_Admin']
      )
      expect(result.valid).toBe(true)
    })

    it('should reject non-admin archiving from DRAFT', () => {
      const result = validateAgreementTransition(
        AgreementStatus.DRAFT,
        AgreementStatus.ARCHIVED,
        ['Legal_Officer']
      )
      expect(result.valid).toBe(false)
    })

    it('should have Vietnamese labels for all statuses', () => {
      const allStatuses = Object.values(AgreementStatus)
      for (const status of allStatuses) {
        expect(AGREEMENT_STATUS_LABELS[status]).toBeDefined()
        expect(AGREEMENT_STATUS_LABELS[status].length).toBeGreaterThan(0)
      }
    })

    it('should have transitions defined for all statuses', () => {
      const allStatuses = Object.values(AgreementStatus)
      for (const status of allStatuses) {
        expect(VALID_AGREEMENT_TRANSITIONS[status]).toBeDefined()
        expect(Array.isArray(VALID_AGREEMENT_TRANSITIONS[status])).toBe(true)
      }
    })
  })
})
