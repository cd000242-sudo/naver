import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureContentParagraphBreaks } from '../contentBodyTransforms';

/**
 * [2026-09-02 실측] 후처리기를 2~3문장으로 바꾼 뒤 dist 로 돌려 보니, 200자를 넘는 긴 문단은
 * 안전망(ensureParagraphBreaks)이 먼저 랜덤 2~3 으로 나눠 7문장 → 2+2+2+1 — 마지막 문장이 혼자 남았다.
 * 후처리기는 나누기만 하고 합치지 않으니 그 1 은 그대로 화면에 간다.
 * 세 자리(프롬프트·후처리기·안전망)가 같은 묶음 규칙을 써야 한다.
 */
const SEVEN = [
  '닥터웰 종아리 마사지기는 바지처럼 입는 방식이라 처음엔 낯설게 느껴집니다.',
  '지퍼를 올리고 전원을 켜면 발끝부터 허벅지 쪽으로 공기가 차오릅니다.',
  '압박 강도는 세 단계인데 첫날은 가장 약한 단계로 시작하는 편이 낫습니다.',
  '소음은 거의 없어서 누워서 영상을 보며 쓸 수 있었습니다.',
  '다만 종아리보다 허벅지 쪽이 더 조여진다는 구매자 의견이 있습니다.',
  '15분 자동 종료라 잠들어도 부담이 없습니다.',
  '어르신께 드릴 때는 지퍼 조작을 한 번 같이 해 보는 것이 좋습니다.',
];

describe('긴 문단 안전망도 2~3문장씩 고르게 — 혼자 남는 문장 없음', () => {
  it('빈 줄 없는 7문장(230자↑) → 3+2+2, 문단 안 문장은 이어 쓴다', () => {
    const out = ensureContentParagraphBreaks({ bodyPlain: SEVEN.join(' '), headings: [] } as never).bodyPlain as string;
    const paragraphs = out.split('\n\n');
    // [2026-09-02 사장님 참고글] 문단 안 문장은 이어진다(자연 줄바꿈) — 줄바꿈으로 나누던 것을 되돌렸다.
    expect(paragraphs).toEqual([SEVEN.slice(0, 3).join(' '), SEVEN.slice(3, 5).join(' '), SEVEN.slice(5, 7).join(' ')]);
  });

  it('여러 번 돌려도 같다 — 랜덤이 아니다', () => {
    const first = ensureContentParagraphBreaks({ bodyPlain: SEVEN.join(' '), headings: [] } as never).bodyPlain;
    for (let i = 0; i < 5; i += 1) {
      expect(ensureContentParagraphBreaks({ bodyPlain: SEVEN.join(' '), headings: [] } as never).bodyPlain).toBe(first);
    }
  });

  it('안전망이 후처리기의 묶음 함수를 쓴다', () => {
    const src = readFileSync(resolve(__dirname, '..', 'contentBodyTransforms.ts'), 'utf-8');
    expect(src).toMatch(/const sizes = paragraphGroupSizes\(sentences\.length\);/u);
    expect(src).not.toMatch(/Math\.random\(\) \* [23]\) \+ [12]/u);
  });
});
