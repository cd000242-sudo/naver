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

import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({ userDataPath: '' }));

// app.getPath mock (Electron 없이 테스트 가능하게)
vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => {
      // OS temp dir 사용 (test 격리)
      const os = require('os');
      const path = require('path');
      return electronMock.userDataPath || path.join(os.tmpdir(), `postLimitPerAccountTest_${Date.now()}_${Math.random()}`);
    },
  },
}));

vi.mock('./mocks/electron', () => ({
  app: {
    getPath: () => electronMock.userDataPath,
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
  let userDataPath = '';

  beforeEach(async () => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'post-limit-per-account-'));
    electronMock.userDataPath = userDataPath;
    await resetAllAccounts();
  });

  afterEach(() => {
    fs.rmSync(userDataPath, { recursive: true, force: true });
    electronMock.userDataPath = '';
  });

  it('uses one writable OS-temp userData directory for the whole test', () => {
    const firstPath = app.getPath('userData');
    const secondPath = app.getPath('userData');
    const relativeToTemp = path.relative(os.tmpdir(), firstPath);

    expect(firstPath).toBe(userDataPath);
    expect(firstPath).toBe(secondPath);
    expect(relativeToTemp).not.toBe('..');
    expect(relativeToTemp.startsWith(`..${path.sep}`)).toBe(false);
    expect(() => fs.accessSync(firstPath, fs.constants.W_OK)).not.toThrow();
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

// ═══════════════════════════════════════════════════════════════════
// P2 §2.2 boundary fix 회귀 가드 (postLimitManager.ts 글로벌 카운터)
// ═══════════════════════════════════════════════════════════════════
describe('P2 §2.2 hourly window boundary (postLimitManager)', () => {
  it('postLimitManager.ts canPublishHourly에 >= 비교 + null 처리 보호', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/postLimitManager.ts'),
      'utf-8'
    );
    // canPublishHourly 함수 블록 추출
    const fnMatch = src.match(/export async function canPublishHourly[\s\S]*?\n}/);
    expect(fnMatch).not.toBeNull();
    const block = fnMatch![0];
    // boundary: >= (>가 아닌) + lastHourReset null 처리 보호
    expect(block).toMatch(/lastHourReset === null/);
    expect(block).toMatch(/>=\s*ONE_HOUR_MS/);
  });

  it('postLimitManager.ts incrementTodayCount에 동일 boundary 일관성 유지', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/postLimitManager.ts'),
      'utf-8'
    );
    const fnMatch = src.match(/export async function incrementTodayCount[\s\S]*?\n}/);
    expect(fnMatch).not.toBeNull();
    const block = fnMatch![0];
    expect(block).toMatch(/lastHourReset === null/);
    expect(block).toMatch(/>=\s*ONE_HOUR_MS/);
  });
});
