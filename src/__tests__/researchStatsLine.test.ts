// [2026-10-13 심층 리서치 A5] 생성 결과 한 줄 "자료 N건 · 확인된 사실 M · 단일 출처 K" — 파이프라인 지표 + 결과 부착 + 화면 표시 배선.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { prepareSourceMaterial, formatResearchStatsLine } from '../content/sourcePipeline';
import type { SourceDocument } from '../content/sourceDocument';

const mk = (id: string, title: string, body: string): SourceDocument => ({
  id, title, sourceType: 'news', sourceName: 'x', url: `https://news.example.com/${id}`, pubDate: '2026-10-10', dateStatus: 'KNOWN', body, sourceTier: 'NEWS',
} as SourceDocument);

const a = mk('S01', '청년도약계좌 정부기여금 월 최대 33,000원', '청년도약계좌 정부기여금은 월 최대 33,000원이다. 가입 조건은 총급여 7,500만원 이하다. 청년도약계좌 가입자는 2026년 9월 기준 180만명이다. '.repeat(6));
const b = mk('S02', '청년도약계좌 기여금 33,000원으로 확대', '청년도약계좌 정부기여금이 월 최대 33,000원으로 늘었다. 만기는 5년이며 청년도약계좌 금리는 최대 연 6%다. '.repeat(6));

describe('prepareSourceMaterial — 리서치 지표(A5)', () => {
  it('두 자료가 같은 수치를 말하면 확인된 사실로, 한 자료만 말하면 단일 출처로 센다', () => {
    const out = prepareSourceMaterial({ rawText: 'ignored', contentMode: 'seo', metadata: { sourceDocuments: [a, b] } }, '청년도약계좌');
    expect(out.metrics.corroboratedFacts).toBeGreaterThanOrEqual(1);
    expect(out.metrics.singleSourceFacts).toBeGreaterThanOrEqual(1);
    expect(out.logLine).toMatch(/corroborated=\d+ single_source=\d+/);
  });

  it('URL(원문) 모드는 리서치 지표 0·0 이고 한 줄 표시는 비어 있다', () => {
    const out = prepareSourceMaterial({ rawText: '본문 '.repeat(50), contentMode: 'seo', url: 'https://example.com/a' }, 'k');
    expect(out.metrics.corroboratedFacts).toBe(0);
    expect(out.metrics.singleSourceFacts).toBe(0);
    expect(formatResearchStatsLine(out.metrics)).toBe('');
  });

  it('한 줄 표시는 "자료 N건 · 확인된 사실 M · 단일 출처 K" 모양이다', () => {
    const line = formatResearchStatsLine({ acceptedSources: 12, corroboratedFacts: 7, singleSourceFacts: 4, usedStructured: true } as any);
    expect(line).toBe('📚 자료 12건 · 확인된 사실 7 · 단일 출처 4');
  });
});

describe('배선(소스 가드)', () => {
  it('생성기가 결과에 _researchStats 를 붙이고, 키워드 생성 화면이 그 한 줄을 로그에 쓴다', () => {
    const gen = readFileSync(resolve('src/contentGenerator.ts'), 'utf8');
    expect(gen).toContain('_researchStats:');
    expect(gen).toContain('formatResearchStatsLine(');
    const ui = readFileSync(resolve('src/renderer/modules/contentGeneration.ts'), 'utf8');
    expect(ui).toContain('_researchStats');
    expect(ui).toContain('researchLine');
  });
});
