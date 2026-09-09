import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatImageNarrativeContext } from '../imageNarrative/context.js';

const basePrompt = readFileSync(
  resolve(process.cwd(), 'src/prompts/imageNarrative/base.prompt'),
  'utf8',
);

/*
 * [2026-09-09 사장님 실측] "2000자 가까이 넣은 내 경험이 일부만 반영이 되어 있는 것 같아요."
 *
 * 뿌리는 두 군데였다.
 *   1) context.ts 가 사장님이 적어 준 재료를 "참고 배경입니다" 라고 소개했다 — 안 써도 되는 정보.
 *   2) P2 가 "사진에 실제로 보이는 것만 서술" 이라, 사진에 없는 경험은 아예 금지 대상이었다.
 * 둘 다 고친 뒤에도 다시 '참고'로 되돌아가지 못하게 잠근다.
 */
describe('글쓴이가 적어 준 재료는 선택 사항이 아니다', () => {
  const block = formatImageNarrativeContext({
    notes: '확실히 맛집이라그런지 건너편에 대기실이있더라',
  });

  it('필수 재료로 소개한다', () => {
    expect(block).toContain('반드시 반영');
    expect(block).toMatch(/빠짐없이 본문 어딘가에 녹여/);
  });

  it('"참고 배경"으로 되돌아가지 않는다 (회귀 잠금)', () => {
    expect(block).not.toMatch(/참고 배경/);
  });

  it('사진에 안 보인다는 이유로 버리지 못하게 한다', () => {
    expect(block).toMatch(/사진에 안 보인다는 이유로 빼지 말 것/);
    expect(basePrompt).toMatch(/글쓴이가 적어 준 일은 사진에 안 보여도 사실이니 반드시 살린다/);
  });

  it('P2 는 여전히 그 밖의 사실을 지어내지 못하게 막는다', () => {
    expect(basePrompt).toMatch(/이 둘 밖의 사실을 지어내는 것은 금지/);
    expect(block).toMatch(/새로 지어내는 것은 금지/);
  });
});

/*
 * [2026-09-09 사장님] "동화를 낭독하듯이 글이 나왔는데 이러지 말고, 상황 칸을 보면 사용자의
 * 말투를 알 수 있으니 반말로 작성했다면 어색하지 않게 존댓말로 바꿔주면 돼."
 */
describe('어체는 글쓴이의 말투에서 배운다', () => {
  const block = formatImageNarrativeContext({ notes: '조금 아쉬웠어' });

  it('반말 재료를 존댓말로 옮기라고 지시한다', () => {
    for (const source of [block, basePrompt]) {
      expect(source).toMatch(/존댓말/);
      expect(source).toMatch(/아쉬웠습니다/);
    }
  });

  it('동화 낭독조를 금지한다', () => {
    for (const source of [block, basePrompt]) {
      expect(source).toMatch(/였답니다/);
      expect(source).toMatch(/AI 글로 읽힌다/);
    }
  });
});
