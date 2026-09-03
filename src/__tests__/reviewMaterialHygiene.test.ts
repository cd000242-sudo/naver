import { describe, expect, it } from 'vitest';

import { applyReviewMaterialHygiene, stripBorrowedBiography, stripReviewOptionLabel } from '../content/reviewMaterialHygiene';

/** [2026-09-03 자체 실행 비평] 옵션 라벨이 리뷰에 붙어 오고, 리뷰어 신상이 한 화자에 붙었다 — 재료에서 지운다. */
describe('리뷰 재료 위생', () => {
  it('옵션 라벨을 뗀다 — "구성: (그레이)본체+다리무릎…"', () => {
    expect(stripReviewOptionLabel('구성: (그레이)본체+다리무릎 내측인대가 파열돼서 고생하는데 누워서 쓰니 편했어요')).toBe('무릎 내측인대가 파열돼서 고생하는데 누워서 쓰니 편했어요');
    expect(stripReviewOptionLabel('구성: (핑크)본체+다리처음 일주일은 매일 사용했는데')).toBe('처음 일주일은 매일 사용했는데');
    expect(stripReviewOptionLabel('압박감 매우 좋습니다')).toBe('압박감 매우 좋습니다');
  });

  it('신상 절은 지우고 제품 장면은 남긴다', () => {
    const review = '무릎 내측인대가 파열돼서 거의 3개월 정도 고생하고 있는데, 복싱을 하다 보니 다리에 무리가 가서 샀어요. 누워서 착용하고 작동시키면 따로 힘을 줄 필요가 없어 쉬면서 쓰기 편했어요. 2년 전에 산 안마의자보다 시끄럽지만 집 강아지는 짖지 않네요.';
    const out = stripBorrowedBiography(review);
    expect(out).toContain('누워서 착용하고 작동시키면 따로 힘을 줄 필요가 없어 쉬면서 쓰기 편했어요');
    expect(out).not.toMatch(/인대|파열|3개월|2년 전|강아지/u);
    expect(stripBorrowedBiography('압박감 매우 좋습니다. 단계별로 나눠져 있어요.')).toBe('압박감 매우 좋습니다. 단계별로 나눠져 있어요.');
  });

  it('source 의 productReviews 와 rawText 후기 섹션에 같이 적용하고 원본은 바꾸지 않는다', () => {
    const source = {
      productReviews: ['구성: (블랙)본체+다리출산 후 다리저림이 있어 사봤어요. 허벅지 쪽 압이 먼저 들어와요.'],
      rawText: ['상품명: 닥터웰', '=== 실제 구매자 후기 ===', 'REVIEW_1: 구성: (블랙)본체+다리출산 후 다리저림이 있어 사봤어요. 허벅지 쪽 압이 먼저 들어와요.', '출처 URL: https://x'].join('\n'),
    };
    const { source: cleaned, changed } = applyReviewMaterialHygiene(source, true);
    expect(changed).toBe(2);
    expect(cleaned.productReviews[0]).toBe('허벅지 쪽 압이 먼저 들어와요.');
    expect(cleaned.rawText).toContain('REVIEW_1: 허벅지 쪽 압이 먼저 들어와요.');
    expect(cleaned.rawText).toContain('출처 URL: https://x');
    expect(source.productReviews[0]).toContain('출산');
    // 옵트인이 꺼져 있으면 라벨만 떼고 신상은 남긴다(귀속 모드는 "출산 뒤 쓴 구매자" 로 쓸 수 있다)
    const off = applyReviewMaterialHygiene(source, false);
    expect(off.source.productReviews[0]).toBe('출산 후 다리저림이 있어 사봤어요. 허벅지 쪽 압이 먼저 들어와요.');
  });

  // [2026-09-03 4차 실측] 머리가 "실제 구매자 리뷰 (11건 중 발췌)" 라 정리기가 섹션에 못 들어가 신상이 그대로 새었다
  it('후기 섹션 머리의 변형("실제 구매자 리뷰 (11건 중 발췌)")도 진입하고, 판매 문구 줄은 어디 있든 지운다', () => {
    const source = {
      productReviews: [],
      rawText: [
        '상품명: 닥터웰',
        '[닥터웰] 제품이 아닌 작품을 만드는 헬스케어 No1. BRAND &#40;주&#41; 닥터웰',
        '=== 제품 상세 정보 ===',
        '추가 설치 비용: 없음',
        '구성: (그레이)본체+다리',
        '=== 실제 구매자 리뷰 (11건 중 발췌) ===',
        '2. 무릎 내측인대가 파열돼서 거의 3개월 정도 고생하고 있는데, 복싱을 하다 보니 무리가 가서 구매했어요. 누워서 착용하면 따로 힘을 줄 필요가 없어 편했어요.',
        '5. 며칠 뒤 어머니 양력 생신으로 빨리 주문해드림 일단.. 엄청 총알 같이 날아와서 그날 저녁에 바로 해드렸더니 너무 좋아함',
        '출처 URL: https://x',
      ].join('\n'),
    };
    const { source: cleaned } = applyReviewMaterialHygiene(source, true);
    const raw = String(cleaned.rawText);
    expect(raw).toContain('누워서 착용하면 따로 힘을 줄 필요가 없어 편했어요');
    expect(raw).not.toMatch(/인대|3개월|어머니|생신/u);
    expect(raw).not.toMatch(/제품이 아닌 작품|BRAND|추가 설치 비용/u);
    expect(raw).toContain('구성: (그레이)본체+다리');
    expect(raw).toContain('출처 URL: https://x');
  });

  // [2026-09-03 5차 실측] "2년전에 안마의자 사드린 건 얘보다 조용한 편", "집에 가나지가" 가 패턴을 비껴갔다
  it('띄어쓰기 없는 년 전·사드린·오타 강아지·안마의자 소유까지 신상으로 본다', () => {
    const review = '소음은 좀 있어요. 집에 가나지가 이 소음에는 짖지 않네요. 2년전에 안마의자 사드린 건 얘보다 조용한 편이었어요. 그 안마의자는 5번도 못하고 당근으로 보냈습니다. 3단 20분이 잘 맞아요.';
    const out = stripBorrowedBiography(review);
    expect(out).toContain('소음은 좀 있어요.');
    expect(out).toContain('3단 20분이 잘 맞아요.');
    expect(out).not.toMatch(/가나지|2년전|안마의자|보냈/u);
  });

  // [2026-09-03 6차 실측] 재료는 깨끗한데 본문에 "무릎 내측인대가 파열돼" 가 또 나왔다 — 정리 전 원문으로 만든 상위호환 브리프가 세 번째 사본이었다
  it('옵트인이면 상위호환 브리프의 신상 줄도 정리한다', () => {
    const source = { productReviews: [], rawText: '상품명: x', paraphraseUpgradeBrief: ['[핵심 사실]', '- 무릎 내측인대 파열 후 복싱을 계속하는 사용자가 누워서 관리', '- 3단 20분이 잘 맞는다'].join('\n') };
    const { source: cleaned } = applyReviewMaterialHygiene(source, true);
    expect(String(cleaned.paraphraseUpgradeBrief)).not.toMatch(/인대|복싱/u);
    expect(String(cleaned.paraphraseUpgradeBrief)).toContain('3단 20분이 잘 맞는다');
    expect(String(applyReviewMaterialHygiene(source, false).source.paraphraseUpgradeBrief)).toContain('인대');
  });

  // [2026-09-03 7차 실측] "한 번은 5번도 못하고 짖은 적이 없어서 의아했던 순간" — 절을 지운 조각이 이어 붙었다
  it('신상 절을 지우고 남은 조각이 짧으면 문장을 통째로 버린다', () => {
    const review = '3단 20분이 잘 맞아요. 2년전에 안마의자 사드린 건 얘보다 조용했지만 그 안마의자는 5번도 못하고 당근으로 보냈어요. 집에 가나지가 이 소음에는 짖지 않았어요. 소음은 좀 있는 편이에요.';
    const out = stripBorrowedBiography(review);
    expect(out).toBe('3단 20분이 잘 맞아요. 소음은 좀 있는 편이에요.');
  });
});
