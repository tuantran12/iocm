import { DocumentStatus } from '@prisma/client'

/**
 * Document Status Workflow — State Machine
 *
 * Valid transitions:
 *   NOT_STARTED → DRAFTING
 *   DRAFTING → NEEDS_INFO, IN_REVIEW
 *   NEEDS_INFO → DRAFTING, IN_REVIEW
 *   IN_REVIEW → DRAFTING (rejected), PENDING_APPROVAL
 *   PENDING_APPROVAL → APPROVED, DRAFTING (rejected)
 *   APPROVED → ARCHIVED, EXPIRED
 *   Any → ARCHIVED (by Director/System_Admin)
 */

export const VALID_TRANSITIONS: Record<DocumentStatus, DocumentStatus[]> = {
  [DocumentStatus.NOT_STARTED]: [DocumentStatus.DRAFTING],
  [DocumentStatus.DRAFTING]: [DocumentStatus.NEEDS_INFO, DocumentStatus.IN_REVIEW],
  [DocumentStatus.NEEDS_INFO]: [DocumentStatus.DRAFTING, DocumentStatus.IN_REVIEW],
  [DocumentStatus.IN_REVIEW]: [DocumentStatus.DRAFTING, DocumentStatus.PENDING_APPROVAL],
  [DocumentStatus.PENDING_APPROVAL]: [DocumentStatus.APPROVED, DocumentStatus.DRAFTING],
  [DocumentStatus.APPROVED]: [DocumentStatus.SIGNED, DocumentStatus.ARCHIVED, DocumentStatus.EXPIRED],
  [DocumentStatus.SIGNED]: [DocumentStatus.SUBMITTED, DocumentStatus.ARCHIVED],
  [DocumentStatus.SUBMITTED]: [DocumentStatus.SUPPLEMENT_REQUESTED, DocumentStatus.ACCEPTED, DocumentStatus.ARCHIVED],
  [DocumentStatus.SUPPLEMENT_REQUESTED]: [DocumentStatus.DRAFTING, DocumentStatus.SUBMITTED],
  [DocumentStatus.ACCEPTED]: [DocumentStatus.OFFICIAL_RECORD, DocumentStatus.ARCHIVED],
  [DocumentStatus.OFFICIAL_RECORD]: [DocumentStatus.AMENDED, DocumentStatus.SUPERSEDED, DocumentStatus.ARCHIVED],
  [DocumentStatus.AMENDED]: [DocumentStatus.OFFICIAL_RECORD, DocumentStatus.ARCHIVED],
  [DocumentStatus.SUPERSEDED]: [DocumentStatus.ARCHIVED],
  [DocumentStatus.ARCHIVED]: [],
  [DocumentStatus.EXPIRED]: [],
}

/** Roles that can force-archive any document regardless of current status */
export const ADMIN_ROLES = ['System_Admin', 'Director']

/**
 * Check if a status transition is valid.
 * Returns { valid: true } or { valid: false, message: string } with Vietnamese error.
 */
export function validateStatusTransition(
  currentStatus: DocumentStatus,
  newStatus: DocumentStatus,
  userRoles: string[] = []
): { valid: true } | { valid: false; message: string } {
  // Same status — no-op, allow
  if (currentStatus === newStatus) {
    return { valid: true }
  }

  // Admin can archive from any state
  const isAdmin = userRoles.some((role) => ADMIN_ROLES.includes(role))
  if (isAdmin && newStatus === DocumentStatus.ARCHIVED) {
    return { valid: true }
  }

  // Check valid transitions
  const allowedTargets = VALID_TRANSITIONS[currentStatus]
  if (allowedTargets.includes(newStatus)) {
    return { valid: true }
  }

  // Build Vietnamese error message
  const statusLabels: Record<DocumentStatus, string> = {
    [DocumentStatus.NOT_STARTED]: 'Chưa bắt đầu',
    [DocumentStatus.DRAFTING]: 'Đang soạn thảo',
    [DocumentStatus.NEEDS_INFO]: 'Cần bổ sung',
    [DocumentStatus.IN_REVIEW]: 'Đang xem xét',
    [DocumentStatus.PENDING_APPROVAL]: 'Chờ phê duyệt',
    [DocumentStatus.APPROVED]: 'Đã phê duyệt',
    [DocumentStatus.SIGNED]: 'Đã ký',
    [DocumentStatus.SUBMITTED]: 'Đã nộp',
    [DocumentStatus.SUPPLEMENT_REQUESTED]: 'Yêu cầu bổ sung',
    [DocumentStatus.ACCEPTED]: 'Được chấp nhận',
    [DocumentStatus.OFFICIAL_RECORD]: 'Bản chính thức',
    [DocumentStatus.AMENDED]: 'Đã sửa đổi',
    [DocumentStatus.SUPERSEDED]: 'Đã thay thế',
    [DocumentStatus.ARCHIVED]: 'Đã lưu trữ',
    [DocumentStatus.EXPIRED]: 'Hết hiệu lực',
  }

  const currentLabel = statusLabels[currentStatus]
  const newLabel = statusLabels[newStatus]
  const allowedLabels = allowedTargets.map((s) => statusLabels[s])

  let message: string
  if (allowedTargets.length === 0) {
    message = `Không thể chuyển trạng thái từ "${currentLabel}" sang "${newLabel}". Trạng thái "${currentLabel}" không cho phép chuyển đổi.`
  } else {
    message = `Không thể chuyển trạng thái từ "${currentLabel}" sang "${newLabel}". Các trạng thái hợp lệ: ${allowedLabels.join(', ')}.`
  }

  return { valid: false, message }
}
