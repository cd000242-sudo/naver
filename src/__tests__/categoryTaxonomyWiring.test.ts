import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { resolveCategory } from '../promptLoader';
import {
  ARTICLE_TYPE_TO_HINT,
  PENDING_ARTICLE_TYPES,
  resolveArticleTypeHint,
} from '../shared/categoryTaxonomy';

/**
 * [2026-08-05] 주제 선택이 프롬프트에 도달하지 못하던 배선 복구.
 *
 * 실측된 사슬:
 *   UI 슬러그 → categoryHintMap → 한국어 힌트 → resolveCategory → 카테고리 프롬프트
 *
 * 사전이 UI가 내보내지 않는 어휘를 쓰고 있었다. UI는 'travel_domestic'을 보내는데
 * 사전 키는 'travel'이라 영원히 만나지 못한다. 35개 슬러그 중 29개가 빈 힌트가 됐고,
 * main.ts:5776의 `if (categoryHint)` 가드 때문에 덮어쓰기가 생략되어
 * sourceAssembler.ts:7431이 넣은 keywords[0]가 그대로 남았다.
 * 즉 사용자가 고른 주제가 아니라 **첫 키워드**가 프롬프트를 골랐다.
 *
 * 사본이 2개(contentGeneration.ts:570, :1135)였고 'general' 값이 이미
 * 'general' vs '' 로 갈라져 있었다 — SSOT로 합친다.
 */

const UI_SLUGS = (() => {
  const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
  const select = html.match(/id="unified-article-type"[\s\S]*?<\/select>/)?.[0];
  if (!select) throw new Error('#unified-article-type select를 찾지 못했습니다');
  return [...select.matchAll(/value="([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
})();

describe('배선 — UI 슬러그가 사전에서 누락되지 않는다', () => {
  it('UI 옵션이 35종이다 (구조 변경 감지)', () => {
    expect(UI_SLUGS.length).toBe(35);
  });

  it('모든 UI 슬러그가 매핑되었거나 보류 목록에 명시돼 있다', () => {
    const covered = new Set([...Object.keys(ARTICLE_TYPE_TO_HINT), ...PENDING_ARTICLE_TYPES]);
    const missing = UI_SLUGS.filter((slug) => !covered.has(slug));
    expect(missing, '사전에도 보류 목록에도 없는 슬러그는 조용히 키워드 추첨으로 넘어간다').toEqual([]);
  });

  it('보류 목록과 매핑이 겹치지 않는다', () => {
    const overlap = PENDING_ARTICLE_TYPES.filter((slug) => slug in ARTICLE_TYPE_TO_HINT);
    expect(overlap).toEqual([]);
  });
});

describe('배선 — 매핑된 주제가 의도한 카테고리 프롬프트에 도달한다', () => {
  const EXPECTED: ReadonlyArray<readonly [string, string]> = [
    ['pet', 'pet'],
    ['fashion', 'fashion'],
    ['interior', 'living'],
    ['food_recipe', 'food'],
    ['tasty_restaurant', 'food'],
    ['travel_domestic', 'travel'],
    ['travel_world', 'travel'],
    ['it_computer', 'it'],
    ['society_politics', 'society'],
    ['business_economy', 'society'],
    ['celebrity', 'entertainment'],
    ['movie', 'entertainment'],
    ['drama', 'entertainment'],
    ['car', 'life'],
    // 기존 매핑 — 회귀 방지
    ['tips', 'tips'],
    ['parenting', 'parenting'],
    ['health', 'health'],
    ['sports', 'entertainment'],
    ['shopping_review', 'life'],
    ['general', 'general'],
  ];

  it.each(EXPECTED)('%s → %s', (slug, expected) => {
    expect(resolveCategory(resolveArticleTypeHint(slug))).toBe(expected);
  });

  it('보류 주제는 빈 힌트를 돌려준다 (현행 동작 유지)', () => {
    for (const slug of PENDING_ARTICLE_TYPES) {
      expect(resolveArticleTypeHint(slug), `${slug}`).toBe('');
    }
  });

  it('알 수 없는 슬러그는 카테고리를 주장하지 않는다', () => {
    expect(resolveArticleTypeHint('존재하지_않는_슬러그')).toBe('');
    expect(resolveArticleTypeHint(undefined)).toBe('');
    expect(resolveArticleTypeHint('')).toBe('');
  });
});

describe('배선 — 사전 사본이 남아 있지 않다', () => {
  it('contentGeneration.ts가 인라인 사전을 다시 선언하지 않는다', () => {
    const src = readFileSync(new URL('../renderer/modules/contentGeneration.ts', import.meta.url), 'utf8');
    const copies = src.match(/const categoryHintMap\s*:/g) || [];
    expect(copies.length, '사본이 갈라지면 한쪽만 고쳐 드리프트가 생긴다').toBe(0);
  });

  it('SSOT를 import해서 쓴다', () => {
    const src = readFileSync(new URL('../renderer/modules/contentGeneration.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/resolveArticleTypeHint/);
  });
});
