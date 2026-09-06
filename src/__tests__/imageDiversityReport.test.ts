import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  IMAGE_DIVERSITY_NEAR_DUPLICATE_THRESHOLD,
  buildImageDiversityReport,
} from '../image/imageDiversityReport.js';

const reportSource = readFileSync(
  new URL('../image/imageDiversityReport.ts', import.meta.url),
  'utf8',
);

// [2026-09-06 R-A/C] Pure pairwise aHash statistics for the [ImageDiversity] log line.
describe('buildImageDiversityReport — 이미지 세트 aHash 유사도 리포트', () => {
  it('유효 해시가 2개 미만이면 쌍 0, 최소·평균 해밍은 null', () => {
    expect(buildImageDiversityReport([])).toMatchObject({
      count: 0, validCount: 0, pairs: 0, minHamming: null, meanHamming: null, nearDuplicatePairs: [],
    });
    expect(buildImageDiversityReport([0xff00ff00ff00ff00n, null])).toMatchObject({
      count: 2, validCount: 1, pairs: 0, minHamming: null, meanHamming: null, nearDuplicatePairs: [],
    });
  });

  it('n개 유효 해시는 n(n-1)/2 쌍을 만들고 null 해시는 제외한다', () => {
    const report = buildImageDiversityReport([1n, 2n, null, 4n, 8n]);
    expect(report.count).toBe(5);
    expect(report.validCount).toBe(4);
    expect(report.pairs).toBe(6);
  });

  it('최소·평균 해밍을 정확히 센다', () => {
    // 0b0000 vs 0b0011 → 2, 0b0000 vs 0b1111 → 4, 0b0011 vs 0b1111 → 2
    const report = buildImageDiversityReport([0n, 0b0011n, 0b1111n]);
    expect(report.pairs).toBe(3);
    expect(report.minHamming).toBe(2);
    expect(report.meanHamming).toBeCloseTo((2 + 4 + 2) / 3, 5);
  });

  it('64비트 전체 반전은 해밍 64', () => {
    const report = buildImageDiversityReport([0n, (1n << 64n) - 1n]);
    expect(report.minHamming).toBe(64);
    expect(report.meanHamming).toBe(64);
  });

  it('임계 6 이하 쌍만 근접쌍으로 보고하고 원래 인덱스를 유지한다 (가까운 순)', () => {
    const base = 0x0123456789abcdefn;
    const hashes = [
      base,                 // 0
      null,                 // 1 (invalid, skipped)
      base ^ 0b111n,        // 2 → distance 3 from 0
      base ^ ((1n << 40n) - 1n), // 3 → far from everything
      base ^ 0b1n,          // 4 → distance 1 from 0, 2 from index 2
    ];
    const report = buildImageDiversityReport(hashes);
    expect(IMAGE_DIVERSITY_NEAR_DUPLICATE_THRESHOLD).toBe(6);
    expect(report.threshold).toBe(6);
    expect(report.nearDuplicatePairs).toEqual([
      { a: 0, b: 4, distance: 1 },
      { a: 2, b: 4, distance: 2 },
      { a: 0, b: 2, distance: 3 },
    ]);
  });

  it('근접쌍은 가까운 순으로 최대 6개까지만 담는다', () => {
    const hashes = Array.from({ length: 8 }, (_, i) => BigInt(i));
    const report = buildImageDiversityReport(hashes);
    expect(report.pairs).toBe(28);
    expect(report.nearDuplicatePairs).toHaveLength(6);
    const distances = report.nearDuplicatePairs.map((pair) => pair.distance);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it('리포트 모듈은 sharp/imageHashUtils를 끌어오지 않는다 (렌더러·테스트 순수성)', () => {
    expect(reportSource).not.toMatch(/from\s+'sharp'/u);
    expect(reportSource).not.toMatch(/from\s+'[^']*imageHashUtils/u);
  });
});
