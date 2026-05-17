'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  Tabs,
  Tab,
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  IconButton,
  Tooltip,
  Snackbar,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AddIcon from '@mui/icons-material/Add'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import SpeedIcon from '@mui/icons-material/Speed'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'Đề xuất',
  PLANNING: 'Lập kế hoạch',
  ACTIVE: 'Đang triển khai',
  PAUSED: 'Tạm dừng',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  PROPOSED: 'default',
  PLANNING: 'info',
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'primary',
  CANCELLED: 'error',
}

const PILOT_STATUS_LABELS: Record<string, string> = {
  planning: 'Lập kế hoạch',
  deploying: 'Đang triển khai',
  active: 'Hoạt động',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

const PILOT_STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  planning: 'default',
  deploying: 'info',
  active: 'success',
  completed: 'primary',
  cancelled: 'error',
}

const RISK_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  critical: 'Nghiêm trọng',
}

const MILESTONE_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Mở',
  IN_PROGRESS: 'Đang thực hiện',
  BLOCKED: 'Bị chặn',
  IN_REVIEW: 'Đang xem xét',
  DONE: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}

const MILESTONE_STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  OPEN: 'default',
  IN_PROGRESS: 'info',
  BLOCKED: 'error',
  IN_REVIEW: 'warning',
  DONE: 'success',
  CANCELLED: 'error',
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '—'
  return num.toLocaleString('vi-VN') + ' VNĐ'
}

// ─── Tab Panel Component ─────────────────────────────────────────────────────

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`project-tabpanel-${index}`}
      aria-labelledby={`project-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </Box>
  )
}

// ─── Info Tab ────────────────────────────────────────────────────────────────

interface ProjectData {
  id: string
  name: string
  type: string
  status: string
  goal?: string | null
  targetGroup?: string | null
  ownerId: string
  startDate?: string | Date | null
  endDate?: string | Date | null
  budget?: number | string | null
  riskLevel?: string | null
  createdAt: string | Date
}

function InfoTab({ project }: { project: ProjectData }) {
  const fields: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Tên dự án', value: project.name },
    { label: 'Loại dự án', value: project.type },
    {
      label: 'Trạng thái',
      value: (
        <Chip
          label={STATUS_LABELS[project.status] ?? project.status}
          color={STATUS_COLORS[project.status] ?? 'default'}
          size="small"
        />
      ),
    },
    { label: 'Mục tiêu', value: project.goal || '—' },
    { label: 'Đối tượng mục tiêu', value: project.targetGroup || '—' },
    { label: 'Chủ dự án', value: project.ownerId ? project.ownerId.slice(0, 8) + '...' : '—' },
    { label: 'Ngày bắt đầu', value: formatDate(project.startDate) },
    { label: 'Ngày kết thúc', value: formatDate(project.endDate) },
    { label: 'Ngân sách', value: formatCurrency(project.budget) },
    {
      label: 'Mức rủi ro',
      value: project.riskLevel ? (
        <Chip
          label={RISK_LABELS[project.riskLevel] ?? project.riskLevel}
          size="small"
          color={
            project.riskLevel === 'high' || project.riskLevel === 'critical'
              ? 'error'
              : project.riskLevel === 'medium'
              ? 'warning'
              : 'success'
          }
          variant="outlined"
        />
      ) : '—',
    },
    { label: 'Ngày tạo', value: formatDate(project.createdAt) },
  ]

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Thông tin dự án
        </Typography>
        <Grid container spacing={2}>
          {fields.map(({ label, value }) => (
            <Grid size={{ xs: 12, sm: 6 }} key={label}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                {typeof value === 'string' ? (
                  <Typography variant="body2">{value}</Typography>
                ) : (
                  value
                )}
              </Box>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  )
}

// ─── Pilots Tab ──────────────────────────────────────────────────────────────

interface PilotRecord {
  id: string
  deploymentArea: string
  status: string
  beneficiaryGroup?: string | null
  product?: { id: string; name: string } | null
  createdAt: string | Date
}

function PilotsTab({ pilots, projectId }: { pilots: PilotRecord[]; projectId: string }) {
  const router = useRouter()

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push(`/projects/${projectId}/pilots/new`)}
        >
          Tạo pilot
        </Button>
      </Box>
      {!pilots || pilots.length === 0 ? (
        <Alert severity="info">Chưa có pilot nào được triển khai.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Khu vực triển khai</TableCell>
                <TableCell>Sản phẩm</TableCell>
                <TableCell>Nhóm hưởng lợi</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell>Ngày tạo</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pilots.map((pilot) => (
                <TableRow key={pilot.id}>
                  <TableCell>{pilot.deploymentArea}</TableCell>
                  <TableCell>{pilot.product?.name ?? '—'}</TableCell>
                  <TableCell>{pilot.beneficiaryGroup ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={PILOT_STATUS_LABELS[pilot.status] ?? pilot.status}
                      color={PILOT_STATUS_COLORS[pilot.status] ?? 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{formatDate(pilot.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

// ─── KPI Type Labels ─────────────────────────────────────────────────────────

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

// ─── KPI Achievement Helper ──────────────────────────────────────────────────

function calcAchievement(
  target: number | null | undefined,
  actual: number | null | undefined,
  direction: string
): number | null {
  if (target == null || actual == null || target === 0) return null
  switch (direction) {
    case 'decrease_is_good':
      return actual === 0 ? (target > 0 ? Infinity : null) : (target / actual) * 100
    case 'maintain':
      return 100 - (Math.abs(actual - target) / target) * 100
    default:
      return (actual / target) * 100
  }
}

function getAlertLevel(achievement: number | null): string {
  if (achievement == null) return 'no_data'
  if (achievement >= 90) return 'on_track'
  if (achievement >= 70) return 'at_risk'
  return 'off_track'
}

// ─── KPI Tab ─────────────────────────────────────────────────────────────────

interface KPIRecord {
  id: string
  name: string
  type: string
  unit?: string | null
  direction: string
  targetValue?: number | null
  currentValue?: number | null
  baselineValue?: number | null
}

function KPITab({ projectId }: { projectId: string }) {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [measureKpi, setMeasureKpi] = useState<KPIRecord | null>(null)
  const { data: kpis, isLoading } = trpc.kpis.list.useQuery({ projectId })

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={80} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={200} />
      </Box>
    )
  }

  const kpiList = (kpis ?? []) as unknown as KPIRecord[]

  // Calculate achievements and alert levels
  const enrichedKPIs = kpiList.map((kpi) => {
    const achievement = calcAchievement(kpi.targetValue, kpi.currentValue, kpi.direction)
    const alertLevel = getAlertLevel(achievement)
    return { ...kpi, achievement, alertLevel }
  })

  // Summary counts
  const totalKPIs = enrichedKPIs.length
  const onTrack = enrichedKPIs.filter((k) => k.alertLevel === 'on_track').length
  const atRisk = enrichedKPIs.filter((k) => k.alertLevel === 'at_risk').length
  const offTrack = enrichedKPIs.filter((k) => k.alertLevel === 'off_track').length

  // Overall achievement (average of KPIs with data)
  const kpisWithData = enrichedKPIs.filter((k) => k.achievement != null && isFinite(k.achievement))
  const overallAchievement = kpisWithData.length > 0
    ? Math.round(kpisWithData.reduce((sum, k) => sum + (k.achievement ?? 0), 0) / kpisWithData.length)
    : null

  return (
    <Box>
      {/* Action Button */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setAddDialogOpen(true)}
        >
          Thêm KPI
        </Button>
      </Box>

      {totalKPIs === 0 ? (
        <Alert severity="info">
          Chưa có KPI nào. Nhấn &quot;Thêm KPI&quot; để tạo chỉ số đo lường cho dự án.
        </Alert>
      ) : (
        <>
          {/* Summary Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Typography variant="h4" fontWeight={700}>{totalKPIs}</Typography>
                  <Typography variant="body2" color="text.secondary">Tổng KPI</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ borderLeft: 4, borderColor: 'success.main' }}>
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Typography variant="h4" fontWeight={700} color="success.main">{onTrack}</Typography>
                  <Typography variant="body2" color="text.secondary">Đạt tiến độ</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ borderLeft: 4, borderColor: 'warning.main' }}>
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Typography variant="h4" fontWeight={700} color="warning.main">{atRisk}</Typography>
                  <Typography variant="body2" color="text.secondary">Có nguy cơ</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Card sx={{ borderLeft: 4, borderColor: 'error.main' }}>
                <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                  <Typography variant="h4" fontWeight={700} color="error.main">{offTrack}</Typography>
                  <Typography variant="body2" color="text.secondary">Lệch mục tiêu</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Overall Progress Bar */}
          {overallAchievement != null && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Tiến độ tổng thể
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {overallAchievement}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(overallAchievement, 100)}
                  color={overallAchievement >= 90 ? 'success' : overallAchievement >= 70 ? 'warning' : 'error'}
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </CardContent>
            </Card>
          )}

          {/* KPI Table */}
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tên KPI</TableCell>
                  <TableCell>Loại</TableCell>
                  <TableCell>Đơn vị</TableCell>
                  <TableCell align="right">Mục tiêu</TableCell>
                  <TableCell align="right">Thực tế</TableCell>
                  <TableCell align="right">Đạt được (%)</TableCell>
                  <TableCell>Trạng thái</TableCell>
                  <TableCell align="center">Hành động</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {enrichedKPIs.map((kpi) => (
                  <TableRow key={kpi.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {kpi.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={KPI_TYPE_LABELS[kpi.type] ?? kpi.type}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{kpi.unit ?? '—'}</TableCell>
                    <TableCell align="right">
                      {kpi.targetValue != null ? kpi.targetValue.toLocaleString('vi-VN') : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {kpi.currentValue != null ? kpi.currentValue.toLocaleString('vi-VN') : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {kpi.achievement != null && isFinite(kpi.achievement)
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
                    <TableCell align="center">
                      <Tooltip title="Đo lường">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => setMeasureKpi(kpi)}
                        >
                          <SpeedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Add KPI Dialog */}
      <AddKPIDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        projectId={projectId}
      />

      {/* Measure KPI Dialog */}
      <MeasureKPIDialog
        open={measureKpi !== null}
        onClose={() => setMeasureKpi(null)}
        kpi={measureKpi}
        projectId={projectId}
      />
    </Box>
  )
}

// ─── Add KPI Dialog ──────────────────────────────────────────────────────────

function AddKPIDialog({
  open,
  onClose,
  projectId,
}: {
  open: boolean
  onClose: () => void
  projectId: string
}) {
  const utils = trpc.useUtils()
  const createMutation = trpc.kpis.create.useMutation({
    onSuccess: () => {
      utils.kpis.list.invalidate({ projectId })
      onClose()
      setForm(initialForm)
    },
  })

  const initialForm = {
    name: '',
    type: 'OUTPUT' as string,
    unit: '',
    direction: 'increase_is_good',
    targetValue: '',
    baselineValue: '',
  }

  const [form, setForm] = useState(initialForm)

  const handleSubmit = () => {
    if (!form.name.trim()) return
    createMutation.mutate({
      projectId,
      name: form.name.trim(),
      type: form.type as 'OUTPUT' | 'OUTCOME' | 'IMPACT' | 'SAFETY' | 'SATISFACTION' | 'INCLUSION' | 'SUSTAINABILITY',
      unit: form.unit || null,
      direction: form.direction,
      targetValue: form.targetValue ? parseFloat(form.targetValue) : null,
      baselineValue: form.baselineValue ? parseFloat(form.baselineValue) : null,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Thêm KPI mới</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Tên KPI"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
            required
            size="small"
          />
          <TextField
            label="Loại KPI"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            select
            fullWidth
            size="small"
          >
            {Object.entries(KPI_TYPE_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Đơn vị đo"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            fullWidth
            size="small"
            placeholder="VD: %, người, điểm"
          />
          <TextField
            label="Hướng đo"
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value })}
            select
            fullWidth
            size="small"
          >
            <MenuItem value="increase_is_good">Tăng là tốt</MenuItem>
            <MenuItem value="decrease_is_good">Giảm là tốt</MenuItem>
            <MenuItem value="maintain">Duy trì ổn định</MenuItem>
          </TextField>
          <TextField
            label="Giá trị mục tiêu"
            value={form.targetValue}
            onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
            fullWidth
            size="small"
            type="number"
          />
          <TextField
            label="Giá trị cơ sở (baseline)"
            value={form.baselineValue}
            onChange={(e) => setForm({ ...form, baselineValue: e.target.value })}
            fullWidth
            size="small"
            type="number"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Hủy</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!form.name.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? 'Đang tạo...' : 'Tạo KPI'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Measure KPI Dialog ───────────────────────────────────────────────────────

function MeasureKPIDialog({
  open,
  onClose,
  kpi,
  projectId,
}: {
  open: boolean
  onClose: () => void
  kpi: KPIRecord | null
  projectId: string
}) {
  const utils = trpc.useUtils()
  const [actual, setActual] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const measureMutation = trpc.kpis.measure.useMutation({
    onSuccess: () => {
      utils.kpis.list.invalidate({ projectId })
      setSnackbar({ open: true, message: 'Ghi nhận đo lường thành công!', severity: 'success' })
      handleClose()
    },
    onError: (error) => {
      setSnackbar({ open: true, message: error.message || 'Có lỗi xảy ra khi ghi nhận đo lường.', severity: 'error' })
    },
  })

  const handleClose = () => {
    setActual('')
    setEvidenceUrl('')
    onClose()
  }

  const handleSubmit = () => {
    if (!kpi || !actual.trim()) return
    const parsedActual = parseFloat(actual)
    if (isNaN(parsedActual)) return
    measureMutation.mutate({
      id: kpi.id,
      actual: parsedActual,
      evidenceUrl: evidenceUrl.trim() || null,
    })
  }

  if (!kpi) return null

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Đo lường KPI</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên KPI"
              value={kpi.name}
              fullWidth
              size="small"
              slotProps={{ input: { readOnly: true } }}
            />
            <TextField
              label="Giá trị mục tiêu"
              value={kpi.targetValue != null ? kpi.targetValue.toLocaleString('vi-VN') : '—'}
              fullWidth
              size="small"
              slotProps={{ input: { readOnly: true } }}
            />
            <TextField
              label="Giá trị đo lường trước đó"
              value={kpi.currentValue != null ? kpi.currentValue.toLocaleString('vi-VN') : 'Chưa có'}
              fullWidth
              size="small"
              slotProps={{ input: { readOnly: true } }}
            />
            <TextField
              label="Giá trị đo lường mới"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              fullWidth
              size="small"
              type="number"
              required
              placeholder="Nhập giá trị đo lường"
            />
            <TextField
              label="URL bằng chứng"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              fullWidth
              size="small"
              placeholder="https://..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Hủy</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!actual.trim() || isNaN(parseFloat(actual)) || measureMutation.isPending}
          >
            {measureMutation.isPending ? 'Đang ghi nhận...' : 'Ghi nhận'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </>
  )
}

// ─── Team Tab ────────────────────────────────────────────────────────────────

function TeamTab({ ownerId }: { ownerId: string }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Nhóm dự án
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Chủ dự án (Owner)
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {ownerId ? ownerId.slice(0, 8) + '...' : '—'}
            </Typography>
          </Grid>
        </Grid>
        <Alert severity="info" sx={{ mt: 2 }}>
          Quản lý thành viên nhóm dự án sẽ được mở rộng trong phiên bản tiếp theo.
        </Alert>
      </CardContent>
    </Card>
  )
}

// ─── Milestones Tab ──────────────────────────────────────────────────────────

interface MilestoneRecord {
  id: string
  title: string
  description?: string | null
  status: string
  dueDate?: string | Date | null
  priority: string
}

interface MilestoneProgress {
  total: number
  completed: number
  overdue: number
  percentage: number
}

function MilestonesTab({ projectId }: { projectId: string }) {
  const { data: milestones, isLoading: milestonesLoading } = trpc.projects.listMilestones.useQuery({ projectId })
  const { data: progress, isLoading: progressLoading } = trpc.projects.getMilestoneProgress.useQuery({ projectId })

  const isLoading = milestonesLoading || progressLoading

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={60} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={200} />
      </Box>
    )
  }

  const progressData = progress as MilestoneProgress | undefined
  const milestoneList = (milestones ?? []) as unknown as MilestoneRecord[]

  return (
    <Box>
      {/* Progress Summary */}
      {progressData && progressData.total > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Tiến độ tổng thể
            </Typography>
            <Box sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                  {progressData.completed}/{progressData.total} mốc hoàn thành
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {progressData.percentage}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progressData.percentage}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
            {progressData.overdue > 0 && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                <WarningAmberIcon color="error" fontSize="small" />
                <Typography variant="body2" color="error.main">
                  {progressData.overdue} mốc quá hạn
                </Typography>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {/* Milestones List */}
      {milestoneList.length === 0 ? (
        <Alert severity="info">Chưa có mốc tiến độ nào.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tên mốc</TableCell>
                <TableCell>Mô tả</TableCell>
                <TableCell>Hạn chót</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell>Quá hạn</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {milestoneList.map((milestone) => {
                const isOverdue =
                  milestone.dueDate &&
                  new Date(milestone.dueDate) < new Date() &&
                  milestone.status !== 'DONE' &&
                  milestone.status !== 'CANCELLED'

                return (
                  <TableRow key={milestone.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {milestone.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {milestone.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(milestone.dueDate)}</TableCell>
                    <TableCell>
                      <Chip
                        label={MILESTONE_STATUS_LABELS[milestone.status] ?? milestone.status}
                        color={MILESTONE_STATUS_COLORS[milestone.status] ?? 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {isOverdue ? (
                        <Chip
                          icon={<WarningAmberIcon />}
                          label="Quá hạn"
                          color="error"
                          size="small"
                          variant="outlined"
                        />
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [tabValue, setTabValue] = useState(0)

  const { data: project, isLoading, error } = trpc.projects.get.useQuery({ id })

  // ─── Loading State ───────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="text" width={200} height={30} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={48} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={400} />
      </Box>
    )
  }

  // ─── Error State ─────────────────────────────────────────────────────────────

  if (error || !project) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.message || 'Không tìm thấy dự án.'}
        </Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/projects')}
        >
          Quay lại danh sách
        </Button>
      </Box>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
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
        <Typography color="text.primary">{project.name}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h4">{project.name}</Typography>
            <Chip
              label={STATUS_LABELS[project.status] ?? project.status}
              color={STATUS_COLORS[project.status] ?? 'default'}
              size="small"
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {project.type}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/projects')}
        >
          Quay lại
        </Button>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          aria-label="Chi tiết dự án"
        >
          <Tab label="Thông tin" id="project-tab-0" aria-controls="project-tabpanel-0" />
          <Tab label="Pilot" id="project-tab-1" aria-controls="project-tabpanel-1" />
          <Tab label="KPI" id="project-tab-2" aria-controls="project-tabpanel-2" />
          <Tab label="Nhóm" id="project-tab-3" aria-controls="project-tabpanel-3" />
          <Tab label="Mốc tiến độ" id="project-tab-4" aria-controls="project-tabpanel-4" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
        <InfoTab project={project as unknown as ProjectData} />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <PilotsTab pilots={project.pilots as unknown as PilotRecord[]} projectId={id} />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <KPITab projectId={id} />
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <TeamTab ownerId={project.ownerId} />
      </TabPanel>

      <TabPanel value={tabValue} index={4}>
        <MilestonesTab projectId={id} />
      </TabPanel>
    </Box>
  )
}
