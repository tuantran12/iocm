'use client'

import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Skeleton,
} from '@mui/material'
import HistoryIcon from '@mui/icons-material/History'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { trpc } from '@/lib/trpc'

interface VersionsTabProps {
  documentId: string
}

export function VersionsTab({ documentId }: VersionsTabProps) {
  const { data: versions, isLoading } = trpc.documents.listVersions.useQuery(
    { documentId },
    { enabled: !!documentId }
  )

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 1 }} />
      </Box>
    )
  }

  if (!versions || versions.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
        <HistoryIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
        <Typography color="text.secondary">
          Chưa có lịch sử phiên bản. Phiên bản sẽ được tạo tự động khi tài liệu được cập nhật.
        </Typography>
      </Paper>
    )
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <HistoryIcon fontSize="small" />
        Lịch sử phiên bản ({versions.length})
      </Typography>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 100 }}>Phiên bản</TableCell>
              <TableCell>Người thay đổi</TableCell>
              <TableCell>Ghi chú</TableCell>
              <TableCell sx={{ width: 160 }}>Ngày</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {versions.map((version) => (
              <TableRow key={version.id} hover>
                <TableCell>
                  <Chip
                    label={`v${version.version}`}
                    size="small"
                    variant="outlined"
                    color="primary"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {version.changedBy}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color={version.changeNote ? 'text.primary' : 'text.secondary'}>
                    {version.changeNote || '(Không có ghi chú)'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {format(new Date(version.createdAt), 'dd/MM/yyyy HH:mm', { locale: vi })}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
