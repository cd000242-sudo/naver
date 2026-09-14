import { describe, expect, it, vi } from 'vitest';
import { materializeEditorBodyFallbackText } from '../automation/editorWriterTextSemantics.js';
import { typeBodyWithRetry, extractBodyForHeading } from '../automation/editorHelpers.js';
import { headingLineBoundary } from '../automation/structuredHeadingCleanup.js';

describe('empty Markdown headings never reach keyboard fallback', () => {
  it.each(['##', ' \r\n###\r\n ', '**##**', '##\u200b'])('skips marker-only body %j before touching the editor', async (text) => {
    const self = { log: vi.fn(), retry: vi.fn().mockRejectedValue(new Error('unexpected editor interaction')) };
    await expect(typeBodyWithRetry(self, {} as any, {} as any, text)).resolves.toBe('');
    expect(self.retry).not.toHaveBeenCalled();
  });

  it('removes empty markers from fallback while retaining headings, hashtags and inline hashes', () => {
    const text = '##\n첫 문단입니다.\n\n**###**\n## 실제 소제목\n#생활팁\nC#과 본문의 ## 표시는 유지합니다.';
    expect(materializeEditorBodyFallbackText(text)).toBe('첫 문단입니다.\n\n## 실제 소제목\n#생활팁\nC#과 본문의 ## 표시는 유지합니다.');
  });
});

describe('section extraction excludes the complete next heading marker', () => {
  it('preserves prose before a title that appears in the same line', () => {
    const content = '본문에서 보관 방법을 설명합니다.';
    const index = content.indexOf('보관 방법');
    expect(headingLineBoundary(content, index)).toBe(index);
  });

  it.each(['', '소개 문단\r\n'])('includes heading prefixes after %j', (intro) => {
    const content = `${intro}## **보관 방법**\r\n본문`;
    expect(headingLineBoundary(content, content.indexOf('보관 방법'))).toBe(intro.length);
  });

  it('handles a plain heading at index zero', () => {
    expect(headingLineBoundary('보관 방법\n본문', 0)).toBe(0);
  });

  it.each(['## ', '### **', ''])('does not leave the prefix %j of the next section in this body', (prefix) => {
    const body = '꿀을 먹기 전에 성분과 보관 상태를 확인하는 방법을 충분히 자세하게 정리합니다.';
    const next = prefix.endsWith('**') ? `${prefix}보관 방법**` : `${prefix}보관 방법`;
    const headings = [{ title: '확인 사항' }, { title: '보관 방법' }];
    const result = extractBodyForHeading({ log: vi.fn() }, `## 확인 사항\n${body}\n\n${next}\n두 번째 본문입니다.`, '확인 사항', 0, 2, headings);
    expect(result).toBe(body);
  });
});
