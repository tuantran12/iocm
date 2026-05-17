'use client'

import { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Stack,
  MenuItem,
  Alert,
  Chip,
  Skeleton,
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import { trpc } from '@/lib/trpc'

const INSTITUTE_TYPES = [
  { value: 'research', label: 'Tổ chức nghiên cứu khoa học' },
  { value: 'rd', label: 'Tổ chức nghiên cứu và phát triển' },
  { value: 'service', label: 'Tổ chức dịch vụ KH&CN' },
]

const FOUNDER_TYPES = [
  { value: 'individual', label: 'Cá nhân' },
  { value: 'organization', label: 'Tổ chức' },
  { value: 'mixed', label: 'Cá nhân và tổ chức' },
]

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Đang lập kế hoạch' },
  { value: 'preparing_docs', label: 'Đang chuẩn bị hồ sơ' },
  { value: 'submitted', label: 'Đã nộp hồ sơ' },
  { value: 'approved', label: 'Đã được cấp phép' },
]

export default function InstituteProfilePage() {
  const { data: profile, isLoading } = trpc.instituteProfile.get.useQuery()
  const upsertMutation = trpc.instituteProfile.upsert.useMutation()
  const utils = trpc.useUtils()

  const [form, setForm] = useState({
    nameVi: '',
    nameEn: '',
    abbreviation: '',
    instituteType: '',
    founderType: '',
    registrationAuthority: '',
    plannedAddress: '',
    plannedFields: [] as string[],
    headPersonName: '',
    status: 'planning',
  })
  const [fieldInput, setFieldInput] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm({
        nameVi: profile.nameVi ?? '',
        nameEn: profile.nameEn ?? '',
        abbreviation: profile.abbreviation ?? '',
        instituteType: profile.instituteType ?? '',
        founderType: profile.founderType ?? '',
        registrationAuthority: profile.registrationAuthority ?? '',
        plannedAddress: profile.plannedAddress ?? '',
        plannedFields: profile.plannedFields ?? [],
        headPersonName: profile.headPersonName ?? '',
        status: profile.status ?? 'planning',
      })
    }
  }, [profile])

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  const handleAddField = () => {
    const trimmed = fieldInput.trim()
    if (trimmed && !form.plannedFields.includes(trimmed)) {
      setForm((prev) => ({ ...prev, plannedFields: [...prev.plannedFields, trimmed] }))
      setFieldInput('')
    }
  }

  const handleRemoveField = (field: string) => {
    setForm((prev) => ({
      ...prev,
      plannedFields: prev.plannedFields.filter((f) => f !== field),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSuccess(false)
    await upsertMutation.mutateAsync({
      nameVi: form.nameVi,
      nameEn: form.nameEn || undefined,
      abbreviation: form.abbreviation || undefined,
      instituteType: form.instituteType,
      founderType: form.founderType || undefined,
      registrationAuthority: form.registrationAuthority || undefined,
      plannedAddress: form.plannedAddress || undefined,
      plannedFields: form.plannedFields,
      headPersonName: form.headPersonName || undefined,
      status: form.status,
    })
    await utils.instituteProfile.get.invalidate()
    setSuccess(true)
  }

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={400} />
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Hồ sơ Viện
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Thông tin cơ bản về tổ chức KH&CN đang thành lập
      </Typography>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
          Đã lưu thông tin hồ sơ Viện thành công.
        </Alert>
      )}

      {upsertMutation.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Lỗi: {upsertMutation.error.message}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2.5}>
              <TextField
                label="Tên tiếng Việt *"
                value={form.nameVi}
                onChange={handleChange('nameVi')}
                fullWidth
                required
              />
              <TextField
                label="Tên tiếng Anh"
                value={form.nameEn}
                onChange={handleChange('nameEn')}
                fullWidth
              />
              <TextField
                label="Tên viết tắt"
                value={form.abbreviation}
                onChange={handleChange('abbreviation')}
                fullWidth
              />
              <TextField
                label="Loại hình tổ chức *"
                value={form.instituteType}
                onChange={handleChange('instituteType')}
                select
                fullWidth
                required
              >
                {INSTITUTE_TYPES.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Loại hình sáng lập"
                value={form.founderType}
                onChange={handleChange('founderType')}
                select
                fullWidth
              >
                <MenuItem value="">— Chọn —</MenuItem>
                {FOUNDER_TYPES.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Cơ quan đăng ký"
                value={form.registrationAuthority}
                onChange={handleChange('registrationAuthority')}
                fullWidth
                placeholder="VD: Sở KH&CN TP.HCM"
              />
              <TextField
                label="Địa chỉ dự kiến"
                value={form.plannedAddress}
                onChange={handleChange('plannedAddress')}
                fullWidth
              />

              {/* Planned Fields */}
              <Box>
                <Stack direction="row" spacing={1} alignItems="flex-end">
                  <TextField
                    label="Lĩnh vực đăng ký hoạt động"
                    value={fieldInput}
                    onChange={(e) => setFieldInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddField()
                      }
                    }}
                    fullWidth
                    placeholder="Nhập lĩnh vực rồi nhấn Enter"
                  />
                  <Button variant="outlined" onClick={handleAddField} sx={{ minWidth: 80 }}>
                    Thêm
                  </Button>
                </Stack>
                {form.plannedFields.length > 0 && (
                  <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
                    {form.plannedFields.map((field) => (
                      <Chip
                        key={field}
                        label={field}
                        onDelete={() => handleRemoveField(field)}
                        size="small"
                      />
                    ))}
                  </Stack>
                )}
              </Box>

              <TextField
                label="Người đứng đầu dự kiến"
                value={form.headPersonName}
                onChange={handleChange('headPersonName')}
                fullWidth
              />
              <TextField
                label="Trạng thái"
                value={form.status}
                onChange={handleChange('status')}
                select
                fullWidth
              >
                {STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>

              <Button
                type="submit"
                variant="contained"
                startIcon={<SaveIcon />}
                disabled={upsertMutation.isPending}
                sx={{ alignSelf: 'flex-start' }}
              >
                {upsertMutation.isPending ? 'Đang lưu...' : 'Lưu hồ sơ'}
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
