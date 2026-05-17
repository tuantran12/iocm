'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Stack,
  Paper,
  IconButton,
  Tooltip,
  Button,
} from '@mui/material'
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
} from '@mui/x-data-grid'
import FilterListIcon from '@mui/icons-material/FilterList'
import ClearIcon from '@mui/icons-material/Clear'
import AddIcon from '@mui/icons-material/Add'
import { trpc } from '@/lib/trpc'
import { format, isPast } from 'date-fns'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  access: 'Truy cập',
  correction: 'Chỉnh sửa',
  deletion: 'Xóa',
  restriction: 'Hạn chế',
  withdrawal: 'Rút lại',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Mở',
  assigned: 'Đã giao',
  in_progress: 'Đang xử lý',
  resolved: 'Đã giải quyết',
  rejected: 'Từ chối',
}

const STATUS_COLORS: Record<string, 'info' | 'warning' | 'success' | 'error'> = {
  open: 'info',
  assigned: 'warning',
  in_progress: 'warning',
  resolved: 'success',
  rejected: 'error',
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function DataSubjectRequestsPage() {
  const router = useRouter()

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  // Build query input
  type RequestStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'rejected'
  type RequestType = 'access' | 'correction' | 'deletion' | 'restriction' | 'withdrawal'

  const queryInput = useMemo(() => {
    const input: { status?: RequestStatus; type?: RequestType } = {}
    if (statusFilter) input.status = statusFilter as RequestStatus
    if (typeFilter) input.type = typeFilter as RequestType
    return Object.keys(input).length > 0 ? input : undefined
  }, [statusFilter, typeFilter])

  // tRPC query
  const { data, isLoading } = trpc.dataRequests.list.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data) return []
    return data.map((item) => ({
      id: item.id,
      subjectId: item.subjectId,
      type: item.type,
      receivedDate: item.receivedDate,
      deadline: item.deadline,
      assignedTo: item.assignedTo,
      status: item.status,
    }))
  }, [data])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setStatusFilter('')
    setTypeFilter('')
  }, [])

  const hasActiveFilters = !!statusFilter || !!typeFilter

  // Navigate to detail on row click
  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/data-requests/${params.id}`)
  }, [router])

  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'subjectId',
      headerName: 'Chủ thể',
      flex: 1,
      minWidth: 160,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Typography
          variant="body2"
          sx={{
            color: 'primary.main',
            fontWeight: 500,
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'type',
      headerName: 'Loại yêu cầu',
      width: 150,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={TYPE_LABELS[params.value as string] ?? params.value}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'receivedDate',
      headerName: 'Ngày nhận',
      width: 140,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return '—'
        return format(new Date(params.value as string), 'dd/MM/yyyy')
      },
    },
    {
      field: 'deadline',
      headerName: 'Hạn xử lý',
      width: 140,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return '—'
        const date = new Date(params.value as string)
        const overdue = isPast(date) && params.row.status !== 'resolved' && params.row.status !== 'rejected'
        return (
          <Typography
            variant="body2"
            sx={{
              color: overdue ? 'error.main' : 'text.primary',
              fontWeight: overdue ? 700 : 400,
            }}
          >
            {format(date, 'dd/MM/yyyy')}
          </Typography>
        )
      },
    },
    {
      field: 'assignedTo',
      headerName: 'Người xử lý',
      flex: 1,
      minWidth: 140,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return <Typography variant="body2" color="text.secondary">—</Typography>
        return params.value
      },
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
  ], [])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Yêu cầu chủ thể dữ liệu
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý yêu cầu truy cập, chỉnh sửa, xóa, hạn chế và rút lại dữ liệu cá nhân.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/data-requests/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Tạo yêu cầu
        </Button>
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
          {/* Status Filter */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Trạng thái</InputLabel>
            <Select
              value={statusFilter}
              label="Trạng thái"
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Type Filter */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Loại yêu cầu</InputLabel>
            <Select
              value={typeFilter}
              label="Loại yêu cầu"
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

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
          pageSizeOptions={[10, 25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { page: 0, pageSize: 25 } },
          }}
          onRowClick={handleRowClick}
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
            '& .MuiDataGrid-cell': {
              display: 'flex',
              alignItems: 'center',
            },
          }}
          localeText={{
            noRowsLabel: 'Không có yêu cầu nào',
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
