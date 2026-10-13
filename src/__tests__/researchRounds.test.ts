// [2026-10-13 심층 리서치 A3·A4] 질문 분해(나노 1회) 프롬프트·파싱, 커버리지 판정, 후보 라운드 병합 — 전부 순수 함수.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  RESEARCH_QUERY_MAX,
  assessQueryCoverage,
  buildResearchQueryPrompt,
  mergeCandidateRounds,
  parseResearchQueries,
  queryTerms,
} from '../content/researchRounds';

describe('buildResearchQueryPrompt', () => {
  it('주제와 축(조건·금액·절차·기한·예외·비교·확인처)을 담고 JSON 한 줄만 요구한다', () => {
    const p = buildResearchQueryPrompt('청년도약계좌 조건', 'seo');
    expect(p).toContain('"청년도약계좌 조건"');
    expect(p).toContain('검색창에 친 사람');
    expect(p).toContain('{"queries":[');
    expect(buildResearchQueryPrompt('k', 'homefeed')).toContain('피드에서');
  });
});

describe('parseResearchQueries', () => {
  it('JSON 객체·배열·설명 섞인 답에서 검색어를 뽑고 주제어 반복·중복·길이 초과를 버린다', () => {
    const reply = '물론이죠!\n{"queries":["청년도약계좌 가입 조건","청년도약계좌 정부기여금 금액","청년도약계좌 조건","가입 절차","청년도약계좌 가입 조건", "' + 'x'.repeat(40) + '","2026년 변경사항"]}';
    expect(parseResearchQueries(reply, '청년도약계좌 조건')).toEqual([
      '청년도약계좌 가입 조건', '청년도약계좌 정부기여금 금액', '가입 절차', '2026년 변경사항',
    ]);
  });

  it('배열만 와도, 줄 목록만 와도 읽고 8개에서 자른다', () => {
    expect(parseResearchQueries('["a조건","b금액"]', 'k')).toEqual(['a조건', 'b금액']);
    const lines = Array.from({ length: 12 }, (_, i) => `- 질문 ${i + 1}`).join('\n');
    expect(parseResearchQueries(lines, 'k')).toHaveLength(RESEARCH_QUERY_MAX);
    expect(parseResearchQueries('', 'k')).toEqual([]);
    expect(parseResearchQueries('{"queries": 3}', 'k')).toEqual([]);
  });
});

describe('assessQueryCoverage', () => {
  it('질문의 핵심어 절반 이상이 수집 본문에 있으면 covered, 아니면 missing', () => {
    const text = '청년도약계좌 정부기여금은 월 최대 33,000원이다. 가입 조건은 총급여 7,500만원 이하이며 만 19~34세.';
    const r = assessQueryCoverage(
      ['청년도약계좌 정부기여금 금액', '청년도약계좌 가입 조건 나이', '청년도약계좌 중도해지 불이익', '청년도약계좌'],
      text,
      '청년도약계좌',
    );
    expect(r.covered).toEqual(['청년도약계좌 정부기여금 금액', '청년도약계좌 가입 조건 나이', '청년도약계좌']);
    expect(r.missing).toEqual(['청년도약계좌 중도해지 불이익']);
  });

  it('조사를 떼고 2자 이상만 핵심어로 본다', () => {
    expect(queryTerms('청년도약계좌의 조건은 무엇')).toEqual(['청년도약계좌', '조건', '무엇']);
  });
});

describe('mergeCandidateRounds', () => {
  it('기본 후보 순서를 지키고 추가 라운드 후보를 뒤에 붙이며 링크 중복을 버린다', () => {
    const base = [{ link: 'a' }, { link: 'b' }];
    const extras = [{ link: 'b' }, { link: 'c' }, { link: '' }, { link: 'a' }, { link: 'd' }];
    expect(mergeCandidateRounds(base, extras).map((c) => c.link)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('배선(소스 가드)', () => {
  it('본문 수집이 질문 분해 라운드와 갭 보충 2차 검색을 돈다', () => {
    const src = readFileSync(resolve('src/sourceAssembler.ts'), 'utf8').replace(/\r\n/g, '\n');
    const fn = src.split('export async function collectTopArticleFullTexts(')[1].split('\nexport ')[0];
    expect(fn).toContain('resolveResearchQueriesForCollection(');
    expect(fn).toContain('mergeCandidateRounds(');
    expect(fn).toContain('assessQueryCoverage(');
    expect(fn).toContain('[심층 리서치]');
    const route = readFileSync(resolve('src/content/researchQueryRoute.ts'), 'utf8');
    expect(route).toContain('resolveSelectedEngineRoute');
    // The route must go through the selected-engine resolver, never a hard-coded vendor caller.
    expect(route).not.toContain('callOpenAi(');
    expect(route).toContain('subscription');
  });
});
