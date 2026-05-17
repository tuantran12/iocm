/**
 * Completeness Check — 8 predefined questions for document quality assessment.
 * Requirement R04: Document Completeness Check
 */

export type CheckAnswer = 'PASS' | 'FAIL' | 'NOT_APPLICABLE'

export interface CompletenessQuestion {
  key: string
  question: string
  /** If true, this question blocks marking document as official_record when FAIL */
  required: boolean
  /** Suggested action when the question is FAIL */
  missingAction: string
}

/**
 * The 8 completeness questions per R04.
 */
export const COMPLETENESS_QUESTIONS: CompletenessQuestion[] = [
  {
    key: 'Q1',
    question: 'Nội dung bắt buộc đã đủ chưa?',
    required: true,
    missingAction: 'Bổ sung nội dung bắt buộc còn thiếu',
  },
  {
    key: 'Q2',
    question: 'Căn cứ pháp lý hoặc căn cứ nội bộ đã liên kết chưa?',
    required: true,
    missingAction: 'Liên kết căn cứ pháp lý hoặc căn cứ nội bộ',
  },
  {
    key: 'Q3',
    question: 'Người chịu trách nhiệm đã được gán chưa?',
    required: true,
    missingAction: 'Gán người chịu trách nhiệm cho tài liệu',
  },
  {
    key: 'Q4',
    question: 'Tài liệu hỗ trợ đã đính kèm chưa?',
    required: false,
    missingAction: 'Đính kèm tài liệu hỗ trợ liên quan',
  },
  {
    key: 'Q5',
    question: 'Format/template đã đúng chưa?',
    required: true,
    missingAction: 'Điều chỉnh format/template theo quy định',
  },
  {
    key: 'Q6',
    question: 'Đã được review chưa?',
    required: true,
    missingAction: 'Gửi tài liệu để review',
  },
  {
    key: 'Q7',
    question: 'Đã được phê duyệt/ký chưa nếu cần?',
    required: true,
    missingAction: 'Trình phê duyệt hoặc ký tài liệu',
  },
  {
    key: 'Q8',
    question: 'Tài liệu có còn hiệu lực không?',
    required: true,
    missingAction: 'Kiểm tra và cập nhật hiệu lực tài liệu',
  },
]

/**
 * Calculate completeness score from check records.
 * Score = passed_required_questions / total_required_questions
 * Only questions marked as `required` in COMPLETENESS_QUESTIONS are counted.
 * NOT_APPLICABLE answers on required questions are excluded from both numerator and denominator.
 */
export function calculateCompletenessScore(
  checks: Array<{ question: string; answer: string | null; passed: boolean }>
): number {
  let totalRequired = 0
  let passedRequired = 0

  for (const check of checks) {
    const questionDef = COMPLETENESS_QUESTIONS.find((q) => q.key === check.question)
    if (!questionDef) continue

    // Only count required questions in the score
    if (!questionDef.required) continue

    // NOT_APPLICABLE answers are excluded from scoring
    if (check.answer === 'NOT_APPLICABLE') continue

    totalRequired++
    if (check.passed) {
      passedRequired++
    }
  }

  if (totalRequired === 0) return 0
  return passedRequired / totalRequired
}

/**
 * Get missing actions for failed questions.
 */
export function getMissingActions(
  checks: Array<{ question: string; answer: string | null; passed: boolean }>
): Array<{ key: string; question: string; action: string }> {
  const missing: Array<{ key: string; question: string; action: string }> = []

  for (const check of checks) {
    if (check.answer === 'NOT_APPLICABLE') continue
    if (check.passed) continue

    const questionDef = COMPLETENESS_QUESTIONS.find((q) => q.key === check.question)
    if (!questionDef) continue

    missing.push({
      key: questionDef.key,
      question: questionDef.question,
      action: questionDef.missingAction,
    })
  }

  return missing
}

/**
 * Check if a document can be marked as official_record.
 * All required questions must be PASS (not FAIL).
 * NOT_APPLICABLE is acceptable for required questions.
 */
export function canMarkAsOfficialRecord(
  checks: Array<{ question: string; answer: string | null; passed: boolean }>
): { allowed: boolean; blockers: string[] } {
  const blockers: string[] = []

  for (const check of checks) {
    const questionDef = COMPLETENESS_QUESTIONS.find((q) => q.key === check.question)
    if (!questionDef || !questionDef.required) continue

    // NOT_APPLICABLE is acceptable
    if (check.answer === 'NOT_APPLICABLE') continue

    // Required question that is not passed blocks official_record
    if (!check.passed) {
      blockers.push(`${questionDef.key}: ${questionDef.question}`)
    }
  }

  return { allowed: blockers.length === 0, blockers }
}
