import { describe, expect, it } from 'vitest';

import { extractMainEntitiesAndModifiers, bigramDiceSimilarity, fuzzyContains } from '../content/sourceRelevanceEntities';
import { scoreDocument } from '../content/sourceRelevanceScoring';
import { computeSourceRanking, rankSourceDocuments } from '../content/sourceRelevanceRanking';
import { freshnessScore } from '../content/topicFreshness';
import type { SourceDocument } from '../content/sourceDocument';

const NOW = new Date('2026-09-22T00:00:00Z');

function doc(id: string, overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id,
    title: `${id} 제목`,
    sourceType: 'news',
    sourceName: '테스트 매체',
    url: `https://example-news.co.kr/${id}`,
    pubDate: '2026-09-20',
    dateStatus: 'KNOWN',
    body: '본문',
    sourceTier: 'NEWS',
    ...overrides,
  };
}

describe('extractMainEntitiesAndModifiers', () => {
  it('첫 비숫자 토큰을 주 개체로, 나머지를 수식어로 가른다', () => {
    expect(extractMainEntitiesAndModifiers('청약통장 금리')).toEqual({ entities: ['청약통장'], modifiers: ['금리'] });
  });

  it('연도처럼 앞에 오는 숫자 토큰은 건너뛰고 다음 토큰을 주 개체로 삼는다', () => {
    const { entities, modifiers } = extractMainEntitiesAndModifiers('2026 셀토스 하이브리드 모의견적');
    expect(entities).toEqual(['셀토스']);
    expect(modifiers).toEqual(expect.arrayContaining(['하이브리드', '모의견적', '2026']));
  });

  it('빈 키워드는 개체·수식어 모두 빈 배열', () => {
    expect(extractMainEntitiesAndModifiers('')).toEqual({ entities: [], modifiers: [] });
  });
});

describe('bigramDiceSimilarity / fuzzyContains', () => {
  it('동일 문자열은 1', () => {
    expect(bigramDiceSimilarity('청약통장', '청약통장')).toBe(1);
  });

  it('완전히 다른 문자열은 낮은 유사도', () => {
    expect(bigramDiceSimilarity('청약통장', '쌍꺼풀수술')).toBeLessThan(0.3);
  });

  it('fuzzyContains 는 정확히 포함되면 참', () => {
    expect(fuzzyContains('청약통장 금리 안내', '청약통장')).toBe(true);
  });

  it('fuzzyContains 는 완전히 무관한 텍스트엔 거짓', () => {
    expect(fuzzyContains('쌍꺼풀 수술 후기입니다', '청약통장')).toBe(false);
  });
});

describe('scoreDocument — 주제 밖 자료는 entity mismatch 로 기각된다', () => {
  const { entities, modifiers } = extractMainEntitiesAndModifiers('청약통장 금리');
  const freshness = freshnessScore(doc('S01'), 'NEWS_ISSUE', NOW);

  it('서울 전세 시장 기사(주택/금리만 공유)는 기각한다', () => {
    const seoulJeonse = doc('S01', {
      title: '서울 전세 시장 동향',
      body: '서울 주택 전세 시장에서 금리 인상 여파로 매물이 줄고 있다. 주택 임대차 시장 전반이 위축되는 분위기다.',
    });
    const result = scoreDocument(seoulJeonse, '청약통장 금리', entities, modifiers, freshness);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('REJECT_ENTITY_MISMATCH');
    expect(result.components.mainEntityMatch).toBe(0);
  });

  it('실제 주제와 맞는 자료는 채택한다', () => {
    const onTopic = doc('S02', {
      title: '청약통장 금리 인상 발표',
      body: '국토교통부는 청약통장 금리를 2.8%로 인상한다고 밝혔다. 적용 시점은 10월 1일부터다.',
    });
    const result = scoreDocument(onTopic, '청약통장 금리', entities, modifiers, freshness);
    expect(result.accepted).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.components.mainEntityMatch).toBeGreaterThan(0);
  });
});

describe('scoreDocument — 제목/개체는 맞아도 본문이 무관하면 기각한다', () => {
  it('REJECT_BODY_IRRELEVANT', () => {
    const { entities, modifiers } = extractMainEntitiesAndModifiers('청약통장 금리');
    const freshness = freshnessScore(doc('S01'), 'NEWS_ISSUE', NOW);
    const titleMatchesOnly = doc('S01', {
      title: '청약통장 금리 총정리',
      body: '오늘 저녁 메뉴로 무엇을 먹을지 고민하다가 근처 식당에 다녀왔다. 맛집 추천을 받아 방문했는데 만족스러웠다.',
    });
    const result = scoreDocument(titleMatchesOnly, '청약통장 금리', entities, modifiers, freshness);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('REJECT_BODY_IRRELEVANT');
  });
});

describe('scoreDocument — 낮은 등급 + 낮은 점수만 기각한다', () => {
  it('REJECT_LOW_SOURCE_QUALITY', () => {
    const { entities, modifiers } = extractMainEntitiesAndModifiers('청약통장 금리');
    const freshness = freshnessScore(doc('S01'), 'NEWS_ISSUE', NOW);
    const weakCommunityPost = doc('S01', {
      sourceTier: 'UNKNOWN',
      title: '잡담',
      body: '오늘 날씨가 좋다. 산책을 다녀왔다. 청약통장 얘기가 잠깐 나왔지만 자세한 내용은 없었다.',
    });
    const result = scoreDocument(weakCommunityPost, '청약통장 금리', entities, modifiers, freshness);
    expect(result.components.sourceQuality).toBeLessThanOrEqual(0.4);
    if (!result.accepted) {
      expect(result.reason).toBe('REJECT_LOW_SOURCE_QUALITY');
    }
  });
});

describe('computeSourceRanking — ambiguous band + 중복 제거', () => {
  it('점수가 [0.35,0.55] 구간이면 ambiguous=true 로 표시한다', () => {
    const docs = [
      doc('S01', {
        title: '청약통장 관련 이야기',
        body: '청약통장 이야기가 나왔다. 다른 주제도 섞여 있는 글이라 확신하기 어렵다. 금리 얘기는 짧게만 스쳐 지나갔다.',
        sourceTier: 'BLOG',
      }),
    ];
    const { ranking } = computeSourceRanking(docs, '청약통장 금리', { now: NOW });
    const entry = ranking[0];
    if (entry.score >= 0.35 && entry.score <= 0.55) {
      expect(entry.ambiguous).toBe(true);
    } else {
      expect(entry.ambiguous).toBe(false);
    }
  });

  it('동일 URL 문서는 두 번째부터 REJECT_DUPLICATE 로 기각한다', () => {
    const original = doc('S01', {
      title: '청약통장 금리 인상 발표',
      body: '국토교통부는 청약통장 금리를 2.8%로 인상한다고 밝혔다. 적용 시점은 10월 1일부터다.',
      url: 'https://news.example.co.kr/same-url',
    });
    const duplicate = doc('S02', {
      title: '청약통장 금리 인상 발표',
      body: '국토교통부는 청약통장 금리를 2.8%로 인상한다고 밝혔다. 적용 시점은 10월 1일부터다.',
      url: 'https://news.example.co.kr/same-url',
    });
    const { ranking } = computeSourceRanking([original, duplicate], '청약통장 금리', { now: NOW });
    const accepted = ranking.filter((r) => r.accepted);
    const rejected = ranking.filter((r) => !r.accepted);
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('REJECT_DUPLICATE');
  });

  it('거의 동일한 본문(높은 shingle 중복)도 REJECT_DUPLICATE 로 기각한다', () => {
    const bigBody = `청약통장 금리가 2.8%로 오른다. ${'세부 설명 문장입니다. '.repeat(60)}`;
    const a = doc('S01', { title: '청약통장 금리 기사 A', body: bigBody, url: 'https://news.example.co.kr/a' });
    const b = doc('S02', { title: '청약통장 금리 기사 B', body: bigBody, url: 'https://news.example.co.kr/b' });
    const { ranking } = computeSourceRanking([a, b], '청약통장 금리', { now: NOW });
    const rejected = ranking.filter((r) => !r.accepted);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('REJECT_DUPLICATE');
  });

  it('입력 배열/문서를 변형하지 않는다', () => {
    const original = doc('S01', { title: '청약통장 금리 인상', body: '청약통장 금리가 오른다.' });
    const frozen = { ...original };
    computeSourceRanking([original], '청약통장 금리', { now: NOW });
    expect(original).toEqual(frozen);
  });
});

describe('rankSourceDocuments — 비동기 judge 훅', () => {
  it('ambiguous 문서에만 judgeAmbiguous 를 호출하고 결과를 기록한다', async () => {
    const ambiguousDoc = doc('S01', {
      title: '청약통장 관련 이야기',
      body: '청약통장 이야기가 나왔다. 다른 주제도 섞여 있는 글이라 확신하기 어렵다. 금리 얘기는 짧게만 스쳐 지나갔다.',
      sourceTier: 'BLOG',
    });
    const clearDoc = doc('S02', {
      title: '청약통장 금리 인상 발표',
      body: '국토교통부는 청약통장 금리를 2.8%로 인상한다고 밝혔다. 적용 시점은 10월 1일부터다. 금리는 2.8%다.',
    });
    const calls: string[] = [];
    const fakeJudge = async (d: SourceDocument) => {
      calls.push(d.id);
      return { verdict: 'accept' as const, model: 'fake-judge-v1' };
    };
    const { ranking } = await rankSourceDocuments([ambiguousDoc, clearDoc], '청약통장 금리', {
      now: NOW,
      judgeAmbiguous: fakeJudge,
    });
    const ambiguousEntries = ranking.filter((r) => r.ambiguous);
    for (const entry of ambiguousEntries) {
      expect(calls).toContain(entry.id);
      expect(entry.judge).toEqual({ verdict: 'accept', model: 'fake-judge-v1' });
    }
    const nonAmbiguous = ranking.filter((r) => !r.ambiguous);
    for (const entry of nonAmbiguous) {
      expect(entry.judge).toBeUndefined();
    }
  });

  it('judgeAmbiguous 가 없으면 judge 호출 없이 동기 결과와 동일하다', async () => {
    const docs = [doc('S01', { title: '청약통장 금리 인상', body: '청약통장 금리가 오른다.' })];
    const sync = computeSourceRanking(docs, '청약통장 금리', { now: NOW });
    const async_ = await rankSourceDocuments(docs, '청약통장 금리', { now: NOW });
    expect(async_.ranking.map((r) => r.score)).toEqual(sync.ranking.map((r) => r.score));
  });
});
