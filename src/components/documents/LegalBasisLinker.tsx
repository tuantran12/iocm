'use client'

import { useState } from 'react'
import {
  Autocomplete,
  Box,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Snackbar,
  Alert,
  TextField,
  Typography,
  Divider,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import LinkIcon from '@mui/icons-material/Link'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import GavelIcon from '@mui/icons-material/Gavel'
import { trpc } from '@/lib/trpc'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LegalBasisOption {
  id: string
  documentNumber: string
  title: string
  status: string
  basisType: string
  issuingAuth: string
}

interface LinkedLegalBasis {
  id: string
  legalBasisId: string
  legalBasis: {
    id: string
    documentNumber: string
    title: string
    status: string
  }
}

interface LegalBasisLinkerProps {
  documentId: string
  linkedBases: LinkedLegalBasis[]
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  ACTIVE: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'error',
  SUPERSEDED: 'default',
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Hiệu lực',
  EXPIRING: 'Sắp hết hạn',
  EXPIRED: 'Hết hạn',
  SUPERSEDED: 'Thay thế',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LegalBasisLinker({ documentId, linkedBases }: LegalBasisLinkerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedOption, setSelectedOption] = useState<LegalBasisOption | null>(null)
  const [snackbar, setSnackbar] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error'
  }>({ open: false, message: '', severity: 'success' })

  const utils = trpc.useUtils()

  // Search legal bases for autocomplete
  const { data: searchResults = [], isLoading: isSearching } = trpc.legalBasis.search.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: searchQuery.length >= 1 }
  )

  // Filter out already-linked bases from search results
  const linkedIds = new Set(linkedBases.map((lb) => lb.legalBasisId))
  const filteredResults = searchResults.filter((r) => !linkedIds.has(r.id))

  // Link mutation
  const linkMutation = trpc.legalBasis.linkToDocument.useMutation({
    onSuccess: () => {
      setSnackbar({ open: true, message: 'Đã liên kết căn cứ pháp lý', severity: 'success' })
      setSelectedOption(null)
      setSearchQuery('')
      utils.documents.get.invalidate({ id: documentId })
    },
    onError: (err) => {
      setSnackbar({ open: true, message: err.message || 'Lỗi khi liên kết', severity: 'error' })
    },
  })

  // Unlink mutation
  const unlinkMutation = trpc.legalBasis.unlinkFromDocument.useMutation({
    onSuccess: () => {
      setSnackbar({ open: true, message: 'Đã hủy liên kết', severity: 'success' })
      utils.documents.get.invalidate({ id: documentId })
    },
    onError: (err) => {
      setSnackbar({ open: true, message: err.message || 'Lỗi khi hủy liên kết', severity: 'error' })
    },
  })

  const handleLink = (option: LegalBasisOption | null) => {
    if (!option) return
    linkMutation.mutate({ legalBasisId: option.id, documentId })
  }

  const handleUnlink = (legalBasisId: string) => {
    unlinkMutation.mutate({ legalBasisId, documentId })
  }

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <GavelIcon fontSize="small" />
        Liên kết căn cứ pháp lý
      </Typography>
      <Divider sx={{ mb: 2 }} />

      {/* Autocomplete search */}
      <Autocomplete
        options={filteredResults}
        value={selectedOption}
        onChange={(_, newValue) => {
          setSelectedOption(newValue)
          handleLink(newValue)
        }}
        onInputChange={(_, value) => setSearchQuery(value)}
        getOptionLabel={(option) => `${option.documentNumber} — ${option.title}`}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        loading={isSearching}
        noOptionsText={searchQuery.length < 1 ? 'Nhập để tìm kiếm...' : 'Không tìm thấy'}
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.id}>
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              <Typography variant="body2" fontWeight={500}>
                {option.documentNumber}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {option.title}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                <Chip
                  label={STATUS_LABEL[option.status] ?? option.status}
                  color={STATUS_COLOR[option.status] ?? 'default'}
                  size="small"
                  variant="outlined"
                />
                <Chip label={option.basisType} size="small" variant="outlined" />
              </Box>
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Tìm căn cứ pháp lý..."
            placeholder="Nhập số hiệu hoặc tên văn bản..."
            size="small"
            slotProps={{
              input: {
                ...params.InputProps,
                startAdornment: (
                  <>
                    <LinkIcon sx={{ color: 'action.active', mr: 1 }} fontSize="small" />
                    {params.InputProps.startAdornment}
                  </>
                ),
              },
            }}
          />
        )}
        disabled={linkMutation.isPending}
        sx={{ mb: 2 }}
      />

      {/* Linked legal bases list */}
      {linkedBases.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          Chưa có căn cứ pháp lý nào được liên kết.
        </Typography>
      ) : (
        <List dense disablePadding>
          {linkedBases.map((link) => (
            <ListItem
              key={link.id}
              secondaryAction={
                <Tooltip title="Hủy liên kết">
                  <IconButton
                    edge="end"
                    aria-label="Hủy liên kết"
                    onClick={() => handleUnlink(link.legalBasisId)}
                    disabled={unlinkMutation.isPending}
                    size="small"
                    color="error"
                  >
                    {unlinkMutation.isPending ? (
                      <CircularProgress size={16} />
                    ) : (
                      <LinkOffIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              }
              sx={{
                borderRadius: 1,
                mb: 0.5,
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <ListItemText
                primary={link.legalBasis.documentNumber}
                secondary={link.legalBasis.title}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
              />
              <Chip
                label={STATUS_LABEL[link.legalBasis.status] ?? link.legalBasis.status}
                color={STATUS_COLOR[link.legalBasis.status] ?? 'default'}
                size="small"
                variant="outlined"
                sx={{ mr: 1 }}
              />
            </ListItem>
          ))}
        </List>
      )}

      {/* Snackbar feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Paper>
  )
}
