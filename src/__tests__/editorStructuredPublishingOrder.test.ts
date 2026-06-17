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
    const bodyReadyIndex = editorHelpersSource.indexOf('const bodyReady = await ensureTailTypingReady(page, bodyFrame');
    const bodyPasteIndex = editorHelpersSource.indexOf(
      'await self.typeBodyWithRetry(bodyFrame, page, cleanBody, 19);',
    );

    expect(imageInsertIndex).toBeLessThan(bodyFrameIndex);
    expect(bodyFrameIndex).toBeLessThan(bodyReadyIndex);
    expect(bodyReadyIndex).toBeLessThan(bodyPasteIndex);
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
