import { describe, expect, it } from 'vitest';

import { humanizeContent } from '../aiHumanizer';

/**
 * [2026-08-05] 휴머나이저가 원문 사실을 훼손하던 문제.
 *
 * humanizeContent 는 contentGenerator.ts:6588 에서 매 글에 호출된다.
 *
 * 1) naturalizeNumbers(:718) 가 백분율을 말로 바꿨다. 단순 문자열 replace 라
 *    부분 일치까지 걸린다. 실측:
 *      금리 4.50% 적용   → 금리 4.절반 정도 적용
 *      지원율 150% 달성  → 지원율 1절반 정도 달성
 *      수수료 10%p 인하  → 수수료 일부p 인하
 *      합격률 100%       → 합격률 거의 전부
 *    자료에 있는 수치를 임의로 바꾸는 것은 F1(자료 외 사실 금지)과 같은 축의 위반이고,
 *    금리·환급률·합격률처럼 판단이 걸린 수치에서는 독자를 오도한다.
 *
 * 2) :818 이 격식 톤에서 ', 이에 대해 구체적으로 살펴보겠습니다.' 를 붙인다.
 *    base R0-8("알아보겠습니다" 등 AI 정리체 금지)과 B1 블랙리스트에 정면으로 걸린다.
 *    프롬프트가 0점 처리하는 표현을 후처리가 만들어 넣는 구조였다.
 */

/** 원문에 그대로 남아야 하는 수치 표현 */
const NUMERIC_FACTS = [
  '금리 4.50% 적용',
  '지원율 150% 달성',
  '합격률 100%',
  '수수료 10%p 인하',
  '환급 30%까지 가능',
  '연 2.90% 우대',
] as const;

const TRIALS = 40;

describe('휴머나이저 — 원문 수치를 바꾸지 않는다', () => {
  it.each(NUMERIC_FACTS)('%s 가 보존된다', (fact) => {
    const body = `${fact}. 자세한 조건은 공고문에서 확인할 수 있습니다.`;
    for (let i = 0; i < TRIALS; i++) {
      for (const intensity of ['light', 'medium', 'strong'] as const) {
        const out = humanizeContent(body, intensity, true, 'professional');
        expect(out, `${intensity} 톤에서 수치가 변형됐습니다`).toContain(fact);
      }
    }
  });

  it('백분율을 말로 바꾸지 않는다', () => {
    const worded = ['거의 전부', '절반 정도', '상당수', '대다수', '많은 경우'];
    const body = '지원 대상은 100%, 감면은 50%, 반영은 70%입니다.';
    for (let i = 0; i < TRIALS; i++) {
      const out = humanizeContent(body, 'strong', true, 'professional');
      for (const w of worded) {
        expect(out, `"${w}" 로 치환되면 원문 수치가 소실된다`).not.toContain(w);
      }
    }
  });
});

describe('휴머나이저 — 근거를 통설로 강등하지 않는다', () => {
  it('연구·자료 인용을 1인칭 발견담이나 통설로 바꾸지 않는다', () => {
    // F2가 요구한 것은 "출처 토큰 제거"이지 "근거를 통설로 강등"이 아니다.
    const downgrades = ['알고 보니', '알려진 것처럼', '알아본 바로는', '확인 결과'];
    // 이 함수는 같은 인용이 2회 이상일 때 2번째부터 치환한다 — 그래서 반복시킨다.
    const body = [
      '연구 결과에 따르면 이 조건은 소득 구간에 따라 갈립니다.',
      '연구 결과에 따르면 재신청 기준도 별도로 정해져 있습니다.',
      '자료에 따르면 신청은 온라인으로만 가능합니다.',
      '자료에 따르면 접수 창구는 지역마다 다릅니다.',
      '참고 자료를 보면 기한은 매월 말일입니다.',
      '참고 자료를 보면 연장 신청도 가능합니다.',
    ].join(' ');

    for (let i = 0; i < TRIALS; i++) {
      const out = humanizeContent(body, 'strong', true, 'professional');
      for (const d of downgrades) {
        expect(out, `"${d}" 는 근거 없는 발견·통설 주장이다`).not.toContain(d);
      }
    }
  });
});

describe('휴머나이저 — F3 금칙어를 만들지 않는다', () => {
  it('금칙어를 다른 금칙어로 치환하지 않는다', () => {
    // base F3: "보통", "일반적으로", "흔히", "대체로", "여러 가지", "다양한" …
    //   → 위반 시 0점. '일반적으로'를 '보통'으로 바꾸면 순수 손해다.
    for (let i = 0; i < TRIALS; i++) {
      const a = humanizeContent('일반적으로 신청 기한은 월말입니다.', 'strong', true, 'professional');
      expect(a, "'일반적으로' → '보통' 은 금칙어 → 금칙어다").not.toMatch(/보통\s/);

      const b = humanizeContent('다양한 조건이 적용됩니다.', 'strong', true, 'professional');
      expect(b, "'다양한' → '여러 가지' 도 금칙어 → 금칙어다").not.toContain('여러 가지');
    }
  });
});

describe('휴머나이저 — 프롬프트 금칙어를 만들지 않는다', () => {
  it('삽입 풀에 R0-8 금칙어가 없다', () => {
    const body = Array.from({ length: 12 }, (_, i) =>
      `${i + 1}번 항목의 조건을 자료 범위에서 설명합니다. 확인할 지점은 두 가지입니다.`).join('\n\n');
    for (let i = 0; i < TRIALS; i++) {
      const out = humanizeContent(body, 'strong', true, 'community_fan');
      expect(out, "'정리하면' 은 base R0-8 이 금지하는 AI 정리체다").not.toContain('정리하면');
    }
  });

  it('AI 정리체를 붙이지 않는다', () => {
    // base R0-8 / B1 블랙리스트
    const banned = ['살펴보겠습니다', '알아보겠습니다'];
    const body = [
      '신청 절차는 세 단계로 나뉩니다.',
      '첫 단계에서 서류를 준비합니다.',
      '두 번째 단계에서 접수를 진행합니다.',
      '마지막으로 결과를 확인합니다.',
    ].join(' ');

    for (let i = 0; i < TRIALS; i++) {
      for (const intensity of ['light', 'medium', 'strong'] as const) {
        const out = humanizeContent(body, intensity, true, 'professional');
        for (const b of banned) {
          expect(out, `프롬프트가 0점 처리하는 표현을 후처리가 넣고 있다`).not.toContain(b);
        }
      }
    }
  });
});
