import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

// [v2.11.133] Source-density levers — root cause of thin posts was snippet-only
// sourcing (80-160 char previews, zero full text). These locks keep the
// injection wiring alive. All levers are warning-only: no publish blocking.
describe('lever 1: full-text merge on top of snippets (keyword flows)', () => {
  const code = read('sourceAssembler.ts');

  it('exports the top-article full-text collector', () => {
    expect(code).toMatch(/export async function collectTopArticleFullTexts\(/);
    expect(code).toMatch(/FULLTEXT_TOTAL_BUDGET_CHARS = 8000/);
    expect(code).toMatch(/FULLTEXT_PER_ARTICLE_CHARS = 2500/);
  });

  it('merges full texts FIRST so downstream truncation trims snippets, not facts', () => {
    expect(code).toMatch(/collectTopArticleFullTexts\(keyword, clientId, clientSecret, logger\)/);
    expect(code).toMatch(/\$\{fullTexts\.text\}\\n\\n=== 검색 결과 스니펫 \(맥락 참고용\) ===\\n\$\{apiResult\.content\}/);
  });

  it('uses relevance sort for full-text candidates without changing snippet callers', () => {
    // New optional param defaults to 'date' — existing snippet calls unchanged.
    expect(code).toMatch(/sort: 'date' \| 'sim' = 'date'/);
    expect(code).toMatch(/'blog', 8, 'sim'/);
    expect(code).toMatch(/'news', 4, 'sim'/);
  });
});

describe('lever 2: citation mode for already-collected material (main.ts)', () => {
  const code = read('main.ts');

  it('marks substantial rawText as the citable source without an extra fetch', () => {
    expect(code).toMatch(/수집 자료 인용 모드 활성/);
    expect(code).toMatch(/\(source as any\)\.factCheckRawSource = source\.rawText;/);
  });

  it('excludes custom mode (사용자 원문 보존) from citation mode', () => {
    expect(code).toMatch(/assemblyContentMode !== 'custom' && rawLen >= 300/);
  });
});

describe('lever 3: reader-situation material from 지식iN (empathy modes)', () => {
  it('exports the kin reader-context collector with snippet fallback', () => {
    const code = read('sourceAssembler.ts');
    expect(code).toMatch(/export async function collectKinReaderContext\(/);
    expect(code).toMatch(/독자의 실제 상황 \(지식iN 질문/);
    // Full body preferred, snippet fallback when the crawl fails.
    expect(code).toMatch(/if \(body\.length < 100\) body = stripHtmlTags\(String\(item\.description \|\| ''\)\)/);
  });

  it('wires kin injection into main.ts for homefeed/business/mate before the fact-check block', () => {
    const code = read('main.ts');
    const kinIdx = code.indexOf("situationMode === 'homefeed' || situationMode === 'business' || situationMode === 'mate'");
    const ragIdx = code.indexOf('네이버 fact-check RAG 발동');
    expect(kinIdx).toBeGreaterThan(-1);
    expect(ragIdx).toBeGreaterThan(-1);
    expect(kinIdx).toBeLessThan(ragIdx);
  });
});

describe('lever 5: affiliate review injection and review-less fallback', () => {
  it('injects up to 600 chars per curated review (was 200 → 500 → 600)', () => {
    const code = read('promptLoader.ts');
    expect(code).toMatch(/review\.substring\(0, 600\)/);
    expect(code).not.toMatch(/review\.substring\(0, 200\)/);
    expect(code).not.toMatch(/review\.substring\(0, 500\)/);
  });

  it('feeds competitor market context when zero reviews were collected', () => {
    const code = read('sourceAssembler.ts');
    expect(code).toMatch(/export async function buildCompetitorComparisonSection\(/);
    // Definition + both affiliate success paths (initial + retry).
    const callSites = code.match(/buildCompetitorComparisonSection\(/g) || [];
    expect(callSites.length).toBeGreaterThanOrEqual(3);
    // Context-only guard: the subject product must never be swapped.
    expect(code).toMatch(/주제 상품을 바꾸거나 아래 상품을 주인공으로 쓰지 마세요/);
  });
});
