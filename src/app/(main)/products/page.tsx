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
  PROPOSED: 'Đề xuất',
  UNDER_REVIEW: 'Đang xem xét',
  APPROVED: 'Đã duyệt',
  PILOT_READY: 'Sẵn sàng pilot',
  DEPLOYED: 'Đã triển khai',
  SUSPENDED: 'Tạm ngưng',
  RETIRED: 'Ngừng sử dụng',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'> = {
  PROPOSED: 'default',
  UNDER_REVIEW: 'info',
  APPROVED: 'primary',
  PILOT_READY: 'warning',
  DEPLOYED: 'success',
  SUSPENDED: 'warning',
  RETIRED: 'error',
}

const REVIEW_LABELS: Record<string, string> = {
  not_reviewed: 'Chưa đánh giá',
  in_review: 'Đang đánh giá',
  approved: 'Đạt',
  rejected: 'Không đạt',
}

const REVIEW_COLORS: Record<string, 'default' | 'info' | 'success' | 'error'> = {
  not_reviewed: 'default',
  in_review: 'info',
  approved: 'success',
  rejected: 'error',
}

// ─── Main Page Component ─────────────────────────────────────────────────────

type ProductStatusType = 'PROPOSED' | 'UNDER_REVIEW' | 'APPROVED' | 'PILOT_READY' | 'DEPLOYED' | 'SUSPENDED' | 'RETIRED'

export default function ProductsPage() {
  const router = useRouter()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  })
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: 'createdAt', sort: 'desc' },
  ])

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

  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    status: (statusFilter || undefined) as ProductStatusType | undefined,
    sortField: sortModel[0]?.field || 'createdAt',
    sortDirection: (sortModel[0]?.sort || 'desc') as 'asc' | 'desc',
    page: paginationModel.page,
    pageSize: paginationModel.pageSize,
  }), [debouncedSearch, statusFilter, sortModel, paginationModel])

  const { data, isLoading } = trpc.products.list.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data?.items) return []
    return data.items.map((product) => ({
      id: product.id,
      name: product.name,
      type: product.type,
      partnerName: product.partner?.companyName ?? '—',
      status: product.status,
      securityStatus: product.securityStatus,
      dataReviewStatus: product.dataReviewStatus,
      aiReviewStatus: product.aiReviewStatus,
    }))
  }, [data])

  const handleClearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setStatusFilter('')
    setPaginationModel((prev) => ({ ...prev, page: 0 }))
  }, [])

  const hasActiveFilters = !!(debouncedSearch || statusFilter)

  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/products/${params.id}`)
  }, [router])

  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'name',
      headerName: 'Tên sản phẩm',
      flex: 1,
      minWidth: 200,
      sortable: true,
    },
    {
      field: 'type',
      headerName: 'Loại',
      width: 140,
      sortable: true,
    },
    {
      field: 'partnerName',
      headerName: 'Đối tác',
      width: 180,
      sortable: false,
    },
    {
      field: 'status',
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
      field: 'securityStatus',
      headerName: 'Bảo mật',
      width: 120,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        const status = params.value as string
        return (
          <Chip
            label={REVIEW_LABELS[status] ?? status}
            color={REVIEW_COLORS[status] ?? 'default'}
            size="small"
            variant="outlined"
          />
        )
      },
    },
    {
      field: 'dataReviewStatus',
      headerName: 'Dữ liệu',
      width: 120,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        const status = params.value as string
        return (
          <Chip
            label={REVIEW_LABELS[status] ?? status}
            color={REVIEW_COLORS[status] ?? 'default'}
            size="small"
            variant="outlined"
          />
        )
      },
    },
    {
      field: 'aiReviewStatus',
      headerName: 'AI',
      width: 120,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        const status = params.value as string
        return (
          <Chip
            label={REVIEW_LABELS[status] ?? status}
            color={REVIEW_COLORS[status] ?? 'default'}
            size="small"
            variant="outlined"
          />
        )
      },
    },
  ], [])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Sản phẩm Công nghệ
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Hộ chiếu sản phẩm công nghệ, đánh giá bảo mật/dữ liệu/AI, trạng thái triển khai.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/products/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Thêm sản phẩm
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
          <TextField
            placeholder="Tìm kiếm theo tên, mô tả, loại..."
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
            noRowsLabel: 'Không có sản phẩm nào',
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
