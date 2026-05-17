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
  PROSPECT: 'Tiềm năng',
  INVITED: 'Đã mời',
  APPLICATION_SUBMITTED: 'Đã nộp đơn',
  UNDER_REVIEW: 'Đang xem xét',
  APPROVED: 'Đã duyệt',
  ACTIVE: 'Hoạt động',
  PAYMENT_OVERDUE: 'Quá hạn phí',
  SUSPENDED: 'Tạm ngưng',
  TERMINATED: 'Chấm dứt',
  WITHDRAWN: 'Rút lui',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  PROSPECT: 'default',
  INVITED: 'info',
  APPLICATION_SUBMITTED: 'primary',
  UNDER_REVIEW: 'warning',
  APPROVED: 'info',
  ACTIVE: 'success',
  PAYMENT_OVERDUE: 'error',
  SUSPENDED: 'warning',
  TERMINATED: 'error',
  WITHDRAWN: 'default',
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function MembersPage() {
  const router = useRouter()

  // Filter state
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<string>('')
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

  // Fetch tiers for filter dropdown
  const tiersQuery = trpc.tiers.list.useQuery()
  const tierOptions = useMemo(() => {
    if (!tiersQuery.data) return []
    return (tiersQuery.data as Array<{ id: string; name: string }>).map((t) => ({
      id: t.id,
      name: t.name,
    }))
  }, [tiersQuery.data])

  // Build query input
  type MembershipStatusType = 'PROSPECT' | 'INVITED' | 'APPLICATION_SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'ACTIVE' | 'PAYMENT_OVERDUE' | 'SUSPENDED' | 'TERMINATED' | 'WITHDRAWN'

  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    tierId: tierFilter || undefined,
    status: (statusFilter || undefined) as MembershipStatusType | undefined,
    sortField: sortModel[0]?.field || 'createdAt',
    sortDirection: (sortModel[0]?.sort || 'desc') as 'asc' | 'desc',
    page: paginationModel.page,
    pageSize: paginationModel.pageSize,
  }), [debouncedSearch, tierFilter, statusFilter, sortModel, paginationModel])

  // tRPC query
  const { data, isLoading } = trpc.members.list.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data?.items) return []
    return data.items.map((member) => ({
      id: member.id,
      legalNameVi: member.legalNameVi,
      tierName: member.tier?.name ?? '—',
      membershipStatus: member.membershipStatus,
      taxCode: member.taxCode ?? '—',
      contactName: member.contactName,
      joinedDate: member.joinedDate,
    }))
  }, [data])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setTierFilter('')
    setStatusFilter('')
    setPaginationModel((prev) => ({ ...prev, page: 0 }))
  }, [])

  const hasActiveFilters = !!(debouncedSearch || tierFilter || statusFilter)

  // Navigate to member detail page on row click
  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/members/${params.id}`)
  }, [router])

  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'legalNameVi',
      headerName: 'Tên doanh nghiệp',
      flex: 1,
      minWidth: 220,
      sortable: true,
    },
    {
      field: 'tierName',
      headerName: 'Cấp hội viên',
      width: 160,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={params.value as string}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'membershipStatus',
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
    {
      field: 'taxCode',
      headerName: 'Mã số thuế',
      width: 150,
      sortable: false,
    },
    {
      field: 'contactName',
      headerName: 'Người liên hệ',
      width: 180,
      sortable: false,
    },
    {
      field: 'joinedDate',
      headerName: 'Ngày tham gia',
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
  ], [])

  // ─── Row styling: highlight overdue/suspended ────────────────────────────────

  const getRowClassName = useCallback((params: { row: { membershipStatus: string } }) => {
    const { membershipStatus } = params.row
    if (membershipStatus === 'PAYMENT_OVERDUE' || membershipStatus === 'TERMINATED') return 'row-overdue'
    if (membershipStatus === 'SUSPENDED') return 'row-suspended'
    return ''
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Doanh nghiệp Hội viên
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý hồ sơ doanh nghiệp hội viên, cấp hội viên và trạng thái thành viên.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/members/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Thêm hội viên
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
            placeholder="Tìm kiếm theo tên, mã số thuế, người liên hệ..."
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

          {/* Tier Filter */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Cấp hội viên</InputLabel>
            <Select
              value={tierFilter}
              label="Cấp hội viên"
              onChange={(e) => {
                setTierFilter(e.target.value)
                setPaginationModel((prev) => ({ ...prev, page: 0 }))
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {tierOptions.map((tier) => (
                <MenuItem key={tier.id} value={tier.id}>{tier.name}</MenuItem>
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
            '& .row-suspended': {
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
            noRowsLabel: 'Không có hội viên nào',
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
