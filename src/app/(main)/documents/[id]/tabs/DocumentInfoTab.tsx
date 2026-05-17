'use client'

import {
  Box,
  Grid,
  Typography,
  Paper,
  Chip,
  Divider,
} from '@mui/material'
import PersonIcon from '@mui/icons-material/Person'
import CalendarTodayIcon from '@mui/icons-material/CalendarToday'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { LegalBasisLinker } from '@/components/documents/LegalBasisLinker'

/** Map cluster enum to Vietnamese label */
const CLUSTER_LABELS: Record<string, string> = {
  CORE_FOUNDING: 'Hồ sơ thành lập',
  REGULATIONS: 'Quy chế/Quy trình',
  PERSONNEL: 'Nhân sự',
  PARTNERSHIP: 'Đối tác',
  CONTRACTS: 'Hợp đồng',
  TECHNOLOGY: 'Công nghệ',
  DATA: 'Dữ liệu',
  PILOT: 'Triển khai thí điểm',
  FINANCE: 'Tài chính',
  SECURITY: 'Bảo mật',
  REPORTING: 'Báo cáo',
}

/** Map priority to Vietnamese label and color */
const PRIORITY_MAP: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'error' }> = {
  LOW: { label: 'Thấp', color: 'default' },
  MEDIUM: { label: 'Trung bình', color: 'info' },
  HIGH: { label: 'Cao', color: 'warning' },
  CRITICAL: { label: 'Nghiêm trọng', color: 'error' },
}

/** Map confidentiality to Vietnamese label */
const CONFIDENTIALITY_LABELS: Record<string, string> = {
  PUBLIC: 'Công khai',
  INTERNAL: 'Nội bộ',
  RESTRICTED: 'Hạn chế',
  CONFIDENTIAL: 'Bí mật',
  SECRET: 'Tuyệt mật',
}

interface DocumentInfoTabProps {
  document: {
    id: string
    name: string
    code: string
    type: string
    cluster: string
    status: string
    priority: string
    confidentiality: string
    version: number
    ownerId: string | null
    reviewerId: string | null
    approverId: string | null
    deadline: string | Date | null
    effectiveDate: string | Date | null
    expiryDate: string | Date | null
    riskIfMissing: string | null
    completenessScore: number
    createdAt: string | Date
    updatedAt: string | Date
    legalBases?: Array<{
      id: string
      legalBasisId: string
      legalBasis: {
        id: string
        documentNumber: string
        title: string
        status: string
      }
    }>
  }
}

function formatDate(date: string | Date | null): string {
  if (!date) return '—'
  try {
    return format(new Date(date), 'dd/MM/yyyy', { locale: vi })
  } catch {
    return '—'
  }
}

function InfoRow({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <Box sx={{ py: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      {children ?? (
        <Typography variant="body2" fontWeight={500}>
          {value || '—'}
        </Typography>
      )}
    </Box>
  )
}

export function DocumentInfoTab({ document }: DocumentInfoTabProps) {
  const priorityInfo = PRIORITY_MAP[document.priority] ?? { label: document.priority, color: 'default' as const }
  const clusterLabel = CLUSTER_LABELS[document.cluster] ?? document.cluster
  const confidentialityLabel = CONFIDENTIALITY_LABELS[document.confidentiality] ?? document.confidentiality

  return (
    <Grid container spacing={3}>
      {/* Left column: Basic info */}
      <Grid size={{ xs: 12, md: 7 }}>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Thông tin chung
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <InfoRow label="Tên tài liệu" value={document.name} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <InfoRow label="Mã tài liệu" value={document.code} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <InfoRow label="Loại tài liệu" value={document.type} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <InfoRow label="Nhóm tài liệu" value={clusterLabel} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <InfoRow label="Mức ưu tiên">
                <Chip label={priorityInfo.label} color={priorityInfo.color} size="small" />
              </InfoRow>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <InfoRow label="Mức bảo mật" value={confidentialityLabel} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <InfoRow label="Phiên bản" value={`v${document.version}`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <InfoRow label="Điểm hoàn thiện" value={`${Math.round(document.completenessScore * 100)}%`} />
            </Grid>
            {document.riskIfMissing && (
              <Grid size={{ xs: 12 }}>
                <InfoRow label="Rủi ro nếu thiếu" value={document.riskIfMissing} />
              </Grid>
            )}
          </Grid>
        </Paper>
      </Grid>

      {/* Right column: People & Dates */}
      <Grid size={{ xs: 12, md: 5 }}>
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonIcon fontSize="small" />
            Người phụ trách
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <InfoRow label="Người sở hữu" value={document.ownerId ?? '(Chưa gán)'} />
          <InfoRow label="Người xem xét" value={document.reviewerId ?? '(Chưa gán)'} />
          <InfoRow label="Người phê duyệt" value={document.approverId ?? '(Chưa gán)'} />
        </Paper>

        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarTodayIcon fontSize="small" />
            Thời gian
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <InfoRow label="Hạn chót" value={formatDate(document.deadline)} />
          <InfoRow label="Ngày hiệu lực" value={formatDate(document.effectiveDate)} />
          <InfoRow label="Ngày hết hạn" value={formatDate(document.expiryDate)} />
          <InfoRow label="Ngày tạo" value={formatDate(document.createdAt)} />
          <InfoRow label="Cập nhật lần cuối" value={formatDate(document.updatedAt)} />
        </Paper>
      </Grid>

      {/* Legal Basis Linker — full width */}
      <Grid size={{ xs: 12 }}>
        <LegalBasisLinker
          documentId={document.id}
          linkedBases={document.legalBases ?? []}
        />
      </Grid>
    </Grid>
  )
}
