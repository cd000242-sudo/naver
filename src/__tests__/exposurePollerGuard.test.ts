/**
 * exposurePollerGuard.test.ts — Phase C Tier 1 #1+#4 회귀 가드
 *
 * 신규 src/analytics/exposurePoller.ts 모듈 + main.ts wiring 보호.
 *
 * 정책:
 * - env opt-in 패턴 (SELECTOR_PATCH_URL과 동일 패턴) — env 미설정 = dead code = 회귀 0
 * - 폴러 자체는 발행 흐름 무관 (read-only analytics)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

describe('Tier 1 #1: exposurePoller 모듈 존재', () => {
  it('src/analytics/exposurePoller.ts 파일 존재', () => {
    const abs = path.join(PROJECT_ROOT, 'src/analytics/exposurePoller.ts');
    expect(fs.existsSync(abs)).toBe(true);
  });

  it('startExposurePolling 함수 export', () => {
    const src = readSrc('src/analytics/exposurePoller.ts');
    expect(src).toMatch(/export\s+(async\s+)?function\s+startExposurePolling/);
  });

  it('stopExposurePolling 함수 export (cleanup용)', () => {
    const src = readSrc('src/analytics/exposurePoller.ts');
    expect(src).toMatch(/export\s+(async\s+)?function\s+stopExposurePolling/);
  });

  it('내부에서 loadPublishedPosts / getPostsNeedingExposureCheck / checkBatchExposure 사용', () => {
    const src = readSrc('src/analytics/exposurePoller.ts');
    expect(src).toMatch(/loadPublishedPosts/);
    expect(src).toMatch(/getPostsNeedingExposureCheck/);
    expect(src).toMatch(/checkBatchExposure/);
  });

  it('recordExposureCheck로 결과 저장 (페어링 자동화)', () => {
    const src = readSrc('src/analytics/exposurePoller.ts');
    expect(src).toMatch(/recordExposureCheck/);
  });

  it('24/48/72h 3 시점 모두 폴링', () => {
    const src = readSrc('src/analytics/exposurePoller.ts');
    // 명시적 [24, 48, 72] 배열 또는 forEach 패턴
    expect(src).toMatch(/24[\s\S]{0,50}48[\s\S]{0,50}72|hoursAfter:\s*24|hoursAfter:\s*48|hoursAfter:\s*72/);
  });

  it('setInterval 또는 setTimeout 기반 주기 트리거', () => {
    const src = readSrc('src/analytics/exposurePoller.ts');
    expect(src).toMatch(/setInterval|setTimeout/);
  });

  it('try/catch로 예외 흡수 (폴러 실패가 앱 흐름 영향 X)', () => {
    const src = readSrc('src/analytics/exposurePoller.ts');
    expect(src).toMatch(/try\s*\{/);
    expect(src).toMatch(/catch/);
  });

  it('background exposure diagnostics never pause the whole application', () => {
    const src = readSrc('src/analytics/exposurePoller.ts');
    expect(src).not.toMatch(/\.pauseAll\s*\(/);
    expect(src).toMatch(/\.recordAdvisory\s*\(/);
  });
});

describe('Tier 1 main.ts wiring 보호', () => {
  it('main.ts에 EXPOSURE_POLLER_ENABLED env opt-in 패턴', () => {
    const src = readSrc('src/main.ts');
    expect(src).toMatch(/EXPOSURE_POLLER_ENABLED/);
  });

  it('main.ts에서 startExposurePolling 호출', () => {
    const src = readSrc('src/main.ts');
    expect(src).toMatch(/startExposurePolling/);
  });

  it('호출이 try/catch로 wrap (앱 시작 실패 방지)', () => {
    const src = readSrc('src/main.ts');
    // startExposurePolling 호출 라인 주변 ±30줄에 try/catch 존재
    const lines = src.split('\n');
    const callIdx = lines.findIndex((l) => /startExposurePolling/.test(l));
    expect(callIdx).toBeGreaterThanOrEqual(0);
    const surround = lines.slice(Math.max(0, callIdx - 30), Math.min(lines.length, callIdx + 30)).join('\n');
    expect(/try\s*\{[\s\S]*startExposurePolling[\s\S]*\}\s*catch/m.test(surround)).toBe(true);
  });
});
