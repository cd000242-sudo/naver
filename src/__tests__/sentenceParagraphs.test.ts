import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

describe('살아 있는 경로에 배선돼 있다', () => {
  /*
   * [2026-09-01] 처음에는 balanceContentMobileLines 에 걸었는데, 그 함수가
   * 코드베이스 어디서도 호출되지 않는 죽은 코드였다 — 규칙이 어느 모드에서도 안 돌았다.
   * 실제로 도는 것은 ensureContentParagraphBreaks 이고, contentGenerator 가 부른다.
   *
   * 기존 규칙에는 하한이 둘 있었다. ensureParagraphBreaks 는 200자 미만을,
   * applyPerSentenceLineBreaks 는 80자 미만을 건드리지 않는다. 사장님이 본 뭉텅이가
   * 그 사이 구간이었고, 나눌 때도 홑 개행이라 화면에서는 한 덩어리로 보였다.
   */
  it('죽은 함수가 아니라 실제로 불리는 함수에 걸려 있다', () => {
    const transforms = readFileSync(resolve(__dirname, '..', 'contentBodyTransforms.ts'), 'utf-8');
    const live = transforms.slice(transforms.indexOf('export function ensureContentParagraphBreaks'));
    expect(live.slice(0, 1400)).toMatch(/enforceSentenceParagraphs/);
  });

  it('contentGenerator 가 그 함수를 부른다', () => {
    const gen = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8');
    expect(gen).toMatch(/ensureContentParagraphBreaks\(/);
  });
});
