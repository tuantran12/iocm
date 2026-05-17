'use client'

import { useState } from 'react'
import {
  Box,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material'
import { DataGrid, type GridColDef } from '@mui/x-data-grid'
import { trpc } from '@/lib/trpc'
import { CreateUserDialog } from './CreateUserDialog'
import { AssignRoleDialog } from './AssignRoleDialog'

/**
 * User Management page — System_Admin only.
 * Lists all users, allows creating new users and assigning/removing roles.
 */
export default function UserManagementPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [assignRoleOpen, setAssignRoleOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  const usersQuery = trpc.users.list.useQuery()
  const deleteUser = trpc.users.delete.useMutation({
    onSuccess: () => usersQuery.refetch(),
  })
  const removeRole = trpc.users.removeRole.useMutation({
    onSuccess: () => usersQuery.refetch(),
  })

  const handleDelete = (userId: string, userName: string) => {
    if (confirm(`Bạn có chắc muốn vô hiệu hóa tài khoản "${userName}"?`)) {
      deleteUser.mutate({ id: userId })
    }
  }

  const handleRemoveRole = (userRoleId: string, roleName: string) => {
    if (confirm(`Xóa vai trò "${roleName}" khỏi người dùng này?`)) {
      removeRole.mutate({ userRoleId })
    }
  }

  const handleAssignRole = (userId: string) => {
    setSelectedUserId(userId)
    setAssignRoleOpen(true)
  }

  const columns: GridColDef[] = [
    {
      field: 'name',
      headerName: 'Họ tên',
      flex: 1,
      minWidth: 150,
    },
    {
      field: 'email',
      headerName: 'Email',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'roles',
      headerName: 'Vai trò',
      flex: 2,
      minWidth: 250,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', py: 0.5 }}>
          {params.value?.map((role: { id: string; roleName: string }) => (
            <Chip
              key={role.id}
              label={role.roleName}
              size="small"
              color="primary"
              variant="outlined"
              onDelete={() => handleRemoveRole(role.id, role.roleName)}
            />
          ))}
        </Box>
      ),
    },
    {
      field: 'status',
      headerName: 'Trạng thái',
      width: 130,
      renderCell: (params) => {
        const statusMap: Record<string, { label: string; color: 'success' | 'warning' | 'error' }> = {
          ACTIVE: { label: 'Hoạt động', color: 'success' },
          SUSPENDED: { label: 'Tạm khóa', color: 'warning' },
          DEACTIVATED: { label: 'Vô hiệu', color: 'error' },
        }
        const s = statusMap[params.value] ?? { label: params.value, color: 'warning' as const }
        return <Chip label={s.label} size="small" color={s.color} />
      },
    },
    {
      field: 'actions',
      headerName: 'Thao tác',
      width: 140,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Box>
          <Tooltip title="Gán vai trò">
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleAssignRole(params.row.id)}
            >
              <PersonAddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Vô hiệu hóa">
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDelete(params.row.id, params.row.name)}
              disabled={params.row.status === 'DEACTIVATED'}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ]

  const rows = usersQuery.data ?? []

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>
          Quản lý người dùng
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          Tạo người dùng
        </Button>
      </Box>

      {deleteUser.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {deleteUser.error.message}
        </Alert>
      )}

      <DataGrid
        rows={rows}
        columns={columns}
        loading={usersQuery.isLoading}
        autoHeight
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: { paginationModel: { pageSize: 10 } },
        }}
        disableRowSelectionOnClick
        getRowHeight={() => 'auto'}
        sx={{
          '& .MuiDataGrid-cell': {
            alignItems: 'center',
            py: 1,
          },
        }}
      />

      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false)
          usersQuery.refetch()
        }}
      />

      <AssignRoleDialog
        open={assignRoleOpen}
        userId={selectedUserId}
        onClose={() => {
          setAssignRoleOpen(false)
          setSelectedUserId(null)
        }}
        onSuccess={() => {
          setAssignRoleOpen(false)
          setSelectedUserId(null)
          usersQuery.refetch()
        }}
      />
    </Box>
  )
}
