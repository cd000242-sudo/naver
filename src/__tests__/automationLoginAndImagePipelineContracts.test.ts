import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

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

  it('passes full image objects to collected-image matching in multi-account flow', () => {
    const source = read('src/renderer/modules/multiAccountManager.ts');

    expect(source).toContain('collectedImages: generatedImages,');
    expect(source).not.toContain('collectedImages: generatedImages.map((img) => img.url || img.filePath)');
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

  it('recognizes current Naver writer URL variants after manual login', () => {
    const source = read('src/naverBlogAutomation.ts');

    expect(source).toContain("currentUrl.includes('PostWriteForm')");
    expect(source).toContain('/[?&]Redirect=Write\\b/i.test(currentUrl)');
    expect(source).toContain("retryUrl.includes('PostWriteForm')");
    expect(source).toContain('/[?&]Redirect=Write\\b/i.test(retryUrl)');
    expect(source).toContain("!currentUrl.includes('PostWriteForm')");
    expect(source).toContain('!/[?&]Redirect=Write\\b/i.test(currentUrl)');
    expect(source).toContain('[Pipeline] login step start');
    expect(source).toContain('[Pipeline] editor frame ready');
  });
});
