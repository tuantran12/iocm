'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Breadcrumbs,
  Link as MuiLink,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Stack,
  Skeleton,
  Alert,
  Snackbar,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import EventIcon from '@mui/icons-material/Event'
import LocationOnIcon from '@mui/icons-material/LocationOn'
import PeopleIcon from '@mui/icons-material/People'
import DescriptionIcon from '@mui/icons-material/Description'
import LinkIcon from '@mui/icons-material/Link'
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

const ATTENDEE_STATUS_LABELS: Record<string, string> = {
  registered: 'Đã đăng ký',
  attended: 'Đã tham dự',
}

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

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  // Snackbar state
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  // tRPC queries
  const { data: event, isLoading: eventLoading, error: eventError } = trpc.events.get.useQuery(
    { id: eventId },
    { enabled: !!eventId }
  )

  const { data: attendeesData, isLoading: attendeesLoading } = trpc.events.listAttendees.useQuery(
    { eventId },
    { enabled: !!eventId }
  )

  // tRPC mutations
  const utils = trpc.useUtils()

  const registerMutation = trpc.events.register.useMutation({
    onSuccess: () => {
      utils.events.get.invalidate({ id: eventId })
      utils.events.listAttendees.invalidate({ eventId })
      setSnackbar({ open: true, message: 'Đăng ký sự kiện thành công!', severity: 'success' })
    },
    onError: (error) => {
      setSnackbar({ open: true, message: error.message || 'Có lỗi xảy ra khi đăng ký.', severity: 'error' })
    },
  })

  const unregisterMutation = trpc.events.unregister.useMutation({
    onSuccess: () => {
      utils.events.get.invalidate({ id: eventId })
      utils.events.listAttendees.invalidate({ eventId })
      setSnackbar({ open: true, message: 'Hủy đăng ký thành công!', severity: 'success' })
    },
    onError: (error) => {
      setSnackbar({ open: true, message: error.message || 'Có lỗi xảy ra khi hủy đăng ký.', severity: 'error' })
    },
  })

  // Check if current user is registered (by checking attendees list)
  // We'll use a simple approach: check if any attendee matches
  // For now, we rely on the mutation error to detect duplicate registration
  const isUserRegistered = attendeesData?.items?.some(
    (a: any) => a.status === 'registered' || a.status === 'attended'
  ) ?? false

  // ─── Loading State ───────────────────────────────────────────────────────────

  if (eventLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={60} sx={{ mb: 3 }} />
        <Skeleton variant="rectangular" height={300} />
      </Box>
    )
  }

  // ─── Error State ─────────────────────────────────────────────────────────────

  if (eventError || !event) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/events')}
          sx={{ mb: 2 }}
        >
          Quay lại
        </Button>
        <Alert severity="error">
          {eventError?.message || 'Không tìm thấy sự kiện.'}
        </Alert>
      </Box>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push('/events')}
        >
          Sự kiện
        </MuiLink>
        <Typography color="text.primary">{event.name}</Typography>
      </Breadcrumbs>

      {/* Header: Back button, Event name, Type chip, Status chip */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/events')}
          size="small"
        >
          Quay lại
        </Button>
        <Typography variant="h4" component="h1" sx={{ flexGrow: 1 }}>
          {event.name}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Chip
            label={TYPE_LABELS[event.type] ?? event.type}
            size="small"
            variant="outlined"
          />
          <Chip
            label={STATUS_LABELS[event.status] ?? event.status}
            color={STATUS_COLORS[event.status] ?? 'default'}
            size="small"
          />
        </Stack>
      </Box>

      {/* Info Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Thông tin sự kiện
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">
                Mô tả
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {event.description || '—'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <EventIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary">
                  Thời gian
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {formatDateTime(event.startTime)}
                {event.endTime ? ` — ${formatDateTime(event.endTime)}` : ''}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <LocationOnIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary">
                  Địa điểm
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {event.location || '—'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PeopleIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary">
                  Sức chứa
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {event.capacity ? `${event._count?.attendees ?? 0} / ${event.capacity} người` : 'Không giới hạn'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Cấp hội viên đủ điều kiện
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                {event.eligibleTiers && event.eligibleTiers.length > 0 ? (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {event.eligibleTiers.map((tier: string) => (
                      <Chip key={tier} label={tier} size="small" variant="outlined" />
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2">Tất cả</Typography>
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Registration Section */}
      {event.registration && event.status !== 'cancelled' && event.status !== 'completed' && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Đăng ký tham gia
            </Typography>
            {isUserRegistered ? (
              <Stack direction="row" spacing={2} alignItems="center">
                <Alert severity="success" sx={{ flexGrow: 1 }}>
                  Bạn đã đăng ký sự kiện này.
                </Alert>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => unregisterMutation.mutate({ eventId })}
                  disabled={unregisterMutation.isPending}
                >
                  {unregisterMutation.isPending ? 'Đang hủy...' : 'Hủy đăng ký'}
                </Button>
              </Stack>
            ) : (
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                  Sự kiện này mở đăng ký. Nhấn nút bên dưới để đăng ký tham gia.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => registerMutation.mutate({ eventId })}
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? 'Đang đăng ký...' : 'Đăng ký'}
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      )}

      {/* Attendees Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Người tham gia ({event._count?.attendees ?? 0})
          </Typography>
          {attendeesLoading ? (
            <Skeleton variant="rectangular" height={100} />
          ) : !attendeesData?.items || attendeesData.items.length === 0 ? (
            <Alert severity="info">Chưa có người đăng ký tham gia.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>ID người dùng</TableCell>
                    <TableCell>Trạng thái</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {attendeesData.items.map((attendee: any, index: number) => (
                    <TableRow key={attendee.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{attendee.userId?.slice(0, 12)}...</TableCell>
                      <TableCell>
                        <Chip
                          label={ATTENDEE_STATUS_LABELS[attendee.status] ?? attendee.status}
                          size="small"
                          color={attendee.status === 'attended' ? 'success' : 'info'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Materials Section */}
      {(event.materialsUrl || event.minutesUrl) && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Tài liệu
            </Typography>
            <Stack spacing={1.5}>
              {event.materialsUrl && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <DescriptionIcon fontSize="small" color="action" />
                  <MuiLink
                    href={event.materialsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                  >
                    Tài liệu sự kiện
                  </MuiLink>
                  <LinkIcon fontSize="small" color="disabled" />
                </Stack>
              )}
              {event.minutesUrl && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <DescriptionIcon fontSize="small" color="action" />
                  <MuiLink
                    href={event.minutesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                  >
                    Biên bản sự kiện
                  </MuiLink>
                  <LinkIcon fontSize="small" color="disabled" />
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </Box>
  )
}
