import { z } from 'zod'

/**
 * Obligation status enum for tracking individual obligations within an agreement.
 */
export const ObligationStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  OVERDUE: 'OVERDUE',
  WAIVED: 'WAIVED',
} as const

export type ObligationStatusType = (typeof ObligationStatus)[keyof typeof ObligationStatus]

/**
 * Schema for a single obligation within key_obligations JSON field.
 */
export const obligationSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  responsible: z.string().optional(),
  deadline: z.any().optional().nullable(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'WAIVED']).default('PENDING'),
  completedAt: z.any().optional().nullable(),
  notes: z.string().optional(),
})

export type Obligation = z.infer<typeof obligationSchema>

// Explicit type for clarity
export interface ObligationData {
  id: string
  title: string
  description?: string
  responsible?: string
  deadline?: Date | string | null
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'WAIVED'
  completedAt?: Date | string | null
  notes?: string
}

/**
 * Schema for the full key_obligations JSON array.
 */
export const obligationsArraySchema = z.array(obligationSchema)

/**
 * Vietnamese labels for obligation statuses.
 */
export const OBLIGATION_STATUS_LABELS: Record<ObligationStatusType, string> = {
  PENDING: 'Chờ thực hiện',
  IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Hoàn thành',
  OVERDUE: 'Quá hạn',
  WAIVED: 'Miễn trừ',
}

/**
 * Update a single obligation's status within the obligations array.
 * Returns the updated array or throws if obligation not found.
 */
export function updateObligationStatus(
  obligations: Obligation[],
  obligationId: string,
  newStatus: ObligationStatusType,
  notes?: string
): Obligation[] {
  const index = obligations.findIndex((o) => o.id === obligationId)
  if (index === -1) {
    throw new Error(`Nghĩa vụ với ID "${obligationId}" không tồn tại.`)
  }

  const updated = [...obligations]
  updated[index] = {
    ...updated[index]!,
    status: newStatus,
    completedAt: newStatus === 'COMPLETED' ? new Date() : updated[index]!.completedAt,
    notes: notes ?? updated[index]!.notes,
  }

  return updated
}

/**
 * Check obligations for overdue items (deadline passed, status still PENDING or IN_PROGRESS).
 * Returns obligations that should be marked as OVERDUE.
 */
export function checkOverdueObligations(obligations: Obligation[]): Obligation[] {
  const now = new Date()
  return obligations.filter(
    (o) =>
      o.deadline &&
      new Date(o.deadline) < now &&
      (o.status === 'PENDING' || o.status === 'IN_PROGRESS')
  )
}

/**
 * Mark overdue obligations in the array. Returns updated array.
 */
export function markOverdueObligations(obligations: Obligation[]): Obligation[] {
  const now = new Date()
  return obligations.map((o) => {
    if (
      o.deadline &&
      new Date(o.deadline) < now &&
      (o.status === 'PENDING' || o.status === 'IN_PROGRESS')
    ) {
      return { ...o, status: 'OVERDUE' as const }
    }
    return o
  })
}
