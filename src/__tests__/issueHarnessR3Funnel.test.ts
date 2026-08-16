// src/__tests__/issueHarnessR3Funnel.test.ts
// R3 정제 깔때기 — dHash/해밍/지각중복/랭킹/Vision 판정 파싱 (순수 로직만, 네트워크 없음)

import { describe, it, expect } from 'vitest';
import {
  computeDhashFromRaw,
  hammingDistance,
} from '../crawler/issueHarness/candidateFetcher.js';
import {
  createPhashRegistry,
  isPerceptualDuplicate,
  orderCandidatesForFetch,
  rankCleanCandidates,
} from '../crawler/issueHarness/funnel.js';
import { parseVerdicts } from '../crawler/issueHarness/visionGate.js';

function rawFromPattern(fn: (row: number, col: number) => number): Uint8Array {
  const raw = new Uint8Array(9 * 8);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 9; col++) raw[row * 9 + col] = fn(row, col);
  }
  return raw;
}

describe('dHash + hamming', () => {
  it('같은 픽셀 패턴은 같은 해시, 거리 0', () => {
    const a = computeDhashFromRaw(rawFromPattern((r, c) => (c % 2 === 0 ? 200 : 50)));
    const b = computeDhashFromRaw(rawFromPattern((r, c) => (c % 2 === 0 ? 200 : 50)));
    expect(a).toBe(b);
    expect(hammingDistance(a, b)).toBe(0);
  });

  it('반전 패턴은 큰 해밍 거리를 가진다', () => {
    const a = computeDhashFromRaw(rawFromPattern((r, c) => (c % 2 === 0 ? 200 : 50)));
    const b = computeDhashFromRaw(rawFromPattern((r, c) => (c % 2 === 0 ? 50 : 200)));
    expect(hammingDistance(a, b)).toBe(64);
  });

  it('지각 중복 레지스트리: 거리 8 이하만 중복 판정', () => {
    const registry = createPhashRegistry();
    const base = computeDhashFromRaw(rawFromPattern((r, c) => (c % 2 === 0 ? 200 : 50)));
    registry.hashes.push(base);
    expect(isPerceptualDuplicate(registry, base)).toBe(true);
    // 3비트만 다른 해시 → 중복
    expect(isPerceptualDuplicate(registry, base ^ 0b111n)).toBe(true);
    // 반전(64비트 차이) → 중복 아님
    const far = computeDhashFromRaw(rawFromPattern((r, c) => (c % 2 === 0 ? 50 : 200)));
    expect(isPerceptualDuplicate(registry, far)).toBe(false);
  });
});

describe('candidate ordering + ranking', () => {
  it('orderCandidatesForFetch는 소스 가중치 우선, 그다음 해상도', () => {
    const pool = [
      { url: 'u1', sourceName: 'youtube', query: 'q' },
      { url: 'u2', sourceName: 'naver', query: 'q', width: 800, height: 600 },
      { url: 'u3', sourceName: 'naver', query: 'q', width: 1920, height: 1080 },
      { url: 'u4', sourceName: 'reddit', query: 'q' },
    ];
    const ordered = orderCandidatesForFetch(pool as any);
    expect(ordered[0].url).toBe('u3'); // naver + 최대 해상도
    expect(ordered[1].url).toBe('u2');
    expect(ordered[ordered.length - 1].url).toBe('u1'); // youtube 최하 가중치
    // 원본 불변
    expect(pool[0].url).toBe('u1');
  });

  it('rankCleanCandidates는 실해상도×소스 가중치로 정렬한다', () => {
    const mk = (url: string, sourceName: string, width: number, height: number) => ({
      candidate: { url, sourceName, query: 'q' },
      buffer: Buffer.alloc(0),
      width,
      height,
      dhash: 0n,
    });
    const ranked = rankCleanCandidates([
      mk('small-news', 'news-og', 640, 480),
      mk('big-youtube', 'youtube', 1920, 1080),
      mk('big-news', 'news-og', 1920, 1080),
    ] as any);
    expect(ranked[0].candidate.url).toBe('big-news');
  });
});

describe('parseVerdicts (fail-closed)', () => {
  it('정상 JSON 배열을 판정으로 매핑한다', () => {
    const verdicts = parseVerdicts(
      '[{"index":1,"clean":true,"reason":""},{"index":2,"clean":false,"reason":"자막"}]',
      2,
    );
    expect(verdicts[0].clean).toBe(true);
    expect(verdicts[1].clean).toBe(false);
    expect(verdicts[1].reason).toBe('자막');
  });

  it('파싱 불가/누락 인덱스는 전부 불통과(fail-closed)', () => {
    expect(parseVerdicts('말도 안 되는 응답', 2).every((v) => !v.clean)).toBe(true);
    const partial = parseVerdicts('[{"index":1,"clean":true}]', 3);
    expect(partial[0].clean).toBe(true);
    expect(partial[1].clean).toBe(false);
    expect(partial[2].clean).toBe(false);
  });

  it('clean이 true가 아닌 모든 값은 불통과로 처리한다', () => {
    const verdicts = parseVerdicts('[{"index":1,"clean":"yes"}]', 1);
    expect(verdicts[0].clean).toBe(false);
  });
});
