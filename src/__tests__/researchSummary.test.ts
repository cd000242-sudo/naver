import { describe, expect, it } from 'vitest';
import { buildResearchSummary } from '../content/researchSummary';
import type { SourceDocument } from '../content/sourceDocument';

// [2026-09-22 P1] Research Summary is code-extracted (no model call), bounded, and keeps the
// source id on every item so the writer can attribute by organisation instead of by number.

const doc = (id: string, body: string, title = `제목 ${id}`, accepted = true): SourceDocument => ({
  id, title, sourceType: 'news', sourceName: `매체${id}`, url: `https://x.com/${id}`, dateStatus: 'KNOWN', body, sourceTier: 'NEWS',
  relevance: { score: 0.8, accepted } as any,
} as SourceDocument);

describe('buildResearchSummary', () => {
  it('extracts numeric facts, dates, statements and reader questions with source ids', () => {
    const docs = [
      doc('S01', '청년도약계좌 가입 조건은 총급여 7,500만원 이하입니다. 국토교통부에 따르면 소득 기준을 연 5,000만원에서 7,000만원으로 높인다. 2차 신청은 2026년 10월 7일부터 16일까지 진행됩니다.', '청년도약계좌 조건, 올해도 가능할까'),
      doc('S02', '정부기여금은 일반형 6%, 우대형 12%이며 취급기관별 최고금리는 연 7~8% 수준입니다.'),
    ];
    const s = buildResearchSummary(docs, '청년도약계좌 조건');
    expect(s.sourceIds).toEqual(['S01', 'S02']);
    expect(s.facts.some((f) => f.sentence.includes('7,500만원') && f.sourceId === 'S01')).toBe(true);
    expect(s.statements.some((f) => f.sentence.includes('국토교통부에 따르면'))).toBe(true);
    expect(s.dates.some((f) => f.sentence.includes('10월 7일'))).toBe(true);
    expect(s.readerQuestions).toContain('청년도약계좌 조건, 올해도 가능할까');
    expect(s.text).toContain('[리서치 요약');
    expect(s.text).toContain('(S01)');
    expect(s.text).toContain('숫자·날짜·기관명은 이 표기를 유지');
  });

  it('flags a numeric conflict between two sources on the same metric', () => {
    const docs = [
      doc('S01', '청약저축 최대 금리는 3.1%입니다.'),
      doc('S02', '청약저축 최대 금리는 2.8%로 안내됐다.'),
    ];
    const s = buildResearchSummary(docs, '청약통장 금리');
    expect(s.conflicts.length).toBeGreaterThan(0);
    expect(s.text).toContain('수치 불일치');
    expect(s.text).toMatch(/3\.1%\(S01\) vs 2\.8%\(S02\)|2\.8%\(S02\) vs 3\.1%\(S01\)/);
  });

  it('skips rejected documents and stays bounded', () => {
    const long = Array.from({ length: 80 }, (_, i) => `항목 ${i}는 ${1000 + i}원이며 매월 ${i + 1}일에 바뀝니다.`).join(' ');
    const docs = [doc('S01', long), doc('S02', '무관한 자료 5,000원', '무관', false)];
    const s = buildResearchSummary(docs, 'k');
    expect(s.sourceIds).toEqual(['S01']);
    expect(s.text.length).toBeLessThanOrEqual(3200);
    expect(s.text).not.toContain('(S02)');
  });

  it('returns an empty-but-valid summary when there are no accepted documents', () => {
    const s = buildResearchSummary([], 'k');
    expect(s.facts).toEqual([]);
    expect(s.text).toContain('자료 0건');
  });
});
