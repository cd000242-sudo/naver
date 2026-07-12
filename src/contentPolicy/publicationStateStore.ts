import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { withFileOperationLock } from './fileOperationQueue.js';
import type { PublicationHistoryEntry, PublicationState } from './types.js';

const STATE_FILE_NAME = 'content-policy-publication-state.json';

function initialState(): PublicationState {
  return {
    status: 'ACTIVE',
    paused_templates: [],
    paused_structures: [],
    confirmed_missing_streak: 0,
    history: [],
  };
}

function cloneState(state: PublicationState): PublicationState {
  return JSON.parse(JSON.stringify(state)) as PublicationState;
}

export type PublicationStateUpdater = (
  state: PublicationState,
) => PublicationState | Promise<PublicationState>;

export class PublicationStateStore {
  readonly filePath: string;

  constructor(private readonly baseDir: string) {
    this.filePath = path.join(baseDir, STATE_FILE_NAME);
  }

  async load(): Promise<PublicationState> {
    return this.loadUnlocked();
  }

  private async loadUnlocked(): Promise<PublicationState> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as Partial<PublicationState>;
      return {
        ...initialState(),
        ...parsed,
        paused_templates: Array.isArray(parsed.paused_templates) ? [...parsed.paused_templates] : [],
        paused_structures: Array.isArray(parsed.paused_structures) ? [...parsed.paused_structures] : [],
        history: Array.isArray(parsed.history) ? [...parsed.history] : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initialState();
      throw new Error(`PUBLICATION_STATE_CORRUPT:${(error as Error).message}`);
    }
  }

  async save(state: PublicationState): Promise<void> {
    await withFileOperationLock(this.filePath, () => this.saveUnlocked(state));
  }

  async update(updater: PublicationStateUpdater): Promise<PublicationState> {
    return withFileOperationLock(this.filePath, async () => {
      const current = await this.loadUnlocked();
      const next = cloneState(await updater(cloneState(current)));
      await this.saveUnlocked(next);
      return cloneState(next);
    });
  }

  private async saveUnlocked(state: PublicationState): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(cloneState(state), null, 2), 'utf8');
      await fs.rename(tempPath, this.filePath);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  async pauseAll(reason: string): Promise<PublicationState> {
    return this.update((state) => ({
      ...state,
      status: 'PAUSED',
      pause_reason: reason.trim() || 'operator pause',
      paused_at: new Date().toISOString(),
      pause_incident: undefined,
      resume_approval: undefined,
      manual_test_evidence: undefined,
    }));
  }

  async resume(input: {
    approvedBy: string;
    rootCauseReviewed: boolean;
    manualTestVerified: boolean;
  }): Promise<PublicationState> {
    if (!input.rootCauseReviewed) throw new Error('ROOT_CAUSE_REVIEW_REQUIRED');
    if (!input.manualTestVerified) throw new Error('MANUAL_TEST_REQUIRED');
    if (!input.approvedBy.trim()) throw new Error('RESUME_APPROVER_REQUIRED');
    return this.update((state) => {
      if (state.status !== 'PAUSED') throw new Error('PUBLICATION_NOT_PAUSED');
      if (!state.manual_test_evidence?.passed) throw new Error('MANUAL_TEST_EVIDENCE_REQUIRED');
      const now = new Date().toISOString();
      return {
        ...state,
        status: 'ACTIVE',
        pause_reason: undefined,
        paused_at: undefined,
        pause_incident: undefined,
        paused_templates: [],
        paused_structures: [],
        confirmed_missing_streak: 0,
        resume_approval: {
          approved_by: input.approvedBy.trim(),
          approved_at: now,
          root_cause_reviewed: true,
          manual_test_verified: true,
          manual_test_article_id: state.manual_test_evidence.article_id,
        },
        manual_test_evidence: undefined,
      };
    });
  }

  async recordPublication(entry: PublicationHistoryEntry): Promise<PublicationState> {
    return this.update((state) => {
      const withoutDuplicate = state.history.filter((item) => item.article_id !== entry.article_id);
      return {
        ...state,
        history: [...withoutDuplicate, { ...entry }].slice(-500),
      };
    });
  }
}
