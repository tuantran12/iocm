import { describe, it, expect } from 'vitest'
import { ProjectStatus } from '@prisma/client'
import {
  validateProjectStatusTransition,
  VALID_PROJECT_TRANSITIONS,
  PROJECT_STATUS_LABELS,
} from './project-status'

describe('project-status service', () => {
  describe('VALID_PROJECT_TRANSITIONS', () => {
    it('PROPOSED can transition to PLANNING or CANCELLED', () => {
      expect(VALID_PROJECT_TRANSITIONS[ProjectStatus.PROPOSED]).toEqual([
        ProjectStatus.PLANNING,
        ProjectStatus.CANCELLED,
      ])
    })

    it('PLANNING can transition to ACTIVE or CANCELLED', () => {
      expect(VALID_PROJECT_TRANSITIONS[ProjectStatus.PLANNING]).toEqual([
        ProjectStatus.ACTIVE,
        ProjectStatus.CANCELLED,
      ])
    })

    it('ACTIVE can transition to PAUSED, COMPLETED, or CANCELLED', () => {
      expect(VALID_PROJECT_TRANSITIONS[ProjectStatus.ACTIVE]).toEqual([
        ProjectStatus.PAUSED,
        ProjectStatus.COMPLETED,
        ProjectStatus.CANCELLED,
      ])
    })

    it('PAUSED can transition to ACTIVE or CANCELLED', () => {
      expect(VALID_PROJECT_TRANSITIONS[ProjectStatus.PAUSED]).toEqual([
        ProjectStatus.ACTIVE,
        ProjectStatus.CANCELLED,
      ])
    })

    it('COMPLETED can transition to CANCELLED', () => {
      expect(VALID_PROJECT_TRANSITIONS[ProjectStatus.COMPLETED]).toEqual([
        ProjectStatus.CANCELLED,
      ])
    })

    it('CANCELLED is terminal (no transitions)', () => {
      expect(VALID_PROJECT_TRANSITIONS[ProjectStatus.CANCELLED]).toEqual([])
    })
  })

  describe('PROJECT_STATUS_LABELS', () => {
    it('has Vietnamese labels for all statuses', () => {
      expect(PROJECT_STATUS_LABELS[ProjectStatus.PROPOSED]).toBe('Đề xuất')
      expect(PROJECT_STATUS_LABELS[ProjectStatus.PLANNING]).toBe('Lập kế hoạch')
      expect(PROJECT_STATUS_LABELS[ProjectStatus.ACTIVE]).toBe('Đang triển khai')
      expect(PROJECT_STATUS_LABELS[ProjectStatus.PAUSED]).toBe('Tạm dừng')
      expect(PROJECT_STATUS_LABELS[ProjectStatus.COMPLETED]).toBe('Hoàn thành')
      expect(PROJECT_STATUS_LABELS[ProjectStatus.CANCELLED]).toBe('Đã đóng')
    })
  })

  describe('validateProjectStatusTransition', () => {
    it('allows same status (no-op)', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.ACTIVE,
        ProjectStatus.ACTIVE
      )
      expect(result).toEqual({ valid: true })
    })

    it('allows valid transition PROPOSED → PLANNING', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.PROPOSED,
        ProjectStatus.PLANNING
      )
      expect(result).toEqual({ valid: true })
    })

    it('allows valid transition PROPOSED → CANCELLED', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.PROPOSED,
        ProjectStatus.CANCELLED
      )
      expect(result).toEqual({ valid: true })
    })

    it('allows valid transition PLANNING → ACTIVE', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.PLANNING,
        ProjectStatus.ACTIVE
      )
      expect(result).toEqual({ valid: true })
    })

    it('allows valid transition ACTIVE → PAUSED', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.ACTIVE,
        ProjectStatus.PAUSED
      )
      expect(result).toEqual({ valid: true })
    })

    it('allows valid transition ACTIVE → COMPLETED', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.ACTIVE,
        ProjectStatus.COMPLETED
      )
      expect(result).toEqual({ valid: true })
    })

    it('allows valid transition PAUSED → ACTIVE', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.PAUSED,
        ProjectStatus.ACTIVE
      )
      expect(result).toEqual({ valid: true })
    })

    it('allows valid transition COMPLETED → CANCELLED', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.COMPLETED,
        ProjectStatus.CANCELLED
      )
      expect(result).toEqual({ valid: true })
    })

    it('rejects invalid transition PROPOSED → ACTIVE', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.PROPOSED,
        ProjectStatus.ACTIVE
      )
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('Không thể chuyển trạng thái')
        expect(result.message).toContain('Đề xuất')
        expect(result.message).toContain('Đang triển khai')
      }
    })

    it('rejects invalid transition PROPOSED → COMPLETED', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.PROPOSED,
        ProjectStatus.COMPLETED
      )
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('Các trạng thái hợp lệ')
      }
    })

    it('rejects transition from CANCELLED (terminal)', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.CANCELLED,
        ProjectStatus.PROPOSED
      )
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('trạng thái cuối')
      }
    })

    it('rejects invalid transition COMPLETED → ACTIVE', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.COMPLETED,
        ProjectStatus.ACTIVE
      )
      expect(result.valid).toBe(false)
    })

    it('rejects invalid transition PAUSED → COMPLETED', () => {
      const result = validateProjectStatusTransition(
        ProjectStatus.PAUSED,
        ProjectStatus.COMPLETED
      )
      expect(result.valid).toBe(false)
    })

    describe('admin force-cancel', () => {
      it('allows Director to force-cancel from any state', () => {
        const result = validateProjectStatusTransition(
          ProjectStatus.PLANNING,
          ProjectStatus.CANCELLED,
          ['Director']
        )
        expect(result).toEqual({ valid: true })
      })

      it('allows System_Admin to force-cancel from any state', () => {
        const result = validateProjectStatusTransition(
          ProjectStatus.ACTIVE,
          ProjectStatus.CANCELLED,
          ['System_Admin']
        )
        expect(result).toEqual({ valid: true })
      })

      it('does not allow admin to transition from CANCELLED', () => {
        const result = validateProjectStatusTransition(
          ProjectStatus.CANCELLED,
          ProjectStatus.PROPOSED,
          ['System_Admin']
        )
        expect(result.valid).toBe(false)
      })

      it('non-admin cannot force invalid transitions', () => {
        const result = validateProjectStatusTransition(
          ProjectStatus.PROPOSED,
          ProjectStatus.ACTIVE,
          ['Project_Manager']
        )
        expect(result.valid).toBe(false)
      })
    })
  })
})
