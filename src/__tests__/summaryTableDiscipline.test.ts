import { describe, expect, it } from 'vitest';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

/**
 * [2026-09-01 퍼플렉시티 실측] 요약표가 본문의 유보를 무력화했다.
 *
 *   표   | 공간 확보 | 냉동실 공간의 30%가 늘어난 사례 있음 |
 *   본문 "냉동실 공간의 30%가 늘어난다는 사례도 있었지만,
 *         그건 과대포장을 덜어냈을 때의 체감에 가깝습니다."
 *
 * 본문은 조건을 달았는데 표는 단정으로 실었다. 그리고 표가 먼저 읽힌다 —
 * 독자는 30% 를 사실로 받아들이고 본문의 유보는 못 볼 확률이 높다.
 * 본문의 그 유보는 잘 쓴 문장인데 표가 그것을 지운 셈이다.
 *
 * 같은 표에 주제와 무관한 축도 있었다.
 *   | 보관 용량 | 586L의 4도어 사례 참고 가능 |
 *   | 에너지 효율 | 1등급 |
 * 정리 · 성에 제거와 상관없는 제품 구매 정보다. 로그가 출처를 말해준다 —
 * "기사를 하나도 찾지 못했습니다, 블로그 4건이 전부" — 그 블로그가 제품 리뷰였다.
 * 게다가 "586L의 4도어 사례 참고 가능" 은 독자에게 아무것도 시키지 않는다.
 *
 * 스키마 필드 설명에 못을 박는다. 이 코드베이스에서 산문 지시는 흘리고
 * 스키마 필드는 지켜진다(해시태그 · 제목 길이 · 표 자체가 그 경로로 해결됐다).
 */
const prompt = (mode: string) => buildContentJsonOutputFormat({
  contentMode: mode,
  mode,
  source: { rawText: '', title: '' },
  title: '냉장고 파먹기와 성에 제거',
  rawText: '냉장고 정리 자료',
  primaryKeyword: '냉장고 파먹기',
  subKeywords: '성에 제거',
} as never);

describe('요약표 규율', () => {
  const seo = prompt('seo');

  it('표가 본문보다 강하게 말하지 못하게 한다', () => {
    // [2026-09-01] 주석에서 필드 설명으로 옮겼다. 문구가 아니라 뜻이 남아 있는지 본다.
    //   주석은 모델이 흘리고 필드는 지킨다는 것이 이 저장소의 반복 확인 사실이다.
    expect(seo).toMatch(/본문에 조건을 달았으면 표에도/u);
  });

  it('조건이 붙은 값은 표에도 조건을 적게 한다', () => {
    expect(seo).toMatch(/조건/);
  });

  it('주제와 무관한 축을 금지한다', () => {
    expect(seo).toMatch(/주제와 직접 상관있는 축만/u);
  });

  it('독자가 대볼 수 있는 값만 넣게 한다', () => {
    expect(seo).toMatch(/대볼|자기\s*상황/);
  });

  it('홈피드에는 표 자체가 없다 — 기존 동작 유지', () => {
    expect(prompt('homefeed')).not.toMatch(/summaryTable/);
  });
});
