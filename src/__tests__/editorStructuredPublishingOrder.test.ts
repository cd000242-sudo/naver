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

  it('recovers section body from heading.content when bodyPlain has no heading markers', () => {
    expect(editorHelpersSource).toContain('bodyTextHasHeadingMarkers');
    expect(editorHelpersSource).toContain('[본문복구] heading.content 우선 사용');
  });

  it('recovers introduction from bodyPlain before the first heading when introduction is empty', () => {
    expect(editorHelpersSource).toContain('[도입부 복구] bodyPlain에서 서론');
    expect(editorHelpersSource).toContain('firstHeadingPos > 0');
  });
});
