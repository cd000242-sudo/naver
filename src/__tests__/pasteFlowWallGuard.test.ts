import { describe, expect, it } from 'vitest';

import { buildMobileRichHtml } from '../automation/richTextPaste';

/**
 * [2026-09-03 새벽 사장님 화면] "문단정리 하나도 안되어있는데..??" — 발행글이 벽이었다.
 * 생성 단계는 45문장 → 15문단으로 나눴는데, 편집 경로(_bodyManuallyEdited)를 거친 본문이 빈 줄 없는
 * 한 줄로 붙여넣기에 왔고, 흐름 모드는 한 줄을 문단 하나로 만들었다. 붙여넣기도 같은 규칙을 가진다.
 */
const S = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}번째 문장입니다.`);

describe('흐름 모드도 벽을 만들지 않는다', () => {
  it('빈 줄 없는 8문장 한 줄 → 3+3+2 문단, 문단마다 스페이서', () => {
    const { html, paragraphCount } = buildMobileRichHtml(S(8).join(' '), { highlight: false });
    expect(paragraphCount).toBe(3);
    const paras = (html.match(/<p[^>]*data-rich-para-end="true"[^>]*>[\s\S]*?<\/p>/g) || []).filter((p) => !p.includes('data-rich-spacer'));
    expect(paras.length).toBe(3);
    expect((html.match(/data-rich-spacer="true"/g) || []).length).toBe(3);
    expect(paras[0]).toContain('1번째 문장입니다. 2번째 문장입니다. 3번째 문장입니다.');
  });

  it('3문장 이하는 한 문단 그대로', () => {
    const { paragraphCount } = buildMobileRichHtml(S(3).join(' '), { highlight: false });
    expect(paragraphCount).toBe(1);
  });

  it('빈 줄로 이미 나뉜 문단은 각각 그대로', () => {
    const text = `${S(2).join(' ')}\n\n${S(2).join(' ')}`;
    const { paragraphCount } = buildMobileRichHtml(text, { highlight: false });
    expect(paragraphCount).toBe(2);
  });
});
