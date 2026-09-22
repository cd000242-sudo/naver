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

describe('scoreDocument — 본문에 한 번 스쳐 지나가는 언급은 근거가 아니다 (라이브 청약통장 금리)', () => {
  const { entities, modifiers } = extractMainEntitiesAndModifiers('청약통장 금리');
  const filler = '서울 아파트 전세 가격이 6억3000만원을 넘겼다. 금리 인상으로 임차 수요가 비아파트로 이동했고 전세 시장의 수급이 바뀌고 있다. '.repeat(14);

  it('전세 기사에 "청약통장"이 관련기사 꼬리에 한 번만 나오면 REJECT_BODY_IRRELEVANT', () => {
    const jeonse = doc('S02', {
      title: '서울 아파트 전세 6억3000만원…“비아파트로 임차 수요 이동”',
      body: `${filler}관련기사 청약통장 전환 기한 연장`,
    });
    const r = scoreDocument(jeonse, '청약통장 금리', entities, modifiers, freshnessScore(jeonse, 'NEWS_ISSUE', NOW));
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('REJECT_BODY_IRRELEVANT');
    expect(r.components.bodyRelevance).toBeLessThan(0.4);
  });

  it('본문 초반부터 여러 번 다루면 제목에 없어도 통과한다', () => {
    const onTopic = doc('S03', {
      title: '전환 기한 1년 더 연장',
      body: `청약통장 가입자라면 전환 기한을 확인해야 한다. ${'청약통장 금리는 최대 3.1%다. 청년 주택드림 청약통장은 4.5%다. '.repeat(10)}`,
    });
    const r = scoreDocument(onTopic, '청약통장 금리', entities, modifiers, freshnessScore(onTopic, 'NEWS_ISSUE', NOW));
    expect(r.accepted).toBe(true);
    expect(r.components.bodyRelevance).toBeGreaterThan(0.8);
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

describe('computeSourceRanking — 신선한 자료가 3건 미만이면 관련도 높은 과거 자료를 stale 로 남긴다', () => {
  it('홈판(NEWS_ISSUE)에서 40일 지난 핵심 기사는 REJECT_TOO_OLD 대신 stale 로 유지된다', () => {
    // distinct bodies per document — identical filler would trip the duplicate detector, not the freshness rule
    const paragraphs = [
      '변우석은 예능에서 190cm 키의 비결로 텐텐을 꼽았다. 어릴 때 김치와 우유를 함께 먹었다고 했고, 변우석의 어머니가 텐텐을 챙겨줬다는 일화도 전했다. 팬들은 변우석의 답변에 웃음을 터뜨렸다.',
      '변우석은 화보 인터뷰에서 모델 시절 마른 몸이 부끄러웠다고 털어놨다. 텐텐 이야기는 뒤에 나왔는데, 변우석은 성장기 영양제로 텐텐을 오래 먹었다고 다시 언급했다. 변우석의 소속사도 이를 확인했다.',
      '한미약품 텐텐은 발육기 비타민 제품이다. 변우석 발언 이후 텐텐 검색량이 늘었고, 변우석 팬들이 텐텐 구매 인증을 올렸다. 약사들은 텐텐이 키를 키우는 제품은 아니라고 설명했다.',
      '아이 영양제로 텐텐을 고르는 부모가 늘었다. 변우석 효과라는 말이 나오지만, 변우석처럼 크려면 유전과 수면이 더 중요하다는 소아과 의견이 많다. 텐텐은 보조제일 뿐이다.',
    ];
    const bodyFor = (n: number) => `${paragraphs[n % 4]} `.repeat(6);
    const titles = ['변우석 190cm 비결로 텐텐 언급', '변우석 화보 인터뷰서 텐텐 다시 말해', '한미약품 텐텐 검색량 급증'];
    const old = (id: string, n: number) => doc(id, { title: titles[n % 3], body: bodyFor(n), pubDate: '2026-08-10' });
    const fresh = doc('S09', { title: '변우석 텐텐 영양제 후기', body: bodyFor(3), pubDate: '2026-09-20', sourceType: 'blog', sourceTier: 'BLOG' });
    const r = computeSourceRanking([old('S01', 0), old('S02', 1), old('S03', 2), fresh], '변우석 텐텐', { now: NOW, forceTopicType: 'NEWS_ISSUE' });
    const accepted = r.ranking.filter((e) => e.accepted);
    expect(accepted.length).toBeGreaterThanOrEqual(3);
    const keptOld = r.ranked.filter((d) => d.relevance?.accepted && d.stale);
    expect(keptOld.length).toBeGreaterThanOrEqual(2);
    expect(r.ranking.filter((e) => e.reason === 'REJECT_TOO_OLD').length).toBeLessThanOrEqual(1);
  });

  it('신선한 자료가 충분하면 과거 자료는 그대로 REJECT_TOO_OLD', () => {
    const body = '청약통장 금리가 3.1%로 올랐다. 청약통장 가입자는 전환 기한을 확인해야 한다. '.repeat(12);
    const fresh = (id: string) => doc(id, { title: `청약통장 금리 ${id}`, body: `${body} ${id} 고유 문장입니다. `.repeat(3), pubDate: '2026-09-20' });
    const old = doc('S05', { title: '청약통장 금리 작년', body: `${body} 작년 기준 안내였습니다. `.repeat(3), pubDate: '2026-07-01' });
    const r = computeSourceRanking([fresh('S01'), fresh('S02'), fresh('S03'), old], '청약통장 금리', { now: NOW, forceTopicType: 'NEWS_ISSUE' });
    expect(r.ranking.find((e) => e.id === 'S05')?.reason).toBe('REJECT_TOO_OLD');
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
