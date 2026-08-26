import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  judgeTitleLength,
  measureTitleWidth,
  resolveTitleLengthRange,
} from '../content/titleLengthPolicy';

/**
 * [2026-08-27 사장님 지적] "글자수가 33자인데? 띄어쓰기는 왜 카운팅하는 거니?"
 *
 * 세어 보니 사장님이 센 33자는 공백을 뺀 값이었고, 코드는 공백 포함 44자로 보고 있었다.
 *   장동윤 김승윤 결혼발표 10월 결혼 발표와 100% 사비 제작 누룩 펀딩의 진실
 *   공백 포함 44 · 공백 제외 33 · 한글 27 · 공백 11 · 숫자기호 6
 *
 * 공백을 세는 것 자체는 맞다 — 잘림은 글자 수가 아니라 폭으로 정해지고 공백도 자리를
 * 차지한다. 틀린 건 **한글과 공백·숫자·영문을 같은 한 칸으로 센 것**이다. 한글은 넓고
 * 나머지는 절반쯤이라, 숫자와 영문이 섞인 제목이 실제보다 길게 계산돼 억울하게 걸렸다.
 *
 * 사장님 판단: "실측한들 어차피 그 기준만 두는 제목이 나올 수 없어."
 * 맞는 말이다. 정확한 경계를 찾는 것보다, 재는 방식을 실제 보이는 것에 맞추는 게 낫다.
 *
 * 상한 숫자(42)는 그대로 둔다 — 순한글 제목에서는 예전과 똑같이 걸리고,
 * 섞인 제목에만 여유가 생긴다.
 */
describe('제목 폭 재기', () => {
  it('한글은 한 칸으로 센다', () => {
    expect(measureTitleWidth('가나다라마')).toBe(5);
  });

  it('공백·숫자·영문은 반 칸으로 센다', () => {
    expect(measureTitleWidth('     ')).toBe(2.5);
    expect(measureTitleWidth('12345')).toBe(2.5);
    expect(measureTitleWidth('abcde')).toBe(2.5);
  });

  it('사장님 제목을 폭으로 재면 44자가 35.5폭이다', () => {
    const title = '장동윤 김승윤 결혼발표 10월 결혼 발표와 100% 사비 제작 누룩 펀딩의 진실';
    expect(title.length).toBe(44);
    expect(measureTitleWidth(title)).toBe(35.5);
  });

  it('순한글 제목은 예전과 같다 — 기존 계약이 느슨해지지 않는다', () => {
    const pure = '가'.repeat(42);
    expect(measureTitleWidth(pure)).toBe(42);
  });

  it('빈 값과 이상한 입력에도 던지지 않는다', () => {
    expect(measureTitleWidth('')).toBe(0);
    expect(() => measureTitleWidth(null as never)).not.toThrow();
  });
});

describe('길이 판정이 폭을 쓴다', () => {
  const max = resolveTitleLengthRange('homefeed').max;

  it('숫자·영문이 섞인 44자 제목이 통과한다', () => {
    const title = '장동윤 김승윤 결혼발표 10월 결혼 발표와 100% 사비 제작 누룩 펀딩의 진실';
    expect(title.length).toBeGreaterThan(max);
    expect(judgeTitleLength(title, 'homefeed').status).toBe('ok');
  });

  it('순한글로 상한을 넘으면 여전히 걸린다', () => {
    expect(judgeTitleLength('가'.repeat(max + 5), 'homefeed').status).toBe('over');
  });

  it('사장님이 지적했던 53자 제목은 여전히 걸린다', () => {
    const long = '전현무 나혼산 조작설 카자흐스탄 정부의 지원 발표와 사전에 섭외된 것 아니냐는 조작 의혹의 시작';
    expect(judgeTitleLength(long, 'homefeed').status).toBe('over');
  });

  it('판정에 글자 수와 폭을 함께 담는다 — 로그에서 갈리게', () => {
    const v = judgeTitleLength('장동윤 김승윤 결혼발표 10월 결혼 발표와 100% 사비 제작 누룩 펀딩의 진실', 'homefeed');
    expect(v.length).toBe(44);
    expect(v.width).toBe(35.5);
  });
});

describe('본선 배선', () => {
  it('제목 평가기가 폭 기준을 쓴다', () => {
    const src = readFileSync(resolve(__dirname, '../contentTitleEvaluator.ts'), 'utf-8');
    expect(src).toMatch(/measureTitleWidth\(|judgeTitleLength\(/);
  });

  it('접두사 정책도 폭으로 잰다', () => {
    const src = readFileSync(resolve(__dirname, '../contentKeywordPrefix.ts'), 'utf-8');
    expect(src).toMatch(/measureTitleWidth\(/);
  });
});
