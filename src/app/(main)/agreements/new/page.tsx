'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Breadcrumbs,
  Link as MuiLink,
  Stack,
  IconButton,
  Alert,
} from '@mui/material'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { trpc } from '@/lib/trpc'

// ─── Vietnamese Labels ───────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'MEMBERSHIP', label: 'Hội viên' },
  { value: 'MOU', label: 'Biên bản ghi nhớ (MOU)' },
  { value: 'NDA', label: 'Bảo mật thông tin (NDA)' },
  { value: 'DPA', label: 'Xử lý dữ liệu (DPA)' },
  { value: 'SLA', label: 'Cam kết dịch vụ (SLA)' },
  { value: 'TECH_DEPLOYMENT', label: 'Triển khai công nghệ' },
  { value: 'TECH_TRANSFER', label: 'Chuyển giao công nghệ' },
  { value: 'SPONSORSHIP', label: 'Tài trợ' },
  { value: 'RESEARCH', label: 'Nghiên cứu' },
  { value: 'DATA_SHARING', label: 'Chia sẻ dữ liệu' },
  { value: 'EVENT', label: 'Sự kiện' },
]

interface ObligationForm {
  id: string
  title: string
  description: string
  responsible: string
  deadline: string
}

function generateId() {
  return `obl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function AgreementCreatePage() {
  const router = useRouter()
  const createMutation = trpc.agreements.create.useMutation({
    onSuccess: (data) => {
      router.push(`/agreements/${data.id}`)
    },
  })

  // Form state
  const [type, setType] = useState('')
  const [title, setTitle] = useState('')
  const [partyA, setPartyA] = useState('Viện Công nghệ & Đổi mới sáng tạo')
  const [partyB, setPartyB] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [renewalNotice, setRenewalNotice] = useState('')
  const [obligations, setObligations] = useState<ObligationForm[]>([])

  const handleAddObligation = () => {
    setObligations([
      ...obligations,
      { id: generateId(), title: '', description: '', responsible: '', deadline: '' },
    ])
  }

  const handleRemoveObligation = (index: number) => {
    setObligations(obligations.filter((_, i) => i !== index))
  }

  const handleObligationChange = (index: number, field: keyof ObligationForm, value: string) => {
    const updated = [...obligations]
    updated[index] = { ...updated[index]!, [field]: value }
    setObligations(updated)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const keyObligations = obligations
      .filter((o) => o.title.trim())
      .map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description || undefined,
        responsible: o.responsible || undefined,
        deadline: o.deadline ? new Date(o.deadline) : null,
        status: 'PENDING' as const,
      }))

    createMutation.mutate({
      type: type as any,
      title,
      partyA,
      partyB,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      renewalNotice: renewalNotice ? new Date(renewalNotice) : null,
      keyObligations: keyObligations.length > 0 ? keyObligations : null,
    })
  }

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push('/agreements')}
        >
          Hợp đồng
        </MuiLink>
        <Typography color="text.primary">Tạo mới</Typography>
      </Breadcrumbs>

      <Typography variant="h4" gutterBottom>
        Tạo hợp đồng / thỏa thuận mới
      </Typography>

      {createMutation.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {createMutation.error.message}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Type */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Loại hợp đồng</InputLabel>
                <Select
                  value={type}
                  label="Loại hợp đồng"
                  onChange={(e) => setType(e.target.value)}
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Title */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Tiêu đề"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                fullWidth
                required
              />
            </Grid>

            {/* Party A */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Bên A"
                value={partyA}
                onChange={(e) => setPartyA(e.target.value)}
                fullWidth
                required
              />
            </Grid>

            {/* Party B */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Bên B"
                value={partyB}
                onChange={(e) => setPartyB(e.target.value)}
                fullWidth
                required
              />
            </Grid>

            {/* Effective Date */}
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Ngày hiệu lực"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>

            {/* Expiry Date */}
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Ngày hết hạn"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>

            {/* Renewal Notice */}
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                label="Ngày nhắc gia hạn"
                type="date"
                value={renewalNotice}
                onChange={(e) => setRenewalNotice(e.target.value)}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>

            {/* Obligations Section */}
            <Grid size={{ xs: 12 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Nghĩa vụ chính</Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={handleAddObligation}
                >
                  Thêm nghĩa vụ
                </Button>
              </Stack>

              {obligations.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  Chưa có nghĩa vụ nào. Nhấn &quot;Thêm nghĩa vụ&quot; để bổ sung.
                </Typography>
              )}

              {obligations.map((ob, index) => (
                <Paper key={ob.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Grid container spacing={2} sx={{ flex: 1 }}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Tên nghĩa vụ"
                          value={ob.title}
                          onChange={(e) => handleObligationChange(index, 'title', e.target.value)}
                          fullWidth
                          size="small"
                          required
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Người phụ trách"
                          value={ob.responsible}
                          onChange={(e) => handleObligationChange(index, 'responsible', e.target.value)}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Mô tả"
                          value={ob.description}
                          onChange={(e) => handleObligationChange(index, 'description', e.target.value)}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Hạn chót"
                          type="date"
                          value={ob.deadline}
                          onChange={(e) => handleObligationChange(index, 'deadline', e.target.value)}
                          fullWidth
                          size="small"
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </Grid>
                    </Grid>
                    <IconButton
                      onClick={() => handleRemoveObligation(index)}
                      color="error"
                      size="small"
                      sx={{ ml: 1 }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Stack>
                </Paper>
              ))}
            </Grid>

            {/* Submit */}
            <Grid size={{ xs: 12 }}>
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button variant="outlined" onClick={() => router.push('/agreements')}>
                  Hủy
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={!type || !title || !partyA || !partyB || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Đang tạo...' : 'Tạo hợp đồng'}
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  )
}
