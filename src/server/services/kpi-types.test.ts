import { describe, it, expect } from 'vitest'
import { KPIType } from '@prisma/client'
import {
  KPI_TYPE_CONFIG,
  KPI_TYPE_LABELS,
  getKPITypeLabel,
  getKPITypeDefaultDirection,
} from './kpi-types'

const ALL_KPI_TYPES: KPIType[] = [
  KPIType.OUTPUT,
  KPIType.OUTCOME,
  KPIType.IMPACT,
  KPIType.SAFETY,
  KPIType.SATISFACTION,
  KPIType.INCLUSION,
  KPIType.SUSTAINABILITY,
]

describe('kpi-types service', () => {
  describe('KPI_TYPE_CONFIG', () => {
    it('has configuration for all 7 KPI types', () => {
      expect(Object.keys(KPI_TYPE_CONFIG)).toHaveLength(7)
      for (const type of ALL_KPI_TYPES) {
        expect(KPI_TYPE_CONFIG[type]).toBeDefined()
      }
    })

    it('all 7 types have labels', () => {
      for (const type of ALL_KPI_TYPES) {
        expect(KPI_TYPE_CONFIG[type].label).toBeDefined()
        expect(KPI_TYPE_CONFIG[type].label.length).toBeGreaterThan(0)
      }
    })

    it('all 7 types have descriptions', () => {
      for (const type of ALL_KPI_TYPES) {
        expect(KPI_TYPE_CONFIG[type].description).toBeDefined()
        expect(KPI_TYPE_CONFIG[type].description.length).toBeGreaterThan(0)
      }
    })

    it('all 7 types have default directions', () => {
      const validDirections = ['increase_is_good', 'decrease_is_good', 'maintain']
      for (const type of ALL_KPI_TYPES) {
        expect(KPI_TYPE_CONFIG[type].defaultDirection).toBeDefined()
        expect(validDirections).toContain(KPI_TYPE_CONFIG[type].defaultDirection)
      }
    })

    it('all 7 types have suggested units', () => {
      for (const type of ALL_KPI_TYPES) {
        expect(KPI_TYPE_CONFIG[type].suggestedUnits).toBeDefined()
        expect(KPI_TYPE_CONFIG[type].suggestedUnits.length).toBeGreaterThan(0)
      }
    })

    it('all 7 types have examples', () => {
      for (const type of ALL_KPI_TYPES) {
        expect(KPI_TYPE_CONFIG[type].examples).toBeDefined()
        expect(KPI_TYPE_CONFIG[type].examples.length).toBeGreaterThan(0)
      }
    })

    it('labels are in Vietnamese', () => {
      // Vietnamese labels contain diacritics or Vietnamese-specific characters
      const vietnameseLabels: Record<KPIType, string> = {
        [KPIType.OUTPUT]: 'Đầu ra',
        [KPIType.OUTCOME]: 'Kết quả',
        [KPIType.IMPACT]: 'Tác động',
        [KPIType.SAFETY]: 'An toàn',
        [KPIType.SATISFACTION]: 'Hài lòng',
        [KPIType.INCLUSION]: 'Bao trùm',
        [KPIType.SUSTAINABILITY]: 'Bền vững',
      }

      for (const type of ALL_KPI_TYPES) {
        expect(KPI_TYPE_CONFIG[type].label).toBe(vietnameseLabels[type])
      }
    })

    it('SAFETY has decrease_is_good direction', () => {
      expect(KPI_TYPE_CONFIG[KPIType.SAFETY].defaultDirection).toBe('decrease_is_good')
    })

    it('SATISFACTION has increase_is_good direction', () => {
      expect(KPI_TYPE_CONFIG[KPIType.SATISFACTION].defaultDirection).toBe('increase_is_good')
    })

    it('INCLUSION has increase_is_good direction', () => {
      expect(KPI_TYPE_CONFIG[KPIType.INCLUSION].defaultDirection).toBe('increase_is_good')
    })

    it('SUSTAINABILITY has decrease_is_good direction', () => {
      expect(KPI_TYPE_CONFIG[KPIType.SUSTAINABILITY].defaultDirection).toBe('decrease_is_good')
    })
  })

  describe('KPI_TYPE_LABELS', () => {
    it('has labels for all 7 types', () => {
      expect(Object.keys(KPI_TYPE_LABELS)).toHaveLength(7)
      for (const type of ALL_KPI_TYPES) {
        expect(KPI_TYPE_LABELS[type]).toBeDefined()
        expect(KPI_TYPE_LABELS[type].length).toBeGreaterThan(0)
      }
    })

    it('matches labels from KPI_TYPE_CONFIG', () => {
      for (const type of ALL_KPI_TYPES) {
        expect(KPI_TYPE_LABELS[type]).toBe(KPI_TYPE_CONFIG[type].label)
      }
    })
  })

  describe('getKPITypeLabel', () => {
    it('returns correct Vietnamese label for each type', () => {
      expect(getKPITypeLabel(KPIType.OUTPUT)).toBe('Đầu ra')
      expect(getKPITypeLabel(KPIType.OUTCOME)).toBe('Kết quả')
      expect(getKPITypeLabel(KPIType.IMPACT)).toBe('Tác động')
      expect(getKPITypeLabel(KPIType.SAFETY)).toBe('An toàn')
      expect(getKPITypeLabel(KPIType.SATISFACTION)).toBe('Hài lòng')
      expect(getKPITypeLabel(KPIType.INCLUSION)).toBe('Bao trùm')
      expect(getKPITypeLabel(KPIType.SUSTAINABILITY)).toBe('Bền vững')
    })
  })

  describe('getKPITypeDefaultDirection', () => {
    it('returns correct default direction for each type', () => {
      expect(getKPITypeDefaultDirection(KPIType.OUTPUT)).toBe('increase_is_good')
      expect(getKPITypeDefaultDirection(KPIType.OUTCOME)).toBe('increase_is_good')
      expect(getKPITypeDefaultDirection(KPIType.IMPACT)).toBe('increase_is_good')
      expect(getKPITypeDefaultDirection(KPIType.SAFETY)).toBe('decrease_is_good')
      expect(getKPITypeDefaultDirection(KPIType.SATISFACTION)).toBe('increase_is_good')
      expect(getKPITypeDefaultDirection(KPIType.INCLUSION)).toBe('increase_is_good')
      expect(getKPITypeDefaultDirection(KPIType.SUSTAINABILITY)).toBe('decrease_is_good')
    })
  })
})
