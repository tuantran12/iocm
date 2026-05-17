import { describe, it, expect } from 'vitest'
import { calculateAchievement } from './kpis'

describe('KPI Achievement Calculation', () => {
  describe('increase_is_good direction', () => {
    it('returns 100% when actual equals target', () => {
      expect(calculateAchievement(100, 100, 'increase_is_good')).toBe(100)
    })

    it('returns 50% when actual is half of target', () => {
      expect(calculateAchievement(100, 50, 'increase_is_good')).toBe(50)
    })

    it('returns 150% when actual exceeds target', () => {
      expect(calculateAchievement(100, 150, 'increase_is_good')).toBe(150)
    })

    it('returns 0% when actual is 0', () => {
      expect(calculateAchievement(100, 0, 'increase_is_good')).toBe(0)
    })
  })

  describe('decrease_is_good direction', () => {
    it('returns 100% when actual equals target', () => {
      expect(calculateAchievement(50, 50, 'decrease_is_good')).toBe(100)
    })

    it('returns 200% when actual is half of target (lower is better)', () => {
      expect(calculateAchievement(100, 50, 'decrease_is_good')).toBe(200)
    })

    it('returns 50% when actual is double the target', () => {
      expect(calculateAchievement(50, 100, 'decrease_is_good')).toBe(50)
    })

    it('returns Infinity when actual is 0 and target > 0', () => {
      expect(calculateAchievement(100, 0, 'decrease_is_good')).toBe(Infinity)
    })
  })

  describe('maintain direction', () => {
    it('returns 100% when actual equals target', () => {
      expect(calculateAchievement(100, 100, 'maintain')).toBe(100)
    })

    it('returns 90% when actual deviates 10% above target', () => {
      expect(calculateAchievement(100, 110, 'maintain')).toBe(90)
    })

    it('returns 90% when actual deviates 10% below target', () => {
      expect(calculateAchievement(100, 90, 'maintain')).toBe(90)
    })

    it('returns 50% when actual deviates 50% from target', () => {
      expect(calculateAchievement(100, 150, 'maintain')).toBe(50)
    })
  })

  describe('edge cases', () => {
    it('returns null when target is null', () => {
      expect(calculateAchievement(null, 50, 'increase_is_good')).toBeNull()
    })

    it('returns null when actual is null', () => {
      expect(calculateAchievement(100, null, 'increase_is_good')).toBeNull()
    })

    it('returns null when target is 0 (division by zero)', () => {
      expect(calculateAchievement(0, 50, 'increase_is_good')).toBeNull()
    })

    it('returns null when both are null', () => {
      expect(calculateAchievement(null, null, 'increase_is_good')).toBeNull()
    })

    it('returns null when target is undefined', () => {
      expect(calculateAchievement(undefined, 50, 'increase_is_good')).toBeNull()
    })

    it('defaults to increase_is_good for unknown direction', () => {
      expect(calculateAchievement(100, 75, 'unknown_direction')).toBe(75)
    })
  })
})
