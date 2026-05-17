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
  Paper,
  IconButton,
  Tooltip,
  Button,
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

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function LegalBasisPage() {
  const router = useRouter()

  // Filter state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [basisTypeFilter, setBasisTypeFilter] = useState<string>('')

  // DataGrid state
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  })
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: 'effectiveDate', sort: 'desc' },
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
  type LegalStatusType = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'SUPERSEDED'

  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    status: (statusFilter || undefined) as LegalStatusType | undefined,
    basisType: basisTypeFilter || undefined,
    sortField: sortModel[0]?.field || 'effectiveDate',
    sortDirection: (sortModel[0]?.sort || 'desc') as 'asc' | 'desc',
    page: paginationModel.page,
    pageSize: paginationModel.pageSize,
  }), [debouncedSearch, statusFilter, basisTypeFilter, sortModel, paginationModel])

  // tRPC query
  const { data, isLoading } = trpc.legalBasis.list.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data?.items) return []
    return data.items.map((item) => ({
      id: item.id,
      documentNumber: item.documentNumber,
      title: item.title,
      issuingAuth: item.issuingAuth,
      basisType: item.basisType,
      scope: item.scope,
      status: item.status,
      effectiveDate: item.effectiveDate,
      expiryDate: item.expiryDate,
      lastVerified: item.lastVerified,
    }))
  }, [data])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setStatusFilter('')
    setBasisTypeFilter('')
    setPaginationModel((prev) => ({ ...prev, page: 0 }))
  }, [])

  const hasActiveFilters = !!(debouncedSearch || statusFilter || basisTypeFilter)

  // Navigate to detail page on row click
  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/legal-basis/${params.id}`)
  }, [router])

  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'documentNumber',
      headerName: 'Số hiệu',
      width: 160,
      sortable: true,
    },
    {
      field: 'title',
      headerName: 'Tiêu đề',
      flex: 1,
      minWidth: 250,
      sortable: true,
    },
    {
      field: 'issuingAuth',
      headerName: 'Cơ quan ban hành',
      width: 180,
      sortable: true,
    },
    {
      field: 'basisType',
      headerName: 'Loại',
      width: 140,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={BASIS_TYPE_LABELS[params.value as string] ?? params.value}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'scope',
      headerName: 'Phạm vi',
      width: 140,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">
          {SCOPE_LABELS[params.value as string] ?? params.value}
        </Typography>
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
    {
      field: 'effectiveDate',
      headerName: 'Ngày hiệu lực',
      width: 130,
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
      field: 'expiryDate',
      headerName: 'Ngày hết hạn',
      width: 130,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return <Typography variant="body2" color="text.secondary">—</Typography>
        const date = new Date(params.value as string)
        const isExpired = date < new Date()
        return (
          <Typography
            variant="body2"
            sx={{ color: isExpired ? 'error.main' : 'text.primary', fontWeight: isExpired ? 600 : 400 }}
          >
            {date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </Typography>
        )
      },
    },
    {
      field: 'lastVerified',
      headerName: 'Xác minh lần cuối',
      width: 150,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        if (!params.value) return <Typography variant="body2" color="text.secondary">Chưa xác minh</Typography>
        const date = new Date(params.value as string)
        return (
          <Typography variant="body2">
            {date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </Typography>
        )
      },
    },
  ], [])

  // ─── Row styling: highlight expiring/expired ─────────────────────────────────

  const getRowClassName = useCallback((params: { row: { status: string } }) => {
    const { status } = params.row
    if (status === 'EXPIRED') return 'row-expired'
    if (status === 'EXPIRING') return 'row-expiring'
    return ''
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Căn cứ pháp lý
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý căn cứ pháp lý, văn bản quy phạm và chính sách nội bộ của Viện.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/legal-basis/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Thêm căn cứ pháp lý
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
            placeholder="Tìm kiếm theo tiêu đề hoặc số hiệu..."
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

          {/* Basis Type Filter */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Loại văn bản</InputLabel>
            <Select
              value={basisTypeFilter}
              label="Loại văn bản"
              onChange={(e) => {
                setBasisTypeFilter(e.target.value)
                setPaginationModel((prev) => ({ ...prev, page: 0 }))
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(BASIS_TYPE_LABELS).map(([key, label]) => (
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
            '& .row-expired': {
              bgcolor: 'error.50',
              '&:hover': {
                bgcolor: 'error.100',
              },
              borderLeft: '3px solid',
              borderLeftColor: 'error.main',
            },
            '& .row-expiring': {
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
            noRowsLabel: 'Không có căn cứ pháp lý nào',
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
