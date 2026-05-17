'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Button,
  Alert,
  Card,
  CardContent,
  Grid,
  Divider,
  CircularProgress,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { trpc } from '@/lib/trpc'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormData {
  // Thông tin doanh nghiệp
  legalNameVi: string
  legalNameEn: string
  taxCode: string
  businessRegNumber: string
  legalRepresentative: string
  address: string
  website: string
  industrySector: string
  technologyDomains: string
  companySize: string
  // Người liên hệ
  contactName: string
  contactEmail: string
  contactPhone: string
  // Cấp hội viên mong muốn
  desiredTierId: string
  // Lý do & đóng góp
  reasonForJoining: string
  expectedContribution: string
  // Cam kết
  conflictOfInterestDeclaration: boolean
  dataProtectionCommitment: boolean
  codeOfConductAcceptance: boolean
}

interface FormErrors {
  [key: string]: string | undefined
}

const INITIAL_FORM: FormData = {
  legalNameVi: '',
  legalNameEn: '',
  taxCode: '',
  businessRegNumber: '',
  legalRepresentative: '',
  address: '',
  website: '',
  industrySector: '',
  technologyDomains: '',
  companySize: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  desiredTierId: '',
  reasonForJoining: '',
  expectedContribution: '',
  conflictOfInterestDeclaration: false,
  dataProtectionCommitment: false,
  codeOfConductAcceptance: false,
}

const COMPANY_SIZE_OPTIONS = [
  { value: 'micro', label: 'Siêu nhỏ (< 10 người)' },
  { value: 'small', label: 'Nhỏ (10–49 người)' },
  { value: 'medium', label: 'Vừa (50–249 người)' },
  { value: 'large', label: 'Lớn (250+ người)' },
]

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MembershipApplicationPage() {
  const router = useRouter()

  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch available tiers
  const tiersQuery = trpc.tiers.list.useQuery()
  const tiers = (tiersQuery.data ?? []) as Array<{ id: string; name: string; description?: string | null; annualFee?: number | string }>

  // Mutations
  const createMember = trpc.members.create.useMutation()
  const submitApplication = trpc.members.submitApplication.useMutation()

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleChange = useCallback((field: keyof FormData, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    // Clear field error on change
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSubmitError(null)
  }, [])

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {}

    // Required fields
    if (!form.legalNameVi.trim()) newErrors.legalNameVi = 'Tên pháp lý tiếng Việt là bắt buộc'
    if (!form.legalRepresentative.trim()) newErrors.legalRepresentative = 'Người đại diện pháp luật là bắt buộc'
    if (!form.address.trim()) newErrors.address = 'Địa chỉ là bắt buộc'
    if (!form.contactName.trim()) newErrors.contactName = 'Tên người liên hệ là bắt buộc'
    if (!form.contactPhone.trim()) newErrors.contactPhone = 'Số điện thoại là bắt buộc'
    if (!form.desiredTierId) newErrors.desiredTierId = 'Vui lòng chọn cấp hội viên'
    if (!form.reasonForJoining.trim()) newErrors.reasonForJoining = 'Lý do tham gia là bắt buộc'

    // Email validation
    if (!form.contactEmail.trim()) {
      newErrors.contactEmail = 'Email là bắt buộc'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) {
      newErrors.contactEmail = 'Email không hợp lệ'
    }

    // Commitments
    if (!form.conflictOfInterestDeclaration) {
      newErrors.conflictOfInterestDeclaration = 'Vui lòng xác nhận cam kết xung đột lợi ích'
    }
    if (!form.dataProtectionCommitment) {
      newErrors.dataProtectionCommitment = 'Vui lòng xác nhận cam kết bảo vệ dữ liệu'
    }
    if (!form.codeOfConductAcceptance) {
      newErrors.codeOfConductAcceptance = 'Vui lòng chấp nhận quy tắc ứng xử'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [form])

  const handleSubmit = useCallback(async () => {
    if (!validate()) return

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Step 1: Create the enterprise member
      const technologyDomains = form.technologyDomains
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)

      const newMember = await createMember.mutateAsync({
        legalNameVi: form.legalNameVi.trim(),
        legalNameEn: form.legalNameEn.trim() || null,
        taxCode: form.taxCode.trim() || null,
        businessRegNumber: form.businessRegNumber.trim() || null,
        legalRepresentative: form.legalRepresentative.trim(),
        address: form.address.trim(),
        website: form.website.trim() || null,
        industrySector: form.industrySector.trim() || null,
        technologyDomains: technologyDomains.length > 0 ? technologyDomains : undefined,
        companySize: form.companySize || null,
        contactName: form.contactName.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim(),
        membershipTierId: form.desiredTierId,
      })

      // Step 2: Submit the application
      await submitApplication.mutateAsync({
        memberId: newMember.id,
        reasonForJoining: form.reasonForJoining.trim(),
        expectedContribution: form.expectedContribution.trim() || undefined,
        desiredTierId: form.desiredTierId,
        conflictOfInterestDeclaration: form.conflictOfInterestDeclaration,
        dataProtectionCommitment: form.dataProtectionCommitment,
        codeOfConductAcceptance: form.codeOfConductAcceptance,
      })

      // Success: redirect to members list
      router.push('/members?success=application_submitted')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đã xảy ra lỗi khi nộp đơn. Vui lòng thử lại.'
      setSubmitError(message)
    } finally {
      setIsSubmitting(false)
    }
  }, [form, validate, createMember, submitApplication, router])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/members')}
          color="inherit"
        >
          Quay lại
        </Button>
      </Box>

      <Typography variant="h4" gutterBottom>
        Đơn đăng ký Hội viên
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Điền đầy đủ thông tin doanh nghiệp và cam kết để nộp đơn gia nhập Viện.
      </Typography>

      {/* Error Alert */}
      {submitError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {/* ─── Section 1: Thông tin doanh nghiệp ─────────────────────────────── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Thông tin doanh nghiệp
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Tên pháp lý (tiếng Việt) *"
                value={form.legalNameVi}
                onChange={(e) => handleChange('legalNameVi', e.target.value)}
                error={!!errors.legalNameVi}
                helperText={errors.legalNameVi}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Tên pháp lý (tiếng Anh)"
                value={form.legalNameEn}
                onChange={(e) => handleChange('legalNameEn', e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Mã số thuế"
                value={form.taxCode}
                onChange={(e) => handleChange('taxCode', e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Số đăng ký kinh doanh"
                value={form.businessRegNumber}
                onChange={(e) => handleChange('businessRegNumber', e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Người đại diện pháp luật *"
                value={form.legalRepresentative}
                onChange={(e) => handleChange('legalRepresentative', e.target.value)}
                error={!!errors.legalRepresentative}
                helperText={errors.legalRepresentative}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Website"
                value={form.website}
                onChange={(e) => handleChange('website', e.target.value)}
                placeholder="https://..."
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Địa chỉ *"
                value={form.address}
                onChange={(e) => handleChange('address', e.target.value)}
                error={!!errors.address}
                helperText={errors.address}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Lĩnh vực hoạt động"
                value={form.industrySector}
                onChange={(e) => handleChange('industrySector', e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Quy mô doanh nghiệp</InputLabel>
                <Select
                  value={form.companySize}
                  label="Quy mô doanh nghiệp"
                  onChange={(e) => handleChange('companySize', e.target.value)}
                >
                  <MenuItem value="">— Chọn —</MenuItem>
                  {COMPANY_SIZE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Lĩnh vực công nghệ"
                value={form.technologyDomains}
                onChange={(e) => handleChange('technologyDomains', e.target.value)}
                helperText="Nhập các lĩnh vực, phân cách bằng dấu phẩy (VD: AI, IoT, Blockchain)"
                fullWidth
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ─── Section 2: Người liên hệ ──────────────────────────────────────── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Người liên hệ
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Họ và tên *"
                value={form.contactName}
                onChange={(e) => handleChange('contactName', e.target.value)}
                error={!!errors.contactName}
                helperText={errors.contactName}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Email *"
                type="email"
                value={form.contactEmail}
                onChange={(e) => handleChange('contactEmail', e.target.value)}
                error={!!errors.contactEmail}
                helperText={errors.contactEmail}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Số điện thoại *"
                value={form.contactPhone}
                onChange={(e) => handleChange('contactPhone', e.target.value)}
                error={!!errors.contactPhone}
                helperText={errors.contactPhone}
                fullWidth
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ─── Section 3: Cấp hội viên mong muốn ────────────────────────────── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Cấp hội viên mong muốn
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <FormControl fullWidth error={!!errors.desiredTierId}>
            <InputLabel>Chọn cấp hội viên *</InputLabel>
            <Select
              value={form.desiredTierId}
              label="Chọn cấp hội viên *"
              onChange={(e) => handleChange('desiredTierId', e.target.value)}
            >
              <MenuItem value="">— Chọn cấp hội viên —</MenuItem>
              {tiers.map((tier) => (
                <MenuItem key={tier.id} value={tier.id}>
                  {tier.name}
                  {tier.description ? ` — ${tier.description}` : ''}
                </MenuItem>
              ))}
            </Select>
            {errors.desiredTierId && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                {errors.desiredTierId}
              </Typography>
            )}
          </FormControl>
        </CardContent>
      </Card>

      {/* ─── Section 4: Lý do & Đóng góp ──────────────────────────────────── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Lý do tham gia & Đóng góp dự kiến
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Lý do tham gia *"
                value={form.reasonForJoining}
                onChange={(e) => handleChange('reasonForJoining', e.target.value)}
                error={!!errors.reasonForJoining}
                helperText={errors.reasonForJoining || 'Mô tả lý do doanh nghiệp muốn gia nhập Viện'}
                multiline
                rows={4}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Đóng góp dự kiến"
                value={form.expectedContribution}
                onChange={(e) => handleChange('expectedContribution', e.target.value)}
                helperText="Mô tả những đóng góp doanh nghiệp dự kiến mang lại cho Viện"
                multiline
                rows={3}
                fullWidth
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* ─── Section 5: Cam kết ────────────────────────────────────────────── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Cam kết
          </Typography>
          <Divider sx={{ mb: 2 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.conflictOfInterestDeclaration}
                  onChange={(e) => handleChange('conflictOfInterestDeclaration', e.target.checked)}
                />
              }
              label="Tôi cam kết khai báo đầy đủ các xung đột lợi ích (nếu có) và tuân thủ quy định về xung đột lợi ích của Viện."
            />
            {errors.conflictOfInterestDeclaration && (
              <Typography variant="caption" color="error" sx={{ ml: 4 }}>
                {errors.conflictOfInterestDeclaration}
              </Typography>
            )}

            <FormControlLabel
              control={
                <Checkbox
                  checked={form.dataProtectionCommitment}
                  onChange={(e) => handleChange('dataProtectionCommitment', e.target.checked)}
                />
              }
              label="Tôi cam kết tuân thủ các quy định về bảo vệ dữ liệu cá nhân và bảo mật thông tin của Viện."
            />
            {errors.dataProtectionCommitment && (
              <Typography variant="caption" color="error" sx={{ ml: 4 }}>
                {errors.dataProtectionCommitment}
              </Typography>
            )}

            <FormControlLabel
              control={
                <Checkbox
                  checked={form.codeOfConductAcceptance}
                  onChange={(e) => handleChange('codeOfConductAcceptance', e.target.checked)}
                />
              }
              label="Tôi đã đọc và chấp nhận Quy tắc ứng xử của Viện."
            />
            {errors.codeOfConductAcceptance && (
              <Typography variant="caption" color="error" sx={{ ml: 4 }}>
                {errors.codeOfConductAcceptance}
              </Typography>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* ─── Submit Button ─────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mb: 4 }}>
        <Button
          variant="outlined"
          onClick={() => router.push('/members')}
          disabled={isSubmitting}
        >
          Hủy
        </Button>
        <Button
          variant="contained"
          startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
          onClick={handleSubmit}
          disabled={isSubmitting}
          size="large"
        >
          {isSubmitting ? 'Đang nộp đơn...' : 'Nộp đơn đăng ký'}
        </Button>
      </Box>
    </Box>
  )
}
