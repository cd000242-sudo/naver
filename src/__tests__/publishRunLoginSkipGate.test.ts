/**
 * publishRunLoginSkipGate.test.ts
 *
 * [2026-07-01] Regression guard: the main run() publish path MUST gate login on
 * ensureServerSession() so a valid (cookie-restored) session skips the ~148s re-login.
 * runPostOnly() already had this gate; run() lacked it, causing a full re-login every
 * publish even when "로그인:✅". This freezes the parity so it can't silently regress.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.resolve(__dirname, '../naverBlogAutomation.ts');
const code = fs.readFileSync(FILE, 'utf-8');

describe('run() 로그인 스킵 게이트 (유효 세션 재로그인 방지)', () => {
  it('both publish paths (run + runPostOnly) gate on ensureServerSession', () => {
    const gateHits = code.match(/ensureServerSession\(this\.options\.naverId\)/g) || [];
    // 최소 2회: run() + runPostOnly() 각각 1회. 하나라도 사라지면 비대칭 회귀.
    expect(gateHits.length).toBeGreaterThanOrEqual(2);
  });

  it('유효 세션이면 로그인 단계를 건너뛴다는 스킵 로그가 두 경로 모두에 존재한다', () => {
    const skipHits = code.match(/서버 세션 유효 확인 — 로그인 단계 건너뜀/g) || [];
    expect(skipHits.length).toBeGreaterThanOrEqual(2);
  });

  it('게이트 예외/timeout은 catch(() => false)로 안전하게 로그인으로 폴백한다', () => {
    expect(code).toMatch(/\.ensureServerSession\(this\.options\.naverId\)\s*\n?\s*\.catch\(\(\)\s*=>\s*false\)/);
  });

  it('스킵 게이트는 loginStart 파이프라인 로그 직후에 위치한다 (loginToNaver 무조건 호출 제거)', () => {
    const loginStartIdx = code.indexOf('PUBLISH_PIPELINE_LOG_MESSAGES.loginStart');
    expect(loginStartIdx).toBeGreaterThan(-1);
    // loginStart 로그 이후 가까운 범위 안에 게이트가 있어야 함
    const window = code.slice(loginStartIdx, loginStartIdx + 1400);
    expect(window).toContain('ensureServerSession(this.options.naverId)');
    expect(window).toContain('await this.loginToNaver();');
  });
});
