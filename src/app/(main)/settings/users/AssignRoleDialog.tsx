'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  Autocomplete,
  TextField,
  Box,
} from '@mui/material'
import { trpc } from '@/lib/trpc'

interface AssignRoleDialogProps {
  open: boolean
  userId: string | null
  onClose: () => void
  onSuccess: () => void
}

/**
 * Dialog for assigning roles to a user.
 * Multi-select from available roles that the user doesn't already have.
 */
export function AssignRoleDialog({ open, userId, onClose, onSuccess }: AssignRoleDialogProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rolesQuery = trpc.users.listRoles.useQuery(undefined, { enabled: open })
  const assignRole = trpc.users.assignRole.useMutation({
    onSuccess: () => {
      setSelectedRoleId(null)
      setError(null)
      onSuccess()
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const handleClose = () => {
    setSelectedRoleId(null)
    setError(null)
    onClose()
  }

  const handleSubmit = () => {
    if (!userId || !selectedRoleId) {
      setError('Vui lòng chọn vai trò')
      return
    }

    setError(null)
    assignRole.mutate({
      userId,
      roleId: selectedRoleId,
      scope: 'org',
    })
  }

  const roles = rolesQuery.data ?? []

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Gán vai trò</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Autocomplete
            options={roles}
            getOptionLabel={(option) => option.name}
            value={roles.find((r) => r.id === selectedRoleId) ?? null}
            onChange={(_, newValue) => {
              setSelectedRoleId(newValue?.id ?? null)
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Chọn vai trò"
                placeholder="Tìm vai trò..."
                autoFocus
              />
            )}
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
          variant="contained"
          onClick={handleSubmit}
          disabled={!selectedRoleId || assignRole.isPending}
        >
          {assignRole.isPending ? 'Đang gán...' : 'Gán vai trò'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
