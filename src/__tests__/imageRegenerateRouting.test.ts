// SPEC-NAVER-IMAGE-2026 FINAL IMAGE FIX §2 — regenerate uses exactly the engine the user picked.
// Before: in the image grid, nano-banana-2 / nano-banana / flow / imagefx / dropshot fell through to a NAVER
// image search, and the "🤖 AI 이미지 생성" button always called nano-banana-pro (then pollinations, then
// NAVER) whatever the user had picked.
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readSelectedImageSource,
  regenerateWithSelectedEngine,
  resolveImageRegenerateRoute,
} from '../renderer/modules/imageDisplayGrid';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n');
const g = globalThis as any;

function pick(source: string) {
  g.document = {
    getElementById: (id: string) => (id === 'image-source-select' ? { value: source } : null),
    querySelector: () => null,
  };
}

afterEach(() => {
  delete g.document;
  delete g.generateImagesWithCostSafety;
});

describe('resolveImageRegenerateRoute', () => {
  it.each([
    'nano-banana-2', 'flow', 'imagefx', 'dropshot', 'nano-banana-pro', 'nano-banana',
    'openai-image', 'leonardoai', 'deepinfra', 'prodia', 'naver',
  ])('%s → regenerates with %s', (source) => {
    expect(resolveImageRegenerateRoute(source)).toEqual({ kind: 'generate', provider: source });
  });

  it.each(['stability', 'falai', 'pollinations', 'saved', 'local-folder', 'unknown-engine'])(
    '%s → refused with a visible message, never silently switched', (source) => {
      const route = resolveImageRegenerateRoute(source);
      expect(route.kind).toBe('blocked');
      expect((route as any).message).toContain('자동 대체하지 않습니다');
    },
  );

  it('no engine picked → refused (no silent nano-banana-pro default)', () => {
    expect(resolveImageRegenerateRoute('')).toMatchObject({ kind: 'blocked' });
  });
});

describe('dispatcher gets exactly the picked engine', () => {
  it.each(['nano-banana-2', 'flow', 'imagefx', 'dropshot', 'naver'])('%s', async (source) => {
    pick(source);
    g.generateImagesWithCostSafety = vi.fn(async () => ({
      success: true,
      images: [{ previewDataUrl: 'data:new', provider: source, textRendered: false }],
    }));
    const result = await regenerateWithSelectedEngine('신청 방법', 'a prompt');
    expect(g.generateImagesWithCostSafety).toHaveBeenCalledTimes(1);
    expect(g.generateImagesWithCostSafety.mock.calls[0][0]).toMatchObject({
      provider: source,
      items: [{ heading: '신청 방법', prompt: 'a prompt' }],
      regenerate: true,
    });
    expect(result.image.provider).toBe(source);
  });

  it('the dropdown wins over legacy buttons', () => {
    pick('flow');
    expect(readSelectedImageSource()).toBe('flow');
  });

  it('a failure is reported, not replaced by another engine', async () => {
    pick('flow');
    g.generateImagesWithCostSafety = vi.fn(async () => ({ success: false, message: 'Flow 로그인 필요' }));
    await expect(regenerateWithSelectedEngine('h', 'p')).rejects.toThrow('Flow 로그인 필요');
    expect(g.generateImagesWithCostSafety).toHaveBeenCalledTimes(1);
  });

  it('a refused engine makes no call at all', async () => {
    pick('stability');
    g.generateImagesWithCostSafety = vi.fn();
    await expect(regenerateWithSelectedEngine('h', 'p')).rejects.toThrow('stability');
    expect(g.generateImagesWithCostSafety).not.toHaveBeenCalled();
  });

  it('the new image carries its own text state (FINAL §3), not the replaced one', async () => {
    pick('openai-image');
    g.generateImagesWithCostSafety = vi.fn(async () => ({ success: true, images: [{ filePath: 'C:/n.png' }] }));
    const result = await regenerateWithSelectedEngine('h', 'p');
    expect(result.image).toMatchObject({ provider: 'openai-image', textRendered: false, disableTextOverlay: false });
  });
});

describe('every regenerate entry point uses the one routing rule (source guards)', () => {
  const grid = read('renderer/modules/imageDisplayGrid.ts');
  const renderer = read('renderer/renderer.ts');
  const headingTab = read('renderer/modules/headingImageGen.ts');

  // The implementation, not an earlier `declare`/type line with the same name.
  const body = (src: string, name: string) => {
    const start = src.indexOf(`async function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\n}\n', start);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end);
  };

  it('grid 🔄 and prompt card 🔄 call the routed helper, never a NAVER search or a fixed engine', () => {
    for (const name of ['regenerateImageFromGrid', 'regenerateSingleImageWithPromptItem']) {
      const fn = body(grid, name);
      expect(fn).toMatch(/regenerateWithSelectedEngine\(heading, prompt\)/);
      expect(fn).not.toMatch(/searchNaverImage\(|generateNanoBananaProImage\(|provider: 'stability'|provider: 'falai'/);
    }
  });

  it('"🤖 AI 이미지 생성" makes one call with the picked engine — no nano-banana-pro / pollinations / NAVER chain', () => {
    const fn = body(renderer, 'regenerateWithNewAI');
    expect(fn).toMatch(/resolveImageRegenerateRoute\(readSelectedImageSource\(\)\)/);
    expect(fn).not.toMatch(/generateNanoBananaProImage\(|searchNaverImage\(|'pollinations'/);
    expect(fn.match(/generateImagesWithCostSafety\(/g)).toHaveLength(1);
  });

  it('heading-card regenerate uses the same rule (no silent nano-banana-pro default)', () => {
    expect(headingTab).toMatch(/const route = resolveImageRegenerateRoute\(selectedSource\);/);
    expect(headingTab).not.toMatch(/: 'nano-banana-pro';\s*\n\s*\n\s*if \(selectedSource === 'saved'\)/);
  });
});
