/**
 * humanBehaviorGuard.test.ts — Phase B (P5 행동 패턴) 회귀 가드
 *
 * SPEC P5: 로그인 직후 마우스 정지 = 봇 시그니처.
 * 사람은 무의식적으로 1~3회 미세 움직임 발생.
 * performIdleMouseShake() 헬퍼로 가변 jitter 적용.
 *
 * 검증:
 * - humanBehavior 모듈 export 존재
 * - naverBlogAutomation의 로그인 후 흐름에서 호출됨
 * - 함수가 try/catch 패턴으로 예외 흡수 (발행 흐름 무영향)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

describe('P5 humanBehavior 모듈 존재 보호 (v2.10.381)', () => {
  it('src/automation/humanBehavior.ts 파일 존재', () => {
    const abs = path.join(PROJECT_ROOT, 'src/automation/humanBehavior.ts');
    expect(fs.existsSync(abs)).toBe(true);
  });

  it('performIdleMouseShake 함수 export', () => {
    const src = readSrc('src/automation/humanBehavior.ts');
    expect(src).toMatch(/export\s+(async\s+)?function\s+performIdleMouseShake/);
  });

  it('performIdleMouseShake 내부에서 page.mouse.move 사용', () => {
    const src = readSrc('src/automation/humanBehavior.ts');
    expect(src).toMatch(/page\.mouse\.move/);
  });

  it('performIdleMouseShake 내부에서 steps 옵션 명시 (가변 곡선)', () => {
    const src = readSrc('src/automation/humanBehavior.ts');
    expect(src).toMatch(/steps:/);
  });

  it('performIdleMouseShake 내부에서 randomness 사용 (Math.random)', () => {
    const src = readSrc('src/automation/humanBehavior.ts');
    expect(src).toMatch(/Math\.random/);
  });
});

describe('P5 naverBlogAutomation 호출지 보호', () => {
  it('naverBlogAutomation.ts가 humanBehavior import', () => {
    const src = readSrc('src/naverBlogAutomation.ts');
    expect(src).toMatch(/from\s+['"]\.\/automation\/humanBehavior(\.js)?['"]/);
  });

  it('naverBlogAutomation.ts가 performIdleMouseShake 호출', () => {
    const src = readSrc('src/naverBlogAutomation.ts');
    expect(src).toMatch(/performIdleMouseShake\s*\(/);
  });

  it('호출이 예외 흡수 패턴 (try/catch 또는 .catch)', () => {
    const src = readSrc('src/naverBlogAutomation.ts');
    // performIdleMouseShake 호출 라인이 .catch 또는 try 블록 내부
    const lines = src.split('\n');
    const callIdx = lines.findIndex((l) => /performIdleMouseShake\s*\(/.test(l));
    expect(callIdx).toBeGreaterThanOrEqual(0);
    const callLine = lines[callIdx];
    const hasCatch = /\.catch\(/.test(callLine);
    // 또는 try 블록 내부 (이전 50줄 내 'try {' + 이후 50줄 내 'catch')
    const surround = lines.slice(Math.max(0, callIdx - 50), Math.min(lines.length, callIdx + 50)).join('\n');
    const inTryBlock = /try\s*\{[\s\S]*performIdleMouseShake[\s\S]*\}\s*catch/m.test(surround);
    expect(hasCatch || inTryBlock).toBe(true);
  });
});
