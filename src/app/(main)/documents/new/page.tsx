'use client'

import { Box, Typography } from '@mui/material'
import { DocumentForm } from '@/components/documents/DocumentForm'

export default function DocumentCreatePage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Tạo tài liệu mới
      </Typography>
      <DocumentForm />
    </Box>
  )
}
