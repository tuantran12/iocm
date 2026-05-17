'use client'

import { useState, useMemo, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Breadcrumbs,
  Link as MuiLink,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Autocomplete,
  Alert,
  Skeleton,
  Snackbar,
} from '@mui/material'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import SaveIcon from '@mui/icons-material/Save'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const VISIBILITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'PUBLIC_TO_MEMBERS', label: 'Công khai cho hội viên' },
  { value: 'PRIVATE_INVITE_ONLY', label: 'Riêng tư (chỉ mời)' },
  { value: 'CORE_ONLY', label: 'Chỉ nhóm nòng cốt' },
  { value: 'PROJECT_ONLY', label: 'Chỉ dự án' },
  { value: 'COUNCIL_ONLY', label: 'Chỉ hội đồng' },
  { value: 'ENTERPRISE_PRIVATE', label: 'Riêng tư doanh nghiệp' },
]

const MEMBERSHIP_POLICY_OPTIONS: { value: string; label: string }[] = [
  { value: 'open', label: 'Mở (ai cũng tham gia được)' },
  { value: 'approval_required', label: 'Cần phê duyệt' },
  { value: 'invite_only', label: 'Chỉ mời' },
  { value: 'tier_restricted', label: 'Giới hạn theo cấp' },
  { value: 'role_restricted', label: 'Giới hạn theo vai trò' },
]

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'ARCHIVED', label: 'Lưu trữ' },
  { value: 'CLOSED', label: 'Đã đóng' },
]

const GROUP_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'OWNER', label: 'Chủ nhóm' },
  { value: 'MODERATOR', label: 'Điều phối' },
  { value: 'MEMBER', label: 'Thành viên' },
  { value: 'OBSERVER', label: 'Quan sát viên' },
  { value: 'EXTERNAL_EXPERT', label: 'Chuyên gia ngoài' },
  { value: 'ENTERPRISE_REP', label: 'Đại diện DN' },
]

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserOption {
  id: string
  name: string
  email: string
}

interface GroupFormData {
  name: string
  description: string
  goal: string
  visibility: string
  membershipPolicy: string
  status: string
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function GroupSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  // ─── Form State ────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState<GroupFormData | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ─── Invite State ──────────────────────────────────────────────────────────
  const [inviteUser, setInviteUser] = useState<UserOption | null>(null)
  const [inviteRole, setInviteRole] = useState('MEMBER')
  const [userSearch, setUserSearch] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const { data: group, isLoading, error } = trpc.groups.get.useQuery({ id })

  // Initialize form data when group loads
  useEffect(() => {
    if (group && !formData) {
      setFormData({
        name: group.name,
        description: group.description ?? '',
        goal: group.goal,
        visibility: group.visibility,
        membershipPolicy: group.membershipPolicy,
        status: group.status,
      })
    }
  }, [group, formData])

  const { data: users = [] } = trpc.users.search.useQuery(
    { query: userSearch },
    { enabled: userSearch.length > 0 },
  )

  // ─── Mutations ───────────────────────────────────────────────────────────────
  const utils = trpc.useUtils()

  const updateMutation = trpc.groups.update.useMutation({
    onSuccess: () => {
      setSaveSuccess(true)
      setSaveError(null)
      utils.groups.get.invalidate({ id })
    },
    onError: (err) => {
      setSaveError(err.message)
    },
  })

  const inviteMutation = trpc.groups.inviteMember.useMutation({
    onSuccess: () => {
      setInviteSuccess(true)
      setInviteError(null)
      setInviteUser(null)
      setInviteRole('MEMBER')
      utils.groups.get.invalidate({ id })
    },
    onError: (err) => {
      setInviteError(err.message)
    },
  })

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleFieldChange = (field: keyof GroupFormData, value: string) => {
    setFormData((prev) => (prev ? { ...prev, [field]: value } : prev))
  }

  const handleSave = () => {
    if (!formData) return
    updateMutation.mutate({
      id,
      name: formData.name,
      description: formData.description || null,
      goal: formData.goal,
      visibility: formData.visibility as any,
      membershipPolicy: formData.membershipPolicy,
      status: formData.status as any,
    })
  }

  const handleInvite = () => {
    if (!inviteUser) return
    inviteMutation.mutate({
      groupId: id,
      userId: inviteUser.id,
      groupRole: inviteRole as any,
    })
  }

  // Filter out users already in the group
  const filteredUsers = useMemo(() => {
    if (!group?.members) return users
    const memberIds = new Set(group.members.map((m: any) => m.userId))
    return users.filter((u) => !memberIds.has(u.id))
  }, [users, group?.members])

  // ─── Loading State ───────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="rectangular" height={400} sx={{ mt: 2 }} />
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
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push(`/groups/${id}`)}
        >
          {group.name}
        </MuiLink>
        <Typography color="text.primary">Cài đặt</Typography>
      </Breadcrumbs>

      {/* Page Title */}
      <Typography variant="h4" sx={{ mb: 3 }}>
        Cài đặt nhóm
      </Typography>

      {/* Settings Form */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Thông tin nhóm
          </Typography>

          {formData && (
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Tên nhóm"
                  value={formData.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  fullWidth
                  size="small"
                  required
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Mô tả"
                  value={formData.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  fullWidth
                  size="small"
                  multiline
                  rows={3}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Mục tiêu"
                  value={formData.goal}
                  onChange={(e) => handleFieldChange('goal', e.target.value)}
                  fullWidth
                  size="small"
                  multiline
                  rows={3}
                  required
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Hiển thị</InputLabel>
                  <Select
                    value={formData.visibility}
                    label="Hiển thị"
                    onChange={(e) => handleFieldChange('visibility', e.target.value)}
                  >
                    {VISIBILITY_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Chính sách thành viên</InputLabel>
                  <Select
                    value={formData.membershipPolicy}
                    label="Chính sách thành viên"
                    onChange={(e) => handleFieldChange('membershipPolicy', e.target.value)}
                  >
                    {MEMBERSHIP_POLICY_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Trạng thái</InputLabel>
                  <Select
                    value={formData.status}
                    label="Trạng thái"
                    onChange={(e) => handleFieldChange('status', e.target.value)}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Save Button */}
              <Grid size={{ xs: 12 }}>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Đang lưu...' : 'Lưu cài đặt'}
                </Button>
              </Grid>

              {saveError && (
                <Grid size={{ xs: 12 }}>
                  <Alert severity="error">{saveError}</Alert>
                </Grid>
              )}
            </Grid>
          )}
        </CardContent>
      </Card>

      <Divider sx={{ my: 3 }} />

      {/* Invite Member Section */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Mời thành viên
          </Typography>

          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 5 }}>
              <Autocomplete
                options={filteredUsers}
                getOptionLabel={(option) => `${option.name} (${option.email})`}
                value={inviteUser}
                onChange={(_, newValue) => setInviteUser(newValue)}
                onInputChange={(_, newInput) => setUserSearch(newInput)}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Tìm người dùng"
                    size="small"
                    placeholder="Nhập tên hoặc email..."
                  />
                )}
                noOptionsText="Không tìm thấy người dùng"
                loadingText="Đang tìm..."
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Vai trò</InputLabel>
                <Select
                  value={inviteRole}
                  label="Vai trò"
                  onChange={(e) => setInviteRole(e.target.value)}
                >
                  {GROUP_ROLE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <Button
                variant="contained"
                startIcon={<PersonAddIcon />}
                onClick={handleInvite}
                disabled={!inviteUser || inviteMutation.isPending}
                fullWidth
              >
                {inviteMutation.isPending ? 'Đang mời...' : 'Mời'}
              </Button>
            </Grid>

            {inviteError && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="error">{inviteError}</Alert>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* Success Snackbars */}
      <Snackbar
        open={saveSuccess}
        autoHideDuration={3000}
        onClose={() => setSaveSuccess(false)}
        message="Đã lưu cài đặt nhóm thành công"
      />
      <Snackbar
        open={inviteSuccess}
        autoHideDuration={3000}
        onClose={() => setInviteSuccess(false)}
        message="Đã mời thành viên thành công"
      />
    </Box>
  )
}
