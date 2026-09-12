import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripBoundaryHeading } from '../automation/structuredHeadingCleanup';
import { buildMobileRichHtml } from '../automation/richTextPaste';

const title = '2026 추석 온누리상품권 환급은 언제부터?';
const intro = '장보기 전에 행사 기간과 참여 시장을 확인하는 방법을 정리했습니다.';
const body = '추석 장보기를 전통시장에서 할 예정이라면 행사 날짜와 준비물을 확인하세요.';

describe('structured publishing duplicate heading cleanup', () => {
  it('removes the numbered rich heading immediately below the thumbnail, preserving the intro', () => {
    const source = `${intro}\n\n## ${title}`;
    expect(buildMobileRichHtml(source).html).toContain('data-rich-heading="true"');
    const cleaned = stripBoundaryHeading(source, title, 'end');
    expect(cleaned).toBe(intro);
    expect(buildMobileRichHtml(cleaned).html).not.toContain('data-rich-heading="true"');
  });

  it.each([title, `## ${title}`, `**1. ${title}**`, `> ${title}`, `## ${title} ##`])(
    'removes an echoed heading from the start of section content: %s', (heading) => {
      expect(stripBoundaryHeading(`${heading}\r\n\r\n${body}`, title, 'start')).toBe(body);
    },
  );

  it('removes repeated boundary copies and heading-only introductions', () => {
    expect(stripBoundaryHeading(`${intro}\n\n${title}\n\n## ${title}`, title, 'end')).toBe(intro);
    expect(stripBoundaryHeading(`## ${title}`, title, 'end')).toBe('');
  });

  it('preserves sentences mentioning the heading, unrelated headings, and body formatting', () => {
    for (const source of [`${title} 먼저 날짜를 확인하세요.\n\n${body}`, `## 준비물\n\n${body}`, `${intro}\r\n\r\n${title}\r\n\r\n${body}`]) {
      expect(stripBoundaryHeading(source, title, 'start')).toBe(source);
      expect(stripBoundaryHeading(source, title, 'end')).toBe(source);
    }
  });

  it('leaves content alone without a known heading and handles empty content', () => {
    expect(stripBoundaryHeading(intro, '', 'end')).toBe(intro);
    expect(stripBoundaryHeading('', title, 'start')).toBe('');
  });

  it('cleans both intro and image/no-image section input before rich rendering', () => {
    const source = readFileSync(new URL('../automation/editorHelpers.ts', import.meta.url), 'utf8');
    expect(source).toContain("stripBoundaryHeading(structured.introduction || '', headings[0]?.title || '', 'end')");
    const cleanup = source.indexOf("cleanBody = stripBoundaryHeading(cleanBody, heading.title, 'start')");
    expect(cleanup).toBeGreaterThan(0);
    expect(cleanup).toBeLessThan(source.indexOf('const interleaveSteps = planImageTextInterleave'));
    expect(source).toContain("cBody = stripBoundaryHeading(cBody, heading.title, 'start')");
  });
});
