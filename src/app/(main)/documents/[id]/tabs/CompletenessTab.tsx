'use client'

import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  LinearProgress,
  Alert,
  AlertTitle,
  Chip,
  Stack,
  Skeleton,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { trpc } from '@/lib/trpc'

interface CompletenessTabProps {
  documentId: string
}

type CheckAnswer = 'PASS' | 'FAIL' | 'NOT_APPLICABLE'

export function CompletenessTab({ documentId }: CompletenessTabProps) {
  const utils = trpc.useUtils()

  const { data, isLoading } = trpc.documents.getCompleteness.useQuery(
    { documentId },
    { enabled: !!documentId }
  )

  const updateMutation = trpc.documents.updateCompleteness.useMutation({
    onSuccess: () => {
      utils.documents.getCompleteness.invalidate({ documentId })
      utils.documents.get.invalidate({ id: documentId })
    },
  })

  const handleAnswerChange = (questionKey: string, newAnswer: CheckAnswer | null) => {
    if (!newAnswer) return
    updateMutation.mutate({
      documentId,
      updates: [{ questionKey, answer: newAnswer }],
    })
  }

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={60} sx={{ mb: 2, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 1 }} />
      </Box>
    )
  }

  if (!data) {
    return (
      <Typography color="text.secondary">
        Không thể tải dữ liệu hoàn thiện.
      </Typography>
    )
  }

  const scorePercent = Math.round(data.score * 100)

  return (
    <Box>
      {/* Score display */}
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h6">
            Điểm hoàn thiện
          </Typography>
          <Chip
            label={`${scorePercent}%`}
            color={scorePercent >= 80 ? 'success' : scorePercent >= 50 ? 'warning' : 'error'}
            size="medium"
            sx={{ fontWeight: 700, fontSize: '1rem' }}
          />
        </Stack>
        <LinearProgress
          variant="determinate"
          value={scorePercent}
          color={scorePercent >= 80 ? 'success' : scorePercent >= 50 ? 'warning' : 'error'}
          sx={{ height: 10, borderRadius: 5 }}
        />
        {!data.canMarkOfficialRecord && data.officialRecordBlockers.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }} icon={<WarningAmberIcon />}>
            <AlertTitle>Chưa thể đánh dấu là bản gốc chính thức</AlertTitle>
            Các câu hỏi bắt buộc chưa đạt: {data.officialRecordBlockers.join(', ')}
          </Alert>
        )}
      </Paper>

      {/* Completeness questions table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 60 }}>STT</TableCell>
              <TableCell>Câu hỏi</TableCell>
              <TableCell sx={{ width: 80 }} align="center">Bắt buộc</TableCell>
              <TableCell sx={{ width: 280 }} align="center">Đánh giá</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.checks.map((check, index) => (
              <TableRow key={check.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {check.key}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {check.questionText}
                  </Typography>
                  {check.missingAction && (
                    <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.5 }}>
                      ⚠ {check.missingAction}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="center">
                  {check.required ? (
                    <Chip label="Có" size="small" color="primary" variant="outlined" />
                  ) : (
                    <Chip label="Không" size="small" variant="outlined" />
                  )}
                </TableCell>
                <TableCell align="center">
                  <ToggleButtonGroup
                    value={check.answer}
                    exclusive
                    onChange={(_, value) => handleAnswerChange(check.key, value)}
                    size="small"
                    aria-label={`Đánh giá ${check.key}`}
                  >
                    <ToggleButton
                      value="PASS"
                      color="success"
                      aria-label="Đạt"
                      sx={{ px: 1.5 }}
                    >
                      <CheckCircleIcon fontSize="small" sx={{ mr: 0.5 }} />
                      Đạt
                    </ToggleButton>
                    <ToggleButton
                      value="FAIL"
                      color="error"
                      aria-label="Không đạt"
                      sx={{ px: 1.5 }}
                    >
                      <CancelIcon fontSize="small" sx={{ mr: 0.5 }} />
                      Chưa
                    </ToggleButton>
                    <ToggleButton
                      value="NOT_APPLICABLE"
                      aria-label="Không áp dụng"
                      sx={{ px: 1.5 }}
                    >
                      <RemoveCircleOutlineIcon fontSize="small" sx={{ mr: 0.5 }} />
                      N/A
                    </ToggleButton>
                  </ToggleButtonGroup>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Missing actions summary */}
      {data.missingActions.length > 0 && (
        <Paper variant="outlined" sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom color="warning.main">
            Hành động cần thực hiện ({data.missingActions.length})
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0 }}>
            {data.missingActions.map((action) => (
              <Box component="li" key={action.key} sx={{ mb: 1 }}>
                <Typography variant="body2">
                  <strong>{action.key}:</strong> {action.action}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  )
}
