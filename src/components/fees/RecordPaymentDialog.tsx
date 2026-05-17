'use client'

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Alert,
  Box,
  Typography,
  Divider,
  CircularProgress,
  Stack,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { vi } from 'date-fns/locale'
import PaymentIcon from '@mui/icons-material/Payment'
import { trpc } from '@/lib/trpc'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeeInfo {
  id: string
  year: number
  amountDue: number | string
  amountPaid: number | string
  enterprise?: {
    legalNameVi: string
  } | null
}

interface RecordPaymentDialogProps {
  open: boolean
  onClose: () => void
  fee: FeeInfo
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Chuyển khoản ngân hàng' },
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'online', label: 'Thanh toán trực tuyến' },
  { value: 'other', label: 'Khác' },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatVND(value: number | string | null | undefined): string {
  if (value == null) return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(num)
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0
  const num = typeof value === 'string' ? parseFloat(value) : value
  return isNaN(num) ? 0 : num
}

// ─── Validation ───────────────────────────────────────────────────────────────

interface FormErrors {
  amount?: string
  paymentDate?: string
  paymentMethod?: string
}

interface FormData {
  amount: string
  paymentDate: Date | null
  paymentMethod: string
  paymentProof: string
}

function validateForm(data: FormData, remaining: number): FormErrors {
  const errors: FormErrors = {}

  const amount = parseFloat(data.amount)
  if (!data.amount || isNaN(amount) || amount <= 0) {
    errors.amount = 'Số tiền phải lớn hơn 0'
  } else if (amount > remaining) {
    errors.amount = `Số tiền không được vượt quá số còn lại (${formatVND(remaining)})`
  }

  if (!data.paymentDate) {
    errors.paymentDate = 'Vui lòng chọn ngày thanh toán'
  }

  if (!data.paymentMethod) {
    errors.paymentMethod = 'Vui lòng chọn phương thức thanh toán'
  }

  return errors
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecordPaymentDialog({ open, onClose, fee }: RecordPaymentDialogProps) {
  const utils = trpc.useUtils()

  // Form state
  const [formData, setFormData] = useState<FormData>({
    amount: '',
    paymentDate: new Date(),
    paymentMethod: 'bank_transfer',
    paymentProof: '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Computed values
  const amountDue = toNumber(fee.amountDue)
  const amountPaid = toNumber(fee.amountPaid)
  const remaining = amountDue - amountPaid

  // Mutation
  const recordPaymentMutation = trpc.fees.recordPayment.useMutation({
    onSuccess: () => {
      // Invalidate fees list to refetch
      utils.fees.list.invalidate()
      utils.fees.get.invalidate({ id: fee.id })
      handleClose()
    },
    onError: (err) => {
      setSubmitError(err.message)
    },
  })

  // Handlers
  const handleFieldChange = useCallback((field: keyof FormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (field in errors) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
    setSubmitError(null)
  }, [errors])

  const handleClose = useCallback(() => {
    // Reset form state
    setFormData({
      amount: '',
      paymentDate: new Date(),
      paymentMethod: 'bank_transfer',
      paymentProof: '',
    })
    setErrors({})
    setSubmitError(null)
    onClose()
  }, [onClose])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    const validationErrors = validateForm(formData, remaining)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    recordPaymentMutation.mutate({
      feeId: fee.id,
      amount: parseFloat(formData.amount),
      paymentDate: formData.paymentDate!.toISOString(),
      paymentMethod: formData.paymentMethod,
      paymentProof: formData.paymentProof || undefined,
    })
  }, [formData, remaining, fee.id, recordPaymentMutation])

  const isSubmitting = recordPaymentMutation.isPending

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={vi}>
      <Dialog
        open={open}
        onClose={isSubmitting ? undefined : handleClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PaymentIcon color="primary" />
          Ghi nhận thanh toán
        </DialogTitle>

        <DialogContent dividers>
          {/* Fee Info Summary */}
          <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Thông tin phí
            </Typography>
            <Stack spacing={0.5}>
              <Typography variant="body2">
                <strong>Doanh nghiệp:</strong>{' '}
                {fee.enterprise?.legalNameVi ?? '—'}
              </Typography>
              <Typography variant="body2">
                <strong>Năm:</strong> {fee.year}
              </Typography>
              <Typography variant="body2">
                <strong>Số tiền phải nộp:</strong> {formatVND(amountDue)}
              </Typography>
              <Typography variant="body2">
                <strong>Đã thanh toán:</strong>{' '}
                <Typography component="span" color="success.main" variant="body2">
                  {formatVND(amountPaid)}
                </Typography>
              </Typography>
              <Divider sx={{ my: 0.5 }} />
              <Typography variant="body2" fontWeight={600}>
                <strong>Còn lại:</strong>{' '}
                <Typography
                  component="span"
                  color={remaining > 0 ? 'error.main' : 'success.main'}
                  fontWeight={600}
                  variant="body2"
                >
                  {formatVND(remaining)}
                </Typography>
              </Typography>
            </Stack>
          </Box>

          {/* Error Alert */}
          {submitError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          {/* Payment Form */}
          <Box component="form" id="record-payment-form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2.5}>
              {/* Số tiền thanh toán */}
              <TextField
                label="Số tiền thanh toán"
                type="number"
                value={formData.amount}
                onChange={(e) => handleFieldChange('amount', e.target.value)}
                error={!!errors.amount}
                helperText={errors.amount}
                required
                fullWidth
                autoFocus
                slotProps={{
                  input: {
                    inputProps: { min: 0, step: 1000 },
                  },
                  htmlInput: { 'aria-label': 'Số tiền thanh toán' },
                }}
                placeholder={`Tối đa: ${formatVND(remaining)}`}
              />

              {/* Ngày thanh toán */}
              <DatePicker
                label="Ngày thanh toán"
                value={formData.paymentDate}
                onChange={(date) => handleFieldChange('paymentDate', date)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
                    error: !!errors.paymentDate,
                    helperText: errors.paymentDate,
                  },
                }}
              />

              {/* Phương thức thanh toán */}
              <TextField
                select
                label="Phương thức thanh toán"
                value={formData.paymentMethod}
                onChange={(e) => handleFieldChange('paymentMethod', e.target.value)}
                error={!!errors.paymentMethod}
                helperText={errors.paymentMethod}
                required
                fullWidth
              >
                {PAYMENT_METHODS.map((method) => (
                  <MenuItem key={method.value} value={method.value}>
                    {method.label}
                  </MenuItem>
                ))}
              </TextField>

              {/* Chứng từ thanh toán */}
              <TextField
                label="Chứng từ thanh toán"
                value={formData.paymentProof}
                onChange={(e) => handleFieldChange('paymentProof', e.target.value)}
                fullWidth
                placeholder="URL chứng từ hoặc mã giao dịch..."
                helperText="URL file chứng từ hoặc mã tham chiếu giao dịch (không bắt buộc)"
              />
            </Stack>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={handleClose}
            disabled={isSubmitting}
            color="inherit"
          >
            Hủy
          </Button>
          <Button
            type="submit"
            form="record-payment-form"
            variant="contained"
            disabled={isSubmitting || remaining <= 0}
            startIcon={isSubmitting ? <CircularProgress size={18} /> : <PaymentIcon />}
          >
            {isSubmitting ? 'Đang xử lý...' : 'Ghi nhận thanh toán'}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  )
}
