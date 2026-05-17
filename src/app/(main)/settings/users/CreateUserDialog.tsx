'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Autocomplete,
  Chip,
  Box,
} from '@mui/material'
import { trpc } from '@/lib/trpc'

interface CreateUserDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

/**
 * Dialog for creating a new user.
 * Includes name, email, password fields and multi-select role assignment.
 */
export function CreateUserDialog({ open, onClose, onSuccess }: CreateUserDialogProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const rolesQuery = trpc.users.listRoles.useQuery(undefined, { enabled: open })
  const createUser = trpc.users.create.useMutation({
    onSuccess: () => {
      resetForm()
      onSuccess()
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const resetForm = () => {
    setName('')
    setEmail('')
    setPassword('')
    setPhone('')
    setSelectedRoleIds([])
    setError(null)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Vui lòng nhập họ tên')
      return
    }
    if (!email.trim()) {
      setError('Vui lòng nhập email')
      return
    }
    if (!password.trim() || password.length < 8) {
      setError('Mật khẩu phải có ít nhất 8 ký tự')
      return
    }

    createUser.mutate({
      name: name.trim(),
      email: email.trim(),
      password,
      phone: phone.trim() || undefined,
      roleIds: selectedRoleIds.length > 0 ? selectedRoleIds : undefined,
    })
  }

  const roles = rolesQuery.data ?? []

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Tạo người dùng mới</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="Họ tên"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              autoFocus
            />

            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
            />

            <TextField
              label="Mật khẩu"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              helperText="Ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số"
            />

            <TextField
              label="Số điện thoại"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
            />

            <Autocomplete
              multiple
              options={roles}
              getOptionLabel={(option) => option.name}
              value={roles.filter((r) => selectedRoleIds.includes(r.id))}
              onChange={(_, newValue) => {
                setSelectedRoleIds(newValue.map((v) => v.id))
              }}
              renderInput={(params) => (
                <TextField {...params} label="Vai trò" placeholder="Chọn vai trò..." />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={option.id}
                    label={option.name}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))
              }
              loading={rolesQuery.isLoading}
              noOptionsText="Không có vai trò nào"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} color="inherit">
            Hủy
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={createUser.isPending}
          >
            {createUser.isPending ? 'Đang tạo...' : 'Tạo'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
