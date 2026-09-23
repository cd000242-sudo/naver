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

  it('no phrase, no text allowed, or a section image → the previous policies are unchanged', () => {
    expect(policyLine(buildContextualImagePrompt(base))).toContain('Render only explicitly requested title text');
    expect(policyLine(buildContextualImagePrompt({ ...base, allowText: false, thumbnailText: SHORT }))).toContain('ZERO TEXT');
    expect(policyLine(buildContextualImagePrompt({ ...base, isThumbnail: false, thumbnailText: SHORT }))).not.toContain(SHORT);
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
  it('imageGenerator names the phrase only for engines that draw Korean themselves', () => {
    const src = readFileSync(join(__dirname, '..', 'imageGenerator.ts'), 'utf-8');
    // Other engines keep the previous policy — the app overlays the short phrase on them, so asking the
    // model to draw it too would print the text twice.
    expect(src).toMatch(/thumbnailText: item\.isThumbnail === true && allowText && isKoreanTextSupportedEngine\(normalizedProvider\)\s*\?\s*\(item\.thumbnailText \|\| resolveThumbnailOverlayText\(/);
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
