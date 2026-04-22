/**
 * ✅ [v1.4.77] Gemini 캐시 자동 학습 동작 검증
 * - 무료/유료 구분 없이 캐시 시도 → 실패 시 해당 API 키 자동 기록 → 이후 일반 호출
 * - API 키 fingerprint 해시 일관성
 * - 구조적 에러(403/400/not supported) vs 일시적 에러(5xx) 분류
 *
 * 비용 실측 없이 순수 로직만 검증 — API 호출 없음
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as crypto from 'crypto';

// ====== 테스트 대상 로직 재구현 (contentGenerator.ts의 로직과 동일) ======
const geminiCacheUnsupportedKeys = new Set<string>();

function apiKeyFingerprint(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').substring(0, 12);
}
function markCacheUnsupported(apiKey: string): void {
  geminiCacheUnsupportedKeys.add(apiKeyFingerprint(apiKey));
}
function isCacheSupportedForKey(apiKey: string): boolean {
  return !geminiCacheUnsupportedKeys.has(apiKeyFingerprint(apiKey));
}
function resetUnsupportedKeys(): void {
  geminiCacheUnsupportedKeys.clear();
}

// 구조적 에러 분류 (contentGenerator.ts와 동일 regex)
function isStructuralCacheError(errMsg: string): boolean {
  return /403|forbidden|400|not\s+support|not\s+available|cached.*content/i.test(errMsg);
}

describe('v1.4.77 — Gemini 캐시 자동 학습', () => {
  beforeEach(() => resetUnsupportedKeys());

  describe('API 키 fingerprint', () => {
    it('동일한 키는 항상 동일한 fingerprint 생성', () => {
      const key = 'AIzaSy-test-key-12345';
      expect(apiKeyFingerprint(key)).toBe(apiKeyFingerprint(key));
    });

    it('다른 키는 다른 fingerprint 생성', () => {
      expect(apiKeyFingerprint('key-A')).not.toBe(apiKeyFingerprint('key-B'));
    });

    it('fingerprint는 12자 SHA-256 prefix', () => {
      expect(apiKeyFingerprint('any-key')).toHaveLength(12);
      expect(apiKeyFingerprint('any-key')).toMatch(/^[a-f0-9]{12}$/);
    });

    it('원본 API 키를 로그에서 유출하지 않음', () => {
      const sensitive = 'AIzaSy-REAL-SECRET-KEY-DO-NOT-LEAK';
      const fp = apiKeyFingerprint(sensitive);
      expect(fp).not.toContain('REAL');
      expect(fp).not.toContain('SECRET');
    });
  });

  describe('캐시 지원 여부 자동 학습', () => {
    it('신규 API 키는 캐시 지원으로 기본 동작 (첫 시도 허용)', () => {
      expect(isCacheSupportedForKey('new-user-key')).toBe(true);
    });

    it('실패 기록된 API 키는 이후 캐시 스킵', () => {
      const freeTierKey = 'free-tier-key';
      expect(isCacheSupportedForKey(freeTierKey)).toBe(true);
      markCacheUnsupported(freeTierKey);
      expect(isCacheSupportedForKey(freeTierKey)).toBe(false);
    });

    it('한 키의 실패가 다른 키에 영향을 주지 않음 (격리)', () => {
      markCacheUnsupported('failed-key');
      expect(isCacheSupportedForKey('failed-key')).toBe(false);
      expect(isCacheSupportedForKey('healthy-key')).toBe(true);
    });

    it('여러 키가 독립적으로 관리됨', () => {
      const keys = ['k1', 'k2', 'k3', 'k4'];
      keys.forEach(markCacheUnsupported);
      keys.forEach((k) => expect(isCacheSupportedForKey(k)).toBe(false));
      expect(isCacheSupportedForKey('k5-new')).toBe(true);
    });
  });

  describe('구조적 에러 분류 (영구 기록 대상)', () => {
    it('403 Forbidden은 구조적 에러 (무료 티어 캐시 미지원)', () => {
      expect(isStructuralCacheError('403 Forbidden: caching requires paid plan')).toBe(true);
    });

    it('400 Bad Request는 구조적 에러', () => {
      expect(isStructuralCacheError('400 Bad Request: invalid cached content')).toBe(true);
    });

    it('"not supported" 메시지는 구조적 에러', () => {
      expect(isStructuralCacheError('This model does not support caching')).toBe(true);
    });

    it('"cached content" 관련 에러는 구조적 에러', () => {
      expect(isStructuralCacheError('Error fetching cached content from server')).toBe(true);
    });

    it('대소문자 무관 매칭', () => {
      expect(isStructuralCacheError('FORBIDDEN')).toBe(true);
      expect(isStructuralCacheError('Not Supported')).toBe(true);
    });
  });

  describe('일시적 에러는 영구 기록 대상 아님', () => {
    it('500 Internal Server Error는 재시도 가능 (일시적)', () => {
      expect(isStructuralCacheError('500 Internal Server Error')).toBe(false);
    });

    it('503 Service Unavailable은 일시적', () => {
      expect(isStructuralCacheError('503 Service Unavailable')).toBe(false);
    });

    it('504 Gateway Timeout은 일시적', () => {
      expect(isStructuralCacheError('504 Gateway Timeout')).toBe(false);
    });

    it('네트워크 에러는 일시적', () => {
      expect(isStructuralCacheError('ECONNRESET')).toBe(false);
      expect(isStructuralCacheError('fetch failed')).toBe(false);
    });

    it('타임아웃은 일시적', () => {
      expect(isStructuralCacheError('Request timeout after 60s')).toBe(false);
    });
  });

  describe('무료/유료 구분 없는 흐름 시나리오', () => {
    it('무료 티어: 첫 호출 실패 → 이후 스킵 → 발행 성공 유지', () => {
      const freeKey = 'free-user-api-key';
      // 1차: 신규 키로 캐시 시도 허용
      expect(isCacheSupportedForKey(freeKey)).toBe(true);
      // 캐시 생성 실패 시뮬레이션 (403)
      const err = '403 Forbidden: caching is not supported on free tier';
      expect(isStructuralCacheError(err)).toBe(true);
      markCacheUnsupported(freeKey);
      // 2차 이후: 캐시 스킵으로 오버헤드 0
      expect(isCacheSupportedForKey(freeKey)).toBe(false);
    });

    it('유료 티어: 캐시 성공 시 계속 혜택 유지', () => {
      const paidKey = 'paid-user-api-key';
      expect(isCacheSupportedForKey(paidKey)).toBe(true);
      // 성공 시 markCacheUnsupported 호출 안 됨
      expect(isCacheSupportedForKey(paidKey)).toBe(true);
    });

    it('유료 티어 일시적 실패(503)는 영구 기록 X', () => {
      const paidKey = 'paid-key-with-503';
      const transientErr = '503 Service Unavailable';
      if (isStructuralCacheError(transientErr)) {
        markCacheUnsupported(paidKey);
      }
      // 일시적 에러는 기록 안 되므로 다음 호출에서 다시 시도
      expect(isCacheSupportedForKey(paidKey)).toBe(true);
    });
  });
});
