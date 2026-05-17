'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  TextField,
  Button,
  Breadcrumbs,
  Link as MuiLink,
  Chip,
  Stack,
  Slider,
  Alert,
  Snackbar,
  LinearProgress,
} from '@mui/material'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import SaveIcon from '@mui/icons-material/Save'
import { trpc } from '@/lib/trpc'

// ─── Scoring Logic (mirrors server-side) ─────────────────────────────────────

const SCORE_WEIGHTS = {
  legal: 0.25,
  technical: 0.20,
  security: 0.25,
  data: 0.20,
  ai: 0.10,
} as const

function calculateOverallScore(scores: {
  legal: number | null
  technical: number | null
  security: number | null
  data: number | null
  ai: number | null
}): number | null {
  const entries: { score: number; weight: number }[] = []

  if (scores.legal != null) entries.push({ score: scores.legal, weight: SCORE_WEIGHTS.legal })
  if (scores.technical != null) entries.push({ score: scores.technical, weight: SCORE_WEIGHTS.technical })
  if (scores.security != null) entries.push({ score: scores.security, weight: SCORE_WEIGHTS.security })
  if (scores.data != null) entries.push({ score: scores.data, weight: SCORE_WEIGHTS.data })
  if (scores.ai != null) entries.push({ score: scores.ai, weight: SCORE_WEIGHTS.ai })

  if (entries.length === 0) return null

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0)
  const weightedSum = entries.reduce((sum, e) => sum + e.score * e.weight, 0)

  return Math.round(weightedSum / totalWeight)
}

function calculateRiskRating(overallScore: number): string {
  if (overallScore >= 80) return 'R1'
  if (overallScore >= 60) return 'R2'
  if (overallScore >= 40) return 'R3'
  if (overallScore >= 20) return 'R4'
  return 'R5'
}

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

// ─── Score Section Component ─────────────────────────────────────────────────

interface ScoreSectionProps {
  label: string
  description: string
  weight: string
  value: number | null
  onChange: (value: number | null) => void
}

function ScoreSection({ label, description, weight, value, onChange }: ScoreSectionProps) {
  const [inputValue, setInputValue] = useState<string>(value?.toString() ?? '')

  const handleSliderChange = (_: Event, newValue: number | number[]) => {
    const val = newValue as number
    setInputValue(val.toString())
    onChange(val)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setInputValue(raw)
    if (raw === '') {
      onChange(null)
      return
    }
    const num = parseInt(raw, 10)
    if (!isNaN(num) && num >= 0 && num <= 100) {
      onChange(num)
    }
  }

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              {label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {description}
            </Typography>
          </Box>
          <Chip label={weight} size="small" variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center">
          <Slider
            value={value ?? 0}
            onChange={handleSliderChange}
            min={0}
            max={100}
            sx={{ flex: 1 }}
            aria-label={label}
          />
          <TextField
            value={inputValue}
            onChange={handleInputChange}
            size="small"
            type="number"
            slotProps={{ htmlInput: { min: 0, max: 100 } }}
            sx={{ width: 80 }}
          />
        </Stack>
      </CardContent>
    </Card>
  )
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function DueDiligencePage() {
  const params = useParams()
  const router = useRouter()
  const partnerId = params.id as string

  // Score state
  const [legalScore, setLegalScore] = useState<number | null>(null)
  const [technicalScore, setTechnicalScore] = useState<number | null>(null)
  const [securityScore, setSecurityScore] = useState<number | null>(null)
  const [dataScore, setDataScore] = useState<number | null>(null)
  const [aiScore, setAiScore] = useState<number | null>(null)

  // Form state
  const [decision, setDecision] = useState('')
  const [conditions, setConditions] = useState('')
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  // Auto-calculate overall score and risk rating
  const overallScore = useMemo(() => calculateOverallScore({
    legal: legalScore,
    technical: technicalScore,
    security: securityScore,
    data: dataScore,
    ai: aiScore,
  }), [legalScore, technicalScore, securityScore, dataScore, aiScore])

  const riskRating = useMemo(() => {
    if (overallScore == null) return null
    return calculateRiskRating(overallScore)
  }, [overallScore])

  // tRPC mutation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createDueDiligence = (trpc.partners.createDueDiligence as any).useMutation({
    onSuccess: () => {
      setSnackbar({ open: true, message: 'Thẩm định đã được lưu thành công!', severity: 'success' })
      setTimeout(() => router.push(`/partners/${partnerId}`), 1500)
    },
    onError: (err: { message?: string }) => {
      setSnackbar({ open: true, message: err.message || 'Có lỗi xảy ra', severity: 'error' })
    },
  }) as { mutate: (data: Record<string, unknown>) => void; isPending: boolean }

  const handleSubmit = () => {
    createDueDiligence.mutate({
      partnerId,
      reviewDate: new Date(),
      reviewers: [],
      legalScore,
      technicalScore,
      securityScore,
      dataScore,
      aiScore,
      overallScore,
      riskRating: riskRating as 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | null | undefined,
      decision: decision || null,
      conditions: conditions || null,
      nextReview: null,
    })
  }

  const hasAnyScore = legalScore != null || technicalScore != null || securityScore != null || dataScore != null || aiScore != null

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
        <MuiLink
          underline="hover"
          color="inherit"
          sx={{ cursor: 'pointer' }}
          onClick={() => router.push(`/partners/${partnerId}`)}
        >
          Chi tiết
        </MuiLink>
        <Typography color="text.primary">Thẩm định mới</Typography>
      </Breadcrumbs>

      {/* Page Header */}
      <Typography variant="h4" gutterBottom>
        Thẩm định Due Diligence
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Đánh giá đối tác theo 5 tiêu chí: Pháp lý, Kỹ thuật, Bảo mật, Dữ liệu, AI.
        Điểm tổng và mức rủi ro được tính tự động.
      </Typography>

      <Grid container spacing={3}>
        {/* Left: Scoring Sections */}
        <Grid size={{ xs: 12, md: 8 }}>
          <ScoreSection
            label="Pháp lý (Legal)"
            description="Tuân thủ pháp luật Việt Nam, giấy phép, đăng ký kinh doanh"
            weight="25%"
            value={legalScore}
            onChange={setLegalScore}
          />
          <ScoreSection
            label="Kỹ thuật (Technical)"
            description="Năng lực kỹ thuật, đội ngũ, kinh nghiệm triển khai"
            weight="20%"
            value={technicalScore}
            onChange={setTechnicalScore}
          />
          <ScoreSection
            label="Bảo mật (Security)"
            description="An toàn thông tin, chứng chỉ ISO 27001, penetration testing"
            weight="25%"
            value={securityScore}
            onChange={setSecurityScore}
          />
          <ScoreSection
            label="Dữ liệu (Data)"
            description="Bảo vệ dữ liệu cá nhân, GDPR/PDPA compliance, DPA"
            weight="20%"
            value={dataScore}
            onChange={setDataScore}
          />
          <ScoreSection
            label="AI (Artificial Intelligence)"
            description="Quản trị AI, minh bạch thuật toán, bias testing"
            weight="10%"
            value={aiScore}
            onChange={setAiScore}
          />
        </Grid>

        {/* Right: Summary Panel */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ position: 'sticky', top: 80 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Kết quả đánh giá
              </Typography>

              {/* Overall Score */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  Điểm tổng (weighted)
                </Typography>
                <Typography variant="h3" fontWeight={700} color={
                  overallScore == null ? 'text.disabled' :
                  overallScore >= 80 ? 'success.main' :
                  overallScore >= 60 ? 'info.main' :
                  overallScore >= 40 ? 'warning.main' : 'error.main'
                }>
                  {overallScore ?? '—'}
                </Typography>
                {overallScore != null && (
                  <LinearProgress
                    variant="determinate"
                    value={overallScore}
                    color={
                      overallScore >= 80 ? 'success' :
                      overallScore >= 60 ? 'info' :
                      overallScore >= 40 ? 'warning' : 'error'
                    }
                    sx={{ mt: 1, height: 8, borderRadius: 4 }}
                  />
                )}
              </Box>

              {/* Risk Rating */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" color="text.secondary">
                  Mức rủi ro
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  {riskRating ? (
                    <Chip
                      label={RISK_LABELS[riskRating]}
                      color={RISK_COLORS[riskRating]}
                      size="medium"
                    />
                  ) : (
                    <Typography variant="body2" color="text.disabled">
                      Chưa đủ dữ liệu
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Decision */}
              <TextField
                label="Quyết định"
                placeholder="approved / rejected / conditional"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                fullWidth
                size="small"
                sx={{ mb: 2 }}
              />

              {/* Conditions */}
              <TextField
                label="Điều kiện (nếu có)"
                placeholder="Các điều kiện kèm theo..."
                value={conditions}
                onChange={(e) => setConditions(e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={3}
                sx={{ mb: 3 }}
              />

              {/* Submit */}
              <Button
                variant="contained"
                fullWidth
                startIcon={<SaveIcon />}
                onClick={handleSubmit}
                disabled={!hasAnyScore || createDueDiligence.isPending}
              >
                {createDueDiligence.isPending ? 'Đang lưu...' : 'Lưu thẩm định'}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
