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
import { ConsentStatus } from '@prisma/client'
import { format } from 'date-fns'

// ─── Vietnamese Labels & Colors ──────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Đang hiệu lực',
  WITHDRAWN: 'Đã rút lại',
  EXPIRED: 'Hết hạn',
}

const STATUS_COLORS: Record<string, 'success' | 'error' | 'warning'> = {
  ACTIVE: 'success',
  WITHDRAWN: 'error',
  EXPIRED: 'warning',
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function ConsentRecordsPage() {
  const router = useRouter()

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Build query input
  const queryInput = useMemo(() => ({
    status: (statusFilter || undefined) as ConsentStatus | undefined,
  }), [statusFilter])

  // tRPC query
  const { data, isLoading } = trpc.consent.list.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data) return []
    return data.map((item) => ({
      id: item.id,
      subjectId: item.subjectId,
      purpose: item.purpose,
      consentMethod: item.consentMethod,
      consentDate: item.consentDate,
      expiryDate: item.expiryDate,
      status: item.status,
    }))
  }, [data])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setStatusFilter('')
  }, [])

  const hasActiveFilters = !!statusFilter

  // Navigate to detail on row click
  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/consent/${params.id}`)
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
      field: 'purpose',
      headerName: 'Mục đích',
      flex: 1,
      minWidth: 200,
      sortable: true,
    },
    {
      field: 'consentMethod',
      headerName: 'Phương thức',
      width: 160,
      sortable: true,
    },
    {
      field: 'consentDate',
      headerName: 'Ngày đồng ý',
      width: 140,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return '—'
        return format(new Date(params.value as string), 'dd/MM/yyyy')
      },
    },
    {
      field: 'expiryDate',
      headerName: 'Ngày hết hạn',
      width: 140,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return '—'
        return format(new Date(params.value as string), 'dd/MM/yyyy')
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
            Bản ghi Đồng ý
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý bản ghi đồng ý thu thập và xử lý dữ liệu cá nhân.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/consent/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Tạo bản ghi
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
            noRowsLabel: 'Không có bản ghi đồng ý nào',
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
