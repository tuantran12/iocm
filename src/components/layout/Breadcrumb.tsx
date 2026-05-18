'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Breadcrumbs, Link as MuiLink, Typography } from '@mui/material'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import HomeIcon from '@mui/icons-material/Home'

/**
 * Vietnamese labels for static route segments.
 * Dynamic detail routes that need entity names should render their own breadcrumb
 * inside the page after the entity has been loaded.
 */
const segmentLabels: Record<string, string> = {
  dashboard: 'Tổng quan',
  founding: 'Thành lập Viện',
  documents: 'Tài liệu',
  'legal-basis': 'Căn cứ pháp lý',
  members: 'Hội viên',
  groups: 'Nhóm',
  partners: 'Đối tác',
  agreements: 'Hợp đồng',
  products: 'Sản phẩm',
  projects: 'Dự án',
  data: 'Dữ liệu',
  finance: 'Tài chính',
  events: 'Sự kiện',
  tasks: 'Công việc',
  audit: 'Kiểm toán',
  'audit-logs': 'Kiểm toán',
  reports: 'Báo cáo',
  settings: 'Cài đặt',
  notifications: 'Thông báo',
  new: 'Tạo mới',
  edit: 'Chỉnh sửa',
  applications: 'Đơn gia nhập',
  tiers: 'Cấp hội viên',
  fees: 'Phí thường niên',
  catalog: 'Danh mục',
  consent: 'Đồng ý',
  requests: 'Yêu cầu',
  sponsorships: 'Tài trợ',
  'due-diligence': 'Thẩm định',
  kpis: 'Chỉ số KPI',
  roles: 'Vai trò',
  retention: 'Lưu trữ',
  profile: 'Hồ sơ',
  decisions: 'Quyết định',
  files: 'Tệp tin',
}

function getLabel(segment: string): string {
  return segmentLabels[segment] || segment
}

function shouldHideGenericBreadcrumb(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)

  // Entity detail pages render their own breadcrumb once data is loaded.
  // Rendering the generic breadcrumb here would expose raw ids like `cmpawsj...`.
  if (segments[0] === 'documents' && segments.length >= 2 && segments[1] !== 'new') {
    return true
  }

  return false
}

export function Breadcrumb() {
  const pathname = usePathname()

  if (pathname === '/dashboard' || pathname === '/' || shouldHideGenericBreadcrumb(pathname)) {
    return null
  }

  const segments = pathname.split('/').filter(Boolean)

  const items = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const isLast = index === segments.length - 1
    const label = getLabel(segment)

    if (isLast) {
      return (
        <Typography
          key={href}
          color="text.primary"
          sx={{ fontSize: '0.875rem', fontWeight: 500 }}
        >
          {label}
        </Typography>
      )
    }

    return (
      <MuiLink
        key={href}
        component={Link}
        href={href}
        underline="hover"
        color="text.secondary"
        sx={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center' }}
      >
        {index === 0 && <HomeIcon sx={{ mr: 0.5, fontSize: '1rem' }} />}
        {label}
      </MuiLink>
    )
  })

  return (
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
      {items}
    </Breadcrumbs>
  )
}
