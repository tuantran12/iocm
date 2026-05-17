'use client'

import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Stack,
  Button,
  LinearProgress,
  Skeleton,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Badge,
} from '@mui/material'
import DescriptionIcon from '@mui/icons-material/Description'
import PeopleIcon from '@mui/icons-material/People'
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial'
import SendIcon from '@mui/icons-material/Send'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CircleIcon from '@mui/icons-material/Circle'
import { trpc } from '@/lib/trpc'

function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function DashboardSkeleton() {
  return (
    <Box>
      <Skeleton variant="text" width={300} height={40} sx={{ mb: 1 }} />
      <Skeleton variant="text" width={200} height={24} sx={{ mb: 3 }} />
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {[1, 2, 3, 4].map((i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
            <Skeleton variant="rounded" height={120} />
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { data, isLoading, error } = trpc.dashboard.stats.useQuery()

  if (isLoading) return <DashboardSkeleton />

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        Không thể tải dữ liệu tổng quan: {error.message}
      </Alert>
    )
  }

  if (!data) return null

  const { readiness, criticalMissing, personnel, dossier, submissions, profile, alerts } = data

  return (
    <Box>
      {/* Header */}
      <Typography variant="h4" gutterBottom>
        Không gian thành lập Viện
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {profile?.nameVi ?? 'Chưa thiết lập hồ sơ Viện'} · {formatDate(new Date())}
      </Typography>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {/* Readiness Score */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: readiness.score >= 80 ? 'success.main' : readiness.score >= 50 ? 'warning.main' : 'error.main' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <CheckCircleIcon color={readiness.score >= 80 ? 'success' : 'warning'} fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Mức sẵn sàng
                </Typography>
              </Stack>
              <Typography variant="h4" fontWeight="bold">
                {readiness.score}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {readiness.documentsReady}/{readiness.documentsTotal} tài liệu hoàn thành
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Critical Missing */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: criticalMissing.length > 0 ? 'error.main' : 'success.main' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <WarningAmberIcon color={criticalMissing.length > 0 ? 'error' : 'success'} fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Thiếu quan trọng
                </Typography>
              </Stack>
              <Typography variant="h4" fontWeight="bold" color={criticalMissing.length > 0 ? 'error' : 'text.primary'}>
                {criticalMissing.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Tài liệu cốt lõi chưa hoàn thành
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Personnel */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: 'info.main' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <PeopleIcon color="info" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Nhân sự thành lập
                </Typography>
              </Stack>
              <Typography variant="h4" fontWeight="bold">
                {personnel.total}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {personnel.eligible} đủ điều kiện chuyên môn
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Dossier Status */}
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: dossier.current ? 'primary.main' : 'grey.400' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <FolderSpecialIcon color="primary" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Bộ hồ sơ nộp
                </Typography>
              </Stack>
              <Typography variant="h4" fontWeight="bold">
                {dossier.current?.status ?? '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {dossier.current ? dossier.current.code : 'Chưa tạo bộ hồ sơ'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Critical Missing Items */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Tài liệu cốt lõi còn thiếu
              </Typography>
              {criticalMissing.length > 0 ? (
                <List dense disablePadding>
                  {criticalMissing.map((doc, index) => (
                    <Box key={doc.id}>
                      {index > 0 && <Divider />}
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <WarningAmberIcon sx={{ fontSize: 16, color: doc.priority === 'CRITICAL' ? 'error.main' : 'warning.main' }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={doc.name}
                          secondary={`${doc.code} · ${doc.status}`}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                        <Chip label={doc.priority} size="small" color={doc.priority === 'CRITICAL' ? 'error' : 'warning'} variant="outlined" />
                      </ListItem>
                    </Box>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="success.main">
                  ✓ Tất cả tài liệu cốt lõi đã hoàn thành
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Dossier Checklist */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Checklist hồ sơ nộp
              </Typography>
              {Object.keys(dossier.itemsByStatus).length > 0 ? (
                <Stack spacing={1.5}>
                  {Object.entries(dossier.itemsByStatus).map(([status, count]) => (
                    <Stack key={status} direction="row" alignItems="center" spacing={1}>
                      <CircleIcon sx={{ fontSize: 10, color: status === 'ready' ? 'success.main' : status === 'missing' ? 'error.main' : 'warning.main' }} />
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {status === 'ready' ? 'Sẵn sàng' : status === 'missing' ? 'Còn thiếu' : status}
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {count as number}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Chưa có mục nào trong bộ hồ sơ
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Submissions */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Theo dõi nộp hồ sơ
              </Typography>
              {submissions.length > 0 ? (
                <List dense disablePadding>
                  {submissions.map((sub, index) => (
                    <Box key={sub.id}>
                      {index > 0 && <Divider />}
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <SendIcon sx={{ fontSize: 16 }} color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary={`${sub.receivingAuthority} — ${sub.submissionMethod}`}
                          secondary={`Nộp: ${new Date(sub.submittedAt).toLocaleDateString('vi-VN')} · ${sub.currentStatus}`}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItem>
                    </Box>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Chưa có lần nộp nào
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Alerts */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <Badge badgeContent={alerts.unreadCount} color="error">
                  <NotificationsActiveIcon color="action" />
                </Badge>
                <Typography variant="h6">Thông báo</Typography>
              </Stack>
              {alerts.recent.length > 0 ? (
                <List dense disablePadding>
                  {alerts.recent.map((alert, index) => (
                    <Box key={alert.id}>
                      {index > 0 && <Divider />}
                      <ListItem disableGutters>
                        <ListItemIcon sx={{ minWidth: 32 }}>
                          <CircleIcon sx={{ fontSize: 8, color: alert.read ? 'grey.400' : 'primary.main' }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={alert.title}
                          secondary={alert.message ?? undefined}
                          primaryTypographyProps={{ variant: 'body2', fontWeight: alert.read ? 'normal' : 'bold' }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                      </ListItem>
                    </Box>
                  ))}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Không có thông báo mới
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Quick Links */}
      <Typography variant="h6" gutterBottom>
        Truy cập nhanh
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={1.5}>
        <Button
          variant="outlined"
          startIcon={<DescriptionIcon />}
          endIcon={<ArrowForwardIcon />}
          onClick={() => router.push('/institute-profile')}
        >
          Hồ sơ Viện
        </Button>
        <Button
          variant="outlined"
          startIcon={<DescriptionIcon />}
          endIcon={<ArrowForwardIcon />}
          onClick={() => router.push('/documents')}
        >
          Tài liệu
        </Button>
        <Button
          variant="outlined"
          startIcon={<PeopleIcon />}
          endIcon={<ArrowForwardIcon />}
          onClick={() => router.push('/personnel/establishment')}
        >
          Nhân sự
        </Button>
        <Button
          variant="outlined"
          startIcon={<FolderSpecialIcon />}
          endIcon={<ArrowForwardIcon />}
          onClick={() => router.push('/registration-dossier')}
        >
          Bộ hồ sơ nộp
        </Button>
      </Stack>
    </Box>
  )
}
