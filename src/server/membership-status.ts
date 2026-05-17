import { MembershipStatus } from '@prisma/client'

/**
 * Membership Status State Machine
 *
 * Valid transitions:
 *   PROSPECT → INVITED, APPLICATION_SUBMITTED
 *   INVITED → APPLICATION_SUBMITTED
 *   APPLICATION_SUBMITTED → UNDER_REVIEW
 *   UNDER_REVIEW → APPROVED, APPLICATION_SUBMITTED (request more info), TERMINATED (reject)
 *   APPROVED → ACTIVE (requires fee paid)
 *   ACTIVE → PAYMENT_OVERDUE, SUSPENDED, TERMINATED, WITHDRAWN
 *   PAYMENT_OVERDUE → ACTIVE (fee paid), SUSPENDED
 *   SUSPENDED → ACTIVE (reinstated), TERMINATED
 *   TERMINATED → [] (terminal)
 *   WITHDRAWN → [] (terminal)
 */

export const VALID_STATUS_TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  [MembershipStatus.PROSPECT]: [MembershipStatus.INVITED, MembershipStatus.APPLICATION_SUBMITTED],
  [MembershipStatus.INVITED]: [MembershipStatus.APPLICATION_SUBMITTED],
  [MembershipStatus.APPLICATION_SUBMITTED]: [MembershipStatus.UNDER_REVIEW],
  [MembershipStatus.UNDER_REVIEW]: [
    MembershipStatus.APPROVED,
    MembershipStatus.APPLICATION_SUBMITTED,
    MembershipStatus.TERMINATED,
  ],
  [MembershipStatus.APPROVED]: [MembershipStatus.ACTIVE],
  [MembershipStatus.ACTIVE]: [
    MembershipStatus.PAYMENT_OVERDUE,
    MembershipStatus.SUSPENDED,
    MembershipStatus.TERMINATED,
    MembershipStatus.WITHDRAWN,
  ],
  [MembershipStatus.PAYMENT_OVERDUE]: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED],
  [MembershipStatus.SUSPENDED]: [MembershipStatus.ACTIVE, MembershipStatus.TERMINATED],
  [MembershipStatus.TERMINATED]: [],
  [MembershipStatus.WITHDRAWN]: [],
}

/** Terminal states — no outgoing transitions allowed */
export const TERMINAL_STATES: MembershipStatus[] = [
  MembershipStatus.TERMINATED,
  MembershipStatus.WITHDRAWN,
]

/** Vietnamese labels for membership statuses */
export const STATUS_LABELS: Record<MembershipStatus, string> = {
  [MembershipStatus.PROSPECT]: 'Tiềm năng',
  [MembershipStatus.INVITED]: 'Đã mời',
  [MembershipStatus.APPLICATION_SUBMITTED]: 'Đã nộp đơn',
  [MembershipStatus.UNDER_REVIEW]: 'Đang xem xét',
  [MembershipStatus.APPROVED]: 'Đã phê duyệt',
  [MembershipStatus.ACTIVE]: 'Hoạt động',
  [MembershipStatus.PAYMENT_OVERDUE]: 'Quá hạn phí',
  [MembershipStatus.SUSPENDED]: 'Tạm ngưng',
  [MembershipStatus.TERMINATED]: 'Chấm dứt',
  [MembershipStatus.WITHDRAWN]: 'Rút lui',
}


/**
 * Check if a membership status transition is valid.
 * Returns { valid: true } or { valid: false, message: string } with Vietnamese error.
 */
export function isValidTransition(from: MembershipStatus, to: MembershipStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Validate a membership status transition with detailed Vietnamese error message.
 */
export function validateMembershipTransition(
  currentStatus: MembershipStatus,
  newStatus: MembershipStatus
): { valid: true } | { valid: false; message: string } {
  // Same status — no-op, allow
  if (currentStatus === newStatus) {
    return { valid: true }
  }

  if (isValidTransition(currentStatus, newStatus)) {
    return { valid: true }
  }

  const currentLabel = STATUS_LABELS[currentStatus]
  const newLabel = STATUS_LABELS[newStatus]
  const allowedTargets = VALID_STATUS_TRANSITIONS[currentStatus]
  const allowedLabels = allowedTargets.map((s) => STATUS_LABELS[s])

  let message: string
  if (allowedTargets.length === 0) {
    message = `Không thể chuyển trạng thái từ "${currentLabel}" sang "${newLabel}". Trạng thái "${currentLabel}" là trạng thái cuối, không cho phép chuyển đổi.`
  } else {
    message = `Không thể chuyển trạng thái từ "${currentLabel}" sang "${newLabel}". Các trạng thái hợp lệ: ${allowedLabels.join(', ')}.`
  }

  return { valid: false, message }
}
