import { describe, it, expect } from 'vitest'
import { KPIType } from '@prisma/client'
import {
  generateImpactReport,
  KPIForReport,
  ProjectForReport,
  KPI_TYPE_WEIGHTS,
} from './impact-report'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function makeKPI(overrides: Partial<KPIForReport> = {}): KPIForReport {
  return {
    id: 'kpi-1',
    projectId: 'proj-1',
    name: 'Test KPI',
    type: KPIType.OUTPUT,
    unit: '%',
    direction: 'increase_is_good',
    baselineValue: 0,
    targetValue: 100,
    currentValue: 80,
    dataSource: null,
    frequency: null,
    responsible: null,
    evidenceUrl: null,
    lastMeasured: null,
    ...overrides,
  }
}

const testProject: ProjectForReport = { id: 'proj-1', name: 'Dự án thử nghiệm' }

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateImpactReport', () => {
  it('should return correct structure with empty KPIs', () => {
    const report = generateImpactReport(testProject, [])

    expect(report.projectId).toBe('proj-1')
    expect(report.projectName).toBe('Dự án thử nghiệm')
    expect(report.generatedAt).toBeDefined()
    expect(report.overallScore).toBeNull()
    expect(report.kpisByType).toEqual([])
    expect(report.summary).toEqual({
      totalKPIs: 0,
      onTrack: 0,
      atRisk: 0,
      offTrack: 0,
      noData: 0,
    })
  })

  it('should group KPIs by type', () => {
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', type: KPIType.OUTPUT, name: 'Output 1' }),
      makeKPI({ id: 'k2', type: KPIType.OUTPUT, name: 'Output 2' }),
      makeKPI({ id: 'k3', type: KPIType.IMPACT, name: 'Impact 1' }),
    ]

    const report = generateImpactReport(testProject, kpis)

    expect(report.kpisByType).toHaveLength(2)
    const outputGroup = report.kpisByType.find((g) => g.type === KPIType.OUTPUT)
    const impactGroup = report.kpisByType.find((g) => g.type === KPIType.IMPACT)

    expect(outputGroup?.count).toBe(2)
    expect(outputGroup?.label).toBe('Đầu ra')
    expect(impactGroup?.count).toBe(1)
    expect(impactGroup?.label).toBe('Tác động')
  })

  it('should only include types that have KPIs', () => {
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', type: KPIType.SAFETY }),
    ]

    const report = generateImpactReport(testProject, kpis)

    expect(report.kpisByType).toHaveLength(1)
    expect(report.kpisByType[0]!.type).toBe(KPIType.SAFETY)
  })

  it('should calculate average achievement per group', () => {
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', type: KPIType.OUTPUT, targetValue: 100, currentValue: 90 }),
      makeKPI({ id: 'k2', type: KPIType.OUTPUT, targetValue: 100, currentValue: 70 }),
    ]

    const report = generateImpactReport(testProject, kpis)
    const outputGroup = report.kpisByType.find((g) => g.type === KPIType.OUTPUT)

    // (90 + 70) / 2 = 80
    expect(outputGroup?.avgAchievement).toBe(80)
  })

  it('should count off-track KPIs per group', () => {
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', type: KPIType.OUTPUT, targetValue: 100, currentValue: 95 }), // on_track
      makeKPI({ id: 'k2', type: KPIType.OUTPUT, targetValue: 100, currentValue: 50 }), // off_track
      makeKPI({ id: 'k3', type: KPIType.OUTPUT, targetValue: 100, currentValue: 30 }), // off_track
    ]

    const report = generateImpactReport(testProject, kpis)
    const outputGroup = report.kpisByType.find((g) => g.type === KPIType.OUTPUT)

    expect(outputGroup?.offTrackCount).toBe(2)
  })

  it('should calculate overall score as weighted average', () => {
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', type: KPIType.OUTPUT, targetValue: 100, currentValue: 80 }),
      makeKPI({ id: 'k2', type: KPIType.IMPACT, targetValue: 100, currentValue: 60 }),
    ]

    const report = generateImpactReport(testProject, kpis)

    // OUTPUT weight=1.0, achievement=80; IMPACT weight=2.0, achievement=60
    // weighted = (80*1.0 + 60*2.0) / (1.0 + 2.0) = (80 + 120) / 3 = 66.67
    expect(report.overallScore).toBeCloseTo(66.67, 1)
  })

  it('should cap achievement at 100 for over-performing KPIs', () => {
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', type: KPIType.OUTPUT, targetValue: 50, currentValue: 100 }),
    ]

    const report = generateImpactReport(testProject, kpis)

    // 100/50 = 200%, capped at 100
    expect(report.overallScore).toBe(100)
    expect(report.kpisByType[0]!.kpis[0]!.achievement).toBe(100)
  })

  it('should handle KPIs with no data (null target or current)', () => {
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', type: KPIType.OUTPUT, targetValue: null, currentValue: null }),
      makeKPI({ id: 'k2', type: KPIType.OUTPUT, targetValue: 100, currentValue: 80 }),
    ]

    const report = generateImpactReport(testProject, kpis)

    expect(report.summary.noData).toBe(1)
    expect(report.summary.totalKPIs).toBe(2)
    // Overall score should only consider KPIs with data
    expect(report.overallScore).toBe(80)
  })

  it('should return null overall score when all KPIs have no data', () => {
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', targetValue: null, currentValue: null }),
      makeKPI({ id: 'k2', targetValue: 100, currentValue: null }),
    ]

    const report = generateImpactReport(testProject, kpis)

    expect(report.overallScore).toBeNull()
  })

  it('should calculate summary correctly', () => {
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', targetValue: 100, currentValue: 95 }),  // on_track (95%)
      makeKPI({ id: 'k2', targetValue: 100, currentValue: 75 }),  // at_risk (75%)
      makeKPI({ id: 'k3', targetValue: 100, currentValue: 50 }),  // off_track (50%)
      makeKPI({ id: 'k4', targetValue: null, currentValue: null }), // no_data
    ]

    const report = generateImpactReport(testProject, kpis)

    expect(report.summary).toEqual({
      totalKPIs: 4,
      onTrack: 1,
      atRisk: 1,
      offTrack: 1,
      noData: 1,
    })
  })

  it('should handle decrease_is_good direction', () => {
    const kpis: KPIForReport[] = [
      makeKPI({
        id: 'k1',
        type: KPIType.SAFETY,
        direction: 'decrease_is_good',
        targetValue: 5,
        currentValue: 5,
      }),
    ]

    const report = generateImpactReport(testProject, kpis)

    // target/actual = 5/5 = 100%
    expect(report.kpisByType[0]!.kpis[0]!.achievement).toBe(100)
    expect(report.kpisByType[0]!.kpis[0]!.alertLevel).toBe('on_track')
  })

  it('should use Vietnamese labels for KPI types', () => {
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', type: KPIType.OUTPUT }),
      makeKPI({ id: 'k2', type: KPIType.OUTCOME }),
      makeKPI({ id: 'k3', type: KPIType.IMPACT }),
      makeKPI({ id: 'k4', type: KPIType.SAFETY }),
      makeKPI({ id: 'k5', type: KPIType.SATISFACTION }),
      makeKPI({ id: 'k6', type: KPIType.INCLUSION }),
      makeKPI({ id: 'k7', type: KPIType.SUSTAINABILITY }),
    ]

    const report = generateImpactReport(testProject, kpis)

    const labels = report.kpisByType.map((g) => g.label)
    expect(labels).toContain('Đầu ra')
    expect(labels).toContain('Kết quả')
    expect(labels).toContain('Tác động')
    expect(labels).toContain('An toàn')
    expect(labels).toContain('Hài lòng')
    expect(labels).toContain('Bao trùm')
    expect(labels).toContain('Bền vững')
  })

  it('should include generatedAt as ISO string', () => {
    const report = generateImpactReport(testProject, [])
    expect(() => new Date(report.generatedAt)).not.toThrow()
    expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('should clamp overall score between 0 and 100', () => {
    // All KPIs at 100% achievement
    const kpis: KPIForReport[] = [
      makeKPI({ id: 'k1', targetValue: 100, currentValue: 100 }),
    ]

    const report = generateImpactReport(testProject, kpis)
    expect(report.overallScore).toBeLessThanOrEqual(100)
    expect(report.overallScore).toBeGreaterThanOrEqual(0)
  })
})

describe('KPI_TYPE_WEIGHTS', () => {
  it('should have weights for all KPI types', () => {
    const allTypes: KPIType[] = [
      KPIType.OUTPUT,
      KPIType.OUTCOME,
      KPIType.IMPACT,
      KPIType.SAFETY,
      KPIType.SATISFACTION,
      KPIType.INCLUSION,
      KPIType.SUSTAINABILITY,
    ]

    for (const type of allTypes) {
      expect(KPI_TYPE_WEIGHTS[type]).toBeGreaterThan(0)
    }
  })

  it('should give IMPACT the highest weight', () => {
    expect(KPI_TYPE_WEIGHTS[KPIType.IMPACT]).toBeGreaterThan(KPI_TYPE_WEIGHTS[KPIType.OUTPUT])
    expect(KPI_TYPE_WEIGHTS[KPIType.IMPACT]).toBeGreaterThan(KPI_TYPE_WEIGHTS[KPIType.OUTCOME])
  })
})
