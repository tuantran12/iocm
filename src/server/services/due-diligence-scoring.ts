import { type RiskRating } from '@prisma/client'

/**
 * Weights for due diligence scoring categories.
 * Total = 1.0 (100%)
 *
 * - Legal: 25% — compliance with Vietnamese law
 * - Technical: 20% — technical capability
 * - Security: 25% — information security posture
 * - Data: 20% — data protection & privacy
 * - AI: 10% — AI governance (if applicable)
 */
export const SCORE_WEIGHTS = {
  legal: 0.25,
  technical: 0.20,
  security: 0.25,
  data: 0.20,
  ai: 0.10,
} as const

export interface DueDiligenceScores {
  legalScore?: number | null
  technicalScore?: number | null
  securityScore?: number | null
  dataScore?: number | null
  aiScore?: number | null
}

/**
 * Calculate overall due diligence score from individual category scores.
 * Uses weighted average of available scores (skips null/undefined categories).
 * Returns null if no scores are provided.
 */
export function calculateOverallScore(scores: DueDiligenceScores): number | null {
  const entries: { score: number; weight: number }[] = []

  if (scores.legalScore != null) {
    entries.push({ score: scores.legalScore, weight: SCORE_WEIGHTS.legal })
  }
  if (scores.technicalScore != null) {
    entries.push({ score: scores.technicalScore, weight: SCORE_WEIGHTS.technical })
  }
  if (scores.securityScore != null) {
    entries.push({ score: scores.securityScore, weight: SCORE_WEIGHTS.security })
  }
  if (scores.dataScore != null) {
    entries.push({ score: scores.dataScore, weight: SCORE_WEIGHTS.data })
  }
  if (scores.aiScore != null) {
    entries.push({ score: scores.aiScore, weight: SCORE_WEIGHTS.ai })
  }

  if (entries.length === 0) return null

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0)
  const weightedSum = entries.reduce((sum, e) => sum + e.score * e.weight, 0)

  return Math.round(weightedSum / totalWeight)
}

/**
 * Calculate risk rating (R1-R5) based on overall score.
 *
 * - R1 (Very Low Risk): overallScore >= 80
 * - R2 (Low Risk): overallScore >= 60
 * - R3 (Medium Risk): overallScore >= 40
 * - R4 (High Risk): overallScore >= 20
 * - R5 (Very High Risk): overallScore < 20
 */
export function calculateRiskRating(overallScore: number): RiskRating {
  if (overallScore >= 80) return 'R1'
  if (overallScore >= 60) return 'R2'
  if (overallScore >= 40) return 'R3'
  if (overallScore >= 20) return 'R4'
  return 'R5'
}
