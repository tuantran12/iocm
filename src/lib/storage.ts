/**
 * File Storage Abstraction — Interface chung cho S3/MinIO/local, swap dễ.
 *
 * Supports: documents, attachments, scans, signed versions.
 * Configured via environment variables:
 *   STORAGE_PROVIDER: "s3" | "local" (default: auto-detect)
 *   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION
 *   LOCAL_STORAGE_PATH: path for local file storage (default: ./uploads)
 *   MAX_FILE_SIZE_MB: configurable max file size (default: 50)
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface FileStorage {
  upload(params: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
    size: number;
  }): Promise<UploadResult>;

  delete(key: string): Promise<void>;

  getUrl(key: string): string;
}

// ---------------------------------------------------------------------------
// S3/MinIO Implementation
// ---------------------------------------------------------------------------

export class S3Storage implements FileStorage {
  private client: S3Client;
  private bucket: string;
  private endpoint: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
    const accessKeyId = process.env.S3_ACCESS_KEY || 'minioadmin';
    const secretAccessKey = process.env.S3_SECRET_KEY || 'minioadmin';
    const region = process.env.S3_REGION || 'us-east-1';
    this.bucket = process.env.S3_BUCKET || 'iocm-files';
    this.endpoint = endpoint;

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true, // Required for MinIO
    });
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async upload(params: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
    size: number;
  }): Promise<UploadResult> {
    await this.ensureBucket();

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        ContentLength: params.size,
      })
    );

    return {
      key: params.key,
      url: this.getUrl(params.key),
      size: params.size,
      contentType: params.contentType,
    };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  getUrl(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  /** For testing: get object content */
  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    const stream = response.Body;
    if (!stream) throw new Error('Empty response body');
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

// ---------------------------------------------------------------------------
// Local Filesystem Implementation (dev fallback)
// ---------------------------------------------------------------------------

export class LocalStorage implements FileStorage {
  private basePath: string;
  private baseUrl: string;

  constructor() {
    this.basePath = process.env.LOCAL_STORAGE_PATH || join(process.cwd(), 'uploads');
    this.baseUrl = '/api/upload/files';

    // Ensure base directory exists
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  async upload(params: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
    size: number;
  }): Promise<UploadResult> {
    const filePath = join(this.basePath, params.key);
    const dir = dirname(filePath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(filePath, params.body);

    return {
      key: params.key,
      url: this.getUrl(params.key),
      size: params.size,
      contentType: params.contentType,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.basePath, key);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }

  /** Read file from local storage (for serving) */
  getFile(key: string): Buffer | null {
    const filePath = join(this.basePath, key);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath);
  }

  getBasePath(): string {
    return this.basePath;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Max file size: configurable via MAX_FILE_SIZE_MB env var, default 50MB */
export const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10)) * 1024 * 1024;

/** Allowed MIME types for documents */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed',
];

/**
 * Generate a unique file key for storage.
 * Pattern: {category}/{entityId}/{timestamp}-{sanitizedFilename}
 */
export function generateFileKey(
  category: 'documents' | 'attachments' | 'scans' | 'signed' | 'chat' | 'general',
  entityId: string,
  filename: string
): string {
  const timestamp = Date.now();
  const sanitized = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100);
  return `${category}/${entityId}/${timestamp}-${sanitized}`;
}

// ---------------------------------------------------------------------------
// Provider Selection & Singleton
// ---------------------------------------------------------------------------

/**
 * Determine which storage provider to use:
 * 1. If STORAGE_PROVIDER env is set, use that explicitly
 * 2. If S3_ENDPOINT is configured, use S3
 * 3. Otherwise, fall back to local filesystem
 */
function resolveProvider(): 's3' | 'local' {
  const explicit = process.env.STORAGE_PROVIDER;
  if (explicit === 's3') return 's3';
  if (explicit === 'local') return 'local';

  // Auto-detect: if S3 endpoint is configured, use S3
  if (process.env.S3_ENDPOINT) return 's3';

  // Default: local filesystem for dev
  return 'local';
}

let storageInstance: FileStorage | null = null;

export function getStorage(): FileStorage {
  if (!storageInstance) {
    const provider = resolveProvider();
    storageInstance = provider === 's3' ? new S3Storage() : new LocalStorage();
  }
  return storageInstance;
}

/** Reset singleton (for testing) */
export function resetStorage(): void {
  storageInstance = null;
}
