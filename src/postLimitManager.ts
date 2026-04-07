import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

interface PostLimitState {
  date: string;
  count: number;
  lastPublishTime: number | null;
  hourlyCount: number;
  lastHourReset: number | null;
}

interface PublishDenied {
  readonly allowed: false;
  readonly reason: string;
  readonly nextAllowedTime: Date;
}

interface PublishAllowed {
  readonly allowed: true;
}

export type PublishValidationResult = PublishAllowed | PublishDenied;

const DEFAULT_MIN_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_HOURLY_COUNT = 2;
const ONE_HOUR_MS = 60 * 60 * 1000;

let dailyLimit = Number(process.env.DAILY_POST_LIMIT ?? 3);
let minIntervalMs = DEFAULT_MIN_INTERVAL_MS;

// 지연 초기화: app.getPath는 app이 ready된 후에만 사용 가능
function getStorageFile(): string {
  try {
    return path.join(app.getPath('userData'), 'post-limit.json');
  } catch {
    // app이 아직 ready되지 않은 경우 임시 경로 사용
    return path.join(process.cwd(), 'post-limit.json');
  }
}

function isValidState(parsed: unknown): parsed is PostLimitState {
  if (parsed === null || typeof parsed !== 'object') return false;
  const obj = parsed as Record<string, unknown>;
  return typeof obj.date === 'string' && typeof obj.count === 'number';
}

function migrateState(parsed: Record<string, unknown>): PostLimitState {
  return {
    date: parsed.date as string,
    count: parsed.count as number,
    lastPublishTime: typeof parsed.lastPublishTime === 'number' ? parsed.lastPublishTime : null,
    hourlyCount: typeof parsed.hourlyCount === 'number' ? parsed.hourlyCount : 0,
    lastHourReset: typeof parsed.lastHourReset === 'number' ? parsed.lastHourReset : null,
  };
}

function createDefaultState(): PostLimitState {
  return {
    date: new Date().toISOString().slice(0, 10),
    count: 0,
    lastPublishTime: null,
    hourlyCount: 0,
    lastHourReset: null,
  };
}

async function readState(): Promise<PostLimitState> {
  try {
    const storageFile = getStorageFile();
    const raw = await fs.readFile(storageFile, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!isValidState(parsed)) {
      throw new Error('Invalid state');
    }
    return migrateState(parsed as unknown as Record<string, unknown>);
  } catch {
    return createDefaultState();
  }
}

async function writeState(state: PostLimitState): Promise<void> {
  const storageFile = getStorageFile();
  await fs.mkdir(path.dirname(storageFile), { recursive: true });
  await fs.writeFile(storageFile, JSON.stringify(state), 'utf-8');
}

// --- 기존 API (하위 호환 유지) ---

export async function getTodayCount(): Promise<number> {
  const state = await readState();
  const today = new Date().toISOString().slice(0, 10);
  if (state.date !== today) {
    return 0;
  }
  return state.count;
}

export function getDailyLimit(): number {
  return dailyLimit;
}

export function setDailyLimit(limit: number): void {
  if (Number.isFinite(limit) && limit >= 0) {
    dailyLimit = Math.floor(limit);
    process.env.DAILY_POST_LIMIT = String(dailyLimit);
  }
}

export async function incrementTodayCount(): Promise<number> {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const state = await readState();

  const isNewDay = state.date !== today;
  const isNewHour = state.lastHourReset === null || (now - state.lastHourReset) >= ONE_HOUR_MS;

  const baseCount = isNewDay ? 0 : state.count;
  const baseHourlyCount = isNewHour ? 0 : state.hourlyCount;
  const baseHourReset = isNewHour ? now : (state.lastHourReset ?? now);

  const nextState: PostLimitState = {
    date: today,
    count: baseCount + 1,
    lastPublishTime: now,
    hourlyCount: baseHourlyCount + 1,
    lastHourReset: baseHourReset,
  };

  await writeState(nextState);
  return nextState.count;
}

export async function resetCount(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await writeState({
    date: today,
    count: 0,
    lastPublishTime: null,
    hourlyCount: 0,
    lastHourReset: null,
  });
}

// --- 새 API: 최소 발행 간격 ---

export function getMinIntervalMs(): number {
  return minIntervalMs;
}

export function setMinIntervalMs(ms: number): void {
  if (Number.isFinite(ms) && ms >= 0) {
    minIntervalMs = Math.floor(ms);
  }
}

export async function canPublishNow(): Promise<boolean> {
  const state = await readState();
  if (state.lastPublishTime === null) return true;
  const elapsed = Date.now() - state.lastPublishTime;
  return elapsed >= minIntervalMs;
}

// --- 새 API: 시간당 따발총 방지 ---

export async function canPublishHourly(): Promise<boolean> {
  const state = await readState();
  const now = Date.now();

  // 시간 윈도우가 리셋된 경우 허용
  if (state.lastHourReset === null || (now - state.lastHourReset) >= ONE_HOUR_MS) {
    return true;
  }

  return state.hourlyCount < MAX_HOURLY_COUNT;
}

// --- 새 API: 통합 검증 ---

export async function validatePublishAllowed(): Promise<PublishValidationResult> {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const state = await readState();

  // 1) 일일 한도 체크
  const todayCount = state.date === today ? state.count : 0;
  if (todayCount >= dailyLimit) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return {
      allowed: false,
      reason: `일일 발행 한도 초과 (${todayCount}/${dailyLimit}건)`,
      nextAllowedTime: tomorrow,
    };
  }

  // 2) 최소 간격 체크
  if (state.lastPublishTime !== null) {
    const elapsed = now - state.lastPublishTime;
    if (elapsed < minIntervalMs) {
      const nextAllowed = new Date(state.lastPublishTime + minIntervalMs);
      const remainingMin = Math.ceil((minIntervalMs - elapsed) / 60_000);
      return {
        allowed: false,
        reason: `최소 발행 간격 미충족 (${remainingMin}분 남음)`,
        nextAllowedTime: nextAllowed,
      };
    }
  }

  // 3) 시간당 한도 체크
  const isCurrentHourWindow = state.lastHourReset !== null && (now - state.lastHourReset) < ONE_HOUR_MS;
  if (isCurrentHourWindow && state.hourlyCount >= MAX_HOURLY_COUNT) {
    const nextAllowed = new Date((state.lastHourReset as number) + ONE_HOUR_MS);
    return {
      allowed: false,
      reason: `시간당 발행 한도 초과 (${state.hourlyCount}/${MAX_HOURLY_COUNT}건)`,
      nextAllowedTime: nextAllowed,
    };
  }

  return { allowed: true };
}
