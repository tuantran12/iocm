import { ProjectStatus } from '@prisma/client'

/**
 * Project Status Workflow — State Machine
 *
 * Valid transitions:
 *   PROPOSED → PLANNING, CANCELLED
 *   PLANNING → ACTIVE, CANCELLED
 *   ACTIVE → PAUSED, COMPLETED, CANCELLED
 *   PAUSED → ACTIVE, CANCELLED
 *   COMPLETED → CANCELLED
 *   CANCELLED → [] (terminal)
 */

export const VALID_PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  [ProjectStatus.PROPOSED]: [ProjectStatus.PLANNING, ProjectStatus.CANCELLED],
  [ProjectStatus.PLANNING]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.ACTIVE]: [ProjectStatus.PAUSED, ProjectStatus.COMPLETED, ProjectStatus.CANCELLED],
  [ProjectStatus.PAUSED]: [ProjectStatus.ACTIVE, ProjectStatus.CANCELLED],
  [ProjectStatus.COMPLETED]: [ProjectStatus.CANCELLED],
  [ProjectStatus.CANCELLED]: [],
}

/** Vietnamese labels for project statuses */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  [ProjectStatus.PROPOSED]: 'Đề xuất',
  [ProjectStatus.PLANNING]: 'Lập kế hoạch',
  [ProjectStatus.ACTIVE]: 'Đang triển khai',
  [ProjectStatus.PAUSED]: 'Tạm dừng',
  [ProjectStatus.COMPLETED]: 'Hoàn thành',
  [ProjectStatus.CANCELLED]: 'Đã đóng',
}

/** Roles that can force-cancel any project */
export const PROJECT_ADMIN_ROLES = ['System_Admin', 'Director']

/**
 * Validate project status transition.
 * Returns { valid: true } or { valid: false, message: string }.
 */
export function validateProjectStatusTransition(
  currentStatus: ProjectStatus,
  newStatus: ProjectStatus,
  userRoles: string[] = []
): { valid: true } | { valid: false; message: string } {
  // Same status — no-op
  if (currentStatus === newStatus) {
    return { valid: true }
  }

  // Admin can force-cancel from any non-terminal state
  const isAdmin = userRoles.some((role) => PROJECT_ADMIN_ROLES.includes(role))
  if (isAdmin && newStatus === ProjectStatus.CANCELLED && currentStatus !== ProjectStatus.CANCELLED) {
    return { valid: true }
  }

  // Check valid transitions
  const allowedTargets = VALID_PROJECT_TRANSITIONS[currentStatus]
  if (!allowedTargets.includes(newStatus)) {
    const currentLabel = PROJECT_STATUS_LABELS[currentStatus]
    const newLabel = PROJECT_STATUS_LABELS[newStatus]
    const allowedLabels = allowedTargets.map((s) => PROJECT_STATUS_LABELS[s])

    let message: string
    if (allowedTargets.length === 0) {
      message = `Không thể chuyển trạng thái từ "${currentLabel}" sang "${newLabel}". Trạng thái "${currentLabel}" là trạng thái cuối.`
    } else {
      message = `Không thể chuyển trạng thái từ "${currentLabel}" sang "${newLabel}". Các trạng thái hợp lệ: ${allowedLabels.join(', ')}.`
    }
    return { valid: false, message }
  }

  return { valid: true }
}
