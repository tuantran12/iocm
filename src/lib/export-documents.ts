import ExcelJS from 'exceljs'
import { format } from 'date-fns'

/**
 * Vietnamese labels for document status
 */
const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Chưa bắt đầu',
  DRAFTING: 'Đang soạn thảo',
  NEEDS_INFO: 'Cần bổ sung',
  IN_REVIEW: 'Đang xem xét',
  PENDING_APPROVAL: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  ARCHIVED: 'Lưu trữ',
  EXPIRED: 'Hết hiệu lực',
}

/**
 * Vietnamese labels for document cluster
 */
const CLUSTER_LABELS: Record<string, string> = {
  CORE_FOUNDING: 'Hồ sơ thành lập',
  REGULATIONS: 'Quy chế/Quy trình',
  PERSONNEL: 'Nhân sự',
  PARTNERSHIP: 'Đối tác',
  CONTRACTS: 'Hợp đồng',
  TECHNOLOGY: 'Công nghệ',
  DATA: 'Dữ liệu',
  PILOT: 'Triển khai thí điểm',
  FINANCE: 'Tài chính',
  SECURITY: 'Bảo mật',
  REPORTING: 'Báo cáo',
}

/**
 * Vietnamese labels for priority
 */
const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  CRITICAL: 'Rất cao',
}

/**
 * Vietnamese labels for approval status (same as document status for now)
 */
const APPROVAL_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Chưa gửi',
  DRAFTING: 'Đang soạn',
  NEEDS_INFO: 'Cần bổ sung',
  IN_REVIEW: 'Đang xem xét',
  PENDING_APPROVAL: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  ARCHIVED: 'Lưu trữ',
  EXPIRED: 'Hết hiệu lực',
}

/**
 * Column definitions for the export
 */
const COLUMNS = [
  { header: 'Mã tài liệu', key: 'code', width: 18 },
  { header: 'Nhóm tài liệu', key: 'cluster', width: 22 },
  { header: 'Tên tài liệu', key: 'name', width: 40 },
  { header: 'Loại', key: 'type', width: 18 },
  { header: 'Trạng thái', key: 'status', width: 18 },
  { header: 'Hoàn thiện (%)', key: 'completenessScore', width: 16 },
  { header: 'Ưu tiên', key: 'priority', width: 14 },
  { header: 'Hạn chót', key: 'deadline', width: 14 },
  { header: 'Người phụ trách', key: 'ownerId', width: 20 },
  { header: 'Phê duyệt', key: 'approvalStatus', width: 18 },
] as const

export interface DocumentExportRow {
  id: string
  code: string
  name: string
  type: string
  cluster: string
  status: string
  completenessScore: number
  priority: string
  deadline: Date | string | null
  ownerId: string | null
  approverId: string | null
}

/**
 * Format a date value to dd/MM/yyyy string
 */
function formatDate(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = typeof value === 'string' ? new Date(value) : value
  if (isNaN(date.getTime())) return ''
  return format(date, 'dd/MM/yyyy')
}

/**
 * Get Vietnamese label for a status value
 */
function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

/**
 * Get Vietnamese label for a cluster value
 */
function getClusterLabel(cluster: string): string {
  return CLUSTER_LABELS[cluster] ?? cluster
}

/**
 * Get Vietnamese label for priority
 */
function getPriorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? priority
}

/**
 * Derive approval status from document status
 */
function getApprovalStatusLabel(status: string): string {
  return APPROVAL_STATUS_LABELS[status] ?? status
}

/**
 * Export documents to Excel (.xlsx) using ExcelJS.
 * Returns a Buffer containing the workbook.
 */
export async function exportToExcel(documents: DocumentExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'IOCM - Viện Nghiên cứu'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet('Ma trận tài liệu', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  // Set columns
  worksheet.columns = COLUMNS.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width,
  }))

  // Style header row
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, size: 11 }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1976D2' },
  }
  headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  headerRow.height = 24

  // Add data rows
  for (const doc of documents) {
    worksheet.addRow({
      code: doc.code,
      cluster: getClusterLabel(doc.cluster),
      name: doc.name,
      type: doc.type,
      status: getStatusLabel(doc.status),
      completenessScore: Math.round(doc.completenessScore * 100),
      priority: getPriorityLabel(doc.priority),
      deadline: formatDate(doc.deadline),
      ownerId: doc.ownerId ?? '',
      approvalStatus: getApprovalStatusLabel(doc.status),
    })
  }

  // Style data rows
  for (let i = 2; i <= documents.length + 1; i++) {
    const row = worksheet.getRow(i)
    row.alignment = { vertical: 'middle', wrapText: true }

    // Alternate row colors
    if (i % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F5F5' },
      }
    }
  }

  // Add borders to all cells
  const lastRow = documents.length + 1
  const lastCol = COLUMNS.length
  for (let r = 1; r <= lastRow; r++) {
    for (let c = 1; c <= lastCol; c++) {
      const cell = worksheet.getCell(r, c)
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Export documents to PDF using @react-pdf/renderer.
 * Returns a Buffer containing the PDF.
 */
export async function exportToPdf(documents: DocumentExportRow[]): Promise<Buffer> {
  // Dynamic import to avoid SSR issues with react-pdf
  const { Document, Page, Text, View, StyleSheet, renderToBuffer } = await import('@react-pdf/renderer')
  const { createElement } = await import('react')

  const styles = StyleSheet.create({
    page: {
      padding: 30,
      fontSize: 8,
      fontFamily: 'Helvetica',
    },
    title: {
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 9,
      textAlign: 'center',
      marginBottom: 12,
      color: '#666666',
    },
    table: {
      width: '100%',
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: '#cccccc',
      minHeight: 18,
      alignItems: 'center',
    },
    tableRowAlt: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: '#cccccc',
      minHeight: 18,
      alignItems: 'center',
      backgroundColor: '#f9f9f9',
    },
    tableHeader: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#1976d2',
      minHeight: 22,
      alignItems: 'center',
      backgroundColor: '#1976d2',
    },
    headerCell: {
      color: '#ffffff',
      fontWeight: 'bold',
      fontSize: 7,
      padding: 3,
    },
    cell: {
      fontSize: 7,
      padding: 3,
    },
    // Column widths (percentage-based)
    col1: { width: '10%' },
    col2: { width: '12%' },
    col3: { width: '22%' },
    col4: { width: '8%' },
    col5: { width: '10%' },
    col6: { width: '7%' },
    col7: { width: '7%' },
    col8: { width: '9%' },
    col9: { width: '8%' },
    col10: { width: '7%' },
    footer: {
      position: 'absolute',
      bottom: 20,
      left: 30,
      right: 30,
      fontSize: 7,
      color: '#999999',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  })

  const colStyles = [
    styles.col1, styles.col2, styles.col3, styles.col4, styles.col5,
    styles.col6, styles.col7, styles.col8, styles.col9, styles.col10,
  ]

  const headers = [
    'Mã', 'Nhóm', 'Tên tài liệu', 'Loại', 'Trạng thái',
    'HT (%)', 'Ưu tiên', 'Hạn chót', 'Phụ trách', 'Phê duyệt',
  ]

  // Build rows data
  const rows = documents.map((doc) => [
    doc.code,
    getClusterLabel(doc.cluster),
    doc.name,
    doc.type,
    getStatusLabel(doc.status),
    `${Math.round(doc.completenessScore * 100)}%`,
    getPriorityLabel(doc.priority),
    formatDate(doc.deadline),
    doc.ownerId ?? '',
    getApprovalStatusLabel(doc.status),
  ])

  const exportDate = format(new Date(), 'dd/MM/yyyy HH:mm')

  // Create PDF document using createElement (no JSX in .ts files)
  const h = createElement

  const pdfDoc = h(Document, null,
    h(Page, { size: 'A4', orientation: 'landscape', style: styles.page },
      // Title
      h(Text, { style: styles.title }, 'MA TRẬN TÀI LIỆU TỔNG THỂ'),
      h(Text, { style: styles.subtitle }, `Viện Nghiên cứu — Xuất ngày ${exportDate} — Tổng: ${documents.length} tài liệu`),
      // Table
      h(View, { style: styles.table },
        // Header row
        h(View, { style: styles.tableHeader },
          ...headers.map((header, i) =>
            h(Text, { key: `h-${i}`, style: { ...styles.headerCell, ...colStyles[i] } }, header)
          )
        ),
        // Data rows
        ...rows.map((row, rowIdx) =>
          h(View, {
            key: `r-${rowIdx}`,
            style: rowIdx % 2 === 0 ? styles.tableRow : styles.tableRowAlt,
          },
            ...row.map((cell, colIdx) =>
              h(Text, { key: `c-${rowIdx}-${colIdx}`, style: { ...styles.cell, ...colStyles[colIdx] } }, cell)
            )
          )
        )
      ),
      // Footer
      h(View, { style: styles.footer },
        h(Text, null, 'IOCM - Hệ thống Quản trị Viện'),
        h(Text, null, `Trang 1`)
      )
    )
  )

  const buffer = await renderToBuffer(pdfDoc)
  return Buffer.from(buffer)
}
