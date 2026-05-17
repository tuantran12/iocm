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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Stack,
  Skeleton,
  IconButton,
  Chip,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { trpc } from '@/lib/trpc'

const ASSET_TYPES = [
  { value: 'equipment', label: 'Thiết bị' },
  { value: 'furniture', label: 'Nội thất' },
  { value: 'vehicle', label: 'Phương tiện' },
  { value: 'software', label: 'Phần mềm' },
  { value: 'infrastructure', label: 'Hạ tầng' },
  { value: 'other', label: 'Khác' },
]

const OWNERSHIP_TYPES = [
  { value: 'owned', label: 'Sở hữu' },
  { value: 'rented', label: 'Thuê' },
  { value: 'borrowed', label: 'Mượn' },
  { value: 'contributed', label: 'Góp vốn' },
]

const emptyForm = {
  assetName: '',
  assetType: '',
  quantity: 1,
  technicalSpecs: '',
  ownershipType: '',
  relatedRegisteredField: '',
}

export default function FacilitiesPage() {
  const { data: assets, isLoading } = trpc.facilities.list.useQuery()
  const { data: summary } = trpc.facilities.summary.useQuery()
  const utils = trpc.useUtils()

  const createMutation = trpc.facilities.create.useMutation()
  const deleteMutation = trpc.facilities.delete.useMutation()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      assetName: form.assetName,
      assetType: form.assetType,
      quantity: form.quantity,
      technicalSpecs: form.technicalSpecs || undefined,
      ownershipType: form.ownershipType || undefined,
      relatedRegisteredField: form.relatedRegisteredField || undefined,
    })
    await utils.facilities.list.invalidate()
    await utils.facilities.summary.invalidate()
    setDialogOpen(false)
    setForm(emptyForm)
  }

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync({ id })
    await utils.facilities.list.invalidate()
    await utils.facilities.summary.invalidate()
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
        Cơ sở vật chất — Mẫu 12
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Danh mục trang thiết bị, cơ sở vật chất phục vụ hoạt động KH&CN
      </Typography>

      {/* Summary Card */}
      {summary && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" spacing={4} flexWrap="wrap">
              <Box>
                <Typography variant="body2" color="text.secondary">Tổng mục</Typography>
                <Typography variant="h5">{summary.totalAssets}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Tổng số lượng</Typography>
                <Typography variant="h5">{summary.totalQuantity}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">Theo loại</Typography>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                  {Object.entries(summary.byType).map(([type, count]) => (
                    <Chip
                      key={type}
                      label={`${ASSET_TYPES.find((a) => a.value === type)?.label ?? type}: ${count}`}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Assets Table */}
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Danh sách tài sản ({assets?.length ?? 0})</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              Thêm tài sản
            </Button>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Tên tài sản</TableCell>
                  <TableCell>Loại</TableCell>
                  <TableCell>Số lượng</TableCell>
                  <TableCell>Thông số</TableCell>
                  <TableCell>Sở hữu</TableCell>
                  <TableCell>Lĩnh vực liên quan</TableCell>
                  <TableCell align="right">Xóa</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assets?.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.assetName}</TableCell>
                    <TableCell>{ASSET_TYPES.find((t) => t.value === a.assetType)?.label ?? a.assetType}</TableCell>
                    <TableCell>{a.quantity}</TableCell>
                    <TableCell>{a.technicalSpecs ?? '—'}</TableCell>
                    <TableCell>
                      {OWNERSHIP_TYPES.find((o) => o.value === a.ownershipType)?.label ?? a.ownershipType ?? '—'}
                    </TableCell>
                    <TableCell>{a.relatedRegisteredField ?? '—'}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="error" onClick={() => handleDelete(a.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {(!assets || assets.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">Chưa có tài sản nào</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Add Asset Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Thêm tài sản</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Tên tài sản *"
              value={form.assetName}
              onChange={(e) => setForm((f) => ({ ...f, assetName: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Loại *"
              value={form.assetType}
              onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value }))}
              fullWidth
              select
            >
              {ASSET_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Số lượng"
              type="number"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) || 1 }))}
              fullWidth
            />
            <TextField
              label="Thông số kỹ thuật"
              value={form.technicalSpecs}
              onChange={(e) => setForm((f) => ({ ...f, technicalSpecs: e.target.value }))}
              fullWidth
              multiline
              rows={2}
            />
            <TextField
              label="Hình thức sở hữu"
              value={form.ownershipType}
              onChange={(e) => setForm((f) => ({ ...f, ownershipType: e.target.value }))}
              fullWidth
              select
            >
              <MenuItem value="">— Chọn —</MenuItem>
              {OWNERSHIP_TYPES.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Lĩnh vực liên quan"
              value={form.relatedRegisteredField}
              onChange={(e) => setForm((f) => ({ ...f, relatedRegisteredField: e.target.value }))}
              fullWidth
              placeholder="VD: Công nghệ thông tin"
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
