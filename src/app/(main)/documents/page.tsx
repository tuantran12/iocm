'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Stack,
  LinearProgress,
  Paper,
  IconButton,
  Tooltip,
  Button,
  CircularProgress,
} from '@mui/material'
import {
  DataGrid,
  type GridColDef,
  type GridSortModel,
  type GridPaginationModel,
  type GridRenderCellParams,
} from '@mui/x-data-grid'
import SearchIcon from '@mui/icons-material/Search'
import FilterListIcon from '@mui/icons-material/FilterList'
import ClearIcon from '@mui/icons-material/Clear'
import AddIcon from '@mui/icons-material/Add'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

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

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Chưa bắt đầu',
  DRAFTING: 'Đang soạn thảo',
  NEEDS_INFO: 'Cần bổ sung',
  IN_REVIEW: 'Đang xem xét',
  PENDING_APPROVAL: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  ARCHIVED: 'Lưu trữ',
  EXPIRED: 'Hết hiệu lực',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  NOT_STARTED: 'default',
  DRAFTING: 'info',
  NEEDS_INFO: 'warning',
  IN_REVIEW: 'secondary',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  ARCHIVED: 'default',
  EXPIRED: 'error',
}

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng',
}

const PRIORITY_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  LOW: 'default',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'error',
}

// ─── Helper: Check if document is overdue or critical ────────────────────────

function isOverdue(deadline: string | Date | null | undefined, status: string): boolean {
  if (!deadline) return false
  if (status === 'APPROVED' || status === 'ARCHIVED') return false
  return new Date(deadline) < new Date()
}

function isCriticalPriority(priority: string): boolean {
  return priority === 'CRITICAL' || priority === 'HIGH'
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function DocumentsPage() {
  const router = useRouter()

  // Filter state
  const [search, setSearch] = useState('')
  const [clusterFilter, setClusterFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')
  const [ownerFilter, setOwnerFilter] = useState<string>('')

  // DataGrid state
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  })
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: 'createdAt', sort: 'desc' },
  ])

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimeout = useMemo(() => ({ current: null as NodeJS.Timeout | null }), [])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPaginationModel((prev) => ({ ...prev, page: 0 }))
    }, 400)
  }, [searchTimeout])

  // Build query input
  type DocumentCluster = 'CORE_FOUNDING' | 'REGULATIONS' | 'PERSONNEL' | 'PARTNERSHIP' | 'CONTRACTS' | 'TECHNOLOGY' | 'DATA' | 'PILOT' | 'FINANCE' | 'SECURITY' | 'REPORTING'
  type DocumentStatus = 'NOT_STARTED' | 'DRAFTING' | 'NEEDS_INFO' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'ARCHIVED' | 'EXPIRED'
  type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    cluster: (clusterFilter || undefined) as DocumentCluster | undefined,
    status: (statusFilter || undefined) as DocumentStatus | undefined,
    priority: (priorityFilter || undefined) as Priority | undefined,
    ownerId: ownerFilter || undefined,
    sortField: sortModel[0]?.field || 'createdAt',
    sortDirection: (sortModel[0]?.sort || 'desc') as 'asc' | 'desc',
    page: paginationModel.page,
    pageSize: paginationModel.pageSize,
  }), [debouncedSearch, clusterFilter, statusFilter, priorityFilter, ownerFilter, sortModel, paginationModel])

  // tRPC query
  const { data, isLoading } = trpc.documents.list.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data?.items) return []
    return data.items.map((doc) => ({
      id: doc.id,
      code: doc.code,
      cluster: doc.cluster,
      name: doc.name,
      type: doc.type,
      status: doc.status,
      completenessScore: doc.completenessScore,
      priority: doc.priority,
      deadline: doc.deadline,
      ownerId: doc.ownerId,
      updatedAt: doc.updatedAt,
      approverId: doc.approverId,
    }))
  }, [data])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setClusterFilter('')
    setStatusFilter('')
    setPriorityFilter('')
    setOwnerFilter('')
    setPaginationModel((prev) => ({ ...prev, page: 0 }))
  }, [])

  const hasActiveFilters = !!(debouncedSearch || clusterFilter || statusFilter || priorityFilter || ownerFilter)

  // ─── Export Handlers ───────────────────────────────────────────────────────

  const buildExportParams = useCallback(() => {
    const params = new URLSearchParams()
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (clusterFilter) params.set('cluster', clusterFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (priorityFilter) params.set('priority', priorityFilter)
    if (ownerFilter) params.set('ownerId', ownerFilter)
    return params.toString()
  }, [debouncedSearch, clusterFilter, statusFilter, priorityFilter, ownerFilter])

  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)

  const handleExportExcel = useCallback(async () => {
    setExporting('excel')
    try {
      const query = buildExportParams()
      const url = `/api/documents/export/excel${query ? `?${query}` : ''}`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `ma-tran-tai-lieu_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('Excel export error:', error)
    } finally {
      setExporting(null)
    }
  }, [buildExportParams])

  const handleExportPdf = useCallback(async () => {
    setExporting('pdf')
    try {
      const query = buildExportParams()
      const url = `/api/documents/export/pdf${query ? `?${query}` : ''}`
      const response = await fetch(url)
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `ma-tran-tai-lieu_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      console.error('PDF export error:', error)
    } finally {
      setExporting(null)
    }
  }, [buildExportParams])

  // Navigate to document detail on row click
  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/documents/${params.id}`)
  }, [router])

  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'code',
      headerName: 'Mã tài liệu',
      width: 140,
      sortable: true,
    },
    {
      field: 'cluster',
      headerName: 'Nhóm',
      width: 160,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={CLUSTER_LABELS[params.value as string] ?? params.value}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'name',
      headerName: 'Tên tài liệu',
      flex: 1,
      minWidth: 220,
      sortable: true,
    },
    {
      field: 'type',
      headerName: 'Loại',
      width: 120,
      sortable: true,
    },
    {
      field: 'status',
      headerName: 'Trạng thái',
      width: 150,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={STATUS_LABELS[params.value as string] ?? params.value}
          color={STATUS_COLORS[params.value as string] ?? 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'completenessScore',
      headerName: 'Hoàn thiện (%)',
      width: 150,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        const score = Math.round((params.value as number ?? 0) * 100)
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            <LinearProgress
              variant="determinate"
              value={score}
              sx={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                bgcolor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 4,
                  bgcolor: score >= 80 ? 'success.main' : score >= 50 ? 'warning.main' : 'error.main',
                },
              }}
            />
            <Typography variant="caption" sx={{ minWidth: 36 }}>
              {score}%
            </Typography>
          </Box>
        )
      },
    },
    {
      field: 'priority',
      headerName: 'Ưu tiên',
      width: 130,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={PRIORITY_LABELS[params.value as string] ?? params.value}
          color={PRIORITY_COLORS[params.value as string] ?? 'default'}
          size="small"
          variant="filled"
        />
      ),
    },
    {
      field: 'deadline',
      headerName: 'Hạn chót',
      width: 120,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return <Typography variant="body2" color="text.secondary">—</Typography>
        const date = new Date(params.value as string)
        const formatted = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const overdue = isOverdue(params.value as string, params.row.status)
        return (
          <Typography
            variant="body2"
            sx={{ color: overdue ? 'error.main' : 'text.primary', fontWeight: overdue ? 600 : 400 }}
          >
            {formatted}
          </Typography>
        )
      },
    },
    {
      field: 'ownerId',
      headerName: 'Người phụ trách',
      width: 150,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" color="text.secondary">
          {params.value ? String(params.value).slice(0, 8) + '...' : '—'}
        </Typography>
      ),
    },
    {
      field: 'updatedAt',
      headerName: 'Cập nhật lần cuối',
      width: 140,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return <Typography variant="body2" color="text.secondary">—</Typography>
        const date = new Date(params.value as string)
        return (
          <Typography variant="body2">
            {date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </Typography>
        )
      },
    },
    {
      field: 'approverId',
      headerName: 'Phê duyệt',
      width: 130,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        const row = params.row
        if (row.status === 'APPROVED') {
          return <Chip label="Đã duyệt" color="success" size="small" variant="outlined" />
        }
        if (row.status === 'PENDING_APPROVAL') {
          return <Chip label="Chờ duyệt" color="warning" size="small" variant="outlined" />
        }
        if (row.status === 'IN_REVIEW') {
          return <Chip label="Đang xem xét" color="info" size="small" variant="outlined" />
        }
        return <Typography variant="body2" color="text.secondary">—</Typography>
      },
    },
  ], [])

  // ─── Row styling: highlight overdue/critical ─────────────────────────────────

  const getRowClassName = useCallback((params: { row: { deadline?: string | null; status: string; priority: string } }) => {
    const { deadline, status, priority } = params.row
    if (isOverdue(deadline, status)) return 'row-overdue'
    if (isCriticalPriority(priority) && status !== 'APPROVED' && status !== 'ARCHIVED') return 'row-critical'
    return ''
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Ma trận Tài liệu
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý toàn bộ tài liệu của Viện — trạng thái, người phụ trách, mức ưu tiên và tiến độ hoàn thiện.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Xuất Excel">
            <span>
              <IconButton
                onClick={handleExportExcel}
                disabled={exporting === 'excel'}
                color="success"
                size="medium"
                aria-label="Xuất file Excel"
              >
                {exporting === 'excel' ? <CircularProgress size={20} /> : <FileDownloadIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Xuất PDF">
            <span>
              <IconButton
                onClick={handleExportPdf}
                disabled={exporting === 'pdf'}
                color="error"
                size="medium"
                aria-label="Xuất file PDF"
              >
                {exporting === 'pdf' ? <CircularProgress size={20} /> : <PictureAsPdfIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push('/documents/new')}
            sx={{ whiteSpace: 'nowrap' }}
          >
            Tạo tài liệu
          </Button>
        </Stack>
      </Box>

      {/* Filter Toolbar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ md: 'center' }}
          flexWrap="wrap"
          useFlexGap
        >
          {/* Search */}
          <TextField
            placeholder="Tìm kiếm theo tên hoặc mã tài liệu..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            size="small"
            sx={{ minWidth: 280 }}
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

          {/* Cluster Filter */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Nhóm tài liệu</InputLabel>
            <Select
              value={clusterFilter}
              label="Nhóm tài liệu"
              onChange={(e) => {
                setClusterFilter(e.target.value)
                setPaginationModel((prev) => ({ ...prev, page: 0 }))
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(CLUSTER_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Status Filter */}
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Trạng thái</InputLabel>
            <Select
              value={statusFilter}
              label="Trạng thái"
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPaginationModel((prev) => ({ ...prev, page: 0 }))
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Priority Filter */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Ưu tiên</InputLabel>
            <Select
              value={priorityFilter}
              label="Ưu tiên"
              onChange={(e) => {
                setPriorityFilter(e.target.value)
                setPaginationModel((prev) => ({ ...prev, page: 0 }))
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Owner Filter */}
          <TextField
            placeholder="Lọc theo người phụ trách..."
            value={ownerFilter}
            onChange={(e) => {
              setOwnerFilter(e.target.value)
              setPaginationModel((prev) => ({ ...prev, page: 0 }))
            }}
            size="small"
            sx={{ minWidth: 180 }}
          />

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Tooltip title="Xóa bộ lọc">
              <IconButton onClick={handleClearFilters} size="small" color="primary">
                <ClearIcon />
              </IconButton>
            </Tooltip>
          )}

          {/* Filter indicator */}
          {hasActiveFilters && (
            <Chip
              icon={<FilterListIcon />}
              label="Đang lọc"
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
        </Stack>
      </Paper>

      {/* DataGrid */}
      <Paper sx={{ width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={isLoading}
          rowCount={data?.total ?? 0}
          pageSizeOptions={[10, 25, 50, 100]}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          paginationMode="server"
          sortingMode="server"
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          onRowClick={handleRowClick}
          getRowClassName={getRowClassName}
          disableRowSelectionOnClick
          autoHeight
          sx={{
            border: 'none',
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: 'grey.50',
              fontWeight: 600,
            },
            '& .MuiDataGrid-row': {
              cursor: 'pointer',
              '&:hover': {
                bgcolor: 'action.hover',
              },
            },
            '& .row-overdue': {
              bgcolor: 'error.50',
              '&:hover': {
                bgcolor: 'error.100',
              },
              borderLeft: '3px solid',
              borderLeftColor: 'error.main',
            },
            '& .row-critical': {
              bgcolor: 'warning.50',
              '&:hover': {
                bgcolor: 'warning.100',
              },
              borderLeft: '3px solid',
              borderLeftColor: 'warning.main',
            },
            '& .MuiDataGrid-cell': {
              display: 'flex',
              alignItems: 'center',
            },
          }}
          localeText={{
            noRowsLabel: 'Không có tài liệu nào',
            footerRowSelected: (count) => `${count} dòng được chọn`,
            columnMenuSortAsc: 'Sắp xếp tăng dần',
            columnMenuSortDesc: 'Sắp xếp giảm dần',
            columnMenuFilter: 'Lọc',
            columnMenuHideColumn: 'Ẩn cột',
            columnMenuManageColumns: 'Quản lý cột',
            columnMenuUnsort: 'Bỏ sắp xếp',
            footerTotalRows: 'Tổng số dòng:',
          }}
        />
      </Paper>
    </Box>
  )
}
