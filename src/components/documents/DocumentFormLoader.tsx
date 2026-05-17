'use client'

import { Box, CircularProgress, Alert } from '@mui/material'
import { trpc } from '@/lib/trpc'
import { DocumentForm } from './DocumentForm'

interface DocumentFormLoaderProps {
  documentId: string
}

/**
 * Loads document data from the server and renders the DocumentForm in edit mode.
 */
export function DocumentFormLoader({ documentId }: DocumentFormLoaderProps) {
  const { data: document, isLoading, error } = trpc.documents.get.useQuery(
    { id: documentId },
    { staleTime: 30_000 }
  )

  const { data: users = [] } = trpc.users.search.useQuery(undefined, {
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error">
        Không thể tải tài liệu: {error.message}
      </Alert>
    )
  }

  if (!document) {
    return <Alert severity="warning">Không tìm thấy tài liệu</Alert>
  }

  // Find user objects for autocomplete initial values
  const owner = document.ownerId
    ? users.find((u) => u.id === document.ownerId) ?? null
    : null
  const reviewer = document.reviewerId
    ? users.find((u) => u.id === document.reviewerId) ?? null
    : null
  const approver = document.approverId
    ? users.find((u) => u.id === document.approverId) ?? null
    : null

  return (
    <DocumentForm
      documentId={documentId}
      initialData={{
        name: document.name,
        type: document.type,
        cluster: document.cluster,
        priority: document.priority,
        confidentiality: document.confidentiality,
        deadline: document.deadline ? new Date(document.deadline) : null,
        effectiveDate: document.effectiveDate ? new Date(document.effectiveDate) : null,
        expiryDate: document.expiryDate ? new Date(document.expiryDate) : null,
        riskIfMissing: document.riskIfMissing ?? '',
        ownerId: document.ownerId,
        reviewerId: document.reviewerId,
        approverId: document.approverId,
        owner,
        reviewer,
        approver,
      }}
    />
  )
}
