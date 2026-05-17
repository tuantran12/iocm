import { describe, it, expect } from 'vitest'
import {
  COMPLETENESS_QUESTIONS,
  calculateCompletenessScore,
  getMissingActions,
  canMarkAsOfficialRecord,
} from './completeness'

describe('COMPLETENESS_QUESTIONS', () => {
  it('should have exactly 8 questions', () => {
    expect(COMPLETENESS_QUESTIONS).toHaveLength(8)
  })

  it('should have keys Q1 through Q8', () => {
    const keys = COMPLETENESS_QUESTIONS.map((q) => q.key)
    expect(keys).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8'])
  })

  it('Q4 should be the only non-required question', () => {
    const nonRequired = COMPLETENESS_QUESTIONS.filter((q) => !q.required)
    expect(nonRequired).toHaveLength(1)
    expect(nonRequired[0]!.key).toBe('Q4')
  })
})

describe('calculateCompletenessScore', () => {
  it('should return 0 when all required checks are FAIL', () => {
    const checks = COMPLETENESS_QUESTIONS.map((q) => ({
      question: q.key,
      answer: 'FAIL',
      passed: false,
    }))
    expect(calculateCompletenessScore(checks)).toBe(0)
  })

  it('should return 1 when all required checks are PASS', () => {
    const checks = COMPLETENESS_QUESTIONS.map((q) => ({
      question: q.key,
      answer: 'PASS',
      passed: true,
    }))
    expect(calculateCompletenessScore(checks)).toBe(1)
  })

  it('should only count required questions (excludes Q4)', () => {
    // Q1-Q3 PASS (required), Q4 FAIL (not required, excluded), Q5-Q8 FAIL (required)
    // Score = 3 passed required / 7 total required = 3/7
    const checks = [
      { question: 'Q1', answer: 'PASS', passed: true },
      { question: 'Q2', answer: 'PASS', passed: true },
      { question: 'Q3', answer: 'PASS', passed: true },
      { question: 'Q4', answer: 'FAIL', passed: false }, // not required, excluded from score
      { question: 'Q5', answer: 'FAIL', passed: false },
      { question: 'Q6', answer: 'FAIL', passed: false },
      { question: 'Q7', answer: 'FAIL', passed: false },
      { question: 'Q8', answer: 'FAIL', passed: false },
    ]
    expect(calculateCompletenessScore(checks)).toBeCloseTo(3 / 7)
  })

  it('should exclude NOT_APPLICABLE from scoring', () => {
    // Q1-Q3 PASS (required), Q4 PASS (not required, excluded), Q5-Q6 FAIL (required), Q7-Q8 NOT_APPLICABLE (excluded)
    // Required questions counted: Q1,Q2,Q3,Q5,Q6 → 3 passed / 5 total = 3/5
    const checks = [
      { question: 'Q1', answer: 'PASS', passed: true },
      { question: 'Q2', answer: 'PASS', passed: true },
      { question: 'Q3', answer: 'PASS', passed: true },
      { question: 'Q4', answer: 'PASS', passed: true },
      { question: 'Q5', answer: 'FAIL', passed: false },
      { question: 'Q6', answer: 'FAIL', passed: false },
      { question: 'Q7', answer: 'NOT_APPLICABLE', passed: false },
      { question: 'Q8', answer: 'NOT_APPLICABLE', passed: false },
    ]
    expect(calculateCompletenessScore(checks)).toBeCloseTo(3 / 5)
  })

  it('should return 0 when all are NOT_APPLICABLE', () => {
    const checks = COMPLETENESS_QUESTIONS.map((q) => ({
      question: q.key,
      answer: 'NOT_APPLICABLE',
      passed: false,
    }))
    expect(calculateCompletenessScore(checks)).toBe(0)
  })

  it('should handle partial pass correctly (only required questions)', () => {
    // Q1-Q5 PASS, Q6-Q8 FAIL. Q4 is not required so excluded.
    // Required passed: Q1,Q2,Q3,Q5 = 4. Required total: Q1,Q2,Q3,Q5,Q6,Q7,Q8 = 7
    // Score = 4/7
    const checks = [
      { question: 'Q1', answer: 'PASS', passed: true },
      { question: 'Q2', answer: 'PASS', passed: true },
      { question: 'Q3', answer: 'PASS', passed: true },
      { question: 'Q4', answer: 'PASS', passed: true },
      { question: 'Q5', answer: 'PASS', passed: true },
      { question: 'Q6', answer: 'FAIL', passed: false },
      { question: 'Q7', answer: 'FAIL', passed: false },
      { question: 'Q8', answer: 'FAIL', passed: false },
    ]
    expect(calculateCompletenessScore(checks)).toBeCloseTo(4 / 7)
  })

  it('should return 0 when checks have null answers (uninitialized)', () => {
    const checks = COMPLETENESS_QUESTIONS.map((q) => ({
      question: q.key,
      answer: null,
      passed: false,
    }))
    // All required questions have null answers (not NOT_APPLICABLE), so they count
    // 0 passed / 7 required = 0
    expect(calculateCompletenessScore(checks)).toBe(0)
  })
})

describe('getMissingActions', () => {
  it('should return empty array when all checks pass', () => {
    const checks = COMPLETENESS_QUESTIONS.map((q) => ({
      question: q.key,
      answer: 'PASS',
      passed: true,
    }))
    expect(getMissingActions(checks)).toEqual([])
  })

  it('should return actions for failed checks', () => {
    const checks = [
      { question: 'Q1', answer: 'FAIL', passed: false },
      { question: 'Q2', answer: 'PASS', passed: true },
      { question: 'Q3', answer: 'FAIL', passed: false },
      { question: 'Q4', answer: 'PASS', passed: true },
      { question: 'Q5', answer: 'PASS', passed: true },
      { question: 'Q6', answer: 'PASS', passed: true },
      { question: 'Q7', answer: 'NOT_APPLICABLE', passed: false },
      { question: 'Q8', answer: 'PASS', passed: true },
    ]
    const actions = getMissingActions(checks)
    expect(actions).toHaveLength(2)
    expect(actions[0]!.key).toBe('Q1')
    expect(actions[0]!.action).toBe('Bổ sung nội dung bắt buộc còn thiếu')
    expect(actions[1]!.key).toBe('Q3')
    expect(actions[1]!.action).toBe('Gán người chịu trách nhiệm cho tài liệu')
  })

  it('should not include NOT_APPLICABLE in missing actions', () => {
    const checks = COMPLETENESS_QUESTIONS.map((q) => ({
      question: q.key,
      answer: 'NOT_APPLICABLE',
      passed: false,
    }))
    expect(getMissingActions(checks)).toEqual([])
  })
})

describe('canMarkAsOfficialRecord', () => {
  it('should allow when all required questions pass', () => {
    const checks = COMPLETENESS_QUESTIONS.map((q) => ({
      question: q.key,
      answer: 'PASS',
      passed: true,
    }))
    const result = canMarkAsOfficialRecord(checks)
    expect(result.allowed).toBe(true)
    expect(result.blockers).toEqual([])
  })

  it('should allow when required questions are PASS or NOT_APPLICABLE', () => {
    const checks = [
      { question: 'Q1', answer: 'PASS', passed: true },
      { question: 'Q2', answer: 'NOT_APPLICABLE', passed: false },
      { question: 'Q3', answer: 'PASS', passed: true },
      { question: 'Q4', answer: 'FAIL', passed: false }, // Q4 is not required
      { question: 'Q5', answer: 'PASS', passed: true },
      { question: 'Q6', answer: 'PASS', passed: true },
      { question: 'Q7', answer: 'NOT_APPLICABLE', passed: false },
      { question: 'Q8', answer: 'PASS', passed: true },
    ]
    const result = canMarkAsOfficialRecord(checks)
    expect(result.allowed).toBe(true)
    expect(result.blockers).toEqual([])
  })

  it('should block when a required question fails', () => {
    const checks = [
      { question: 'Q1', answer: 'PASS', passed: true },
      { question: 'Q2', answer: 'FAIL', passed: false }, // Required, FAIL → blocks
      { question: 'Q3', answer: 'PASS', passed: true },
      { question: 'Q4', answer: 'FAIL', passed: false }, // Not required
      { question: 'Q5', answer: 'PASS', passed: true },
      { question: 'Q6', answer: 'PASS', passed: true },
      { question: 'Q7', answer: 'PASS', passed: true },
      { question: 'Q8', answer: 'FAIL', passed: false }, // Required, FAIL → blocks
    ]
    const result = canMarkAsOfficialRecord(checks)
    expect(result.allowed).toBe(false)
    expect(result.blockers).toHaveLength(2)
    expect(result.blockers[0]).toContain('Q2')
    expect(result.blockers[1]).toContain('Q8')
  })

  it('should block when required questions have null answers (uninitialized)', () => {
    const checks = COMPLETENESS_QUESTIONS.map((q) => ({
      question: q.key,
      answer: null,
      passed: false,
    }))
    const result = canMarkAsOfficialRecord(checks)
    expect(result.allowed).toBe(false)
    // All 7 required questions should be blockers (Q4 is not required)
    expect(result.blockers).toHaveLength(7)
  })

  it('should not block for non-required Q4 even when FAIL', () => {
    const checks = [
      { question: 'Q1', answer: 'PASS', passed: true },
      { question: 'Q2', answer: 'PASS', passed: true },
      { question: 'Q3', answer: 'PASS', passed: true },
      { question: 'Q4', answer: 'FAIL', passed: false }, // Not required
      { question: 'Q5', answer: 'PASS', passed: true },
      { question: 'Q6', answer: 'PASS', passed: true },
      { question: 'Q7', answer: 'PASS', passed: true },
      { question: 'Q8', answer: 'PASS', passed: true },
    ]
    const result = canMarkAsOfficialRecord(checks)
    expect(result.allowed).toBe(true)
  })
})
