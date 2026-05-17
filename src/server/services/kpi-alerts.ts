import { calculateAchievement } from '../routers/kpis'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlertLevel = 'on_track' | 'at_risk' | 'off_track' | 'no_data'

export interface KPIAlertInfo {
  level: AlertLevel
  label: string
  color: string
  achievement: number | null
}

/**
 * Dữ liệu KPI tối thiểu cần thiết cho việc đánh giá off-track.
 */
export interface KPIForAlert {
  id?: string
  targetValue: number | null | undefined
  currentValue: number | null | undefined
  direction: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Ngưỡng mặc định: dưới 70% là off-track */
export const DEFAULT_OFF_TRACK_THRESHOLD = 70

/** Ngưỡng mặc định: từ 90% trở lên là on-track */
export const DEFAULT_ON_TRACK_THRESHOLD = 90

/** Nhãn tiếng Việt cho các mức cảnh báo */
export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = {
  on_track: 'Đạt tiến độ',
  at_risk: 'Có nguy cơ',
  off_track: 'Lệch mục tiêu',
  no_data: 'Chưa có dữ liệu',
}

/** Màu sắc cho các mức cảnh báo */
export const ALERT_LEVEL_COLORS: Record<AlertLevel, string> = {
  on_track: 'green',
  at_risk: 'yellow',
  off_track: 'red',
  no_data: 'grey',
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Xác định mức cảnh báo dựa trên phần trăm đạt được.
 *
 * - achievement >= 90%: 'on_track' (xanh)
 * - achievement >= 70%: 'at_risk' (vàng)
 * - achievement < 70%: 'off_track' (đỏ)
 * - achievement null: 'no_data' (xám)
 */
export function getKPIAlertLevel(
  achievement: number | null,
  options?: { offTrackThreshold?: number; onTrackThreshold?: number }
): AlertLevel {
  if (achievement == null) {
    return 'no_data'
  }

  const onTrackThreshold = options?.onTrackThreshold ?? DEFAULT_ON_TRACK_THRESHOLD
  const offTrackThreshold = options?.offTrackThreshold ?? DEFAULT_OFF_TRACK_THRESHOLD

  if (achievement >= onTrackThreshold) {
    return 'on_track'
  }
  if (achievement >= offTrackThreshold) {
    return 'at_risk'
  }
  return 'off_track'
}

/**
 * Kiểm tra xem KPI có đang lệch mục tiêu (off-track) không.
 * Trả về true nếu achievement < threshold (mặc định 70%).
 */
export function isKPIOffTrack(
  kpi: KPIForAlert,
  threshold: number = DEFAULT_OFF_TRACK_THRESHOLD
): boolean {
  const achievement = calculateAchievement(
    kpi.targetValue ?? null,
    kpi.currentValue ?? null,
    kpi.direction
  )

  // Nếu không có dữ liệu, không coi là off-track
  if (achievement == null) {
    return false
  }

  return achievement < threshold
}

/**
 * Lọc danh sách KPIs, chỉ giữ lại những KPI đang lệch mục tiêu.
 */
export function getOffTrackKPIs<T extends KPIForAlert>(
  kpis: T[],
  threshold: number = DEFAULT_OFF_TRACK_THRESHOLD
): T[] {
  return kpis.filter((kpi) => isKPIOffTrack(kpi, threshold))
}

/**
 * Lấy thông tin cảnh báo đầy đủ cho một KPI.
 */
export function getKPIAlertInfo(kpi: KPIForAlert): KPIAlertInfo {
  const achievement = calculateAchievement(
    kpi.targetValue ?? null,
    kpi.currentValue ?? null,
    kpi.direction
  )

  const level = getKPIAlertLevel(achievement)

  return {
    level,
    label: ALERT_LEVEL_LABELS[level],
    color: ALERT_LEVEL_COLORS[level],
    achievement,
  }
}
