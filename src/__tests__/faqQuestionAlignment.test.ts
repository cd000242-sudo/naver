import { describe, expect, it } from 'vitest';

import { buildMobileRichHtml, buildPastePreviewHtml } from '../automation/richTextPaste';

const FAQ = [
  '숫자를 보고 나면 자연스럽게 생기는 질문입니다.',
  'Q1. 아파트를 공짜로 받는 건가요?',
  'A1: 아닙니다. 분양가는 똑같이 내야 합니다.',
  'Q2. 여러 번 받을 수 있나요?',
  'A2: 특별공급은 평생 한 번만 받을 수 있습니다.',
].join('\n\n');

function paragraphsContaining(html: string, text: RegExp): string[] {
  return (html.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || [])
    .filter(paragraph => text.test(paragraph.replace(/<[^>]+>/g, '')));
}

function expectFaqAlignment(html: string, alignment: 'left' | 'center'): void {
  const questions = paragraphsContaining(html, /^Q[12]\./);
  const answers = paragraphsContaining(html, /^A[12]:/);
  expect(questions).toHaveLength(2);
  expect(answers).toHaveLength(2);
  for (const paragraph of [...questions, ...answers]) {
    const openingTag = paragraph.slice(0, paragraph.indexOf('>'));
    expect(openingTag).toContain(`text-align:${alignment}`);
    expect(openingTag).not.toContain(`text-align:${alignment === 'left' ? 'center' : 'left'}`);
  }
}

describe('FAQ questions follow body alignment', () => {
  it('defaults both questions and answers to left alignment', () => {
    expectFaqAlignment(buildMobileRichHtml(FAQ, { highlight: false }).html, 'left');
  });

  it('honors explicit left alignment for questions and answers', () => {
    expectFaqAlignment(buildMobileRichHtml(FAQ, { highlight: false, centerAlign: false }).html, 'left');
  });

  it('preserves explicit center alignment for questions and answers', () => {
    expectFaqAlignment(buildMobileRichHtml(FAQ, { highlight: false, centerAlign: true }).html, 'center');
  });

  it('shows the same left-aligned questions in the paste preview', () => {
    expectFaqAlignment(buildPastePreviewHtml(FAQ), 'left');
  });

  it('does not change deliberate centered section-heading decoration', () => {
    const { html } = buildMobileRichHtml(`## 질문 모음\n\n${FAQ}`, { highlight: false });
    const heading = paragraphsContaining(html, /질문 모음/)
      .find(paragraph => paragraph.includes('data-rich-heading="true"'));
    expect(heading).toContain('text-align:center');
    expectFaqAlignment(html, 'left');
  });
});
