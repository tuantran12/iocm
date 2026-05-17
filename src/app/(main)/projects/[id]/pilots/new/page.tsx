'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Breadcrumbs,
  Link as MuiLink,
  Alert,
  Stack,
  Autocomplete,
  CircularProgress,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SaveIcon from '@mui/icons-material/Save'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import { trpc } from '@/lib/trpc'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductOption {
  id: string
  name: string
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function NewPilotPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  // Form state
  const [deploymentArea, setDeploymentArea] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)
  const [beneficiaryGroup, setBeneficiaryGroup] = useState('')
  const [beneficiaryCount, setBeneficiaryCount] = useState('')
  const [consentStrategy, setConsentStrategy] = useState('')
  const [riskAssessment, setRiskAssessment] = useState('')
  const [successCriteria, setSuccessCriteria] = useState('')

  // UI state
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Fetch products for Autocomplete
  const { data: productsData, isLoading: productsLoading } = trpc.products.list.useQuery(
    { page: 1, pageSize: 100 },
    { retry: false }
  )

  const products: ProductOption[] = (productsData?.items ?? []).map((p: { id: string; name: string }) => ({
    id: p.id,
    name: p.name,
  }))

  // Create pilot mutation
  const createPilot = trpc.projects.createPilot.useMutation({
    onSuccess: () => {
      setSuccess(true)
      setError(null)
      setTimeout(() => {
        router.push(`/projects/${projectId}`)
      }, 1500)
    },
    onError: (err) => {
      setError(err.message || 'Có lỗi xảy ra khi tạo pilot.')
      setSuccess(false)
    },
  })

  // ─── Form Submission ─────────────────────────────────────────────────────────

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!deploymentArea.trim()) {
      setError('Khu vực triển khai là bắt buộc.')
      return
    }

    createPilot.mutate({
      projectId,
      deploymentArea: deploymentArea.trim(),
      productId: selectedProduct?.id ?? null,
      beneficiaryGroup: beneficiaryGroup.trim() || null,
      beneficiaryCount: beneficiaryCount ? parseInt(beneficiaryCount, 10) : null,
      consentStrategy: consentStrategy.trim() || null,
      riskAssessment: riskAssessment.trim() || null,
      successCriteria: successCriteria.trim() || null,
    })
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
          onClick={() => router.push('/projects')}
        >
          Dự án
        </MuiLink>
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push(`/projects/${projectId}`)}
        >
          Chi tiết dự án
        </MuiLink>
        <Typography color="text.primary">Tạo Pilot mới</Typography>
      </Breadcrumbs>

      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Tạo Pilot Deployment</Typography>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push(`/projects/${projectId}`)}
        >
          Quay lại
        </Button>
      </Box>

      {/* Alerts */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Tạo pilot thành công! Đang chuyển hướng...
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Form */}
      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={3}>
              {/* Khu vực triển khai - required */}
              <TextField
                label="Khu vực triển khai"
                value={deploymentArea}
                onChange={(e) => setDeploymentArea(e.target.value)}
                required
                fullWidth
                placeholder="Ví dụ: Quận 1, TP.HCM"
                error={!!error && !deploymentArea.trim()}
                helperText={!!error && !deploymentArea.trim() ? 'Trường này là bắt buộc' : ''}
              />

              {/* Sản phẩm - optional Autocomplete */}
              <Autocomplete
                options={products}
                getOptionLabel={(option) => option.name}
                value={selectedProduct}
                onChange={(_, newValue) => setSelectedProduct(newValue)}
                loading={productsLoading}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Sản phẩm"
                    placeholder="Chọn sản phẩm công nghệ (tùy chọn)"
                    slotProps={{
                      input: {
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {productsLoading ? <CircularProgress color="inherit" size={20} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      },
                    }}
                  />
                )}
                noOptionsText="Không có sản phẩm nào"
              />

              {/* Nhóm hưởng lợi - optional */}
              <TextField
                label="Nhóm hưởng lợi"
                value={beneficiaryGroup}
                onChange={(e) => setBeneficiaryGroup(e.target.value)}
                fullWidth
                placeholder="Ví dụ: Người dân khu vực nông thôn"
              />

              {/* Số người hưởng lợi - optional number */}
              <TextField
                label="Số người hưởng lợi"
                value={beneficiaryCount}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '' || /^\d+$/.test(val)) {
                    setBeneficiaryCount(val)
                  }
                }}
                fullWidth
                placeholder="Ví dụ: 500"
                type="text"
                inputMode="numeric"
              />

              {/* Chiến lược đồng ý - optional multiline */}
              <TextField
                label="Chiến lược đồng ý"
                value={consentStrategy}
                onChange={(e) => setConsentStrategy(e.target.value)}
                fullWidth
                multiline
                rows={3}
                placeholder="Mô tả chiến lược thu thập đồng ý từ người hưởng lợi..."
              />

              {/* Đánh giá rủi ro - optional multiline */}
              <TextField
                label="Đánh giá rủi ro"
                value={riskAssessment}
                onChange={(e) => setRiskAssessment(e.target.value)}
                fullWidth
                multiline
                rows={3}
                placeholder="Mô tả các rủi ro tiềm ẩn và biện pháp giảm thiểu..."
              />

              {/* Tiêu chí thành công - optional multiline */}
              <TextField
                label="Tiêu chí thành công"
                value={successCriteria}
                onChange={(e) => setSuccessCriteria(e.target.value)}
                fullWidth
                multiline
                rows={3}
                placeholder="Mô tả các tiêu chí đánh giá thành công của pilot..."
              />

              {/* Actions */}
              <Stack direction="row" spacing={2} justifyContent="flex-end">
                <Button
                  variant="outlined"
                  onClick={() => router.push(`/projects/${projectId}`)}
                  disabled={createPilot.isPending}
                >
                  Quay lại
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={createPilot.isPending ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                  disabled={createPilot.isPending || success}
                >
                  {createPilot.isPending ? 'Đang tạo...' : 'Tạo Pilot'}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
