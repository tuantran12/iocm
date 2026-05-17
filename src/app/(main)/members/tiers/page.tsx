'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  Chip,
  IconButton,
  Tooltip,
  Stack,
  FormControlLabel,
  Alert,
  Snackbar,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { trpc } from '@/lib/trpc'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TierFormData {
  name: string
  description: string
  annualFee: string
  votingRight: boolean
  projectRight: boolean
  maxUsers: number
}

interface TierItem {
  id: string
  name: string
  description: string | null
  annualFee: string | number
  votingRight: boolean
  projectRight: boolean
  maxUsers: number
  _count: { members: number }
}

const EMPTY_FORM: TierFormData = {
  name: '',
  description: '',
  annualFee: '',
  votingRight: false,
  projectRight: false,
  maxUsers: 3,
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function MembershipTiersPage() {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTierId, setEditingTierId] = useState<string | null>(null)
  const [formData, setFormData] = useState<TierFormData>(EMPTY_FORM)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingTier, setDeletingTier] = useState<{ id: string; name: string } | null>(null)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  // ─── tRPC Queries & Mutations ──────────────────────────────────────────────

  const tiersQuery = trpc.tiers.list.useQuery()
  const tiers = (tiersQuery.data ?? []) as TierItem[]
  const createMutation = trpc.tiers.create.useMutation()
  const updateMutation = trpc.tiers.update.useMutation()
  const deleteMutation = trpc.tiers.delete.useMutation()

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleOpenCreate = useCallback(() => {
    setEditingTierId(null)
    setFormData(EMPTY_FORM)
    setDialogOpen(true)
  }, [])

  const handleOpenEdit = useCallback((tier: TierItem) => {
    setEditingTierId(tier.id)
    setFormData({
      name: tier.name,
      description: tier.description ?? '',
      annualFee: String(tier.annualFee),
      votingRight: tier.votingRight,
      projectRight: tier.projectRight,
      maxUsers: tier.maxUsers,
    })
    setDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setEditingTierId(null)
    setFormData(EMPTY_FORM)
  }, [])

  const handleOpenDelete = useCallback((tier: { id: string; name: string }) => {
    setDeletingTier(tier)
    setDeleteDialogOpen(true)
  }, [])

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false)
    setDeletingTier(null)
  }, [])

  const handleSubmit = useCallback(async () => {
    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      annualFee: formData.annualFee,
      benefits: {},
      accessRights: {},
      votingRight: formData.votingRight,
      projectRight: formData.projectRight,
      maxUsers: formData.maxUsers,
    }

    try {
      if (editingTierId) {
        await updateMutation.mutateAsync({ id: editingTierId, ...payload })
        setSnackbar({ open: true, message: 'Cập nhật cấp hội viên thành công', severity: 'success' })
      } else {
        await createMutation.mutateAsync(payload)
        setSnackbar({ open: true, message: 'Tạo cấp hội viên thành công', severity: 'success' })
      }
      handleCloseDialog()
      tiersQuery.refetch()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Có lỗi xảy ra'
      setSnackbar({ open: true, message, severity: 'error' })
    }
  }, [formData, editingTierId, createMutation, updateMutation, handleCloseDialog, tiersQuery])

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingTier) return
    try {
      await deleteMutation.mutateAsync({ id: deletingTier.id })
      setSnackbar({ open: true, message: 'Xóa cấp hội viên thành công', severity: 'success' })
      handleCloseDeleteDialog()
      tiersQuery.refetch()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Có lỗi xảy ra'
      setSnackbar({ open: true, message, severity: 'error' })
      handleCloseDeleteDialog()
    }
  }, [deletingTier, deleteMutation, handleCloseDeleteDialog, tiersQuery])

  const isFormValid = useMemo(() => {
    return formData.name.trim().length > 0 && formData.annualFee.trim().length > 0 && formData.maxUsers >= 1
  }, [formData])

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  // ─── Format helpers ─────────────────────────────────────────────────────────

  const formatCurrency = (value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return '—'
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Cấp hội viên
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý các cấp hội viên, phí thường niên và quyền lợi tương ứng.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Thêm cấp hội viên
        </Button>
      </Box>

      {/* Tiers Table */}
      <Card>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell sx={{ fontWeight: 600 }}>Tên cấp</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Mô tả</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Phí thường niên</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Quyền biểu quyết</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Quyền dự án</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Số user tối đa</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Số hội viên</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Thao tác</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tiersQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">Đang tải...</Typography>
                  </TableCell>
                </TableRow>
              )}
              {!tiersQuery.isLoading && tiers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">Chưa có cấp hội viên nào</Typography>
                  </TableCell>
                </TableRow>
              )}
              {tiers.map((tier) => {
                const memberCount = tier._count?.members ?? 0
                return (
                  <TableRow key={tier.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {tier.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tier.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">{formatCurrency(tier.annualFee)}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={tier.votingRight ? 'Có' : 'Không'}
                        color={tier.votingRight ? 'success' : 'default'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={tier.projectRight ? 'Có' : 'Không'}
                        color={tier.projectRight ? 'success' : 'default'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2">{tier.maxUsers}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip label={String(memberCount)} size="small" color="primary" variant="outlined" />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="Chỉnh sửa">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleOpenEdit(tier)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={memberCount > 0 ? 'Không thể xóa (còn hội viên)' : 'Xóa'}>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              disabled={memberCount > 0}
                              onClick={() => handleOpenDelete({ id: tier.id, name: tier.name })}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingTierId ? 'Chỉnh sửa cấp hội viên' : 'Thêm cấp hội viên mới'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              label="Tên cấp hội viên"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
              size="small"
              placeholder="VD: Hội viên Chiến lược"
            />
            <TextField
              label="Mô tả"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              fullWidth
              multiline
              rows={2}
              size="small"
              placeholder="Mô tả ngắn về cấp hội viên"
            />
            <TextField
              label="Phí thường niên (VNĐ)"
              value={formData.annualFee}
              onChange={(e) => setFormData((prev) => ({ ...prev, annualFee: e.target.value }))}
              fullWidth
              required
              size="small"
              type="number"
              placeholder="VD: 50000000"
            />
            <TextField
              label="Số user tối đa"
              value={formData.maxUsers}
              onChange={(e) => setFormData((prev) => ({ ...prev, maxUsers: Math.max(1, parseInt(e.target.value) || 1) }))}
              fullWidth
              required
              size="small"
              type="number"
              slotProps={{ htmlInput: { min: 1 } }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.votingRight}
                  onChange={(e) => setFormData((prev) => ({ ...prev, votingRight: e.target.checked }))}
                />
              }
              label="Quyền biểu quyết"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.projectRight}
                  onChange={(e) => setFormData((prev) => ({ ...prev, projectRight: e.target.checked }))}
                />
              }
              label="Quyền tham gia dự án"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog} color="inherit">
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!isFormValid || isSubmitting}
          >
            {isSubmitting ? 'Đang lưu...' : editingTierId ? 'Cập nhật' : 'Tạo mới'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleCloseDeleteDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Xác nhận xóa</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1 }}>
            Bạn có chắc chắn muốn xóa cấp hội viên <strong>&ldquo;{deletingTier?.name}&rdquo;</strong>?
            Thao tác này không thể hoàn tác.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDeleteDialog} color="inherit">
            Hủy
          </Button>
          <Button
            onClick={handleConfirmDelete}
            variant="contained"
            color="error"
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
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
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
