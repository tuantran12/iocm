'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Chip,
  Button,
  Stack,
  Skeleton,
  Breadcrumbs,
  Link as MuiLink,
} from '@mui/material'
import Link from 'next/link'
import EditIcon from '@mui/icons-material/Edit'
import SendIcon from '@mui/icons-material/Send'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import HomeIcon from '@mui/icons-material/Home'
import { trpc } from '@/lib/trpc'
import { DocumentInfoTab } from './tabs/DocumentInfoTab'
import { CompletenessTab } from './tabs/CompletenessTab'
import { VersionsTab } from './tabs/VersionsTab'
import { CommentsTab } from './tabs/CommentsTab'
import { FilesTab } from './tabs/FilesTab'

/** Map document status to Vietnamese label and color */
const STATUS_MAP: Record<string, { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' | 'primary' | 'secondary' }> = {
  NOT_STARTED: { label: 'Chưa bắt đầu', color: 'default' },
  DRAFTING: { label: 'Đang soạn thảo', color: 'info' },
  NEEDS_INFO: { label: 'Cần bổ sung', color: 'warning' },
  IN_REVIEW: { label: 'Đang xem xét', color: 'secondary' },
  PENDING_APPROVAL: { label: 'Chờ phê duyệt', color: 'primary' },
  APPROVED: { label: 'Đã phê duyệt', color: 'success' },
  ARCHIVED: { label: 'Đã lưu trữ', color: 'default' },
  EXPIRED: { label: 'Hết hiệu lực', color: 'error' },
}

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`document-tabpanel-${index}`}
      aria-labelledby={`document-tab-${index}`}
      sx={{ pt: 3 }}
    >
      {value === index && children}
    </Box>
  )
}

export default function DocumentDetailPage() {
  const params = useParams()
  const documentId = params.id as string
  const [tabValue, setTabValue] = useState(0)

  const { data: document, isLoading, error } = trpc.documents.get.useQuery(
    { id: documentId },
    { enabled: !!documentId }
  )

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="text" width={200} height={30} />
        <Skeleton variant="rectangular" height={400} sx={{ mt: 2, borderRadius: 2 }} />
      </Box>
    )
  }

  if (error || !document) {
    return (
      <Box>
        <Typography color="error" variant="h6">
          Không tìm thấy tài liệu
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          Tài liệu không tồn tại hoặc bạn không có quyền truy cập.
        </Typography>
        <Button component={Link} href="/documents" sx={{ mt: 2 }}>
          Quay lại danh sách
        </Button>
      </Box>
    )
  }

  const statusInfo = STATUS_MAP[document.status] ?? { label: document.status, color: 'default' as const }

  // Determine which action buttons to show based on document state
  const showEdit = document.status !== 'APPROVED' && document.status !== 'ARCHIVED'
  const showSubmitForReview = document.status === 'DRAFTING' || document.status === 'NEEDS_INFO'
  const showApprove = document.status === 'PENDING_APPROVAL'

  return (
    <Box>
      {/* Breadcrumb */}
      <Breadcrumbs
        separator={<NavigateNextIcon fontSize="small" />}
        aria-label="breadcrumb"
        sx={{ mb: 2 }}
      >
        <MuiLink
          component={Link}
          href="/dashboard"
          underline="hover"
          color="text.secondary"
          sx={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center' }}
        >
          <HomeIcon sx={{ mr: 0.5, fontSize: '1rem' }} />
          Trang chủ
        </MuiLink>
        <MuiLink
          component={Link}
          href="/documents"
          underline="hover"
          color="text.secondary"
          sx={{ fontSize: '0.875rem' }}
        >
          Tài liệu
        </MuiLink>
        <Typography color="text.primary" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
          {document.name}
        </Typography>
      </Breadcrumbs>

      {/* Header: Title + Status + Actions */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="h4" component="h1">
              {document.name}
            </Typography>
            <Chip
              label={statusInfo.label}
              color={statusInfo.color}
              size="small"
            />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Mã: {document.code} • Phiên bản: {document.version}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
          {showEdit && (
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              size="small"
            >
              Chỉnh sửa
            </Button>
          )}
          {showSubmitForReview && (
            <Button
              variant="contained"
              color="secondary"
              startIcon={<SendIcon />}
              size="small"
            >
              Gửi xem xét
            </Button>
          )}
          {showApprove && (
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircleIcon />}
              size="small"
            >
              Phê duyệt
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          aria-label="Thông tin tài liệu"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Thông tin" id="document-tab-0" aria-controls="document-tabpanel-0" />
          <Tab label="Hoàn thiện" id="document-tab-1" aria-controls="document-tabpanel-1" />
          <Tab label="Phiên bản" id="document-tab-2" aria-controls="document-tabpanel-2" />
          <Tab label="Bình luận" id="document-tab-3" aria-controls="document-tabpanel-3" />
          <Tab label="Tệp đính kèm" id="document-tab-4" aria-controls="document-tabpanel-4" />
        </Tabs>
      </Box>

      {/* Tab Panels */}
      <TabPanel value={tabValue} index={0}>
        <DocumentInfoTab document={document} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <CompletenessTab documentId={documentId} />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <VersionsTab documentId={documentId} />
      </TabPanel>
      <TabPanel value={tabValue} index={3}>
        <CommentsTab documentId={documentId} />
      </TabPanel>
      <TabPanel value={tabValue} index={4}>
        <FilesTab documentId={documentId} fileUrl={document.fileUrl} />
      </TabPanel>
    </Box>
  )
}
