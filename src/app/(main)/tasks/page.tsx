'use client'

import { useState, useMemo, useCallback } from 'react'
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
} from '@mui/material'
import {
  DataGrid,
  type GridColDef,
  type GridSortModel,
  type GridPaginationModel,
  type GridRenderCellParams,
} from '@mui/x-data-grid'
import FilterListIcon from '@mui/icons-material/FilterList'
import ClearIcon from '@mui/icons-material/Clear'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Mở',
  IN_PROGRESS: 'Đang thực hiện',
  BLOCKED: 'Bị chặn',
  IN_REVIEW: 'Đang xem xét',
  DONE: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'error' | 'info' | 'success' | 'warning'> = {
  OPEN: 'info',
  IN_PROGRESS: 'primary',
  BLOCKED: 'error',
  IN_REVIEW: 'warning',
  DONE: 'success',
  CANCELLED: 'default',
}

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Nghiêm trọng',
}

const PRIORITY_COLORS: Record<string, 'default' | 'primary' | 'error' | 'info' | 'success' | 'warning'> = {
  LOW: 'default',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'error',
}

// ─── Helper: Check if task is overdue ────────────────────────────────────────

function isOverdue(dueDate: string | Date | null | undefined, status: string): boolean {
  if (!dueDate) return false
  if (status === 'DONE' || status === 'CANCELLED') return false
  return new Date(dueDate) < new Date()
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function PersonalTasksPage() {
  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')

  // DataGrid state
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  })
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: 'priority', sort: 'desc' },
  ])

  // Build query input
  type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'IN_REVIEW' | 'DONE' | 'CANCELLED'
  type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

  const queryInput = useMemo(() => ({
    status: (statusFilter || undefined) as TaskStatus | undefined,
    priority: (priorityFilter || undefined) as Priority | undefined,
    page: paginationModel.page,
    pageSize: paginationModel.pageSize,
  }), [statusFilter, priorityFilter, paginationModel])

  // tRPC query
  const { data, isLoading } = trpc.tasks.myTasks.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data?.items) return []
    return data.items.map((task) => ({
      id: task.id,
      title: task.title,
      groupName: task.group?.name ?? '—',
      priority: task.priority,
      dueDate: task.dueDate,
      status: task.status,
    }))
  }, [data])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setStatusFilter('')
    setPriorityFilter('')
    setPaginationModel((prev) => ({ ...prev, page: 0 }))
  }, [])

  const hasActiveFilters = !!(statusFilter || priorityFilter)

  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'title',
      headerName: 'Tiêu đề',
      flex: 1,
      minWidth: 250,
      sortable: true,
    },
    {
      field: 'groupName',
      headerName: 'Nhóm',
      width: 180,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" color="text.secondary">
          {params.value as string}
        </Typography>
      ),
    },
    {
      field: 'priority',
      headerName: 'Ưu tiên',
      width: 140,
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
      field: 'dueDate',
      headerName: 'Hạn chót',
      width: 130,
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
      field: 'status',
      headerName: 'Trạng thái',
      width: 160,
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
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Công việc của tôi
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Danh sách các công việc được giao cho bạn — theo dõi tiến độ, ưu tiên và hạn chót.
        </Typography>
      </Box>

      {/* Filter Toolbar */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ sm: 'center' }}
          flexWrap="wrap"
          useFlexGap
        >
          {/* Status Filter */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
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
          <FormControl size="small" sx={{ minWidth: 150 }}>
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
          pageSizeOptions={[10, 25, 50]}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          paginationMode="server"
          sortingMode="client"
          sortModel={sortModel}
          onSortModelChange={setSortModel}
          disableRowSelectionOnClick
          autoHeight
          sx={{
            border: 'none',
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: 'grey.50',
              fontWeight: 600,
            },
            '& .MuiDataGrid-row': {
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
            noRowsLabel: 'Không có công việc nào',
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
