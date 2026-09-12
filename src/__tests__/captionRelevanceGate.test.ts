/**
 * [2026-09-12 사장님 지적] "굳이 API로 비용 들여가면서 수집할 필요 없이 성능을 끌어낼 수
 * 있잖아. 사이트가 아니라 일렉트론 앱인데."
 *
 * 검색 소스는 이미지마다 캡션을 같이 준다(네이버 이미지 API 의 title). 사람도 사진을 보기
 * 전에 캡션부터 읽는다. 텍스트로 알 수 있는 것을 Vision API 로 되사지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { CAPTION_RELEVANCE_PASS_SCORE, judgeCaptionRelevance } from '../crawler/issueHarness/captionRelevanceGate';

const CTX = { subject: '정주리', heading: '세 번째 장편까지 칸으로 향했습니다', mainKeyword: '도라 영화' };

describe('캡션 관련성 판정 — 모델 없이', () => {
  it('주제어가 캡션에 나오면 통과한다', () => {
    const v = judgeCaptionRelevance({ caption: '정주리 감독 영화 도라 스틸컷', url: 'https://img.example.com/a.jpg' }, CTX);
    expect(v.relevant).toBe(true);
    expect(v.matched).toContain('정주리');
    expect(v.score).toBeGreaterThanOrEqual(CAPTION_RELEVANCE_PASS_SCORE);
  });

  it('소제목 낱말만 겹치면 통과시키지 않는다 — "영화"·"이유" 는 아무 데나 걸린다', () => {
    const v = judgeCaptionRelevance({ caption: '해외 영화제 레드카펫 현장', url: 'https://img.example.com/b.jpg' }, CTX);
    expect(v.relevant).toBe(false);
  });

  it('전혀 무관한 캡션은 떨어뜨린다 — 고양이가 연예 글에 꽂히던 사고', () => {
    const v = judgeCaptionRelevance({ caption: '길고양이 겨울나기 급식소', url: 'https://img.example.com/c.jpg' }, CTX);
    expect(v.relevant).toBe(false);
    expect(v.matched).toEqual([]);
  });

  it('캡션이 없으면 출처 주소의 읽을 수 있는 부분을 본다', () => {
    const v = judgeCaptionRelevance({ url: 'https://cdn.news.com/2026/09/정주리-감독-인터뷰.jpg' }, CTX);
    expect(v.relevant).toBe(true);
  });

  it('판정할 텍스트가 아예 없으면 판정 불가로 남긴다 — 없는 근거를 지어내지 않는다', () => {
    const v = judgeCaptionRelevance({}, CTX);
    expect(v.undecidable).toBe(true);
    expect(v.relevant).toBe(false);
  });

  it('주제어가 비어 있으면 통과시키지 않는다 — 근거가 없다', () => {
    const v = judgeCaptionRelevance({ caption: '무언가의 사진' }, { heading: '어떤 소제목입니다' });
    expect(v.relevant).toBe(false);
  });

  it('띄어쓰기·기호가 달라도 같은 말로 본다', () => {
    const v = judgeCaptionRelevance({ caption: '[포토] 정 주 리 감독' }, CTX);
    expect(v.relevant).toBe(true);
  });
});
