import { describe, it, expect } from 'vitest'
import {
  calculateOverallScore,
  calculateRiskRating,
  SCORE_WEIGHTS,
} from './due-diligence-scoring'

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('due-diligence-scoring service', () => {
  describe('calculateOverallScore', () => {
    it('should return null when no scores are provided', () => {
      expect(calculateOverallScore({})).toBeNull()
      expect(calculateOverallScore({ legalScore: null, technicalScore: null })).toBeNull()
    })

    it('should calculate weighted average with all scores provided', () => {
      const result = calculateOverallScore({
        legalScore: 80,
        technicalScore: 70,
        securityScore: 90,
        dataScore: 60,
        aiScore: 50,
      })

      // Expected: (80*0.25 + 70*0.20 + 90*0.25 + 60*0.20 + 50*0.10) / 1.0
      // = (20 + 14 + 22.5 + 12 + 5) / 1.0 = 73.5 → 74 (rounded)
      expect(result).toBe(74)
    })

    it('should calculate weighted average with partial scores (normalize weights)', () => {
      // Only legal (0.25) and security (0.25) → totalWeight = 0.50
      const result = calculateOverallScore({
        legalScore: 80,
        securityScore: 60,
      })

      // (80*0.25 + 60*0.25) / 0.50 = (20 + 15) / 0.50 = 70
      expect(result).toBe(70)
    })

    it('should handle single score', () => {
      const result = calculateOverallScore({ legalScore: 85 })
      // 85*0.25 / 0.25 = 85
      expect(result).toBe(85)
    })

    it('should round to nearest integer', () => {
      // 75*0.25 + 82*0.20 = 18.75 + 16.4 = 35.15 / 0.45 = 78.11... → 78
      const result = calculateOverallScore({
        legalScore: 75,
        technicalScore: 82,
      })
      expect(result).toBe(78)
    })

    it('should handle all zeros', () => {
      const result = calculateOverallScore({
        legalScore: 0,
        technicalScore: 0,
        securityScore: 0,
        dataScore: 0,
        aiScore: 0,
      })
      expect(result).toBe(0)
    })

    it('should handle all 100s', () => {
      const result = calculateOverallScore({
        legalScore: 100,
        technicalScore: 100,
        securityScore: 100,
        dataScore: 100,
        aiScore: 100,
      })
      expect(result).toBe(100)
    })

    it('should skip undefined scores', () => {
      const result = calculateOverallScore({
        legalScore: 80,
        technicalScore: undefined,
        securityScore: 60,
        dataScore: null,
        aiScore: undefined,
      })
      // (80*0.25 + 60*0.25) / 0.50 = 70
      expect(result).toBe(70)
    })
  })

  describe('calculateRiskRating', () => {
    it('should return R1 for scores >= 80', () => {
      expect(calculateRiskRating(80)).toBe('R1')
      expect(calculateRiskRating(90)).toBe('R1')
      expect(calculateRiskRating(100)).toBe('R1')
    })

    it('should return R2 for scores >= 60 and < 80', () => {
      expect(calculateRiskRating(60)).toBe('R2')
      expect(calculateRiskRating(70)).toBe('R2')
      expect(calculateRiskRating(79)).toBe('R2')
    })

    it('should return R3 for scores >= 40 and < 60', () => {
      expect(calculateRiskRating(40)).toBe('R3')
      expect(calculateRiskRating(50)).toBe('R3')
      expect(calculateRiskRating(59)).toBe('R3')
    })

    it('should return R4 for scores >= 20 and < 40', () => {
      expect(calculateRiskRating(20)).toBe('R4')
      expect(calculateRiskRating(30)).toBe('R4')
      expect(calculateRiskRating(39)).toBe('R4')
    })

    it('should return R5 for scores < 20', () => {
      expect(calculateRiskRating(0)).toBe('R5')
      expect(calculateRiskRating(10)).toBe('R5')
      expect(calculateRiskRating(19)).toBe('R5')
    })

    it('should handle boundary values exactly', () => {
      expect(calculateRiskRating(80)).toBe('R1')
      expect(calculateRiskRating(79)).toBe('R2')
      expect(calculateRiskRating(60)).toBe('R2')
      expect(calculateRiskRating(59)).toBe('R3')
      expect(calculateRiskRating(40)).toBe('R3')
      expect(calculateRiskRating(39)).toBe('R4')
      expect(calculateRiskRating(20)).toBe('R4')
      expect(calculateRiskRating(19)).toBe('R5')
    })
  })

  describe('SCORE_WEIGHTS', () => {
    it('should sum to 1.0', () => {
      const total = Object.values(SCORE_WEIGHTS).reduce((sum, w) => sum + w, 0)
      expect(total).toBeCloseTo(1.0)
    })
  })
})
