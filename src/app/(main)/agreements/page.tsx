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

const TYPE_LABELS: Record<string, string> = {
  MEMBERSHIP: 'Hội viên',
  MOU: 'Biên bản ghi nhớ',
  NDA: 'Bảo mật thông tin',
  DPA: 'Xử lý dữ liệu',
  SLA: 'Cam kết dịch vụ',
  TECH_DEPLOYMENT: 'Triển khai CN',
  TECH_TRANSFER: 'Chuyển giao CN',
  SPONSORSHIP: 'Tài trợ',
  RESEARCH: 'Nghiên cứu',
  DATA_SHARING: 'Chia sẻ dữ liệu',
  EVENT: 'Sự kiện',
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  LEGAL_REVIEW: 'Xem xét pháp lý',
  NEGOTIATION: 'Đàm phán',
  PENDING_SIGNATURE: 'Chờ ký',
  SIGNED: 'Đã ký',
  ACTIVE: 'Hiệu lực',
  EXPIRING: 'Sắp hết hạn',
  EXPIRED: 'Hết hạn',
  TERMINATED: 'Chấm dứt',
  ARCHIVED: 'Lưu trữ',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  DRAFT: 'default',
  LEGAL_REVIEW: 'info',
  NEGOTIATION: 'warning',
  PENDING_SIGNATURE: 'primary',
  SIGNED: 'info',
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'error',
  TERMINATED: 'error',
  ARCHIVED: 'default',
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

export default function AgreementsPage() {
  const router = useRouter()

  // Filter state
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
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
    type: (typeFilter || undefined) as any,
    status: (statusFilter || undefined) as any,
    sortField: sortModel[0]?.field || 'createdAt',
    sortDirection: (sortModel[0]?.sort || 'desc') as 'asc' | 'desc',
    page: paginationModel.page,
    pageSize: paginationModel.pageSize,
  }), [debouncedSearch, typeFilter, statusFilter, sortModel, paginationModel])

  // tRPC query
  const { data, isLoading } = trpc.agreements.list.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data?.items) return []
    return data.items.map((item: any) => ({
      id: item.id,
      title: item.title,
      type: item.type,
      partyA: item.partyA,
      partyB: item.partyB,
      status: item.status,
      effectiveDate: item.effectiveDate,
      expiryDate: item.expiryDate,
      partnerName: item.partner?.companyName ?? null,
      enterpriseName: item.enterprise?.legalNameVi ?? null,
    }))
  }, [data])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setTypeFilter('')
    setStatusFilter('')
    setPaginationModel((prev) => ({ ...prev, page: 0 }))
  }, [])

  const hasActiveFilters = !!(debouncedSearch || typeFilter || statusFilter)

  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/agreements/${params.id}`)
  }, [router])

  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'title',
      headerName: 'Tiêu đề',
      flex: 1,
      minWidth: 220,
      sortable: true,
    },
    {
      field: 'type',
      headerName: 'Loại',
      width: 160,
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
      field: 'partyB',
      headerName: 'Bên B',
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
      field: 'effectiveDate',
      headerName: 'Ngày hiệu lực',
      width: 130,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">{formatDate(params.value as string)}</Typography>
      ),
    },
    {
      field: 'expiryDate',
      headerName: 'Ngày hết hạn',
      width: 130,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">{formatDate(params.value as string)}</Typography>
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
            Hợp đồng & Thỏa thuận
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý tất cả hợp đồng, thỏa thuận, MOU, NDA, DPA, SLA và các loại khác.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/agreements/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Tạo mới
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
            placeholder="Tìm kiếm theo tiêu đề, bên A, bên B..."
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
            <InputLabel>Loại hợp đồng</InputLabel>
            <Select
              value={typeFilter}
              label="Loại hợp đồng"
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPaginationModel((prev) => ({ ...prev, page: 0 }))
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

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
              '&:hover': { bgcolor: 'action.hover' },
            },
            '& .MuiDataGrid-cell': {
              display: 'flex',
              alignItems: 'center',
            },
          }}
          localeText={{
            noRowsLabel: 'Không có hợp đồng nào',
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
