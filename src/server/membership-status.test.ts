import { describe, it, expect } from 'vitest'
import { MembershipStatus } from '@prisma/client'
import {
  VALID_STATUS_TRANSITIONS,
  TERMINAL_STATES,
  STATUS_LABELS,
  isValidTransition,
  validateMembershipTransition,
} from './membership-status'

describe('VALID_STATUS_TRANSITIONS', () => {
  it('covers all MembershipStatus values', () => {
    const allStatuses = Object.values(MembershipStatus)
    for (const status of allStatuses) {
      expect(VALID_STATUS_TRANSITIONS).toHaveProperty(status)
    }
  })

  it('TERMINATED has no outgoing transitions', () => {
    expect(VALID_STATUS_TRANSITIONS[MembershipStatus.TERMINATED]).toEqual([])
  })

  it('WITHDRAWN has no outgoing transitions', () => {
    expect(VALID_STATUS_TRANSITIONS[MembershipStatus.WITHDRAWN]).toEqual([])
  })

  it('PROSPECT can transition to INVITED or APPLICATION_SUBMITTED', () => {
    expect(VALID_STATUS_TRANSITIONS[MembershipStatus.PROSPECT]).toEqual([
      MembershipStatus.INVITED,
      MembershipStatus.APPLICATION_SUBMITTED,
    ])
  })

  it('APPROVED can only transition to ACTIVE', () => {
    expect(VALID_STATUS_TRANSITIONS[MembershipStatus.APPROVED]).toEqual([
      MembershipStatus.ACTIVE,
    ])
  })
})

describe('TERMINAL_STATES', () => {
  it('includes TERMINATED and WITHDRAWN', () => {
    expect(TERMINAL_STATES).toContain(MembershipStatus.TERMINATED)
    expect(TERMINAL_STATES).toContain(MembershipStatus.WITHDRAWN)
  })

  it('terminal states have empty transition arrays', () => {
    for (const state of TERMINAL_STATES) {
      expect(VALID_STATUS_TRANSITIONS[state]).toEqual([])
    }
  })
})


describe('STATUS_LABELS', () => {
  it('has Vietnamese labels for all statuses', () => {
    const allStatuses = Object.values(MembershipStatus)
    for (const status of allStatuses) {
      expect(STATUS_LABELS[status]).toBeDefined()
      expect(STATUS_LABELS[status].length).toBeGreaterThan(0)
    }
  })
})

describe('isValidTransition', () => {
  describe('valid transitions', () => {
    it('PROSPECT → INVITED', () => {
      expect(isValidTransition(MembershipStatus.PROSPECT, MembershipStatus.INVITED)).toBe(true)
    })

    it('PROSPECT → APPLICATION_SUBMITTED', () => {
      expect(isValidTransition(MembershipStatus.PROSPECT, MembershipStatus.APPLICATION_SUBMITTED)).toBe(true)
    })

    it('INVITED → APPLICATION_SUBMITTED', () => {
      expect(isValidTransition(MembershipStatus.INVITED, MembershipStatus.APPLICATION_SUBMITTED)).toBe(true)
    })

    it('APPLICATION_SUBMITTED → UNDER_REVIEW', () => {
      expect(isValidTransition(MembershipStatus.APPLICATION_SUBMITTED, MembershipStatus.UNDER_REVIEW)).toBe(true)
    })

    it('UNDER_REVIEW → APPROVED', () => {
      expect(isValidTransition(MembershipStatus.UNDER_REVIEW, MembershipStatus.APPROVED)).toBe(true)
    })

    it('UNDER_REVIEW → APPLICATION_SUBMITTED (request more info)', () => {
      expect(isValidTransition(MembershipStatus.UNDER_REVIEW, MembershipStatus.APPLICATION_SUBMITTED)).toBe(true)
    })

    it('UNDER_REVIEW → TERMINATED (reject)', () => {
      expect(isValidTransition(MembershipStatus.UNDER_REVIEW, MembershipStatus.TERMINATED)).toBe(true)
    })

    it('APPROVED → ACTIVE', () => {
      expect(isValidTransition(MembershipStatus.APPROVED, MembershipStatus.ACTIVE)).toBe(true)
    })

    it('ACTIVE → PAYMENT_OVERDUE', () => {
      expect(isValidTransition(MembershipStatus.ACTIVE, MembershipStatus.PAYMENT_OVERDUE)).toBe(true)
    })

    it('ACTIVE → SUSPENDED', () => {
      expect(isValidTransition(MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED)).toBe(true)
    })

    it('ACTIVE → TERMINATED', () => {
      expect(isValidTransition(MembershipStatus.ACTIVE, MembershipStatus.TERMINATED)).toBe(true)
    })

    it('ACTIVE → WITHDRAWN', () => {
      expect(isValidTransition(MembershipStatus.ACTIVE, MembershipStatus.WITHDRAWN)).toBe(true)
    })

    it('PAYMENT_OVERDUE → ACTIVE', () => {
      expect(isValidTransition(MembershipStatus.PAYMENT_OVERDUE, MembershipStatus.ACTIVE)).toBe(true)
    })

    it('PAYMENT_OVERDUE → SUSPENDED', () => {
      expect(isValidTransition(MembershipStatus.PAYMENT_OVERDUE, MembershipStatus.SUSPENDED)).toBe(true)
    })

    it('SUSPENDED → ACTIVE', () => {
      expect(isValidTransition(MembershipStatus.SUSPENDED, MembershipStatus.ACTIVE)).toBe(true)
    })

    it('SUSPENDED → TERMINATED', () => {
      expect(isValidTransition(MembershipStatus.SUSPENDED, MembershipStatus.TERMINATED)).toBe(true)
    })
  })

  describe('invalid transitions', () => {
    it('PROSPECT → ACTIVE is invalid', () => {
      expect(isValidTransition(MembershipStatus.PROSPECT, MembershipStatus.ACTIVE)).toBe(false)
    })

    it('PROSPECT → APPROVED is invalid', () => {
      expect(isValidTransition(MembershipStatus.PROSPECT, MembershipStatus.APPROVED)).toBe(false)
    })

    it('TERMINATED → ACTIVE is invalid (terminal state)', () => {
      expect(isValidTransition(MembershipStatus.TERMINATED, MembershipStatus.ACTIVE)).toBe(false)
    })

    it('WITHDRAWN → PROSPECT is invalid (terminal state)', () => {
      expect(isValidTransition(MembershipStatus.WITHDRAWN, MembershipStatus.PROSPECT)).toBe(false)
    })

    it('APPROVED → SUSPENDED is invalid (must activate first)', () => {
      expect(isValidTransition(MembershipStatus.APPROVED, MembershipStatus.SUSPENDED)).toBe(false)
    })

    it('APPLICATION_SUBMITTED → APPROVED is invalid (must go through review)', () => {
      expect(isValidTransition(MembershipStatus.APPLICATION_SUBMITTED, MembershipStatus.APPROVED)).toBe(false)
    })
  })
})


describe('validateMembershipTransition', () => {
  it('returns valid for allowed transitions', () => {
    const result = validateMembershipTransition(MembershipStatus.PROSPECT, MembershipStatus.INVITED)
    expect(result).toEqual({ valid: true })
  })

  it('returns valid for same-status (no-op)', () => {
    const result = validateMembershipTransition(MembershipStatus.ACTIVE, MembershipStatus.ACTIVE)
    expect(result).toEqual({ valid: true })
  })

  it('returns error with Vietnamese message for invalid transition', () => {
    const result = validateMembershipTransition(MembershipStatus.PROSPECT, MembershipStatus.ACTIVE)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.message).toContain('Tiềm năng')
      expect(result.message).toContain('Hoạt động')
      expect(result.message).toContain('Các trạng thái hợp lệ')
    }
  })

  it('returns terminal state message for TERMINATED', () => {
    const result = validateMembershipTransition(MembershipStatus.TERMINATED, MembershipStatus.ACTIVE)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.message).toContain('trạng thái cuối')
      expect(result.message).toContain('không cho phép chuyển đổi')
    }
  })

  it('returns terminal state message for WITHDRAWN', () => {
    const result = validateMembershipTransition(MembershipStatus.WITHDRAWN, MembershipStatus.PROSPECT)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.message).toContain('trạng thái cuối')
    }
  })

  it('lists valid targets in error message', () => {
    const result = validateMembershipTransition(MembershipStatus.ACTIVE, MembershipStatus.APPROVED)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      // ACTIVE can go to PAYMENT_OVERDUE, SUSPENDED, TERMINATED, WITHDRAWN
      expect(result.message).toContain('Quá hạn phí')
      expect(result.message).toContain('Tạm ngưng')
      expect(result.message).toContain('Chấm dứt')
      expect(result.message).toContain('Rút lui')
    }
  })
})
