'use client'

import { useState } from 'react'
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import HistoryIcon from '@mui/icons-material/History'
import DescriptionIcon from '@mui/icons-material/Description'
import { trpc } from '@/lib/trpc'

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: 'Bản nháp',
  signed: 'Đã ký',
  active: 'Hiệu lực',
  expired: 'Hết hạn',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'info' | 'success' | 'error' | 'warning'> = {
  draft: 'default',
  signed: 'info',
  active: 'success',
  expired: 'error',
}

const LIFECYCLE_STEPS = ['draft', 'signed', 'active', 'expired']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return '—'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return num.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function MembershipAgreementDetailPage() {
  const params = useParams()
  const router = useRouter()
  const memberId = params.id as string
  const agreementId = params.agreementId as string

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState('')
  const [statusChangeNote, setStatusChangeNote] = useState('')

  // ─── Queries & Mutations ───────────────────────────────────────────────────

  const { data: agreement, isLoading, error, refetch } = trpc.memberAgreements.get.useQuery(
    { id: agreementId },
  )

  const updateStatusMutation = trpc.memberAgreements.updateStatus.useMutation({
    onSuccess: () => {
      refetch()
      setStatusChangeNote('')
    },
  })

  const uploadMutation = trpc.memberAgreements.upload.useMutation({
    onSuccess: () => {
      refetch()
      setUploadDialogOpen(false)
      setFileUrl('')
    },
  })

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleUploadSignedFile() {
    if (!fileUrl.trim()) return
    uploadMutation.mutate({ id: agreementId, signedFileUrl: fileUrl.trim() })
  }

  function handleMarkAsSigned() {
    updateStatusMutation.mutate({
      id: agreementId,
      status: 'signed',
      changeNote: statusChangeNote || undefined,
    })
  }

  function handleActivate() {
    updateStatusMutation.mutate({
      id: agreementId,
      status: 'active',
      changeNote: statusChangeNote || undefined,
    })
  }

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={400} height={40} />
        <Skeleton variant="rectangular" height={200} sx={{ mt: 2 }} />
        <Skeleton variant="rectangular" height={300} sx={{ mt: 2 }} />
      </Box>
    )
  }

  // ─── Error State ───────────────────────────────────────────────────────────

  if (error || !agreement) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.message || 'Không tìm thấy thỏa thuận hội viên.'}
        </Alert>
        <Button variant="outlined" onClick={() => router.push(`/members/${memberId}`)}>
          Quay lại hội viên
        </Button>
      </Box>
    )
  }

  // ─── Derived Data ──────────────────────────────────────────────────────────

  const currentStatus = agreement.status
  const activeStepIndex = LIFECYCLE_STEPS.indexOf(currentStatus)
  const enterpriseName = agreement.enterprise?.legalNameVi ?? '—'

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push('/members')}
        >
          Hội viên
        </MuiLink>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push(`/members/${memberId}`)}
        >
          {enterpriseName}
        </MuiLink>
        <Typography color="text.primary">Thỏa thuận hội viên</Typography>
      </Breadcrumbs>

      {/* Page Title */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <DescriptionIcon fontSize="large" color="primary" />
        <Box>
          <Typography variant="h5">Thỏa thuận hội viên</Typography>
          <Typography variant="body2" color="text.secondary">
            {enterpriseName} — {agreement.tier?.name ?? '—'}
          </Typography>
        </Box>
        <Chip
          label={STATUS_LABELS[currentStatus] ?? currentStatus}
          color={STATUS_COLORS[currentStatus] ?? 'default'}
        />
      </Stack>

      {/* Lifecycle Stepper */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            Vòng đời thỏa thuận
          </Typography>
          <Stepper activeStep={activeStepIndex} alternativeLabel>
            {LIFECYCLE_STEPS.map((step) => (
              <Step key={step} completed={LIFECYCLE_STEPS.indexOf(step) < activeStepIndex}>
                <StepLabel>{STATUS_LABELS[step]}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </CardContent>
      </Card>

      {/* Agreement Details */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Chi tiết thỏa thuận
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Doanh nghiệp
              </Typography>
              <Typography variant="body2">{enterpriseName}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Cấp hội viên
              </Typography>
              <Typography variant="body2">{agreement.tier?.name ?? '—'}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Ngày hiệu lực
              </Typography>
              <Typography variant="body2">{formatDate(agreement.effectiveDate)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Ngày hết hạn
              </Typography>
              <Typography variant="body2">{formatDate(agreement.expiryDate)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Phí thường niên
              </Typography>
              <Typography variant="body2">{formatCurrency(agreement.annualFee as unknown as number)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Trạng thái
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <Chip
                  label={STATUS_LABELS[currentStatus] ?? currentStatus}
                  color={STATUS_COLORS[currentStatus] ?? 'default'}
                  size="small"
                />
              </Box>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">
                File đã ký
              </Typography>
              {agreement.signedFileUrl ? (
                <Box sx={{ mt: 0.5 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<DescriptionIcon />}
                    href={agreement.signedFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Xem file đã ký
                  </Button>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Chưa có file ký
                </Typography>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Thao tác
          </Typography>

          {/* Mutation error display */}
          {(updateStatusMutation.error || uploadMutation.error) && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {updateStatusMutation.error?.message || uploadMutation.error?.message}
            </Alert>
          )}

          {currentStatus === 'draft' && (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => setUploadDialogOpen(true)}
              >
                Tải lên file ký
              </Button>
              <Button
                variant="contained"
                startIcon={<CheckCircleIcon />}
                onClick={handleMarkAsSigned}
                disabled={updateStatusMutation.isPending}
              >
                Đánh dấu đã ký
              </Button>
            </Stack>
          )}

          {currentStatus === 'signed' && (
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => setUploadDialogOpen(true)}
              >
                Tải lên file ký
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<PlayArrowIcon />}
                onClick={handleActivate}
                disabled={updateStatusMutation.isPending}
              >
                Kích hoạt
              </Button>
            </Stack>
          )}

          {currentStatus === 'active' && (
            <Alert severity="success" icon={<CheckCircleIcon />}>
              Thỏa thuận đang có hiệu lực.
              {agreement.expiryDate && (
                <> Hết hạn: {formatDate(agreement.expiryDate)}</>
              )}
            </Alert>
          )}

          {currentStatus === 'expired' && (
            <Alert severity="warning">
              Thỏa thuận đã hết hạn vào ngày {formatDate(agreement.expiryDate)}.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Version History */}
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <HistoryIcon color="action" />
            <Typography variant="h6">Lịch sử thay đổi</Typography>
          </Stack>

          {agreement.versions && agreement.versions.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Phiên bản</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell>Người thay đổi</TableCell>
                    <TableCell>Ghi chú</TableCell>
                    <TableCell>Thời gian</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {agreement.versions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell>v{version.version}</TableCell>
                      <TableCell>
                        <Chip
                          label={STATUS_LABELS[version.status] ?? version.status}
                          color={STATUS_COLORS[version.status] ?? 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{version.changedBy}</TableCell>
                      <TableCell>{version.changeNote || '—'}</TableCell>
                      <TableCell>{formatDateTime(version.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">Chưa có lịch sử thay đổi.</Alert>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog
        open={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Tải lên file thỏa thuận đã ký</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="URL file đã ký"
            placeholder="https://storage.example.com/agreements/signed-file.pdf"
            fullWidth
            variant="outlined"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            helperText="Nhập URL của file thỏa thuận đã ký (PDF, hình ảnh scan, v.v.)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>Hủy</Button>
          <Button
            onClick={handleUploadSignedFile}
            variant="contained"
            disabled={!fileUrl.trim() || uploadMutation.isPending}
          >
            {uploadMutation.isPending ? 'Đang tải...' : 'Tải lên'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
