import { describe, expect, it } from 'vitest';

import { buildMaterialTierNotice } from '../content/materialTierNotice';

/**
 * [2026-09-01] 사장님 질문: "퍼플렉시티로 해도 잘못된 정보가 나온다면 뭘 수정해야 되는 거니?"
 *
 * 모델을 바꿔서 될 일이 아니다. 잘못된 정보는 네 갈래인데
 * 모델 교체로 풀리는 것은 "자료를 못 찾음" 한 갈래뿐이다.
 *   ① 자료를 못 찾음        -> 검색 내장 모델이 해결 (오늘 해결됨)
 *   ② 자료 자체가 틀림      -> 모델 무관. 틀린 것을 그대로 옮긴다
 *   ③ 맞는 자료를 잘못 조합  -> 모델 무관 ("46분 전 개각" -> "46분 만에 성에")
 *   ④ 자료가 낡음           -> 모델 무관
 *
 * 냉장고 글의 위험이 ② 였다. 로그가 말해줬다.
 *   [자료 점검] ⚠️ 기사를 하나도 찾지 못했습니다 — 블로그 4건이 재료의 전부입니다
 *
 * 삼성 · LG 안내의 원출처는 공식 문서인데 우리는 블로그를 거쳐 받았다.
 * 블로그가 잘못 옮겼으면 "1cm" 도 "주 1회" 도 그대로 실린다.
 *
 * 그런데 그 판정이 로그에만 찍히고 모델에게는 가지 않았다.
 * 모델은 자료가 2차인 줄 모르니 공식 사실처럼 단정한다.
 * 등급을 알려주면 "블로그 후기에서는 ~라고 합니다" 로 쓸 수 있다.
 *
 * 막지 않는다. 알려주기만 한다.
 */
describe('자료 등급을 모델에게 알린다', () => {
  it('기사가 없으면 2차 자료임을 알린다', () => {
    const notice = buildMaterialTierNotice({ newsCount: 0, blogCount: 4, totalChars: 5000 });
    expect(notice).toMatch(/블로그/);
    expect(notice).toMatch(/단정|확인되지 않/);
  });

  it('무엇을 어떻게 쓰라고까지 말해준다 — 등급만 알리면 모델이 못 쓴다', () => {
    const notice = buildMaterialTierNotice({ newsCount: 0, blogCount: 4, totalChars: 5000 });
    expect(notice).toMatch(/후기|에 따르면|라고 합니다/);
  });

  it('본문을 하나도 못 긁었으면 더 강하게 알린다', () => {
    const notice = buildMaterialTierNotice({ newsCount: 0, blogCount: 0, totalChars: 0 });
    expect(notice).toBeTruthy();
    expect(notice).toMatch(/수치|날짜|쓰지/);
  });

  it('기사가 있으면 알리지 않는다 — 정상 자료를 의심하게 만들지 않는다', () => {
    expect(buildMaterialTierNotice({ newsCount: 3, blogCount: 5, totalChars: 8000 })).toBe('');
  });

  it('잘못된 입력에 던지지 않는다', () => {
    expect(() => buildMaterialTierNotice(undefined as never)).not.toThrow();
    expect(buildMaterialTierNotice(undefined as never)).toBe('');
  });
});
