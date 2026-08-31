import { describe, expect, it } from 'vitest';

import { enforceSentenceParagraphs } from '../content/sentenceParagraphs';

/**
 * [2026-09-01 사장님 실측] 쇼핑커넥트 발행글이 뭉텅이로 나왔다.
 *
 *   "스마트스토어에 쌓인 구매자 리뷰 7건 중 발췌 내용을 종합해 보면 (…) 거의 없었다고
 *    전합니다. 실제로 작동 중에는 젖고 냄새나는 음식 쓰레기 부피가 줄어들면서 (…)"
 *
 * 두 문장이 한 덩어리로 붙어 모바일에서 벽처럼 보인다.
 * 사장님 지시: "마침표가 있다면 이런 식으로 한 번 띄우는 규칙이 있어야 돼."
 *
 * 왜 없었는지 찾아봤다. 문단 길이 규칙이 어디에도 없다 —
 * contentOptimizer 의 optimizeParagraphStructure 가 400자 넘을 때 중간에서 한 번
 * 쪼개는 것이 전부라, 300자짜리 뭉텅이는 손도 대지 않고 통과한다.
 * 붙여넣기 계층은 문장마다 <p> 를 만들지만 문단 경계는 빈 줄이 맡으므로,
 * 본문에 빈 줄이 없으면 화면에서는 한 덩어리로 보인다.
 *
 * 함정이 여럿이라 먼저 못으로 박는다. 마침표는 문장 끝에만 있는 게 아니다.
 */
describe('마침표마다 문단을 나눈다', () => {
  it('두 문장이 붙어 있으면 빈 줄로 가른다', () => {
    const input = '밀폐력이 우수해 불편함이 거의 없었다고 전합니다. 실제로 작동 중에는 부피가 줄어듭니다.';
    expect(enforceSentenceParagraphs(input)).toBe(
      '밀폐력이 우수해 불편함이 거의 없었다고 전합니다.\n\n실제로 작동 중에는 부피가 줄어듭니다.',
    );
  });

  it('물음표와 느낌표도 문장 끝이다', () => {
    expect(enforceSentenceParagraphs('이게 맞을까요? 저는 이렇게 봅니다.')).toBe(
      '이게 맞을까요?\n\n저는 이렇게 봅니다.',
    );
  });

  it('이미 나뉜 문단은 건드리지 않는다', () => {
    const input = '첫 문장입니다.\n\n둘째 문장입니다.';
    expect(enforceSentenceParagraphs(input)).toBe(input);
  });

  it('한 문장짜리 문단은 그대로 둔다', () => {
    expect(enforceSentenceParagraphs('한 문장뿐입니다.')).toBe('한 문장뿐입니다.');
  });
});

describe('마침표가 문장 끝이 아닌 자리 — 여기서 깨지면 글이 망가진다', () => {
  it('소수점을 문장 끝으로 읽지 않는다', () => {
    const input = '실내 습도는 45.5% 정도가 적당합니다.';
    expect(enforceSentenceParagraphs(input)).toBe(input);
  });

  it('번호 목록을 쪼개지 않는다 — "1." 의 점은 문장 끝이 아니다', () => {
    const input = '1. 습도계를 두세요.\n2. 값을 확인하세요.\n3. 조절하세요.';
    expect(enforceSentenceParagraphs(input)).toBe(input);
  });

  it('표는 통째로 둔다', () => {
    const input = '| 기준 | 습도 |\n| --- | --- |\n| 비염 | 50~60% |';
    expect(enforceSentenceParagraphs(input)).toBe(input);
  });

  it('소제목 줄을 쪼개지 않는다', () => {
    const input = '## 습도 기준. 그리고 온도';
    expect(enforceSentenceParagraphs(input)).toBe(input);
  });

  it('모델명 안의 점을 문장 끝으로 읽지 않는다', () => {
    const input = '모델은 CFD-FNL201DCGW 입니다. 색상은 두 가지예요.';
    expect(enforceSentenceParagraphs(input)).toBe(
      '모델은 CFD-FNL201DCGW 입니다.\n\n색상은 두 가지예요.',
    );
  });

  it('말줄임표에서 끊지 않는다', () => {
    const input = '고민이 되죠... 그래서 정리했습니다.';
    expect(enforceSentenceParagraphs(input)).toBe(input);
  });
});

describe('문단 경계는 보존한다', () => {
  it('여러 문단이 섞여 있어도 각각 처리한다', () => {
    const input = '가 문장. 나 문장입니다.\n\n다 문장. 라 문장입니다.';
    expect(enforceSentenceParagraphs(input)).toBe(
      '가 문장.\n\n나 문장입니다.\n\n다 문장.\n\n라 문장입니다.',
    );
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(enforceSentenceParagraphs('')).toBe('');
    expect(() => enforceSentenceParagraphs(undefined as never)).not.toThrow();
  });
});
