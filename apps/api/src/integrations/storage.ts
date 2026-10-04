import path from 'path';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { storedFiles } from '../db/schema';

/**
 * File storage adapter. Swap in an S3-compatible bucket (e.g. AWS af-south-1, Cape Town) with encryption
 * at rest when volumes grow; nothing else changes.
 */
export interface FileStorage {
  put(buffer: Buffer, originalName: string): Promise<string>;
  get(key: string): Promise<Buffer>;
}

/**
 * Stores files in Postgres. The API runs as serverless functions on Vercel, where the local disk is
 * read-only and each instance has its own, so files must live somewhere shared.
 */
export class DatabaseFileStorage implements FileStorage {
  constructor(private db: Db) {}

  async put(buffer: Buffer, originalName: string) {
    const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
    const key = `${randomUUID()}${ext}`;
    await this.db.insert(storedFiles).values({ key, originalName: originalName.slice(0, 200), sizeBytes: buffer.length, content: buffer });
    return key;
  }

  async get(key: string) {
    if (!/^[a-f0-9-]+(\.[a-z0-9]+)?$/.test(key)) throw new Error('Invalid storage key');
    const row = await this.db.query.storedFiles.findFirst({ where: eq(storedFiles.key, key) });
    if (!row) throw new Error('File not found');
    return Buffer.from(row.content);
  }
}
