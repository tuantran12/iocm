'use client'

import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Stack,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  CircularProgress,
  Alert,
  Divider,
  Chip,
} from '@mui/material'
import AssessmentIcon from '@mui/icons-material/Assessment'
import TableChartIcon from '@mui/icons-material/TableChart'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { trpc } from '@/lib/trpc'
import { exportToExcel } from '@/lib/export-excel'
import { downloadReportPDF } from '@/lib/export-pdf'
import type { ExcelColumn } from '@/lib/export-excel'
import type { ReportSection } from '@/lib/export-pdf'

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportType = 'compliance' | 'membership' | 'projectImpact'

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
  { value: 'compliance', label: 'Tuân thủ tài liệu' },
  { value: 'membership', label: 'Hội viên' },
  { value: 'projectImpact', label: 'Tác động dự án' },
]

// ─── Reports Page ────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('compliance')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [generated, setGenerated] = useState(false)

  const complianceQuery = trpc.reports.compliance.useQuery(undefined, {
    enabled: generated && reportType === 'compliance',
  })
  const membershipQuery = trpc.reports.membership.useQuery(undefined, {
    enabled: generated && reportType === 'membership',
  })
  const projectImpactQuery = trpc.reports.projectImpact.useQuery(undefined, {
    enabled: generated && reportType === 'projectImpact',
  })

  const isLoading =
    (reportType === 'compliance' && complianceQuery.isLoading) ||
    (reportType === 'membership' && membershipQuery.isLoading) ||
    (reportType === 'projectImpact' && projectImpactQuery.isLoading)

  const activeError =
    reportType === 'compliance' ? complianceQuery.error :
    reportType === 'membership' ? membershipQuery.error :
    projectImpactQuery.error

  function handleGenerate() {
    setGenerated(true)
    // Refetch if already enabled
    if (reportType === 'compliance') complianceQuery.refetch()
    if (reportType === 'membership') membershipQuery.refetch()
    if (reportType === 'projectImpact') projectImpactQuery.refetch()
  }

  function handleTypeChange(value: ReportType) {
    setReportType(value)
    setGenerated(false)
  }

  // ─── Export Handlers ─────────────────────────────────────────────────────

  async function handleExportExcel() {
    const label = REPORT_OPTIONS.find((o) => o.value === reportType)?.label ?? ''
    const filename = `bao-cao-${reportType}-${new Date().toISOString().slice(0, 10)}`

    if (reportType === 'compliance' && complianceQuery.data) {
      const data = complianceQuery.data
      const rows: Record<string, unknown>[] = data.byCluster.map((c) => ({
        cluster: c.cluster,
        total: c.total,
        approved: c.approved,
        pending: c.pending,
        completionPct: c.total > 0 ? Math.round((c.approved / c.total) * 100) : 0,
      }))
      const columns: ExcelColumn[] = [
        { header: 'Nhóm tài liệu', key: 'cluster', width: 25 },
        { header: 'Tổng', key: 'total', width: 10 },
        { header: 'Đã duyệt', key: 'approved', width: 12 },
        { header: 'Đang chờ', key: 'pending', width: 12 },
        { header: '% Hoàn thành', key: 'completionPct', width: 14 },
      ]
      await exportToExcel(rows, columns, filename, { sheetName: label })
    }

    if (reportType === 'membership' && membershipQuery.data) {
      const data = membershipQuery.data
      const rows: Record<string, unknown>[] = data.byTier.map((t) => ({
        tierName: t.tierName,
        count: t.count,
      }))
      const columns: ExcelColumn[] = [
        { header: 'Cấp hội viên', key: 'tierName', width: 25 },
        { header: 'Số lượng', key: 'count', width: 12 },
      ]
      await exportToExcel(rows, columns, filename, { sheetName: label })
    }

    if (reportType === 'projectImpact' && projectImpactQuery.data) {
      const data = projectImpactQuery.data
      const rows: Record<string, unknown>[] = data.projects.map((p) => ({
        name: p.projectName,
        score: p.overallScore ?? 'N/A',
        totalKpis: p.summary.totalKPIs,
        onTrack: p.summary.onTrack,
        offTrack: p.summary.offTrack,
      }))
      const columns: ExcelColumn[] = [
        { header: 'Dự án', key: 'name', width: 30 },
        { header: 'Điểm tổng', key: 'score', width: 12 },
        { header: 'Tổng KPI', key: 'totalKpis', width: 12 },
        { header: 'Đạt', key: 'onTrack', width: 10 },
        { header: 'Chưa đạt', key: 'offTrack', width: 12 },
      ]
      await exportToExcel(rows, columns, filename, { sheetName: label })
    }
  }

  async function handleExportPDF() {
    const label = REPORT_OPTIONS.find((o) => o.value === reportType)?.label ?? ''
    const filename = `bao-cao-${reportType}-${new Date().toISOString().slice(0, 10)}`
    const sections: ReportSection[] = []

    if (reportType === 'compliance' && complianceQuery.data) {
      const data = complianceQuery.data
      sections.push({
        title: 'Tuân thủ theo nhóm tài liệu',
        headers: ['Nhóm', 'Tổng', 'Đã duyệt', 'Đang chờ', '% Hoàn thành'],
        rows: data.byCluster.map((c) => [
          c.cluster,
          String(c.total),
          String(c.approved),
          String(c.pending),
          `${c.total > 0 ? Math.round((c.approved / c.total) * 100) : 0}%`,
        ]),
      })
      sections.push({
        title: 'Theo trạng thái',
        headers: ['Trạng thái', 'Số lượng'],
        rows: data.byStatus.map((s) => [s.status, String(s.count)]),
      })
    }

    if (reportType === 'membership' && membershipQuery.data) {
      const data = membershipQuery.data
      sections.push({
        title: 'Hội viên theo cấp',
        headers: ['Cấp hội viên', 'Số lượng'],
        rows: data.byTier.map((t) => [t.tierName, String(t.count)]),
      })
      sections.push({
        title: 'Hội viên theo trạng thái',
        headers: ['Trạng thái', 'Số lượng'],
        rows: data.byStatus.map((s) => [s.status, String(s.count)]),
      })
    }

    if (reportType === 'projectImpact' && projectImpactQuery.data) {
      const data = projectImpactQuery.data
      sections.push({
        title: 'Tác động dự án',
        headers: ['Dự án', 'Điểm tổng', 'Tổng KPI', 'Đạt', 'Chưa đạt'],
        rows: data.projects.map((p) => [
          p.projectName,
          p.overallScore != null ? String(p.overallScore) : 'N/A',
          String(p.summary.totalKPIs),
          String(p.summary.onTrack),
          String(p.summary.offTrack),
        ]),
      })
    }

    await downloadReportPDF(`Báo cáo: ${label}`, sections, filename)
  }

  // ─── Report Data Available Check ────────────────────────────────────────

  const hasData =
    (reportType === 'compliance' && complianceQuery.data) ||
    (reportType === 'membership' && membershipQuery.data) ||
    (reportType === 'projectImpact' && projectImpactQuery.data)

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Báo cáo
      </Typography>

      {/* ─── Controls ──────────────────────────────────────────────────────── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel id="report-type-label">Loại báo cáo</InputLabel>
                <Select
                  labelId="report-type-label"
                  value={reportType}
                  label="Loại báo cáo"
                  onChange={(e) => handleTypeChange(e.target.value as ReportType)}
                >
                  {REPORT_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                label="Từ ngày"
                type="date"
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                label="Đến ngày"
                type="date"
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 2 }}>
              <Button
                variant="contained"
                fullWidth
                startIcon={<AssessmentIcon />}
                onClick={handleGenerate}
                disabled={isLoading}
              >
                Tạo báo cáo
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ─── Loading ───────────────────────────────────────────────────────── */}
      {generated && isLoading && (
        <Box display="flex" justifyContent="center" alignItems="center" py={6}>
          <CircularProgress size={40} />
          <Typography variant="body1" sx={{ ml: 2 }} color="text.secondary">
            Đang tạo báo cáo...
          </Typography>
        </Box>
      )}

      {/* ─── Error ─────────────────────────────────────────────────────────── */}
      {activeError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Không thể tạo báo cáo: {activeError.message}
        </Alert>
      )}

      {/* ─── Report Results ────────────────────────────────────────────────── */}
      {generated && hasData && !isLoading && (
        <>
          {/* Compliance Report */}
          {reportType === 'compliance' && complianceQuery.data && (
            <ComplianceResult data={complianceQuery.data} />
          )}

          {/* Membership Report */}
          {reportType === 'membership' && membershipQuery.data && (
            <MembershipResult data={membershipQuery.data} />
          )}

          {/* Project Impact Report */}
          {reportType === 'projectImpact' && projectImpactQuery.data && (
            <ProjectImpactResult data={projectImpactQuery.data} />
          )}

          {/* ─── Download Buttons ────────────────────────────────────────────── */}
          <Divider sx={{ my: 3 }} />
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<TableChartIcon />}
              onClick={handleExportExcel}
            >
              Xuất Excel
            </Button>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfIcon />}
              onClick={handleExportPDF}
            >
              Xuất PDF
            </Button>
          </Stack>
        </>
      )}
    </Box>
  )
}


// ─── Compliance Result Component ─────────────────────────────────────────────

type ComplianceData = {
  byCluster: { cluster: string; total: number; approved: number; pending: number }[]
  byStatus: { status: string; count: number }[]
  byPriority: { priority: string; count: number }[]
  overallCompletionPct: number
}

function ComplianceResult({ data }: { data: ComplianceData }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <AssessmentIcon color="primary" />
          <Typography variant="h6">Báo cáo tuân thủ tài liệu</Typography>
          <Chip
            label={`${data.overallCompletionPct}% hoàn thành`}
            color={data.overallCompletionPct >= 80 ? 'success' : 'warning'}
            size="small"
          />
        </Stack>

        <Grid container spacing={2}>
          {/* By Cluster */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="subtitle2" gutterBottom>
              Theo nhóm tài liệu
            </Typography>
            <Stack spacing={1}>
              {data.byCluster.map((c) => (
                <Stack key={c.cluster} direction="row" justifyContent="space-between">
                  <Typography variant="body2">{c.cluster}</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {c.approved}/{c.total}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Grid>

          {/* By Status */}
          <Grid size={{ xs: 12, md: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Theo trạng thái
            </Typography>
            <Stack spacing={1}>
              {data.byStatus.map((s) => (
                <Stack key={s.status} direction="row" justifyContent="space-between">
                  <Typography variant="body2">{s.status}</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {s.count}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Grid>

          {/* By Priority */}
          <Grid size={{ xs: 12, md: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Theo mức ưu tiên
            </Typography>
            <Stack spacing={1}>
              {data.byPriority.map((p) => (
                <Stack key={p.priority} direction="row" justifyContent="space-between">
                  <Typography variant="body2">{p.priority}</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {p.count}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

// ─── Membership Result Component ─────────────────────────────────────────────

type MembershipData = {
  byTier: { tierId: string; tierName: string; count: number }[]
  byStatus: { status: string; count: number }[]
  feesSummary: { collected: number; overdue: number; waived: number }
}

function MembershipResult({ data }: { data: MembershipData }) {
  const formatVND = (amount: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <AssessmentIcon color="primary" />
          <Typography variant="h6">Báo cáo hội viên</Typography>
        </Stack>

        <Grid container spacing={2}>
          {/* By Tier */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              Theo cấp hội viên
            </Typography>
            <Stack spacing={1}>
              {data.byTier.map((t) => (
                <Stack key={t.tierId} direction="row" justifyContent="space-between">
                  <Typography variant="body2">{t.tierName}</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {t.count}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Grid>

          {/* By Status */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              Theo trạng thái
            </Typography>
            <Stack spacing={1}>
              {data.byStatus.map((s) => (
                <Stack key={s.status} direction="row" justifyContent="space-between">
                  <Typography variant="body2">{s.status}</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {s.count}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Grid>

          {/* Fees Summary */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              Tổng hợp phí
            </Typography>
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Đã thu</Typography>
                <Typography variant="body2" fontWeight="bold" color="success.main">
                  {formatVND(data.feesSummary.collected)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Quá hạn</Typography>
                <Typography variant="body2" fontWeight="bold" color="error.main">
                  {formatVND(data.feesSummary.overdue)}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">Miễn/giảm</Typography>
                <Typography variant="body2" fontWeight="bold">
                  {data.feesSummary.waived}
                </Typography>
              </Stack>
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}


// ─── Project Impact Result Component ─────────────────────────────────────────

type ProjectImpactData = {
  projects: {
    projectId: string
    projectName: string
    overallScore: number | null
    summary: {
      totalKPIs: number
      onTrack: number
      atRisk: number
      offTrack: number
      noData: number
    }
    kpisByType: { type: string; label: string; count: number; avgAchievement: number | null }[]
    generatedAt: string
  }[]
  aggregate: { totalProjects: number; avgScore: number | null } | null
}

function ProjectImpactResult({ data }: { data: ProjectImpactData }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <AssessmentIcon color="primary" />
          <Typography variant="h6">Báo cáo tác động dự án</Typography>
          {data.aggregate && (
            <Chip
              label={`${data.aggregate.totalProjects} dự án`}
              size="small"
              color="info"
            />
          )}
        </Stack>

        {data.projects.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Không có dự án đang hoạt động.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {data.aggregate && data.aggregate.avgScore != null && (
              <Typography variant="body1">
                Điểm trung bình: <strong>{data.aggregate.avgScore}</strong>/100
              </Typography>
            )}

            {data.projects.map((project) => (
              <Card key={project.projectId} variant="outlined">
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2">{project.projectName}</Typography>
                    <Chip
                      label={
                        project.overallScore != null
                          ? `${project.overallScore} điểm`
                          : 'Chưa có dữ liệu'
                      }
                      size="small"
                      color={
                        project.overallScore == null
                          ? 'default'
                          : project.overallScore >= 70
                            ? 'success'
                            : project.overallScore >= 40
                              ? 'warning'
                              : 'error'
                      }
                    />
                  </Stack>
                  <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Tổng KPI: {project.summary.totalKPIs}
                    </Typography>
                    <Typography variant="caption" color="success.main">
                      Đạt: {project.summary.onTrack}
                    </Typography>
                    <Typography variant="caption" color="warning.main">
                      Cảnh báo: {project.summary.atRisk}
                    </Typography>
                    <Typography variant="caption" color="error.main">
                      Chưa đạt: {project.summary.offTrack}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}
