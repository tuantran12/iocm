'use client'

import { useState, lazy, Suspense } from 'react'
import { Box, Tabs, Tab, Typography, Skeleton } from '@mui/material'

// Lazy load tab content to keep bundle light
const DashboardTab = lazy(() => import('./tabs/DashboardTab'))
const InstituteProfileTab = lazy(() => import('./tabs/InstituteProfileTab'))
const DocumentsTab = lazy(() => import('./tabs/DocumentsTab'))
const LegalBasisTab = lazy(() => import('./tabs/LegalBasisTab'))
const PersonnelTab = lazy(() => import('./tabs/PersonnelTab'))
const PremisesTab = lazy(() => import('./tabs/PremisesTab'))
const FacilitiesTab = lazy(() => import('./tabs/FacilitiesTab'))
const DossierTab = lazy(() => import('./tabs/DossierTab'))
const SubmissionsTab = lazy(() => import('./tabs/SubmissionsTab'))

const TABS = [
  { label: 'Tổng quan', id: 'dashboard' },
  { label: 'Hồ sơ Viện', id: 'profile' },
  { label: 'Tài liệu', id: 'documents' },
  { label: 'Pháp lý', id: 'legal' },
  { label: 'Nhân sự', id: 'personnel' },
  { label: 'Trụ sở', id: 'premises' },
  { label: 'CSVC', id: 'facilities' },
  { label: 'Hồ sơ nộp', id: 'dossier' },
  { label: 'Theo dõi', id: 'submissions' },
]

function TabFallback() {
  return <Skeleton variant="rounded" height={400} sx={{ mt: 2 }} />
}

export default function FoundingPage() {
  const [tab, setTab] = useState(0)

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>
        Thành lập Viện
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          aria-label="Các bước thành lập Viện"
        >
          {TABS.map((t, i) => (
            <Tab key={t.id} label={t.label} id={`founding-tab-${i}`} aria-controls={`founding-panel-${i}`} />
          ))}
        </Tabs>
      </Box>

      <Suspense fallback={<TabFallback />}>
        {tab === 0 && <DashboardTab />}
        {tab === 1 && <InstituteProfileTab />}
        {tab === 2 && <DocumentsTab />}
        {tab === 3 && <LegalBasisTab />}
        {tab === 4 && <PersonnelTab />}
        {tab === 5 && <PremisesTab />}
        {tab === 6 && <FacilitiesTab />}
        {tab === 7 && <DossierTab />}
        {tab === 8 && <SubmissionsTab />}
      </Suspense>
    </Box>
  )
}
