/**
 * Pilot Deployment Status Workflow — State Machine
 *
 * Valid transitions:
 *   planning → deploying, cancelled
 *   deploying → active, cancelled
 *   active → completed, cancelled
 *   completed → [] (terminal)
 *   cancelled → [] (terminal)
 */

export type PilotStatus = 'planning' | 'deploying' | 'active' | 'completed' | 'cancelled'

export const PILOT_STATUSES: PilotStatus[] = [
  'planning',
  'deploying',
  'active',
  'completed',
  'cancelled',
]

export const VALID_PILOT_TRANSITIONS: Record<PilotStatus, PilotStatus[]> = {
  planning: ['deploying', 'cancelled'],
  deploying: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

/** Vietnamese labels for pilot statuses */
export const PILOT_STATUS_LABELS: Record<PilotStatus, string> = {
  planning: 'Lập kế hoạch',
  deploying: 'Đang triển khai',
  active: 'Hoạt động',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

/** Roles that can force-cancel any pilot */
export const PILOT_ADMIN_ROLES = ['System_Admin', 'Director']

/**
 * Validate pilot status transition.
 * Returns { valid: true } or { valid: false, message: string }.
 */
export function validatePilotStatusTransition(
  currentStatus: string,
  newStatus: string,
  userRoles: string[] = []
): { valid: true } | { valid: false; message: string } {
  // Validate that both statuses are known
  if (!PILOT_STATUSES.includes(currentStatus as PilotStatus)) {
    return { valid: false, message: `Trạng thái hiện tại "${currentStatus}" không hợp lệ.` }
  }
  if (!PILOT_STATUSES.includes(newStatus as PilotStatus)) {
    return { valid: false, message: `Trạng thái mới "${newStatus}" không hợp lệ.` }
  }

  const current = currentStatus as PilotStatus
  const next = newStatus as PilotStatus

  // Same status — no-op
  if (current === next) {
    return { valid: true }
  }

  // Admin can force-cancel from any non-terminal state
  const isAdmin = userRoles.some((role) => PILOT_ADMIN_ROLES.includes(role))
  if (isAdmin && next === 'cancelled' && current !== 'cancelled' && current !== 'completed') {
    return { valid: true }
  }

  // Check valid transitions
  const allowedTargets = VALID_PILOT_TRANSITIONS[current]
  if (!allowedTargets.includes(next)) {
    const currentLabel = PILOT_STATUS_LABELS[current]
    const newLabel = PILOT_STATUS_LABELS[next]
    const allowedLabels = allowedTargets.map((s) => PILOT_STATUS_LABELS[s])

    let message: string
    if (allowedTargets.length === 0) {
      message = `Không thể chuyển trạng thái pilot từ "${currentLabel}" sang "${newLabel}". Trạng thái "${currentLabel}" là trạng thái cuối.`
    } else {
      message = `Không thể chuyển trạng thái pilot từ "${currentLabel}" sang "${newLabel}". Các trạng thái hợp lệ: ${allowedLabels.join(', ')}.`
    }
    return { valid: false, message }
  }

  return { valid: true }
}
