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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  MEMBERSHIP: 'Hội viên',
  MOU: 'Biên bản ghi nhớ',
  NDA: 'Bảo mật thông tin',
  DPA: 'Xử lý dữ liệu',
  SLA: 'Cam kết dịch vụ',
  TECH_DEPLOYMENT: 'Triển khai CN',
  TECH_TRANSFER: 'Chuyển giao CN',
  SPONSORSHIP: 'Tài trợ',
  RESEARCH: 'Nghiên cứu',
  DATA_SHARING: 'Chia sẻ dữ liệu',
  EVENT: 'Sự kiện',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  LEGAL_REVIEW: 'Xem xét pháp lý',
  NEGOTIATION: 'Đàm phán',
  PENDING_SIGNATURE: 'Chờ ký',
  SIGNED: 'Đã ký',
  ACTIVE: 'Hiệu lực',
  EXPIRING: 'Sắp hết hạn',
  EXPIRED: 'Hết hạn',
  TERMINATED: 'Chấm dứt',
  ARCHIVED: 'Lưu trữ',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  DRAFT: 'default',
  LEGAL_REVIEW: 'info',
  NEGOTIATION: 'warning',
  PENDING_SIGNATURE: 'primary',
  SIGNED: 'info',
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'error',
  TERMINATED: 'error',
  ARCHIVED: 'default',
}

const OBLIGATION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ thực hiện',
  IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Hoàn thành',
  OVERDUE: 'Quá hạn',
  WAIVED: 'Miễn trừ',
}

const OBLIGATION_STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  PENDING: 'default',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  OVERDUE: 'error',
  WAIVED: 'warning',
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

// ─── Tab Panel ───────────────────────────────────────────────────────────────

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box role="tabpanel" hidden={value !== index} id={`agreement-tabpanel-${index}`}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </Box>
  )
}

// ─── Info Tab ────────────────────────────────────────────────────────────────

function InfoTab({ agreement }: { agreement: Record<string, any> }) {
  const fields = [
    { label: 'Tiêu đề', value: agreement.title },
    { label: 'Loại', value: TYPE_LABELS[agreement.type] ?? agreement.type },
    { label: 'Bên A', value: agreement.partyA },
    { label: 'Bên B', value: agreement.partyB },
    { label: 'Đối tác', value: agreement.partner?.companyName ?? '—' },
    { label: 'Doanh nghiệp', value: agreement.enterprise?.legalNameVi ?? '—' },
    { label: 'Ngày hiệu lực', value: formatDate(agreement.effectiveDate) },
    { label: 'Ngày hết hạn', value: formatDate(agreement.expiryDate) },
    { label: 'Ngày nhắc gia hạn', value: formatDate(agreement.renewalNotice) },
    { label: 'Ngày tạo', value: formatDate(agreement.createdAt) },
    { label: 'Cập nhật lần cuối', value: formatDate(agreement.updatedAt) },
  ]

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Thông tin hợp đồng</Typography>
        <Grid container spacing={2}>
          {fields.map(({ label, value }) => (
            <Grid size={{ xs: 12, sm: 6 }} key={label}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body2">{value || '—'}</Typography>
            </Grid>
          ))}
          {agreement.signedFileUrl && (
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">File đã ký</Typography>
              <Box sx={{ mt: 0.5 }}>
                <MuiLink href={agreement.signedFileUrl} target="_blank" rel="noopener">
                  Tải xuống file
                </MuiLink>
              </Box>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  )
}

// ─── Obligations Tab ─────────────────────────────────────────────────────────

interface Obligation {
  id: string
  title: string
  description?: string
  responsible?: string
  deadline?: string | null
  status: string
  completedAt?: string | null
  notes?: string
}

function ObligationsTab({ obligations, agreementId }: { obligations: Obligation[]; agreementId: string }) {
  const utils = trpc.useUtils()
  const updateObligation = trpc.agreements.updateObligation.useMutation({
    onSuccess: () => utils.agreements.get.invalidate({ id: agreementId }),
  })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedObligation, setSelectedObligation] = useState<Obligation | null>(null)
  const [newStatus, setNewStatus] = useState('')
  const [notes, setNotes] = useState('')

  const handleOpenDialog = (obligation: Obligation) => {
    setSelectedObligation(obligation)
    setNewStatus(obligation.status)
    setNotes(obligation.notes ?? '')
    setDialogOpen(true)
  }

  const handleUpdateStatus = () => {
    if (!selectedObligation) return
    updateObligation.mutate({
      agreementId,
      obligationId: selectedObligation.id,
      status: newStatus as any,
      notes: notes || undefined,
    })
    setDialogOpen(false)
  }

  if (!obligations || obligations.length === 0) {
    return <Alert severity="info">Chưa có nghĩa vụ nào được ghi nhận.</Alert>
  }

  return (
    <>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nghĩa vụ</TableCell>
              <TableCell>Người phụ trách</TableCell>
              <TableCell>Hạn chót</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell>Ghi chú</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {obligations.map((ob) => (
              <TableRow key={ob.id}>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>{ob.title}</Typography>
                  {ob.description && (
                    <Typography variant="caption" color="text.secondary">{ob.description}</Typography>
                  )}
                </TableCell>
                <TableCell>{ob.responsible ?? '—'}</TableCell>
                <TableCell>{formatDate(ob.deadline)}</TableCell>
                <TableCell>
                  <Chip
                    label={OBLIGATION_STATUS_LABELS[ob.status] ?? ob.status}
                    color={OBLIGATION_STATUS_COLORS[ob.status] ?? 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>{ob.notes ?? '—'}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => handleOpenDialog(ob)}>
                    Cập nhật
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Update Obligation Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Cập nhật nghĩa vụ</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" fontWeight={500}>
              {selectedObligation?.title}
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Trạng thái</InputLabel>
              <Select
                value={newStatus}
                label="Trạng thái"
                onChange={(e) => setNewStatus(e.target.value)}
              >
                {Object.entries(OBLIGATION_STATUS_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Ghi chú"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
              size="small"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Hủy</Button>
          <Button
            variant="contained"
            onClick={handleUpdateStatus}
            disabled={updateObligation.isPending}
          >
            Lưu
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

// ─── Linked Entities Tab ─────────────────────────────────────────────────────

function LinkedEntitiesTab({ agreement }: { agreement: Record<string, any> }) {
  const links = [
    { label: 'Đối tác công nghệ', value: agreement.partner?.companyName, href: agreement.partnerId ? `/partners/${agreement.partnerId}` : null },
    { label: 'Doanh nghiệp hội viên', value: agreement.enterprise?.legalNameVi, href: agreement.enterpriseId ? `/members/${agreement.enterpriseId}` : null },
    { label: 'Dự án', value: agreement.projectId ?? null, href: agreement.projectId ? `/projects/${agreement.projectId}` : null },
    { label: 'Sản phẩm', value: agreement.productId ?? null, href: agreement.productId ? `/products/${agreement.productId}` : null },
  ]

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>Liên kết</Typography>
        <Grid container spacing={2}>
          {links.map(({ label, value, href }) => (
            <Grid size={{ xs: 12, sm: 6 }} key={label}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Box sx={{ mt: 0.5 }}>
                {value && href ? (
                  <MuiLink href={href} underline="hover">{value}</MuiLink>
                ) : (
                  <Typography variant="body2" color="text.secondary">—</Typography>
                )}
              </Box>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  )
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function AgreementDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [tabValue, setTabValue] = useState(0)

  const { data: agreement, isLoading, error } = trpc.agreements.get.useQuery({ id })

  // Status change
  const utils = trpc.useUtils()
  const updateStatus = trpc.agreements.updateStatus.useMutation({
    onSuccess: () => utils.agreements.get.invalidate({ id }),
  })

  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [targetStatus, setTargetStatus] = useState('')
  const [statusReason, setStatusReason] = useState('')

  const handleStatusChange = () => {
    if (!targetStatus) return
    updateStatus.mutate({ id, status: targetStatus as any, reason: statusReason || undefined })
    setStatusDialogOpen(false)
    setTargetStatus('')
    setStatusReason('')
  }

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="rectangular" height={48} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={400} />
      </Box>
    )
  }

  if (error || !agreement) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.message || 'Không tìm thấy hợp đồng.'}
        </Alert>
        <Button variant="outlined" onClick={() => router.push('/agreements')}>
          Quay lại danh sách
        </Button>
      </Box>
    )
  }

  const agreementData = agreement as unknown as Record<string, any>
  const obligations = (agreementData.keyObligations ?? []) as Obligation[]

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push('/agreements')}
        >
          Hợp đồng
        </MuiLink>
        <Typography color="text.primary">{agreement.title}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h4">{agreement.title}</Typography>
            <Chip
              label={STATUS_LABELS[agreement.status] ?? agreement.status}
              color={STATUS_COLORS[agreement.status] ?? 'default'}
              size="small"
            />
            <Chip
              label={TYPE_LABELS[agreement.type] ?? agreement.type}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setStatusDialogOpen(true)}
          >
            Chuyển trạng thái
          </Button>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => router.push(`/agreements/${id}/edit`)}
          >
            Chỉnh sửa
          </Button>
        </Stack>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} aria-label="Chi tiết hợp đồng">
          <Tab label="Thông tin" />
          <Tab label="Nghĩa vụ" />
          <Tab label="Liên kết" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <InfoTab agreement={agreementData} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <ObligationsTab obligations={obligations} agreementId={id} />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <LinkedEntitiesTab agreement={agreementData} />
      </TabPanel>

      {/* Status Change Dialog */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Chuyển trạng thái hợp đồng</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">
              Trạng thái hiện tại: <strong>{STATUS_LABELS[agreement.status] ?? agreement.status}</strong>
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Trạng thái mới</InputLabel>
              <Select
                value={targetStatus}
                label="Trạng thái mới"
                onChange={(e) => setTargetStatus(e.target.value)}
              >
                {Object.entries(STATUS_LABELS)
                  .filter(([key]) => key !== agreement.status)
                  .map(([key, label]) => (
                    <MenuItem key={key} value={key}>{label}</MenuItem>
                  ))}
              </Select>
            </FormControl>
            <TextField
              label="Lý do (tùy chọn)"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              multiline
              rows={2}
              size="small"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Hủy</Button>
          <Button
            variant="contained"
            onClick={handleStatusChange}
            disabled={!targetStatus || updateStatus.isPending}
          >
            Xác nhận
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
