import ExcelJS from 'exceljs'
import { format } from 'date-fns'

/**
 * Column definition for Excel export
 */
export interface ExcelColumn {
  /** Column header text (Vietnamese supported) */
  header: string
  /** Key to access data from row object */
  key: string
  /** Column width in characters */
  width?: number
}

/**
 * Options for Excel export
 */
export interface ExcelExportOptions {
  /** Worksheet name */
  sheetName?: string
  /** Header background color (ARGB format, e.g. 'FF1976D2') */
  headerColor?: string
  /** Header font color (ARGB format) */
  headerFontColor?: string
  /** Whether to freeze the header row */
  freezeHeader?: boolean
  /** Whether to add alternating row colors */
  alternateRows?: boolean
  /** Whether to add borders */
  borders?: boolean
  /** Creator name for metadata */
  creator?: string
}

const DEFAULT_OPTIONS: Required<ExcelExportOptions> = {
  sheetName: 'Báo cáo',
  headerColor: 'FF1976D2',
  headerFontColor: 'FFFFFFFF',
  freezeHeader: true,
  alternateRows: true,
  borders: true,
  creator: 'IOCM - Viện Nghiên cứu',
}

/**
 * Format cell value for display.
 * Handles Date objects, null/undefined, numbers, and strings.
 */
function formatCellValue(value: unknown): string | number {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? '' : format(value, 'dd/MM/yyyy')
  }
  if (typeof value === 'number') return value
  if (typeof value === 'string') return value
  return String(value)
}

/**
 * Export data to Excel (.xlsx) and trigger browser download.
 *
 * @param data - Array of row objects
 * @param columns - Column definitions (header, key, width)
 * @param filename - Download filename (without extension)
 * @param options - Optional styling/configuration
 */
export async function exportToExcel(
  data: Record<string, unknown>[],
  columns: ExcelColumn[],
  filename: string,
  options?: ExcelExportOptions
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = opts.creator
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(opts.sheetName, {
    views: opts.freezeHeader ? [{ state: 'frozen', ySplit: 1 }] : undefined,
  })

  // Set columns with auto-width fallback
  worksheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? Math.max(col.header.length + 4, 12),
  }))

  // Style header row
  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, size: 11, color: { argb: opts.headerFontColor } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: opts.headerColor },
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  headerRow.height = 24

  // Add data rows
  for (const row of data) {
    const rowData: Record<string, string | number> = {}
    for (const col of columns) {
      rowData[col.key] = formatCellValue(row[col.key])
    }
    worksheet.addRow(rowData)
  }

  // Style data rows
  const totalRows = data.length + 1
  for (let i = 2; i <= totalRows; i++) {
    const row = worksheet.getRow(i)
    row.alignment = { vertical: 'middle', wrapText: true }

    if (opts.alternateRows && i % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F5F5' },
      }
    }
  }

  // Add borders
  if (opts.borders) {
    const lastCol = columns.length
    for (let r = 1; r <= totalRows; r++) {
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
  }

  // Generate buffer and trigger download
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${filename}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Generate Excel buffer without triggering download.
 * Useful for server-side generation or custom handling.
 */
export async function generateExcelBuffer(
  data: Record<string, unknown>[],
  columns: ExcelColumn[],
  options?: ExcelExportOptions
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = opts.creator
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet(opts.sheetName, {
    views: opts.freezeHeader ? [{ state: 'frozen', ySplit: 1 }] : undefined,
  })

  worksheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width ?? Math.max(col.header.length + 4, 12),
  }))

  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, size: 11, color: { argb: opts.headerFontColor } }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: opts.headerColor },
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  headerRow.height = 24

  for (const row of data) {
    const rowData: Record<string, string | number> = {}
    for (const col of columns) {
      rowData[col.key] = formatCellValue(row[col.key])
    }
    worksheet.addRow(rowData)
  }

  const totalRows = data.length + 1
  for (let i = 2; i <= totalRows; i++) {
    const row = worksheet.getRow(i)
    row.alignment = { vertical: 'middle', wrapText: true }
    if (opts.alternateRows && i % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F5F5' },
      }
    }
  }

  if (opts.borders) {
    const lastCol = columns.length
    for (let r = 1; r <= totalRows; r++) {
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
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
