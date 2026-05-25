/**
 * typingJitterGuard.test.ts — Phase B (P5 행동 패턴) 사전 회귀 가드
 *
 * SPEC-NAVER-PROTECTION-2026 P5 Fix 5.x — editorHelpers 고정 delay 5/10/15ms → 가변.
 *
 * 정책: safeKeyboardType은 base delay 기반 jitter 적용 (mean 유지, 가변성만 도입).
 * 사용자 UX(발행 시간) 영향 최소화 + 봇 감지 회피.
 *
 * 회귀 가드:
 * - typingUtils의 humanInterKeyDelay (Box-Muller 가우시안) 함수 존재 보호
 * - safeKeyboardType이 char-by-char 가변 jitter 적용 (단순 page.keyboard.type 아님)
 * - HUMAN_TYPING_PROFILE 무결성
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

describe('P5 행동 패턴: typing jitter 보호', () => {
  it('typingUtils.ts에 humanInterKeyDelay 함수 정의 보호 (Box-Muller)', () => {
    const src = readSrc('src/automation/typingUtils.ts');
    expect(src).toMatch(/export function humanInterKeyDelay/);
    expect(src).toMatch(/Math\.sqrt\(-2\.0 \* Math\.log\(u\)\)/); // Box-Muller 알고리즘
  });

  it('humanInterKeyDelay에 pauseChance / pauseMinMs / pauseMaxMs 무결성', () => {
    const src = readSrc('src/automation/typingUtils.ts');
    expect(src).toMatch(/pauseChance/);
    expect(src).toMatch(/pauseMinMs/);
    expect(src).toMatch(/pauseMaxMs/);
  });

  it('humanKeyboardType 존재 보호 (char-by-char + jitter)', () => {
    const src = readSrc('src/automation/typingUtils.ts');
    expect(src).toMatch(/export async function humanKeyboardType/);
    expect(src).toMatch(/humanInterKeyDelay\(\)/);
  });

  it('safeKeyboardType이 가변 jitter 적용 (char-by-char 또는 base 기반 jitter)', () => {
    const src = readSrc('src/automation/typingUtils.ts');
    // safeKeyboardType 함수 블록 추출
    const fnMatch = src.match(/export async function safeKeyboardType[\s\S]*?(?=\n}\n|\nexport)/);
    expect(fnMatch).not.toBeNull();
    const fnBlock = fnMatch![0];
    // 단순 page.keyboard.type(text, options) 아님 — char-by-char 또는 jitter 적용
    // 변경 후 invariant: humanInterKeyDelay 또는 char loop 또는 jitter 변수 사용
    const hasJitter = /humanInterKeyDelay|for\s*\(.*chars|Math\.random/.test(fnBlock);
    expect(hasJitter).toBe(true);
  });
});
