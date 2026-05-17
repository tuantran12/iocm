'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Grid,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  Autocomplete,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { vi } from 'date-fns/locale'
import SaveIcon from '@mui/icons-material/Save'
import { trpc } from '@/lib/trpc'

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  { value: 'regulation', label: 'Quy chế' },
  { value: 'policy', label: 'Chính sách' },
  { value: 'template', label: 'Biểu mẫu' },
  { value: 'report', label: 'Báo cáo' },
  { value: 'minutes', label: 'Biên bản' },
  { value: 'charter', label: 'Điều lệ' },
  { value: 'procedure', label: 'Quy trình' },
  { value: 'contract', label: 'Hợp đồng' },
  { value: 'legal_note', label: 'Ghi chú pháp lý' },
  { value: 'action_plan', label: 'Kế hoạch hành động' },
  { value: 'general', label: 'Tài liệu chung' },
] as const

const DOCUMENT_CLUSTERS = [
  { value: 'CORE_FOUNDING', label: 'Hồ sơ thành lập' },
  { value: 'REGULATIONS', label: 'Quy chế, quy định' },
  { value: 'PERSONNEL', label: 'Nhân sự' },
  { value: 'PARTNERSHIP', label: 'Đối tác' },
  { value: 'CONTRACTS', label: 'Hợp đồng' },
  { value: 'TECHNOLOGY', label: 'Công nghệ' },
  { value: 'DATA', label: 'Dữ liệu' },
  { value: 'PILOT', label: 'Triển khai thí điểm' },
  { value: 'FINANCE', label: 'Tài chính' },
  { value: 'SECURITY', label: 'Bảo mật' },
  { value: 'REPORTING', label: 'Báo cáo' },
] as const

const PRIORITIES = [
  { value: 'LOW', label: 'Thấp' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HIGH', label: 'Cao' },
  { value: 'CRITICAL', label: 'Nghiêm trọng' },
] as const

const CONFIDENTIALITY_LEVELS = [
  { value: 'PUBLIC', label: 'Công khai' },
  { value: 'INTERNAL', label: 'Nội bộ' },
  { value: 'RESTRICTED', label: 'Hạn chế' },
  { value: 'CONFIDENTIAL', label: 'Bảo mật' },
  { value: 'SECRET', label: 'Tuyệt mật' },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserOption {
  id: string
  name: string
  email: string
}

interface DocumentFormData {
  name: string
  type: string
  cluster: string
  priority: string
  confidentiality: string
  deadline: Date | null
  effectiveDate: Date | null
  expiryDate: Date | null
  riskIfMissing: string
  ownerId: string | null
  reviewerId: string | null
  approverId: string | null
}

interface DocumentFormProps {
  /** If provided, form is in edit mode */
  documentId?: string
  /** Initial data for edit mode */
  initialData?: Partial<DocumentFormData> & {
    owner?: UserOption | null
    reviewer?: UserOption | null
    approver?: UserOption | null
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface FormErrors {
  name?: string
  type?: string
  cluster?: string
}

function validateForm(data: DocumentFormData): FormErrors {
  const errors: FormErrors = {}

  if (!data.name.trim()) {
    errors.name = 'Tên tài liệu không được để trống'
  }
  if (!data.type) {
    errors.type = 'Vui lòng chọn loại tài liệu'
  }
  if (!data.cluster) {
    errors.cluster = 'Vui lòng chọn nhóm tài liệu'
  }

  return errors
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentForm({ documentId, initialData }: DocumentFormProps) {
  const router = useRouter()
  const isEditMode = !!documentId

  // Form state
  const [formData, setFormData] = useState<DocumentFormData>({
    name: initialData?.name ?? '',
    type: initialData?.type ?? '',
    cluster: initialData?.cluster ?? '',
    priority: initialData?.priority ?? 'MEDIUM',
    confidentiality: initialData?.confidentiality ?? 'INTERNAL',
    deadline: initialData?.deadline ?? null,
    effectiveDate: initialData?.effectiveDate ?? null,
    expiryDate: initialData?.expiryDate ?? null,
    riskIfMissing: initialData?.riskIfMissing ?? '',
    ownerId: initialData?.ownerId ?? null,
    reviewerId: initialData?.reviewerId ?? null,
    approverId: initialData?.approverId ?? null,
  })

  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  // User autocomplete state
  const [ownerValue, setOwnerValue] = useState<UserOption | null>(
    initialData?.owner ?? null
  )
  const [reviewerValue, setReviewerValue] = useState<UserOption | null>(
    initialData?.reviewer ?? null
  )
  const [approverValue, setApproverValue] = useState<UserOption | null>(
    initialData?.approver ?? null
  )

  // Fetch users for autocomplete
  const { data: users = [], isLoading: usersLoading } = trpc.users.search.useQuery(
    undefined,
    { staleTime: 60_000 }
  )

  // Mutations
  const createMutation = trpc.documents.create.useMutation({
    onSuccess: () => {
      router.push('/documents')
    },
    onError: (err) => {
      setSubmitError(err.message)
    },
  })

  const updateMutation = trpc.documents.update.useMutation({
    onSuccess: () => {
      router.push(`/documents/${documentId}`)
    },
    onError: (err) => {
      setSubmitError(err.message)
    },
  })

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  // Handlers
  const handleFieldChange = (field: keyof DocumentFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    // Clear field error on change
    if (field in errors) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    const validationErrors = validateForm(formData)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    const payload = {
      name: formData.name.trim(),
      type: formData.type,
      cluster: formData.cluster as Parameters<typeof createMutation.mutate>[0]['cluster'],
      priority: formData.priority as Parameters<typeof createMutation.mutate>[0]['priority'],
      confidentiality: formData.confidentiality as 'PUBLIC' | 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL' | 'SECRET',
      deadline: formData.deadline,
      effectiveDate: formData.effectiveDate,
      expiryDate: formData.expiryDate,
      riskIfMissing: formData.riskIfMissing || null,
      ownerId: formData.ownerId,
      reviewerId: formData.reviewerId,
      approverId: formData.approverId,
    }

    if (isEditMode && documentId) {
      updateMutation.mutate({ id: documentId, ...payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={vi}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          {isEditMode ? 'Chỉnh sửa tài liệu' : 'Tạo tài liệu mới'}
        </Typography>

        {submitError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Grid container spacing={3}>
            {/* Tên tài liệu */}
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Tên tài liệu"
                value={formData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                error={!!errors.name}
                helperText={errors.name}
                required
                autoFocus
              />
            </Grid>

            {/* Loại tài liệu */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Loại tài liệu"
                value={formData.type}
                onChange={(e) => handleFieldChange('type', e.target.value)}
                error={!!errors.type}
                helperText={errors.type}
                required
              >
                {DOCUMENT_TYPES.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Nhóm tài liệu */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Nhóm tài liệu"
                value={formData.cluster}
                onChange={(e) => handleFieldChange('cluster', e.target.value)}
                error={!!errors.cluster}
                helperText={errors.cluster}
                required
              >
                {DOCUMENT_CLUSTERS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Mức ưu tiên */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Mức ưu tiên"
                value={formData.priority}
                onChange={(e) => handleFieldChange('priority', e.target.value)}
              >
                {PRIORITIES.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Mức bảo mật */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Mức bảo mật"
                value={formData.confidentiality}
                onChange={(e) => handleFieldChange('confidentiality', e.target.value)}
              >
                {CONFIDENTIALITY_LEVELS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Hạn chót */}
            <Grid size={{ xs: 12, sm: 4 }}>
              <DatePicker
                label="Hạn chót"
                value={formData.deadline}
                onChange={(date) => handleFieldChange('deadline', date)}
                slotProps={{
                  textField: { fullWidth: true, size: 'small' },
                }}
              />
            </Grid>

            {/* Ngày hiệu lực */}
            <Grid size={{ xs: 12, sm: 4 }}>
              <DatePicker
                label="Ngày hiệu lực"
                value={formData.effectiveDate}
                onChange={(date) => handleFieldChange('effectiveDate', date)}
                slotProps={{
                  textField: { fullWidth: true, size: 'small' },
                }}
              />
            </Grid>

            {/* Ngày hết hạn */}
            <Grid size={{ xs: 12, sm: 4 }}>
              <DatePicker
                label="Ngày hết hạn"
                value={formData.expiryDate}
                onChange={(date) => handleFieldChange('expiryDate', date)}
                slotProps={{
                  textField: { fullWidth: true, size: 'small' },
                }}
              />
            </Grid>

            {/* Rủi ro nếu thiếu */}
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Rủi ro nếu thiếu"
                value={formData.riskIfMissing}
                onChange={(e) => handleFieldChange('riskIfMissing', e.target.value)}
                multiline
                rows={3}
                placeholder="Mô tả rủi ro nếu tài liệu này không được hoàn thiện..."
              />
            </Grid>

            {/* Người phụ trách */}
            <Grid size={{ xs: 12, sm: 4 }}>
              <Autocomplete
                options={users}
                value={ownerValue}
                onChange={(_, newValue) => {
                  setOwnerValue(newValue)
                  handleFieldChange('ownerId', newValue?.id ?? null)
                }}
                getOptionLabel={(option) => `${option.name} (${option.email})`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                loading={usersLoading}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Người phụ trách"
                    placeholder="Tìm theo tên hoặc email..."
                  />
                )}
              />
            </Grid>

            {/* Người xem xét */}
            <Grid size={{ xs: 12, sm: 4 }}>
              <Autocomplete
                options={users}
                value={reviewerValue}
                onChange={(_, newValue) => {
                  setReviewerValue(newValue)
                  handleFieldChange('reviewerId', newValue?.id ?? null)
                }}
                getOptionLabel={(option) => `${option.name} (${option.email})`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                loading={usersLoading}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Người xem xét"
                    placeholder="Tìm theo tên hoặc email..."
                  />
                )}
              />
            </Grid>

            {/* Người phê duyệt */}
            <Grid size={{ xs: 12, sm: 4 }}>
              <Autocomplete
                options={users}
                value={approverValue}
                onChange={(_, newValue) => {
                  setApproverValue(newValue)
                  handleFieldChange('approverId', newValue?.id ?? null)
                }}
                getOptionLabel={(option) => `${option.name} (${option.email})`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                loading={usersLoading}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Người phê duyệt"
                    placeholder="Tìm theo tên hoặc email..."
                  />
                )}
              />
            </Grid>

            {/* Submit button */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={() => router.back()}
                  disabled={isSubmitting}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={isSubmitting ? <CircularProgress size={18} /> : <SaveIcon />}
                  disabled={isSubmitting}
                >
                  {isEditMode ? 'Lưu thay đổi' : 'Tạo tài liệu'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </LocalizationProvider>
  )
}
