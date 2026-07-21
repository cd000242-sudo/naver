import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { withFileOperationLock } from './fileOperationQueue.js';
import type { PublicationHistoryEntry, PublicationState } from './types.js';

const STATE_FILE_NAME = 'content-policy-publication-state.json';

const LEGACY_AUTOMATIC_PAUSE_REASONS: ReadonlySet<string> = new Set([
  'EXPOSURE_TARGET_METADATA_UNAVAILABLE',
  'EXPOSURE_TARGET_METADATA_INCOMPLETE',
  'EXPOSURE_MONITOR_FAILURE',
  'EXPOSURE_RECENT_POSTS_UNAVAILABLE',
  'EXPOSURE_RECENT_POSTS_CORRUPT',
  'EXPOSURE_ARTICLE_METADATA_UNAVAILABLE',
  'EXPOSURE_PUBLICATION_HISTORY_UNAVAILABLE',
  'EXPOSURE_AUDIT_LOG_CORRUPT',
  'EXPOSURE_AUDIT_UNAVAILABLE',
  'EXPOSURE_MONITOR_PERSISTENCE_FAILURE',
  'TWO_CONSECUTIVE_CONFIRMED_MISSING',
]);

export function isAutomaticPublicationPauseReason(reason: string | undefined): boolean {
  const normalized = String(reason || '').trim().toUpperCase();
  return LEGACY_AUTOMATIC_PAUSE_REASONS.has(normalized);
}

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
      const loaded: PublicationState = {
        ...initialState(),
        ...parsed,
        paused_templates: Array.isArray(parsed.paused_templates) ? [...parsed.paused_templates] : [],
        paused_structures: Array.isArray(parsed.paused_structures) ? [...parsed.paused_structures] : [],
        history: Array.isArray(parsed.history) ? [...parsed.history] : [],
      };
      if (loaded.status === 'PAUSED'
        && !loaded.pause_origin
        && isAutomaticPublicationPauseReason(loaded.pause_reason)) {
        return {
          ...loaded,
          status: 'ACTIVE',
          last_advisory_reason: loaded.pause_reason,
          last_advisory_at: loaded.paused_at || new Date().toISOString(),
          pause_reason: undefined,
          paused_at: undefined,
          pause_origin: undefined,
        };
      }
      return loaded;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initialState();
      // [v2.11.136] 자기치유 (quota식): 깨진 JSON(부분쓰기·전원차단·AV 격리)을
      // 그냥 throw하면 매 발행이 영구 차단되고 미러 백업도 없어 사용자가 파일을
      // 수동 삭제해야만 풀렸다. 손상 파일을 .corrupt-<ts>로 격리하고 initialState를
      // 즉시 되써서 다음 발행부터 정상 진행되게 한다. 잃는 것은 최근 창의 cadence/
      // 일일캡 이력(당일·최대 500건)뿐 — 영구 잠금보다 명백히 작은 트레이드오프.
      // status는 ACTIVE로 두되 STATE_REBUILT_FROM_CORRUPT를 남겨 관측만 한다.
      console.error(`[PublicationStateStore] 🚨 상태 파일 손상 감지 → 격리 + 재생성 (자정 없이 즉시 복구): ${(error as Error).message}`);
      const rebuilt: PublicationState = {
        ...initialState(),
        last_advisory_reason: 'STATE_REBUILT_FROM_CORRUPT',
        last_advisory_at: new Date().toISOString(),
      };
      try {
        await fs.rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
      } catch { /* 격리 실패해도 아래 되쓰기로 덮어씀 */ }
      try {
        await this.saveUnlocked(rebuilt);
      } catch (writeError) {
        // 되쓰기까지 실패하면(디스크풀 등) 메모리 값이라도 반환 — 오늘은 진행,
        // 파일은 다음 정상 쓰기에서 복구.
        console.error(`[PublicationStateStore] ⚠️ 재생성 쓰기 실패(무시하고 진행): ${(writeError as Error).message}`);
      }
      return rebuilt;
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

  async pauseAll(reason: string, origin: 'operator' | 'integrity' = 'operator'): Promise<PublicationState> {
    return this.update((state) => ({
      ...state,
      status: 'PAUSED',
      pause_reason: reason.trim() || 'operator pause',
      paused_at: new Date().toISOString(),
      pause_origin: origin,
      pause_incident: undefined,
      resume_approval: undefined,
      manual_test_evidence: undefined,
    }));
  }

  async recordAdvisory(reason: string, at = new Date()): Promise<PublicationState> {
    const normalizedReason = reason.trim().slice(0, 500) || 'AUTOMATIC_POLICY_DIAGNOSTIC';
    const advisoryAt = Number.isFinite(at.getTime()) ? at.toISOString() : new Date().toISOString();
    return this.update((state) => ({
      ...state,
      last_advisory_reason: normalizedReason,
      last_advisory_at: advisoryAt,
    }));
  }

  async resume(input: {
    approvedBy: string;
    rootCauseReviewed: boolean;
    manualTestVerified: boolean;
  }): Promise<PublicationState> {
    if (!input.rootCauseReviewed) throw new Error('ROOT_CAUSE_REVIEW_REQUIRED');
    if (!input.approvedBy.trim()) throw new Error('RESUME_APPROVER_REQUIRED');
    return this.update((state) => {
      if (state.status !== 'PAUSED') throw new Error('PUBLICATION_NOT_PAUSED');
      const requiresExposureEvidence = state.pause_origin !== 'integrity';
      if (requiresExposureEvidence && !input.manualTestVerified) {
        throw new Error('MANUAL_TEST_REQUIRED');
      }
      if (requiresExposureEvidence && !state.manual_test_evidence?.passed) {
        throw new Error('MANUAL_TEST_EVIDENCE_REQUIRED');
      }
      const now = new Date().toISOString();
      return {
        ...state,
        status: 'ACTIVE',
        pause_reason: undefined,
        paused_at: undefined,
        pause_origin: undefined,
        pause_incident: undefined,
        paused_templates: [],
        paused_structures: [],
        confirmed_missing_streak: 0,
        resume_approval: {
          approved_by: input.approvedBy.trim(),
          approved_at: now,
          root_cause_reviewed: true,
          manual_test_verified: input.manualTestVerified,
          manual_test_article_id: state.manual_test_evidence?.article_id,
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
