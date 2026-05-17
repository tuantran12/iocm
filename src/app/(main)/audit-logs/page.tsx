'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Box,
  Typography,
  Paper,
  TextField,
  InputAdornment,
  MenuItem,
  Stack,
  Pagination,
  Skeleton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Tooltip,
} from '@mui/material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import SearchIcon from '@mui/icons-material/Search'
import VisibilityIcon from '@mui/icons-material/Visibility'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import { trpc } from '@/lib/trpc'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuditLogDetail {
  id: string
  userId: string
  action: string
  targetType: string
  targetId: string
  timestamp: Date | string
  ipAddress: string | null
  beforeVal: unknown
  afterVal: unknown
  user: { id: string; name: string; email: string } | null
}

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const TARGET_TYPE_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'documents', label: 'Tài liệu' },
  { value: 'members', label: 'Hội viên' },
  { value: 'groups', label: 'Nhóm' },
  { value: 'partners', label: 'Đối tác' },
  { value: 'agreements', label: 'Hợp đồng' },
  { value: 'products', label: 'Sản phẩm' },
  { value: 'projects', label: 'Dự án' },
  { value: 'kpis', label: 'KPI' },
  { value: 'fees', label: 'Phí' },
  { value: 'events', label: 'Sự kiện' },
  { value: 'tasks', label: 'Công việc' },
  { value: 'users', label: 'Người dùng' },
  { value: 'auth', label: 'Xác thực' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

function getTargetTypeLabel(type: string): string {
  const found = TARGET_TYPE_OPTIONS.find((o) => o.value === type)
  return found?.label ?? type
}

function exportToCsv(items: any[]) {
  const headers = ['Thời gian', 'Người dùng', 'Email', 'Hành động', 'Đối tượng', 'ID đối tượng']
  const rows = items.map((item) => [
    formatDateTime(item.timestamp),
    item.user?.name ?? item.userId,
    item.user?.email ?? '',
    item.action,
    item.targetType,
    item.targetId,
  ])
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function AuditLogsPage() {
  // Filter state
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [targetType, setTargetType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Pagination state
  const [page, setPage] = useState(0)
  const pageSize = 25

  // Detail dialog state
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Debounce search
  const searchTimeout = useMemo(() => ({ current: null as NodeJS.Timeout | null }), [])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(0)
    }, 400)
  }, [searchTimeout])

  // Build query input
  const queryInput = useMemo(() => ({
    page,
    pageSize,
    search: debouncedSearch || undefined,
    targetType: targetType || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  }), [page, pageSize, debouncedSearch, targetType, dateFrom, dateTo])

  // tRPC queries
  const { data, isLoading } = trpc.auditLogs.list.useQuery(queryInput)
  const { data: detailData } = trpc.auditLogs.get.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId },
  )
  const detail = detailData as AuditLogDetail | null | undefined

  const totalPages = useMemo(() => {
    if (!data?.total) return 0
    return Math.ceil(data.total / pageSize)
  }, [data?.total, pageSize])

  // DataGrid columns
  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'timestamp',
      headerName: 'Thời gian',
      width: 180,
      valueFormatter: (value: string) => formatDateTime(value),
    },
    {
      field: 'user',
      headerName: 'Người dùng',
      width: 180,
      valueGetter: (_value: unknown, row: any) => row.user?.name ?? row.userId,
    },
    {
      field: 'action',
      headerName: 'Hành động',
      width: 220,
    },
    {
      field: 'targetType',
      headerName: 'Đối tượng',
      width: 140,
      renderCell: (params) => (
        <Chip
          label={getTargetTypeLabel(params.value)}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'targetId',
      headerName: 'ID đối tượng',
      width: 200,
    },
    {
      field: 'actions',
      headerName: '',
      width: 60,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Tooltip title="Xem chi tiết">
          <IconButton
            size="small"
            onClick={() => setSelectedId(params.row.id)}
            aria-label="Xem chi tiết"
          >
            <VisibilityIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ], [])

  const handleExport = () => {
    if (data?.items) {
      exportToCsv(data.items)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Nhật ký kiểm toán
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Theo dõi tất cả hoạt động trong hệ thống.
            {data?.total != null && ` Tổng cộng ${data.total} bản ghi.`}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<FileDownloadIcon />}
          onClick={handleExport}
          disabled={!data?.items?.length}
          sx={{ whiteSpace: 'nowrap', textTransform: 'none' }}
        >
          Xuất CSV
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <TextField
            placeholder="Tìm kiếm hành động, đối tượng..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            size="small"
            sx={{ minWidth: 260 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            select
            label="Loại đối tượng"
            value={targetType}
            onChange={(e) => { setTargetType(e.target.value); setPage(0) }}
            size="small"
            sx={{ minWidth: 160 }}
          >
            {TARGET_TYPE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="date"
            label="Từ ngày"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 150 }}
          />
          <TextField
            type="date"
            label="Đến ngày"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
            size="small"
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ minWidth: 150 }}
          />
        </Stack>
      </Paper>

      {/* Data Table */}
      <Paper sx={{ mb: 3 }}>
        {isLoading ? (
          <Box sx={{ p: 2 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} variant="text" height={40} sx={{ mb: 0.5 }} />
            ))}
          </Box>
        ) : (
          <DataGrid
            rows={data?.items ?? []}
            columns={columns}
            hideFooter
            disableRowSelectionOnClick
            autoHeight
            sx={{
              border: 'none',
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: 'action.hover',
              },
            }}
          />
        )}
      </Paper>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Pagination
            count={totalPages}
            page={page + 1}
            onChange={(_, newPage) => setPage(newPage - 1)}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Chi tiết nhật ký kiểm toán</DialogTitle>
        <DialogContent dividers>
          {detail ? (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Thời gian</Typography>
                <Typography>{formatDateTime(detail.timestamp)}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Người dùng</Typography>
                <Typography>{detail.user?.name ?? detail.userId} ({detail.user?.email})</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Hành động</Typography>
                <Typography>{detail.action}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Đối tượng</Typography>
                <Typography>{getTargetTypeLabel(detail.targetType)} — {detail.targetId}</Typography>
              </Box>
              {detail.ipAddress && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Địa chỉ IP</Typography>
                  <Typography>{detail.ipAddress}</Typography>
                </Box>
              )}
              {detail.beforeVal != null ? (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Giá trị trước</Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 200, overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                      {String(JSON.stringify(detail.beforeVal, null, 2))}
                    </pre>
                  </Paper>
                </Box>
              ) : null}
              {detail.afterVal != null ? (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Giá trị sau</Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 200, overflow: 'auto' }}>
                    <pre style={{ margin: 0, fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                      {String(JSON.stringify(detail.afterVal, null, 2))}
                    </pre>
                  </Paper>
                </Box>
              ) : null}
            </Stack>
          ) : (
            <Skeleton variant="rectangular" height={200} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedId(null)}>Đóng</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
