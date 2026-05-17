import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  generateFileKey,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  LocalStorage,
  resetStorage,
} from './storage';

describe('storage utilities', () => {
  describe('generateFileKey', () => {
    it('generates key with correct pattern: category/entityId/timestamp-filename', () => {
      const key = generateFileKey('documents', 'doc-123', 'report.pdf');
      expect(key).toMatch(/^documents\/doc-123\/\d+-report\.pdf$/);
    });

    it('sanitizes special characters in filename', () => {
      const key = generateFileKey('attachments', 'att-1', 'tài liệu (bản cuối).docx');
      expect(key).not.toContain(' ');
      expect(key).not.toContain('(');
      expect(key).not.toContain(')');
      expect(key).toMatch(/^attachments\/att-1\/\d+-[a-zA-Z0-9._-]+$/);
    });

    it('truncates long filenames to 100 chars', () => {
      const longName = 'a'.repeat(200) + '.pdf';
      const key = generateFileKey('scans', 'scan-1', longName);
      const filename = key.split('/').pop()!;
      const parts = filename.split('-');
      parts.shift(); // remove timestamp
      const nameOnly = parts.join('-');
      expect(nameOnly.length).toBeLessThanOrEqual(100);
    });

    it('supports all valid categories', () => {
      const categories = ['documents', 'attachments', 'scans', 'signed', 'chat', 'general'] as const;
      for (const cat of categories) {
        const key = generateFileKey(cat, 'id-1', 'file.pdf');
        expect(key.startsWith(`${cat}/`)).toBe(true);
      }
    });

    it('generates unique keys for same file (different timestamps)', async () => {
      const key1 = generateFileKey('documents', 'doc-1', 'file.pdf');
      await new Promise((r) => setTimeout(r, 5));
      const key2 = generateFileKey('documents', 'doc-1', 'file.pdf');
      expect(key1).not.toBe(key2);
    });
  });

  describe('constants', () => {
    it('MAX_FILE_SIZE defaults to 50MB', () => {
      expect(MAX_FILE_SIZE).toBe(50 * 1024 * 1024);
    });

    it('ALLOWED_MIME_TYPES includes common document types', () => {
      expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
      expect(ALLOWED_MIME_TYPES).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(ALLOWED_MIME_TYPES).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_MIME_TYPES).toContain('image/png');
    });
  });
});

describe('LocalStorage', () => {
  const testDir = join(process.cwd(), 'test-uploads-' + Date.now());
  let storage: LocalStorage;

  beforeEach(() => {
    process.env.LOCAL_STORAGE_PATH = testDir;
    storage = new LocalStorage();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.LOCAL_STORAGE_PATH;
    resetStorage();
  });

  it('creates base directory on construction', () => {
    expect(existsSync(testDir)).toBe(true);
  });

  it('uploads a file to local filesystem', async () => {
    const content = Buffer.from('Hello, IOCM!');
    const result = await storage.upload({
      key: 'documents/doc-1/test-file.pdf',
      body: content,
      contentType: 'application/pdf',
      size: content.length,
    });

    expect(result.key).toBe('documents/doc-1/test-file.pdf');
    expect(result.url).toBe('/api/upload/files/documents/doc-1/test-file.pdf');
    expect(result.size).toBe(content.length);
    expect(result.contentType).toBe('application/pdf');

    // Verify file exists on disk
    const filePath = join(testDir, 'documents', 'doc-1', 'test-file.pdf');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath).toString()).toBe('Hello, IOCM!');
  });

  it('creates nested directories for file key', async () => {
    const content = Buffer.from('nested');
    await storage.upload({
      key: 'scans/entity-abc/deep/nested/file.png',
      body: content,
      contentType: 'image/png',
      size: content.length,
    });

    const filePath = join(testDir, 'scans', 'entity-abc', 'deep', 'nested', 'file.png');
    expect(existsSync(filePath)).toBe(true);
  });

  it('deletes a file', async () => {
    const content = Buffer.from('to delete');
    await storage.upload({
      key: 'general/x/delete-me.txt',
      body: content,
      contentType: 'text/plain',
      size: content.length,
    });

    const filePath = join(testDir, 'general', 'x', 'delete-me.txt');
    expect(existsSync(filePath)).toBe(true);

    await storage.delete('general/x/delete-me.txt');
    expect(existsSync(filePath)).toBe(false);
  });

  it('delete does not throw for non-existent file', async () => {
    await expect(storage.delete('nonexistent/file.pdf')).resolves.not.toThrow();
  });

  it('getUrl returns API path', () => {
    const url = storage.getUrl('documents/doc-1/file.pdf');
    expect(url).toBe('/api/upload/files/documents/doc-1/file.pdf');
  });

  it('getFile returns buffer for existing file', async () => {
    const content = Buffer.from('file content');
    await storage.upload({
      key: 'chat/msg-1/image.png',
      body: content,
      contentType: 'image/png',
      size: content.length,
    });

    const result = storage.getFile('chat/msg-1/image.png');
    expect(result).not.toBeNull();
    expect(result!.toString()).toBe('file content');
  });

  it('getFile returns null for non-existent file', () => {
    const result = storage.getFile('nonexistent/file.pdf');
    expect(result).toBeNull();
  });
});
