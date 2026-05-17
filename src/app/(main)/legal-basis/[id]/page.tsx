'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Alert,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import VerifiedIcon from '@mui/icons-material/Verified'
import DeleteIcon from '@mui/icons-material/Delete'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Còn hiệu lực',
  EXPIRING: 'Sắp hết hạn',
  EXPIRED: 'Hết hiệu lực',
  SUPERSEDED: 'Đã thay thế',
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'error',
  SUPERSEDED: 'default',
}

const BASIS_TYPE_LABELS: Record<string, string> = {
  law: 'Luật',
  decree: 'Nghị định',
  circular: 'Thông tư',
  administrative_procedure: 'Thủ tục hành chính',
  internal_policy: 'Chính sách nội bộ',
  contract_clause: 'Điều khoản hợp đồng',
  standard: 'Tiêu chuẩn',
  guideline: 'Hướng dẫn',
}

const SCOPE_LABELS: Record<string, string> = {
  mandatory: 'Bắt buộc',
  conditional: 'Có điều kiện',
  recommended: 'Khuyến nghị',
  internal_best_practice: 'Thực hành nội bộ',
}

const DOC_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Chưa bắt đầu',
  DRAFTING: 'Đang soạn',
  NEEDS_INFO: 'Cần bổ sung',
  IN_REVIEW: 'Đang xem xét',
  PENDING_APPROVAL: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  ARCHIVED: 'Lưu trữ',
  EXPIRED: 'Hết hiệu lực',
}

const DOC_STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default' | 'info' | 'primary'> = {
  NOT_STARTED: 'default',
  DRAFTING: 'info',
  NEEDS_INFO: 'warning',
  IN_REVIEW: 'primary',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  ARCHIVED: 'default',
  EXPIRED: 'error',
}


// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function LegalBasisDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  // State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  // tRPC queries & mutations
  const { data: basis, isLoading, refetch } = trpc.legalBasis.get.useQuery({ id })
  const verifyMutation = trpc.legalBasis.verify.useMutation({
    onSuccess: () => {
      setSnackbar({ open: true, message: 'Xác minh thành công', severity: 'success' })
      refetch()
    },
    onError: (error) => {
      setSnackbar({ open: true, message: error.message || 'Xác minh thất bại', severity: 'error' })
    },
  })
  const deleteMutation = trpc.legalBasis.delete.useMutation({
    onSuccess: () => {
      setSnackbar({ open: true, message: 'Đã lưu trữ căn cứ pháp lý', severity: 'success' })
      setTimeout(() => router.push('/legal-basis'), 1000)
    },
    onError: (error) => {
      setSnackbar({ open: true, message: error.message || 'Xóa thất bại', severity: 'error' })
    },
  })

  // Handlers
  const handleVerify = () => {
    verifyMutation.mutate({ id })
  }

  const handleDelete = () => {
    setDeleteDialogOpen(false)
    deleteMutation.mutate({ id })
  }


  // ─── Loading State ───────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={32} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 1 }} />
      </Box>
    )
  }

  if (!basis) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary">
          Không tìm thấy căn cứ pháp lý
        </Typography>
        <Button component={Link} href="/legal-basis" sx={{ mt: 2 }}>
          Quay lại danh sách
        </Button>
      </Box>
    )
  }

  const linkedDocuments = basis.documents?.map((d) => d.document) ?? []

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink component={Link} href="/legal-basis" underline="hover" color="inherit">
          Căn cứ pháp lý
        </MuiLink>
        <Typography color="text.primary" noWrap sx={{ maxWidth: 400 }}>
          {basis.title}
        </Typography>
      </Breadcrumbs>

      {/* Page Header with Actions */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h4" gutterBottom noWrap>
            {basis.title}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              label={STATUS_LABELS[basis.status] ?? basis.status}
              color={STATUS_COLORS[basis.status] ?? 'default'}
              size="small"
            />
            <Chip
              label={BASIS_TYPE_LABELS[basis.basisType] ?? basis.basisType}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => router.push(`/legal-basis/${id}/edit`)}
          >
            Chỉnh sửa
          </Button>
          <Button
            variant="outlined"
            color="info"
            startIcon={<VerifiedIcon />}
            onClick={handleVerify}
            disabled={verifyMutation.isPending}
          >
            {verifyMutation.isPending ? 'Đang xác minh...' : 'Xác minh lại'}
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteDialogOpen(true)}
            disabled={deleteMutation.isPending}
          >
            Xóa
          </Button>
        </Stack>
      </Box>


      {/* Detail Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Thông tin chi tiết
          </Typography>
          <Grid container spacing={3}>
            {/* Số hiệu */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="caption" color="text.secondary">
                Số hiệu
              </Typography>
              <Typography variant="body1" fontWeight={500}>
                {basis.documentNumber}
              </Typography>
            </Grid>

            {/* Tiêu đề */}
            <Grid size={{ xs: 12, sm: 6, md: 8 }}>
              <Typography variant="caption" color="text.secondary">
                Tiêu đề
              </Typography>
              <Typography variant="body1" fontWeight={500}>
                {basis.title}
              </Typography>
            </Grid>

            {/* Cơ quan ban hành */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="caption" color="text.secondary">
                Cơ quan ban hành
              </Typography>
              <Typography variant="body1">
                {basis.issuingAuth}
              </Typography>
            </Grid>

            {/* Ngày hiệu lực */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="caption" color="text.secondary">
                Ngày hiệu lực
              </Typography>
              <Typography variant="body1">
                {formatDate(basis.effectiveDate)}
              </Typography>
            </Grid>

            {/* Ngày hết hạn */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="caption" color="text.secondary">
                Ngày hết hạn
              </Typography>
              <Typography variant="body1" color={basis.expiryDate && new Date(basis.expiryDate) < new Date() ? 'error.main' : 'text.primary'}>
                {formatDate(basis.expiryDate)}
              </Typography>
            </Grid>

            {/* Trạng thái */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="caption" color="text.secondary">
                Trạng thái
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                <Chip
                  label={STATUS_LABELS[basis.status] ?? basis.status}
                  color={STATUS_COLORS[basis.status] ?? 'default'}
                  size="small"
                />
              </Box>
            </Grid>

            {/* Loại */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="caption" color="text.secondary">
                Loại
              </Typography>
              <Typography variant="body1">
                {BASIS_TYPE_LABELS[basis.basisType] ?? basis.basisType}
              </Typography>
            </Grid>

            {/* Phạm vi áp dụng */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="caption" color="text.secondary">
                Phạm vi áp dụng
              </Typography>
              <Typography variant="body1">
                {SCOPE_LABELS[basis.scope] ?? basis.scope}
              </Typography>
            </Grid>


            {/* Tóm tắt */}
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">
                Tóm tắt
              </Typography>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                {basis.summary || '—'}
              </Typography>
            </Grid>

            {/* URL toàn văn */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="caption" color="text.secondary">
                URL toàn văn
              </Typography>
              {basis.fullTextUrl ? (
                <MuiLink
                  href={basis.fullTextUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                >
                  Xem toàn văn
                  <OpenInNewIcon fontSize="small" />
                </MuiLink>
              ) : (
                <Typography variant="body1" color="text.secondary">—</Typography>
              )}
            </Grid>

            {/* Xác minh lần cuối */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="caption" color="text.secondary">
                Xác minh lần cuối
              </Typography>
              <Typography variant="body1">
                {formatDate(basis.lastVerified)}
              </Typography>
            </Grid>

            {/* Người xác minh */}
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="caption" color="text.secondary">
                Người xác minh
              </Typography>
              <Typography variant="body1">
                {basis.verifiedBy || '—'}
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>


      {/* Linked Documents Section */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Tài liệu liên kết
          </Typography>
          {linkedDocuments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Chưa có tài liệu nào được liên kết với căn cứ pháp lý này.
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Mã tài liệu</TableCell>
                    <TableCell>Tên tài liệu</TableCell>
                    <TableCell>Trạng thái</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {linkedDocuments.map((doc) => (
                    <TableRow
                      key={doc.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => router.push(`/documents/${doc.id}`)}
                    >
                      <TableCell>
                        <MuiLink component={Link} href={`/documents/${doc.id}`} underline="hover">
                          {doc.code}
                        </MuiLink>
                      </TableCell>
                      <TableCell>{doc.name}</TableCell>
                      <TableCell>
                        <Chip
                          label={DOC_STATUS_LABELS[doc.status] ?? doc.status}
                          color={DOC_STATUS_COLORS[doc.status] ?? 'default'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>


      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Xác nhận xóa</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Bạn có chắc chắn muốn xóa (lưu trữ) căn cứ pháp lý &quot;{basis.title}&quot;?
            Trạng thái sẽ được chuyển thành &quot;Đã thay thế&quot;.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Hủy</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Xóa
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
