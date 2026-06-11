import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  evaluatePrePublishReport,
  findLeakedMarkers,
  formatPrePublishReport,
  type PrePublishStats,
} from '../automation/prePublishAssertion';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

const okStats: PrePublishStats = {
  bodyChars: 1500,
  imageCount: 3,
  linkCardCount: 1,
  dividerCount: 2,
  leakedMarkers: [],
};

const expectations = {
  minBodyChars: 500,
  expectedImageMin: 1,
  expectedLinkCardMin: 1,
  expectedDividerMin: 1,
};

describe('evaluatePrePublishReport', () => {
  it('passes when every editor stat meets the plan', () => {
    const report = evaluatePrePublishReport(okStats, expectations);
    expect(report.pass).toBe(true);
    expect(report.checks).toHaveLength(5);
    expect(report.checks.every((c) => c.pass)).toBe(true);
  });

  it('fails when the body is shorter than the planned floor', () => {
    const report = evaluatePrePublishReport({ ...okStats, bodyChars: 120 }, expectations);
    expect(report.pass).toBe(false);
    expect(report.checks.find((c) => c.name === 'body-min-chars')?.pass).toBe(false);
  });

  it('fails when planned images are completely missing', () => {
    const report = evaluatePrePublishReport({ ...okStats, imageCount: 0 }, expectations);
    expect(report.pass).toBe(false);
    expect(report.checks.find((c) => c.name === 'image-count')?.pass).toBe(false);
  });

  it('fails when the previous-post link card or tail divider is missing', () => {
    const noCard = evaluatePrePublishReport({ ...okStats, linkCardCount: 0 }, expectations);
    expect(noCard.checks.find((c) => c.name === 'link-card-count')?.pass).toBe(false);

    const noDivider = evaluatePrePublishReport({ ...okStats, dividerCount: 0 }, expectations);
    expect(noDivider.checks.find((c) => c.name === 'divider-count')?.pass).toBe(false);
  });

  it('fails when internal markers leaked into the editor text', () => {
    const report = evaluatePrePublishReport(
      { ...okStats, leakedMarkers: ['[원본 텍스트]'] },
      expectations
    );
    expect(report.pass).toBe(false);
    expect(report.checks.find((c) => c.name === 'marker-leak')?.pass).toBe(false);
  });
});

describe('findLeakedMarkers', () => {
  it('detects internal prompt markers including numbered 자료 markers', () => {
    const text = '본문입니다 [원본 텍스트] 그리고 [자료3] 인용.';
    const leaked = findLeakedMarkers(text);
    expect(leaked).toContain('[원본 텍스트]');
    expect(leaked).toContain('[자료N]');
  });

  it('returns empty for clean published text', () => {
    expect(findLeakedMarkers('깨끗한 본문입니다. 구분선 ━━━ 도 마커가 아닙니다.')).toEqual([]);
  });
});

describe('formatPrePublishReport', () => {
  it('summarizes pass count and flags suspected omissions', () => {
    const pass = formatPrePublishReport(evaluatePrePublishReport(okStats, expectations));
    expect(pass).toContain('5/5');
    expect(pass).not.toContain('누락 의심');

    const fail = formatPrePublishReport(
      evaluatePrePublishReport({ ...okStats, linkCardCount: 0 }, expectations)
    );
    expect(fail).toContain('누락 의심');
    expect(fail).toContain('link-card-count');
  });
});

describe('pre-publish assertion wiring (observation mode)', () => {
  it('runs the assertion inside publishBlogPost before the publish click', () => {
    const code = read('naverBlogAutomation.ts');
    const start = code.indexOf('async publishBlogPost(');
    expect(start).toBeGreaterThan(-1);
    const head = code.slice(start, start + 3000);
    expect(head).toMatch(/collectPrePublishStats\(/);
    expect(head).toMatch(/evaluatePrePublishReport\(/);
    // Observation mode: assertion failures must never abort the publish.
    expect(head).toMatch(/\[PrePublish\] 검사 자체 실패/);
  });

  it('stashes tail expectations at the end of applyStructuredContent and resets them per run', () => {
    const code = read('automation/editorHelpers.ts');
    expect(code).toMatch(/self\.__prePublishExpectations = null/);
    expect(code).toMatch(/self\.__prePublishExpectations = \{/);
    expect(code.indexOf('self.__prePublishExpectations = {')).toBeLessThan(
      code.indexOf('// 7. CTA 버튼 최종 확인')
    );
  });
});

// SPEC-STABILITY-2026 R6 — 단계적 차단 전환 (2026-06-12)
// 결정적 검사(본문/이미지/마커/해시태그)는 차단, 네이버 서버 의존 검사
// (링크카드/구분선)는 오탐 데이터 확보 전까지 관찰 유지.
describe('R6 staged blocking', () => {
  it('blocks only on deterministic checks', async () => {
    const { BLOCKING_CHECKS, getBlockingFailures, evaluatePrePublishReport } = await import('../automation/prePublishAssertion.js');
    expect([...BLOCKING_CHECKS].sort()).toEqual(['body-min-chars', 'hashtag-presence', 'image-count', 'marker-leak']);
    const report = evaluatePrePublishReport(
      { bodyChars: 10, imageCount: 0, linkCardCount: 0, dividerCount: 0, leakedMarkers: [], bodyText: '' },
      { minBodyChars: 500, expectedImageMin: 1, expectedLinkCardMin: 2, expectedDividerMin: 1 }
    );
    const blocking = getBlockingFailures(report);
    const names = blocking.map((c: any) => c.name).sort();
    // link-card/divider 실패는 차단 목록에 없어야 한다 (서버 의존 — 관찰 유지)
    expect(names).toEqual(['body-min-chars', 'image-count']);
  });

  it('wires blocking into publishBlogPost with rethrow + no-blind-retry', () => {
    const { readFileSync } = require('fs');
    const code = readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8');
    expect(code).toMatch(/PRE_PUBLISH_BLOCKED/);
    // 검사 자체 실패 catch가 차단 throw를 삼키면 안 된다
    expect(code).toMatch(/PRE_PUBLISH_BLOCKED'\)\)\s*throw assertErr|startsWith\('PRE_PUBLISH_BLOCKED'\)/);
    const fatalBlock = code.slice(code.indexOf('const fatalErrors'), code.indexOf('isFatalError'));
    expect(fatalBlock).toMatch(/PRE_PUBLISH_BLOCKED/);
  });
});
