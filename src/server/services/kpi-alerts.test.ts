import { describe, it, expect } from 'vitest'
import {
  isKPIOffTrack,
  getOffTrackKPIs,
  getKPIAlertLevel,
  getKPIAlertInfo,
  ALERT_LEVEL_LABELS,
  ALERT_LEVEL_COLORS,
  DEFAULT_OFF_TRACK_THRESHOLD,
  DEFAULT_ON_TRACK_THRESHOLD,
  type KPIForAlert,
} from './kpi-alerts'

describe('kpi-alerts service', () => {
  describe('getKPIAlertLevel', () => {
    it('returns on_track when achievement >= 90%', () => {
      expect(getKPIAlertLevel(90)).toBe('on_track')
      expect(getKPIAlertLevel(95)).toBe('on_track')
      expect(getKPIAlertLevel(100)).toBe('on_track')
      expect(getKPIAlertLevel(150)).toBe('on_track')
    })

    it('returns at_risk when achievement >= 70% and < 90%', () => {
      expect(getKPIAlertLevel(70)).toBe('at_risk')
      expect(getKPIAlertLevel(75)).toBe('at_risk')
      expect(getKPIAlertLevel(89)).toBe('at_risk')
      expect(getKPIAlertLevel(89.99)).toBe('at_risk')
    })

    it('returns off_track when achievement < 70%', () => {
      expect(getKPIAlertLevel(69)).toBe('off_track')
      expect(getKPIAlertLevel(50)).toBe('off_track')
      expect(getKPIAlertLevel(0)).toBe('off_track')
      expect(getKPIAlertLevel(69.99)).toBe('off_track')
    })

    it('returns no_data when achievement is null', () => {
      expect(getKPIAlertLevel(null)).toBe('no_data')
    })

    it('supports custom thresholds', () => {
      expect(getKPIAlertLevel(85, { onTrackThreshold: 80 })).toBe('on_track')
      expect(getKPIAlertLevel(55, { offTrackThreshold: 50 })).toBe('at_risk')
      expect(getKPIAlertLevel(45, { offTrackThreshold: 50 })).toBe('off_track')
    })
  })

  describe('isKPIOffTrack', () => {
    it('returns true when achievement < 70% (increase_is_good)', () => {
      const kpi: KPIForAlert = { targetValue: 100, currentValue: 50, direction: 'increase_is_good' }
      expect(isKPIOffTrack(kpi)).toBe(true) // 50% achievement
    })

    it('returns false when achievement >= 70% (increase_is_good)', () => {
      const kpi: KPIForAlert = { targetValue: 100, currentValue: 80, direction: 'increase_is_good' }
      expect(isKPIOffTrack(kpi)).toBe(false) // 80% achievement
    })

    it('returns false when achievement is exactly 70%', () => {
      const kpi: KPIForAlert = { targetValue: 100, currentValue: 70, direction: 'increase_is_good' }
      expect(isKPIOffTrack(kpi)).toBe(false) // 70% achievement
    })

    it('returns true for decrease_is_good when actual is too high', () => {
      // direction=decrease_is_good: achievement = target/actual * 100
      // target=10, actual=20 → achievement = 50%
      const kpi: KPIForAlert = { targetValue: 10, currentValue: 20, direction: 'decrease_is_good' }
      expect(isKPIOffTrack(kpi)).toBe(true)
    })

    it('returns false for decrease_is_good when actual is low enough', () => {
      // target=10, actual=12 → achievement = 83.3%
      const kpi: KPIForAlert = { targetValue: 10, currentValue: 12, direction: 'decrease_is_good' }
      expect(isKPIOffTrack(kpi)).toBe(false)
    })

    it('returns false when target or current is null (no data)', () => {
      expect(isKPIOffTrack({ targetValue: null, currentValue: 50, direction: 'increase_is_good' })).toBe(false)
      expect(isKPIOffTrack({ targetValue: 100, currentValue: null, direction: 'increase_is_good' })).toBe(false)
      expect(isKPIOffTrack({ targetValue: null, currentValue: null, direction: 'increase_is_good' })).toBe(false)
    })

    it('returns false when target is 0 (cannot calculate)', () => {
      const kpi: KPIForAlert = { targetValue: 0, currentValue: 50, direction: 'increase_is_good' }
      expect(isKPIOffTrack(kpi)).toBe(false)
    })

    it('supports custom threshold', () => {
      const kpi: KPIForAlert = { targetValue: 100, currentValue: 75, direction: 'increase_is_good' }
      expect(isKPIOffTrack(kpi, 80)).toBe(true) // 75% < 80% threshold
      expect(isKPIOffTrack(kpi, 70)).toBe(false) // 75% >= 70% threshold
    })

    it('handles maintain direction', () => {
      // maintain: achievement = 100 - abs(actual - target) / target * 100
      // target=100, actual=140 → achievement = 100 - 40/100*100 = 60%
      const kpi: KPIForAlert = { targetValue: 100, currentValue: 140, direction: 'maintain' }
      expect(isKPIOffTrack(kpi)).toBe(true) // 60% < 70%
    })
  })

  describe('getOffTrackKPIs', () => {
    const kpis: KPIForAlert[] = [
      { id: '1', targetValue: 100, currentValue: 95, direction: 'increase_is_good' },  // 95% - on_track
      { id: '2', targetValue: 100, currentValue: 75, direction: 'increase_is_good' },  // 75% - at_risk
      { id: '3', targetValue: 100, currentValue: 40, direction: 'increase_is_good' },  // 40% - off_track
      { id: '4', targetValue: 100, currentValue: 60, direction: 'increase_is_good' },  // 60% - off_track
      { id: '5', targetValue: null, currentValue: 50, direction: 'increase_is_good' }, // no_data
    ]

    it('returns only KPIs with achievement < 70%', () => {
      const offTrack = getOffTrackKPIs(kpis)
      expect(offTrack).toHaveLength(2)
      expect(offTrack.map((k) => k.id)).toEqual(['3', '4'])
    })

    it('returns empty array when no KPIs are off-track', () => {
      const goodKpis: KPIForAlert[] = [
        { id: '1', targetValue: 100, currentValue: 95, direction: 'increase_is_good' },
        { id: '2', targetValue: 100, currentValue: 80, direction: 'increase_is_good' },
      ]
      expect(getOffTrackKPIs(goodKpis)).toHaveLength(0)
    })

    it('returns empty array for empty input', () => {
      expect(getOffTrackKPIs([])).toHaveLength(0)
    })

    it('supports custom threshold', () => {
      const offTrack = getOffTrackKPIs(kpis, 80)
      // 95% passes, 75% fails, 40% fails, 60% fails, null passes (no data)
      expect(offTrack).toHaveLength(3)
      expect(offTrack.map((k) => k.id)).toEqual(['2', '3', '4'])
    })
  })

  describe('getKPIAlertInfo', () => {
    it('returns full alert info for on_track KPI', () => {
      const kpi: KPIForAlert = { targetValue: 100, currentValue: 95, direction: 'increase_is_good' }
      const info = getKPIAlertInfo(kpi)
      expect(info.level).toBe('on_track')
      expect(info.label).toBe('Đạt tiến độ')
      expect(info.color).toBe('green')
      expect(info.achievement).toBe(95)
    })

    it('returns full alert info for at_risk KPI', () => {
      const kpi: KPIForAlert = { targetValue: 100, currentValue: 75, direction: 'increase_is_good' }
      const info = getKPIAlertInfo(kpi)
      expect(info.level).toBe('at_risk')
      expect(info.label).toBe('Có nguy cơ')
      expect(info.color).toBe('yellow')
      expect(info.achievement).toBe(75)
    })

    it('returns full alert info for off_track KPI', () => {
      const kpi: KPIForAlert = { targetValue: 100, currentValue: 50, direction: 'increase_is_good' }
      const info = getKPIAlertInfo(kpi)
      expect(info.level).toBe('off_track')
      expect(info.label).toBe('Lệch mục tiêu')
      expect(info.color).toBe('red')
      expect(info.achievement).toBe(50)
    })

    it('returns full alert info for no_data KPI', () => {
      const kpi: KPIForAlert = { targetValue: null, currentValue: null, direction: 'increase_is_good' }
      const info = getKPIAlertInfo(kpi)
      expect(info.level).toBe('no_data')
      expect(info.label).toBe('Chưa có dữ liệu')
      expect(info.color).toBe('grey')
      expect(info.achievement).toBeNull()
    })
  })

  describe('ALERT_LEVEL_LABELS', () => {
    it('has Vietnamese labels for all 4 levels', () => {
      expect(Object.keys(ALERT_LEVEL_LABELS)).toHaveLength(4)
      expect(ALERT_LEVEL_LABELS.on_track).toBe('Đạt tiến độ')
      expect(ALERT_LEVEL_LABELS.at_risk).toBe('Có nguy cơ')
      expect(ALERT_LEVEL_LABELS.off_track).toBe('Lệch mục tiêu')
      expect(ALERT_LEVEL_LABELS.no_data).toBe('Chưa có dữ liệu')
    })
  })

  describe('ALERT_LEVEL_COLORS', () => {
    it('has correct colors for all 4 levels', () => {
      expect(ALERT_LEVEL_COLORS.on_track).toBe('green')
      expect(ALERT_LEVEL_COLORS.at_risk).toBe('yellow')
      expect(ALERT_LEVEL_COLORS.off_track).toBe('red')
      expect(ALERT_LEVEL_COLORS.no_data).toBe('grey')
    })
  })

  describe('constants', () => {
    it('has correct default thresholds', () => {
      expect(DEFAULT_OFF_TRACK_THRESHOLD).toBe(70)
      expect(DEFAULT_ON_TRACK_THRESHOLD).toBe(90)
    })
  })
})
