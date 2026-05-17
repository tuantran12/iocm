import { describe, it, expect } from 'vitest'
import {
  updateObligationStatus,
  checkOverdueObligations,
  markOverdueObligations,
  type Obligation,
} from './obligation-tracking'

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function makeObligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 'obl-1',
    title: 'Nghĩa vụ test',
    status: 'PENDING',
    deadline: null,
    completedAt: null,
    ...overrides,
  }
}

describe('obligation-tracking', () => {
  describe('updateObligationStatus', () => {
    it('should update obligation status by ID', () => {
      const obligations = [
        makeObligation({ id: 'obl-1', status: 'PENDING' }),
        makeObligation({ id: 'obl-2', status: 'IN_PROGRESS' }),
      ]

      const result = updateObligationStatus(obligations, 'obl-1', 'IN_PROGRESS')

      expect(result[0]!.status).toBe('IN_PROGRESS')
      expect(result[1]!.status).toBe('IN_PROGRESS') // unchanged
    })

    it('should set completedAt when status is COMPLETED', () => {
      const obligations = [makeObligation({ id: 'obl-1', status: 'IN_PROGRESS' })]

      const result = updateObligationStatus(obligations, 'obl-1', 'COMPLETED')

      expect(result[0]!.status).toBe('COMPLETED')
      expect(result[0]!.completedAt).toBeInstanceOf(Date)
    })

    it('should not set completedAt for non-COMPLETED status', () => {
      const obligations = [makeObligation({ id: 'obl-1', status: 'PENDING' })]

      const result = updateObligationStatus(obligations, 'obl-1', 'IN_PROGRESS')

      expect(result[0]!.completedAt).toBeNull()
    })

    it('should update notes when provided', () => {
      const obligations = [makeObligation({ id: 'obl-1' })]

      const result = updateObligationStatus(obligations, 'obl-1', 'IN_PROGRESS', 'Đang xử lý')

      expect(result[0]!.notes).toBe('Đang xử lý')
    })

    it('should throw when obligation ID not found', () => {
      const obligations = [makeObligation({ id: 'obl-1' })]

      expect(() => updateObligationStatus(obligations, 'nonexistent', 'COMPLETED'))
        .toThrow('Nghĩa vụ với ID "nonexistent" không tồn tại.')
    })

    it('should not mutate original array', () => {
      const obligations = [makeObligation({ id: 'obl-1', status: 'PENDING' })]
      const original = [...obligations]

      updateObligationStatus(obligations, 'obl-1', 'COMPLETED')

      expect(obligations[0]!.status).toBe('PENDING')
      expect(obligations).toEqual(original)
    })
  })

  describe('checkOverdueObligations', () => {
    it('should return obligations with past deadline and PENDING/IN_PROGRESS status', () => {
      const obligations = [
        makeObligation({ id: 'obl-1', status: 'PENDING', deadline: daysAgo(5) }),
        makeObligation({ id: 'obl-2', status: 'IN_PROGRESS', deadline: daysAgo(2) }),
        makeObligation({ id: 'obl-3', status: 'COMPLETED', deadline: daysAgo(10) }),
        makeObligation({ id: 'obl-4', status: 'PENDING', deadline: daysFromNow(10) }),
      ]

      const overdue = checkOverdueObligations(obligations)

      expect(overdue).toHaveLength(2)
      expect(overdue.map((o) => o.id)).toEqual(['obl-1', 'obl-2'])
    })

    it('should return empty array when no obligations are overdue', () => {
      const obligations = [
        makeObligation({ id: 'obl-1', status: 'PENDING', deadline: daysFromNow(30) }),
        makeObligation({ id: 'obl-2', status: 'COMPLETED', deadline: daysAgo(5) }),
      ]

      const overdue = checkOverdueObligations(obligations)

      expect(overdue).toHaveLength(0)
    })

    it('should ignore obligations without deadline', () => {
      const obligations = [
        makeObligation({ id: 'obl-1', status: 'PENDING', deadline: null }),
      ]

      const overdue = checkOverdueObligations(obligations)

      expect(overdue).toHaveLength(0)
    })
  })

  describe('markOverdueObligations', () => {
    it('should mark overdue obligations as OVERDUE', () => {
      const obligations = [
        makeObligation({ id: 'obl-1', status: 'PENDING', deadline: daysAgo(5) }),
        makeObligation({ id: 'obl-2', status: 'IN_PROGRESS', deadline: daysAgo(2) }),
        makeObligation({ id: 'obl-3', status: 'COMPLETED', deadline: daysAgo(10) }),
      ]

      const result = markOverdueObligations(obligations)

      expect(result[0]!.status).toBe('OVERDUE')
      expect(result[1]!.status).toBe('OVERDUE')
      expect(result[2]!.status).toBe('COMPLETED') // not changed
    })

    it('should not change already OVERDUE obligations', () => {
      const obligations = [
        makeObligation({ id: 'obl-1', status: 'OVERDUE', deadline: daysAgo(5) }),
      ]

      const result = markOverdueObligations(obligations)

      expect(result[0]!.status).toBe('OVERDUE')
    })

    it('should not change obligations with future deadline', () => {
      const obligations = [
        makeObligation({ id: 'obl-1', status: 'PENDING', deadline: daysFromNow(10) }),
      ]

      const result = markOverdueObligations(obligations)

      expect(result[0]!.status).toBe('PENDING')
    })
  })
})
