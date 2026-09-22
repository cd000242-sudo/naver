import { describe, expect, it } from 'vitest';

import { classifyTopicType, freshnessScore, ageDaysBetween } from '../content/topicFreshness';
import type { SourceDocument } from '../content/sourceDocument';

const NOW = new Date('2026-09-22T00:00:00Z');

function doc(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: 'S01',
    title: '제목',
    sourceType: 'news',
    sourceName: '테스트 매체',
    url: 'https://example.co.kr/1',
    pubDate: '2026-09-20',
    dateStatus: 'KNOWN',
    body: '본문',
    sourceTier: 'NEWS',
    ...overrides,
  };
}

describe('classifyTopicType', () => {
  it('신청/지원/공고 류 어휘가 있으면 POLICY', () => {
    expect(classifyTopicType('부산 청년 정착지원사업 신청 조건')).toBe('POLICY');
  });

  it('견적/트림/연식 류 어휘가 있으면 CAR', () => {
    expect(classifyTopicType('셀토스 하이브리드 트림별 가격표')).toBe('CAR');
  });

  it('뉴스 비중이 높으면 NEWS_ISSUE', () => {
    const docs: SourceDocument[] = [
      doc({ id: 'S01', sourceTier: 'NEWS', sourceType: 'news' }),
      doc({ id: 'S02', sourceTier: 'NEWS', sourceType: 'news' }),
      doc({ id: 'S03', sourceTier: 'BLOG', sourceType: 'blog' }),
    ];
    expect(classifyTopicType('연예인 열애설', docs)).toBe('NEWS_ISSUE');
  });

  it('키워드에 연도가 있으면 NEWS_ISSUE', () => {
    expect(classifyTopicType('2026 이슈 총정리', [])).toBe('NEWS_ISSUE');
  });

  it('정책·자동차 어휘도 없고 뉴스 비중도 낮으면 EVERGREEN', () => {
    const docs: SourceDocument[] = [doc({ sourceTier: 'BLOG', sourceType: 'blog' })];
    expect(classifyTopicType('청약통장 금리', docs)).toBe('EVERGREEN');
  });
});

describe('ageDaysBetween', () => {
  it('일 단위 경과를 계산한다', () => {
    expect(ageDaysBetween('2026-09-20', NOW)).toBeCloseTo(2, 0);
  });

  it('파싱 불가능한 날짜는 Infinity', () => {
    expect(ageDaysBetween('not-a-date', NOW)).toBe(Infinity);
  });
});

describe('freshnessScore', () => {
  it('UNKNOWN_DATE 문서는 고정 0.3점, tooOld 는 항상 false', () => {
    const result = freshnessScore(doc({ dateStatus: 'UNKNOWN_DATE', pubDate: undefined }), 'NEWS_ISSUE', NOW);
    expect(result.score).toBe(0.3);
    expect(result.tooOld).toBe(false);
    expect(result.ageDays).toBeNull();
  });

  it('NEWS_ISSUE 는 30일 넘으면 tooOld', () => {
    const fresh = freshnessScore(doc({ pubDate: '2026-09-15' }), 'NEWS_ISSUE', NOW); // 7일 전
    const old = freshnessScore(doc({ pubDate: '2026-08-01' }), 'NEWS_ISSUE', NOW); // 52일 전
    expect(fresh.tooOld).toBe(false);
    expect(old.tooOld).toBe(true);
    expect(fresh.score).toBeGreaterThan(old.score);
  });

  it('POLICY 는 365일까지, CAR 는 540일까지, EVERGREEN 은 나이로 기각하지 않는다', () => {
    const oldDoc = doc({ pubDate: '2026-03-06' }); // NOW 기준 200일 전 — 365/540일 안쪽
    expect(freshnessScore(oldDoc, 'POLICY', NOW).tooOld).toBe(false);
    expect(freshnessScore(oldDoc, 'CAR', NOW).tooOld).toBe(false);
    expect(freshnessScore(oldDoc, 'EVERGREEN', NOW).tooOld).toBe(false);

    const ancientDoc = doc({ pubDate: '2023-12-28' }); // NOW 기준 999일 전 — 365/540일 모두 초과
    expect(freshnessScore(ancientDoc, 'POLICY', NOW).tooOld).toBe(true);
    expect(freshnessScore(ancientDoc, 'CAR', NOW).tooOld).toBe(true);
    expect(freshnessScore(ancientDoc, 'EVERGREEN', NOW).tooOld).toBe(false);
  });

  it('기각되지 않았지만 반감기를 지난 문서는 stale=true', () => {
    // NEWS_ISSUE half-life 7일 — 20일이면 기각 전(< 30일)이지만 반감기를 한참 지나 stale.
    const result = freshnessScore(doc({ pubDate: '2026-09-02' }), 'NEWS_ISSUE', NOW);
    expect(result.tooOld).toBe(false);
    expect(result.stale).toBe(true);
  });

  it('갓 나온 자료는 stale=false', () => {
    const result = freshnessScore(doc({ pubDate: '2026-09-21' }), 'NEWS_ISSUE', NOW);
    expect(result.stale).toBe(false);
  });
});

describe('homefeed 강제 NEWS_ISSUE — 기존 30일 규칙과 동일한 경계', () => {
  it('30일 이내는 유지, 30일 초과는 기각 — 기존 applyFreshnessPolicy 30일 규칙과 동일', () => {
    const within = freshnessScore(doc({ pubDate: '2026-08-25' }), 'NEWS_ISSUE', NOW); // 28일 전
    const beyond = freshnessScore(doc({ pubDate: '2026-06-01' }), 'NEWS_ISSUE', NOW); // 113일 전
    expect(within.tooOld).toBe(false);
    expect(beyond.tooOld).toBe(true);
  });
});
