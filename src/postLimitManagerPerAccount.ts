/**
 * postLimitManagerPerAccount.ts — 계정별 발행 빈도 카운터 (다계정 격리)
 *
 * SPEC-NAVER-PROTECTION-2026 P2 Fix 2.1
 *
 * 기존 postLimitManager는 전 계정 단일 카운터 (다계정 빈도 무력).
 * 본 모듈은 계정별 dict로 카운터 분리 → 다계정 발행 시 각 계정 한도 독립 관리.
 *
 * 정책:
 * - state 파일: postLimitState-perAccount.json (기존과 분리)
 * - state 구조: { [accountId]: { date, count, hourlyCount, lastHourReset, lastPublishTime } }
 * - API: incrementForAccount(accountId), getTodayCountForAccount(accountId) 등
 * - 기존 postLimitManager는 무변경 — UI 통계 fallback 그대로
 */

import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';

export interface PerAccountPostState {
  readonly date: string;
  readonly count: number;
  readonly lastPublishTime: number | null;
  readonly hourlyCount: number;
  readonly lastHourReset: number | null;
}

type PerAccountStore = Record<string, PerAccountPostState>;

const ONE_HOUR_MS = 60 * 60 * 1000;

function getStorageFile(): string {
  const userData = app?.getPath?.('userData') || process.cwd();
  return path.join(userData, 'postLimitState-perAccount.json');
}

function createDefaultEntry(): PerAccountPostState {
  return {
    date: new Date().toISOString().slice(0, 10),
    count: 0,
    lastPublishTime: null,
    hourlyCount: 0,
    lastHourReset: null,
  };
}

async function readStore(): Promise<PerAccountStore> {
  try {
    const raw = await fs.readFile(getStorageFile(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as PerAccountStore;
    }
  } catch {
    /* 파일 없거나 깨짐 → 빈 store */
  }
  return {};
}

async function writeStore(store: PerAccountStore): Promise<void> {
  const file = getStorageFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store), 'utf-8');
}

function normalizeAccountId(accountId: string | undefined): string {
  const trimmed = (accountId || '').trim();
  return trimmed || '__default__';
}

/**
 * 계정별 오늘 발행 카운트 조회.
 */
export async function getTodayCountForAccount(accountId: string): Promise<number> {
  const id = normalizeAccountId(accountId);
  const store = await readStore();
  const entry = store[id];
  if (!entry) return 0;
  const today = new Date().toISOString().slice(0, 10);
  return entry.date === today ? entry.count : 0;
}

/**
 * 계정별 발행 카운트 증가 + state 영속화.
 */
export async function incrementForAccount(accountId: string): Promise<number> {
  const id = normalizeAccountId(accountId);
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const store = await readStore();
  const prev = store[id] || createDefaultEntry();

  const isNewDay = prev.date !== today;
  const isNewHour = prev.lastHourReset === null || (now - prev.lastHourReset) >= ONE_HOUR_MS;

  const next: PerAccountPostState = {
    date: today,
    count: (isNewDay ? 0 : prev.count) + 1,
    lastPublishTime: now,
    hourlyCount: (isNewHour ? 0 : prev.hourlyCount) + 1,
    lastHourReset: isNewHour ? now : (prev.lastHourReset ?? now),
  };

  store[id] = next;
  await writeStore(store);
  return next.count;
}

/**
 * 계정별 시간당 발행 가능 여부 (MAX_HOURLY 2 기본).
 */
export async function canPublishHourlyForAccount(accountId: string, maxHourly = 2): Promise<boolean> {
  const id = normalizeAccountId(accountId);
  const store = await readStore();
  const entry = store[id];
  if (!entry || entry.lastHourReset === null) return true;
  const now = Date.now();
  if ((now - entry.lastHourReset) >= ONE_HOUR_MS) return true;
  return entry.hourlyCount < maxHourly;
}

/**
 * 모든 계정 카운트 리셋 (테스트/디버깅).
 */
export async function resetAllAccounts(): Promise<void> {
  await writeStore({});
}

/**
 * 특정 계정만 리셋.
 */
export async function resetAccount(accountId: string): Promise<void> {
  const id = normalizeAccountId(accountId);
  const store = await readStore();
  delete store[id];
  await writeStore(store);
}
