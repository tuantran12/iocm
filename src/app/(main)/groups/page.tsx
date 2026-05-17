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
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Pagination,
  Skeleton,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import FilterListIcon from '@mui/icons-material/FilterList'
import ClearIcon from '@mui/icons-material/Clear'
import AddIcon from '@mui/icons-material/Add'
import GroupIcon from '@mui/icons-material/Group'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const GROUP_TYPE_LABELS: Record<string, string> = {
  CORE: 'Nhóm nòng cốt',
  COUNCIL: 'Hội đồng',
  ENTERPRISE: 'Doanh nghiệp',
  DOMAIN: 'Chuyên môn',
  PROJECT: 'Dự án',
  PILOT: 'Thí điểm',
  LEGAL: 'Pháp lý',
  DATA: 'Dữ liệu',
  SPONSOR: 'Tài trợ',
  COMMUNITY: 'Cộng đồng',
  PRIVATE_PARTNER: 'Đối tác riêng',
}

const GROUP_TYPE_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  CORE: 'error',
  COUNCIL: 'secondary',
  ENTERPRISE: 'primary',
  DOMAIN: 'info',
  PROJECT: 'success',
  PILOT: 'warning',
  LEGAL: 'secondary',
  DATA: 'info',
  SPONSOR: 'warning',
  COMMUNITY: 'success',
  PRIVATE_PARTNER: 'default',
}

const GROUP_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Hoạt động',
  ARCHIVED: 'Lưu trữ',
  CLOSED: 'Đã đóng',
}

const GROUP_STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  ACTIVE: 'success',
  ARCHIVED: 'default',
  CLOSED: 'error',
}

const VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC_TO_MEMBERS: 'Công khai',
  PRIVATE_INVITE_ONLY: 'Riêng tư',
  CORE_ONLY: 'Nòng cốt',
  PROJECT_ONLY: 'Dự án',
  COUNCIL_ONLY: 'Hội đồng',
  ENTERPRISE_PRIVATE: 'DN riêng',
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function GroupsPage() {
  const router = useRouter()

  // Filter state
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Pagination state
  const [page, setPage] = useState(0)
  const pageSize = 12

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimeout = useMemo(() => ({ current: null as NodeJS.Timeout | null }), [])

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(0)
    }, 400)
  }, [searchTimeout])

  // Build query input
  const queryInput = useMemo(() => ({
    search: debouncedSearch || undefined,
    type: (typeFilter || undefined) as any,
    status: (statusFilter || undefined) as any,
    page,
    pageSize,
  }), [debouncedSearch, typeFilter, statusFilter, page, pageSize])

  // tRPC query
  const { data, isLoading } = trpc.groups.list.useQuery(queryInput)

  const totalPages = useMemo(() => {
    if (!data?.total) return 0
    return Math.ceil(data.total / pageSize)
  }, [data?.total, pageSize])

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setTypeFilter('')
    setStatusFilter('')
    setPage(0)
  }, [])

  const hasActiveFilters = !!(debouncedSearch || typeFilter || statusFilter)

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Nhóm làm việc
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý các nhóm làm việc, nhóm chuyên môn, nhóm dự án và hội đồng.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/groups/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Tạo nhóm
        </Button>
      </Box>

      {/* Filter Toolbar */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ md: 'center' }}
          flexWrap="wrap"
          useFlexGap
        >
          {/* Search */}
          <TextField
            placeholder="Tìm kiếm theo tên nhóm, mô tả, mục tiêu..."
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

          {/* Type Filter */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Loại nhóm</InputLabel>
            <Select
              value={typeFilter}
              label="Loại nhóm"
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setPage(0)
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(GROUP_TYPE_LABELS).map(([key, label]) => (
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
                setPage(0)
              }}
            >
              <MenuItem value="">Tất cả</MenuItem>
              {Object.entries(GROUP_STATUS_LABELS).map(([key, label]) => (
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

      {/* Groups Grid */}
      {isLoading ? (
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Skeleton variant="rounded" height={200} />
            </Grid>
          ))}
        </Grid>
      ) : data?.items?.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {hasActiveFilters
              ? 'Không tìm thấy nhóm nào phù hợp với bộ lọc.'
              : 'Chưa có nhóm làm việc nào.'}
          </Typography>
        </Paper>
      ) : (
        <>
          <Grid container spacing={2}>
            {data?.items?.map((group: any) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={group.id}>
                <Card
                  variant="outlined"
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'box-shadow 0.2s, border-color 0.2s',
                    '&:hover': {
                      boxShadow: 4,
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <CardActionArea
                    onClick={() => router.push(`/groups/${group.id}`)}
                    sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                  >
                    <CardContent sx={{ flexGrow: 1 }}>
                      {/* Header: Type chip + Status chip */}
                      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                        <Chip
                          label={GROUP_TYPE_LABELS[group.type] ?? group.type}
                          color={GROUP_TYPE_COLORS[group.type] ?? 'default'}
                          size="small"
                        />
                        <Chip
                          label={GROUP_STATUS_LABELS[group.status] ?? group.status}
                          color={GROUP_STATUS_COLORS[group.status] ?? 'default'}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>

                      {/* Group Name */}
                      <Typography variant="h6" component="div" gutterBottom noWrap>
                        {group.name}
                      </Typography>

                      {/* Goal (truncated) */}
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mb: 2,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          minHeight: '2.5em',
                        }}
                      >
                        {group.goal || group.description || '—'}
                      </Typography>

                      {/* Footer: Members, Messages, Visibility */}
                      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Tooltip title="Thành viên">
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <GroupIcon fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">
                              {group._count?.members ?? 0}
                            </Typography>
                          </Stack>
                        </Tooltip>
                        <Tooltip title="Tin nhắn">
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <ChatBubbleOutlineIcon fontSize="small" color="action" />
                            <Typography variant="body2" color="text.secondary">
                              {group._count?.messages ?? 0}
                            </Typography>
                          </Stack>
                        </Tooltip>
                        <Tooltip title="Hiển thị">
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <VisibilityIcon fontSize="small" color="action" />
                            <Typography variant="caption" color="text.secondary">
                              {VISIBILITY_LABELS[group.visibility] ?? group.visibility}
                            </Typography>
                          </Stack>
                        </Tooltip>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
              <Pagination
                count={totalPages}
                page={page + 1}
                onChange={(_, newPage) => setPage(newPage - 1)}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </>
      )}
    </Box>
  )
}
