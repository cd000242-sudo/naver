import { describe, expect, it } from 'vitest';
import { prepareSourceMaterial } from '../content/sourcePipeline';
import type { SourceDocument } from '../content/sourceDocument';

// [2026-09-22 P1] Second-pass judge verdicts (one batched selected-engine call, run by
// contentGenerator between two synchronous pipeline passes) and the Research Summary placement.

const mk = (id: string, title: string, body: string, pubDate = '2026-09-20'): SourceDocument => ({
  id, title, sourceType: 'news', sourceName: 'x', url: `https://news.example.com/${id}`, pubDate, dateStatus: 'KNOWN', body, sourceTier: 'NEWS',
} as SourceDocument);

const onTopic = mk('S01', '청약통장 금리 3.1%로 인상… 청년 주택드림은 4.5%', '청약통장 금리가 청약저축 최대 3.1%로 올랐다. 청년 주택드림 청약통장은 최대 연 4.5%다. 청약통장 가입자는 2026년 9월 기준 2,500만명이다. '.repeat(8));
const offTopic = mk('S02', '서울 아파트 전세 6억3000만원… 비아파트로 임차 수요 이동', '서울 아파트 전세 가격이 6억3000만원을 넘겼다. 금리 인상으로 주택 임차 수요가 비아파트로 이동했다. '.repeat(8));

describe('prepareSourceMaterial — judge verdicts and research summary', () => {
  it('a reject verdict flips an accepted document to REJECT_JUDGE_IRRELEVANT and records it on the ranking', () => {
    const source = { rawText: 'ignored', contentMode: 'seo', metadata: { sourceDocuments: [onTopic, offTopic] } };
    const first = prepareSourceMaterial(source, '청약통장 금리');
    const ids = first.ranking.map((e) => `${e.id}:${e.accepted}`);
    expect(ids).toContain('S01:true');
    const second = prepareSourceMaterial(source, '청약통장 금리', {
      judgeVerdicts: { S02: { verdict: 'reject', model: 'test-engine' } },
    });
    const s02 = second.ranking.find((e) => e.id === 'S02')!;
    expect(s02.accepted).toBe(false);
    expect(s02.reason).toBe('REJECT_JUDGE_IRRELEVANT');
    expect(s02.judge).toEqual({ verdict: 'reject', model: 'test-engine' });
    expect(second.documents.find((d) => d.id === 'S02')?.relevance?.accepted).toBe(false);
    expect(second.rawText).not.toContain('6억3000만원');
    expect(second.metrics.rejectedReasons.REJECT_JUDGE_IRRELEVANT ?? second.metrics.rejectedReasons.REJECT_ENTITY_MISMATCH).toBeGreaterThan(0);
  });

  it('places the research summary before the labelled documents and keeps source ids', () => {
    const source = { rawText: 'ignored', contentMode: 'seo', metadata: { sourceDocuments: [onTopic] } };
    const out = prepareSourceMaterial(source, '청약통장 금리');
    const summaryAt = out.rawText.indexOf('[리서치 요약');
    const docsAt = out.rawText.indexOf('[자료 S01]');
    expect(summaryAt).toBeGreaterThanOrEqual(0);
    expect(docsAt).toBeGreaterThan(summaryAt);
    expect(out.rawText.slice(summaryAt, docsAt)).toContain('(S01)');
    expect(out.rawText.slice(summaryAt, docsAt)).toContain('3.1%');
  });
});
