import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('structured editor publishing order', () => {
  const editorHelpersSource = readFileSync(
    new URL('../automation/editorHelpers.ts', import.meta.url),
    'utf8',
  );

  it('keeps the section order as heading image before section body', () => {
    const imageInsertIndex = editorHelpersSource.indexOf(
      'await self.insertImagesAtCurrentCursor(allSectionImages, page, imageFrame, resolved.affiliateLink);',
    );
    const bodyPasteIndex = editorHelpersSource.indexOf(
      'await self.typeBodyWithRetry(bodyFrame, page, cleanBody, 19);',
    );

    expect(imageInsertIndex).toBeGreaterThan(0);
    expect(bodyPasteIndex).toBeGreaterThan(0);
    expect(imageInsertIndex).toBeLessThan(bodyPasteIndex);
  });

  it('recovers the editor cursor after image insertion before pasting body content', () => {
    const imageInsertIndex = editorHelpersSource.indexOf(
      'await self.insertImagesAtCurrentCursor(allSectionImages, page, imageFrame, resolved.affiliateLink);',
    );
    const bodyFrameIndex = editorHelpersSource.indexOf('bodyFrame = (await self.getAttachedFrame());');
    const bodyReadyIndex = editorHelpersSource.indexOf('let bodyReady = await ensureTailTypingReady(page, bodyFrame');
    const bodyPasteIndex = editorHelpersSource.indexOf(
      'await self.typeBodyWithRetry(bodyFrame, page, cleanBody, 19);',
    );

    expect(imageInsertIndex).toBeLessThan(bodyFrameIndex);
    expect(bodyFrameIndex).toBeLessThan(bodyReadyIndex);
    expect(bodyReadyIndex).toBeLessThan(bodyPasteIndex);
  });

  // [2026-06-23] SmartEditor anchors its model caret only on real clicks; after an
  // image the caret may be stuck off the text proxy, so a single failed recovery
  // must NOT proceed straight to typing (body lands in the dead proxy → +0 chars,
  // "소제목만 작성되고 본문 누락"). Lock the retry + click-based re-anchor.
  it('retries the post-image caret recovery instead of giving up after one attempt', () => {
    expect(editorHelpersSource).toMatch(/for \(let r = 0; r < 3 && !bodyReady; r\+\+\)/);
    expect(editorHelpersSource).toContain('await focusLastEditableLine(page, bodyFrame)');
  });

  it('re-anchors the caret (click) right before the keyboard typing fallback', () => {
    const fallbackLog = editorHelpersSource.indexOf('최후 안전 키보드 입력 fallback');
    const focusBeforeTyping = editorHelpersSource.indexOf('await focusLastEditableLine(page, frame)');
    const typingLoop = editorHelpersSource.indexOf('const paragraphs = normalizedText');
    expect(fallbackLog).toBeGreaterThan(-1);
    expect(focusBeforeTyping).toBeGreaterThan(fallbackLog);
    expect(focusBeforeTyping).toBeLessThan(typingLoop);
  });

  it('verifies the true document tail before inserting every subtitle', () => {
    const automationSource = readFileSync(
      new URL('../naverBlogAutomation.ts', import.meta.url),
      'utf8',
    );
    const start = automationSource.indexOf('private async typeSubtitleWithRetry');
    const end = automationSource.indexOf('// 인용구 삽입 헬퍼', start);
    const subtitleWriter = automationSource.slice(start, end);
    const tailGuard = subtitleWriter.indexOf('ensureTailTypingReady');
    const quotationInsert = subtitleWriter.indexOf('insertQuotation');

    expect(tailGuard).toBeGreaterThan(-1);
    expect(tailGuard).toBeLessThan(quotationInsert);
    expect(subtitleWriter).not.toContain('range.setStartAfter(lastNode)');
  });

  it('never retries the entire structured writer after any editor mutation', () => {
    const applyStart = editorHelpersSource.indexOf('export async function applyStructuredContent');
    const applyEnd = editorHelpersSource.indexOf('// ── setFontSize', applyStart);
    const structuredWriter = editorHelpersSource.slice(applyStart, applyEnd);

    expect(structuredWriter).toContain("}, 1, '콘텐츠 적용');");
    expect(structuredWriter).not.toContain("}, 3, '콘텐츠 적용');");
  });

  it('does not blindly retry partially mutated subtitle or body blocks', () => {
    const bodyStart = editorHelpersSource.indexOf('export async function typeBodyWithRetry');
    const bodyEnd = editorHelpersSource.indexOf('// ── applyStructuredContent', bodyStart);
    const bodyWriter = editorHelpersSource.slice(bodyStart, bodyEnd);
    const automationSource = readFileSync(
      new URL('../naverBlogAutomation.ts', import.meta.url),
      'utf8',
    );
    const subtitleStart = automationSource.indexOf('private async typeSubtitleWithRetry');
    const subtitleEnd = automationSource.indexOf('// 인용구 삽입 헬퍼', subtitleStart);
    const subtitleWriter = automationSource.slice(subtitleStart, subtitleEnd);

    expect(bodyWriter).toContain("}, 1, '본문 입력');");
    expect(subtitleWriter).toContain("}, 1, '소제목(인용구) 입력');");
  });

  it('recovers section body from heading.content when bodyPlain has no heading markers', () => {
    expect(editorHelpersSource).toContain('bodyTextHasHeadingMarkers');
    expect(editorHelpersSource).toContain('[본문복구] heading.content 우선 사용');
  });

  it('recovers introduction from bodyPlain before the first heading when introduction is empty', () => {
    expect(editorHelpersSource).toContain('[도입부 복구] bodyPlain에서 서론');
    expect(editorHelpersSource).toContain('firstHeadingPos > 0');
  });
});
