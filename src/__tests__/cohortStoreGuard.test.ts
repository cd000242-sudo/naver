/**
 * cohortStoreGuard.test.ts — SPEC-MOAT-2026 Phase 0.2 회귀 가드
 *
 * Q1 (Survival baseline 측정) + Q4 (정지율 SLA 데이터 인프라).
 *
 * 검증:
 * - 옵트인 강제 (env COHORT_TELEMETRY_ENABLED=true 없으면 record no-op)
 * - 익명화 강제 (hashedAccountId만 저장, 원본 accountId 노출 X)
 * - 30/60/90일 생존율 집계 정확성
 * - append-only (기존 데이터 손상 X)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

// Test 격리 — cohortStore의 path override env 사용 (vi.mock보다 timing 안정).
const MOCK_FILE = path.join(os.tmpdir(), `cohortStoreTest_${Date.now()}_${Math.floor(Math.random() * 1e9)}.json`);
process.env.COHORT_STORE_PATH_OVERRIDE = MOCK_FILE;

function clearCohortFile(): void {
  try { if (fs.existsSync(MOCK_FILE)) fs.unlinkSync(MOCK_FILE); } catch { /* ignore */ }
}

describe('Phase 0.2: cohortStore 모듈 존재', () => {
  it('src/account/cohortStore.ts 파일 존재', () => {
    const abs = path.join(PROJECT_ROOT, 'src/account/cohortStore.ts');
    expect(fs.existsSync(abs)).toBe(true);
  });

  it('CohortEvent interface export', () => {
    const src = readSrc('src/account/cohortStore.ts');
    expect(src).toMatch(/export\s+interface\s+CohortEvent/);
  });

  it('필수 API 5개 export', () => {
    const src = readSrc('src/account/cohortStore.ts');
    expect(src).toMatch(/export\s+(async\s+)?function\s+recordCohortEvent/);
    expect(src).toMatch(/export\s+(async\s+)?function\s+loadCohortEvents/);
    expect(src).toMatch(/export\s+(async\s+)?function\s+computeSurvivalRate/);
    expect(src).toMatch(/export\s+function\s+isCohortTelemetryEnabled/);
    expect(src).toMatch(/export\s+function\s+hashAccountId/);
  });

  it('익명화 = sha256 사용', () => {
    const src = readSrc('src/account/cohortStore.ts');
    expect(src).toMatch(/sha256|createHash/);
  });

  it('옵트인 = COHORT_TELEMETRY_ENABLED env 체크', () => {
    const src = readSrc('src/account/cohortStore.ts');
    expect(src).toMatch(/COHORT_TELEMETRY_ENABLED/);
  });
});

describe('Phase 0.2: hashAccountId 익명화', () => {
  it('동일 accountId → 항상 동일 hash (deterministic)', async () => {
    const { hashAccountId } = await import('../account/cohortStore');
    expect(hashAccountId('cd00242')).toBe(hashAccountId('cd00242'));
    expect(hashAccountId('rimi_77-')).toBe(hashAccountId('rimi_77-'));
  });

  it('다른 accountId → 다른 hash', async () => {
    const { hashAccountId } = await import('../account/cohortStore');
    expect(hashAccountId('cd00242')).not.toBe(hashAccountId('rimi_77-'));
  });

  it('원본 accountId 일부도 hash에 포함되지 않음 (sha256 64 hex)', async () => {
    const { hashAccountId } = await import('../account/cohortStore');
    const h = hashAccountId('cd00242');
    expect(h).not.toContain('cd00242');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Phase 0.2: 옵트인 게이트', () => {
  const origEnv = process.env.COHORT_TELEMETRY_ENABLED;

  afterEach(() => {
    if (origEnv === undefined) delete process.env.COHORT_TELEMETRY_ENABLED;
    else process.env.COHORT_TELEMETRY_ENABLED = origEnv;
  });

  it('env 미설정 → isCohortTelemetryEnabled() = false', async () => {
    delete process.env.COHORT_TELEMETRY_ENABLED;
    const { isCohortTelemetryEnabled } = await import('../account/cohortStore');
    expect(isCohortTelemetryEnabled()).toBe(false);
  });

  it('env false → isCohortTelemetryEnabled() = false', async () => {
    process.env.COHORT_TELEMETRY_ENABLED = 'false';
    const { isCohortTelemetryEnabled } = await import('../account/cohortStore');
    expect(isCohortTelemetryEnabled()).toBe(false);
  });

  it('env true → isCohortTelemetryEnabled() = true', async () => {
    process.env.COHORT_TELEMETRY_ENABLED = 'true';
    const { isCohortTelemetryEnabled } = await import('../account/cohortStore');
    expect(isCohortTelemetryEnabled()).toBe(true);
  });

  it('opt-in 비활성 시 recordCohortEvent → false (저장 안 됨)', async () => {
    delete process.env.COHORT_TELEMETRY_ENABLED;
    const { recordCohortEvent } = await import('../account/cohortStore');
    const ok = await recordCohortEvent({
      eventType: 'publish',
      hashedAccountId: 'abc',
      timestamp: new Date().toISOString(),
    });
    expect(ok).toBe(false);
  });
});

describe('Phase 0.2: record / load 동작', () => {
  beforeEach(() => {
    process.env.COHORT_TELEMETRY_ENABLED = 'true';
    clearCohortFile();
  });
  afterEach(() => {
    delete process.env.COHORT_TELEMETRY_ENABLED;
    clearCohortFile();
  });

  it('record → load 동일 이벤트 복원', async () => {
    const { recordCohortEvent, loadCohortEvents } = await import('../account/cohortStore');
    const ts = new Date().toISOString();
    await recordCohortEvent({
      eventType: 'publish',
      hashedAccountId: 'hash_a',
      timestamp: ts,
    });
    const events = await loadCohortEvents();
    expect(events.length).toBe(1);
    expect(events[0].hashedAccountId).toBe('hash_a');
    expect(events[0].eventType).toBe('publish');
  });

  it('record 3건 → load 3건 (append-only)', async () => {
    const { recordCohortEvent, loadCohortEvents } = await import('../account/cohortStore');
    await recordCohortEvent({ eventType: 'publish', hashedAccountId: 'a', timestamp: new Date().toISOString() });
    await recordCohortEvent({ eventType: 'publish', hashedAccountId: 'b', timestamp: new Date().toISOString() });
    await recordCohortEvent({ eventType: 'suspension', hashedAccountId: 'a', timestamp: new Date().toISOString() });
    const all = await loadCohortEvents();
    expect(all.length).toBe(3);
  });
});

describe('Phase 0.2: computeSurvivalRate 집계', () => {
  beforeEach(() => {
    process.env.COHORT_TELEMETRY_ENABLED = 'true';
    clearCohortFile();
  });
  afterEach(() => {
    delete process.env.COHORT_TELEMETRY_ENABLED;
    clearCohortFile();
  });

  it('이벤트 없음 → null 반환 (계산 불가)', async () => {
    const { computeSurvivalRate } = await import('../account/cohortStore');
    const result = await computeSurvivalRate(30);
    expect(result).toBeNull();
  });

  it('100% 생존 시나리오 — publish만 N개, suspension 0', async () => {
    const { recordCohortEvent, computeSurvivalRate } = await import('../account/cohortStore');
    // 35일 전 publish 3건 (cohort 진입)
    const oldTs = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    await recordCohortEvent({ eventType: 'publish', hashedAccountId: 'a', timestamp: oldTs });
    await recordCohortEvent({ eventType: 'publish', hashedAccountId: 'b', timestamp: oldTs });
    await recordCohortEvent({ eventType: 'publish', hashedAccountId: 'c', timestamp: oldTs });
    const result = await computeSurvivalRate(30);
    expect(result).not.toBeNull();
    expect(result!.totalCohort).toBe(3);
    expect(result!.survived).toBe(3);
    expect(result!.rate).toBe(1);
  });

  it('부분 생존 — 3 publish + 1 suspension → rate < 1', async () => {
    const { recordCohortEvent, computeSurvivalRate } = await import('../account/cohortStore');
    const oldTs = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    const recentTs = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    await recordCohortEvent({ eventType: 'publish', hashedAccountId: 'a', timestamp: oldTs });
    await recordCohortEvent({ eventType: 'publish', hashedAccountId: 'b', timestamp: oldTs });
    await recordCohortEvent({ eventType: 'publish', hashedAccountId: 'c', timestamp: oldTs });
    await recordCohortEvent({ eventType: 'suspension', hashedAccountId: 'a', timestamp: recentTs });
    const result = await computeSurvivalRate(30);
    expect(result).not.toBeNull();
    expect(result!.totalCohort).toBe(3);
    expect(result!.survived).toBe(2);
    expect(result!.rate).toBeCloseTo(2 / 3, 5);
  });
});
