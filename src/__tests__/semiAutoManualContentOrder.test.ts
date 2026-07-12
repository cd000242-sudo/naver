import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf-8');

describe('semi-auto manual content order guards', () => {
  const editorHelpers = read('src', 'automation', 'editorHelpers.ts');
  const publishingHandlers = read('src', 'renderer', 'modules', 'publishingHandlers.ts');

  it('preserves pasted heading.content when normalized display headings no longer match source headings', () => {
    const splitStart = editorHelpers.indexOf('if (structured._bodyManuallyEdited && headings.length > 0)');
    const splitEnd = editorHelpers.indexOf('// ✅ [2026-06-17 FIX]', splitStart);
    const splitBlock = editorHelpers.slice(splitStart, splitEnd);

    expect(splitBlock).toContain('const headingsHaveManualContent =');
    expect(splitBlock).toContain('[편집 분할] heading title 매칭 실패');

    const preserveIndex = splitBlock.indexOf('[편집 분할] heading title 매칭 실패');
    const uniformFallbackIndex = splitBlock.indexOf('균등 분할 폴백');

    expect(preserveIndex).toBeGreaterThan(-1);
    expect(uniformFallbackIndex).toBeGreaterThan(preserveIndex);
  });

  it('uses parsed heading.content before full-body extraction in the no-image branch', () => {
    const branchStart = editorHelpers.indexOf('// 이미지 건너뛰기 모드일 때');
    const branchEnd = editorHelpers.indexOf('// d) CTA', branchStart);
    const noImageBranch = editorHelpers.slice(branchStart, branchEnd);

    const directContentIndex = noImageBranch.indexOf('structured._bodyManuallyEdited && heading.content');
    const fullBodyExtractionIndex = noImageBranch.indexOf('self.extractBodyForHeading(bodyText, heading.title');

    expect(directContentIndex).toBeGreaterThan(-1);
    expect(fullBodyExtractionIndex).toBeGreaterThan(directContentIndex);
  });

  it('builds the publish snapshot directly from the current body instead of legacy resync chunks', () => {
    const publishStart = publishingHandlers.indexOf('export async function handleSemiAutoPublish');
    const publishBlock = publishingHandlers.slice(publishStart);

    expect(publishBlock).toContain('resolveSemiAutoPublishStructure(content, existingSemiAutoHeadings');
    expect(publishBlock).not.toContain('reSyncHeadingsContent(existingSemiAutoHeadings, content)');
    expect(publishBlock).toContain('_manualSectionOrderLocked: semiAutoPublishStructure.orderLocked');
    expect(publishBlock).toContain('introduction: semiAutoPublishStructure.introduction');
  });
});
