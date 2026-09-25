import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

/** File storage adapter. Production: S3-compatible bucket (e.g. AWS af-south-1, Cape Town) with encryption at rest. */
export interface FileStorage {
  put(buffer: Buffer, originalName: string): Promise<string>;
  get(key: string): Promise<Buffer>;
}

export class LocalFileStorage implements FileStorage {
  constructor(private dir = path.resolve(process.cwd(), 'uploads')) {}

  async put(buffer: Buffer, originalName: string) {
    await fs.mkdir(this.dir, { recursive: true });
    const ext = path.extname(originalName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
    const key = `${randomUUID()}${ext}`;
    await fs.writeFile(path.join(this.dir, key), buffer);
    return key;
  }

  async get(key: string) {
    if (!/^[a-f0-9-]+(\.[a-z0-9]+)?$/.test(key)) throw new Error('Invalid storage key');
    return fs.readFile(path.join(this.dir, key));
  }
}
