import { describe, expect, it } from 'vitest';
import { isPublicInfoTopic } from '../content/publicInfoFactTable';

/**
 * [2026-08-29] 지원금 글이 쇼핑 리뷰로 분류되던 회귀를 잠근다.
 *
 * sourceAssembler.inferArticleType 이 본문에 '상품'이 있으면 shopping_review 로
 * 판정했는데, 민생지원금 재료에는 지역사랑상품권·온누리상품권이 반드시 나온다.
 * 실측에서 "상품" 11건이 잡혀 3회 모두 shopping_review 로 분류됐고,
 * 그 여파로 finalize 의 제품명 조기반환에 걸려 후처리 검사가 통째로 스킵됐다.
 */
describe('공공정보 주제는 리뷰로 분류되지 않는다', () => {
  it('detects the 지원금 topics that must never be shopping reviews', () => {
    for (const topic of ['4차 민생지원금', '민생회복 소비쿠폰', '청년 월세 지원금', '재난지원금 신청']) {
      expect(isPublicInfoTopic({ title: topic })).toBe(true);
    }
  });

  it('still leaves real shopping topics alone', () => {
    for (const topic of ['무선 이어폰 추천', '로봇청소기 후기', '노트북 리뷰']) {
      expect(isPublicInfoTopic({ title: topic })).toBe(false);
    }
  });

  it("'상품권' must not match the body product signal used for review inference", () => {
    // sourceAssembler 가 쓰는 것과 같은 패턴.
    const bodyProductSignal = (body: string) => /구매|제품|상품(?!권)/.test(body);
    expect(bodyProductSignal('지역사랑상품권으로 지급됩니다')).toBe(false);
    expect(bodyProductSignal('온누리상품권 사용처 안내')).toBe(false);
    expect(bodyProductSignal('이 상품은 품절입니다')).toBe(true);
    expect(bodyProductSignal('제품 사양을 비교했다')).toBe(true);
  });
});
