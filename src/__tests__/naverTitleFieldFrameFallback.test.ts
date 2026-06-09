import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Naver editor title field frame fallback', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'naverBlogAutomation.ts'), 'utf8');

  it('rescans all page frames when the initially attached frame has no editor title field', () => {
    expect(source).toContain('page.frames().filter((candidateFrame) => candidateFrame !== frame)');
    expect(source).toContain('editor.titleText.frameScan');
    expect(source).toContain('editor.documentTitle.frameScan');
  });

  it('verifies title input against the frame where the title field was actually found', () => {
    expect(source).toContain('const titleFrame = titleTarget.frame');
    expect(source).toContain('this.readEditorTitleText(titleFrame)');
    expect(source).toContain('this.collectEditorTitleDiagnostics(titleFrame, page)');
  });

  it('includes all frame selector counts in title diagnostics', () => {
    expect(source).toContain('allFrames=[');
    expect(source).toContain('frameDiagnostics.join');
  });
});
