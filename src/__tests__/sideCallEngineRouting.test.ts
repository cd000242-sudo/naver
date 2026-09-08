import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';

import { matchImagesToHeadings } from '../imageHeadingMatcher';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-09-09 사용자 실측] "지피티로 엔진을 선택했는데 제미나이 분당한도초과가 왜 자꾸 뜨니?"
 *
 * 이미지 보조 추론 4개가 엔진 선택과 무관하게 Gemini 로 직행했다.
 *   - image:matchToHeadings       → openai/claude 를 "미지원" 이라며 Gemini 로 폴백
 *   - image:optimizeSearchQuery   → gemini.js 직행
 *   - image:extractCoreSubject    → gemini.js 직행
 *   - image:batchOptimizeSearchQueries → gemini.js 직행
 *
 * 소제목마다 호출되니 Gemini 분당 한도를 그대로 쳤다. 사장님 규칙 "보조 호출도 선택 엔진으로".
 */

describe('이미지 매칭 — 선택 엔진 호출기 우선', () => {
  const images = ['https://example.test/a.jpg', 'https://example.test/b.jpg'];
  const headings = ['첫 번째 소제목', '두 번째 소제목'];

  it('callText 가 있으면 Gemini 키가 있어도 그걸 쓴다', async () => {
    const callText = vi.fn().mockResolvedValue('[1, 0]');

    const matches = await matchImagesToHeadings(images, headings, {
      provider: 'gemini',
      geminiApiKey: 'gemini-key-should-not-be-used',
      callText,
    });

    expect(callText).toHaveBeenCalledTimes(1);
    expect(matches).toEqual([1, 0]);
  });

  it('callText 가 Perplexity 설정보다도 앞선다 (사용자 선택이 최우선)', async () => {
    const callText = vi.fn().mockResolvedValue('[0, 1]');

    await matchImagesToHeadings(images, headings, {
      provider: 'perplexity',
      perplexityApiKey: 'pplx-key',
      callText,
    });

    expect(callText).toHaveBeenCalledTimes(1);
  });

  it('callText 가 없으면 기존 경로를 그대로 탄다 (키 없으면 순차 배치)', async () => {
    const matches = await matchImagesToHeadings(images, headings, { provider: 'gemini' });
    expect(matches).toEqual([0, 1]);
  });

  it('callText 가 실패해도 다른 벤더로 넘어가지 않고 순차 배치로 떨어진다', async () => {
    const callText = vi.fn().mockRejectedValue(new Error('429'));

    const matches = await matchImagesToHeadings(images, headings, {
      provider: 'gemini',
      geminiApiKey: 'gemini-key',
      callText,
    });

    expect(callText).toHaveBeenCalledTimes(1);
    expect(matches).toEqual([0, 1]);
  });
});

describe('선택 엔진 호출기 — 개입 조건', () => {
  const helper = read('main/ipc/selectedEngineTextCaller.ts');

  it('Gemini 선택이면 개입하지 않는다 (기존 경로 유지)', () => {
    expect(helper).toMatch(/if \(!generator \|\| generator === 'gemini'\) return null;/);
  });

  it('경로를 못 만들면 다른 벤더로 몰래 넘어가지 않는다', () => {
    expect(helper).toMatch(/if \(!route\) \{/);
    expect(helper).toMatch(/return null;/);
  });

  it('사용자가 고른 엔진 해석은 공용 라우터를 쓴다', () => {
    expect(helper).toMatch(/resolveSelectedEngineRoute/);
    expect(helper).toMatch(/defaultAiProvider/);
  });
});

describe('보조 호출 4곳이 선택 엔진을 탄다 (회귀 잠금)', () => {
  const optimize = read('main/ipc/imageOptimizeHandlers.ts');
  const match = read('main/ipc/imageMatchHandlers.ts');

  it('검색어 최적화 · 핵심 주제 · 배치 최적화 셋 다 호출기를 넘긴다', () => {
    expect(optimize).toMatch(/optimizeImageSearchQuery\(title, heading, undefined, route\?\.callText\)/);
    expect(optimize).toMatch(/extractCoreSubject\(title, undefined, route\?\.callText\)/);
    expect(optimize).toMatch(/batchOptimizeImageSearchQueries\(title, headings, undefined, route\?\.callText\)/);
  });

  it('매칭이 openai/claude 를 Gemini 로 뭉개던 폴백을 되살리지 않는다', () => {
    expect(match).toMatch(/callText: route\?\.callText/);
    expect(match).not.toMatch(/는 미지원 → Gemini로 폴백합니다/);
  });

  it('키 없음 판정이 선택 엔진 해석보다 뒤에 온다', () => {
    // 앞에 있으면 OpenAI 키만 가진 사용자가 매칭을 시도조차 못 하고 순차 배치된다.
    const routeIndex = match.indexOf('await resolveSelectedEngineTextCaller()');
    const bailIndex = match.indexOf('AI API 키 없음');
    expect(routeIndex).toBeGreaterThan(-1);
    expect(bailIndex).toBeGreaterThan(routeIndex);
  });
});
