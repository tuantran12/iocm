import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exportToExcel } from '@/lib/export-documents'
import { DocumentCluster, DocumentStatus, Priority } from '@prisma/client'

/**
 * GET /api/documents/export/excel
 * Export the Master Document Matrix to Excel (.xlsx).
 * Supports query params for filtering (same as the documents list):
 *   - cluster: DocumentCluster enum value
 *   - status: DocumentStatus enum value
 *   - priority: Priority enum value
 *   - ownerId: string
 *   - search: string (searches code and name)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Build filter from query params
    const where: Record<string, unknown> = {}

    const cluster = searchParams.get('cluster')
    if (cluster && Object.values(DocumentCluster).includes(cluster as DocumentCluster)) {
      where.cluster = cluster
    }

    const status = searchParams.get('status')
    if (status && Object.values(DocumentStatus).includes(status as DocumentStatus)) {
      where.status = status
    }

    const priority = searchParams.get('priority')
    if (priority && Object.values(Priority).includes(priority as Priority)) {
      where.priority = priority
    }

    const ownerId = searchParams.get('ownerId')
    if (ownerId) {
      where.ownerId = ownerId
    }

    const search = searchParams.get('search')
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ]
    }

    const documents = await prisma.documentItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    const buffer = await exportToExcel(documents)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ma-tran-tai-lieu_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('Excel export error:', error)
    return NextResponse.json(
      { error: 'Không thể xuất file Excel. Vui lòng thử lại.' },
      { status: 500 }
    )
  }
}
