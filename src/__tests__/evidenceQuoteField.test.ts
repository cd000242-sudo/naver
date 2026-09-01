import { describe, expect, it } from 'vitest';

import { buildContentJsonOutputFormat } from '../contentJsonPromptFormat';

/**
 * [2026-09-01] 사장님 요구: "십중팔구는 완벽히 나와야 돼."
 * 그리고 못 박으신 조건: "검사를 해서 다시쓰기를 하면 의미가 없어. 비용만 들고
 * 차라리 LLM을 쓰고 말지."
 *
 * 맞다. 생성 후 재작성은 비용을 두 배로 내고도 raw LLM 보다 나을 이유가 없다.
 * 첫 호출에서 지키게 해야 한다.
 *
 * 이 저장소에서 첫 호출을 바꾸는 레버는 하나뿐이다 — 스키마 필드다.
 * 오늘 하루만 산문 지시가 무시된 것을 다섯 번 확인했다(소제목 문형 · 요약표 규율 ·
 * 매 섹션 템플릿 · 연도 표기 · 자료 라벨). 반대로 스키마 필드로 올린 것은 지켜졌다
 * (해시태그 개수 · 제목 길이 · 요약표 존재 · clickReason).
 *
 * 가장 큰 미사용 레버가 근거 인용이다. 모델이 수치를 쓰려면 그 수치가 적힌
 * 자료 문장을 함께 뱉어야 한다면, 뱉을 수 없는 수치는 애초에 쓰지 않는다.
 * 추가 호출이 없으므로 비용은 0이다.
 *
 * 실측 근거: 클로드코드로 뽑은 두 편에서 자료에 없는 수치가 각각 6건 · 5건 나왔다
 * (2번 · 3번 · 2020년 · 30분 · 22일). 에이전트 모드는 검색이 막혀 있어
 * 자기 지식으로 쓰기 때문이다. 근거를 요구하면 그 자리에서 멈춘다.
 */
const prompt = (mode: string) => buildContentJsonOutputFormat({
  contentMode: mode,
  mode,
  source: { rawText: '', title: '' },
  title: '냉장고 냄새 제거',
  rawText: '자료',
  primaryKeyword: '냉장고 냄새',
  subKeywords: '식재료 소분',
} as never);

describe('수치를 쓰려면 근거를 함께 뱉는다', () => {
  it('소제목 스키마에 근거 필드가 있다', () => {
    expect(prompt('seo')).toMatch(/"evidence"/u);
  });

  it('언제 필수인지 필드 설명에 적혀 있다', () => {
    const p = prompt('seo');
    expect(p).toMatch(/수치|숫자/u);
    expect(p).toMatch(/그대로 옮겨|원문 그대로/u);
  });

  it('근거를 못 대면 그 수치를 쓰지 말라고 한다', () => {
    expect(prompt('seo')).toMatch(/쓰지 (?:마|않)/u);
  });

  it('모든 모드에 적용된다 — 홈피드도 수치를 지어내면 안 된다', () => {
    for (const mode of ['seo', 'homefeed', 'mate', 'affiliate', 'business']) {
      expect(prompt(mode)).toMatch(/"evidence"/u);
    }
  });
});

describe('요약표 규율이 주석이 아니라 필드다', () => {
  /*
   * 처음에는 JSON 예시 안에 // 주석으로 넣었다. 그건 여전히 산문이다.
   * 조건이 붙은 값은 조건을 적을 자리를 필드로 만들어야 모델이 채운다.
   */
  it('조건을 적는 필드가 있다', () => {
    expect(prompt('seo')).toMatch(/"condition"/u);
  });

  it('홈피드에는 표가 없다 — 기존 동작 유지', () => {
    expect(prompt('homefeed')).not.toMatch(/summaryTable/u);
  });
});
