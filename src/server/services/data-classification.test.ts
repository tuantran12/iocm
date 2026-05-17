import { describe, it, expect } from 'vitest'
import { Confidentiality } from '@prisma/client'
import {
  CONFIDENTIALITY_CONFIG,
  CONFIDENTIALITY_LABELS,
  PERSONAL_DATA_LEVEL_CONFIG,
  PERSONAL_DATA_LEVEL_LABELS,
  PERSONAL_DATA_LEVELS,
  RISK_LEVEL_CONFIG,
  RISK_LEVEL_LABELS,
  RISK_LEVELS,
  classifyDataRisk,
  getConfidentialityLabel,
  getConfidentialityColor,
  getPersonalDataLevelLabel,
  getPersonalDataLevelColor,
  getRiskLevelLabel,
  getRiskLevelColor,
} from './data-classification'
import type { PersonalDataLevel, RiskLevel } from './data-classification'

const ALL_CONFIDENTIALITY: Confidentiality[] = [
  Confidentiality.PUBLIC,
  Confidentiality.INTERNAL,
  Confidentiality.CONFIDENTIAL,
  Confidentiality.RESTRICTED,
  Confidentiality.SECRET,
]

describe('data-classification service', () => {
  describe('CONFIDENTIALITY_CONFIG', () => {
    it('has configuration for all 5 confidentiality levels', () => {
      expect(Object.keys(CONFIDENTIALITY_CONFIG)).toHaveLength(5)
      for (const level of ALL_CONFIDENTIALITY) {
        expect(CONFIDENTIALITY_CONFIG[level]).toBeDefined()
      }
    })

    it('all levels have Vietnamese labels', () => {
      expect(CONFIDENTIALITY_CONFIG[Confidentiality.PUBLIC].label).toBe('Công khai')
      expect(CONFIDENTIALITY_CONFIG[Confidentiality.INTERNAL].label).toBe('Nội bộ')
      expect(CONFIDENTIALITY_CONFIG[Confidentiality.CONFIDENTIAL].label).toBe('Bí mật')
      expect(CONFIDENTIALITY_CONFIG[Confidentiality.RESTRICTED].label).toBe('Hạn chế tối đa')
      expect(CONFIDENTIALITY_CONFIG[Confidentiality.SECRET].label).toBe('Tuyệt mật')
    })

    it('all levels have descriptions', () => {
      for (const level of ALL_CONFIDENTIALITY) {
        expect(CONFIDENTIALITY_CONFIG[level].description.length).toBeGreaterThan(0)
      }
    })

    it('all levels have color codes', () => {
      for (const level of ALL_CONFIDENTIALITY) {
        expect(CONFIDENTIALITY_CONFIG[level].color).toMatch(/^#[0-9a-f]{6}$/)
      }
    })
  })

  describe('PERSONAL_DATA_LEVEL_CONFIG', () => {
    it('has configuration for all 4 personal data levels', () => {
      expect(Object.keys(PERSONAL_DATA_LEVEL_CONFIG)).toHaveLength(4)
      for (const level of PERSONAL_DATA_LEVELS) {
        expect(PERSONAL_DATA_LEVEL_CONFIG[level]).toBeDefined()
      }
    })

    it('all levels have Vietnamese labels', () => {
      expect(PERSONAL_DATA_LEVEL_CONFIG.none.label).toBe('Không có DLCN')
      expect(PERSONAL_DATA_LEVEL_CONFIG.basic.label).toBe('DLCN cơ bản')
      expect(PERSONAL_DATA_LEVEL_CONFIG.sensitive.label).toBe('DLCN nhạy cảm')
      expect(PERSONAL_DATA_LEVEL_CONFIG.special_category.label).toBe('DLCN đặc biệt')
    })

    it('all levels have descriptions', () => {
      for (const level of PERSONAL_DATA_LEVELS) {
        expect(PERSONAL_DATA_LEVEL_CONFIG[level].description.length).toBeGreaterThan(0)
      }
    })

    it('all levels have color codes', () => {
      for (const level of PERSONAL_DATA_LEVELS) {
        expect(PERSONAL_DATA_LEVEL_CONFIG[level].color).toMatch(/^#[0-9a-f]{6}$/)
      }
    })
  })

  describe('RISK_LEVEL_CONFIG', () => {
    it('has configuration for all 4 risk levels', () => {
      expect(Object.keys(RISK_LEVEL_CONFIG)).toHaveLength(4)
      for (const level of RISK_LEVELS) {
        expect(RISK_LEVEL_CONFIG[level]).toBeDefined()
      }
    })

    it('all levels have Vietnamese labels', () => {
      expect(RISK_LEVEL_CONFIG.low.label).toBe('Thấp')
      expect(RISK_LEVEL_CONFIG.medium.label).toBe('Trung bình')
      expect(RISK_LEVEL_CONFIG.high.label).toBe('Cao')
      expect(RISK_LEVEL_CONFIG.critical.label).toBe('Nghiêm trọng')
    })

    it('all levels have color codes', () => {
      for (const level of RISK_LEVELS) {
        expect(RISK_LEVEL_CONFIG[level].color).toMatch(/^#[0-9a-f]{6}$/)
      }
    })
  })

  describe('classifyDataRisk', () => {
    it('PUBLIC + none = low', () => {
      expect(classifyDataRisk(Confidentiality.PUBLIC, 'none')).toBe('low')
    })

    it('PUBLIC + basic = medium', () => {
      expect(classifyDataRisk(Confidentiality.PUBLIC, 'basic')).toBe('medium')
    })

    it('PUBLIC + sensitive = high', () => {
      expect(classifyDataRisk(Confidentiality.PUBLIC, 'sensitive')).toBe('high')
    })

    it('PUBLIC + special_category = critical', () => {
      expect(classifyDataRisk(Confidentiality.PUBLIC, 'special_category')).toBe('critical')
    })

    it('INTERNAL + none = low', () => {
      expect(classifyDataRisk(Confidentiality.INTERNAL, 'none')).toBe('low')
    })

    it('INTERNAL + basic = medium', () => {
      expect(classifyDataRisk(Confidentiality.INTERNAL, 'basic')).toBe('medium')
    })

    it('INTERNAL + sensitive = high', () => {
      expect(classifyDataRisk(Confidentiality.INTERNAL, 'sensitive')).toBe('high')
    })

    it('INTERNAL + special_category = critical', () => {
      expect(classifyDataRisk(Confidentiality.INTERNAL, 'special_category')).toBe('critical')
    })

    it('CONFIDENTIAL + none = medium', () => {
      expect(classifyDataRisk(Confidentiality.CONFIDENTIAL, 'none')).toBe('medium')
    })

    it('CONFIDENTIAL + basic = high', () => {
      expect(classifyDataRisk(Confidentiality.CONFIDENTIAL, 'basic')).toBe('high')
    })

    it('CONFIDENTIAL + sensitive = high', () => {
      expect(classifyDataRisk(Confidentiality.CONFIDENTIAL, 'sensitive')).toBe('high')
    })

    it('CONFIDENTIAL + special_category = critical', () => {
      expect(classifyDataRisk(Confidentiality.CONFIDENTIAL, 'special_category')).toBe('critical')
    })

    it('RESTRICTED + any = critical', () => {
      const levels: PersonalDataLevel[] = ['none', 'basic', 'sensitive', 'special_category']
      for (const level of levels) {
        expect(classifyDataRisk(Confidentiality.RESTRICTED, level)).toBe('critical')
      }
    })

    it('SECRET + any = critical', () => {
      const levels: PersonalDataLevel[] = ['none', 'basic', 'sensitive', 'special_category']
      for (const level of levels) {
        expect(classifyDataRisk(Confidentiality.SECRET, level)).toBe('critical')
      }
    })

    it('any confidentiality + special_category = critical', () => {
      for (const conf of ALL_CONFIDENTIALITY) {
        expect(classifyDataRisk(conf, 'special_category')).toBe('critical')
      }
    })
  })

  describe('label helper functions', () => {
    it('getConfidentialityLabel returns correct labels', () => {
      expect(getConfidentialityLabel(Confidentiality.PUBLIC)).toBe('Công khai')
      expect(getConfidentialityLabel(Confidentiality.INTERNAL)).toBe('Nội bộ')
      expect(getConfidentialityLabel(Confidentiality.CONFIDENTIAL)).toBe('Bí mật')
      expect(getConfidentialityLabel(Confidentiality.RESTRICTED)).toBe('Hạn chế tối đa')
      expect(getConfidentialityLabel(Confidentiality.SECRET)).toBe('Tuyệt mật')
    })

    it('getPersonalDataLevelLabel returns correct labels', () => {
      expect(getPersonalDataLevelLabel('none')).toBe('Không có DLCN')
      expect(getPersonalDataLevelLabel('basic')).toBe('DLCN cơ bản')
      expect(getPersonalDataLevelLabel('sensitive')).toBe('DLCN nhạy cảm')
      expect(getPersonalDataLevelLabel('special_category')).toBe('DLCN đặc biệt')
    })

    it('getRiskLevelLabel returns correct labels', () => {
      expect(getRiskLevelLabel('low')).toBe('Thấp')
      expect(getRiskLevelLabel('medium')).toBe('Trung bình')
      expect(getRiskLevelLabel('high')).toBe('Cao')
      expect(getRiskLevelLabel('critical')).toBe('Nghiêm trọng')
    })
  })

  describe('color helper functions', () => {
    it('getConfidentialityColor returns valid hex colors', () => {
      for (const level of ALL_CONFIDENTIALITY) {
        expect(getConfidentialityColor(level)).toMatch(/^#[0-9a-f]{6}$/)
      }
    })

    it('getPersonalDataLevelColor returns valid hex colors', () => {
      for (const level of PERSONAL_DATA_LEVELS) {
        expect(getPersonalDataLevelColor(level)).toMatch(/^#[0-9a-f]{6}$/)
      }
    })

    it('getRiskLevelColor returns valid hex colors', () => {
      for (const level of RISK_LEVELS) {
        expect(getRiskLevelColor(level)).toMatch(/^#[0-9a-f]{6}$/)
      }
    })

    it('risk colors escalate from green to purple', () => {
      expect(getRiskLevelColor('low')).toBe('#4caf50')
      expect(getRiskLevelColor('medium')).toBe('#ff9800')
      expect(getRiskLevelColor('high')).toBe('#f44336')
      expect(getRiskLevelColor('critical')).toBe('#9c27b0')
    })
  })

  describe('label records', () => {
    it('CONFIDENTIALITY_LABELS matches config labels', () => {
      for (const level of ALL_CONFIDENTIALITY) {
        expect(CONFIDENTIALITY_LABELS[level]).toBe(CONFIDENTIALITY_CONFIG[level].label)
      }
    })

    it('PERSONAL_DATA_LEVEL_LABELS matches config labels', () => {
      for (const level of PERSONAL_DATA_LEVELS) {
        expect(PERSONAL_DATA_LEVEL_LABELS[level]).toBe(PERSONAL_DATA_LEVEL_CONFIG[level].label)
      }
    })

    it('RISK_LEVEL_LABELS matches config labels', () => {
      for (const level of RISK_LEVELS) {
        expect(RISK_LEVEL_LABELS[level]).toBe(RISK_LEVEL_CONFIG[level].label)
      }
    })
  })
})
