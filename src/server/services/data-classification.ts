import { Confidentiality } from '@prisma/client'

/**
 * Data Classification Service — Vietnamese labels, risk matrix, color mappings.
 *
 * Provides:
 * - Confidentiality level labels and colors
 * - Personal data level labels, descriptions, and colors
 * - Risk level labels and colors
 * - Risk classification function based on confidentiality + personal data level
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type PersonalDataLevel = 'none' | 'basic' | 'sensitive' | 'special_category'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ConfidentialityConfig {
  label: string
  description: string
  color: string
}

export interface PersonalDataLevelConfig {
  label: string
  description: string
  color: string
}

export interface RiskLevelConfig {
  label: string
  description: string
  color: string
}

// ─── Confidentiality Configuration ────────────────────────────────────────────

export const CONFIDENTIALITY_CONFIG: Record<Confidentiality, ConfidentialityConfig> = {
  [Confidentiality.PUBLIC]: {
    label: 'Công khai',
    description: 'Dữ liệu có thể công bố rộng rãi, không gây rủi ro khi tiết lộ',
    color: '#4caf50',
  },
  [Confidentiality.INTERNAL]: {
    label: 'Nội bộ',
    description: 'Dữ liệu chỉ dùng nội bộ Viện, không chia sẻ ra ngoài',
    color: '#2196f3',
  },
  [Confidentiality.CONFIDENTIAL]: {
    label: 'Bí mật',
    description: 'Dữ liệu nhạy cảm, chỉ người được ủy quyền mới truy cập',
    color: '#ff9800',
  },
  [Confidentiality.RESTRICTED]: {
    label: 'Hạn chế tối đa',
    description: 'Dữ liệu cực kỳ nhạy cảm, truy cập hạn chế nghiêm ngặt',
    color: '#f44336',
  },
  [Confidentiality.SECRET]: {
    label: 'Tuyệt mật',
    description: 'Dữ liệu tối mật, chỉ ban lãnh đạo cấp cao được truy cập',
    color: '#9c27b0',
  },
}

// ─── Personal Data Level Configuration ────────────────────────────────────────

export const PERSONAL_DATA_LEVEL_CONFIG: Record<PersonalDataLevel, PersonalDataLevelConfig> = {
  none: {
    label: 'Không có DLCN',
    description: 'Không chứa dữ liệu cá nhân',
    color: '#9e9e9e',
  },
  basic: {
    label: 'DLCN cơ bản',
    description: 'Chứa dữ liệu cá nhân cơ bản (họ tên, email, số điện thoại)',
    color: '#2196f3',
  },
  sensitive: {
    label: 'DLCN nhạy cảm',
    description: 'Chứa dữ liệu cá nhân nhạy cảm (sức khỏe, tài chính, vị trí)',
    color: '#ff9800',
  },
  special_category: {
    label: 'DLCN đặc biệt',
    description: 'Chứa dữ liệu cá nhân đặc biệt (chủng tộc, tôn giáo, sinh trắc học, trẻ em)',
    color: '#f44336',
  },
}

// ─── Risk Level Configuration ─────────────────────────────────────────────────

export const RISK_LEVEL_CONFIG: Record<RiskLevel, RiskLevelConfig> = {
  low: {
    label: 'Thấp',
    description: 'Rủi ro thấp, không cần biện pháp bảo vệ đặc biệt',
    color: '#4caf50',
  },
  medium: {
    label: 'Trung bình',
    description: 'Rủi ro trung bình, cần biện pháp bảo vệ tiêu chuẩn',
    color: '#ff9800',
  },
  high: {
    label: 'Cao',
    description: 'Rủi ro cao, cần biện pháp bảo vệ nâng cao và giám sát',
    color: '#f44336',
  },
  critical: {
    label: 'Nghiêm trọng',
    description: 'Rủi ro nghiêm trọng, cần biện pháp bảo vệ tối đa và phê duyệt đặc biệt',
    color: '#9c27b0',
  },
}

// ─── Risk Matrix ──────────────────────────────────────────────────────────────

/**
 * Risk matrix: confidentiality × personalDataLevel → riskLevel
 *
 * Rules (evaluated in priority order):
 * 1. Any + special_category = critical
 * 2. RESTRICTED or SECRET + any = critical
 * 3. CONFIDENTIAL + any personal data (basic/sensitive) = high
 * 4. CONFIDENTIAL + none = medium
 * 5. INTERNAL + sensitive = high
 * 6. INTERNAL + basic = medium
 * 7. INTERNAL + none = low
 * 8. PUBLIC + basic = medium
 * 9. PUBLIC + sensitive = high
 * 10. PUBLIC + none = low
 */
const RISK_MATRIX: Record<Confidentiality, Record<PersonalDataLevel, RiskLevel>> = {
  [Confidentiality.PUBLIC]: {
    none: 'low',
    basic: 'medium',
    sensitive: 'high',
    special_category: 'critical',
  },
  [Confidentiality.INTERNAL]: {
    none: 'low',
    basic: 'medium',
    sensitive: 'high',
    special_category: 'critical',
  },
  [Confidentiality.CONFIDENTIAL]: {
    none: 'medium',
    basic: 'high',
    sensitive: 'high',
    special_category: 'critical',
  },
  [Confidentiality.RESTRICTED]: {
    none: 'critical',
    basic: 'critical',
    sensitive: 'critical',
    special_category: 'critical',
  },
  [Confidentiality.SECRET]: {
    none: 'critical',
    basic: 'critical',
    sensitive: 'critical',
    special_category: 'critical',
  },
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Classify data risk based on confidentiality level and personal data level.
 * Returns the computed risk level.
 */
export function classifyDataRisk(
  confidentiality: Confidentiality,
  personalDataLevel: PersonalDataLevel
): RiskLevel {
  return RISK_MATRIX[confidentiality][personalDataLevel]
}

/**
 * Get Vietnamese label for a confidentiality level.
 */
export function getConfidentialityLabel(level: Confidentiality): string {
  return CONFIDENTIALITY_CONFIG[level].label
}

/**
 * Get Vietnamese label for a personal data level.
 */
export function getPersonalDataLevelLabel(level: PersonalDataLevel): string {
  return PERSONAL_DATA_LEVEL_CONFIG[level].label
}

/**
 * Get Vietnamese label for a risk level.
 */
export function getRiskLevelLabel(level: RiskLevel): string {
  return RISK_LEVEL_CONFIG[level].label
}

/**
 * Get color for a confidentiality level (for UI display).
 */
export function getConfidentialityColor(level: Confidentiality): string {
  return CONFIDENTIALITY_CONFIG[level].color
}

/**
 * Get color for a personal data level (for UI display).
 */
export function getPersonalDataLevelColor(level: PersonalDataLevel): string {
  return PERSONAL_DATA_LEVEL_CONFIG[level].color
}

/**
 * Get color for a risk level (for UI display).
 */
export function getRiskLevelColor(level: RiskLevel): string {
  return RISK_LEVEL_CONFIG[level].color
}

// ─── Label Records (useful for dropdowns) ─────────────────────────────────────

export const CONFIDENTIALITY_LABELS: Record<Confidentiality, string> = Object.fromEntries(
  Object.entries(CONFIDENTIALITY_CONFIG).map(([key, config]) => [key, config.label])
) as Record<Confidentiality, string>

export const PERSONAL_DATA_LEVEL_LABELS: Record<PersonalDataLevel, string> = Object.fromEntries(
  Object.entries(PERSONAL_DATA_LEVEL_CONFIG).map(([key, config]) => [key, config.label])
) as Record<PersonalDataLevel, string>

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = Object.fromEntries(
  Object.entries(RISK_LEVEL_CONFIG).map(([key, config]) => [key, config.label])
) as Record<RiskLevel, string>

/**
 * All valid personal data levels (useful for validation).
 */
export const PERSONAL_DATA_LEVELS: PersonalDataLevel[] = ['none', 'basic', 'sensitive', 'special_category']

/**
 * All valid risk levels (useful for validation).
 */
export const RISK_LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical']
