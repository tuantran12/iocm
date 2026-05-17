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
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import PaymentIcon from '@mui/icons-material/Payment'
import { trpc } from '@/lib/trpc'
import { RecordPaymentDialog } from '@/components/fees/RecordPaymentDialog'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  NOT_INVOICED: 'Chưa xuất HĐ',
  INVOICED: 'Đã xuất HĐ',
  PARTIALLY_PAID: 'Thanh toán một phần',
  PAID: 'Đã thanh toán',
  OVERDUE: 'Quá hạn',
  WAIVED: 'Miễn giảm',
  REFUNDED: 'Hoàn tiền',
  CANCELLED: 'Đã hủy',
}

const PAYMENT_STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  NOT_INVOICED: 'default',
  INVOICED: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'error',
  WAIVED: 'secondary',
  REFUNDED: 'default',
  CANCELLED: 'default',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatVND(value: number | string | null | undefined): string {
  if (value == null) return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(num)
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── Year options (current year ± range) ─────────────────────────────────────

function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear()
  const years: number[] = []
  for (let y = currentYear + 1; y >= currentYear - 5; y--) {
    years.push(y)
  }
  return years
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function FeesPage() {
  const router = useRouter()

  // Filter state
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // DataGrid state
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 25,
  })
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: 'year', sort: 'desc' },
  ])

  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedFee, setSelectedFee] = useState<{
    id: string
    year: number
    amountDue: number | string
    amountPaid: number | string
    enterprise?: { legalNameVi: string } | null
  } | null>(null)

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
  type PaymentStatusType = 'NOT_INVOICED' | 'INVOICED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'WAIVED' | 'REFUNDED' | 'CANCELLED'

  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    year: yearFilter ? parseInt(yearFilter, 10) : undefined,
    status: (statusFilter || undefined) as PaymentStatusType | undefined,
    sortField: sortModel[0]?.field || 'year',
    sortDirection: (sortModel[0]?.sort || 'desc') as 'asc' | 'desc',
    page: paginationModel.page,
    pageSize: paginationModel.pageSize,
  }), [debouncedSearch, yearFilter, statusFilter, sortModel, paginationModel])

  // tRPC query
  const { data, isLoading } = trpc.fees.list.useQuery(queryInput)

  // Check overdue mutation
  const checkOverdueMutation = trpc.fees.checkOverdue.useMutation()

  const rows = useMemo(() => {
    if (!data?.items) return []
    return data.items.map((fee) => ({
      id: fee.id,
      year: fee.year,
      enterpriseName: fee.enterprise?.legalNameVi ?? '—',
      amountDue: fee.amountDue,
      amountPaid: fee.amountPaid,
      dueDate: fee.dueDate,
      paymentStatus: fee.paymentStatus,
    }))
  }, [data])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setYearFilter('')
    setStatusFilter('')
    setPaginationModel((prev) => ({ ...prev, page: 0 }))
  }, [])

  const hasActiveFilters = !!(debouncedSearch || yearFilter || statusFilter)

  // Navigate to fee detail on row click
  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/fees/${params.id}`)
  }, [router])

  // Handle generate fees action
  const handleGenerateFees = useCallback(() => {
    router.push('/fees/generate')
  }, [router])

  // Handle check overdue action
  const handleCheckOverdue = useCallback(() => {
    checkOverdueMutation.mutate(
      { updateMemberStatus: true, createNotifications: true },
    )
  }, [checkOverdueMutation])

  // Handle record payment action
  const handleRecordPayment = useCallback((row: {
    id: string
    year: number
    amountDue: number | string
    amountPaid: number | string
    enterpriseName: string
  }) => {
    setSelectedFee({
      id: row.id,
      year: row.year,
      amountDue: row.amountDue,
      amountPaid: row.amountPaid,
      enterprise: { legalNameVi: row.enterpriseName },
    })
    setPaymentDialogOpen(true)
  }, [])

  // Year options
  const yearOptions = useMemo(() => getYearOptions(), [])

  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'year',
      headerName: 'Năm',
      width: 90,
      sortable: true,
    },
    {
      field: 'enterpriseName',
      headerName: 'Doanh nghiệp',
      flex: 1,
      minWidth: 220,
      sortable: false,
    },
    {
      field: 'amountDue',
      headerName: 'Số tiền phải nộp',
      width: 170,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" fontWeight={500}>
          {formatVND(params.value as number)}
        </Typography>
      ),
    },
    {
      field: 'amountPaid',
      headerName: 'Đã thanh toán',
      width: 170,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" color="success.main">
          {formatVND(params.value as number)}
        </Typography>
      ),
    },
    {
      field: 'dueDate',
      headerName: 'Hạn nộp',
      width: 130,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2">
          {formatDate(params.value as string)}
        </Typography>
      ),
    },
    {
      field: 'paymentStatus',
      headerName: 'Trạng thái',
      width: 170,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={PAYMENT_STATUS_LABELS[params.value as string] ?? params.value}
          color={PAYMENT_STATUS_COLORS[params.value as string] ?? 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Thao tác',
      width: 150,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => {
        const status = params.row.paymentStatus as string
        const canPay = !['PAID', 'WAIVED', 'REFUNDED', 'CANCELLED'].includes(status)
        if (!canPay) return null
        return (
          <Tooltip title="Ghi nhận thanh toán">
            <Button
              size="small"
              variant="outlined"
              color="primary"
              startIcon={<PaymentIcon />}
              onClick={(e) => {
                e.stopPropagation()
                handleRecordPayment(params.row)
              }}
            >
              Thanh toán
            </Button>
          </Tooltip>
        )
      },
    },
  ], [handleRecordPayment])

  // ─── Row styling: highlight overdue ──────────────────────────────────────────

  const getRowClassName = useCallback((params: { row: { paymentStatus: string } }) => {
    const { paymentStatus } = params.row
    if (paymentStatus === 'OVERDUE') return 'row-overdue'
    if (paymentStatus === 'PARTIALLY_PAID') return 'row-partial'
    return ''
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Phí thường niên
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý phí thường niên doanh nghiệp hội viên, theo dõi thanh toán và công nợ.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<ReceiptLongIcon />}
            onClick={handleGenerateFees}
          >
            Tạo phí
          </Button>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<WarningAmberIcon />}
            onClick={handleCheckOverdue}
            disabled={checkOverdueMutation.isPending}
          >
            {checkOverdueMutation.isPending ? 'Đang kiểm tra...' : 'Kiểm tra quá hạn'}
          </Button>
        </Stack>
      </Box>

      {/* Overdue check result notification */}
      {checkOverdueMutation.isSuccess && (
        <Paper sx={{ p: 2, mb: 2, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.200' }}>
          <Typography variant="body2" color="warning.dark">
            Đã kiểm tra: {checkOverdueMutation.data.feesMarkedOverdue} phí đánh dấu quá hạn,{' '}
            {checkOverdueMutation.data.membersMarkedOverdue} hội viên cập nhật trạng thái,{' '}
            {checkOverdueMutation.data.notificationsCreated} thông báo đã gửi.
          </Typography>
        </Paper>
      )}

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
            placeholder="Tìm kiếm theo tên doanh nghiệp, số hóa đơn..."
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

          {/* Year Filter */}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Năm</InputLabel>
            <Select
              value={yearFilter}
              label="Năm"
              onChange={(e) => {
                setYearFilter(e.target.value)
                setPaginationModel((prev) => ({ ...prev, page: 0 }))
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {yearOptions.map((year) => (
                <MenuItem key={year} value={year.toString()}>{year}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Status Filter */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
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
              {Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) => (
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
            '& .row-partial': {
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
            noRowsLabel: 'Không có bản ghi phí nào',
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

      {/* Record Payment Dialog */}
      {selectedFee && (
        <RecordPaymentDialog
          open={paymentDialogOpen}
          onClose={() => {
            setPaymentDialogOpen(false)
            setSelectedFee(null)
          }}
          fee={selectedFee}
        />
      )}
    </Box>
  )
}
