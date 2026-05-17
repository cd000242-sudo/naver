// src/main/utils/base64Async.ts
// [SPEC-FREEZE-GUARD-001-P2 R1 / v2.10.260] Base64 비동기 디코딩 공개 헬퍼
//
// 책임:
//   - threshold 미만 → 동기 Buffer.from (워커 round-trip 오버헤드 회피)
//   - threshold 이상 → 워커 풀에 위임
//   - 풀 unavailable/실패 시 동기 폴백 + 1회 warn (silent 금지)
//   - AUTOPUS_BASE64_DEBUG=1 환경변수에서 size/duration 로깅
//
// 사용 (R2 이후):
//   const buf = await decodeBase64Async(b64);
//   await fsp.writeFile(path, buf);

import { performance } from 'perf_hooks';
import { Base64Pool, globalBase64Pool } from '../workers/base64Pool';

const DEFAULT_THRESHOLD_BYTES = 256 * 1024;
const warnedPools = new WeakSet<Base64Pool>();

function warnOncePerPool(pool: Base64Pool, msg: string): void {
  if (warnedPools.has(pool)) return;
  warnedPools.add(pool);
  console.warn(msg);
}

export interface DecodeBase64AsyncOptions {
  threshold?: number;
  signal?: AbortSignal;
  debug?: boolean;
  pool?: Base64Pool;
}

export async function decodeBase64Async(
  input: string,
  opts: DecodeBase64AsyncOptions = {},
): Promise<Buffer> {
  if (typeof input !== 'string') {
    throw new TypeError('[base64Async] input must be a string');
  }
  if (opts.signal?.aborted) {
    throw new Error('aborted');
  }

  const threshold = opts.threshold ?? DEFAULT_THRESHOLD_BYTES;
  const debug = opts.debug ?? process.env.AUTOPUS_BASE64_DEBUG === '1';
  const t0 = debug ? performance.now() : 0;

  if (input.length === 0) {
    return Buffer.alloc(0);
  }

  if (input.length < threshold) {
    const buf = Buffer.from(input, 'base64');
    if (debug) {
      const dur = performance.now() - t0;
      console.log(`[base64Async] sync size=${input.length} decoded=${buf.length} dur=${dur.toFixed(2)}ms`);
    }
    return buf;
  }

  const pool = opts.pool ?? globalBase64Pool;

  if (!pool.isAvailable()) {
    warnOncePerPool(pool, '[base64Async] worker pool unavailable, falling back to sync decode');
    return decodeSyncWithDebug(input, debug, t0, 'sync-fallback-init');
  }

  try {
    const buf = await pool.decode(input, { signal: opts.signal });
    if (debug) {
      const dur = performance.now() - t0;
      console.log(`[base64Async] worker size=${input.length} decoded=${buf.length} dur=${dur.toFixed(2)}ms`);
    }
    return buf;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // AbortSignal은 폴백 대상이 아님 — 호출자에게 그대로 전파
    if (msg === 'aborted') throw e;
    warnOncePerPool(pool, `[base64Async] worker decode failed, falling back to sync: ${msg}`);
    return decodeSyncWithDebug(input, debug, t0, 'sync-fallback-error');
  }
}

function decodeSyncWithDebug(input: string, debug: boolean, t0: number, tag: string): Buffer {
  const buf = Buffer.from(input, 'base64');
  if (debug) {
    const dur = performance.now() - t0;
    console.log(`[base64Async] ${tag} size=${input.length} decoded=${buf.length} dur=${dur.toFixed(2)}ms`);
  }
  return buf;
}
