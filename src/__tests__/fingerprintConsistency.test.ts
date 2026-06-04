/**
 * fingerprintConsistency.test.ts — Phase B (P3 Fingerprint 다양화) 사전 회귀 가드
 *
 * 목적: getAccountConsistentProfile 알고리즘이 회귀로 깨지지 않게 invariant 박제.
 * - 동일 accountId → 항상 동일 fingerprint (안정성, captcha 회피)
 * - 다른 accountId → 다른 fingerprint 가능 (격리, 다계정 동일 신호 차단)
 * - seed 알고리즘·옵션 풀 무결성 검증
 *
 * 향후 hardwareConcurrency/deviceMemory 추가 시 같은 패턴으로 확장.
 * 정적 파일 검증 + 순수 함수 재구현 (E2E 불필요).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BSM_PATH = path.join(PROJECT_ROOT, 'src/browserSessionManager.ts');
const readSrc = (p: string) => fs.readFileSync(p, 'utf-8');

/**
 * browserSessionManager.getAccountConsistentProfile의 seed 알고리즘 재구현
 * (private 메서드라 직접 호출 불가 — 동일 로직 검증)
 */
function seed(accountId: string): number {
  return accountId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

// 현재 풀 (변경 시 이 상수도 업데이트 필요 — 회귀 가드)
const SCREEN_POOL = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
];
const WEBGL_POOL = [
  { vendor: 'Intel Inc.', renderer: 'Intel Iris OpenGL Engine' },
  { vendor: 'Intel Inc.', renderer: 'Intel(R) UHD Graphics 630' },
  { vendor: 'NVIDIA Corporation', renderer: 'GeForce GTX 1060/PCIe/SSE2' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630)' },
];

// ═══════════════════════════════════════════════════════════════════
// 1. seed 알고리즘 안정성
// ═══════════════════════════════════════════════════════════════════
describe('Fingerprint seed 알고리즘', () => {
  it('동일 accountId → 항상 동일 seed', () => {
    expect(seed('cd00242')).toBe(seed('cd00242'));
    expect(seed('rimi_77-')).toBe(seed('rimi_77-'));
  });

  it('다른 accountId → 일반적으로 다른 seed', () => {
    // 보장은 아니지만 짧은 ID는 거의 다름
    expect(seed('cd00242')).not.toBe(seed('rimi_77-'));
  });

  it('빈 accountId → seed 0', () => {
    expect(seed('')).toBe(0);
  });

  it('seed 알고리즘이 charCodeAt 합 그대로 (변경 감지)', () => {
    expect(seed('abc')).toBe(97 + 98 + 99); // a=97, b=98, c=99
    expect(seed('1')).toBe(49); // '1'=49
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. screen pool 무결성
// ═══════════════════════════════════════════════════════════════════
describe('screen 풀 (4종 invariant)', () => {
  it('현재 풀 4개 — 변경 시 명시적 업데이트 필요', () => {
    expect(SCREEN_POOL).toHaveLength(4);
  });

  it('모든 해상도가 16:9 또는 16:10 비율 (정상 모니터)', () => {
    SCREEN_POOL.forEach((s) => {
      const ratio = s.width / s.height;
      // 16:9 = 1.777, 16:10 = 1.6, 4:3 = 1.333
      expect(ratio).toBeGreaterThanOrEqual(1.3);
      expect(ratio).toBeLessThanOrEqual(1.9);
    });
  });

  it('동일 seed → 동일 screen index (안정성)', () => {
    const a = SCREEN_POOL[seed('user_a') % SCREEN_POOL.length];
    const a2 = SCREEN_POOL[seed('user_a') % SCREEN_POOL.length];
    expect(a).toEqual(a2);
  });

  it('100개 sample 시 4종 모두 사용됨 (분산)', () => {
    const used = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const id = `account_${i}_${Math.random().toString(36).slice(2, 6)}`;
      used.add(seed(id) % SCREEN_POOL.length);
    }
    expect(used.size).toBe(SCREEN_POOL.length); // 4종 모두 분산 사용
  });

  it('browserSessionManager.ts에 screenConfigs 4개 정의 존재 보호', () => {
    const src = readSrc(BSM_PATH);
    // 정의 자체 변경 감지
    expect(src).toMatch(/screenConfigs\s*=\s*\[[\s\S]*?width:\s*1920,\s*height:\s*1080/);
    expect(src).toMatch(/screenConfigs\s*=\s*\[[\s\S]*?width:\s*1366,\s*height:\s*768/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. webGL pool 무결성
// ═══════════════════════════════════════════════════════════════════
describe('webGL 풀 (4종 invariant)', () => {
  it('현재 풀 4개 — 변경 시 명시적 업데이트 필요', () => {
    expect(WEBGL_POOL).toHaveLength(4);
  });

  it('모든 vendor가 실제 GPU 제조사 (Intel/NVIDIA/Google Inc.)', () => {
    WEBGL_POOL.forEach((g) => {
      expect(g.vendor).toMatch(/Intel|NVIDIA|Google/);
      expect(g.renderer.length).toBeGreaterThan(5);
    });
  });

  it('동일 seed → 동일 webGL index (안정성)', () => {
    const g1 = WEBGL_POOL[seed('cd00242') % WEBGL_POOL.length];
    const g2 = WEBGL_POOL[seed('cd00242') % WEBGL_POOL.length];
    expect(g1).toEqual(g2);
  });

  it('browserSessionManager.ts에 webGLConfigs 4개 정의 존재 보호', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/webGLConfigs\s*=\s*\[[\s\S]*?Intel Iris/);
    expect(src).toMatch(/webGLConfigs\s*=\s*\[[\s\S]*?NVIDIA/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. getAccountConsistentProfile 반환 타입 보호
// ═══════════════════════════════════════════════════════════════════
describe('getAccountConsistentProfile 시그니처', () => {
  it('userAgent / screen / webGL 3 필드 필수 보호', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/userAgent:\s*string\s*\|\s*null/);
    expect(src).toMatch(/screen:\s*{\s*width:\s*number;\s*height:\s*number\s*}/);
    expect(src).toMatch(/webGL:\s*{\s*vendor:\s*string;\s*renderer:\s*string\s*}/);
    expect(src).toMatch(/timezoneId:\s*string/);
    expect(src).toMatch(/locale:\s*string/);
  });

  it('userAgent === null (Stealth Plugin 위임) 보호', () => {
    const src = readSrc(BSM_PATH);
    // Stealth Plugin이 실제 Chrome 버전을 자동 동기화 — v2.10.357 이후
    expect(src).toMatch(/userAgent:\s*string\s*\|\s*null\s*=\s*null/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4-B. Locale/timezone consistency — 한국 네이버 계정 fingerprint 일관성
// ═══════════════════════════════════════════════════════════════════
describe('P3 fingerprint completeness: locale/timezone consistency', () => {
  it('Chrome launch args에 --lang=ko-KR가 포함된다', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/--lang=ko-KR/);
  });

  it('timezoneId는 Asia/Seoul로 고정되고 page.emulateTimezone에 전달된다', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/const\s+timezoneId\s*=\s*'Asia\/Seoul'/);
    expect(src).toMatch(/page\.emulateTimezone\(profile\.timezoneId\)/);
  });

  it('navigator.language와 navigator.languages가 ko-KR 계열로 맞춰진다', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/navigator,\s*['"]language['"][\s\S]{0,100}ko-KR/);
    expect(src).toMatch(/navigator,\s*['"]languages['"][\s\S]{0,140}ko-KR/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. P1 Fix 1.3 WebRTC leak 차단 보호 (v2.10.362)
// ═══════════════════════════════════════════════════════════════════
describe('P1 Fix 1.3: WebRTC leak 차단 launch args', () => {
  it('--force-webrtc-ip-handling-policy=disable_non_proxied_udp 보호', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/--force-webrtc-ip-handling-policy=disable_non_proxied_udp/);
  });

  it('--enforce-webrtc-ip-permission-check 보호', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/--enforce-webrtc-ip-permission-check/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. P3 Fix: fingerprint completeness — colorDepth/pixelDepth/maxTouchPoints (v2.10.382)
// ═══════════════════════════════════════════════════════════════════
describe('P3 fingerprint completeness (v2.10.382)', () => {
  it('screen.colorDepth = 24 주입 보호 (모던 디스플레이 일반값)', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/screen[\s\S]{0,80}colorDepth[\s\S]{0,80}24/);
  });

  it('screen.pixelDepth = 24 주입 보호', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/screen[\s\S]{0,80}pixelDepth[\s\S]{0,80}24/);
  });

  it('navigator.maxTouchPoints = 0 주입 보호 (데스크탑 기본값)', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/maxTouchPoints[\s\S]{0,80}=>\s*0/);
  });

  it('3 spoof 모두 evaluateOnNewDocument 블록 내부 (page 로드마다 적용)', () => {
    const src = readSrc(BSM_PATH);
    // evaluateOnNewDocument 블록 추출 (await page.evaluateOnNewDocument(...))
    const blockMatch = src.match(/evaluateOnNewDocument\([\s\S]*?\}, profile\);/);
    expect(blockMatch).not.toBeNull();
    const block = blockMatch![0];
    expect(block).toMatch(/colorDepth/);
    expect(block).toMatch(/pixelDepth/);
    expect(block).toMatch(/maxTouchPoints/);
  });
});
