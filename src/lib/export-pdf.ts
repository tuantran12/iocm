import { format } from 'date-fns'

/**
 * A section in the PDF report containing a title and table data.
 */
export interface ReportSection {
  /** Section title */
  title: string
  /** Table column headers */
  headers: string[]
  /** Table rows (each row is an array of cell values) */
  rows: string[][]
}

/**
 * Options for PDF report generation
 */
export interface PDFReportOptions {
  /** Organization name shown in header */
  orgName?: string
  /** Subtitle or description */
  subtitle?: string
  /** Page orientation */
  orientation?: 'portrait' | 'landscape'
  /** Page size */
  pageSize?: 'A4' | 'A3' | 'LETTER'
}

const DEFAULT_PDF_OPTIONS: Required<PDFReportOptions> = {
  orgName: 'VIỆN NGHIÊN CỨU ỨNG DỤNG CÔNG NGHỆ VÀ ĐỔI MỚI SÁNG TẠO',
  subtitle: '',
  orientation: 'landscape',
  pageSize: 'A4',
}

/**
 * Generate a PDF report blob using @react-pdf/renderer.
 * Uses dynamic import to avoid Next.js SSR issues.
 *
 * @param title - Report title
 * @param sections - Array of report sections (each with title, headers, rows)
 * @param options - Optional configuration
 * @returns PDF as a Blob for browser download
 */
export async function generateReportPDF(
  title: string,
  sections: ReportSection[],
  options?: PDFReportOptions
): Promise<Blob> {
  const { Document, Page, Text, View, StyleSheet, pdf } = await import(
    '@react-pdf/renderer'
  )
  const { createElement } = await import('react')
  const h = createElement

  const opts = { ...DEFAULT_PDF_OPTIONS, ...options }
  const exportDate = format(new Date(), 'dd/MM/yyyy HH:mm')

  const styles = StyleSheet.create({
    page: {
      padding: 30,
      fontSize: 8,
      fontFamily: 'Helvetica',
    },
    brandHeader: {
      borderBottomWidth: 2,
      borderBottomColor: '#1976d2',
      paddingBottom: 8,
      marginBottom: 12,
    },
    orgName: {
      fontSize: 10,
      fontWeight: 'bold',
      color: '#1976d2',
      textAlign: 'center',
    },
    reportTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'center',
      marginTop: 6,
    },
    subtitle: {
      fontSize: 9,
      textAlign: 'center',
      color: '#666666',
      marginTop: 3,
    },
    exportInfo: {
      fontSize: 7,
      textAlign: 'right',
      color: '#999999',
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: 'bold',
      marginTop: 14,
      marginBottom: 6,
      color: '#333333',
      borderBottomWidth: 0.5,
      borderBottomColor: '#1976d2',
      paddingBottom: 3,
    },
    table: {
      width: '100%',
      marginBottom: 10,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: '#1976d2',
      minHeight: 20,
      alignItems: 'center',
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: '#e0e0e0',
      minHeight: 16,
      alignItems: 'center',
    },
    tableRowAlt: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: '#e0e0e0',
      minHeight: 16,
      alignItems: 'center',
      backgroundColor: '#f5f5f5',
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
    footer: {
      position: 'absolute',
      bottom: 20,
      left: 30,
      right: 30,
      fontSize: 7,
      color: '#999999',
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 0.5,
      borderTopColor: '#e0e0e0',
      paddingTop: 4,
    },
  })

  /**
   * Calculate equal column width based on number of columns
   */
  function getColWidth(numCols: number): string {
    return `${Math.floor(100 / numCols)}%`
  }

  // Build PDF document
  const pdfDoc = h(
    Document,
    null,
    h(
      Page,
      { size: opts.pageSize, orientation: opts.orientation, style: styles.page },
      // Branding header
      h(
        View,
        { style: styles.brandHeader },
        h(Text, { style: styles.orgName }, opts.orgName),
        h(Text, { style: styles.reportTitle }, title),
        opts.subtitle
          ? h(Text, { style: styles.subtitle }, opts.subtitle)
          : null,
        h(Text, { style: styles.exportInfo }, `Xuất ngày: ${exportDate}`)
      ),
      // Sections
      ...sections.map((section, sIdx) => {
        const colWidth = getColWidth(section.headers.length)

        return h(
          View,
          { key: `section-${sIdx}` },
          // Section title
          h(Text, { style: styles.sectionTitle }, section.title),
          // Table
          h(
            View,
            { style: styles.table },
            // Header row
            h(
              View,
              { style: styles.tableHeader },
              ...section.headers.map((header, hIdx) =>
                h(
                  Text,
                  {
                    key: `sh-${sIdx}-${hIdx}`,
                    style: { ...styles.headerCell, width: colWidth },
                  },
                  header
                )
              )
            ),
            // Data rows
            ...section.rows.map((row, rIdx) =>
              h(
                View,
                {
                  key: `sr-${sIdx}-${rIdx}`,
                  style: rIdx % 2 === 0 ? styles.tableRow : styles.tableRowAlt,
                },
                ...row.map((cell, cIdx) =>
                  h(
                    Text,
                    {
                      key: `sc-${sIdx}-${rIdx}-${cIdx}`,
                      style: { ...styles.cell, width: colWidth },
                    },
                    cell ?? ''
                  )
                )
              )
            )
          )
        )
      }),
      // Footer
      h(
        View,
        { style: styles.footer },
        h(Text, null, 'IOCM - Hệ thống Quản trị Viện'),
        h(Text, null, exportDate)
      )
    )
  )

  const blob = await pdf(pdfDoc).toBlob()
  return blob
}

/**
 * Generate PDF and trigger browser download.
 *
 * @param title - Report title
 * @param sections - Array of report sections
 * @param filename - Download filename (without extension)
 * @param options - Optional configuration
 */
export async function downloadReportPDF(
  title: string,
  sections: ReportSection[],
  filename: string,
  options?: PDFReportOptions
): Promise<void> {
  const blob = await generateReportPDF(title, sections, options)

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Generate PDF as a Buffer (for server-side use).
 *
 * @param title - Report title
 * @param sections - Array of report sections
 * @param options - Optional configuration
 * @returns PDF as Buffer
 */
export async function generateReportPDFBuffer(
  title: string,
  sections: ReportSection[],
  options?: PDFReportOptions
): Promise<Buffer> {
  const { Document, Page, Text, View, StyleSheet, renderToBuffer } = await import(
    '@react-pdf/renderer'
  )
  const { createElement } = await import('react')
  const h = createElement

  const opts = { ...DEFAULT_PDF_OPTIONS, ...options }
  const exportDate = format(new Date(), 'dd/MM/yyyy HH:mm')

  const styles = StyleSheet.create({
    page: {
      padding: 30,
      fontSize: 8,
      fontFamily: 'Helvetica',
    },
    brandHeader: {
      borderBottomWidth: 2,
      borderBottomColor: '#1976d2',
      paddingBottom: 8,
      marginBottom: 12,
    },
    orgName: {
      fontSize: 10,
      fontWeight: 'bold',
      color: '#1976d2',
      textAlign: 'center',
    },
    reportTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'center',
      marginTop: 6,
    },
    subtitle: {
      fontSize: 9,
      textAlign: 'center',
      color: '#666666',
      marginTop: 3,
    },
    exportInfo: {
      fontSize: 7,
      textAlign: 'right',
      color: '#999999',
      marginTop: 4,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: 'bold',
      marginTop: 14,
      marginBottom: 6,
      color: '#333333',
      borderBottomWidth: 0.5,
      borderBottomColor: '#1976d2',
      paddingBottom: 3,
    },
    table: {
      width: '100%',
      marginBottom: 10,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: '#1976d2',
      minHeight: 20,
      alignItems: 'center',
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: '#e0e0e0',
      minHeight: 16,
      alignItems: 'center',
    },
    tableRowAlt: {
      flexDirection: 'row',
      borderBottomWidth: 0.5,
      borderBottomColor: '#e0e0e0',
      minHeight: 16,
      alignItems: 'center',
      backgroundColor: '#f5f5f5',
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
    footer: {
      position: 'absolute',
      bottom: 20,
      left: 30,
      right: 30,
      fontSize: 7,
      color: '#999999',
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 0.5,
      borderTopColor: '#e0e0e0',
      paddingTop: 4,
    },
  })

  function getColWidth(numCols: number): string {
    return `${Math.floor(100 / numCols)}%`
  }

  const pdfDoc = h(
    Document,
    null,
    h(
      Page,
      { size: opts.pageSize, orientation: opts.orientation, style: styles.page },
      h(
        View,
        { style: styles.brandHeader },
        h(Text, { style: styles.orgName }, opts.orgName),
        h(Text, { style: styles.reportTitle }, title),
        opts.subtitle
          ? h(Text, { style: styles.subtitle }, opts.subtitle)
          : null,
        h(Text, { style: styles.exportInfo }, `Xuất ngày: ${exportDate}`)
      ),
      ...sections.map((section, sIdx) => {
        const colWidth = getColWidth(section.headers.length)
        return h(
          View,
          { key: `section-${sIdx}` },
          h(Text, { style: styles.sectionTitle }, section.title),
          h(
            View,
            { style: styles.table },
            h(
              View,
              { style: styles.tableHeader },
              ...section.headers.map((header, hIdx) =>
                h(
                  Text,
                  {
                    key: `sh-${sIdx}-${hIdx}`,
                    style: { ...styles.headerCell, width: colWidth },
                  },
                  header
                )
              )
            ),
            ...section.rows.map((row, rIdx) =>
              h(
                View,
                {
                  key: `sr-${sIdx}-${rIdx}`,
                  style: rIdx % 2 === 0 ? styles.tableRow : styles.tableRowAlt,
                },
                ...row.map((cell, cIdx) =>
                  h(
                    Text,
                    {
                      key: `sc-${sIdx}-${rIdx}-${cIdx}`,
                      style: { ...styles.cell, width: colWidth },
                    },
                    cell ?? ''
                  )
                )
              )
            )
          )
        )
      }),
      h(
        View,
        { style: styles.footer },
        h(Text, null, 'IOCM - Hệ thống Quản trị Viện'),
        h(Text, null, exportDate)
      )
    )
  )

  const buffer = await renderToBuffer(pdfDoc)
  return Buffer.from(buffer)
}
