'use client'

import { useParams, useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Breadcrumbs,
  Link as MuiLink,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Stack,
  Skeleton,
  Alert,
  LinearProgress,
  CircularProgress,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import AssessmentIcon from '@mui/icons-material/Assessment'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const KPI_TYPE_LABELS: Record<string, string> = {
  OUTPUT: 'Đầu ra',
  OUTCOME: 'Kết quả',
  IMPACT: 'Tác động',
  SAFETY: 'An toàn',
  SATISFACTION: 'Hài lòng',
  INCLUSION: 'Bao trùm',
  SUSTAINABILITY: 'Bền vững',
}

const ALERT_LEVEL_LABELS: Record<string, string> = {
  on_track: 'Đạt tiến độ',
  at_risk: 'Có nguy cơ',
  off_track: 'Lệch mục tiêu',
  no_data: 'Chưa có dữ liệu',
}

const ALERT_LEVEL_CHIP_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  on_track: 'success',
  at_risk: 'warning',
  off_track: 'error',
  no_data: 'default',
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getScoreColor(score: number | null): string {
  if (score == null) return 'text.disabled'
  if (score >= 90) return 'success.main'
  if (score >= 70) return 'warning.main'
  return 'error.main'
}

function getProgressColor(value: number | null): 'success' | 'warning' | 'error' | 'inherit' {
  if (value == null) return 'inherit'
  if (value >= 90) return 'success'
  if (value >= 70) return 'warning'
  return 'error'
}

// ─── Overall Score Indicator ─────────────────────────────────────────────────

function OverallScoreIndicator({ score }: { score: number | null }) {
  const displayScore = score != null ? Math.round(score) : null

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CircularProgress
        variant="determinate"
        value={displayScore ?? 0}
        size={120}
        thickness={6}
        sx={{
          color: getScoreColor(score),
          '& .MuiCircularProgress-circle': {
            strokeLinecap: 'round',
          },
        }}
      />
      {/* Background track */}
      <CircularProgress
        variant="determinate"
        value={100}
        size={120}
        thickness={6}
        sx={{
          color: 'grey.200',
          position: 'absolute',
          zIndex: -1,
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="h4"
          fontWeight={700}
          color={getScoreColor(score)}
        >
          {displayScore != null ? `${displayScore}` : '—'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          điểm
        </Typography>
      </Box>
    </Box>
  )
}


// ─── KPI Group Section ───────────────────────────────────────────────────────

interface KPIGroupData {
  type: string
  label: string
  kpis: Array<{
    id: string
    name: string
    unit: string | null
    targetValue: number | null
    currentValue: number | null
    achievement: number | null
    alertLevel: string
  }>
  count: number
  avgAchievement: number | null
  offTrackCount: number
}

function KPIGroupSection({ group }: { group: KPIGroupData }) {
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        {/* Group Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6" fontWeight={600}>
              {group.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {group.count} chỉ số
            </Typography>
          </Box>
          {group.offTrackCount > 0 && (
            <Chip
              icon={<WarningAmberIcon />}
              label={`${group.offTrackCount} lệch mục tiêu`}
              color="error"
              size="small"
              variant="outlined"
            />
          )}
        </Box>

        {/* Average Achievement Progress Bar */}
        {group.avgAchievement != null && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Đạt được trung bình
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {Math.round(group.avgAchievement)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min(group.avgAchievement, 100)}
              color={getProgressColor(group.avgAchievement)}
              sx={{ height: 8, borderRadius: 4 }}
            />
          </Box>
        )}

        {/* KPI Table */}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tên KPI</TableCell>
                <TableCell>Đơn vị</TableCell>
                <TableCell align="right">Mục tiêu</TableCell>
                <TableCell align="right">Thực tế</TableCell>
                <TableCell align="right">Đạt được (%)</TableCell>
                <TableCell>Trạng thái</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {group.kpis.map((kpi) => (
                <TableRow key={kpi.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {kpi.name}
                    </Typography>
                  </TableCell>
                  <TableCell>{kpi.unit ?? '—'}</TableCell>
                  <TableCell align="right">
                    {kpi.targetValue != null ? kpi.targetValue.toLocaleString('vi-VN') : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {kpi.currentValue != null ? kpi.currentValue.toLocaleString('vi-VN') : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {kpi.achievement != null
                      ? `${Math.round(kpi.achievement)}%`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={ALERT_LEVEL_LABELS[kpi.alertLevel] ?? kpi.alertLevel}
                      color={ALERT_LEVEL_CHIP_COLORS[kpi.alertLevel] ?? 'default'}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  )
}


// ─── Main Page Component ─────────────────────────────────────────────────────

export default function ImpactReportPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const {
    data: report,
    isLoading,
    error,
    refetch,
    isFetching,
  } = trpc.kpis.generateReport.useQuery(
    { projectId },
    { enabled: !!projectId }
  )

  // ─── Loading State ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="text" width={300} height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={200} sx={{ mb: 3 }} />
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid size={{ xs: 6, sm: 3 }} key={i}>
              <Skeleton variant="rectangular" height={80} />
            </Grid>
          ))}
        </Grid>
        <Skeleton variant="rectangular" height={300} />
      </Box>
    )
  }

  // ─── Error State ─────────────────────────────────────────────────────────

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error.message || 'Không thể tải báo cáo tác động.'}
        </Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push(`/projects/${projectId}`)}
        >
          Quay lại dự án
        </Button>
      </Box>
    )
  }

  if (!report) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Không có dữ liệu báo cáo.</Alert>
      </Box>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3 }}>
      {/* Breadcrumb */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push('/projects')}
        >
          Dự án
        </MuiLink>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push(`/projects/${projectId}`)}
        >
          {report.projectName}
        </MuiLink>
        <Typography color="text.primary">Báo cáo tác động</Typography>
      </Breadcrumbs>

      {/* Back Button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push(`/projects/${projectId}`)}
        sx={{ mb: 3 }}
      >
        Quay lại dự án
      </Button>

      {/* Header Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <AssessmentIcon color="primary" />
                <Typography variant="h5" fontWeight={700}>
                  Báo cáo tác động
                </Typography>
              </Stack>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                {report.projectName}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Tạo lúc: {formatDate(report.generatedAt)}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex', justifyContent: { xs: 'center', md: 'flex-end' } }}>
              <OverallScoreIndicator score={report.overallScore} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
              <Typography variant="h4" fontWeight={700}>
                {report.summary.totalKPIs}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Tổng KPI
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: 'success.main' }}>
            <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
              <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                <CheckCircleIcon color="success" fontSize="small" />
                <Typography variant="h4" fontWeight={700} color="success.main">
                  {report.summary.onTrack}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Đạt tiến độ
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: 'warning.main' }}>
            <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
              <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                <WarningAmberIcon color="warning" fontSize="small" />
                <Typography variant="h4" fontWeight={700} color="warning.main">
                  {report.summary.atRisk}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Có nguy cơ
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: 'error.main' }}>
            <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
              <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                <ErrorIcon color="error" fontSize="small" />
                <Typography variant="h4" fontWeight={700} color="error.main">
                  {report.summary.offTrack}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                Lệch mục tiêu
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* No Data indicator */}
      {report.summary.noData > 0 && (
        <Alert
          severity="info"
          icon={<HelpOutlineIcon />}
          sx={{ mb: 3 }}
        >
          {report.summary.noData} KPI chưa có dữ liệu đo lường.
        </Alert>
      )}

      {/* KPI Groups */}
      {report.kpisByType.length === 0 ? (
        <Alert severity="info">
          Chưa có KPI nào trong dự án. Hãy thêm KPI để tạo báo cáo tác động.
        </Alert>
      ) : (
        report.kpisByType.map((group) => (
          <KPIGroupSection key={group.type} group={group as unknown as KPIGroupData} />
        ))
      )}

      {/* Generate Report Button */}
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<AssessmentIcon />}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? 'Đang tạo báo cáo...' : 'Tạo báo cáo'}
        </Button>
      </Box>
    </Box>
  )
}
