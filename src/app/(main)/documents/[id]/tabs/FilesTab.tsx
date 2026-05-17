'use client'

import {
  Box,
  Typography,
  Paper,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Stack,
} from '@mui/material'
import CloudUploadIcon from '@mui/icons-material/CloudUpload'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import DownloadIcon from '@mui/icons-material/Download'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'

interface FilesTabProps {
  documentId: string
  fileUrl: string | null
}

export function FilesTab({ documentId, fileUrl }: FilesTabProps) {
  // For now, display the main file attachment from the document
  // Future: support multiple file attachments via a dedicated files table
  const files = fileUrl
    ? [{ name: extractFileName(fileUrl), url: fileUrl }]
    : []

  return (
    <Box>
      {/* Upload button */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h6">
          Tệp đính kèm ({files.length})
        </Typography>
        <Button
          variant="outlined"
          startIcon={<CloudUploadIcon />}
          component="label"
        >
          Tải lên tệp
          <input type="file" hidden aria-label="Chọn tệp để tải lên" />
        </Button>
      </Stack>

      {/* File list */}
      {files.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <FolderOpenIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography color="text.secondary">
            Chưa có tệp đính kèm nào. Nhấn &quot;Tải lên tệp&quot; để thêm tài liệu.
          </Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {files.map((file, index) => (
              <ListItem
                key={index}
                divider={index < files.length - 1}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="Tải xuống"
                    component="a"
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <DownloadIcon />
                  </IconButton>
                }
              >
                <ListItemIcon>
                  <InsertDriveFileIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary={file.name}
                  secondary={file.url}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                  secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  )
}

/** Extract filename from URL or path */
function extractFileName(url: string): string {
  try {
    const parts = url.split('/')
    const filename = parts[parts.length - 1]
    return decodeURIComponent(filename) || 'Tệp đính kèm'
  } catch {
    return 'Tệp đính kèm'
  }
}
