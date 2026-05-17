/**
 * File Upload API Route — POST /api/upload
 *
 * Accepts multipart form data with:
 * - file: the file to upload (required)
 * - category: documents | attachments | scans | signed | chat | general (default: general)
 * - entityId: related entity ID (default: "unlinked")
 *
 * Returns: { success, data: { key, url, size, contentType } } or { success, error }
 *
 * Limits: configurable max file size (default 50MB), allowed MIME types only.
 * Vietnamese error messages for upload failures.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getStorage,
  generateFileKey,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
} from '@/lib/storage';

type FileCategory = 'documents' | 'attachments' | 'scans' | 'signed' | 'chat' | 'general';

const VALID_CATEGORIES: FileCategory[] = [
  'documents',
  'attachments',
  'scans',
  'signed',
  'chat',
  'general',
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng chọn tệp để tải lên.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const maxMB = MAX_FILE_SIZE / (1024 * 1024);
      return NextResponse.json(
        {
          success: false,
          error: `Tệp quá lớn. Kích thước tối đa cho phép là ${maxMB}MB.`,
        },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'Tệp rỗng. Vui lòng chọn tệp có nội dung.' },
        { status: 400 }
      );
    }

    // Validate MIME type
    const contentType = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Loại tệp không được hỗ trợ: ${contentType}. Vui lòng tải lên tệp PDF, Word, Excel, hình ảnh hoặc văn bản.`,
        },
        { status: 400 }
      );
    }

    // Parse category
    const categoryRaw = (formData.get('category') as string) || 'general';
    const category: FileCategory = VALID_CATEGORIES.includes(categoryRaw as FileCategory)
      ? (categoryRaw as FileCategory)
      : 'general';

    // Parse entityId
    const entityId = (formData.get('entityId') as string) || 'unlinked';

    // Generate unique key
    const key = generateFileKey(category, entityId, file.name);

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to storage
    const storage = getStorage();
    const result = await storage.upload({
      key,
      body: buffer,
      contentType,
      size: file.size,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Lỗi khi tải tệp lên. Vui lòng thử lại sau.',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { success: false, error: 'Thiếu tham số key của tệp cần xóa.' },
        { status: 400 }
      );
    }

    const storage = getStorage();
    await storage.delete(key);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Lỗi khi xóa tệp. Vui lòng thử lại sau.',
      },
      { status: 500 }
    );
  }
}
