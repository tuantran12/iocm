'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Stack,
  Button,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import HandshakeIcon from '@mui/icons-material/Handshake'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { trpc } from '@/lib/trpc'

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
  REFUNDED: 'primary',
  CANCELLED: 'default',
}

// ─── Currency Formatter ──────────────────────────────────────────────────────

function formatVND(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0)
  return num.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Finance Dashboard Page ──────────────────────────────────────────────────

export default function FinanceDashboardPage() {
  const router = useRouter()
  const { data, isLoading, error } = trpc.finance.dashboard.useQuery()

  const totalRecords = useMemo(() => {
    if (!data?.feesByStatus) return 0
    return data.feesByStatus.reduce((sum, item) => sum + item.count, 0)
  }, [data?.feesByStatus])

  // ─── Loading State ───────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    )
  }

  // ─── Error State ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        Không thể tải dữ liệu tài chính: {error.message}
      </Alert>
    )
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Tài chính
      </Typography>

      {/* ─── Summary Cards ─────────────────────────────────────────────────────── */}

      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: 'success.main' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <AccountBalanceWalletIcon color="success" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Phí đã thu
                </Typography>
              </Stack>
              <Typography variant="h5" fontWeight="bold">
                {formatVND(data?.totalFeesCollected)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: 'error.main' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <WarningAmberIcon color="error" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Phí quá hạn
                </Typography>
              </Stack>
              <Typography variant="h5" fontWeight="bold" color="error">
                {formatVND(data?.totalFeesOverdue)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: 'info.main' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <HandshakeIcon color="info" fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Tài trợ cam kết
                </Typography>
              </Stack>
              <Typography variant="h5" fontWeight="bold">
                {formatVND(data?.totalSponsorships)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ borderLeft: 4, borderColor: 'grey.500' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <ReceiptLongIcon fontSize="small" />
                <Typography variant="body2" color="text.secondary">
                  Tổng bản ghi phí
                </Typography>
              </Stack>
              <Typography variant="h5" fontWeight="bold">
                {totalRecords}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ─── Fees by Status ────────────────────────────────────────────────────── */}

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Phí theo trạng thái
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {data?.feesByStatus && data.feesByStatus.length > 0 ? (
            data.feesByStatus.map((item) => (
              <Chip
                key={item.status}
                label={`${PAYMENT_STATUS_LABELS[item.status] ?? item.status}: ${item.count}`}
                color={PAYMENT_STATUS_COLORS[item.status] ?? 'default'}
                variant="outlined"
              />
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              Chưa có dữ liệu
            </Typography>
          )}
        </Stack>
      </Box>

      {/* ─── Recent Payments Table ─────────────────────────────────────────────── */}

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Thanh toán gần đây
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Doanh nghiệp</TableCell>
                <TableCell align="right">Số tiền</TableCell>
                <TableCell>Ngày thanh toán</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.recentPayments && data.recentPayments.length > 0 ? (
                data.recentPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {payment.enterprise?.legalNameVi ?? '—'}
                    </TableCell>
                    <TableCell align="right">
                      {formatVND(payment.amountPaid)}
                    </TableCell>
                    <TableCell>
                      {formatDate(payment.paymentDate)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      Chưa có thanh toán nào
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* ─── Navigation Buttons ────────────────────────────────────────────────── */}

      <Stack direction="row" spacing={2}>
        <Button
          variant="outlined"
          endIcon={<ArrowForwardIcon />}
          onClick={() => router.push('/finance/sponsorships')}
        >
          Quản lý tài trợ
        </Button>
        <Button
          variant="outlined"
          endIcon={<ArrowForwardIcon />}
          onClick={() => router.push('/fees')}
        >
          Quản lý phí
        </Button>
      </Stack>
    </Box>
  )
}
