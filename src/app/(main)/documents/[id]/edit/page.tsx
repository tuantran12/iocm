'use client'

import { use } from 'react'
import { Box, Typography, CircularProgress, Alert } from '@mui/material'
import { DocumentFormLoader } from '@/components/documents/DocumentFormLoader'

interface EditDocumentPageProps {
  params: Promise<{ id: string }>
}

export default function EditDocumentPage({ params }: EditDocumentPageProps) {
  const { id } = use(params)

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Chỉnh sửa tài liệu
      </Typography>
      <DocumentFormLoader documentId={id} />
    </Box>
  )
}
