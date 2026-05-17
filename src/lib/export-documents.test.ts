import { describe, it, expect } from 'vitest'
import { exportToExcel } from './export-documents'
import type { DocumentExportRow } from './export-documents'

const sampleDocuments: DocumentExportRow[] = [
  {
    id: '1',
    code: 'VN-001',
    name: 'Điều lệ Viện Nghiên cứu',
    type: 'Điều lệ',
    cluster: 'CORE_FOUNDING',
    status: 'APPROVED',
    completenessScore: 0.875,
    priority: 'CRITICAL',
    deadline: new Date('2025-06-30'),
    ownerId: 'user-1',
    approverId: 'user-2',
  },
  {
    id: '2',
    code: 'VN-002',
    name: 'Quy chế tài chính',
    type: 'Quy chế',
    cluster: 'REGULATIONS',
    status: 'DRAFTING',
    completenessScore: 0.5,
    priority: 'HIGH',
    deadline: null,
    ownerId: null,
    approverId: null,
  },
  {
    id: '3',
    code: 'VN-003',
    name: 'Hợp đồng NDA với đối tác ABC',
    type: 'Hợp đồng',
    cluster: 'CONTRACTS',
    status: 'IN_REVIEW',
    completenessScore: 0.625,
    priority: 'MEDIUM',
    deadline: '2025-03-15',
    ownerId: 'user-3',
    approverId: null,
  },
]

describe('exportToExcel', () => {
  it('should return a valid Buffer', async () => {
    const buffer = await exportToExcel(sampleDocuments)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('should produce a valid xlsx file (starts with PK zip header)', async () => {
    const buffer = await exportToExcel(sampleDocuments)
    // xlsx files are zip archives, starting with PK (0x50, 0x4B)
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
  })

  it('should handle empty documents array', async () => {
    const buffer = await exportToExcel([])
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('should handle documents with null deadline', async () => {
    const docs: DocumentExportRow[] = [{
      id: '1',
      code: 'TEST-001',
      name: 'Test Document',
      type: 'Test',
      cluster: 'DATA',
      status: 'NOT_STARTED',
      completenessScore: 0,
      priority: 'LOW',
      deadline: null,
      ownerId: null,
      approverId: null,
    }]
    const buffer = await exportToExcel(docs)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })
})


describe('exportToPdf', () => {
  it('should return a valid Buffer', async () => {
    const { exportToPdf } = await import('./export-documents')
    const buffer = await exportToPdf(sampleDocuments)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('should produce a valid PDF (starts with %PDF header)', async () => {
    const { exportToPdf } = await import('./export-documents')
    const buffer = await exportToPdf(sampleDocuments)
    const header = buffer.slice(0, 4).toString('ascii')
    expect(header).toBe('%PDF')
  })

  it('should handle empty documents array', async () => {
    const { exportToPdf } = await import('./export-documents')
    const buffer = await exportToPdf([])
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })
})
