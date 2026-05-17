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

const RISK_LABELS: Record<string, string> = {
  R1: 'R1 - Rất thấp',
  R2: 'R2 - Thấp',
  R3: 'R3 - Trung bình',
  R4: 'R4 - Cao',
  R5: 'R5 - Rất cao',
}

const RISK_COLORS: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  R1: 'success',
  R2: 'info',
  R3: 'warning',
  R4: 'error',
  R5: 'error',
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Mới',
  active: 'Hoạt động',
  suspended: 'Tạm ngưng',
  terminated: 'Chấm dứt',
  under_review: 'Đang xem xét',
}

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
  new: 'info',
  active: 'success',
  suspended: 'warning',
  terminated: 'error',
  under_review: 'default',
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── Main Page Component ─────────────────────────────────────────────────────

type RiskRatingType = 'R1' | 'R2' | 'R3' | 'R4' | 'R5'

export default function PartnersPage() {
  const router = useRouter()

  // Filter state
  const [search, setSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

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
  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    riskRating: (riskFilter || undefined) as RiskRatingType | undefined,
    relationshipStatus: statusFilter || undefined,
    sortField: sortModel[0]?.field || 'createdAt',
    sortDirection: (sortModel[0]?.sort || 'desc') as 'asc' | 'desc',
    page: paginationModel.page,
    pageSize: paginationModel.pageSize,
  }), [debouncedSearch, riskFilter, statusFilter, sortModel, paginationModel])

  // tRPC query
  const { data, isLoading } = trpc.partners.list.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data?.items) return []
    return data.items.map((partner) => ({
      id: partner.id,
      companyName: partner.companyName,
      technologyDomains: partner.technologyDomains,
      riskRating: partner.riskRating,
      relationshipStatus: partner.relationshipStatus,
      lastReviewDate: partner.lastReviewDate,
    }))
  }, [data])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setRiskFilter('')
    setStatusFilter('')
    setPaginationModel((prev) => ({ ...prev, page: 0 }))
  }, [])

  const hasActiveFilters = !!(debouncedSearch || riskFilter || statusFilter)

  // Navigate to partner detail page on row click
  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/partners/${params.id}`)
  }, [router])

  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'companyName',
      headerName: 'Tên công ty',
      flex: 1,
      minWidth: 220,
      sortable: true,
    },
    {
      field: 'technologyDomains',
      headerName: 'Lĩnh vực CN',
      width: 200,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        const domains = params.value as string[] | null
        if (!domains || domains.length === 0) return '—'
        return (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {domains.slice(0, 2).map((d) => (
              <Chip key={d} label={d} size="small" variant="outlined" />
            ))}
            {domains.length > 2 && (
              <Chip label={`+${domains.length - 2}`} size="small" variant="outlined" />
            )}
          </Stack>
        )
      },
    },
    {
      field: 'riskRating',
      headerName: 'Mức rủi ro',
      width: 150,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        const rating = params.value as string | null
        if (!rating) return <Typography variant="body2" color="text.secondary">—</Typography>
        return (
          <Chip
            label={rating}
            color={RISK_COLORS[rating] ?? 'default'}
            size="small"
          />
        )
      },
    },
    {
      field: 'relationshipStatus',
      headerName: 'Trạng thái',
      width: 150,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => {
        const status = params.value as string
        return (
          <Chip
            label={STATUS_LABELS[status] ?? status}
            color={STATUS_COLORS[status] ?? 'default'}
            size="small"
          />
        )
      },
    },
    {
      field: 'lastReviewDate',
      headerName: 'Ngày review cuối',
      width: 150,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">
          {formatDate(params.value as string)}
        </Typography>
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
            Đối tác Công nghệ
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý hồ sơ đối tác công nghệ, thẩm định và đánh giá rủi ro.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/partners/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Thêm đối tác
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
            placeholder="Tìm kiếm theo tên công ty, mã số thuế..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            size="small"
            sx={{ minWidth: 300 }}
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

          {/* Risk Rating Filter */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Mức rủi ro</InputLabel>
            <Select
              value={riskFilter}
              label="Mức rủi ro"
              onChange={(e) => {
                setRiskFilter(e.target.value)
                setPaginationModel((prev) => ({ ...prev, page: 0 }))
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(RISK_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

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

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Tooltip title="Xóa bộ lọc">
              <IconButton onClick={handleClearFilters} size="small" color="primary">
                <ClearIcon />
              </IconButton>
            </Tooltip>
          )}

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
            noRowsLabel: 'Không có đối tác nào',
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
