// v2.7.63 — 100점 통합 핫픽스 회귀 가드
//
// 6개 항목 검증:
//   1. TimeoutPolicy.VL_INFERENCE_* 3 tier 존재
//   2. visionBudgetGuard 누적/차단 로직
//   3. validators IPC payload 검증
//   4. SEC-V2-H2 path traversal isPathSafe (간접: systemHandlers.ts에 함수 존재)
//   5. SEC-V2-H4 remoteUpdate HTTPS 강제
//   6. SEC-V2-H5 IPC validators 활성화

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TimeoutPolicy } from '../automation/TimeoutPolicy';
import {
  resetVisionBudget,
  chargeAndCheck,
  getVisionBudget,
} from '../crawler/visionBudgetGuard';
import {
  validateSearchImagesPayload,
  validatePathPayload,
} from '../main/ipc/validators';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('v2.7.63 — TimeoutPolicy VL_INFERENCE 3 tier', () => {
  it('FAST/STANDARD/SLOW 모두 정의', () => {
    expect(TimeoutPolicy.VL_INFERENCE_FAST).toBe(8_000);
    expect(TimeoutPolicy.VL_INFERENCE_STANDARD).toBe(12_000);
    expect(TimeoutPolicy.VL_INFERENCE_SLOW).toBe(25_000);
  });

  it('imageRelevanceScorer가 TimeoutPolicy를 import 사용', () => {
    const code = read('crawler/imageRelevanceScorer.ts');
    expect(code).toMatch(/import\s*\{[^}]*TimeoutPolicy/);
    expect(code).toMatch(/TimeoutPolicy\.VL_INFERENCE_/);
  });
});

describe('v2.7.63 — visionBudgetGuard', () => {
  beforeEach(() => resetVisionBudget());

  it('초기 상태는 0', () => {
    expect(getVisionBudget().krw).toBe(0);
    expect(getVisionBudget().calls).toBe(0);
  });

  it('Gemini Flash 1회 누적 시 ₩50', () => {
    const r = chargeAndCheck({ provider: 'gemini-flash', model: 'gemini-2.5-flash', vendor: 'gemini', fellBack: false });
    expect(r.proceed).toBe(true);
    expect(getVisionBudget().krw).toBe(50);
  });

  it('₩500 도달 시 warning, 차단은 안 됨', () => {
    for (let i = 0; i < 10; i++) chargeAndCheck({ provider: 'gemini-flash', model: '', vendor: 'gemini', fellBack: false });
    const r = chargeAndCheck({ provider: 'gemini-flash', model: '', vendor: 'gemini', fellBack: false });
    expect(r.proceed).toBe(true);
    expect(r.warning).toBeTruthy();
  });

  it('₩1500 초과 시 차단', () => {
    for (let i = 0; i < 4; i++) chargeAndCheck({ provider: 'gemini-pro', model: '', vendor: 'gemini', fellBack: false });
    const r = chargeAndCheck({ provider: 'gemini-pro', model: '', vendor: 'gemini', fellBack: false });
    expect(r.blocked).toBe(true);
    expect(r.proceed).toBe(false);
  });
});

describe('v2.7.63 — IPC payload validators (SEC-V2-H5)', () => {
  it('정상 payload 통과', () => {
    const r = validateSearchImagesPayload({ headings: ['a', 'b'], mainKeyword: '테스트' });
    expect(r.ok).toBe(true);
  });

  it('headings 배열 아님 → 거부', () => {
    const r = validateSearchImagesPayload({ headings: 'not-array', mainKeyword: 'k' });
    expect(r.ok).toBe(false);
  });

  it('headings 51개 초과 → 거부', () => {
    const arr = Array(51).fill('h');
    const r = validateSearchImagesPayload({ headings: arr, mainKeyword: 'k' });
    expect(r.ok).toBe(false);
  });

  it('null byte 포함 path → 거부', () => {
    const r = validatePathPayload('foo\0bar');
    expect(r.ok).toBe(false);
  });

  it('빈 payload → 거부', () => {
    const r = validateSearchImagesPayload(null);
    expect(r.ok).toBe(false);
  });
});

describe('v2.7.63 — SEC-V2-H2 path traversal 가드', () => {
  it('systemHandlers.ts에 isPathSafe 함수 존재', () => {
    const code = read('main/ipc/systemHandlers.ts');
    expect(code).toMatch(/function isPathSafe\(targetPath: string\): boolean/);
  });

  it('file:deleteFile에 isPathSafe 적용', () => {
    const code = read('main/ipc/systemHandlers.ts');
    expect(code).toMatch(/'file:deleteFile'[\s\S]{0,500}isPathSafe/);
  });

  it('file:readDir에 isPathSafe 적용', () => {
    const code = read('main/ipc/systemHandlers.ts');
    expect(code).toMatch(/'file:readDir'[\s\S]{0,500}isPathSafe/);
  });
});

describe('v2.7.63 — SEC-V2-H4 remoteUpdate HMAC + HTTPS', () => {
  it('fetchRemoteSelectors에 HTTPS 강제', () => {
    const code = read('automation/selectors/remoteUpdate.ts');
    expect(code).toMatch(/url\.startsWith\(['"]https:\/\/['"]\)/);
  });

  it('HMAC 검증 로직 존재', () => {
    const code = read('automation/selectors/remoteUpdate.ts');
    expect(code).toMatch(/x-selector-signature|HMAC|createHmac/);
  });
});
