import { describe, expect, it } from 'vitest';
import { stripFakeSourcePhrases } from '../contentSanitizers';
import { findMaterialLabelLeaks } from '../content/materialLabelLeak';

/*
 * [2026-09-17 생성 실측] 조여정 패션 글에 자료 라벨이 그대로 실렸다.
 *
 *   원문  눈에 들어온 건 바지였어요 … "라고 적었어요.
 *   원문에는 29cm큐레이터활동으로 구매 시 수수료를 받는다는 문구도 있었어요.
 *
 * blueprint/quoteInsertionPatch 가 '담당자는 "…"라고 말했다' 꼴을 요구하는데,
 * 출처가 블로그라 이름이 없으면 모델이 그 자리를 '원문' 으로 메운다.
 * 독자에게 '원문' 은 아무 뜻이 없다 — 우리가 자료를 부르는 내부 명칭이다.
 *
 * 경고만 남기면 자동 발행에서는 없는 것과 같으므로, 문장에서 결정적으로 뗀다.
 * 실측 말뭉치 2,076편에서 이 꼴은 2건뿐이라 오탐 위험이 낮다.
 */
describe('자료를 화자로 세운 문장은 정리된다', () => {
  it('이름 자리에 선 원문 라벨을 뗀다', () => {
    expect(stripFakeSourcePhrases('원문  눈에 들어온 건 바지였어요'))
      .toBe('눈에 들어온 건 바지였어요');
  });

  it('조사까지 함께 뗀다 — "원문 블로그는"', () => {
    expect(stripFakeSourcePhrases('원문 블로그는 2019년 이후 활동이 뜸해졌다고 정리했습니다.'))
      .toBe('2019년 이후 활동이 뜸해졌다고 정리했습니다.');
  });

  it('"원문에는" 형태도 뗀다 — 기존 패턴에 에는 이 빠져 있었다', () => {
    expect(stripFakeSourcePhrases('원문에는 구매 수수료 문구도 있었어요.'))
      .toBe('구매 수수료 문구도 있었어요.');
  });

  it('"원본 글에서는" 도 같은 계열이다', () => {
    expect(stripFakeSourcePhrases('원본 글에서는 키가 163cm라고 적혀 있었습니다.'))
      .toBe('키가 163cm라고 적혀 있었습니다.');
  });
});

describe('멀쩡한 문장은 건드리지 않는다', () => {
  it('붙여 넣어진 뉴스 페이지 UI 의 기사원문은 제외한다', () => {
    const t = '입력 2026.08.18. 오후 3:18 기사원문 공감 텍스트 음성 변환 서비스';
    expect(stripFakeSourcePhrases(t)).toBe(t);
  });

  it('발언자가 있는 인용은 그대로 둔다', () => {
    const t = '제작진은 "이는 사실과 다르다"고 밝혔습니다.';
    expect(stripFakeSourcePhrases(t)).toBe(t);
  });

  it('숫자가 섞인 평범한 문장은 그대로 둔다', () => {
    const t = '조여정의 키는 163cm이지만 이 숫자만으로 결정할 수는 없어요.';
    expect(stripFakeSourcePhrases(t)).toBe(t);
  });
});

describe('진단기도 같은 꼴을 잡는다', () => {
  it('원문 라벨을 누출로 보고한다', () => {
    expect(findMaterialLabelLeaks('원문 블로그는 활동이 뜸해졌다고 정리했습니다.').length).toBeGreaterThan(0);
    expect(findMaterialLabelLeaks('원문에는 수수료 문구도 있었어요.').length).toBeGreaterThan(0);
  });

  it('기사원문은 보고하지 않는다', () => {
    expect(findMaterialLabelLeaks('입력 2026.08.18. 기사원문 공감 텍스트')).toEqual([]);
  });
});
