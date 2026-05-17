'use client'

import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Stack,
  Skeleton,
  Chip,
  Alert,
  Divider,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import SupplementIcon from '@mui/icons-material/NoteAdd'
import { trpc } from '@/lib/trpc'

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Đã nộp',
  processing: 'Đang xử lý',
  supplement_requested: 'Yêu cầu bổ sung',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
}

const STATUS_COLORS: Record<string, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  submitted: 'info',
  processing: 'default',
  supplement_requested: 'warning',
  approved: 'success',
  rejected: 'error',
}

const METHOD_LABELS: Record<string, string> = {
  direct: 'Trực tiếp',
  postal: 'Bưu điện',
  online: 'Trực tuyến',
}

const emptyForm = {
  dossierId: '',
  submissionMethod: '',
  submittedBy: '',
  submittedAt: '',
  receivingAuthority: '',
  receiptNumber: '',
  processingDeadline: '',
}

export default function SubmissionsPage() {
  const { data: submissions, isLoading } = trpc.submissions.list.useQuery()
  const { data: dossier } = trpc.registrationDossier.get.useQuery()
  const utils = trpc.useUtils()

  const createMutation = trpc.submissions.create.useMutation()
  const supplementMutation = trpc.submissions.addSupplement.useMutation()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [supplementOpen, setSupplementOpen] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [supplementForm, setSupplementForm] = useState({ supplementDeadline: '', authorityFeedback: '' })

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      dossierId: form.dossierId || dossier?.id || '',
      submissionMethod: form.submissionMethod,
      submittedBy: form.submittedBy,
      submittedAt: form.submittedAt,
      receivingAuthority: form.receivingAuthority,
      receiptNumber: form.receiptNumber || undefined,
      processingDeadline: form.processingDeadline || undefined,
    })
    await utils.submissions.list.invalidate()
    setDialogOpen(false)
    setForm(emptyForm)
  }

  const handleSupplement = async () => {
    if (!supplementOpen) return
    await supplementMutation.mutateAsync({
      id: supplementOpen,
      supplementDeadline: supplementForm.supplementDeadline || undefined,
      authorityFeedback: supplementForm.authorityFeedback || undefined,
    })
    await utils.submissions.list.invalidate()
    setSupplementOpen(null)
    setSupplementForm({ supplementDeadline: '', authorityFeedback: '' })
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
        Theo dõi nộp hồ sơ
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Lịch sử nộp hồ sơ và theo dõi kết quả xử lý
      </Typography>

      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          Ghi nhận nộp hồ sơ
        </Button>
      </Stack>

      {/* Submissions Timeline */}
      {(!submissions || submissions.length === 0) ? (
        <Card>
          <CardContent>
            <Alert severity="info">Chưa có lần nộp hồ sơ nào được ghi nhận.</Alert>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {submissions.map((s) => (
            <Card key={s.id}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Chip
                        label={STATUS_LABELS[s.currentStatus] ?? s.currentStatus}
                        color={STATUS_COLORS[s.currentStatus] ?? 'default'}
                        size="small"
                      />
                      <Chip
                        label={METHOD_LABELS[s.submissionMethod] ?? s.submissionMethod}
                        variant="outlined"
                        size="small"
                      />
                    </Stack>
                    <Typography variant="body2">
                      <strong>Ngày nộp:</strong> {new Date(s.submittedAt).toLocaleDateString('vi-VN')}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Cơ quan:</strong> {s.receivingAuthority}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Người nộp:</strong> {s.submittedBy}
                    </Typography>
                    {s.receiptNumber && (
                      <Typography variant="body2">
                        <strong>Biên nhận:</strong> {s.receiptNumber}
                      </Typography>
                    )}
                    {s.processingDeadline && (
                      <Typography variant="body2">
                        <strong>Hạn xử lý:</strong> {new Date(s.processingDeadline).toLocaleDateString('vi-VN')}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    size="small"
                    startIcon={<SupplementIcon />}
                    onClick={() => setSupplementOpen(s.id)}
                  >
                    Bổ sung
                  </Button>
                </Stack>

                {/* Supplement info */}
                {s.supplementRequired && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      <Typography variant="body2"><strong>Yêu cầu bổ sung</strong></Typography>
                      {s.authorityFeedback && (
                        <Typography variant="body2">Nội dung: {s.authorityFeedback}</Typography>
                      )}
                      {s.supplementDeadline && (
                        <Typography variant="body2">
                          Hạn bổ sung: {new Date(s.supplementDeadline).toLocaleDateString('vi-VN')}
                        </Typography>
                      )}
                    </Alert>
                  </>
                )}

                {/* Result */}
                {s.resultStatus && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Alert severity={s.resultStatus === 'approved' ? 'success' : 'error'}>
                      <Typography variant="body2">
                        <strong>Kết quả:</strong> {s.resultStatus === 'approved' ? 'Đã cấp phép' : 'Từ chối'}
                      </Typography>
                      {s.certificateNumber && (
                        <Typography variant="body2">Số GCN: {s.certificateNumber}</Typography>
                      )}
                      {s.resultDate && (
                        <Typography variant="body2">
                          Ngày: {new Date(s.resultDate).toLocaleDateString('vi-VN')}
                        </Typography>
                      )}
                    </Alert>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Create Submission Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Ghi nhận nộp hồ sơ</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Phương thức nộp *"
              value={form.submissionMethod}
              onChange={(e) => setForm((f) => ({ ...f, submissionMethod: e.target.value }))}
              fullWidth
              select
            >
              <MenuItem value="direct">Trực tiếp</MenuItem>
              <MenuItem value="postal">Bưu điện</MenuItem>
              <MenuItem value="online">Trực tuyến</MenuItem>
            </TextField>
            <TextField
              label="Người nộp *"
              value={form.submittedBy}
              onChange={(e) => setForm((f) => ({ ...f, submittedBy: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Ngày nộp *"
              type="date"
              value={form.submittedAt}
              onChange={(e) => setForm((f) => ({ ...f, submittedAt: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Cơ quan tiếp nhận *"
              value={form.receivingAuthority}
              onChange={(e) => setForm((f) => ({ ...f, receivingAuthority: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Số biên nhận"
              value={form.receiptNumber}
              onChange={(e) => setForm((f) => ({ ...f, receiptNumber: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Hạn xử lý"
              type="date"
              value={form.processingDeadline}
              onChange={(e) => setForm((f) => ({ ...f, processingDeadline: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleCreate} disabled={createMutation.isPending}>
            Ghi nhận
          </Button>
        </DialogActions>
      </Dialog>

      {/* Supplement Dialog */}
      <Dialog open={!!supplementOpen} onClose={() => setSupplementOpen(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Ghi nhận yêu cầu bổ sung</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Nội dung yêu cầu"
              value={supplementForm.authorityFeedback}
              onChange={(e) => setSupplementForm((f) => ({ ...f, authorityFeedback: e.target.value }))}
              fullWidth
              multiline
              rows={3}
            />
            <TextField
              label="Hạn bổ sung"
              type="date"
              value={supplementForm.supplementDeadline}
              onChange={(e) => setSupplementForm((f) => ({ ...f, supplementDeadline: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSupplementOpen(null)}>Hủy</Button>
          <Button variant="contained" onClick={handleSupplement} disabled={supplementMutation.isPending}>
            Lưu
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
