import { ProductStatus } from '@prisma/client'

/**
 * Product Status Workflow — State Machine
 *
 * Valid transitions:
 *   PROPOSED → UNDER_REVIEW
 *   UNDER_REVIEW → APPROVED, PROPOSED (rejected back)
 *   APPROVED → PILOT_READY, SUSPENDED
 *   PILOT_READY → DEPLOYED, SUSPENDED
 *   DEPLOYED → SUSPENDED, RETIRED
 *   SUSPENDED → PROPOSED (re-submit), RETIRED
 *   RETIRED → [] (terminal)
 */

export const VALID_PRODUCT_TRANSITIONS: Record<ProductStatus, ProductStatus[]> = {
  [ProductStatus.PROPOSED]: [ProductStatus.UNDER_REVIEW],
  [ProductStatus.UNDER_REVIEW]: [ProductStatus.APPROVED, ProductStatus.PROPOSED],
  [ProductStatus.APPROVED]: [ProductStatus.PILOT_READY, ProductStatus.SUSPENDED],
  [ProductStatus.PILOT_READY]: [ProductStatus.DEPLOYED, ProductStatus.SUSPENDED],
  [ProductStatus.DEPLOYED]: [ProductStatus.SUSPENDED, ProductStatus.RETIRED],
  [ProductStatus.SUSPENDED]: [ProductStatus.PROPOSED, ProductStatus.RETIRED],
  [ProductStatus.RETIRED]: [],
}

/** Vietnamese labels for product statuses */
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  [ProductStatus.PROPOSED]: 'Đề xuất',
  [ProductStatus.UNDER_REVIEW]: 'Đang xem xét',
  [ProductStatus.APPROVED]: 'Đã duyệt',
  [ProductStatus.PILOT_READY]: 'Sẵn sàng pilot',
  [ProductStatus.DEPLOYED]: 'Đã triển khai',
  [ProductStatus.SUSPENDED]: 'Tạm ngưng',
  [ProductStatus.RETIRED]: 'Ngừng sử dụng',
}

/** Roles that can force-suspend or force-retire any product */
export const PRODUCT_ADMIN_ROLES = ['System_Admin', 'Director', 'Tech_Director']

/** Review status values */
export type ReviewStatus = 'not_reviewed' | 'in_review' | 'approved' | 'rejected'

/** Valid review status transitions */
export const VALID_REVIEW_TRANSITIONS: Record<ReviewStatus, ReviewStatus[]> = {
  not_reviewed: ['in_review'],
  in_review: ['approved', 'rejected'],
  approved: ['in_review'], // can re-review
  rejected: ['in_review'], // can re-review
}

/**
 * Check if all review gates pass (security, data, AI).
 * All must be 'approved' for product to move to APPROVED status.
 */
export function checkReviewGates(product: {
  securityStatus: string
  dataReviewStatus: string
  aiReviewStatus: string
  aiUsed: boolean
}): { passed: boolean; failures: string[] } {
  const failures: string[] = []

  if (product.securityStatus !== 'approved') {
    failures.push('Đánh giá bảo mật chưa được phê duyệt')
  }
  if (product.dataReviewStatus !== 'approved') {
    failures.push('Đánh giá dữ liệu chưa được phê duyệt')
  }
  // AI review only required if product uses AI
  if (product.aiUsed && product.aiReviewStatus !== 'approved') {
    failures.push('Đánh giá AI chưa được phê duyệt')
  }

  return { passed: failures.length === 0, failures }
}

/**
 * Validate product status transition.
 * Returns { valid: true } or { valid: false, message: string }.
 */
export function validateProductStatusTransition(
  currentStatus: ProductStatus,
  newStatus: ProductStatus,
  userRoles: string[] = [],
  reviewGates?: { securityStatus: string; dataReviewStatus: string; aiReviewStatus: string; aiUsed: boolean }
): { valid: true } | { valid: false; message: string } {
  // Same status — no-op
  if (currentStatus === newStatus) {
    return { valid: true }
  }

  // Admin can force-suspend or force-retire from any non-terminal state
  const isAdmin = userRoles.some((role) => PRODUCT_ADMIN_ROLES.includes(role))
  if (isAdmin && (newStatus === ProductStatus.SUSPENDED || newStatus === ProductStatus.RETIRED)) {
    if (currentStatus !== ProductStatus.RETIRED) {
      return { valid: true }
    }
  }

  // Check valid transitions
  const allowedTargets = VALID_PRODUCT_TRANSITIONS[currentStatus]
  if (!allowedTargets.includes(newStatus)) {
    const currentLabel = PRODUCT_STATUS_LABELS[currentStatus]
    const newLabel = PRODUCT_STATUS_LABELS[newStatus]
    const allowedLabels = allowedTargets.map((s) => PRODUCT_STATUS_LABELS[s])

    let message: string
    if (allowedTargets.length === 0) {
      message = `Không thể chuyển trạng thái từ "${currentLabel}" sang "${newLabel}". Trạng thái "${currentLabel}" là trạng thái cuối.`
    } else {
      message = `Không thể chuyển trạng thái từ "${currentLabel}" sang "${newLabel}". Các trạng thái hợp lệ: ${allowedLabels.join(', ')}.`
    }
    return { valid: false, message }
  }

  // Review gates check: moving to APPROVED requires all reviews passed
  if (newStatus === ProductStatus.APPROVED && reviewGates) {
    const gateResult = checkReviewGates(reviewGates)
    if (!gateResult.passed) {
      return {
        valid: false,
        message: `Không thể phê duyệt sản phẩm. ${gateResult.failures.join('; ')}.`,
      }
    }
  }

  return { valid: true }
}

/**
 * Validate review status transition.
 */
export function validateReviewStatusTransition(
  currentStatus: ReviewStatus,
  newStatus: ReviewStatus
): { valid: true } | { valid: false; message: string } {
  if (currentStatus === newStatus) {
    return { valid: true }
  }

  const allowed = VALID_REVIEW_TRANSITIONS[currentStatus]
  if (allowed.includes(newStatus)) {
    return { valid: true }
  }

  return {
    valid: false,
    message: `Không thể chuyển trạng thái đánh giá từ "${currentStatus}" sang "${newStatus}".`,
  }
}
