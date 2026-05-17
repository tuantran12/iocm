'use client'

import { useRouter } from 'next/navigation'
import {
  Box, Typography, Card, CardContent, Grid, Stack, LinearProgress,
  Skeleton, Alert, Chip, List, ListItem, ListItemIcon, ListItemText, Divider,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import PeopleIcon from '@mui/icons-material/People'
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial'
import CircleIcon from '@mui/icons-material/Circle'
import { trpc } from '@/lib/trpc'

export default function DashboardTab() {
  const { data, isLoading, error } = trpc.dashboard.stats.useQuery()

  if (isLoading) return <Skeleton variant="rounded" height={300} />
  if (error) return <Alert severity="error">Không thể tải dữ liệu: {error.message}</Alert>
  if (!data) return null

  const { readiness, criticalMissing, personnel, dossier } = data

  return (
    <Box>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: readiness.score >= 80 ? 'success.main' : 'warning.main' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Mức sẵn sàng</Typography>
              <Typography variant="h4" fontWeight="bold">{readiness.score}%</Typography>
              <Typography variant="caption">{readiness.documentsReady}/{readiness.documentsTotal} tài liệu</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: criticalMissing.length > 0 ? 'error.main' : 'success.main' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Thiếu quan trọng</Typography>
              <Typography variant="h4" fontWeight="bold" color={criticalMissing.length > 0 ? 'error' : 'text.primary'}>{criticalMissing.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: 'info.main' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Nhân sự</Typography>
              <Typography variant="h4" fontWeight="bold">{personnel.total}</Typography>
              <Typography variant="caption">{personnel.eligible} đủ điều kiện</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: 'primary.main' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary">Hồ sơ nộp</Typography>
              <Typography variant="h4" fontWeight="bold">{dossier.current?.status ?? '—'}</Typography>
              <Typography variant="caption">{dossier.current?.code ?? 'Chưa tạo'}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {criticalMissing.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Tài liệu cốt lõi còn thiếu</Typography>
            <List dense disablePadding>
              {criticalMissing.map((doc, i) => (
                <Box key={doc.id}>
                  {i > 0 && <Divider />}
                  <ListItem disableGutters>
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      <WarningAmberIcon sx={{ fontSize: 16 }} color="error" />
                    </ListItemIcon>
                    <ListItemText primary={doc.name} secondary={doc.code} primaryTypographyProps={{ variant: 'body2' }} />
                    <Chip label={doc.priority} size="small" color={doc.priority === 'CRITICAL' ? 'error' : 'warning'} variant="outlined" />
                  </ListItem>
                </Box>
              ))}
            </List>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
