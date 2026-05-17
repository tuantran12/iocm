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
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import WarningIcon from '@mui/icons-material/Warning'
import { trpc } from '@/lib/trpc'

const OWNERSHIP_TYPES = [
  { value: 'owned', label: 'Sở hữu' },
  { value: 'rented', label: 'Thuê' },
  { value: 'borrowed', label: 'Mượn' },
  { value: 'contributed', label: 'Góp vốn' },
]

const emptyForm = {
  addressFull: '',
  ownershipType: '',
  contractNumber: '',
  validFrom: '',
  validTo: '',
  areaM2: '' as string | number,
  status: 'draft',
}

export default function PremisesPage() {
  const { data: premises, isLoading } = trpc.premises.list.useQuery()
  const { data: profile } = trpc.instituteProfile.get.useQuery()
  const utils = trpc.useUtils()

  const createMutation = trpc.premises.create.useMutation()
  const deleteMutation = trpc.premises.delete.useMutation()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      addressFull: form.addressFull,
      ownershipType: form.ownershipType,
      contractNumber: form.contractNumber || undefined,
      validFrom: form.validFrom || undefined,
      validTo: form.validTo || undefined,
      areaM2: form.areaM2 ? Number(form.areaM2) : undefined,
      status: form.status,
    })
    await utils.premises.list.invalidate()
    setDialogOpen(false)
    setForm(emptyForm)
  }

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync({ id })
    await utils.premises.list.invalidate()
  }

  // Check address mismatch
  const addressMismatch = (address: string) => {
    if (!profile?.plannedAddress) return false
    return !address.toLowerCase().includes(profile.plannedAddress.toLowerCase()) &&
      !profile.plannedAddress.toLowerCase().includes(address.toLowerCase())
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
        Trụ sở làm việc
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Thông tin trụ sở — Mẫu 11
      </Typography>

      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Danh sách trụ sở ({premises?.length ?? 0})</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              Thêm trụ sở
            </Button>
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Địa chỉ</TableCell>
                  <TableCell>Loại sở hữu</TableCell>
                  <TableCell>Hợp đồng số</TableCell>
                  <TableCell>Hiệu lực</TableCell>
                  <TableCell>Diện tích (m²)</TableCell>
                  <TableCell>Trạng thái</TableCell>
                  <TableCell align="right">Xóa</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {premises?.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <span>{p.addressFull}</span>
                        {addressMismatch(p.addressFull) && (
                          <WarningIcon color="warning" fontSize="small" titleAccess="Không khớp địa chỉ hồ sơ Viện" />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {OWNERSHIP_TYPES.find((o) => o.value === p.ownershipType)?.label ?? p.ownershipType}
                    </TableCell>
                    <TableCell>{p.contractNumber ?? '—'}</TableCell>
                    <TableCell>
                      {p.validFrom ? new Date(p.validFrom).toLocaleDateString('vi-VN') : '—'}
                      {p.validTo ? ` → ${new Date(p.validTo).toLocaleDateString('vi-VN')}` : ''}
                    </TableCell>
                    <TableCell>{p.areaM2 ?? '—'}</TableCell>
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
                {(!premises || premises.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">Chưa có trụ sở nào</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {premises?.some((p) => addressMismatch(p.addressFull)) && (
            <Alert severity="warning" icon={<WarningIcon />} sx={{ mt: 2 }}>
              Một số địa chỉ trụ sở không khớp với địa chỉ dự kiến trong Hồ sơ Viện ({profile?.plannedAddress}).
              Vui lòng kiểm tra lại.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Add Premises Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Thêm trụ sở</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Địa chỉ đầy đủ *"
              value={form.addressFull}
              onChange={(e) => setForm((f) => ({ ...f, addressFull: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Loại sở hữu *"
              value={form.ownershipType}
              onChange={(e) => setForm((f) => ({ ...f, ownershipType: e.target.value }))}
              fullWidth
              select
            >
              {OWNERSHIP_TYPES.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Hợp đồng số"
              value={form.contractNumber}
              onChange={(e) => setForm((f) => ({ ...f, contractNumber: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Hiệu lực từ"
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Hiệu lực đến"
              type="date"
              value={form.validTo}
              onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Diện tích (m²)"
              type="number"
              value={form.areaM2}
              onChange={(e) => setForm((f) => ({ ...f, areaM2: e.target.value }))}
              fullWidth
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
