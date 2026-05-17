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
  LinearProgress,
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
import { trpc } from '@/lib/trpc'

const STATUS_COLORS: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  missing: 'error',
  draft: 'warning',
  ready: 'success',
  submitted: 'info',
  accepted: 'success',
  needs_revision: 'error',
}

const STATUS_LABELS: Record<string, string> = {
  missing: 'Thiếu',
  draft: 'Bản nháp',
  ready: 'Sẵn sàng',
  submitted: 'Đã nộp',
  accepted: 'Đã chấp nhận',
  needs_revision: 'Cần sửa',
}

export default function RegistrationDossierPage() {
  const { data: dossier, isLoading } = trpc.registrationDossier.get.useQuery()
  const { data: readiness } = trpc.registrationDossier.getReadiness.useQuery()
  const { data: documents } = trpc.documents.list.useQuery({} as any)
  const utils = trpc.useUtils()

  const createMutation = trpc.registrationDossier.create.useMutation()
  const addItemMutation = trpc.registrationDossier.addItem.useMutation()
  const removeItemMutation = trpc.registrationDossier.removeItem.useMutation()
  const updateStatusMutation = trpc.registrationDossier.updateItemStatus.useMutation()

  const [createOpen, setCreateOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ code: '', registrationAuthority: '', submissionMethod: '' })
  const [addItemForm, setAddItemForm] = useState({ documentId: '', requirementLevel: 'mandatory_for_submission' })

  const handleCreate = async () => {
    await createMutation.mutateAsync(createForm)
    await utils.registrationDossier.get.invalidate()
    setCreateOpen(false)
    setCreateForm({ code: '', registrationAuthority: '', submissionMethod: '' })
  }

  const handleAddItem = async () => {
    if (!dossier) return
    await addItemMutation.mutateAsync({ dossierId: dossier.id, ...addItemForm })
    await utils.registrationDossier.get.invalidate()
    await utils.registrationDossier.getReadiness.invalidate()
    setAddItemOpen(false)
    setAddItemForm({ documentId: '', requirementLevel: 'mandatory_for_submission' })
  }

  const handleRemoveItem = async (itemId: string) => {
    await removeItemMutation.mutateAsync({ itemId })
    await utils.registrationDossier.get.invalidate()
    await utils.registrationDossier.getReadiness.invalidate()
  }

  const handleStatusChange = async (itemId: string, status: string) => {
    await updateStatusMutation.mutateAsync({ itemId, status: status as any })
    await utils.registrationDossier.get.invalidate()
    await utils.registrationDossier.getReadiness.invalidate()
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
        Bộ hồ sơ đăng ký
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Quản lý bộ hồ sơ nộp đăng ký thành lập tổ chức KH&CN
      </Typography>

      {!dossier ? (
        <Card>
          <CardContent>
            <Alert severity="info" sx={{ mb: 2 }}>
              Chưa có bộ hồ sơ nào. Tạo bộ hồ sơ mới để bắt đầu.
            </Alert>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              Tạo bộ hồ sơ
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Dossier Info + Readiness */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={4} flexWrap="wrap">
                  <Typography variant="body2"><strong>Mã:</strong> {dossier.code}</Typography>
                  <Typography variant="body2"><strong>Cơ quan:</strong> {dossier.registrationAuthority}</Typography>
                  <Typography variant="body2"><strong>Trạng thái:</strong> {dossier.status}</Typography>
                </Stack>
                {readiness && (
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      Mức độ sẵn sàng: {readiness.ready}/{readiness.total} tài liệu bắt buộc ({readiness.score}%)
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={readiness.score}
                      color={readiness.score >= 100 ? 'success' : readiness.score >= 50 ? 'warning' : 'error'}
                      sx={{ height: 10, borderRadius: 5 }}
                    />
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>

          {/* Items Table */}
          <Card>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6">Danh sách tài liệu</Typography>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAddItemOpen(true)}>
                  Thêm tài liệu
                </Button>
              </Stack>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tài liệu</TableCell>
                      <TableCell>Mức yêu cầu</TableCell>
                      <TableCell>Trạng thái</TableCell>
                      <TableCell align="right">Thao tác</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dossier.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.documentId}</TableCell>
                        <TableCell>
                          {item.requirementLevel === 'mandatory_for_submission' ? 'Bắt buộc' : 'Tham khảo'}
                        </TableCell>
                        <TableCell>
                          <TextField
                            select
                            size="small"
                            value={item.itemStatus}
                            onChange={(e) => handleStatusChange(item.id, e.target.value)}
                            sx={{ minWidth: 130 }}
                          >
                            {Object.entries(STATUS_LABELS).map(([val, label]) => (
                              <MenuItem key={val} value={val}>{label}</MenuItem>
                            ))}
                          </TextField>
                        </TableCell>
                        <TableCell align="right">
                          <IconButton size="small" color="error" onClick={() => handleRemoveItem(item.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    {dossier.items.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center">Chưa có tài liệu nào</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </>
      )}

      {/* Create Dossier Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Tạo bộ hồ sơ mới</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Mã hồ sơ *"
              value={createForm.code}
              onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Cơ quan đăng ký *"
              value={createForm.registrationAuthority}
              onChange={(e) => setCreateForm((f) => ({ ...f, registrationAuthority: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Phương thức nộp"
              value={createForm.submissionMethod}
              onChange={(e) => setCreateForm((f) => ({ ...f, submissionMethod: e.target.value }))}
              fullWidth
              select
            >
              <MenuItem value="direct">Trực tiếp</MenuItem>
              <MenuItem value="postal">Bưu điện</MenuItem>
              <MenuItem value="online">Trực tuyến</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleCreate} disabled={createMutation.isPending}>
            Tạo
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={addItemOpen} onClose={() => setAddItemOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Thêm tài liệu vào hồ sơ</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Mã tài liệu *"
              value={addItemForm.documentId}
              onChange={(e) => setAddItemForm((f) => ({ ...f, documentId: e.target.value }))}
              fullWidth
              placeholder="Nhập ID tài liệu"
            />
            <TextField
              label="Mức yêu cầu"
              value={addItemForm.requirementLevel}
              onChange={(e) => setAddItemForm((f) => ({ ...f, requirementLevel: e.target.value }))}
              fullWidth
              select
            >
              <MenuItem value="mandatory_for_submission">Bắt buộc khi nộp</MenuItem>
              <MenuItem value="mandatory_for_approval">Bắt buộc khi xét duyệt</MenuItem>
              <MenuItem value="optional">Tham khảo</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddItemOpen(false)}>Hủy</Button>
          <Button variant="contained" onClick={handleAddItem} disabled={addItemMutation.isPending}>
            Thêm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
