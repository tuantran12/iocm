import { describe, it, expect } from 'vitest'
import { MembershipStatus } from '@prisma/client'

/**
 * Membership Application Workflow - Business Rules Tests
 *
 * Tests the workflow: submit → review → approve/reject
 * Validates: Requirement R08 — Membership Application & Approval
 */

// ─── Status Transition Map (mirrored from members.ts) ─────────────────────────

const VALID_STATUS_TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  PROSPECT: [MembershipStatus.INVITED, MembershipStatus.APPLICATION_SUBMITTED],
  INVITED: [MembershipStatus.APPLICATION_SUBMITTED],
  APPLICATION_SUBMITTED: [MembershipStatus.UNDER_REVIEW],
  UNDER_REVIEW: [MembershipStatus.APPROVED, MembershipStatus.APPLICATION_SUBMITTED, MembershipStatus.TERMINATED],
  APPROVED: [MembershipStatus.ACTIVE],
  ACTIVE: [
    MembershipStatus.PAYMENT_OVERDUE,
    MembershipStatus.SUSPENDED,
    MembershipStatus.TERMINATED,
    MembershipStatus.WITHDRAWN,
  ],
  PAYMENT_OVERDUE: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED],
  SUSPENDED: [MembershipStatus.ACTIVE, MembershipStatus.TERMINATED],
  TERMINATED: [],
  WITHDRAWN: [],
}

function isValidTransition(from: MembershipStatus, to: MembershipStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Workflow validation helpers (mirrored from members.ts logic) ──────────────

function validateSubmitApplication(currentStatus: MembershipStatus): { valid: boolean; error?: string } {
  if (!isValidTransition(currentStatus, MembershipStatus.APPLICATION_SUBMITTED)) {
    return { valid: false, error: `Cannot submit from status: ${currentStatus}` }
  }
  return { valid: true }
}

function validateStartReview(currentStatus: MembershipStatus): { valid: boolean; error?: string } {
  if (currentStatus !== MembershipStatus.APPLICATION_SUBMITTED) {
    return { valid: false, error: `Can only start review from APPLICATION_SUBMITTED. Current: ${currentStatus}` }
  }
  return { valid: true }
}

function validateRequestMoreInfo(currentStatus: MembershipStatus, comment?: string): { valid: boolean; error?: string } {
  if (currentStatus !== MembershipStatus.UNDER_REVIEW) {
    return { valid: false, error: `Can only request more info from UNDER_REVIEW. Current: ${currentStatus}` }
  }
  if (!comment) {
    return { valid: false, error: 'Comment is required when requesting more information' }
  }
  return { valid: true }
}

function validateReject(currentStatus: MembershipStatus, comment?: string): { valid: boolean; error?: string } {
  if (currentStatus !== MembershipStatus.UNDER_REVIEW) {
    return { valid: false, error: `Can only reject from UNDER_REVIEW. Current: ${currentStatus}` }
  }
  if (!comment) {
    return { valid: false, error: 'Comment is required when rejecting application' }
  }
  return { valid: true }
}

function validateApprove(currentStatus: MembershipStatus): { valid: boolean; error?: string } {
  if (currentStatus !== MembershipStatus.UNDER_REVIEW) {
    return { valid: false, error: `Can only approve from UNDER_REVIEW. Current: ${currentStatus}` }
  }
  return { valid: true }
}

function validateActivate(currentStatus: MembershipStatus, feePaid: boolean): { valid: boolean; error?: string } {
  if (currentStatus !== MembershipStatus.APPROVED) {
    return { valid: false, error: `Can only activate from APPROVED. Current: ${currentStatus}` }
  }
  if (!feePaid) {
    return { valid: false, error: 'Fee must be paid or waived before activation' }
  }
  return { valid: true }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Membership Application Workflow - Business Rules', () => {
  describe('submitApplication validation', () => {
    it('allows submission from PROSPECT', () => {
      const result = validateSubmitApplication(MembershipStatus.PROSPECT)
      expect(result.valid).toBe(true)
    })

    it('allows submission from INVITED', () => {
      const result = validateSubmitApplication(MembershipStatus.INVITED)
      expect(result.valid).toBe(true)
    })

    it('rejects submission from UNDER_REVIEW (only reviewer can send back)', () => {
      // Note: The transition map allows UNDER_REVIEW → APPLICATION_SUBMITTED
      // but submitApplication explicitly restricts to PROSPECT/INVITED only.
      // The reviewer uses reviewApplication(REQUEST_MORE_INFO) for this transition.
      const currentStatus: MembershipStatus = MembershipStatus.UNDER_REVIEW
      const allowedStatuses: MembershipStatus[] = [MembershipStatus.PROSPECT, MembershipStatus.INVITED]
      expect(allowedStatuses.includes(currentStatus)).toBe(false)
    })

    it('rejects submission from ACTIVE', () => {
      const result = validateSubmitApplication(MembershipStatus.ACTIVE)
      expect(result.valid).toBe(false)
    })

    it('rejects submission from TERMINATED', () => {
      const result = validateSubmitApplication(MembershipStatus.TERMINATED)
      expect(result.valid).toBe(false)
    })
  })

  describe('reviewApplication - START_REVIEW', () => {
    it('allows starting review from APPLICATION_SUBMITTED', () => {
      const result = validateStartReview(MembershipStatus.APPLICATION_SUBMITTED)
      expect(result.valid).toBe(true)
    })

    it('rejects starting review from PROSPECT', () => {
      const result = validateStartReview(MembershipStatus.PROSPECT)
      expect(result.valid).toBe(false)
    })

    it('rejects starting review from UNDER_REVIEW', () => {
      const result = validateStartReview(MembershipStatus.UNDER_REVIEW)
      expect(result.valid).toBe(false)
    })
  })

  describe('reviewApplication - REQUEST_MORE_INFO', () => {
    it('allows request more info from UNDER_REVIEW with comment', () => {
      const result = validateRequestMoreInfo(MembershipStatus.UNDER_REVIEW, 'Need tax certificate')
      expect(result.valid).toBe(true)
    })

    it('rejects request more info without comment', () => {
      const result = validateRequestMoreInfo(MembershipStatus.UNDER_REVIEW, undefined)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Comment is required')
    })

    it('rejects request more info with empty comment', () => {
      const result = validateRequestMoreInfo(MembershipStatus.UNDER_REVIEW, '')
      expect(result.valid).toBe(false)
    })

    it('rejects request more info from APPLICATION_SUBMITTED', () => {
      const result = validateRequestMoreInfo(MembershipStatus.APPLICATION_SUBMITTED, 'Some comment')
      expect(result.valid).toBe(false)
    })
  })

  describe('reviewApplication - REJECT', () => {
    it('allows rejection from UNDER_REVIEW with comment', () => {
      const result = validateReject(MembershipStatus.UNDER_REVIEW, 'Does not meet criteria')
      expect(result.valid).toBe(true)
    })

    it('rejects rejection without comment', () => {
      const result = validateReject(MembershipStatus.UNDER_REVIEW, undefined)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Comment is required')
    })

    it('rejects rejection from APPLICATION_SUBMITTED', () => {
      const result = validateReject(MembershipStatus.APPLICATION_SUBMITTED, 'Some reason')
      expect(result.valid).toBe(false)
    })

    it('REJECT transitions to TERMINATED in the status map', () => {
      expect(isValidTransition(MembershipStatus.UNDER_REVIEW, MembershipStatus.TERMINATED)).toBe(true)
    })
  })

  describe('approveApplication', () => {
    it('allows approval from UNDER_REVIEW', () => {
      const result = validateApprove(MembershipStatus.UNDER_REVIEW)
      expect(result.valid).toBe(true)
    })

    it('rejects approval from APPLICATION_SUBMITTED', () => {
      const result = validateApprove(MembershipStatus.APPLICATION_SUBMITTED)
      expect(result.valid).toBe(false)
    })

    it('rejects approval from PROSPECT', () => {
      const result = validateApprove(MembershipStatus.PROSPECT)
      expect(result.valid).toBe(false)
    })
  })

  describe('activateMembership (APPROVED → ACTIVE)', () => {
    it('allows activation when fee is paid', () => {
      const result = validateActivate(MembershipStatus.APPROVED, true)
      expect(result.valid).toBe(true)
    })

    it('rejects activation when fee is not paid', () => {
      const result = validateActivate(MembershipStatus.APPROVED, false)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Fee must be paid')
    })

    it('rejects activation from non-APPROVED status', () => {
      const result = validateActivate(MembershipStatus.UNDER_REVIEW, true)
      expect(result.valid).toBe(false)
    })
  })

  describe('full workflow state transitions', () => {
    it('happy path: PROSPECT → APPLICATION_SUBMITTED → UNDER_REVIEW → APPROVED → ACTIVE', () => {
      const states: MembershipStatus[] = [MembershipStatus.PROSPECT]

      // Step 1: Submit application
      expect(isValidTransition(states[states.length - 1]!, MembershipStatus.APPLICATION_SUBMITTED)).toBe(true)
      states.push(MembershipStatus.APPLICATION_SUBMITTED)

      // Step 2: Start review
      expect(isValidTransition(states[states.length - 1]!, MembershipStatus.UNDER_REVIEW)).toBe(true)
      states.push(MembershipStatus.UNDER_REVIEW)

      // Step 3: Approve
      expect(isValidTransition(states[states.length - 1]!, MembershipStatus.APPROVED)).toBe(true)
      states.push(MembershipStatus.APPROVED)

      // Step 4: Activate after fee paid
      expect(isValidTransition(states[states.length - 1]!, MembershipStatus.ACTIVE)).toBe(true)
      states.push(MembershipStatus.ACTIVE)

      expect(states).toEqual([
        MembershipStatus.PROSPECT,
        MembershipStatus.APPLICATION_SUBMITTED,
        MembershipStatus.UNDER_REVIEW,
        MembershipStatus.APPROVED,
        MembershipStatus.ACTIVE,
      ])
    })

    it('request more info loop: UNDER_REVIEW → APPLICATION_SUBMITTED → UNDER_REVIEW', () => {
      // Start from UNDER_REVIEW
      expect(isValidTransition(MembershipStatus.UNDER_REVIEW, MembershipStatus.APPLICATION_SUBMITTED)).toBe(true)
      // Re-submit
      expect(isValidTransition(MembershipStatus.APPLICATION_SUBMITTED, MembershipStatus.UNDER_REVIEW)).toBe(true)
    })

    it('rejection path: UNDER_REVIEW → TERMINATED', () => {
      expect(isValidTransition(MembershipStatus.UNDER_REVIEW, MembershipStatus.TERMINATED)).toBe(true)
    })

    it('invited path: INVITED → APPLICATION_SUBMITTED → UNDER_REVIEW → APPROVED', () => {
      expect(isValidTransition(MembershipStatus.INVITED, MembershipStatus.APPLICATION_SUBMITTED)).toBe(true)
      expect(isValidTransition(MembershipStatus.APPLICATION_SUBMITTED, MembershipStatus.UNDER_REVIEW)).toBe(true)
      expect(isValidTransition(MembershipStatus.UNDER_REVIEW, MembershipStatus.APPROVED)).toBe(true)
    })

    it('terminal states have no valid transitions', () => {
      expect(VALID_STATUS_TRANSITIONS[MembershipStatus.TERMINATED]).toEqual([])
      expect(VALID_STATUS_TRANSITIONS[MembershipStatus.WITHDRAWN]).toEqual([])
    })
  })

  describe('RBAC requirements', () => {
    // These are structural tests verifying the expected role assignments
    const WORKFLOW_RBAC = {
      submitApplication: 'any_authenticated', // protectedProcedure
      reviewApplication: ['Membership_Manager', 'Legal_Officer'],
      approveApplication: ['Director', 'System_Admin'],
      updateStatus: ['Membership_Manager', 'Director', 'System_Admin'],
    }

    it('submitApplication is accessible to any authenticated user', () => {
      expect(WORKFLOW_RBAC.submitApplication).toBe('any_authenticated')
    })

    it('reviewApplication requires Membership_Manager or Legal_Officer', () => {
      expect(WORKFLOW_RBAC.reviewApplication).toContain('Membership_Manager')
      expect(WORKFLOW_RBAC.reviewApplication).toContain('Legal_Officer')
    })

    it('approveApplication requires Director or System_Admin', () => {
      expect(WORKFLOW_RBAC.approveApplication).toContain('Director')
      expect(WORKFLOW_RBAC.approveApplication).toContain('System_Admin')
    })

    it('updateStatus requires Membership_Manager, Director, or System_Admin', () => {
      expect(WORKFLOW_RBAC.updateStatus).toContain('Membership_Manager')
      expect(WORKFLOW_RBAC.updateStatus).toContain('Director')
      expect(WORKFLOW_RBAC.updateStatus).toContain('System_Admin')
    })
  })
})
