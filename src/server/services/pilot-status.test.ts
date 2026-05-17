import { describe, it, expect } from 'vitest'
import {
  validatePilotStatusTransition,
  VALID_PILOT_TRANSITIONS,
  PILOT_STATUS_LABELS,
  PILOT_STATUSES,
  PILOT_ADMIN_ROLES,
} from './pilot-status'

describe('pilot-status service', () => {
  describe('PILOT_STATUSES', () => {
    it('should contain all 5 statuses', () => {
      expect(PILOT_STATUSES).toHaveLength(5)
      expect(PILOT_STATUSES).toContain('planning')
      expect(PILOT_STATUSES).toContain('deploying')
      expect(PILOT_STATUSES).toContain('active')
      expect(PILOT_STATUSES).toContain('completed')
      expect(PILOT_STATUSES).toContain('cancelled')
    })
  })

  describe('PILOT_STATUS_LABELS', () => {
    it('should have Vietnamese labels for all statuses', () => {
      expect(PILOT_STATUS_LABELS.planning).toBe('Lập kế hoạch')
      expect(PILOT_STATUS_LABELS.deploying).toBe('Đang triển khai')
      expect(PILOT_STATUS_LABELS.active).toBe('Hoạt động')
      expect(PILOT_STATUS_LABELS.completed).toBe('Hoàn thành')
      expect(PILOT_STATUS_LABELS.cancelled).toBe('Đã hủy')
    })
  })

  describe('VALID_PILOT_TRANSITIONS', () => {
    it('planning can go to deploying or cancelled', () => {
      expect(VALID_PILOT_TRANSITIONS.planning).toEqual(['deploying', 'cancelled'])
    })

    it('deploying can go to active or cancelled', () => {
      expect(VALID_PILOT_TRANSITIONS.deploying).toEqual(['active', 'cancelled'])
    })

    it('active can go to completed or cancelled', () => {
      expect(VALID_PILOT_TRANSITIONS.active).toEqual(['completed', 'cancelled'])
    })

    it('completed is terminal', () => {
      expect(VALID_PILOT_TRANSITIONS.completed).toEqual([])
    })

    it('cancelled is terminal', () => {
      expect(VALID_PILOT_TRANSITIONS.cancelled).toEqual([])
    })
  })

  describe('validatePilotStatusTransition', () => {
    // ─── Valid transitions ─────────────────────────────────────────────
    it('should allow planning → deploying', () => {
      const result = validatePilotStatusTransition('planning', 'deploying')
      expect(result).toEqual({ valid: true })
    })

    it('should allow planning → cancelled', () => {
      const result = validatePilotStatusTransition('planning', 'cancelled')
      expect(result).toEqual({ valid: true })
    })

    it('should allow deploying → active', () => {
      const result = validatePilotStatusTransition('deploying', 'active')
      expect(result).toEqual({ valid: true })
    })

    it('should allow deploying → cancelled', () => {
      const result = validatePilotStatusTransition('deploying', 'cancelled')
      expect(result).toEqual({ valid: true })
    })

    it('should allow active → completed', () => {
      const result = validatePilotStatusTransition('active', 'completed')
      expect(result).toEqual({ valid: true })
    })

    it('should allow active → cancelled', () => {
      const result = validatePilotStatusTransition('active', 'cancelled')
      expect(result).toEqual({ valid: true })
    })

    // ─── Same status (no-op) ──────────────────────────────────────────
    it('should allow same status transition (no-op)', () => {
      expect(validatePilotStatusTransition('planning', 'planning')).toEqual({ valid: true })
      expect(validatePilotStatusTransition('active', 'active')).toEqual({ valid: true })
      expect(validatePilotStatusTransition('completed', 'completed')).toEqual({ valid: true })
    })

    // ─── Invalid transitions ──────────────────────────────────────────
    it('should reject planning → active (must go through deploying)', () => {
      const result = validatePilotStatusTransition('planning', 'active')
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('Lập kế hoạch')
        expect(result.message).toContain('Hoạt động')
      }
    })

    it('should reject planning → completed', () => {
      const result = validatePilotStatusTransition('planning', 'completed')
      expect(result.valid).toBe(false)
    })

    it('should reject deploying → planning (no backward)', () => {
      const result = validatePilotStatusTransition('deploying', 'planning')
      expect(result.valid).toBe(false)
    })

    it('should reject active → deploying (no backward)', () => {
      const result = validatePilotStatusTransition('active', 'deploying')
      expect(result.valid).toBe(false)
    })

    it('should reject completed → active (terminal state)', () => {
      const result = validatePilotStatusTransition('completed', 'active')
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('trạng thái cuối')
      }
    })

    it('should reject cancelled → planning (terminal state)', () => {
      const result = validatePilotStatusTransition('cancelled', 'planning')
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('trạng thái cuối')
      }
    })

    // ─── Invalid status values ────────────────────────────────────────
    it('should reject unknown current status', () => {
      const result = validatePilotStatusTransition('unknown', 'active')
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('không hợp lệ')
      }
    })

    it('should reject unknown new status', () => {
      const result = validatePilotStatusTransition('planning', 'unknown')
      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.message).toContain('không hợp lệ')
      }
    })

    // ─── Admin force-cancel ───────────────────────────────────────────
    it('should allow admin to force-cancel from planning', () => {
      const result = validatePilotStatusTransition('planning', 'cancelled', ['System_Admin'])
      expect(result).toEqual({ valid: true })
    })

    it('should allow admin to force-cancel from deploying', () => {
      const result = validatePilotStatusTransition('deploying', 'cancelled', ['Director'])
      expect(result).toEqual({ valid: true })
    })

    it('should allow admin to force-cancel from active', () => {
      const result = validatePilotStatusTransition('active', 'cancelled', ['System_Admin'])
      expect(result).toEqual({ valid: true })
    })

    it('should not allow admin to force-cancel from completed (already terminal)', () => {
      const result = validatePilotStatusTransition('completed', 'cancelled', ['System_Admin'])
      expect(result.valid).toBe(false)
    })

    it('should not allow non-admin to skip transitions', () => {
      const result = validatePilotStatusTransition('planning', 'active', ['Project_Manager'])
      expect(result.valid).toBe(false)
    })
  })

  describe('PILOT_ADMIN_ROLES', () => {
    it('should include System_Admin and Director', () => {
      expect(PILOT_ADMIN_ROLES).toContain('System_Admin')
      expect(PILOT_ADMIN_ROLES).toContain('Director')
    })
  })
})
