'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  TextField,
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
  type GridPaginationModel,
} from '@mui/x-data-grid'
import FilterListIcon from '@mui/icons-material/FilterList'
import ClearIcon from '@mui/icons-material/Clear'
import AddIcon from '@mui/icons-material/Add'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels & Colors ──────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  committed: 'Cam kết',
  received: 'Đã nhận',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

const STATUS_COLORS: Record<string, 'info' | 'success' | 'primary' | 'error'> = {
  committed: 'info',
  received: 'success',
  completed: 'primary',
  cancelled: 'error',
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function SponsorshipsPage() {
  const router = useRouter()

  // Filter & pagination state
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState<string>('')
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  })

  // Build query input
  const queryInput = useMemo(() => ({
    status: statusFilter || undefined,
    search: search || undefined,
    page: paginationModel.page,
    pageSize: paginationModel.pageSize,
  }), [statusFilter, search, paginationModel])

  // tRPC query
  const { data, isLoading } = trpc.finance.sponsorshipsList.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data?.items) return []
    return data.items.map((item) => ({
      id: item.id,
      sponsorName: item.sponsorName,
      type: item.type,
      amount: item.amount,
      currency: item.currency,
      purpose: item.purpose,
      restricted: item.restricted,
      status: item.status,
      enterpriseName: item.enterprise?.legalNameVi ?? '—',
    }))
  }, [data])

  const rowCount = data?.total ?? 0

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setStatusFilter('')
    setSearch('')
  }, [])

  const hasActiveFilters = !!statusFilter || !!search

  // Navigate to detail on row click
  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/finance/sponsorships/${params.id}`)
  }, [router])

  // ─── Format VNĐ ───────────────────────────────────────────────────────────────

  const formatCurrency = useCallback((amount: unknown, currency: string) => {
    if (amount == null) return '—'
    const num = Number(amount)
    if (isNaN(num)) return '—'
    if (currency === 'VND') {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
      }).format(num)
    }
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: currency || 'VND',
    }).format(num)
  }, [])


  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'sponsorName',
      headerName: 'Nhà tài trợ',
      flex: 1,
      minWidth: 180,
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
      headerName: 'Loại',
      width: 140,
      sortable: true,
    },
    {
      field: 'amount',
      headerName: 'Số tiền',
      width: 160,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {formatCurrency(params.value, params.row.currency)}
        </Typography>
      ),
    },
    {
      field: 'purpose',
      headerName: 'Mục đích',
      flex: 1,
      minWidth: 180,
      sortable: true,
    },
    {
      field: 'restricted',
      headerName: 'Hạn chế',
      width: 110,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={params.value ? 'Có' : 'Không'}
          color={params.value ? 'warning' : 'default'}
          size="small"
          variant={params.value ? 'filled' : 'outlined'}
        />
      ),
    },
    {
      field: 'status',
      headerName: 'Trạng thái',
      width: 140,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={STATUS_LABELS[params.value as string] ?? params.value}
          color={STATUS_COLORS[params.value as string] ?? 'default'}
          size="small"
        />
      ),
    },
  ], [formatCurrency])


  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Back Button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/finance')}
        sx={{ mb: 2 }}
      >
        Quay lại Tài chính
      </Button>

      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Quản lý Tài trợ
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Danh sách các khoản tài trợ cho Viện từ doanh nghiệp và đối tác.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/finance/sponsorships/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Tạo tài trợ
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
          {/* Search */}
          <TextField
            size="small"
            label="Tìm kiếm"
            placeholder="Nhà tài trợ, mục đích..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 240 }}
          />

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
          rowCount={rowCount}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[10, 25, 50, 100]}
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
            noRowsLabel: 'Không có khoản tài trợ nào',
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
