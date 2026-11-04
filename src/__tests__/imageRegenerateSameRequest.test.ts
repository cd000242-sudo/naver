// [2026-11-04] 사장님 "이미지 관리탭에서 재생성 버튼 누르면 … 프롬프트가 다른 것 같은데".
// First generation (headingImageGen generateOne / dedicated thumbnail) sends
//   { heading, prompt, englishPrompt, isThumbnail, allowText:false, ...referenceImage } + postTitle + isFullAuto,
// but every regenerate button sent only { heading, prompt } — so main ran sanitizeImagePrompt / PromptBuilder or the Flow
// re-translation instead of the same English scene, without the post title or reference, and a thumbnail lost its text rule.
// When no prompt was stored the Korean heading itself became the prompt.
import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildImageRegenerateRequest, regenerateWithSelectedEngine } from '../renderer/modules/imageDisplayGrid';

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n');
const g = globalThis as any;
const SCENE = 'a clerk stamping a housing subsidy form at a district office counter, natural light';

function page({ source = 'codex-image', title = '청년 월세 지원 신청 방법', thumbText = false } = {}) {
  g.document = {
    getElementById: (id: string) => ({
      'image-source-select': { value: source },
      'unified-generated-title': { value: title },
      'thumbnail-text-option': { checked: thumbText },
    } as Record<string, unknown>)[id] ?? null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  g.window = g.window || {};
}

afterEach(() => {
  delete g.document;
  delete g.generateImagesWithCostSafety;
  if (g.window) { delete g.window._headingTitles; delete g.window._headingPrompts; }
});

describe('regenerate sends the same request as the first generation', () => {
  it('heading image: same English scene as englishPrompt, no text, post title, full-auto path', () => {
    page();
    const request = buildImageRegenerateRequest('신청 방법', SCENE, { prompt: SCENE });
    expect(request.items).toHaveLength(1);
    expect(request.items[0]).toMatchObject({ heading: '신청 방법', prompt: SCENE, englishPrompt: SCENE, isThumbnail: false, allowText: false });
    expect(request).toMatchObject({ postTitle: '청년 월세 지원 신청 방법', isFullAuto: true });
  });

  it('a Korean heading passed as the prompt is replaced by the stored English scene', () => {
    page();
    const fromImage = buildImageRegenerateRequest('신청 방법', '신청 방법', { prompt: SCENE });
    expect(fromImage.items[0]).toMatchObject({ prompt: SCENE, englishPrompt: SCENE });
    g.window._headingTitles = ['자격 조건', '신청 방법'];
    g.window._headingPrompts = ['someone else', SCENE];
    const fromList = buildImageRegenerateRequest('신청 방법', '신청 방법', {});
    expect(fromList.items[0]).toMatchObject({ prompt: SCENE, englishPrompt: SCENE });
  });

  it('no English scene anywhere: the heading is sent without englishPrompt (main builds it, as before) and the gap is reported', () => {
    page();
    const request = buildImageRegenerateRequest('신청 방법', '신청 방법', {});
    expect(request.items[0].englishPrompt).toBeUndefined();
    expect(request.missingEnglishPrompt).toBe(true);
  });

  // [2026-11-04] 사장님: 이미지 관리 탭에서 썸네일을 만들면 글자가 안 들어간다. 슬롯 이름을 글 제목으로 바꾸면 썸네일 디렉터의
  //   AUTO 문구(엔진이 제목 포스터를 그림)가 꺼졌다 — 디렉터는 heading '🖼️ 썸네일' 에서만 켜진다. 제목은 postTitle 로 간다.
  it('thumbnail slot: keeps the slot name (director AUTO text), the title travels as postTitle', () => {
    page({ thumbText: true });
    const on = buildImageRegenerateRequest('🖼️ 썸네일', SCENE, { prompt: SCENE, isThumbnail: true });
    expect(on.items[0]).toMatchObject({ heading: '🖼️ 썸네일', isThumbnail: true, allowText: true, englishPrompt: SCENE });
    expect(on.postTitle).toBe('청년 월세 지원 신청 방법');
    const pin = buildImageRegenerateRequest('📌 썸네일', SCENE, { prompt: SCENE, isThumbnail: true });
    expect(pin.items[0].heading).toBe('🖼️ 썸네일');
    expect(on.thumbnailTextInclude).toBe(true);
    page({ thumbText: false });
    const off = buildImageRegenerateRequest('🖼️ 썸네일', SCENE, { prompt: SCENE });
    expect(off.items[0]).toMatchObject({ isThumbnail: true, allowText: false });
    expect(off.thumbnailTextInclude).toBe(false);
  });

  it('regenerateWithSelectedEngine dispatches that request (plus regenerate) with the picked engine', async () => {
    page({ source: 'flow' });
    g.generateImagesWithCostSafety = vi.fn(async () => ({ success: true, images: [{ previewDataUrl: 'data:new', provider: 'flow' }] }));
    await regenerateWithSelectedEngine('신청 방법', '신청 방법', { prompt: SCENE });
    const sent = g.generateImagesWithCostSafety.mock.calls[0][0];
    expect(sent).toMatchObject({ provider: 'flow', regenerate: true, isFullAuto: true, postTitle: '청년 월세 지원 신청 방법' });
    expect(sent.items[0]).toMatchObject({ heading: '신청 방법', prompt: SCENE, englishPrompt: SCENE, allowText: false, isThumbnail: false });
  });

  it('every regenerate path goes through the shared request builder', () => {
    const grid = read('renderer/modules/imageDisplayGrid.ts');
    const gen = read('renderer/modules/headingImageGen.ts');
    const single = gen.slice(gen.indexOf('async function regenerateSingleImage('), gen.indexOf('async function regenerateSingleImage(') + 4000);
    expect(single).toContain('buildImageRegenerateRequest(');
    expect(single).not.toMatch(/items: \[\{ heading: resolvedHeadingTitle, prompt: safePrompt \}\]/);
    const engine = grid.slice(grid.indexOf('export async function regenerateWithSelectedEngine('), grid.indexOf('export async function regenerateWithSelectedEngine(') + 900);
    expect(engine).toContain('buildImageRegenerateRequest(');
  });
});
