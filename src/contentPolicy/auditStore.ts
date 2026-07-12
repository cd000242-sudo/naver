import fs from 'fs/promises';
import path from 'path';
import { withFileOperationLock } from './fileOperationQueue.js';
import type { AuditRecord } from './types.js';

const AUDIT_FILE_NAME = 'content-policy-audit.jsonl';

export class ContentPolicyAuditStore {
  readonly filePath: string;

  constructor(private readonly baseDir: string) {
    this.filePath = path.join(baseDir, AUDIT_FILE_NAME);
  }

  async append(record: AuditRecord): Promise<void> {
    const immutableRecord = JSON.parse(JSON.stringify(record)) as AuditRecord;
    return withFileOperationLock(this.filePath, async () => {
      await fs.mkdir(this.baseDir, { recursive: true });
      await this.readUnlocked(1000, true);
      await fs.appendFile(this.filePath, `${JSON.stringify(immutableRecord)}\n`, 'utf8');
    });
  }

  async readRecent(limit = 100): Promise<AuditRecord[]> {
    const boundedLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    return withFileOperationLock(this.filePath, () => this.readUnlocked(boundedLimit, false));
  }

  private async readUnlocked(limit: number, validateOnly: boolean): Promise<AuditRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const records = raw.split(/\r?\n/)
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => Boolean(line.trim()))
        .map(({ line, index }) => {
          try {
            return JSON.parse(line) as AuditRecord;
          } catch {
            throw new Error(`AUDIT_LOG_CORRUPT_LINE:${index + 1}`);
          }
        });
      if (validateOnly) return [];
      return records.slice(-limit).reverse();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}
