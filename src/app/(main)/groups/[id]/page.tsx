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
  Avatar,
  IconButton,
  Tooltip,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import SettingsIcon from '@mui/icons-material/Settings'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import GroupIcon from '@mui/icons-material/Group'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import AssignmentIcon from '@mui/icons-material/Assignment'
import GavelIcon from '@mui/icons-material/Gavel'
import DescriptionIcon from '@mui/icons-material/Description'
import { trpc } from '@/lib/trpc'
import ChatPanel from '@/components/chat/ChatPanel'

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
  PUBLIC_TO_MEMBERS: 'Công khai cho hội viên',
  PRIVATE_INVITE_ONLY: 'Riêng tư (chỉ mời)',
  CORE_ONLY: 'Chỉ nhóm nòng cốt',
  PROJECT_ONLY: 'Chỉ dự án',
  COUNCIL_ONLY: 'Chỉ hội đồng',
  ENTERPRISE_PRIVATE: 'Riêng tư doanh nghiệp',
}

const MEMBERSHIP_POLICY_LABELS: Record<string, string> = {
  open: 'Mở (ai cũng tham gia được)',
  approval_required: 'Cần phê duyệt',
  invite_only: 'Chỉ mời',
  tier_restricted: 'Giới hạn theo cấp',
  role_restricted: 'Giới hạn theo vai trò',
}

const GROUP_ROLE_LABELS: Record<string, string> = {
  OWNER: 'Chủ nhóm',
  MODERATOR: 'Điều phối',
  MEMBER: 'Thành viên',
  OBSERVER: 'Quan sát viên',
  EXTERNAL_EXPERT: 'Chuyên gia ngoài',
  ENTERPRISE_REP: 'Đại diện DN',
}

const GROUP_ROLE_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  OWNER: 'error',
  MODERATOR: 'warning',
  MEMBER: 'primary',
  OBSERVER: 'default',
  EXTERNAL_EXPERT: 'info',
  ENTERPRISE_REP: 'secondary',
}

const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Mở',
  IN_PROGRESS: 'Đang thực hiện',
  BLOCKED: 'Bị chặn',
  IN_REVIEW: 'Đang xem xét',
  DONE: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}

const TASK_STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  OPEN: 'info',
  IN_PROGRESS: 'primary',
  BLOCKED: 'error',
  IN_REVIEW: 'warning',
  DONE: 'success',
  CANCELLED: 'default',
}

const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Khẩn cấp',
}

const PRIORITY_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  LOW: 'default',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'error',
}

const DECISION_STATUS_LABELS: Record<string, string> = {
  proposed: 'Đề xuất',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
}

const DECISION_STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  proposed: 'warning',
  approved: 'success',
  rejected: 'error',
}

const MEETING_STATUS_LABELS: Record<string, string> = {
  draft: 'Bản nháp',
  approved: 'Đã duyệt',
}

const MEETING_STATUS_COLORS: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  draft: 'default',
  approved: 'success',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
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
      id={`group-tabpanel-${index}`}
      aria-labelledby={`group-tab-${index}`}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </Box>
  )
}

// ─── Overview Tab ────────────────────────────────────────────────────────────

function OverviewTab({ group }: { group: any }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Tổng quan
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <Typography variant="caption" color="text.secondary">
              Mục tiêu
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {group.goal || '—'}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Typography variant="caption" color="text.secondary">
              Mô tả
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {group.description || '—'}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Loại nhóm
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <Chip
                label={GROUP_TYPE_LABELS[group.type] ?? group.type}
                color={GROUP_TYPE_COLORS[group.type] ?? 'default'}
                size="small"
              />
            </Box>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Hiển thị
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {VISIBILITY_LABELS[group.visibility] ?? group.visibility}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Chính sách thành viên
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {MEMBERSHIP_POLICY_LABELS[group.membershipPolicy] ?? group.membershipPolicy}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Ngày tạo
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {formatDate(group.createdAt)}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Chủ nhóm
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {group.ownerId}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Số thành viên
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
              <GroupIcon fontSize="small" color="action" />
              <Typography variant="body2">
                {group.members?.length ?? group._count?.members ?? 0}
              </Typography>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Số tin nhắn
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
              <ChatBubbleOutlineIcon fontSize="small" color="action" />
              <Typography variant="body2">
                {group._count?.messages ?? 0}
              </Typography>
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

// ─── Members Tab ─────────────────────────────────────────────────────────────

interface GroupMember {
  id: string
  userId: string
  groupRole: string
  joinedDate: string | Date
  status: string
  user?: {
    id: string
    name: string
    email: string
    avatarUrl?: string | null
  }
}

function MembersTab({ members, groupId }: { members: GroupMember[]; groupId: string }) {
  const router = useRouter()

  if (!members || members.length === 0) {
    return <Alert severity="info">Nhóm chưa có thành viên nào.</Alert>
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Thành viên</TableCell>
            <TableCell>Vai trò</TableCell>
            <TableCell>Ngày tham gia</TableCell>
            <TableCell align="right">Thao tác</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Avatar
                    src={member.user?.avatarUrl ?? undefined}
                    sx={{ width: 32, height: 32, fontSize: '0.875rem' }}
                  >
                    {getInitials(member.user?.name ?? 'U')}
                  </Avatar>
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {member.user?.name ?? member.userId}
                    </Typography>
                    {member.user?.email && (
                      <Typography variant="caption" color="text.secondary">
                        {member.user.email}
                      </Typography>
                    )}
                  </Box>
                </Stack>
              </TableCell>
              <TableCell>
                <Chip
                  label={GROUP_ROLE_LABELS[member.groupRole] ?? member.groupRole}
                  color={GROUP_ROLE_COLORS[member.groupRole] ?? 'default'}
                  size="small"
                />
              </TableCell>
              <TableCell>{formatDate(member.joinedDate)}</TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                  <Tooltip title="Đổi vai trò">
                    <IconButton size="small">
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Xóa khỏi nhóm">
                    <IconButton size="small" color="error">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

function SettingsTab({ group }: { group: any }) {
  const router = useRouter()

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Cài đặt nhóm
        </Typography>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Tên nhóm"
              value={group.name}
              fullWidth
              size="small"
              disabled
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              label="Mô tả"
              value={group.description ?? ''}
              fullWidth
              size="small"
              multiline
              rows={2}
              disabled
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField
              label="Mục tiêu"
              value={group.goal ?? ''}
              fullWidth
              size="small"
              multiline
              rows={2}
              disabled
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small" disabled>
              <InputLabel>Hiển thị</InputLabel>
              <Select value={group.visibility} label="Hiển thị">
                {Object.entries(VISIBILITY_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small" disabled>
              <InputLabel>Chính sách thành viên</InputLabel>
              <Select value={group.membershipPolicy} label="Chính sách thành viên">
                {Object.entries(MEMBERSHIP_POLICY_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Button
              variant="contained"
              startIcon={<SettingsIcon />}
              onClick={() => router.push(`/groups/${group.id}/settings`)}
            >
              Chỉnh sửa cài đặt
            </Button>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

// ─── Tasks Tab ────────────────────────────────────────────────────────────────

function TasksTab({ groupId }: { groupId: string }) {
  const { data, isLoading } = trpc.tasks.list.useQuery({ groupId })

  if (isLoading) {
    return <Skeleton variant="rectangular" height={300} />
  }

  const tasks = data?.items ?? []

  if (tasks.length === 0) {
    return (
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6">Công việc</Typography>
          <Button variant="contained" startIcon={<AddIcon />} size="small">
            Tạo công việc
          </Button>
        </Stack>
        <Alert severity="info">Nhóm chưa có công việc nào.</Alert>
      </Box>
    )
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Công việc ({data?.total ?? 0})</Typography>
        <Button variant="contained" startIcon={<AddIcon />} size="small">
          Tạo công việc
        </Button>
      </Stack>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Tiêu đề</TableCell>
              <TableCell>Người thực hiện</TableCell>
              <TableCell>Ưu tiên</TableCell>
              <TableCell>Hạn chót</TableCell>
              <TableCell>Trạng thái</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks.map((task: any) => (
              <TableRow key={task.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {task.title}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {task.assignedTo ?? '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={PRIORITY_LABELS[task.priority] ?? task.priority}
                    color={PRIORITY_COLORS[task.priority] ?? 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {formatDate(task.dueDate)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={TASK_STATUS_LABELS[task.status] ?? task.status}
                    color={TASK_STATUS_COLORS[task.status] ?? 'default'}
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

// ─── Decisions Tab ────────────────────────────────────────────────────────────

function DecisionsTab({ groupId }: { groupId: string }) {
  const { data, isLoading } = trpc.decisions.list.useQuery({ groupId })
  const utils = trpc.useUtils()
  const approveMutation = trpc.decisions.approve.useMutation({
    onSuccess: () => utils.decisions.list.invalidate({ groupId }),
  })
  const rejectMutation = trpc.decisions.reject.useMutation({
    onSuccess: () => utils.decisions.list.invalidate({ groupId }),
  })

  if (isLoading) {
    return <Skeleton variant="rectangular" height={300} />
  }

  const decisions = data?.items ?? []

  if (decisions.length === 0) {
    return (
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6">Quyết định</Typography>
        </Stack>
        <Alert severity="info">Nhóm chưa có quyết định nào.</Alert>
      </Box>
    )
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Quyết định ({data?.total ?? 0})</Typography>
      </Stack>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Tiêu đề</TableCell>
              <TableCell>Người đề xuất</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell>Ngày tạo</TableCell>
              <TableCell align="right">Thao tác</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {decisions.map((decision: any) => (
              <TableRow key={decision.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {decision.title}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {decision.proposedBy}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={DECISION_STATUS_LABELS[decision.status] ?? decision.status}
                    color={DECISION_STATUS_COLORS[decision.status] ?? 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {formatDate(decision.createdAt)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {decision.status === 'proposed' && (
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Phê duyệt">
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => approveMutation.mutate({ id: decision.id })}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircleIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Từ chối">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => rejectMutation.mutate({ id: decision.id })}
                          disabled={rejectMutation.isPending}
                        >
                          <CancelIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

// ─── Meetings Tab ─────────────────────────────────────────────────────────────

function MeetingsTab({ groupId }: { groupId: string }) {
  const { data, isLoading } = trpc.meetings.list.useQuery({ groupId })

  if (isLoading) {
    return <Skeleton variant="rectangular" height={300} />
  }

  const meetings = data?.items ?? []

  if (meetings.length === 0) {
    return (
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6">Biên bản họp</Typography>
          <Button variant="contained" startIcon={<AddIcon />} size="small">
            Tạo biên bản
          </Button>
        </Stack>
        <Alert severity="info">Nhóm chưa có biên bản họp nào.</Alert>
      </Box>
    )
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6">Biên bản họp ({data?.total ?? 0})</Typography>
        <Button variant="contained" startIcon={<AddIcon />} size="small">
          Tạo biên bản
        </Button>
      </Stack>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Ngày họp</TableCell>
              <TableCell>Số người tham dự</TableCell>
              <TableCell>Trạng thái</TableCell>
              <TableCell>Nội dung</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {meetings.map((meeting: any) => (
              <TableRow key={meeting.id} hover>
                <TableCell>
                  <Typography variant="body2">
                    {formatDate(meeting.meetingDate)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {Array.isArray(meeting.participants) ? meeting.participants.length : 0} người
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={MEETING_STATUS_LABELS[meeting.status] ?? meeting.status}
                    color={MEETING_STATUS_COLORS[meeting.status] ?? 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                    {meeting.agenda ?? '—'}
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

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function GroupDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [tabValue, setTabValue] = useState(0)

  const { data: group, isLoading, error } = trpc.groups.get.useQuery({ id })

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

  if (error || !group) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.message || 'Không tìm thấy nhóm làm việc.'}
        </Alert>
        <Button variant="outlined" onClick={() => router.push('/groups')}>
          Quay lại danh sách
        </Button>
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
          onClick={() => router.push('/groups')}
        >
          Nhóm
        </MuiLink>
        <Typography color="text.primary">{group.name}</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="h4">{group.name}</Typography>
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
            <Chip
              label={VISIBILITY_LABELS[group.visibility] ?? group.visibility}
              size="small"
              variant="outlined"
              color="info"
            />
          </Stack>
          {group.goal && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {group.goal}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            size="small"
          >
            Mời thành viên
          </Button>
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            size="small"
            onClick={() => router.push(`/groups/${id}/settings`)}
          >
            Cài đặt
          </Button>
        </Stack>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          aria-label="Chi tiết nhóm làm việc"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Tổng quan" id="group-tab-0" aria-controls="group-tabpanel-0" />
          <Tab label="Chat" id="group-tab-1" aria-controls="group-tabpanel-1" icon={<ChatBubbleOutlineIcon />} iconPosition="start" />
          <Tab label="Thành viên" id="group-tab-2" aria-controls="group-tabpanel-2" />
          <Tab label="Công việc" id="group-tab-3" aria-controls="group-tabpanel-3" icon={<AssignmentIcon />} iconPosition="start" />
          <Tab label="Quyết định" id="group-tab-4" aria-controls="group-tabpanel-4" icon={<GavelIcon />} iconPosition="start" />
          <Tab label="Biên bản" id="group-tab-5" aria-controls="group-tabpanel-5" icon={<DescriptionIcon />} iconPosition="start" />
          <Tab label="Cài đặt" id="group-tab-6" aria-controls="group-tabpanel-6" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
        <OverviewTab group={group} />
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <ChatPanel
          groupId={id}
          currentUserId="current-user-id"
          currentUserName="Current User"
        />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <MembersTab members={group.members as unknown as GroupMember[]} groupId={id} />
      </TabPanel>

      <TabPanel value={tabValue} index={3}>
        <TasksTab groupId={id} />
      </TabPanel>

      <TabPanel value={tabValue} index={4}>
        <DecisionsTab groupId={id} />
      </TabPanel>

      <TabPanel value={tabValue} index={5}>
        <MeetingsTab groupId={id} />
      </TabPanel>

      <TabPanel value={tabValue} index={6}>
        <SettingsTab group={group} />
      </TabPanel>
    </Box>
  )
}
