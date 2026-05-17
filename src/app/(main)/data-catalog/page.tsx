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
  type GridRenderCellParams,
} from '@mui/x-data-grid'
import SearchIcon from '@mui/icons-material/Search'
import FilterListIcon from '@mui/icons-material/FilterList'
import ClearIcon from '@mui/icons-material/Clear'
import AddIcon from '@mui/icons-material/Add'
import { trpc } from '@/lib/trpc'
import { Confidentiality } from '@prisma/client'

// ─── Vietnamese Labels & Colors ──────────────────────────────────────────────

const CONFIDENTIALITY_LABELS: Record<string, string> = {
  PUBLIC: 'Công khai',
  INTERNAL: 'Nội bộ',
  CONFIDENTIAL: 'Bí mật',
  RESTRICTED: 'Hạn chế tối đa',
  SECRET: 'Tuyệt mật',
}

const CONFIDENTIALITY_COLORS: Record<string, 'success' | 'info' | 'warning' | 'error'> = {
  PUBLIC: 'success',
  INTERNAL: 'info',
  CONFIDENTIAL: 'warning',
  RESTRICTED: 'error',
  SECRET: 'error',
}

const PERSONAL_DATA_LABELS: Record<string, string> = {
  none: 'Không có DLCN',
  basic: 'DLCN cơ bản',
  sensitive: 'DLCN nhạy cảm',
  special_category: 'DLCN đặc biệt',
}

const PERSONAL_DATA_COLORS: Record<string, 'default' | 'info' | 'warning' | 'error'> = {
  none: 'default',
  basic: 'info',
  sensitive: 'warning',
  special_category: 'error',
}

const RISK_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  critical: 'Nghiêm trọng',
}

const RISK_COLORS: Record<string, 'success' | 'warning' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
  critical: 'error',
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function DataCatalogPage() {
  const router = useRouter()

  // Filter state
  const [search, setSearch] = useState('')
  const [confidentialityFilter, setConfidentialityFilter] = useState<string>('')
  const [personalDataFilter, setPersonalDataFilter] = useState<string>('')

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimeout = useMemo(() => ({ current: null as NodeJS.Timeout | null }), [])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 400)
  }, [searchTimeout])

  // Build query input
  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    confidentiality: (confidentialityFilter || undefined) as Confidentiality | undefined,
    personalDataLevel: personalDataFilter || undefined,
  }), [debouncedSearch, confidentialityFilter, personalDataFilter])

  // tRPC query
  const { data, isLoading } = trpc.dataCatalog.list.useQuery(queryInput)

  const rows = useMemo(() => {
    if (!data) return []
    return data.map((item) => ({
      id: item.id,
      name: item.name,
      confidentiality: item.confidentiality,
      personalDataLevel: item.personalDataLevel,
      ownerId: item.ownerId,
      riskLevel: item.riskLevel,
      encrypted: item.encrypted,
    }))
  }, [data])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setConfidentialityFilter('')
    setPersonalDataFilter('')
  }, [])

  const hasActiveFilters = !!(debouncedSearch || confidentialityFilter || personalDataFilter)

  // Navigate to detail on row click
  const handleRowClick = useCallback((params: { id: string | number }) => {
    router.push(`/data-catalog/${params.id}`)
  }, [router])

  // ─── Column Definitions ──────────────────────────────────────────────────────

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'name',
      headerName: 'Tên',
      flex: 1,
      minWidth: 220,
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
      field: 'confidentiality',
      headerName: 'Phân loại bảo mật',
      width: 170,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={CONFIDENTIALITY_LABELS[params.value as string] ?? params.value}
          color={CONFIDENTIALITY_COLORS[params.value as string] ?? 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'personalDataLevel',
      headerName: 'Dữ liệu cá nhân',
      width: 160,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={PERSONAL_DATA_LABELS[params.value as string] ?? params.value}
          color={PERSONAL_DATA_COLORS[params.value as string] ?? 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'ownerId',
      headerName: 'Chủ sở hữu',
      width: 150,
      sortable: false,
      renderCell: (params: GridRenderCellParams) => (
        <Typography variant="body2" color="text.secondary">
          {params.value ? String(params.value).slice(0, 8) + '...' : '—'}
        </Typography>
      ),
    },
    {
      field: 'riskLevel',
      headerName: 'Mức rủi ro',
      width: 140,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={RISK_LABELS[params.value as string] ?? params.value}
          color={RISK_COLORS[params.value as string] ?? 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'encrypted',
      headerName: 'Mã hóa',
      width: 110,
      sortable: true,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={params.value ? 'Có' : 'Không'}
          color={params.value ? 'success' : 'default'}
          size="small"
          variant="outlined"
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
            Danh mục Dữ liệu
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý danh mục dữ liệu — phân loại bảo mật, dữ liệu cá nhân và mức rủi ro.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/data-catalog/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Thêm danh mục
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
            placeholder="Tìm kiếm theo tên danh mục..."
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

          {/* Confidentiality Filter */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Phân loại bảo mật</InputLabel>
            <Select
              value={confidentialityFilter}
              label="Phân loại bảo mật"
              onChange={(e) => setConfidentialityFilter(e.target.value)}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(CONFIDENTIALITY_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Personal Data Level Filter */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Dữ liệu cá nhân</InputLabel>
            <Select
              value={personalDataFilter}
              label="Dữ liệu cá nhân"
              onChange={(e) => setPersonalDataFilter(e.target.value)}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(PERSONAL_DATA_LABELS).map(([key, label]) => (
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
            noRowsLabel: 'Không có danh mục dữ liệu nào',
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
