// SPEC-NAVER-IMAGE-2026 V1 §9 — engines that draw their own thumbnail text get the short phrase, not the title.
// Before: the brief said "render only the requested title text" without naming it, and the legacy nano
// template said Render EXACTLY "<whole title>" — so nano banana wrote the full 40-character title.
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { buildContextualImagePrompt, prepareProviderContextualImagePrompt } from '../image/contextualImagePrompt';
import { PromptBuilder } from '../image/promptBuilder';
import { resolveThumbnailOverlayText } from '../image/director/thumbnailText';
import { generateImagesWithThumbnailDirector } from '../image/director/thumbnailDirectorGate';
import { drawsKoreanTextItself } from '../image/director/koreanTextEngines';
import { applyKoreanTextOverlayIfNeeded, markEngineDrawnThumbnailText } from '../imageGenerator';
import type { GenerateImagesOptions, GeneratedImage } from '../image/types';

const TITLE = 'EV3 실구매가, 보조금 빼니 334만원 차이 나는 이유와 트림별 가격 총정리';
const SHORT = resolveThumbnailOverlayText(TITLE);
const policyLine = (brief: string) => brief.split('\n').find((line) => line.includes('TEXT POLICY')) || '';

describe('contextual brief names the exact thumbnail phrase', () => {
  const base = { articleTitle: TITLE, sectionHeading: TITLE, sectionContent: TITLE, isThumbnail: true, allowText: true };

  it('full brief: the text policy quotes the short phrase and never the title', () => {
    expect(SHORT).toBe('334만원 차이');
    const line = policyLine(buildContextualImagePrompt({ ...base, thumbnailText: SHORT }));
    expect(line).toContain(`"${SHORT}"`);
    expect(line).toContain('never write the article title');
    expect(line).not.toContain(TITLE);
  });

  it('compact ImageFX brief carries the same exact-text policy', () => {
    const brief = prepareProviderContextualImagePrompt('imagefx', { ...base, thumbnailText: SHORT });
    expect(brief).toContain(`Render exactly this Korean text once, at most 2 lines, large and legible: "${SHORT}"`);
  });

  it('FINAL §3: a thumbnail with no named phrase is drawn with ZERO TEXT (the app overlays the copy once)', () => {
    expect(policyLine(buildContextualImagePrompt(base))).toContain('ZERO TEXT');
    expect(prepareProviderContextualImagePrompt('imagefx', base)).toContain('Create a text-free image');
  });

  it('no text allowed → ZERO TEXT; a section image with text allowed keeps the old infographic policy', () => {
    expect(policyLine(buildContextualImagePrompt({ ...base, allowText: false, thumbnailText: SHORT }))).toContain('ZERO TEXT');
    const section = policyLine(buildContextualImagePrompt({ ...base, isThumbnail: false, thumbnailText: SHORT }));
    expect(section).not.toContain(SHORT);
    expect(section).toContain('Render only explicitly requested title text');
  });
});

describe('legacy nano templates draw the short phrase; the title stays the topic', () => {
  const item = { heading: TITLE, prompt: TITLE, englishPrompt: 'electric car on a dealer lot', allowText: true } as any;

  it('general thumbnail', () => {
    const prompt = PromptBuilder.build(item, { isThumbnail: true, postTitle: TITLE, categoryStyle: '', provider: 'nano-banana-pro' });
    expect(prompt).toContain(`Render EXACTLY this Korean text ONCE: "${SHORT}"`);
    expect(prompt).not.toContain(`Render EXACTLY this Korean text ONCE: "${TITLE}"`);
    expect(prompt).toContain(`thumbnail about: "${TITLE}"`);
  });

  it('shopping connect thumbnail', () => {
    const prompt = PromptBuilder.build(item, {
      isThumbnail: true, postTitle: TITLE, categoryStyle: 'clean', provider: 'nano-banana-pro', isShoppingConnect: true, hasCollectedImages: true,
    });
    expect(prompt).toContain(`Only "${SHORT}" may appear as text.`);
    expect(prompt).not.toContain(`"${TITLE}"`);
  });
});

describe('wiring', () => {
  it('imageGenerator names the phrase only for engines that draw Korean themselves, in the brief and on the item', () => {
    const src = readFileSync(join(__dirname, '..', 'imageGenerator.ts'), 'utf-8');
    // Other engines get a text-free image — the app overlays the short phrase on them once.
    expect(src).toMatch(/const thumbnailText = item\.isThumbnail === true && allowText && isKoreanTextSupportedEngine\(normalizedProvider\)\s*\?\s*\(item\.thumbnailText \|\| resolveThumbnailOverlayText\(/);
    expect(src).toMatch(/\.\.\.\(thumbnailText \? \{ thumbnailText \} : \{\}\),/);
  });

  it('[2026-09-23 사장님] 나노바나나2·프로, Flow, GPT 이미지, 리더스 나노바나나 draw Korean themselves; nano-banana 2.5 does not', () => {
    for (const engine of ['nano-banana-2', 'nano-banana-pro', 'flow', 'openai-image', 'dropshot']) expect(drawsKoreanTextItself(engine)).toBe(true);
    for (const engine of ['nano-banana', 'leonardoai', 'deepinfra', 'prodia', 'imagefx']) expect(drawsKoreanTextItself(engine)).toBe(false);
  });

  it('GPT Image renders the short phrase on a thumbnail instead of forcing "no text"', () => {
    const src = readFileSync(join(__dirname, '..', 'image/openaiImageGenerator.ts'), 'utf-8');
    expect(src).toMatch(/const wantsThumbnailText = \(item as any\)\.isThumbnail === true && \(item as any\)\.allowText === true && thumbnailPhrase !== '';/);
    expect(src).toMatch(/const koreanTextToRender = wantsThumbnailText \? thumbnailPhrase : String\(item\.heading \|\| ''\)\.trim\(\);/);
  });

  it('no app overlay on a text-drawing engine; the thumbnail is marked "text in image"', async () => {
    const images = [{ heading: '표지', filePath: 'C:/none.png', previewDataUrl: 'data:a', provider: 'openai-image' } as GeneratedImage];
    const out = await applyKoreanTextOverlayIfNeeded(images, 'openai-image', TITLE, true, [{ heading: '표지', isThumbnail: true, allowText: true } as any]);
    expect(out[0]).toMatchObject({ filePath: 'C:/none.png', textRendered: true, disableTextOverlay: true });
    const marked = markEngineDrawnThumbnailText(images, 'dropshot', [{ heading: '표지', isThumbnail: true, allowText: true }]);
    expect(marked[0].textRendered).toBe(true);
    expect(markEngineDrawnThumbnailText(images, 'nano-banana', [{ heading: '표지', isThumbnail: true, allowText: true }])[0].textRendered).toBeUndefined();
  });

  it('the director passes its decided phrase to an engine that draws text', async () => {
    const generate = vi.fn(async () => [{ heading: 'x', filePath: 'C:/none/cover.png', previewDataUrl: 'data:a', provider: 'nano-banana-pro' } as GeneratedImage]);
    await generateImagesWithThumbnailDirector(
      { provider: 'nano-banana-pro', postTitle: TITLE, thumbnailTextInclude: true, thumbnailDirector: {}, items: [{ heading: '🖼️ 썸네일', prompt: 'x', allowText: true }] } as GenerateImagesOptions,
      {}, undefined, { config: {}, generate, applyTitleOverlay: vi.fn(async (i: GeneratedImage[]) => i) },
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect((generate.mock.calls[0] as any[])[0].items[0].thumbnailText).toBe(SHORT);
  });
});
