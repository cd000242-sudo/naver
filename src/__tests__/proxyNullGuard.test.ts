/**
 * proxyNullGuard.test.ts — Phase B (P1 §1.2) 사전 회귀 가드
 *
 * SPEC P1 Fix 1.2 — proxy null 차단: 다계정 동일 IP fallthrough 방지.
 *
 * 정책:
 * - getOrCreateSession 진입 시 proxy null + 다계정 활성 감지 → 경고
 * - env STRICT_PROXY_FOR_MULTI_ACCOUNT=1 설정 시 hard-block (throw)
 * - 기본 OFF (경고만, UX 영향 최소)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

describe('P1 §1.2 proxy null 차단 가드', () => {
  it('browserSessionManager.ts에 다계정 + proxy null 감지 경고 패턴 존재', () => {
    const src = readSrc('src/browserSessionManager.ts');
    // 경고 메시지 — proxy null + sessions.size > 0
    expect(src).toMatch(/다계정.*proxy.*null|proxy.*null.*다계정|fall-?through|동일 IP/);
  });

  it('env STRICT_PROXY_FOR_MULTI_ACCOUNT 기반 hard-block 옵션 존재', () => {
    const src = readSrc('src/browserSessionManager.ts');
    expect(src).toMatch(/STRICT_PROXY_FOR_MULTI_ACCOUNT/);
  });

  it('normalizeProxyUrl 함수 그대로 유지 (기존 동작 보호)', () => {
    const src = readSrc('src/browserSessionManager.ts');
    expect(src).toMatch(/normalizeProxyUrl/);
  });

  it('기존 proxy 변경 감지 로직 (line 265) 그대로 유지 (proxy 변경 시 세션 재시작)', () => {
    const src = readSrc('src/browserSessionManager.ts');
    expect(src).toMatch(/프록시 변경 감지/);
    expect(src).toMatch(/proxy_change/);
  });
});
