/**
 * stageClassifierGuard.test.ts — SPEC-MOAT-2026 Phase 0.1 회귀 가드
 *
 * Q3 (단가 갭) + Q2 (Operator) + Q1 (Survival) 통합 — 사용자 stage 자동 분류.
 *
 * 분류 규칙 (Q3 §4.3 표 기준):
 *   - novice  : 1계정, 발행 <5/주
 *   - fulltime: 1-2계정, 발행 5+/주, 카테고리 1-3
 *   - operator: 3+계정, 발행 분산
 *   - agency  : 5+계정 + client 분리 (현재 client 미구현 → 5+계정만 만족 시 operator 유지)
 *
 * 정책:
 * - pure function (외부 IO 없음 — 입력만으로 결정)
 * - 모든 경계 조건 명시적 테스트 (회귀 방지)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

describe('Phase 0.1: stageClassifier 모듈 존재', () => {
  it('src/account/stageClassifier.ts 파일 존재', () => {
    const abs = path.join(PROJECT_ROOT, 'src/account/stageClassifier.ts');
    expect(fs.existsSync(abs)).toBe(true);
  });

  it('classifyUserStage 함수 export (pure)', () => {
    const src = readSrc('src/account/stageClassifier.ts');
    expect(src).toMatch(/export\s+function\s+classifyUserStage/);
  });

  it('UserStage 타입 export (4 stage 정의)', () => {
    const src = readSrc('src/account/stageClassifier.ts');
    expect(src).toMatch(/export\s+type\s+UserStage/);
    expect(src).toMatch(/'novice'/);
    expect(src).toMatch(/'fulltime'/);
    expect(src).toMatch(/'operator'/);
    expect(src).toMatch(/'agency'/);
  });

  it('StageInput 인터페이스 export (입력 명시)', () => {
    const src = readSrc('src/account/stageClassifier.ts');
    expect(src).toMatch(/export\s+interface\s+StageInput/);
  });

  it('외부 IO 없음 (fs/http/electron import 금지 — pure)', () => {
    const src = readSrc('src/account/stageClassifier.ts');
    expect(src).not.toMatch(/from\s+['"](fs|fs\/promises|http|https|electron|axios|node:fs)/);
  });
});

describe('Phase 0.1: stage 분류 룰 (4 케이스)', () => {
  // Pure function이므로 직접 import 가능
  it('1계정 + 발행 <5/주 → novice', async () => {
    const { classifyUserStage } = await import('../account/stageClassifier');
    expect(classifyUserStage({ accountCount: 1, weeklyPublishCount: 3, categoryCount: 1, hasClientSeparation: false })).toBe('novice');
    expect(classifyUserStage({ accountCount: 1, weeklyPublishCount: 0, categoryCount: 1, hasClientSeparation: false })).toBe('novice');
    expect(classifyUserStage({ accountCount: 1, weeklyPublishCount: 4, categoryCount: 1, hasClientSeparation: false })).toBe('novice');
  });

  it('1-2계정 + 발행 5+/주 → fulltime', async () => {
    const { classifyUserStage } = await import('../account/stageClassifier');
    expect(classifyUserStage({ accountCount: 1, weeklyPublishCount: 5, categoryCount: 2, hasClientSeparation: false })).toBe('fulltime');
    expect(classifyUserStage({ accountCount: 2, weeklyPublishCount: 10, categoryCount: 3, hasClientSeparation: false })).toBe('fulltime');
  });

  it('3+계정 (client 분리 없음) → operator', async () => {
    const { classifyUserStage } = await import('../account/stageClassifier');
    expect(classifyUserStage({ accountCount: 3, weeklyPublishCount: 10, categoryCount: 4, hasClientSeparation: false })).toBe('operator');
    expect(classifyUserStage({ accountCount: 5, weeklyPublishCount: 25, categoryCount: 5, hasClientSeparation: false })).toBe('operator');
    expect(classifyUserStage({ accountCount: 10, weeklyPublishCount: 50, categoryCount: 8, hasClientSeparation: false })).toBe('operator');
  });

  it('5+계정 + client 분리 → agency', async () => {
    const { classifyUserStage } = await import('../account/stageClassifier');
    expect(classifyUserStage({ accountCount: 5, weeklyPublishCount: 25, categoryCount: 5, hasClientSeparation: true })).toBe('agency');
    expect(classifyUserStage({ accountCount: 10, weeklyPublishCount: 50, categoryCount: 8, hasClientSeparation: true })).toBe('agency');
  });
});

describe('Phase 0.1: 경계 조건', () => {
  it('빈 계정 (0개) → novice (기본값)', async () => {
    const { classifyUserStage } = await import('../account/stageClassifier');
    expect(classifyUserStage({ accountCount: 0, weeklyPublishCount: 0, categoryCount: 0, hasClientSeparation: false })).toBe('novice');
  });

  it('5계정 + client 분리 X → operator (agency 진입 차단)', async () => {
    const { classifyUserStage } = await import('../account/stageClassifier');
    expect(classifyUserStage({ accountCount: 5, weeklyPublishCount: 25, categoryCount: 5, hasClientSeparation: false })).toBe('operator');
  });

  it('3계정 + client 분리 (5 미만이라 agency 차단) → operator', async () => {
    const { classifyUserStage } = await import('../account/stageClassifier');
    expect(classifyUserStage({ accountCount: 3, weeklyPublishCount: 15, categoryCount: 3, hasClientSeparation: true })).toBe('operator');
  });

  it('동일 입력 → 항상 동일 결과 (pure)', async () => {
    const { classifyUserStage } = await import('../account/stageClassifier');
    const input = { accountCount: 2, weeklyPublishCount: 7, categoryCount: 2, hasClientSeparation: false };
    const r1 = classifyUserStage(input);
    const r2 = classifyUserStage(input);
    const r3 = classifyUserStage(input);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });
});

describe('Phase 0.1: 향후 확장 보호', () => {
  it('STAGE_THRESHOLDS 상수 export (튜닝 가능)', () => {
    const src = readSrc('src/account/stageClassifier.ts');
    expect(src).toMatch(/export\s+const\s+STAGE_THRESHOLDS/);
  });

  it('thresholds에 fulltime/operator/agency 진입 조건 명시', () => {
    const src = readSrc('src/account/stageClassifier.ts');
    // 최소한 3 임계값 (5 발행/주, 3 계정, 5 계정)
    expect(src).toMatch(/weeklyPublish/);
    expect(src).toMatch(/operatorMinAccounts/);
    expect(src).toMatch(/agencyMinAccounts/);
  });
});
