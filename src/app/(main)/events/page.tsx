'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  Stack,
  Paper,
  Button,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Pagination,
  Skeleton,
  Tabs,
  Tab,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import EventIcon from '@mui/icons-material/Event'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import PeopleIcon from '@mui/icons-material/People'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  planned: 'Đã lên kế hoạch',
  ongoing: 'Đang diễn ra',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  planned: 'info',
  ongoing: 'success',
  completed: 'primary',
  cancelled: 'error',
}

const TYPE_LABELS: Record<string, string> = {
  seminar: 'Hội thảo',
  workshop: 'Workshop',
  conference: 'Hội nghị',
  networking: 'Kết nối',
  training: 'Đào tạo',
  meeting: 'Họp',
  other: 'Khác',
}

// ─── Tab Definitions ─────────────────────────────────────────────────────────

type TimeFilter = 'upcoming' | 'past' | 'all'

const TAB_OPTIONS: { label: string; value: TimeFilter }[] = [
  { label: 'Sắp tới', value: 'upcoming' },
  { label: 'Đã qua', value: 'past' },
  { label: 'Tất cả', value: 'all' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function EventsPage() {
  const router = useRouter()

  // Tab / time filter state
  const [tabIndex, setTabIndex] = useState(0)
  const timeFilter = TAB_OPTIONS[tabIndex].value

  // Search state
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchTimeout = useMemo(() => ({ current: null as NodeJS.Timeout | null }), [])

  // Pagination state
  const [page, setPage] = useState(0)
  const pageSize = 12

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(0)
    }, 400)
  }, [searchTimeout])

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    setTabIndex(newValue)
    setPage(0)
  }, [])

  // Build query input
  const queryInput = useMemo(() => ({
    timeFilter: timeFilter === 'all' ? undefined : timeFilter,
    search: debouncedSearch || undefined,
    page,
    pageSize,
  }), [timeFilter, debouncedSearch, page, pageSize])

  // tRPC query
  const { data, isLoading } = trpc.events.list.useQuery(queryInput)

  const totalPages = useMemo(() => {
    if (!data?.total) return 0
    return Math.ceil(data.total / pageSize)
  }, [data?.total, pageSize])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Sự kiện
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quản lý sự kiện hội viên — hội thảo, workshop, đào tạo và kết nối.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/events/new')}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Tạo sự kiện
        </Button>
      </Box>

      {/* Tabs + Search */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabIndex} onChange={handleTabChange} aria-label="Lọc sự kiện theo thời gian">
            {TAB_OPTIONS.map((tab, idx) => (
              <Tab key={tab.value} label={tab.label} id={`event-tab-${idx}`} aria-controls={`event-tabpanel-${idx}`} />
            ))}
          </Tabs>
        </Box>
        <Box sx={{ p: 2 }}>
          <TextField
            placeholder="Tìm kiếm theo tên, mô tả, địa điểm..."
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
        </Box>
      </Paper>

      {/* Events Grid */}
      {isLoading ? (
        <Grid container spacing={2}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
              <Skeleton variant="rounded" height={220} />
            </Grid>
          ))}
        </Grid>
      ) : data?.items?.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            {debouncedSearch
              ? 'Không tìm thấy sự kiện nào phù hợp.'
              : timeFilter === 'upcoming'
                ? 'Chưa có sự kiện sắp tới.'
                : timeFilter === 'past'
                  ? 'Chưa có sự kiện đã qua.'
                  : 'Chưa có sự kiện nào.'}
          </Typography>
        </Paper>
      ) : (
        <>
          <Grid container spacing={2}>
            {data?.items?.map((event: any) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={event.id}>
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
                    onClick={() => router.push(`/events/${event.id}`)}
                    sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                  >
                    <CardContent sx={{ flexGrow: 1 }}>
                      {/* Header: Type chip + Status chip */}
                      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                        <Chip
                          label={TYPE_LABELS[event.type] ?? event.type}
                          size="small"
                          variant="outlined"
                          color="default"
                        />
                        <Chip
                          label={STATUS_LABELS[event.status] ?? event.status}
                          color={STATUS_COLORS[event.status] ?? 'default'}
                          size="small"
                        />
                      </Stack>

                      {/* Event Name */}
                      <Typography variant="h6" component="div" gutterBottom noWrap>
                        {event.name}
                      </Typography>

                      {/* Date/Time */}
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                        <EventIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(event.startTime)}
                          {event.endTime ? ` — ${formatDateTime(event.endTime)}` : ''}
                        </Typography>
                      </Stack>

                      {/* Location */}
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                        <LocationOnIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {event.location || '—'}
                        </Typography>
                      </Stack>

                      {/* Attendees / Capacity */}
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <PeopleIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {event._count?.attendees ?? 0}
                          {event.capacity ? ` / ${event.capacity}` : ''} người tham gia
                        </Typography>
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
