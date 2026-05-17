'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  Tabs,
  Tab,
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
  Divider,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import SecurityIcon from '@mui/icons-material/Security'
import StorageIcon from '@mui/icons-material/Storage'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'Đề xuất',
  UNDER_REVIEW: 'Đang xem xét',
  APPROVED: 'Đã duyệt',
  PILOT_READY: 'Sẵn sàng pilot',
  DEPLOYED: 'Đã triển khai',
  SUSPENDED: 'Tạm ngưng',
  RETIRED: 'Ngừng sử dụng',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'> = {
  PROPOSED: 'default',
  UNDER_REVIEW: 'info',
  APPROVED: 'primary',
  PILOT_READY: 'warning',
  DEPLOYED: 'success',
  SUSPENDED: 'warning',
  RETIRED: 'error',
}

const REVIEW_LABELS: Record<string, string> = {
  not_reviewed: 'Chưa đánh giá',
  in_review: 'Đang đánh giá',
  approved: 'Đạt',
  rejected: 'Không đạt',
}

const REVIEW_COLORS: Record<string, 'default' | 'info' | 'success' | 'error'> = {
  not_reviewed: 'default',
  in_review: 'info',
  approved: 'success',
  rejected: 'error',
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── Tab Panel Component ─────────────────────────────────────────────────────

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`product-tabpanel-${index}`}
      aria-labelledby={`product-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </Box>
  )
}

// ─── Passport Info Tab ───────────────────────────────────────────────────────

function PassportTab({ product }: { product: Record<string, unknown> }) {
  const fields: Array<{ label: string; key: string; render?: (val: unknown) => React.ReactNode }> = [
    { label: 'Tên sản phẩm', key: 'name' },
    { label: 'Phiên bản', key: 'version' },
    { label: 'Loại', key: 'type' },
    { label: 'Mô tả', key: 'description' },
    {
      label: 'Đối tác',
      key: 'partner',
      render: (val) => {
        const partner = val as { companyName?: string } | null
        return partner?.companyName ?? '—'
      },
    },
    { label: 'Lĩnh vực công nghệ', key: 'technologyDomain' },
    { label: 'Mô hình triển khai', key: 'deploymentModel' },
    {
      label: 'Sử dụng AI',
      key: 'aiUsed',
      render: (val) => (val ? 'Có' : 'Không'),
    },
    { label: 'Phân loại rủi ro', key: 'riskClassification' },
    { label: 'Loại giấy phép', key: 'licenseType' },
    { label: 'Ngày tạo', key: 'createdAt', render: (val) => formatDate(val as string) },
  ]

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Hộ chiếu sản phẩm
        </Typography>
        <Grid container spacing={2}>
          {fields.map(({ label, key, render }) => (
            <Grid size={{ xs: 12, sm: 6 }} key={key}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                {render
                  ? render(product[key])
                  : <Typography variant="body2">{(product[key] as string) || '—'}</Typography>
                }
              </Box>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  )
}

// ─── Reviews Tab ─────────────────────────────────────────────────────────────

function ReviewsTab({ product }: { product: Record<string, unknown> }) {
  const reviews = [
    {
      key: 'securityStatus',
      label: 'Đánh giá Bảo mật',
      icon: <SecurityIcon />,
      status: product.securityStatus as string,
    },
    {
      key: 'dataReviewStatus',
      label: 'Đánh giá Dữ liệu',
      icon: <StorageIcon />,
      status: product.dataReviewStatus as string,
    },
    {
      key: 'aiReviewStatus',
      label: 'Đánh giá AI',
      icon: <SmartToyIcon />,
      status: product.aiReviewStatus as string,
    },
  ]

  function getStatusIcon(status: string) {
    switch (status) {
      case 'approved':
        return <CheckCircleIcon color="success" />
      case 'rejected':
        return <CancelIcon color="error" />
      case 'in_review':
        return <HourglassEmptyIcon color="info" />
      default:
        return <HourglassEmptyIcon color="disabled" />
    }
  }

  const allApproved = (product.securityStatus === 'approved') &&
    (product.dataReviewStatus === 'approved') &&
    (!product.aiUsed || product.aiReviewStatus === 'approved')

  return (
    <Box>
      {allApproved ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          Tất cả đánh giá đã được phê duyệt. Sản phẩm đủ điều kiện chuyển sang trạng thái &quot;Đã duyệt&quot;.
        </Alert>
      ) : (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Sản phẩm cần hoàn thành tất cả đánh giá trước khi được phê duyệt.
        </Alert>
      )}

      <Stack spacing={2}>
        {reviews.map((review) => (
          <Card key={review.key} variant="outlined">
            <CardContent>
              <Stack direction="row" spacing={2} alignItems="center">
                {review.icon}
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {review.label}
                  </Typography>
                  {review.key === 'aiReviewStatus' && !product.aiUsed && (
                    <Typography variant="caption" color="text.secondary">
                      Không bắt buộc (sản phẩm không sử dụng AI)
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  {getStatusIcon(review.status)}
                  <Chip
                    label={REVIEW_LABELS[review.status] ?? review.status}
                    color={REVIEW_COLORS[review.status] ?? 'default'}
                    size="small"
                  />
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Typography variant="body2" color="text.secondary">
        Quy trình đánh giá: Chưa đánh giá → Đang đánh giá → Đạt / Không đạt
      </Typography>
    </Box>
  )
}

// ─── Pilots Tab ──────────────────────────────────────────────────────────────

interface PilotRecord {
  id: string
  deploymentArea: string
  beneficiaryGroup: string | null
  status: string
  project: { id: string; name: string } | null
  createdAt: string | Date
}

function PilotsTab({ pilots }: { pilots: PilotRecord[] }) {
  if (!pilots || pilots.length === 0) {
    return <Alert severity="info">Chưa có pilot nào liên kết với sản phẩm này.</Alert>
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Dự án</TableCell>
            <TableCell>Khu vực triển khai</TableCell>
            <TableCell>Nhóm hưởng lợi</TableCell>
            <TableCell>Trạng thái</TableCell>
            <TableCell>Ngày tạo</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pilots.map((pilot) => (
            <TableRow key={pilot.id}>
              <TableCell>{pilot.project?.name ?? '—'}</TableCell>
              <TableCell>{pilot.deploymentArea}</TableCell>
              <TableCell>{pilot.beneficiaryGroup ?? '—'}</TableCell>
              <TableCell>
                <Chip label={pilot.status} size="small" variant="outlined" />
              </TableCell>
              <TableCell>{formatDate(pilot.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [tabValue, setTabValue] = useState(0)

  const { data: product, isLoading, error } = trpc.products.get.useQuery({ id })

  // ─── Loading State ───────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="text" width={200} height={30} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={48} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={400} />
      </Box>
    )
  }

  // ─── Error State ─────────────────────────────────────────────────────────────

  if (error || !product) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.message || 'Không tìm thấy sản phẩm.'}
        </Alert>
        <Button variant="outlined" onClick={() => router.push('/products')}>
          Quay lại danh sách
        </Button>
      </Box>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const productData = product as unknown as Record<string, unknown>

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push('/products')}
        >
          Sản phẩm
        </MuiLink>
        <Typography color="text.primary">{product.name}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h4">{product.name}</Typography>
            <Chip
              label={STATUS_LABELS[product.status] ?? product.status}
              color={STATUS_COLORS[product.status] ?? 'default'}
              size="small"
            />
          </Stack>
          {product.partner && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Đối tác: {product.partner.companyName}
            </Typography>
          )}
        </Box>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
        >
          Chỉnh sửa
        </Button>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          aria-label="Chi tiết sản phẩm"
        >
          <Tab label="Hộ chiếu" id="product-tab-0" aria-controls="product-tabpanel-0" />
          <Tab label="Đánh giá" id="product-tab-1" aria-controls="product-tabpanel-1" />
          <Tab label="Pilot" id="product-tab-2" aria-controls="product-tabpanel-2" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
        <PassportTab product={productData} />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <ReviewsTab product={productData} />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <PilotsTab pilots={product.pilots as unknown as PilotRecord[]} />
      </TabPanel>
    </Box>
  )
}
