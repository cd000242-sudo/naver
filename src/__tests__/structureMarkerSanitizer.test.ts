import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  removeInternalStructureMarkersFromContent,
  removeInternalStructureMarkersFromText,
} from '../contentBodyTransforms';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('internal structure marker sanitizer', () => {
  it('removes leaked parenthesized markers and sequence prefixes from generated text', () => {
    const input = [
      '(R) 원조 컬계의 믿고 보는 리뷰입니다.',
      '',
      'R->O->F: 특히 초저가 제품은 확인할 부분이 있습니다.',
      '',
      '(O)',
      '완성도가 생각보다 중요했어요.',
      '',
      '(F) 특히 실제 사용감이 핵심입니다.',
    ].join('\n');

    const result = removeInternalStructureMarkersFromText(input);

    expect(result).toContain('원조 컬계의 믿고 보는 리뷰입니다.');
    expect(result).toContain('특히 초저가 제품은 확인할 부분이 있습니다.');
    expect(result).toContain('완성도가 생각보다 중요했어요.');
    expect(result).toContain('특히 실제 사용감이 핵심입니다.');
    expect(result).not.toMatch(/\([FIRO]\)/);
    expect(result).not.toMatch(/[FIRO](?:\s*(?:\u2192|->|=>|>|\/|-)\s*[FIRO]){1,5}\s*[:：]?/);
  });

  it('cleans titles, candidates, headings, and body fields together', () => {
    const content = removeInternalStructureMarkersFromContent({
      selectedTitle: '(R) 홈판 제목',
      titleAlternatives: ['R→O→F: 대안 제목'],
      titleCandidates: [{ text: '(O) 후보 제목', reasoning: 'R/O/F: 내부 이유' }],
      bodyPlain: '(F) 본문 첫 줄',
      bodyHtml: '(I) HTML 본문',
      headings: [
        { title: '(R) 소제목', content: '(O) 소제목 본문', body: 'F→I→O: 본문 body' },
      ],
    } as any);

    expect(content.selectedTitle).toBe('홈판 제목');
    expect(content.titleAlternatives).toEqual(['대안 제목']);
    expect(content.titleCandidates?.[0]?.text).toBe('후보 제목');
    expect(content.titleCandidates?.[0]?.reasoning).toBe('내부 이유');
    expect(content.bodyPlain).toBe('본문 첫 줄');
    expect(content.bodyHtml).toBe('HTML 본문');
    expect(content.headings?.[0]?.title).toBe('소제목');
    expect(content.headings?.[0]?.content).toBe('소제목 본문');
    expect((content.headings?.[0] as any)?.body).toBe('본문 body');
  });

  it('keeps homefeed prompts free of structure-letter instructions that can leak to users', () => {
    const homefeedPrompt = read('prompts/homefeed/base.prompt');
    const promptLoader = read('promptLoader.ts');

    expect(homefeedPrompt).not.toMatch(/\bFIRO\b|F\u2192|R\u2192|O\u2192|I\u2192|\([FIRO]\)|F\s+\(Fact\)|I\s+\(Interpretation\)|R\s+\(Reaction\)|O\s+\(Opinion\)/);
    expect(promptLoader).not.toMatch(/fifoVariation:\s*['"][^'"]*(?:F\u2192|R\u2192|O\u2192|I\u2192|R->O->F|R\/O\/F)/);
    expect(promptLoader).not.toContain('■ FIRO 순서 배치');
  });
});
