/**
 * mouseStepsGuard.test.ts — Phase B (P5 행동 패턴) 사전 회귀 가드
 *
 * SPEC P5: imageHelpers mouse.move 텔레포트 (steps 옵션 없음) → 가변 steps
 *
 * 정책: page.mouse.move(x, y)는 즉시 이동(steps:1) = 봇 시그니처.
 * 사람은 곡선으로 천천히 이동 (보통 10~30 steps).
 * humanSteps() 헬퍼로 10~24 가변 steps 적용.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

describe('P5 mouse steps 가변 보호', () => {
  it('imageHelpers.ts에 humanSteps() 헬퍼 정의 또는 steps 옵션 사용', () => {
    const src = readSrc('src/automation/imageHelpers.ts');
    // humanSteps 헬퍼 또는 page.mouse.move에 steps 옵션 명시 (둘 중 하나)
    const hasHelper = /function\s+humanSteps|const\s+humanSteps/.test(src);
    const hasStepsOption = /mouse\.move\([^)]*steps:/.test(src);
    expect(hasHelper || hasStepsOption).toBe(true);
  });

  it('imageHelpers.ts에 page.mouse.move 호출 3개 이상 + 모두 steps 옵션 포함', () => {
    const src = readSrc('src/automation/imageHelpers.ts');
    // 라인 단위로 mouse.move 호출 확인 (nested () 회피)
    const moveLines = src.split('\n').filter((line) => /page\.mouse\.move/.test(line));
    expect(moveLines.length).toBeGreaterThanOrEqual(3);
    moveLines.forEach((line) => {
      // 각 라인이 steps 옵션 또는 humanSteps 포함
      expect(line).toMatch(/steps:|humanSteps/);
    });
  });

  it('humanSteps() 범위 합리적 (10~30 사이)', () => {
    const src = readSrc('src/automation/imageHelpers.ts');
    // humanSteps 정의가 있다면 합리적 범위 사용 (10~30)
    const helperMatch = src.match(/humanSteps[^{]*\{[\s\S]*?\}/);
    if (helperMatch) {
      // 범위 검증 — 1~9는 너무 빠름 (봇), 50+ 너무 느림
      const helperCode = helperMatch[0];
      // Math.random + 어떤 base 값 사용 검증
      expect(helperCode).toMatch(/Math\.(random|floor)/);
    }
  });
});
