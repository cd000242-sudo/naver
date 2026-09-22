import { describe, it, expect } from 'vitest';

import { parseLegacyMaterialBundle, classifySourceTier, deriveSourceName, makeSourceId } from '../content/sourceDocument';
import { renderSourceDocumentsForWriter, summarizeSourceDocuments } from '../content/sourceDocumentRender';
import { evaluateSourceRelevance, applyFreshnessPolicy, extractKeywordTokens, extractEntities } from '../content/sourceRelevance';
import type { SourceDocument } from '../content/sourceDocument';

function buildBundle(): string {
  return [
    '[자료 등급 — 이 글의 재료가 어디서 왔는지]',
    '뉴스 3건, 블로그 1건이 근거를 받칩니다.',
    '',
    '=== 사실 자료 (수치·조건·절차는 이 범위에서만 사용) ===',
    '※ 이 묶음의 이름과 번호표는 내부 표기다. 본문에 옮겨 적지 마라.',
    '※ 대괄호 안의 글 제목은 다른 사람이 쓴 글의 이름이다.',
    '[자료 1 — 청약통장 금리 인상 발표]',
    '[2026-09-20 작성 · 2일 전]',
    '국토교통부는 청약통장 금리를 2.8%로 인상한다고 밝혔다. 적용 시점은 10월 1일부터다.',
    '',
    '[자료 2 — 청약통장 가입 조건 정리]',
    '만 19세 이상 무주택 세대주는 청약통장에 가입할 수 있다. 월 최대 25만원까지 인정된다.',
    '',
    '=== 검색 결과 스니펫 (맥락 참고용) ===',
    '【청약통장 정리】 기본 조건과 한도를 정리했다.',
  ].join('\n');
}

describe('parseLegacyMaterialBundle', () => {
  it('문서 수 · 제목 · 게시일 · 스니펫 구간을 원문 그대로 되돌려준다', () => {
    const bundle = buildBundle();
    const parsed = parseLegacyMaterialBundle(bundle);
    expect(parsed).not.toBeNull();
    expect(parsed!.documents).toHaveLength(2);
    expect(parsed!.documents[0].title).toBe('청약통장 금리 인상 발표');
    expect(parsed!.documents[0].pubDate).toBe('2026-09-20');
    expect(parsed!.documents[0].dateStatus).toBe('KNOWN');
    expect(parsed!.documents[1].title).toBe('청약통장 가입 조건 정리');
    expect(parsed!.documents[1].pubDate).toBeUndefined();
    expect(parsed!.documents[1].dateStatus).toBe('UNKNOWN_DATE');
    expect(parsed!.preamble).toContain('=== 사실 자료');
    expect(parsed!.preamble).toContain('※ 이 묶음의 이름과 번호표');
    expect(parsed!.snippetSection).toContain('=== 검색 결과 스니펫');
    expect(parsed!.snippetSection).toContain('청약통장 정리');
  });

  it('"[자료 N" 표제가 하나도 없으면 null', () => {
    expect(parseLegacyMaterialBundle('평범한 텍스트입니다.')).toBeNull();
    expect(parseLegacyMaterialBundle('')).toBeNull();
  });

  it('--- 참고 자료 --- 구간에 표제가 없으면 통째로 문서 하나가 된다', () => {
    const bundle = [
      '=== 사실 자료 ===',
      '[자료 1 — 원본 기사]',
      '원본 기사 본문이다. '.repeat(20),
      '',
      '--- 참고 자료 (관련 상위글 1건) ---',
      '크롤링한 블로그 본문 그대로다. '.repeat(20),
    ].join('\n');
    const parsed = parseLegacyMaterialBundle(bundle);
    expect(parsed).not.toBeNull();
    expect(parsed!.documents).toHaveLength(2);
    expect(parsed!.documents[1].sourceType).toBe('url');
    expect(parsed!.documents[1].body).toContain('크롤링한 블로그 본문');
  });
});

describe('classifySourceTier / deriveSourceName / makeSourceId', () => {
  it('공공기관·뉴스·블로그·커뮤니티를 도메인으로 가른다', () => {
    expect(classifySourceTier('https://www.molit.go.kr/notice/1')).toBe('OFFICIAL');
    expect(classifySourceTier('https://n.news.naver.com/mnews/article/011/123')).toBe('NEWS');
    expect(classifySourceTier('https://blog.naver.com/someone/1')).toBe('BLOG');
    expect(classifySourceTier('https://kin.naver.com/qna/1')).toBe('COMMUNITY');
    expect(classifySourceTier('https://example-random-site.com/post')).toBe('UNKNOWN');
  });

  it('네이버 뉴스 URL에서 언론사 코드를 뽑는다', () => {
    expect(deriveSourceName('https://n.news.naver.com/mnews/article/011/0001234567')).toBe('네이버 뉴스(011)');
    expect(deriveSourceName('https://blog.naver.com/someone/1')).toBe('네이버 블로그');
  });

  it('makeSourceId 는 두 자리 zero-pad', () => {
    expect(makeSourceId(1)).toBe('S01');
    expect(makeSourceId(12)).toBe('S12');
  });
});

function makeDoc(overrides: Partial<SourceDocument>): SourceDocument {
  return {
    id: 'S01',
    title: '제목',
    sourceType: 'news',
    sourceName: '테스트 매체',
    url: 'https://n.news.naver.com/mnews/article/011/0001',
    dateStatus: 'UNKNOWN_DATE',
    body: '본문',
    sourceTier: 'NEWS',
    ...overrides,
  };
}

describe('renderSourceDocumentsForWriter', () => {
  it('출처·기관·URL·게시일·UNKNOWN_DATE·신뢰 등급을 담고, 번호표를 본문에 옮기지 말라고 지시한다', () => {
    const docs = [
      makeDoc({
        id: 'S01',
        title: '청약통장 금리 인상',
        sourceName: '국토교통부',
        url: 'https://www.molit.go.kr/notice/1',
        sourceType: 'official',
        sourceTier: 'OFFICIAL',
        dateStatus: 'UNKNOWN_DATE',
        body: '청약통장 금리가 2.8%로 오른다.',
      }),
    ];
    const rendered = renderSourceDocumentsForWriter(docs);
    expect(rendered).toContain('출처: 국토교통부');
    expect(rendered).toContain('기관/매체: 국토교통부');
    expect(rendered).toContain('URL: https://www.molit.go.kr/notice/1');
    expect(rendered).toContain('UNKNOWN_DATE');
    expect(rendered).toContain('신뢰 등급: OFFICIAL');
    expect(rendered).toContain('번호표');
    expect(rendered).toContain('적극적으로 써라');
    // The internal id tag must not appear inside the body text itself.
    const bodySection = rendered.split('본문:')[1];
    expect(bodySection).not.toContain('S01');
  });

  it('includeUrl:false 면 URL 줄을 뺀다', () => {
    const rendered = renderSourceDocumentsForWriter([makeDoc({})], { includeUrl: false });
    expect(rendered).not.toContain('URL:');
  });

  it('summarizeSourceDocuments 가 유형·등급·미상 날짜·채택 여부를 집계한다', () => {
    const docs = [
      makeDoc({ sourceType: 'news', sourceTier: 'NEWS', dateStatus: 'KNOWN', pubDate: '2026-09-20', relevance: { keywordScore: 0.8, entityScore: 1, accepted: true } }),
      makeDoc({ sourceType: 'blog', sourceTier: 'BLOG', dateStatus: 'UNKNOWN_DATE', relevance: { keywordScore: 0.1, entityScore: 0, accepted: false, reason: 'LOW_KEYWORD_OVERLAP' } }),
    ];
    const summary = summarizeSourceDocuments(docs);
    expect(summary.total).toBe(2);
    expect(summary.byType.news).toBe(1);
    expect(summary.byType.blog).toBe(1);
    expect(summary.byTier.NEWS).toBe(1);
    expect(summary.unknownDate).toBe(1);
    expect(summary.accepted).toBe(1);
    expect(summary.rejected).toBe(1);
  });
});

describe('sourceRelevance', () => {
  it('extractKeywordTokens 는 조사를 떼고 2자 미만은 버린다', () => {
    const tokens = extractKeywordTokens('청약통장 금리는 어떻게');
    expect(tokens).toContain('청약통장');
    expect(tokens).toContain('금리'); // "금리는"에서 조사 "는"을 뗀다
    expect(tokens).not.toContain('금리는');
  });

  it('extractEntities 는 한 번만 나온 고유명사도 잡는다', () => {
    const entities = extractEntities('국토교통부가 청약통장 금리를 발표했다');
    expect(entities).toContain('국토교통부');
  });

  it('주제와 맞는 자료는 채택, 동떨어진 자료는 기각한다', () => {
    const onTopic = makeDoc({
      title: '청약통장 금리 인상 소식',
      body: '국토교통부는 청약통장 금리를 2.8%로 인상한다고 밝혔다.',
    });
    const offTopic = makeDoc({
      title: '쌍꺼풀 수술 후기',
      body: '쌍꺼풀 수술 후 붓기가 빠지는 데 2주가 걸렸다.',
    });
    const [evalOn, evalOff] = evaluateSourceRelevance([onTopic, offTopic], '청약통장 금리');
    expect(evalOn.relevance!.accepted).toBe(true);
    expect(evalOff.relevance!.accepted).toBe(false);
    expect(evalOff.relevance!.reason).toBe('LOW_KEYWORD_OVERLAP');
  });

  it('evaluateSourceRelevance 는 입력 배열/문서를 변형하지 않는다', () => {
    const doc = makeDoc({ title: '청약통장 금리', body: '청약통장 금리 안내' });
    const docs = [doc];
    const frozenDoc = { ...doc };
    evaluateSourceRelevance(docs, '청약통장 금리');
    expect(docs[0]).toEqual(frozenDoc);
    expect(docs[0].relevance).toBeUndefined();
  });
});

describe('applyFreshnessPolicy', () => {
  const now = new Date('2026-09-22T00:00:00Z');

  it('homefeed 모드에서는 30일 넘은 자료를 기각하고, 날짜 미상은 뒤로 보낸다', () => {
    const fresh = makeDoc({ id: 'S01', title: '최근', dateStatus: 'KNOWN', pubDate: '2026-09-10' });
    const stale = makeDoc({ id: 'S02', title: '오래된', dateStatus: 'KNOWN', pubDate: '2026-06-01' });
    const unknown = makeDoc({ id: 'S03', title: '미상', dateStatus: 'UNKNOWN_DATE' });

    const result = applyFreshnessPolicy([unknown, stale, fresh], { mode: 'homefeed', now });

    expect(result[0].title).toBe('최근');
    expect(result[result.length - 1].title).toBe('미상'); // UNKNOWN_DATE는 맨 위로 못 올라간다
    const staleResult = result.find((d) => d.title === '오래된')!;
    expect(staleResult.relevance?.accepted).toBe(false);
    expect(staleResult.relevance?.reason).toBe('STALE');
  });

  it('그 외 모드에서는 기각 없이 정렬만 한다', () => {
    const older = makeDoc({ id: 'S01', title: '오래된', dateStatus: 'KNOWN', pubDate: '2026-01-01' });
    const newer = makeDoc({ id: 'S02', title: '최근', dateStatus: 'KNOWN', pubDate: '2026-09-01' });
    const result = applyFreshnessPolicy([older, newer], { mode: 'issue', now });
    expect(result.every((d) => d.relevance?.accepted !== false)).toBe(true);
    expect(result[0].title).toBe('최근');
  });
});
