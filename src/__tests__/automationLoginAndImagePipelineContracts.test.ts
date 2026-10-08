import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { classifyBlogWriteNavigationUrl } from '../automation/editorNavigationUrlPolicy';
import { resolveServerSessionProbeVerdict } from '../automation/serverSessionProbePolicy';

const root = process.cwd();
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

describe('automation login and image pipeline contracts', () => {
  it('exposes the image matching IPC used by renderer publishing flows', () => {
    const preload = read('src/preload.ts');
    const globalTypes = read('src/renderer/global.d.ts');

    expect(preload).toContain('matchImages:');
    expect(preload).toContain("ipcRenderer.invoke('automation:matchImages', payload)");
    expect(globalTypes).toContain('matchImages: (payload:');
  });

  it('places collected originals directly in multi-account flow without AI matching', () => {
    const source = read('src/renderer/modules/multiAccountManager.ts');

    expect(source).toContain('createShoppingCollectedPublishImages({');
    expect(source).toContain('AI 이미지 호출 없음');
    expect(source).not.toContain("const shouldMatchCollected = scSubImageModePre === 'collected';");
  });

  it('does not hammer Gemini prompt translation after a 429 response', () => {
    const source = read('src/renderer/modules/promptTranslation.ts');

    expect(source).toContain('geminiPromptCooldownUntil');
    expect(source).toContain('response.status === 429');
    expect(source).toContain('falling back to next prompt engine');
  });

  it('only hard-fails empty image management lists when that source was explicitly selected', () => {
    const source = read('src/renderer/modules/fullAutoFlow.ts');

    expect(source).toContain("formData.imageSource === 'image-management'");
    expect(source).toContain("formData.imageSource === 'saved'");
    expect(source).toContain("formData.imageSource === 'local-folder'");
  });

  it.each([
    'https://blog.naver.com/GoBlogWrite.naver',
    'https://blog.naver.com/PostWriteForm.naver?blogId=account',
    'https://blog.naver.com/account?Redirect=Write',
  ])('recognizes %s after manual login only with positive editor evidence', (finalUrl) => {
    expect(classifyBlogWriteNavigationUrl(finalUrl).isEditorUrl).toBe(true);
    expect(resolveServerSessionProbeVerdict({ finalUrl, status: 200, hasEditor: true }).ok).toBe(true);
    expect(resolveServerSessionProbeVerdict({ finalUrl, status: 200 }).ok).toBe(false);
  });

  it('checks persistent session state and preserves typed stop errors before editor navigation', () => {
    const source = read('src/naverBlogAutomation.ts');
    const manager = read('src/browserSessionManager.ts');
    expect(source.includes('ensureServerSession(this.options.naverId)')).toBe(true);
    expect(source.includes('resolveBlogWriteFrameSwitchSurface(currentUrl)')).toBe(true);
    expect(source.includes('classifyBlogWriteNavigationUrl(page.url())')).toBe(true);
    expect(source.includes('PUBLISH_PIPELINE_LOG_MESSAGES.editorFrameReady')).toBe(true);
    expect(manager.includes('getAccountExecutionGuard().pause(accountId, code)')).toBe(true);
    expect(manager.includes('throw new AccountExecutionGuardError(code,')).toBe(true);
    expect(/ensureServerSession\([^)]*\)\s*\.catch\(\(\)\s*=>\s*false/.test(source)).toBe(false);
  });
});
