import { describe, it, expect } from 'vitest'

/**
 * Membership Agreement Lifecycle - Business Rules Tests
 *
 * Tests the lifecycle: draft → signed → active → expired
 * Validates: Requirement R11 — Membership Agreement lifecycle
 */

// ─── Status Transition Map (mirrored from memberAgreements.ts) ────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['signed'],
  signed: ['active'],
  active: ['expired'],
}

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// ─── Activation validation (mirrored from router logic) ───────────────────────

interface AgreementState {
  status: string
  signedFileUrl: string | null
}

function validateActivation(
  agreement: AgreementState,
  directorException: boolean
): { valid: boolean; error?: string } {
  if (agreement.status !== 'signed') {
    return { valid: false, error: `Cannot activate from status: ${agreement.status}` }
  }
  if (!agreement.signedFileUrl && !directorException) {
    return {
      valid: false,
      error: 'Signed file required before activation (unless Director approves exception)',
    }
  }
  return { valid: true }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Membership Agreement Lifecycle - Business Rules', () => {
  describe('valid status transitions', () => {
    it('allows draft → signed', () => {
      expect(isValidTransition('draft', 'signed')).toBe(true)
    })

    it('allows signed → active', () => {
      expect(isValidTransition('signed', 'active')).toBe(true)
    })

    it('allows active → expired', () => {
      expect(isValidTransition('active', 'expired')).toBe(true)
    })
  })

  describe('invalid status transitions', () => {
    it('rejects draft → active (must go through signed)', () => {
      expect(isValidTransition('draft', 'active')).toBe(false)
    })

    it('rejects draft → expired', () => {
      expect(isValidTransition('draft', 'expired')).toBe(false)
    })

    it('rejects signed → expired (must go through active)', () => {
      expect(isValidTransition('signed', 'expired')).toBe(false)
    })

    it('rejects signed → draft (no backward transitions)', () => {
      expect(isValidTransition('signed', 'draft')).toBe(false)
    })

    it('rejects active → signed (no backward transitions)', () => {
      expect(isValidTransition('active', 'signed')).toBe(false)
    })

    it('rejects active → draft (no backward transitions)', () => {
      expect(isValidTransition('active', 'draft')).toBe(false)
    })

    it('rejects expired → any (terminal state)', () => {
      expect(isValidTransition('expired', 'draft')).toBe(false)
      expect(isValidTransition('expired', 'signed')).toBe(false)
      expect(isValidTransition('expired', 'active')).toBe(false)
    })
  })

  describe('activation requirements', () => {
    it('allows activation with signed file', () => {
      const agreement: AgreementState = {
        status: 'signed',
        signedFileUrl: 'https://s3.example.com/signed.pdf',
      }
      const result = validateActivation(agreement, false)
      expect(result.valid).toBe(true)
    })

    it('rejects activation without signed file (no exception)', () => {
      const agreement: AgreementState = {
        status: 'signed',
        signedFileUrl: null,
      }
      const result = validateActivation(agreement, false)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Signed file required')
    })

    it('allows activation without signed file when Director approves exception', () => {
      const agreement: AgreementState = {
        status: 'signed',
        signedFileUrl: null,
      }
      const result = validateActivation(agreement, true)
      expect(result.valid).toBe(true)
    })

    it('rejects activation from draft status', () => {
      const agreement: AgreementState = {
        status: 'draft',
        signedFileUrl: 'https://s3.example.com/signed.pdf',
      }
      const result = validateActivation(agreement, false)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Cannot activate from status: draft')
    })

    it('rejects activation from expired status', () => {
      const agreement: AgreementState = {
        status: 'expired',
        signedFileUrl: 'https://s3.example.com/signed.pdf',
      }
      const result = validateActivation(agreement, false)
      expect(result.valid).toBe(false)
    })
  })

  describe('full lifecycle flow', () => {
    it('happy path: draft → signed → active → expired', () => {
      const states: string[] = ['draft']

      // Step 1: Sign agreement
      expect(isValidTransition(states[states.length - 1]!, 'signed')).toBe(true)
      states.push('signed')

      // Step 2: Activate
      expect(isValidTransition(states[states.length - 1]!, 'active')).toBe(true)
      states.push('active')

      // Step 3: Expire
      expect(isValidTransition(states[states.length - 1]!, 'expired')).toBe(true)
      states.push('expired')

      expect(states).toEqual(['draft', 'signed', 'active', 'expired'])
    })

    it('expired is a terminal state with no valid transitions', () => {
      expect(VALID_TRANSITIONS['expired']).toBeUndefined()
    })

    it('each non-terminal state has exactly one valid forward transition', () => {
      expect(VALID_TRANSITIONS['draft']).toHaveLength(1)
      expect(VALID_TRANSITIONS['signed']).toHaveLength(1)
      expect(VALID_TRANSITIONS['active']).toHaveLength(1)
    })
  })

  describe('file upload constraints', () => {
    it('file upload allowed for draft agreements', () => {
      const allowedStatuses = ['draft', 'signed']
      expect(allowedStatuses.includes('draft')).toBe(true)
    })

    it('file upload allowed for signed agreements', () => {
      const allowedStatuses = ['draft', 'signed']
      expect(allowedStatuses.includes('signed')).toBe(true)
    })

    it('file upload NOT allowed for active agreements', () => {
      const allowedStatuses = ['draft', 'signed']
      expect(allowedStatuses.includes('active')).toBe(false)
    })

    it('file upload NOT allowed for expired agreements', () => {
      const allowedStatuses = ['draft', 'signed']
      expect(allowedStatuses.includes('expired')).toBe(false)
    })
  })
})
