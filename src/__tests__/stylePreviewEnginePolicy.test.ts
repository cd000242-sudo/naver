import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolveStylePreviewEngine } from '../image/stylePreviewEnginePolicy.js';

const ROOT = path.resolve(__dirname, '..');

describe('style preview engine routing', () => {
  it('preserves every supported engine instead of silently changing providers', () => {
    expect(resolveStylePreviewEngine(undefined)).toMatchObject({ engine: 'flow', kind: 'flow' });
    expect(resolveStylePreviewEngine('flow')).toMatchObject({ engine: 'flow', kind: 'flow' });
    expect(resolveStylePreviewEngine('imagefx')).toMatchObject({ engine: 'imagefx', kind: 'imagefx' });
    expect(resolveStylePreviewEngine('deepinfra-flux')).toMatchObject({ engine: 'deepinfra', kind: 'deepinfra' });
    expect(resolveStylePreviewEngine('pollinations')).toMatchObject({ engine: 'pollinations', kind: 'pollinations' });
  });

  it('maps each Nano Banana selector to its exact current model', () => {
    expect(resolveStylePreviewEngine('gemini')).toMatchObject({
      kind: 'gemini', model: 'gemini-3.1-flash-lite-image',
    });
    expect(resolveStylePreviewEngine('nano-banana')).toMatchObject({
      kind: 'gemini', model: 'gemini-2.5-flash-image',
    });
    expect(resolveStylePreviewEngine('nano-banana-2')).toMatchObject({
      kind: 'gemini', model: 'gemini-3.1-flash-image',
    });
    expect(resolveStylePreviewEngine('nano-banana-pro')).toMatchObject({
      kind: 'gemini', model: 'gemini-3-pro-image',
    });
  });

  it('rejects unsupported engines instead of using Gemini as a hidden fallback', () => {
    expect(resolveStylePreviewEngine('openai-image')).toBeNull();
    expect(resolveStylePreviewEngine('dropshot')).toBeNull();
    expect(resolveStylePreviewEngine('unknown-engine')).toBeNull();

    const handlers = fs.readFileSync(path.join(ROOT, 'main/ipc/imageHandlers.ts'), 'utf-8');
    expect(handlers).toContain('STYLE_PREVIEW_ENGINE_UNSUPPORTED');
    expect(handlers).not.toContain('// 기본 폴백: Gemini');
  });

  it('keeps test-image Nano Banana tiers exact and rejects unknown engines', () => {
    const handlers = fs.readFileSync(path.join(ROOT, 'main/ipc/imageHandlers.ts'), 'utf-8');
    const start = handlers.indexOf("safeHandle('generate-test-image'");
    const end = handlers.indexOf("safeHandle('get-style-preview-cache'", start);
    const testImageHandler = handlers.slice(start, end);

    expect(testImageHandler).toContain("case 'nano-banana':");
    expect(testImageHandler).toContain("case 'nano-banana-2':");
    expect(testImageHandler).toContain("case 'nano-banana-pro':");
    expect(testImageHandler).toContain('resolveStylePreviewEngine(imageSource)');
    expect(testImageHandler).not.toContain('GEMINI_IMAGE_MODELS.NANO_BANANA_LITE');
    expect(testImageHandler).toContain('IMAGE_ENGINE_UNSUPPORTED');
  });

  it('registers generate-test-image exactly once so the current router is reachable', () => {
    const tableHandlers = fs.readFileSync(path.join(ROOT, 'main/ipc/imageTableHandlers.ts'), 'utf-8');
    const imageHandlers = fs.readFileSync(path.join(ROOT, 'main/ipc/imageHandlers.ts'), 'utf-8');

    expect(tableHandlers).not.toContain("ipcMain.handle('generate-test-image'");
    expect(imageHandlers.match(/safeHandle\('generate-test-image'/g)).toHaveLength(1);
  });
});
