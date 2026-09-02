import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { enforceSentenceParagraphs, paragraphGroupSizes } from '../content/sentenceParagraphs';

/**
 * [2026-09-01 사장님 실측] 쇼핑커넥트 발행글이 뭉텅이로 나왔다 → "마침표가 있다면 한 번 띄우는 규칙".
 * [2026-09-02 사장님 결정] 그 규칙을 모든 모드에 걸었더니 문장 하나가 문단 하나가 되어 4편이 전부
 *   한 줄씩 끊긴 글로 나왔다. "문단정리 기본값을 2~3줄에서 줄바꿈 띄우기로."
 *
 * 새 계약: 한 문단이 3문장을 넘을 때만 2~3문장씩 고르게 나눈다. 3문장 이하는 손대지 않는다.
 * 기존 빈 줄은 절대 합치지 않는다. 마침표 함정(소수점·목록·표·소제목·말줄임표)은 그대로 못으로 박는다.
 */
describe('문단은 2~3문장 묶음이다', () => {
  it('두 문장은 한 문단이다 — 더는 마침표마다 가르지 않는다', () => {
    const input = '밀폐력이 우수해 불편함이 거의 없었다고 전합니다. 실제로 작동 중에는 부피가 줄어듭니다.';
    expect(enforceSentenceParagraphs(input)).toBe(input);
  });

  it('세 문장도 한 문단이다', () => {
    const input = '첫째 문장입니다. 둘째 문장입니다! 셋째 문장일까요?';
    expect(enforceSentenceParagraphs(input)).toBe(input);
  });

  it('네 문장은 2+2 — 혼자 남는 문장을 만들지 않는다', () => {
    const input = '가 문장. 나 문장. 다 문장. 라 문장.';
    expect(enforceSentenceParagraphs(input)).toBe('가 문장. 나 문장.\n\n다 문장. 라 문장.');
  });

  it('다섯 문장은 3+2, 일곱 문장은 3+2+2', () => {
    expect(enforceSentenceParagraphs('1문. 2문. 3문. 4문. 5문.')).toBe('1문. 2문. 3문.\n\n4문. 5문.');
    expect(enforceSentenceParagraphs('1문. 2문. 3문. 4문. 5문. 6문. 7문.')).toBe('1문. 2문. 3문.\n\n4문. 5문.\n\n6문. 7문.');
  });

  it('물음표·느낌표도 문장 끝으로 세되, 셋 이하면 그대로다', () => {
    expect(enforceSentenceParagraphs('이게 맞을까요? 저는 이렇게 봅니다.')).toBe('이게 맞을까요? 저는 이렇게 봅니다.');
    expect(enforceSentenceParagraphs('맞나요? 그렇죠! 아니면요? 다시 봅니다.')).toBe('맞나요? 그렇죠!\n\n아니면요? 다시 봅니다.');
  });

  it('묶음 크기는 항상 2~3 — 혼자 남는 문장 없음', () => {
    for (let n = 4; n <= 30; n += 1) {
      const sizes = paragraphGroupSizes(n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      expect(sizes.every((size) => size >= 2 && size <= 3)).toBe(true);
    }
    expect(paragraphGroupSizes(1)).toEqual([1]);
    expect(paragraphGroupSizes(3)).toEqual([3]);
    expect(paragraphGroupSizes(0)).toEqual([]);
  });

  it('한 문장짜리 문단은 그대로 둔다 — 리듬은 모델 몫이다', () => {
    expect(enforceSentenceParagraphs('한 문장뿐입니다.')).toBe('한 문장뿐입니다.');
    const rhythm = '한 줄로 끊은 판단.\n\n그 다음 두 문장이 이어집니다. 여기서 끝납니다.';
    expect(enforceSentenceParagraphs(rhythm)).toBe(rhythm);
  });
});

describe('마침표가 문장 끝이 아닌 자리 — 여기서 깨지면 글이 망가진다', () => {
  it('소수점을 문장 끝으로 읽지 않는다', () => {
    const input = '실내 습도는 45.5% 정도가 적당합니다. 온도는 22.5도가 좋습니다. 둘 다 재세요. 매일요.';
    expect(enforceSentenceParagraphs(input)).toBe('실내 습도는 45.5% 정도가 적당합니다. 온도는 22.5도가 좋습니다.\n\n둘 다 재세요. 매일요.');
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
    const input = '## 습도 기준. 그리고 온도. 그리고 바람. 그리고 빛.';
    expect(enforceSentenceParagraphs(input)).toBe(input);
  });

  it('모델명 안의 점을 문장 끝으로 읽지 않는다', () => {
    const input = '모델은 CFD-FNL201DCGW 입니다. 색상은 두 가지예요. 버전은 v2.5 입니다. 크기는 하나예요.';
    expect(enforceSentenceParagraphs(input)).toBe(
      '모델은 CFD-FNL201DCGW 입니다. 색상은 두 가지예요.\n\n버전은 v2.5 입니다. 크기는 하나예요.',
    );
  });

  it('말줄임표에서 끊지 않는다', () => {
    const input = '고민이 되죠... 그래서 정리했습니다. 하나만 고르세요. 둘은 안 됩니다. 셋도요.';
    expect(enforceSentenceParagraphs(input)).toBe('고민이 되죠... 그래서 정리했습니다. 하나만 고르세요.\n\n둘은 안 됩니다. 셋도요.');
  });
});

describe('문단 경계는 보존한다 — 나누기만 하고 합치지 않는다', () => {
  it('여러 문단이 섞여 있어도 각각 처리한다', () => {
    const input = '가 문장. 나 문장입니다.\n\n다 문장. 라 문장. 마 문장. 바 문장.';
    expect(enforceSentenceParagraphs(input)).toBe('가 문장. 나 문장입니다.\n\n다 문장. 라 문장.\n\n마 문장. 바 문장.');
  });

  it('이미 나뉜 한 문장 문단들을 합치지 않는다', () => {
    const input = '첫 문장입니다.\n\n둘째 문장입니다.\n\n셋째 문장입니다.';
    expect(enforceSentenceParagraphs(input)).toBe(input);
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(enforceSentenceParagraphs('')).toBe('');
    expect(() => enforceSentenceParagraphs(undefined as never)).not.toThrow();
  });
});

describe('살아 있는 경로에 배선돼 있다', () => {
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
