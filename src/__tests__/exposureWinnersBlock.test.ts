import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildExposureWinnersBlock } from '../content/exposureWinnersBlock';

// SPEC-HOMEFEED-EMPATHY-2026 Pillar 3 — exposure-based winners feed-back.

type Check = { position: number | null; hoursAfter: number };

function makePost(opts: {
  title: string;
  mode?: string;
  publishedAt?: string;
  checks?: Check[];
}) {
  return {
    id: `${opts.title}_${Math.round(Math.random() * 1e6)}`,
    publishedAt: opts.publishedAt ?? '2026-06-01T00:00:00.000Z',
    keyword: 'kw',
    mode: opts.mode ?? 'homefeed',
    blogId: 'blog1',
    logNo: '100',
    url: 'https://blog.naver.com/blog1/100',
    title: opts.title,
    evaluator: {
      finalScore: 80,
      modeScore: 80,
      safetyScore: 80,
      humanlikeScore: 70,
      decision: 'pass',
      details: {},
    },
    exposureChecks: (opts.checks ?? []).map((c, i) => ({
      checkedAt: `2026-06-02T0${i}:00:00.000Z`,
      hoursAfter: c.hoursAfter,
      searchedKeyword: 'kw',
      position: c.position,
      hasSmartblock: false,
    })),
  };
}

let dir: string;

function writePosts(posts: unknown[]): void {
  fs.writeFileSync(path.join(dir, 'published-posts.json'), JSON.stringify(posts, null, 2), 'utf-8');
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expwin-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('buildExposureWinnersBlock', () => {
  it('emits a winners block from >=3 exposed homefeed titles', () => {
    writePosts([
      makePost({ title: '데뷔 7년 첫 대상, 무대 뒤 진짜 이야기', checks: [{ position: 3, hoursAfter: 24 }] }),
      makePost({ title: '9억 전세가 두 배, 이 동네는 늦었다', checks: [{ position: 1, hoursAfter: 48 }] }),
      makePost({ title: '캡처 세 번 돌려본 그 장면', checks: [{ position: 7, hoursAfter: 72 }] }),
    ]);
    const block = buildExposureWinnersBlock('homefeed', dir);
    expect(block).toContain('노출 성공');
    expect(block).toContain('데뷔 7년 첫 대상');
    // ranked by best position: position 1 should appear before position 7
    expect(block.indexOf('9억 전세가')).toBeLessThan(block.indexOf('캡처 세 번'));
  });

  it('returns empty when fewer than 3 exposed posts (noise lock)', () => {
    writePosts([
      makePost({ title: 'A', checks: [{ position: 2, hoursAfter: 24 }] }),
      makePost({ title: 'B', checks: [{ position: 5, hoursAfter: 24 }] }),
    ]);
    expect(buildExposureWinnersBlock('homefeed', dir)).toBe('');
  });

  it('excludes not-exposed (position null or >10) posts', () => {
    writePosts([
      makePost({ title: 'exposed-1', checks: [{ position: 4, hoursAfter: 24 }] }),
      makePost({ title: 'exposed-2', checks: [{ position: 6, hoursAfter: 24 }] }),
      makePost({ title: 'miss-null', checks: [{ position: null, hoursAfter: 24 }] }),
      makePost({ title: 'miss-rank30', checks: [{ position: 30, hoursAfter: 24 }] }),
    ]);
    // only 2 exposed -> below MIN_WINNERS -> empty
    expect(buildExposureWinnersBlock('homefeed', dir)).toBe('');
  });

  it('filters by mode — seo winners do not leak into homefeed', () => {
    writePosts([
      makePost({ title: 'seo-1', mode: 'seo', checks: [{ position: 1, hoursAfter: 24 }] }),
      makePost({ title: 'seo-2', mode: 'seo', checks: [{ position: 2, hoursAfter: 24 }] }),
      makePost({ title: 'seo-3', mode: 'seo', checks: [{ position: 3, hoursAfter: 24 }] }),
    ]);
    expect(buildExposureWinnersBlock('homefeed', dir)).toBe('');
    expect(buildExposureWinnersBlock('seo', dir)).toContain('seo-1');
  });

  it('returns empty for missing userData path', () => {
    expect(buildExposureWinnersBlock('homefeed', '')).toBe('');
  });
});
