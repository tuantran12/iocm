/**
 * File Serving Route — GET /api/upload/files/{...path}
 *
 * Serves files from local storage when using LocalStorage provider.
 * In production with S3/MinIO, files are served directly from the S3 endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStorage, LocalStorage } from '@/lib/storage';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const storage = getStorage();

  if (!(storage instanceof LocalStorage)) {
    return NextResponse.json(
      { error: 'File serving only available with local storage provider.' },
      { status: 404 }
    );
  }

  const key = path.join('/');
  const fileBuffer = storage.getFile(key);

  if (!fileBuffer) {
    return NextResponse.json(
      { error: 'Tệp không tồn tại.' },
      { status: 404 }
    );
  }

  // Determine content type from extension
  const ext = key.split('.').pop()?.toLowerCase() || '';
  const contentTypeMap: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    txt: 'text/plain',
    csv: 'text/csv',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
  };

  const contentType = contentTypeMap[ext] || 'application/octet-stream';

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
