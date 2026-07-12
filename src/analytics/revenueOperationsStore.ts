import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import {
  DEFAULT_REVENUE_SETTINGS,
  RevenueValidationError,
  buildRevenueDashboard,
  validateRevenueEntryInput,
  validateRevenueSettings,
  type RevenueDashboard,
  type RevenueEntry,
  type RevenueEntryInput,
  type RevenueSettings,
} from './revenueOperations.js';

interface RevenueOperationsState {
  readonly version: 1;
  readonly settings: RevenueSettings;
  readonly entries: readonly RevenueEntry[];
}

const EMPTY_STATE: RevenueOperationsState = {
  version: 1,
  settings: DEFAULT_REVENUE_SETTINGS,
  entries: [],
};

function isExactDuplicate(
  entry: RevenueEntry,
  candidate: ReturnType<typeof validateRevenueEntryInput>,
): boolean {
  return entry.occurredOn === candidate.occurredOn
    && entry.channel === candidate.channel
    && entry.grossRevenue === candidate.grossRevenue
    && entry.cost === candidate.cost
    && entry.clicks === candidate.clicks
    && entry.conversions === candidate.conversions
    && entry.title === candidate.title
    && entry.postUrl === candidate.postUrl
    && entry.category === candidate.category
    && entry.accountId === candidate.accountId
    && entry.note === candidate.note;
}

function validStoredEntry(value: unknown): RevenueEntry | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  try {
    const normalized = validateRevenueEntryInput(candidate as unknown as RevenueEntryInput);
    const id = String(candidate.id || '').trim();
    const createdAt = String(candidate.createdAt || '').trim();
    const updatedAt = String(candidate.updatedAt || '').trim();
    if (!id || Number.isNaN(Date.parse(createdAt)) || Number.isNaN(Date.parse(updatedAt))) return null;
    return { id, ...normalized, createdAt, updatedAt };
  } catch {
    return null;
  }
}

export class RevenueOperationsStore {
  private queue: Promise<void> = Promise.resolve();
  private warnings: readonly string[] = [];

  constructor(private readonly filePath: string) {}

  private get backupPath(): string {
    return `${this.filePath}.bak`;
  }

  private addWarning(warning: string): void {
    this.warnings = [...new Set([...this.warnings, warning])];
  }

  private async restoreBackupIfAvailable(): Promise<boolean> {
    try {
      await fs.rename(this.backupPath, this.filePath);
      this.addWarning('수익 원장의 마지막 정상 백업을 복구했습니다. 실제 정산 내역을 확인하세요.');
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EEXIST') return false;
      throw error;
    }
  }

  private async readState(): Promise<RevenueOperationsState> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return await this.restoreBackupIfAvailable() ? this.readState() : EMPTY_STATE;
      }
      throw error;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const sourceEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
      const entries = sourceEntries.map(validStoredEntry).filter((entry): entry is RevenueEntry => entry !== null);
      const skipped = sourceEntries.length - entries.length;
      if (skipped > 0) {
        this.addWarning(`검증에 실패한 수익 내역 ${skipped}건을 제외했습니다.`);
      }
      return {
        version: 1,
        settings: validateRevenueSettings((parsed.settings || {}) as Partial<RevenueSettings>),
        entries,
      };
    } catch (error) {
      await this.quarantineCorruptFile();
      this.addWarning('수익 원장 저장 파일이 손상되어 격리했습니다. 실제 데이터를 다시 확인하세요.');
      return await this.restoreBackupIfAvailable() ? this.readState() : EMPTY_STATE;
    }
  }

  private async quarantineCorruptFile(): Promise<void> {
    const quarantinePath = `${this.filePath}.corrupt-${Date.now()}`;
    try {
      await fs.rename(this.filePath, quarantinePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private async writeState(state: RevenueOperationsState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2), 'utf8');
    let movedPrimaryToBackup = false;
    try {
      await fs.rm(this.backupPath, { force: true });
      try {
        await fs.rename(this.filePath, this.backupPath);
        movedPrimaryToBackup = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      if (movedPrimaryToBackup) {
        await fs.rm(this.filePath, { force: true }).catch(() => undefined);
        await fs.rename(this.backupPath, this.filePath).catch(() => undefined);
      }
      throw error;
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  async getDashboard(now: Date = new Date()): Promise<RevenueDashboard> {
    await this.queue;
    const state = await this.readState();
    return buildRevenueDashboard(state.entries, state.settings, now, this.warnings);
  }

  async addEntry(input: RevenueEntryInput): Promise<RevenueEntry> {
    return this.exclusive(async () => {
      const state = await this.readState();
      const normalized = validateRevenueEntryInput(input);
      if (state.entries.some((entry) => isExactDuplicate(entry, normalized))) {
        throw new RevenueValidationError('동일한 정산 내역이 이미 저장되어 있습니다. 기존 내역을 확인해 주세요.');
      }
      const timestamp = new Date().toISOString();
      const entry: RevenueEntry = {
        id: randomUUID(),
        ...normalized,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await this.writeState({ ...state, entries: [...state.entries, entry] });
      return entry;
    });
  }

  async removeEntry(id: string): Promise<boolean> {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return false;
    return this.exclusive(async () => {
      const state = await this.readState();
      const entries = state.entries.filter((entry) => entry.id !== normalizedId);
      if (entries.length === state.entries.length) return false;
      await this.writeState({ ...state, entries });
      return true;
    });
  }

  async updateSettings(input: Partial<RevenueSettings>): Promise<RevenueSettings> {
    return this.exclusive(async () => {
      const state = await this.readState();
      const settings = validateRevenueSettings({ ...state.settings, ...input });
      await this.writeState({ ...state, settings });
      return settings;
    });
  }
}
