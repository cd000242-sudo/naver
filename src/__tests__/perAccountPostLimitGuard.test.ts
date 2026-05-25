/**
 * perAccountPostLimitGuard.test.ts — Phase B (P2 Fix 2.1) 회귀 가드
 *
 * SPEC P2 — 계정별 발행 카운터 분리.
 *
 * 검증:
 * - 동일 accountId 누적 → count 증가
 * - 다른 accountId 독립 → 한 계정 카운트가 다른 계정에 영향 X
 * - 빈/undefined accountId → __default__ 자동 매핑
 * - 시간당 한도 (canPublishHourly) 계정별 독립
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// app.getPath mock (Electron 없이 테스트 가능하게)
vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => {
      // OS temp dir 사용 (test 격리)
      const os = require('os');
      const path = require('path');
      return path.join(os.tmpdir(), `postLimitPerAccountTest_${Date.now()}_${Math.random()}`);
    },
  },
}));

import {
  incrementForAccount,
  getTodayCountForAccount,
  canPublishHourlyForAccount,
  resetAllAccounts,
  resetAccount,
} from '../postLimitManagerPerAccount';

describe('P2 perAccount post limit', () => {
  beforeEach(async () => {
    await resetAllAccounts();
  });

  it('빈 store에서 getTodayCountForAccount → 0', async () => {
    expect(await getTodayCountForAccount('user_a')).toBe(0);
  });

  it('incrementForAccount 1회 → count 1', async () => {
    const c = await incrementForAccount('user_a');
    expect(c).toBe(1);
    expect(await getTodayCountForAccount('user_a')).toBe(1);
  });

  it('동일 accountId 3회 increment → count 3', async () => {
    await incrementForAccount('user_a');
    await incrementForAccount('user_a');
    await incrementForAccount('user_a');
    expect(await getTodayCountForAccount('user_a')).toBe(3);
  });

  it('다른 accountId 독립 — A 증가가 B에 영향 X (격리)', async () => {
    await incrementForAccount('user_a');
    await incrementForAccount('user_a');
    expect(await getTodayCountForAccount('user_a')).toBe(2);
    expect(await getTodayCountForAccount('user_b')).toBe(0);
  });

  it('빈 accountId → __default__ 키로 매핑', async () => {
    await incrementForAccount('');
    expect(await getTodayCountForAccount('')).toBe(1);
    expect(await getTodayCountForAccount('__default__')).toBe(1);
  });

  it('canPublishHourlyForAccount: 초기 true', async () => {
    expect(await canPublishHourlyForAccount('user_a')).toBe(true);
  });

  it('canPublishHourlyForAccount: 한도(2)까지는 true, 그 후 false', async () => {
    await incrementForAccount('user_a');
    expect(await canPublishHourlyForAccount('user_a', 2)).toBe(true);
    await incrementForAccount('user_a');
    expect(await canPublishHourlyForAccount('user_a', 2)).toBe(false);
  });

  it('canPublishHourly 계정별 독립 — A 한도 도달해도 B는 발행 가능', async () => {
    await incrementForAccount('user_a');
    await incrementForAccount('user_a');
    expect(await canPublishHourlyForAccount('user_a', 2)).toBe(false);
    expect(await canPublishHourlyForAccount('user_b', 2)).toBe(true);
  });

  it('resetAccount: 특정 계정만 리셋', async () => {
    await incrementForAccount('user_a');
    await incrementForAccount('user_b');
    await resetAccount('user_a');
    expect(await getTodayCountForAccount('user_a')).toBe(0);
    expect(await getTodayCountForAccount('user_b')).toBe(1);
  });
});
