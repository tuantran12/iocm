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
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PROSPECT: 'Tiềm năng',
  INVITED: 'Đã mời',
  APPLICATION_SUBMITTED: 'Đã nộp đơn',
  UNDER_REVIEW: 'Đang xem xét',
  APPROVED: 'Đã duyệt',
  ACTIVE: 'Hoạt động',
  PAYMENT_OVERDUE: 'Quá hạn phí',
  SUSPENDED: 'Tạm ngưng',
  TERMINATED: 'Chấm dứt',
  WITHDRAWN: 'Rút lui',
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  PROSPECT: 'default',
  INVITED: 'info',
  APPLICATION_SUBMITTED: 'primary',
  UNDER_REVIEW: 'warning',
  APPROVED: 'info',
  ACTIVE: 'success',
  PAYMENT_OVERDUE: 'error',
  SUSPENDED: 'warning',
  TERMINATED: 'error',
  WITHDRAWN: 'default',
}

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

// ─── Helper ──────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatCurrency(amount: number | string | null | undefined): string {
  if (amount == null) return '—'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return num.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' })
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
      id={`member-tabpanel-${index}`}
      aria-labelledby={`member-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </Box>
  )
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab({ member }: { member: Record<string, unknown> }) {
  const fields: Array<{ label: string; key: string; render?: (val: unknown) => React.ReactNode }> = [
    { label: 'Tên pháp lý (Tiếng Việt)', key: 'legalNameVi' },
    { label: 'Tên pháp lý (Tiếng Anh)', key: 'legalNameEn' },
    { label: 'Mã số thuế', key: 'taxCode' },
    { label: 'Số ĐKKD', key: 'businessRegNumber' },
    { label: 'Người đại diện pháp luật', key: 'legalRepresentative' },
    { label: 'Địa chỉ', key: 'address' },
    { label: 'Website', key: 'website' },
    { label: 'Ngành nghề', key: 'industrySector' },
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
    { label: 'Quy mô công ty', key: 'companySize' },
    { label: 'Người liên hệ', key: 'contactName' },
    { label: 'Email liên hệ', key: 'contactEmail' },
    { label: 'Điện thoại liên hệ', key: 'contactPhone' },
    {
      label: 'Trạng thái hội viên',
      key: 'membershipStatus',
      render: (val) => (
        <Chip
          label={STATUS_LABELS[val as string] ?? val}
          color={STATUS_COLORS[val as string] ?? 'default'}
          size="small"
        />
      ),
    },
    { label: 'Ngày tham gia', key: 'joinedDate', render: (val) => formatDate(val as string) },
    { label: 'Ngày gia hạn', key: 'renewalDate', render: (val) => formatDate(val as string) },
  ]

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Thông tin doanh nghiệp
        </Typography>
        <Grid container spacing={2}>
          {fields.map(({ label, key, render }) => (
            <Grid size={{ xs: 12, sm: 6 }} key={key}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Box sx={{ mt: 0.5 }}>
                {render
                  ? render(member[key])
                  : <Typography variant="body2">{(member[key] as string) || '—'}</Typography>
                }
              </Box>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  )
}

// ─── Tier Tab ────────────────────────────────────────────────────────────────

function TierTab({ tier }: { tier: Record<string, unknown> | null }) {
  if (!tier) {
    return (
      <Alert severity="info">Chưa có thông tin cấp hội viên.</Alert>
    )
  }

  const benefits = tier.benefits as string[] | Record<string, unknown> | null
  const accessRights = tier.accessRights as string[] | Record<string, unknown> | null

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Cấp hội viên hiện tại
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">Tên cấp</Typography>
            <Typography variant="body2">{(tier.name as string) || '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">Phí thường niên</Typography>
            <Typography variant="body2">{formatCurrency(tier.annualFee as number)}</Typography>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Typography variant="caption" color="text.secondary">Mô tả</Typography>
            <Typography variant="body2">{(tier.description as string) || '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">Quyền biểu quyết</Typography>
            <Typography variant="body2">{tier.votingRight ? 'Có' : 'Không'}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">Quyền tham gia dự án</Typography>
            <Typography variant="body2">{tier.projectRight ? 'Có' : 'Không'}</Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">Số người dùng tối đa</Typography>
            <Typography variant="body2">{(tier.maxUsers as number) ?? '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Typography variant="caption" color="text.secondary">Quyền lợi</Typography>
            <Box sx={{ mt: 0.5 }}>
              {Array.isArray(benefits) ? (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {benefits.map((b, i) => (
                    <Chip key={i} label={String(b)} size="small" variant="outlined" />
                  ))}
                </Stack>
              ) : benefits ? (
                <Typography variant="body2">{JSON.stringify(benefits)}</Typography>
              ) : (
                <Typography variant="body2">—</Typography>
              )}
            </Box>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Typography variant="caption" color="text.secondary">Quyền truy cập</Typography>
            <Box sx={{ mt: 0.5 }}>
              {Array.isArray(accessRights) ? (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {accessRights.map((r, i) => (
                    <Chip key={i} label={String(r)} size="small" variant="outlined" />
                  ))}
                </Stack>
              ) : accessRights ? (
                <Typography variant="body2">{JSON.stringify(accessRights)}</Typography>
              ) : (
                <Typography variant="body2">—</Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

// ─── Fees Tab ────────────────────────────────────────────────────────────────

interface FeeRecord {
  id: string
  year: number
  amountDue: number | string
  amountPaid: number | string
  paymentStatus: string
  dueDate: string | Date
  paymentDate?: string | Date | null
  invoiceNumber?: string | null
}

function FeesTab({ fees }: { fees: FeeRecord[] }) {
  if (!fees || fees.length === 0) {
    return <Alert severity="info">Chưa có bản ghi phí thường niên.</Alert>
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Năm</TableCell>
            <TableCell>Số tiền phải nộp</TableCell>
            <TableCell>Đã thanh toán</TableCell>
            <TableCell>Hạn nộp</TableCell>
            <TableCell>Ngày thanh toán</TableCell>
            <TableCell>Số hóa đơn</TableCell>
            <TableCell>Trạng thái</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {fees.map((fee) => (
            <TableRow key={fee.id}>
              <TableCell>{fee.year}</TableCell>
              <TableCell>{formatCurrency(fee.amountDue)}</TableCell>
              <TableCell>{formatCurrency(fee.amountPaid)}</TableCell>
              <TableCell>{formatDate(fee.dueDate)}</TableCell>
              <TableCell>{formatDate(fee.paymentDate)}</TableCell>
              <TableCell>{fee.invoiceNumber || '—'}</TableCell>
              <TableCell>
                <Chip
                  label={PAYMENT_STATUS_LABELS[fee.paymentStatus] ?? fee.paymentStatus}
                  color={PAYMENT_STATUS_COLORS[fee.paymentStatus] ?? 'default'}
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

// ─── Groups Tab ──────────────────────────────────────────────────────────────

interface GroupMembershipRecord {
  id: string
  groupRole: string
  joinedDate: string | Date
  status: string
  group: {
    id: string
    name: string
    type: string
    status: string
  }
}

const GROUP_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Chủ nhóm',
  MODERATOR: 'Điều phối',
  MEMBER: 'Thành viên',
  OBSERVER: 'Quan sát viên',
  EXTERNAL_EXPERT: 'Chuyên gia ngoài',
  ENTERPRISE_REP: 'Đại diện DN',
}

function GroupsTab({ groupMemberships }: { groupMemberships: GroupMembershipRecord[] }) {
  if (!groupMemberships || groupMemberships.length === 0) {
    return <Alert severity="info">Doanh nghiệp chưa tham gia nhóm làm việc nào.</Alert>
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Tên nhóm</TableCell>
            <TableCell>Loại nhóm</TableCell>
            <TableCell>Vai trò</TableCell>
            <TableCell>Ngày tham gia</TableCell>
            <TableCell>Trạng thái nhóm</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {groupMemberships.map((gm) => (
            <TableRow key={gm.id}>
              <TableCell>{gm.group.name}</TableCell>
              <TableCell>
                <Chip label={gm.group.type} size="small" variant="outlined" />
              </TableCell>
              <TableCell>{GROUP_ROLE_LABELS[gm.groupRole] ?? gm.groupRole}</TableCell>
              <TableCell>{formatDate(gm.joinedDate)}</TableCell>
              <TableCell>
                <Chip
                  label={gm.group.status === 'ACTIVE' ? 'Hoạt động' : gm.group.status}
                  color={gm.group.status === 'ACTIVE' ? 'success' : 'default'}
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

// ─── Agreements Tab ──────────────────────────────────────────────────────────

interface AgreementRecord {
  id: string
  type: string
  title: string
  status: string
  effectiveDate?: string | Date | null
  expiryDate?: string | Date | null
  createdAt: string | Date
}

const AGREEMENT_TYPE_LABELS: Record<string, string> = {
  MEMBERSHIP: 'Hội viên',
  MOU: 'Biên bản ghi nhớ',
  NDA: 'Bảo mật',
  DPA: 'Xử lý dữ liệu',
  SLA: 'Cam kết dịch vụ',
  TECH_DEPLOYMENT: 'Triển khai CN',
  TECH_TRANSFER: 'Chuyển giao CN',
  SPONSORSHIP: 'Tài trợ',
  RESEARCH: 'Nghiên cứu',
  DATA_SHARING: 'Chia sẻ dữ liệu',
  EVENT: 'Sự kiện',
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
              <TableCell>
                <Chip
                  label={AGREEMENT_TYPE_LABELS[ag.type] ?? ag.type}
                  size="small"
                  variant="outlined"
                />
              </TableCell>
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

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function MemberDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [tabValue, setTabValue] = useState(0)

  const { data: member, isLoading, error } = trpc.members.get.useQuery({ id })

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

  if (error || !member) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.message || 'Không tìm thấy hội viên.'}
        </Alert>
        <Button variant="outlined" onClick={() => router.push('/members')}>
          Quay lại danh sách
        </Button>
      </Box>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const memberData = member as unknown as Record<string, unknown>

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push('/members')}
        >
          Hội viên
        </MuiLink>
        <Typography color="text.primary">{member.legalNameVi}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="h4">{member.legalNameVi}</Typography>
            <Chip
              label={STATUS_LABELS[member.membershipStatus] ?? member.membershipStatus}
              color={STATUS_COLORS[member.membershipStatus] ?? 'default'}
              size="small"
            />
          </Stack>
          {member.legalNameEn && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {member.legalNameEn}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => router.push(`/members/${id}/edit`)}
          >
            Chỉnh sửa
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<SwapHorizIcon />}
          >
            Đổi trạng thái
          </Button>
        </Stack>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          aria-label="Chi tiết hội viên"
        >
          <Tab label="Hồ sơ" id="member-tab-0" aria-controls="member-tabpanel-0" />
          <Tab label="Cấp hội viên" id="member-tab-1" aria-controls="member-tabpanel-1" />
          <Tab label="Phí thường niên" id="member-tab-2" aria-controls="member-tabpanel-2" />
          <Tab label="Nhóm" id="member-tab-3" aria-controls="member-tabpanel-3" />
          <Tab label="Hợp đồng" id="member-tab-4" aria-controls="member-tabpanel-4" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
        <ProfileTab member={memberData} />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <TierTab tier={member.tier as unknown as Record<string, unknown>} />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <FeesTab fees={member.fees as unknown as FeeRecord[]} />
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <GroupsTab groupMemberships={member.groupMemberships as unknown as GroupMembershipRecord[]} />
      </TabPanel>

      <TabPanel value={tabValue} index={4}>
        <AgreementsTab agreements={member.agreements as unknown as AgreementRecord[]} />
      </TabPanel>
    </Box>
  )
}
