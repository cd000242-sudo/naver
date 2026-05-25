/**
 * selectorRemoteUpdateWiringGuard.test.ts — Phase B (P1 §1.1) 사전 회귀 가드
 *
 * SPEC P1 Fix 1.1 — schedulePeriodicCheck 활성화 wiring 보호.
 *
 * 정책:
 * - main.ts startup에서 schedulePeriodicCheck 호출 wiring 존재
 * - SELECTOR_PATCH_URL env var 기반 활성화 (URL 미설정 시 dead code = 안전)
 * - stopPeriodicCheck cleanup wiring 유지 (v2.10.110 LEAK-1/5)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

describe('P1 §1.1 셀렉터 remoteUpdate wiring 보호', () => {
  it('main.ts에 schedulePeriodicCheck 호출 wiring 존재', () => {
    const src = readSrc('src/main.ts');
    expect(src).toMatch(/schedulePeriodicCheck/);
  });

  it('main.ts wiring이 SELECTOR_PATCH_URL env var 기반 (URL 미설정 시 dead code)', () => {
    const src = readSrc('src/main.ts');
    expect(src).toMatch(/SELECTOR_PATCH_URL|selectorPatchUrl/);
  });

  it('main.ts에 기존 stopPeriodicCheck cleanup wiring 유지 (LEAK 방지)', () => {
    const src = readSrc('src/main.ts');
    expect(src).toMatch(/stopPeriodicCheck/);
  });

  it('remoteUpdate.ts schedulePeriodicCheck export 존재', () => {
    const src = readSrc('src/automation/selectors/remoteUpdate.ts');
    expect(src).toMatch(/export function schedulePeriodicCheck/);
  });

  it('remoteUpdate.ts category union 5종 유지 (login/editor/publish/image/cta)', () => {
    const src = readSrc('src/automation/selectors/remoteUpdate.ts');
    expect(src).toMatch(/category:\s*'login'\s*\|\s*'editor'\s*\|\s*'publish'\s*\|\s*'image'\s*\|\s*'cta'/);
  });
});
