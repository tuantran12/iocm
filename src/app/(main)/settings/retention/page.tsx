'use client'

import { useState } from 'react'
import {
  Box,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  Snackbar,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as CheckIcon,
} from '@mui/icons-material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { trpc } from '@/lib/trpc'

// ─── Types ──────────────────────────────────────────────────────────────────

interface RetentionRuleForm {
  objectType: string
  retentionPeriod: string
  legalBasis: string
  archiveMethod: string
  deletionMethod: string
  approvalNeeded: boolean
}

const emptyForm: RetentionRuleForm = {
  objectType: '',
  retentionPeriod: '',
  legalBasis: '',
  archiveMethod: '',
  deletionMethod: '',
  approvalNeeded: true,
}

// ─── Main Page Component ────────────────────────────────────────────────────

export default function RetentionRulesPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RetentionRuleForm>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [checkResult, setCheckResult] = useState<{
    objectType: string
    message: string
    severity: 'success' | 'info' | 'warning'
  } | null>(null)

  // ─── tRPC Queries & Mutations ───────────────────────────────────────────

  const rulesQuery = trpc.retentionRules.list.useQuery()

  const createRule = trpc.retentionRules.create.useMutation({
    onSuccess: () => {
      handleCloseDialog()
      rulesQuery.refetch()
    },
    onError: (err) => setError(err.message),
  })

  const updateRule = trpc.retentionRules.update.useMutation({
    onSuccess: () => {
      handleCloseDialog()
      rulesQuery.refetch()
    },
    onError: (err) => setError(err.message),
  })

  const deleteRule = trpc.retentionRules.delete.useMutation({
    onSuccess: () => rulesQuery.refetch(),
    onError: (err) => setError(err.message),
  })

  const checkRetention = trpc.retentionRules.checkRetention.useMutation({
    onSuccess: (data) => {
      const count = data.itemsDueForAction?.length ?? 0
      if (count === 0) {
        setCheckResult({
          objectType: data.warnings?.objectType ?? '',
          message: 'Không có đối tượng nào quá hạn lưu trữ.',
          severity: 'success',
        })
      } else {
        const pending = data.warnings?.pendingApproval ?? 0
        const archived = data.warnings?.autoArchived ?? 0
        setCheckResult({
          objectType: data.warnings?.objectType ?? '',
          message: `Tìm thấy ${count} đối tượng quá hạn. Chờ phê duyệt: ${pending}, Tự động lưu trữ: ${archived}.`,
          severity: 'warning',
        })
      }
    },
    onError: (err) => setError(err.message),
  })

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (row: {
    id: string
    objectType: string
    retentionPeriod: string
    legalBasis: string | null
    archiveMethod: string | null
    deletionMethod: string | null
    approvalNeeded: boolean
  }) => {
    setEditingId(row.id)
    setForm({
      objectType: row.objectType,
      retentionPeriod: row.retentionPeriod,
      legalBasis: row.legalBasis ?? '',
      archiveMethod: row.archiveMethod ?? '',
      deletionMethod: row.deletionMethod ?? '',
      approvalNeeded: row.approvalNeeded,
    })
    setError(null)
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.objectType.trim()) {
      setError('Vui lòng nhập loại đối tượng')
      return
    }
    if (!form.retentionPeriod.trim()) {
      setError('Vui lòng nhập thời gian lưu trữ')
      return
    }

    const payload = {
      objectType: form.objectType.trim(),
      retentionPeriod: form.retentionPeriod.trim(),
      legalBasis: form.legalBasis.trim() || null,
      archiveMethod: form.archiveMethod.trim() || null,
      deletionMethod: form.deletionMethod.trim() || null,
      approvalNeeded: form.approvalNeeded,
    }

    if (editingId) {
      updateRule.mutate({ id: editingId, ...payload })
    } else {
      createRule.mutate(payload)
    }
  }

  const handleDelete = (id: string, objectType: string) => {
    if (confirm(`Bạn có chắc muốn xóa quy tắc lưu trữ cho "${objectType}"?`)) {
      deleteRule.mutate({ id })
    }
  }

  const handleCheck = (objectType: string) => {
    checkRetention.mutate({ objectType })
  }

  // ─── DataGrid Columns ─────────────────────────────────────────────────────

  const columns: GridColDef[] = [
    {
      field: 'objectType',
      headerName: 'Loại đối tượng',
      flex: 1,
      minWidth: 150,
    },
    {
      field: 'retentionPeriod',
      headerName: 'Thời gian lưu trữ',
      flex: 1,
      minWidth: 140,
    },
    {
      field: 'legalBasis',
      headerName: 'Căn cứ pháp lý',
      flex: 1,
      minWidth: 160,
      renderCell: (params) => params.value || '—',
    },
    {
      field: 'archiveMethod',
      headerName: 'Phương pháp lưu trữ',
      flex: 1,
      minWidth: 150,
      renderCell: (params) => params.value || '—',
    },
    {
      field: 'approvalNeeded',
      headerName: 'Cần phê duyệt',
      width: 130,
      renderCell: (params) => (
        <Chip
          label={params.value ? 'Có' : 'Không'}
          size="small"
          color={params.value ? 'warning' : 'default'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Thao tác',
      width: 160,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box>
          <Tooltip title="Kiểm tra">
            <IconButton
              size="small"
              color="info"
              onClick={() => handleCheck(params.row.objectType)}
              disabled={checkRetention.isPending}
            >
              <CheckIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Sửa">
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleOpenEdit(params.row)}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Xóa">
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDelete(params.row.id, params.row.objectType)}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ]

  const rows = rulesQuery.data ?? []

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>
          Quy tắc lưu trữ dữ liệu
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
        >
          Thêm quy tắc
        </Button>
      </Box>

      {deleteRule.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {deleteRule.error.message}
        </Alert>
      )}

      <DataGrid
        rows={rows}
        columns={columns}
        loading={rulesQuery.isLoading}
        autoHeight
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: { paginationModel: { pageSize: 10 } },
        }}
        disableRowSelectionOnClick
        sx={{
          '& .MuiDataGrid-cell': {
            alignItems: 'center',
          },
        }}
      />

      {/* ─── Create/Edit Dialog ──────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmit}>
          <DialogTitle>
            {editingId ? 'Sửa quy tắc lưu trữ' : 'Thêm quy tắc lưu trữ'}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}

              <TextField
                label="Loại đối tượng"
                value={form.objectType}
                onChange={(e) => setForm({ ...form, objectType: e.target.value })}
                required
                fullWidth
                autoFocus
                placeholder="VD: DocumentItem, ChatMessage, AuditLog..."
              />

              <TextField
                label="Thời gian lưu trữ"
                value={form.retentionPeriod}
                onChange={(e) => setForm({ ...form, retentionPeriod: e.target.value })}
                required
                fullWidth
                placeholder="VD: 5 năm, 10 năm, vĩnh viễn..."
              />

              <TextField
                label="Căn cứ pháp lý"
                value={form.legalBasis}
                onChange={(e) => setForm({ ...form, legalBasis: e.target.value })}
                fullWidth
                placeholder="VD: Luật Lưu trữ 2011, NĐ 01/2013..."
              />

              <TextField
                label="Phương pháp lưu trữ"
                value={form.archiveMethod}
                onChange={(e) => setForm({ ...form, archiveMethod: e.target.value })}
                fullWidth
                placeholder="VD: Chuyển sang cold storage, nén ZIP..."
              />

              <TextField
                label="Phương pháp xóa"
                value={form.deletionMethod}
                onChange={(e) => setForm({ ...form, deletionMethod: e.target.value })}
                fullWidth
                placeholder="VD: Xóa vĩnh viễn, ẩn danh hóa..."
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={form.approvalNeeded}
                    onChange={(e) => setForm({ ...form, approvalNeeded: e.target.checked })}
                  />
                }
                label="Cần phê duyệt trước khi xóa/lưu trữ"
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleCloseDialog} color="inherit">
              Hủy
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={createRule.isPending || updateRule.isPending}
            >
              {(createRule.isPending || updateRule.isPending) ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ─── Check Result Snackbar ───────────────────────────────────────── */}
      <Snackbar
        open={!!checkResult}
        autoHideDuration={6000}
        onClose={() => setCheckResult(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {checkResult ? (
          <Alert
            onClose={() => setCheckResult(null)}
            severity={checkResult.severity}
            sx={{ width: '100%' }}
          >
            <strong>{checkResult.objectType}:</strong> {checkResult.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
