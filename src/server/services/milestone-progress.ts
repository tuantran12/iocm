import { TaskStatus } from '@prisma/client'

/**
 * Milestone progress calculation.
 *
 * Given a list of milestones (tasks with isMilestone=true),
 * calculates total, completed, overdue, and percentage.
 *
 * Overdue: dueDate < now AND status is NOT DONE or CANCELLED.
 */

export interface MilestoneForProgress {
  id: string
  status: TaskStatus
  dueDate: Date | null
}

export interface MilestoneProgressResult {
  total: number
  completed: number
  overdue: number
  percentage: number
}

export function calculateMilestoneProgress(
  milestones: MilestoneForProgress[],
  now: Date = new Date()
): MilestoneProgressResult {
  const total = milestones.length

  if (total === 0) {
    return { total: 0, completed: 0, overdue: 0, percentage: 0 }
  }

  const completed = milestones.filter(
    (m) => m.status === TaskStatus.DONE
  ).length

  const overdue = milestones.filter(
    (m) =>
      m.dueDate !== null &&
      m.dueDate < now &&
      m.status !== TaskStatus.DONE &&
      m.status !== TaskStatus.CANCELLED
  ).length

  const percentage = Math.round((completed / total) * 100)

  return { total, completed, overdue, percentage }
}
