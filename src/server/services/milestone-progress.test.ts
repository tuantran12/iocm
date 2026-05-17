import { describe, it, expect } from 'vitest'
import { TaskStatus } from '@prisma/client'
import {
  calculateMilestoneProgress,
  type MilestoneForProgress,
} from './milestone-progress'

/**
 * Milestone Progress Calculation - Unit Tests
 *
 * Validates: Task 14.4 (milestone tracking, progress calculation, overdue detection)
 */

describe('calculateMilestoneProgress', () => {
  const now = new Date('2025-06-01T00:00:00Z')

  describe('empty milestones', () => {
    it('returns zeros when no milestones exist', () => {
      const result = calculateMilestoneProgress([], now)
      expect(result).toEqual({
        total: 0,
        completed: 0,
        overdue: 0,
        percentage: 0,
      })
    })
  })

  describe('completed milestones', () => {
    it('counts DONE milestones as completed', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.DONE, dueDate: new Date('2025-05-01') },
        { id: '2', status: TaskStatus.DONE, dueDate: new Date('2025-05-15') },
        { id: '3', status: TaskStatus.OPEN, dueDate: new Date('2025-07-01') },
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.total).toBe(3)
      expect(result.completed).toBe(2)
      expect(result.percentage).toBe(67) // Math.round(2/3 * 100)
    })

    it('returns 100% when all milestones are DONE', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.DONE, dueDate: new Date('2025-05-01') },
        { id: '2', status: TaskStatus.DONE, dueDate: new Date('2025-05-15') },
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.percentage).toBe(100)
      expect(result.completed).toBe(2)
    })

    it('does not count CANCELLED as completed', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.DONE, dueDate: null },
        { id: '2', status: TaskStatus.CANCELLED, dueDate: null },
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.completed).toBe(1)
      expect(result.percentage).toBe(50)
    })
  })

  describe('overdue detection', () => {
    it('detects overdue milestones (dueDate < now and not DONE/CANCELLED)', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.OPEN, dueDate: new Date('2025-05-01') }, // overdue
        { id: '2', status: TaskStatus.IN_PROGRESS, dueDate: new Date('2025-05-20') }, // overdue
        { id: '3', status: TaskStatus.OPEN, dueDate: new Date('2025-07-01') }, // not overdue (future)
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.overdue).toBe(2)
    })

    it('does not count DONE milestones as overdue even if past due', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.DONE, dueDate: new Date('2025-04-01') }, // past due but DONE
        { id: '2', status: TaskStatus.OPEN, dueDate: new Date('2025-04-15') }, // overdue
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.overdue).toBe(1)
    })

    it('does not count CANCELLED milestones as overdue', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.CANCELLED, dueDate: new Date('2025-04-01') },
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.overdue).toBe(0)
    })

    it('does not count milestones without dueDate as overdue', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.OPEN, dueDate: null },
        { id: '2', status: TaskStatus.IN_PROGRESS, dueDate: null },
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.overdue).toBe(0)
    })

    it('counts BLOCKED milestones as overdue if past due', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.BLOCKED, dueDate: new Date('2025-05-15') },
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.overdue).toBe(1)
    })

    it('counts IN_REVIEW milestones as overdue if past due', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.IN_REVIEW, dueDate: new Date('2025-05-15') },
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.overdue).toBe(1)
    })
  })

  describe('percentage calculation', () => {
    it('rounds percentage to nearest integer', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.DONE, dueDate: null },
        { id: '2', status: TaskStatus.OPEN, dueDate: null },
        { id: '3', status: TaskStatus.OPEN, dueDate: null },
      ]

      // 1/3 = 33.33... → rounds to 33
      const result = calculateMilestoneProgress(milestones, now)
      expect(result.percentage).toBe(33)
    })

    it('returns 0% when no milestones are completed', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.OPEN, dueDate: null },
        { id: '2', status: TaskStatus.IN_PROGRESS, dueDate: null },
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.percentage).toBe(0)
    })
  })

  describe('mixed scenarios', () => {
    it('handles a realistic project with mixed milestone states', () => {
      const milestones: MilestoneForProgress[] = [
        { id: '1', status: TaskStatus.DONE, dueDate: new Date('2025-03-01') },
        { id: '2', status: TaskStatus.DONE, dueDate: new Date('2025-04-01') },
        { id: '3', status: TaskStatus.IN_PROGRESS, dueDate: new Date('2025-05-15') }, // overdue
        { id: '4', status: TaskStatus.OPEN, dueDate: new Date('2025-07-01') }, // future
        { id: '5', status: TaskStatus.CANCELLED, dueDate: new Date('2025-04-15') }, // cancelled, not overdue
      ]

      const result = calculateMilestoneProgress(milestones, now)
      expect(result.total).toBe(5)
      expect(result.completed).toBe(2)
      expect(result.overdue).toBe(1)
      expect(result.percentage).toBe(40) // 2/5 = 40%
    })
  })
})
