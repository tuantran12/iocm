import { KPIType } from '@prisma/client'

/**
 * KPI Type Configuration — Vietnamese labels, descriptions, directions, units, examples.
 *
 * Each KPI type has:
 * - label: Vietnamese display name
 * - description: What this type measures
 * - defaultDirection: Whether increase or decrease is good
 * - suggestedUnits: Common units for this type
 * - examples: Example KPIs for UI hints
 */

export type KPIDirection = 'increase_is_good' | 'decrease_is_good' | 'maintain'

export interface KPITypeConfig {
  label: string
  description: string
  defaultDirection: KPIDirection
  suggestedUnits: string[]
  examples: string[]
}

export const KPI_TYPE_CONFIG: Record<KPIType, KPITypeConfig> = {
  [KPIType.OUTPUT]: {
    label: 'Đầu ra',
    description: 'Đo lường sản phẩm/kết quả trực tiếp của hoạt động (bài báo, sản phẩm, báo cáo đã hoàn thành)',
    defaultDirection: 'increase_is_good',
    suggestedUnits: ['bài', 'sản phẩm', 'báo cáo', 'buổi', 'người tham gia'],
    examples: [
      'Số bài nghiên cứu đã công bố',
      'Số sản phẩm công nghệ đã triển khai',
      'Số buổi đào tạo đã tổ chức',
    ],
  },
  [KPIType.OUTCOME]: {
    label: 'Kết quả',
    description: 'Đo lường hiệu quả ngắn hạn — mức độ áp dụng, hài lòng, thay đổi hành vi sau triển khai',
    defaultDirection: 'increase_is_good',
    suggestedUnits: ['%', 'điểm', 'lượt', 'người'],
    examples: [
      'Tỷ lệ áp dụng công nghệ sau pilot',
      'Mức độ hài lòng người dùng cuối',
      'Số doanh nghiệp tiếp tục sử dụng sau 6 tháng',
    ],
  },
  [KPIType.IMPACT]: {
    label: 'Tác động',
    description: 'Đo lường tác động dài hạn đến xã hội, kinh tế hoặc cộng đồng',
    defaultDirection: 'increase_is_good',
    suggestedUnits: ['%', 'người', 'tỷ VNĐ', 'điểm'],
    examples: [
      'Số người dân được hưởng lợi từ dự án',
      'Giá trị kinh tế tạo ra cho cộng đồng',
      'Mức cải thiện chỉ số phát triển địa phương',
    ],
  },
  [KPIType.SAFETY]: {
    label: 'An toàn',
    description: 'Đo lường mức độ an toàn — sự cố, vi phạm, rủi ro (giảm là tốt)',
    defaultDirection: 'decrease_is_good',
    suggestedUnits: ['vụ', 'lần', 'ngày', '%'],
    examples: [
      'Số sự cố bảo mật dữ liệu',
      'Số vi phạm quy định pháp luật',
      'Số ngày gián đoạn dịch vụ',
    ],
  },
  [KPIType.SATISFACTION]: {
    label: 'Hài lòng',
    description: 'Đo lường mức độ hài lòng của các bên liên quan (hội viên, người dùng, đối tác)',
    defaultDirection: 'increase_is_good',
    suggestedUnits: ['điểm/5', 'điểm/10', '%', 'điểm NPS'],
    examples: [
      'Điểm hài lòng hội viên (khảo sát hàng năm)',
      'Điểm NPS của người dùng cuối',
      'Tỷ lệ hội viên gia hạn',
    ],
  },
  [KPIType.INCLUSION]: {
    label: 'Bao trùm',
    description: 'Đo lường mức độ bao trùm — tiếp cận nhóm yếu thế, vùng khó khăn, đa dạng',
    defaultDirection: 'increase_is_good',
    suggestedUnits: ['%', 'người', 'vùng', 'nhóm'],
    examples: [
      'Tỷ lệ người dùng từ vùng khó khăn',
      'Số nhóm yếu thế được tiếp cận',
      'Tỷ lệ nữ giới tham gia dự án',
    ],
  },
  [KPIType.SUSTAINABILITY]: {
    label: 'Bền vững',
    description: 'Đo lường tính bền vững — hiệu quả tài nguyên, phát thải, khả năng duy trì lâu dài',
    defaultDirection: 'decrease_is_good',
    suggestedUnits: ['tấn CO₂', 'kWh', '%', 'tháng'],
    examples: [
      'Lượng phát thải carbon của dự án',
      'Mức tiêu thụ năng lượng hệ thống',
      'Tỷ lệ tài nguyên tái sử dụng',
    ],
  },
}

/**
 * Get Vietnamese label for a KPI type.
 */
export function getKPITypeLabel(type: KPIType): string {
  return KPI_TYPE_CONFIG[type].label
}

/**
 * Get default direction for a KPI type.
 */
export function getKPITypeDefaultDirection(type: KPIType): KPIDirection {
  return KPI_TYPE_CONFIG[type].defaultDirection
}

/**
 * Get all KPI type labels as a record (useful for dropdowns).
 */
export const KPI_TYPE_LABELS: Record<KPIType, string> = Object.fromEntries(
  Object.entries(KPI_TYPE_CONFIG).map(([key, config]) => [key, config.label])
) as Record<KPIType, string>
