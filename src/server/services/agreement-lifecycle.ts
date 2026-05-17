import { AgreementStatus } from '@prisma/client'

/**
 * Agreement Status Lifecycle — State Machine
 *
 * Valid transitions:
 *   DRAFT → LEGAL_REVIEW, NEGOTIATION
 *   LEGAL_REVIEW → DRAFT (rejected), NEGOTIATION, PENDING_SIGNATURE
 *   NEGOTIATION → DRAFT, LEGAL_REVIEW, PENDING_SIGNATURE
 *   PENDING_SIGNATURE → SIGNED, DRAFT (cancelled)
 *   SIGNED → ACTIVE
 *   ACTIVE → EXPIRING, TERMINATED, ARCHIVED
 *   EXPIRING → ACTIVE (renewed), EXPIRED, TERMINATED, ARCHIVED
 *   EXPIRED → ARCHIVED
 *   TERMINATED → ARCHIVED
 *   ARCHIVED → [] (terminal)
 */

export const VALID_AGREEMENT_TRANSITIONS: Record<AgreementStatus, AgreementStatus[]> = {
  [AgreementStatus.DRAFT]: [AgreementStatus.LEGAL_REVIEW, AgreementStatus.NEGOTIATION],
  [AgreementStatus.LEGAL_REVIEW]: [
    AgreementStatus.DRAFT,
    AgreementStatus.NEGOTIATION,
    AgreementStatus.PENDING_SIGNATURE,
  ],
  [AgreementStatus.NEGOTIATION]: [
    AgreementStatus.DRAFT,
    AgreementStatus.LEGAL_REVIEW,
    AgreementStatus.PENDING_SIGNATURE,
  ],
  [AgreementStatus.PENDING_SIGNATURE]: [AgreementStatus.SIGNED, AgreementStatus.DRAFT],
  [AgreementStatus.SIGNED]: [AgreementStatus.ACTIVE],
  [AgreementStatus.ACTIVE]: [
    AgreementStatus.EXPIRING,
    AgreementStatus.TERMINATED,
    AgreementStatus.ARCHIVED,
  ],
  [AgreementStatus.EXPIRING]: [
    AgreementStatus.ACTIVE,
    AgreementStatus.EXPIRED,
    AgreementStatus.TERMINATED,
    AgreementStatus.ARCHIVED,
  ],
  [AgreementStatus.EXPIRED]: [AgreementStatus.ARCHIVED],
  [AgreementStatus.TERMINATED]: [AgreementStatus.ARCHIVED],
  [AgreementStatus.ARCHIVED]: [],
}

/** Roles that can force-archive any agreement regardless of current status */
export const ADMIN_ROLES = ['System_Admin', 'Director']

/** Vietnamese labels for agreement statuses */
export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  [AgreementStatus.DRAFT]: 'Bản nháp',
  [AgreementStatus.LEGAL_REVIEW]: 'Xem xét pháp lý',
  [AgreementStatus.NEGOTIATION]: 'Đàm phán',
  [AgreementStatus.PENDING_SIGNATURE]: 'Chờ ký',
  [AgreementStatus.SIGNED]: 'Đã ký',
  [AgreementStatus.ACTIVE]: 'Hiệu lực',
  [AgreementStatus.EXPIRING]: 'Sắp hết hạn',
  [AgreementStatus.EXPIRED]: 'Hết hạn',
  [AgreementStatus.TERMINATED]: 'Chấm dứt',
  [AgreementStatus.ARCHIVED]: 'Lưu trữ',
}

/**
 * Validate an agreement status transition.
 * Returns { valid: true } or { valid: false, message: string } with Vietnamese error.
 */
export function validateAgreementTransition(
  currentStatus: AgreementStatus,
  newStatus: AgreementStatus,
  userRoles: string[] = []
): { valid: true } | { valid: false; message: string } {
  // Same status — no-op
  if (currentStatus === newStatus) {
    return { valid: true }
  }

  // Admin can archive from any state
  const isAdmin = userRoles.some((role) => ADMIN_ROLES.includes(role))
  if (isAdmin && newStatus === AgreementStatus.ARCHIVED) {
    return { valid: true }
  }

  // Check valid transitions
  const allowedTargets = VALID_AGREEMENT_TRANSITIONS[currentStatus]
  if (allowedTargets.includes(newStatus)) {
    return { valid: true }
  }

  const currentLabel = AGREEMENT_STATUS_LABELS[currentStatus]
  const newLabel = AGREEMENT_STATUS_LABELS[newStatus]
  const allowedLabels = allowedTargets.map((s) => AGREEMENT_STATUS_LABELS[s])

  let message: string
  if (allowedTargets.length === 0) {
    message = `Không thể chuyển trạng thái từ "${currentLabel}" sang "${newLabel}". Trạng thái "${currentLabel}" là trạng thái cuối cùng.`
  } else {
    message = `Không thể chuyển trạng thái từ "${currentLabel}" sang "${newLabel}". Các trạng thái hợp lệ: ${allowedLabels.join(', ')}.`
  }

  return { valid: false, message }
}
