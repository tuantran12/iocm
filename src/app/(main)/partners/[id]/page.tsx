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
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const RISK_LABELS: Record<string, string> = {
  R1: 'R1 - Rất thấp',
  R2: 'R2 - Thấp',
  R3: 'R3 - Trung bình',
  R4: 'R4 - Cao',
  R5: 'R5 - Rất cao',
}

const RISK_COLORS: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  R1: 'success',
  R2: 'info',
  R3: 'warning',
  R4: 'error',
  R5: 'error',
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Mới',
  active: 'Hoạt động',
  suspended: 'Tạm ngưng',
  terminated: 'Chấm dứt',
  under_review: 'Đang xem xét',
}

const AGREEMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  LEGAL_REVIEW: 'Xem xét pháp lý',
  NEGOTIATION: 'Đàm phán',
  PENDING_SIGNATURE: 'Chờ ký',
  SIGNED: 'Đã ký',
  ACTIVE: 'Hiệu lực',
  EXPIRING: 'Sắp hết hạn',
  EXPIRED: 'Hết hạn',
  TERMINATED: 'Chấm dứt',
  ARCHIVED: 'Lưu trữ',
}

const AGREEMENT_STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  DRAFT: 'default',
  LEGAL_REVIEW: 'info',
  NEGOTIATION: 'warning',
  PENDING_SIGNATURE: 'primary',
  SIGNED: 'info',
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'error',
  TERMINATED: 'error',
  ARCHIVED: 'default',
}

const PRODUCT_STATUS_LABELS: Record<string, string> = {
  PROPOSED: 'Đề xuất',
  UNDER_REVIEW: 'Đang xem xét',
  APPROVED: 'Đã duyệt',
  PILOT_READY: 'Sẵn sàng pilot',
  DEPLOYED: 'Đã triển khai',
  SUSPENDED: 'Tạm ngưng',
  RETIRED: 'Ngừng sử dụng',
}

const PRODUCT_STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  PROPOSED: 'default',
  UNDER_REVIEW: 'info',
  APPROVED: 'primary',
  PILOT_READY: 'warning',
  DEPLOYED: 'success',
  SUSPENDED: 'warning',
  RETIRED: 'error',
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
      id={`partner-tabpanel-${index}`}
      aria-labelledby={`partner-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </Box>
  )
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab({ partner }: { partner: Record<string, unknown> }) {
  const fields: Array<{ label: string; key: string; render?: (val: unknown) => React.ReactNode }> = [
    { label: 'Tên công ty', key: 'companyName' },
    { label: 'Mã số thuế', key: 'taxCode' },
    { label: 'Người đại diện pháp luật', key: 'legalRepresentative' },
    { label: 'Địa chỉ', key: 'address' },
    {
      label: 'Lĩnh vực công nghệ',
      key: 'technologyDomains',
      render: (val) => {
        const domains = val as string[] | null
        if (!domains || domains.length === 0) return '—'
        return (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {domains.map((d) => (
              <Chip key={d} label={d} size="small" variant="outlined" />
            ))}
          </Stack>
        )
      },
    },
    {
      label: 'Sản phẩm chính',
      key: 'coreProducts',
      render: (val) => {
        const products = val as string[] | null
        if (!products || products.length === 0) return '—'
        return (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {products.map((p) => (
              <Chip key={p} label={p} size="small" variant="outlined" />
            ))}
          </Stack>
        )
      },
    },
    {
      label: 'Chứng chỉ',
      key: 'certifications',
      render: (val) => {
        const certs = val as string[] | null
        if (!certs || certs.length === 0) return '—'
        return (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {certs.map((c) => (
              <Chip key={c} label={c} size="small" color="primary" variant="outlined" />
            ))}
          </Stack>
        )
      },
    },
    {
      label: 'Trạng thái quan hệ',
      key: 'relationshipStatus',
      render: (val) => (
        <Chip
          label={STATUS_LABELS[val as string] ?? val}
          size="small"
        />
      ),
    },
    { label: 'Ngày review cuối', key: 'lastReviewDate', render: (val) => formatDate(val as string) },
    { label: 'Ngày tạo', key: 'createdAt', render: (val) => formatDate(val as string) },
  ]

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Thông tin đối tác
        </Typography>
        <Grid container spacing={2}>
          {fields.map(({ label, key, render }) => (
            <Grid size={{ xs: 12, sm: 6 }} key={key}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                {render
                  ? render(partner[key])
                  : <Typography variant="body2">{(partner[key] as string) || '—'}</Typography>
                }
              </Box>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  )
}

// ─── Due Diligence Tab ───────────────────────────────────────────────────────

interface DueDiligenceRecord {
  id: string
  reviewDate: string | Date
  overallScore: number | null
  riskRating: string | null
  legalScore: number | null
  technicalScore: number | null
  securityScore: number | null
  dataScore: number | null
  aiScore: number | null
  decision: string | null
}

function DueDiligenceTab({ dueDiligences, partnerId }: { dueDiligences: DueDiligenceRecord[]; partnerId: string }) {
  const router = useRouter()

  return (
    <Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push(`/partners/${partnerId}/due-diligence`)}
        >
          Thẩm định mới
        </Button>
      </Box>
      {!dueDiligences || dueDiligences.length === 0 ? (
        <Alert severity="info">Chưa có lịch sử thẩm định.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ngày thẩm định</TableCell>
                <TableCell>Pháp lý</TableCell>
                <TableCell>Kỹ thuật</TableCell>
                <TableCell>Bảo mật</TableCell>
                <TableCell>Dữ liệu</TableCell>
                <TableCell>AI</TableCell>
                <TableCell>Tổng điểm</TableCell>
                <TableCell>Mức rủi ro</TableCell>
                <TableCell>Quyết định</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dueDiligences.map((dd) => (
                <TableRow key={dd.id}>
                  <TableCell>{formatDate(dd.reviewDate)}</TableCell>
                  <TableCell>{dd.legalScore ?? '—'}</TableCell>
                  <TableCell>{dd.technicalScore ?? '—'}</TableCell>
                  <TableCell>{dd.securityScore ?? '—'}</TableCell>
                  <TableCell>{dd.dataScore ?? '—'}</TableCell>
                  <TableCell>{dd.aiScore ?? '—'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {dd.overallScore ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {dd.riskRating ? (
                      <Chip
                        label={dd.riskRating}
                        color={RISK_COLORS[dd.riskRating] ?? 'default'}
                        size="small"
                      />
                    ) : '—'}
                  </TableCell>
                  <TableCell>{dd.decision ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

// ─── Agreements Tab ──────────────────────────────────────────────────────────

interface AgreementRecord {
  id: string
  type: string
  title: string
  status: string
  effectiveDate?: string | Date | null
  expiryDate?: string | Date | null
}

function AgreementsTab({ agreements }: { agreements: AgreementRecord[] }) {
  if (!agreements || agreements.length === 0) {
    return <Alert severity="info">Chưa có hợp đồng/thỏa thuận nào.</Alert>
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Tiêu đề</TableCell>
            <TableCell>Loại</TableCell>
            <TableCell>Ngày hiệu lực</TableCell>
            <TableCell>Ngày hết hạn</TableCell>
            <TableCell>Trạng thái</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {agreements.map((ag) => (
            <TableRow key={ag.id}>
              <TableCell>{ag.title}</TableCell>
              <TableCell>{ag.type}</TableCell>
              <TableCell>{formatDate(ag.effectiveDate)}</TableCell>
              <TableCell>{formatDate(ag.expiryDate)}</TableCell>
              <TableCell>
                <Chip
                  label={AGREEMENT_STATUS_LABELS[ag.status] ?? ag.status}
                  color={AGREEMENT_STATUS_COLORS[ag.status] ?? 'default'}
                  size="small"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ─── Products Tab ────────────────────────────────────────────────────────────

interface ProductRecord {
  id: string
  name: string
  version: string | null
  type: string
  technologyDomain: string | null
  status: string
}

function ProductsTab({ products }: { products: ProductRecord[] }) {
  if (!products || products.length === 0) {
    return <Alert severity="info">Chưa có sản phẩm công nghệ nào.</Alert>
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Tên sản phẩm</TableCell>
            <TableCell>Phiên bản</TableCell>
            <TableCell>Loại</TableCell>
            <TableCell>Lĩnh vực CN</TableCell>
            <TableCell>Trạng thái</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((prod) => (
            <TableRow key={prod.id}>
              <TableCell>{prod.name}</TableCell>
              <TableCell>{prod.version ?? '—'}</TableCell>
              <TableCell>{prod.type}</TableCell>
              <TableCell>{prod.technologyDomain ?? '—'}</TableCell>
              <TableCell>
                <Chip
                  label={PRODUCT_STATUS_LABELS[prod.status] ?? prod.status}
                  color={PRODUCT_STATUS_COLORS[prod.status] ?? 'default'}
                  size="small"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function PartnerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [tabValue, setTabValue] = useState(0)

  const { data: partner, isLoading, error } = trpc.partners.get.useQuery({ id })

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

  if (error || !partner) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.message || 'Không tìm thấy đối tác.'}
        </Alert>
        <Button variant="outlined" onClick={() => router.push('/partners')}>
          Quay lại danh sách
        </Button>
      </Box>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const partnerData = partner as unknown as Record<string, unknown>

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push('/partners')}
        >
          Đối tác
        </MuiLink>
        <Typography color="text.primary">{partner.companyName}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h4">{partner.companyName}</Typography>
            {partner.riskRating && (
              <Chip
                label={RISK_LABELS[partner.riskRating] ?? partner.riskRating}
                color={RISK_COLORS[partner.riskRating] ?? 'default'}
                size="small"
              />
            )}
            <Chip
              label={STATUS_LABELS[partner.relationshipStatus] ?? partner.relationshipStatus}
              size="small"
              variant="outlined"
            />
          </Stack>
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
          aria-label="Chi tiết đối tác"
        >
          <Tab label="Hồ sơ" id="partner-tab-0" aria-controls="partner-tabpanel-0" />
          <Tab label="Thẩm định" id="partner-tab-1" aria-controls="partner-tabpanel-1" />
          <Tab label="Hợp đồng" id="partner-tab-2" aria-controls="partner-tabpanel-2" />
          <Tab label="Sản phẩm" id="partner-tab-3" aria-controls="partner-tabpanel-3" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
        <ProfileTab partner={partnerData} />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <DueDiligenceTab
          dueDiligences={partner.dueDiligences as unknown as DueDiligenceRecord[]}
          partnerId={id}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <AgreementsTab agreements={partner.agreements as unknown as AgreementRecord[]} />
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <ProductsTab products={partner.products as unknown as ProductRecord[]} />
      </TabPanel>
    </Box>
  )
}
