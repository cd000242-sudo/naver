/**
 * [SPEC-FREEZE-GUARD-001-P2 R1 / v2.10.260] base64Async 헬퍼 단위 테스트
 *
 * UT-1~UT-8 (acceptance.md 정의). 실제 worker_threads spawn은 e2e/통합에서 검증하고,
 * 본 파일은 헬퍼의 분기/폴백/타임아웃/AbortSignal 동작을 mock pool로 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeBase64Async } from '../main/utils/base64Async';
import type { Base64Pool } from '../main/workers/base64Pool';

function makePool(impl: Partial<Base64Pool> & Pick<Base64Pool, 'isAvailable' | 'decode'>): Base64Pool {
  // 헬퍼에서 사용하는 isAvailable/decode만 만족하면 됨. 나머지 메서드는 미사용.
  return impl as Base64Pool;
}

function makeBase64(byteLength: number, fillByte = 0x41): string {
  return Buffer.alloc(byteLength, fillByte).toString('base64');
}

describe('decodeBase64Async — UT-1~UT-8 (R1 인프라 단계)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // UT-1: threshold 미만 → 동기 경로, 내용 일치
  it('UT-1: threshold 미만 입력은 동기 경로로 디코딩', async () => {
    const input = makeBase64(1024); // 1KB
    const decodeSpy = vi.fn();
    const pool = makePool({ isAvailable: () => true, decode: decodeSpy });

    const buf = await decodeBase64Async(input, { threshold: 256 * 1024, pool });

    expect(decodeSpy).not.toHaveBeenCalled();
    expect(buf).toEqual(Buffer.from(input, 'base64'));
  });

  // UT-2: threshold 이상 → 워커 경로 (pool.decode 호출), 내용 일치
  it('UT-2: threshold 이상 입력은 워커 풀로 위임', async () => {
    const raw = Buffer.alloc(2 * 1024 * 1024, 0x7e); // 2MB raw
    const input = raw.toString('base64');
    const decodeSpy = vi.fn(async (b64: string) => Buffer.from(b64, 'base64'));
    const pool = makePool({ isAvailable: () => true, decode: decodeSpy });

    const buf = await decodeBase64Async(input, { threshold: 256 * 1024, pool });

    expect(decodeSpy).toHaveBeenCalledTimes(1);
    expect(decodeSpy.mock.calls[0][0]).toBe(input);
    expect(buf.equals(raw)).toBe(true);
  });

  // UT-3: 잘못된 Base64 → Buffer.from과 동일 동작 (invalid 문자 무시)
  it('UT-3: 잘못된 Base64는 Buffer.from과 동일하게 처리', async () => {
    const input = '!!!invalid***'.padEnd(16, 'A'); // 일부러 invalid 문자 섞기 (작은 입력 → sync 경로)
    const pool = makePool({ isAvailable: () => true, decode: vi.fn() });

    const buf = await decodeBase64Async(input, { threshold: 256 * 1024, pool });
    expect(buf.equals(Buffer.from(input, 'base64'))).toBe(true);
  });

  // UT-4: 빈 문자열 → 빈 Buffer (동기 경로)
  it('UT-4: 빈 문자열은 빈 Buffer 반환', async () => {
    const decodeSpy = vi.fn();
    const pool = makePool({ isAvailable: () => true, decode: decodeSpy });

    const buf = await decodeBase64Async('', { pool });

    expect(decodeSpy).not.toHaveBeenCalled();
    expect(buf.length).toBe(0);
  });

  // UT-5: 워커 초기화 실패 → 동기 폴백 + warn 1회
  it('UT-5: 풀 unavailable 시 동기 폴백 + warn 1회', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw = Buffer.alloc(300 * 1024, 0x33); // 300KB > threshold
    const input = raw.toString('base64');
    const pool = makePool({ isAvailable: () => false, decode: vi.fn() });

    const buf1 = await decodeBase64Async(input, { threshold: 256 * 1024, pool });
    const buf2 = await decodeBase64Async(input, { threshold: 256 * 1024, pool });

    expect(buf1.equals(raw)).toBe(true);
    expect(buf2.equals(raw)).toBe(true);
    // 같은 pool에 대해 warn은 1회만
    const initWarnCalls = warnSpy.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('worker pool unavailable')
    );
    expect(initWarnCalls.length).toBe(1);
  });

  // UT-6: 워커 타임아웃 → 동기 폴백 + warn 1회
  it('UT-6: 워커 타임아웃 시 동기 폴백', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw = Buffer.alloc(300 * 1024, 0x55);
    const input = raw.toString('base64');
    const pool = makePool({
      isAvailable: () => true,
      decode: vi.fn(async () => {
        throw new Error('[base64Pool] worker timeout 5000ms');
      }),
    });

    const buf = await decodeBase64Async(input, { threshold: 256 * 1024, pool });

    expect(buf.equals(raw)).toBe(true);
    const timeoutWarn = warnSpy.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('worker decode failed')
    );
    expect(timeoutWarn).toBeTruthy();
  });

  // UT-7: 동시 호출 10개 → 모두 정상 반환
  it('UT-7: 동시 호출 10개 모두 정상 반환', async () => {
    const raw = Buffer.alloc(300 * 1024, 0x22);
    const input = raw.toString('base64');
    let inFlight = 0;
    let peak = 0;
    const pool = makePool({
      isAvailable: () => true,
      decode: vi.fn(async (b64: string) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise(r => setTimeout(r, 5));
        inFlight--;
        return Buffer.from(b64, 'base64');
      }),
    });

    const promises = Array.from({ length: 10 }, () => decodeBase64Async(input, { threshold: 256 * 1024, pool }));
    const results = await Promise.all(promises);

    expect(results).toHaveLength(10);
    for (const buf of results) {
      expect(buf.equals(raw)).toBe(true);
    }
    expect(peak).toBeGreaterThan(1); // 실제 병렬 처리됨을 확인
  });

  // UT-8: AbortSignal abort → reject + 폴백하지 않음
  it('UT-8: AbortSignal abort 시 reject (sync 폴백 하지 않음)', async () => {
    const raw = Buffer.alloc(300 * 1024, 0x44);
    const input = raw.toString('base64');
    const pool = makePool({
      isAvailable: () => true,
      decode: vi.fn(async (_b64: string, opts?: { signal?: AbortSignal }) => {
        // 워커가 AbortSignal을 받아 즉시 reject한 상태로 모사
        if (opts?.signal?.aborted) {
          throw new Error('aborted');
        }
        return Buffer.alloc(0);
      }),
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      decodeBase64Async(input, { threshold: 256 * 1024, pool, signal: controller.signal }),
    ).rejects.toThrow('aborted');
  });
});
