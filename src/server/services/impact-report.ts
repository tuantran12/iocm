import { KPIType } from '@prisma/client'
import { calculateAchievement } from '../routers/kpis'
import { getKPIAlertLevel, AlertLevel } from './kpi-alerts'
import { KPI_TYPE_CONFIG } from './kpi-types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KPIForReport {
  id: string
  projectId: string
  name: string
  type: KPIType
  unit: string | null
  direction: string
  baselineValue: number | null
  targetValue: number | null
  currentValue: number | null
  dataSource: string | null
  frequency: string | null
  responsible: string | null
  evidenceUrl: string | null
  lastMeasured: Date | null
}

export interface ProjectForReport {
  id: string
  name: string
}

export interface KPIWithAchievement extends KPIForReport {
  achievement: number | null
  alertLevel: AlertLevel
}

export interface KPIGroupReport {
  type: KPIType
  label: string
  kpis: KPIWithAchievement[]
  count: number
  avgAchievement: number | null
  offTrackCount: number
}

export interface ImpactReportSummary {
  totalKPIs: number
  onTrack: number
  atRisk: number
  offTrack: number
  noData: number
}

export interface ImpactReport {
  projectId: string
  projectName: string
  generatedAt: string
  overallScore: number | null
  kpisByType: KPIGroupReport[]
  summary: ImpactReportSummary
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Trọng số cho từng loại KPI khi tính điểm tổng hợp.
 * IMPACT và OUTCOME có trọng số cao hơn vì phản ánh tác động thực tế.
 */
export const KPI_TYPE_WEIGHTS: Record<KPIType, number> = {
  [KPIType.OUTPUT]: 1.0,
  [KPIType.OUTCOME]: 1.5,
  [KPIType.IMPACT]: 2.0,
  [KPIType.SAFETY]: 1.2,
  [KPIType.SATISFACTION]: 1.0,
  [KPIType.INCLUSION]: 1.3,
  [KPIType.SUSTAINABILITY]: 1.2,
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Tính phần trăm đạt được cho một KPI và xác định mức cảnh báo.
 */
function enrichKPIWithAchievement(kpi: KPIForReport): KPIWithAchievement {
  const achievement = calculateAchievement(
    kpi.targetValue,
    kpi.currentValue,
    kpi.direction
  )

  // Cap achievement at 100 for scoring purposes (over-achievement doesn't inflate score)
  const cappedAchievement = achievement != null ? Math.min(achievement, 100) : null

  const alertLevel = getKPIAlertLevel(cappedAchievement)

  return {
    ...kpi,
    achievement: cappedAchievement,
    alertLevel,
  }
}

/**
 * Nhóm KPIs theo loại và tính thống kê cho mỗi nhóm.
 */
function groupKPIsByType(kpis: KPIWithAchievement[]): KPIGroupReport[] {
  const allTypes: KPIType[] = [
    KPIType.OUTPUT,
    KPIType.OUTCOME,
    KPIType.IMPACT,
    KPIType.SAFETY,
    KPIType.SATISFACTION,
    KPIType.INCLUSION,
    KPIType.SUSTAINABILITY,
  ]

  return allTypes
    .map((type) => {
      const typeKPIs = kpis.filter((kpi) => kpi.type === type)
      const withData = typeKPIs.filter((kpi) => kpi.achievement != null)
      const offTrackCount = typeKPIs.filter((kpi) => kpi.alertLevel === 'off_track').length

      const avgAchievement = withData.length > 0
        ? withData.reduce((sum, kpi) => sum + (kpi.achievement ?? 0), 0) / withData.length
        : null

      return {
        type,
        label: KPI_TYPE_CONFIG[type].label,
        kpis: typeKPIs,
        count: typeKPIs.length,
        avgAchievement: avgAchievement != null ? Math.round(avgAchievement * 100) / 100 : null,
        offTrackCount,
      }
    })
    .filter((group) => group.count > 0)
}

/**
 * Tính điểm tác động tổng hợp (0-100) dựa trên trung bình có trọng số.
 * Trả về null nếu không có KPI nào có dữ liệu.
 */
function calculateOverallScore(kpis: KPIWithAchievement[]): number | null {
  const kpisWithData = kpis.filter((kpi) => kpi.achievement != null)

  if (kpisWithData.length === 0) {
    return null
  }

  let weightedSum = 0
  let totalWeight = 0

  for (const kpi of kpisWithData) {
    const weight = KPI_TYPE_WEIGHTS[kpi.type]
    weightedSum += (kpi.achievement ?? 0) * weight
    totalWeight += weight
  }

  if (totalWeight === 0) {
    return null
  }

  const score = weightedSum / totalWeight
  // Clamp to 0-100
  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100
}

/**
 * Tính tóm tắt trạng thái KPIs.
 */
function calculateSummary(kpis: KPIWithAchievement[]): ImpactReportSummary {
  return {
    totalKPIs: kpis.length,
    onTrack: kpis.filter((kpi) => kpi.alertLevel === 'on_track').length,
    atRisk: kpis.filter((kpi) => kpi.alertLevel === 'at_risk').length,
    offTrack: kpis.filter((kpi) => kpi.alertLevel === 'off_track').length,
    noData: kpis.filter((kpi) => kpi.alertLevel === 'no_data').length,
  }
}

/**
 * Tạo báo cáo tác động dự án từ dữ liệu KPI.
 *
 * @param project - Thông tin dự án (id, name)
 * @param kpis - Danh sách KPI của dự án
 * @returns Báo cáo tác động có cấu trúc
 */
export function generateImpactReport(
  project: ProjectForReport,
  kpis: KPIForReport[]
): ImpactReport {
  // Enrich KPIs with achievement and alert level
  const enrichedKPIs = kpis.map(enrichKPIWithAchievement)

  // Group by type
  const kpisByType = groupKPIsByType(enrichedKPIs)

  // Calculate overall score
  const overallScore = calculateOverallScore(enrichedKPIs)

  // Calculate summary
  const summary = calculateSummary(enrichedKPIs)

  return {
    projectId: project.id,
    projectName: project.name,
    generatedAt: new Date().toISOString(),
    overallScore,
    kpisByType,
    summary,
  }
}
