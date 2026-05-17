'use client'

import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Stack,
  Alert,
  Skeleton,
  IconButton,
  FormControlLabel,
  Checkbox,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import { trpc } from '@/lib/trpc'

const QUALIFICATIONS = [
  { value: 'trung_cap', label: 'Trung cấp' },
  { value: 'cao_dang', label: 'Cao đẳng' },
  { value: 'dai_hoc', label: 'Đại học' },
  { value: 'thac_si', label: 'Thạc sĩ' },
  { value: 'tien_si', label: 'Tiến sĩ' },
  { value: 'pgs', label: 'PGS' },
  { value: 'gs', label: 'GS' },
]

const EMPLOYMENT_TYPES = [
  { value: 'chinh_thuc', label: 'Chính thức' },
  { value: 'kiem_nhiem', label: 'Kiêm nhiệm' },
]

const QUAL_LABELS: Record<string, string> = Object.fromEntries(
  QUALIFICATIONS.map((q) => [q.value, q.label])
)
const EMP_LABELS: Record<string, string> = Object.fromEntries(
  EMPLOYMENT_TYPES.map((e) => [e.value, e.label])
)

const emptyForm = {
  fullName: '',
  birthYear: undefined as number | undefined,
  qualification: '',
  specialization: '',
  employmentType: '',
  matchingExpertise: false,
  formType: '',
  isHeadPerson: false,
  status: 'draft',
}

export default function EstablishmentPersonnelPage() {
  const { data: personnel, isLoading } = trpc.establishmentPersonnel.list.useQuery()
  const { data: validation } = trpc.establishmentPersonnel.validate.useQuery()
  const utils = trpc.useUtils()

  const createMutation = trpc.establishmentPersonnel.create.useMutation()
  const deleteMutation = trpc.establishmentPersonnel.delete.useMutation()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      fullName: form.fullName,
      birthYear: form.birthYear,
      qualification: form.qualification,
      specialization: form.specialization,
      employmentType: form.employmentType,
      matchingExpertise: form.matchingExpertise,
      formType: form.formType || undefined,
      isHeadPerson: form.isHeadPerson,
      status: form.status,
    })
    await utils.establishmentPersonnel.list.invalidate()
    await utils.establishmentPersonnel.validate.invalidate()
    setDialogOpen(false)
    setForm(emptyForm)
  }

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync({ id })
    await utils.establishmentPersonnel.list.invalidate()
    await utils.establishmentPersonnel.validate.invalidate()
  }

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={400} />
      </Box>
    )
  }

  const ValidationIcon = ({ pass }: { pass: boolean }) =>
    pass ? <CheckCircleIcon color="success" fontSize="small" /> : <CancelIcon color="error" fontSize="small" />

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Nhân sự thành lập
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Danh sách nhân sự dự kiến — Mẫu 7, 8, 9
      </Typography>

      {/* Validation Summary */}
      {validation && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>Kiểm tra điều kiện nhân sự</Typography>
            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <ValidationIcon pass={validation.hasMinUniversity} />
                <Typography variant="body2">
                  ≥ 5 người trình độ ĐH trở lên: {validation.universityCount}/5
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={1}>
                <ValidationIcon pass={validation.hasMinFullTime} />
                <Typography variant="body2">
                  ≥ 40% chính thức: {validation.fullTimePercent}% ({validation.fullTimeCount}/{validation.total})
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={1}>
                <ValidationIcon pass={validation.hasMinMatching} />
                <Typography variant="body2">
                  ≥ 30% đúng chuyên môn: {validation.matchingPercent}% ({validation.matchingCount}/{validation.total})
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={1}>
                <ValidationIcon pass={validation.headHasQualification} />
                <Typography variant="body2">
                  Người đứng đầu có ĐH+: {validation.headPerson ?? 'Chưa chỉ định'}
                </Typography>
              </Stack>
              <Chip
                label={validation.allPassed ? 'ĐẠT' : 'CHƯA ĐẠT'}
                color={validation.allPassed ? 'success' : 'error'}
                sx={{ alignSelf: 'flex-start', mt: 1 }}
              />
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Personnel Table */}
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Danh sách ({personnel?.length ?? 0})</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              Thêm nhân sự
            </Button>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Họ tên</TableCell>
                  <TableCell>Trình độ</TableCell>
                  <TableCell>Chuyên ngành</TableCell>
                  <TableCell>Loại hình</TableCell>
                  <TableCell>Đúng CM</TableCell>
                  <TableCell>Mẫu</TableCell>
                  <TableCell>Trạng thái</TableCell>
                  <TableCell align="right">Xóa</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {personnel?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.fullName}
                      {p.isHeadPerson && <Chip label="Đứng đầu" size="small" color="primary" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>{QUAL_LABELS[p.qualification] ?? p.qualification}</TableCell>
                    <TableCell>{p.specialization}</TableCell>
                    <TableCell>{EMP_LABELS[p.employmentType] ?? p.employmentType}</TableCell>
                    <TableCell>{p.matchingExpertise ? '✓' : '—'}</TableCell>
                    <TableCell>{p.formType ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        label={p.status === 'draft' ? 'Nháp' : p.status === 'confirmed' ? 'Xác nhận' : p.status}
                        size="small"
                        color={p.status === 'confirmed' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="error" onClick={() => handleDelete(p.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {(!personnel || personnel.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">Chưa có nhân sự nào</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Add Personnel Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Thêm nhân sự</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Họ tên *"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Năm sinh"
              type="number"
              value={form.birthYear ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, birthYear: e.target.value ? Number(e.target.value) : undefined }))}
              fullWidth
            />
            <TextField
              label="Trình độ *"
              value={form.qualification}
              onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))}
              fullWidth
              select
            >
              {QUALIFICATIONS.map((q) => (
                <MenuItem key={q.value} value={q.value}>{q.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Chuyên ngành *"
              value={form.specialization}
              onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Loại hình *"
              value={form.employmentType}
              onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}
              fullWidth
              select
            >
              {EMPLOYMENT_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Mẫu"
              value={form.formType}
              onChange={(e) => setForm((f) => ({ ...f, formType: e.target.value }))}
              fullWidth
              placeholder="VD: Mẫu 7, Mẫu 8"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.matchingExpertise}
                  onChange={(e) => setForm((f) => ({ ...f, matchingExpertise: e.target.checked }))}
                />
              }
              label="Đúng chuyên môn đăng ký"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.isHeadPerson}
                  onChange={(e) => setForm((f) => ({ ...f, isHeadPerson: e.target.checked }))}
                />
              }
              label="Là người đứng đầu dự kiến"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleCreate} disabled={createMutation.isPending}>
            Thêm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
