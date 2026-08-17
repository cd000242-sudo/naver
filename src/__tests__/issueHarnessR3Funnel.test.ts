// src/__tests__/issueHarnessR3Funnel.test.ts
// R3 정제 깔때기 — dHash/해밍/지각중복/랭킹/Vision 판정 파싱 (순수 로직만, 네트워크 없음)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
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

  it('[2026-08-18] 단독 인물 사진이 콜라주보다 먼저 배치된다', () => {
    const mk = (url: string, solo: boolean, width: number, height: number) => ({
      candidate: { url, sourceName: 'news-og', query: 'q' },
      buffer: Buffer.alloc(0),
      width,
      height,
      dhash: 0n,
      soloSubject: solo,
    });
    // 콜라주가 해상도는 더 높아도 단독 사진이 앞서야 한다.
    const ranked = rankCleanCandidates([
      mk('collage-3인', false, 1920, 1080),
      mk('solo-프로필', true, 640, 960),
    ] as any);
    expect(ranked[0].candidate.url).toBe('solo-프로필');
  });
});

describe('parseVerdicts (fail-closed + 관련성)', () => {
  it('정상 JSON 배열을 판정으로 매핑한다 (relevant+isPhoto+clean 모두 true여야 통과)', () => {
    const verdicts = parseVerdicts(
      '[{"index":1,"relevant":true,"isPhoto":true,"clean":true,"reason":""},{"index":2,"relevant":true,"isPhoto":true,"clean":false,"reason":"자막"}]',
      2,
    );
    expect(verdicts[0].clean).toBe(true);
    expect(verdicts[1].clean).toBe(false);
    expect(verdicts[1].reason).toBe('자막');
  });

  it('[2026-08-18] 사진이 아닌 이미지(차트 캡처·그래픽)는 탈락한다', () => {
    // 실측: 멜론 차트 캡처가 인물 사진 자리에 배치됐다 — isPhoto 요건으로 차단.
    const chart = parseVerdicts(
      '[{"index":1,"relevant":true,"isPhoto":false,"clean":true,"reason":""}]',
      1,
    );
    expect(chart[0].clean).toBe(false);
    expect(chart[0].reason).toBe('not-photo');
    // isPhoto 필드 누락도 불통과 (fail-closed)
    expect(parseVerdicts('[{"index":1,"relevant":true,"clean":true}]', 1)[0].clean).toBe(false);
  });

  it('[2026-08-17] 깨끗하지만 무관한 이미지는 탈락한다 (고양이·화보 사건)', () => {
    // 라이브 실측: relevant=false인데 clean=true를 주는 응답이 무관 사진을 통과시켰다.
    const verdicts = parseVerdicts(
      '[{"index":1,"relevant":false,"clean":true,"reason":"무관-고양이"}]',
      1,
    );
    expect(verdicts[0].clean).toBe(false);
    expect(verdicts[0].reason).toContain('무관');
  });

  it('relevant 필드가 아예 없으면 불통과 (누락 = 판정 없음)', () => {
    const verdicts = parseVerdicts('[{"index":1,"clean":true}]', 1);
    expect(verdicts[0].clean).toBe(false);
    expect(verdicts[0].reason).toBe('irrelevant');
  });

  it('파싱 불가/누락 인덱스는 전부 불통과(fail-closed)', () => {
    expect(parseVerdicts('말도 안 되는 응답', 2).every((v) => !v.clean)).toBe(true);
    const partial = parseVerdicts('[{"index":1,"relevant":true,"isPhoto":true,"clean":true}]', 3);
    expect(partial[0].clean).toBe(true);
    expect(partial[1].clean).toBe(false);
    expect(partial[2].clean).toBe(false);
  });

  it('clean이 true가 아닌 모든 값은 불통과로 처리한다', () => {
    const verdicts = parseVerdicts('[{"index":1,"relevant":true,"clean":"yes"}]', 1);
    expect(verdicts[0].clean).toBe(false);
  });
});

describe('[2026-08-17] 주체 앵커 + 키/주체 없을 때 미배치 (source 계약)', () => {
  it('Vision 프롬프트가 주체·소제목 기준 관련성을 판정한다', () => {
    const src = readFileSync(new URL('../crawler/issueHarness/visionGate.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/relevant:/);
    expect(src).toMatch(/핵심 주체/);
    // 주체 미상이면 전량 미배치
    expect(src).toMatch(/mainSubject\?\.trim\(\)[\s\S]{0,200}return \[\]/);
  });

  it('Gemini 키가 없으면 통과시키지 않고 빈 슬롯을 유지한다', () => {
    const src = readFileSync(new URL('../crawler/issueHarness/funnel.ts', import.meta.url), 'utf8');
    // 이전: clean = validated (무검증 통과) → 현재: clean = []
    expect(src).toMatch(/Gemini 키 없음[\s\S]{0,200}clean = \[\]/);
  });

  it('쿼리 팬아웃이 한글/직찍/행사 쿼리에 주체를 앵커한다', () => {
    const src = readFileSync(new URL('../crawler/issueHarness/queryFanout.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/const anchor = /);
    // 메타 소제목은 주체+프로그램으로 대체되므로 삼항 분기 형태를 함께 허용한다.
    expect(src).toMatch(/koreanQuery: meta \?[\s\S]{0,120}anchor\(/);
    expect(src).toMatch(/fandomQuery: anchor\(/);
    expect(src).toMatch(/eventQuery: meta \?[\s\S]{0,80}anchor\(/);
  });
});
