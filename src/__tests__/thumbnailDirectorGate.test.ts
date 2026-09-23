// SPEC-NAVER-IMAGE-2026 — main entry for the thumbnail director. Runs the real compositor on generated
// sample images; no judge route in standard mode, so nothing touches the network.
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GenerateImagesOptions, GeneratedImage } from '../image/types';
import {
  generateImagesWithThumbnailDirector,
  resolveThumbnailDirectorTarget,
  resolveThumbnailQualityMode,
  toDirectorImage,
} from '../image/director/thumbnailDirectorGate';

let dir = '';
let aiFile = '';
let userPhoto = '';

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-gate-'));
  aiFile = path.join(dir, 'base.png');
  userPhoto = path.join(dir, 'user.jpg');
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#557799' } }).png().toFile(aiFile);
  await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#997755' } }).jpeg().toFile(userPhoto);
});
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

// `thumbnailDirector: {}` is the renderer's opt-in for an article thumbnail.
const thumbOptions = (overrides: Partial<GenerateImagesOptions> = {}): GenerateImagesOptions => ({
  provider: 'openai-image',
  items: [{ heading: '🖼️ 썸네일', prompt: 'x' }],
  postTitle: '청년월세 20만원 받는 법',
  thumbnailDirector: {},
  ...overrides,
});
const aiResult = () => [{ heading: 'x', filePath: aiFile, previewDataUrl: 'data:a', provider: 'openai-image' } as GeneratedImage];

describe('resolveThumbnailDirectorTarget / quality mode', () => {
  it('only a lone thumbnail item on a generative engine', () => {
    expect(resolveThumbnailDirectorTarget(thumbOptions())).not.toBeNull();
    expect(resolveThumbnailDirectorTarget(thumbOptions({ items: [{ heading: '제목', prompt: 'x', isThumbnail: true }] }))).not.toBeNull();
    expect(resolveThumbnailDirectorTarget(thumbOptions({ items: [{ heading: '신청 방법', prompt: 'x' }] }))).toBeNull();
    expect(resolveThumbnailDirectorTarget(thumbOptions({ items: [{ heading: '🖼️ 썸네일', prompt: 'x' }, { heading: 'a', prompt: 'x' }] }))).toBeNull();
    expect(resolveThumbnailDirectorTarget(thumbOptions({ isShoppingConnect: true }))).toBeNull();
    expect(resolveThumbnailDirectorTarget(thumbOptions({ provider: 'naver' as any }))).toBeNull();
    expect(resolveThumbnailDirectorTarget(thumbOptions(), { thumbnailDirectorEnabled: false })).toBeNull();
  });

  it('no opt-in, no director — the manual thumbnail tools and the image studio send their own prompts', () => {
    expect(resolveThumbnailDirectorTarget(thumbOptions({ thumbnailDirector: undefined }))).toBeNull();
    expect(resolveThumbnailDirectorTarget(thumbOptions({
      thumbnailDirector: undefined, provider: 'nano-banana-pro',
      items: [{ heading: 'thumbnail-bg', prompt: 'High quality background image: soft gradient', isThumbnail: true }],
    }))).toBeNull();
  });

  it('high only when the user turned it on', () => {
    expect(resolveThumbnailQualityMode(undefined)).toBe('standard');
    expect(resolveThumbnailQualityMode({ thumbnailQualityMode: 'standard' })).toBe('standard');
    expect(resolveThumbnailQualityMode({ thumbnailQualityMode: 'high' })).toBe('high');
  });
});

describe('toDirectorImage', () => {
  const base: GeneratedImage = { heading: '청년월세', filePath: 'C:/b.png', previewDataUrl: 'data:b', provider: 'openai-image', blobId: 'blob', isThumbnail: true };
  const item = { heading: '🖼️ 썸네일', prompt: 'x' };
  const common = { candidates: [], verdict: null, direction: 'numeric' as const, text: { include: false, text: null, reason: '' } };

  it('plain AI winner keeps the base image, restores the slot heading and thumbnail flag', () => {
    const image = toDirectorImage({ ...common, base, winner: { kind: 'ai-full', filePath: 'C:/b.png', label: '', bakedText: false, real: false } }, item, 'openai-image');
    expect(image.filePath).toBe('C:/b.png');
    expect(image.heading).toBe('🖼️ 썸네일');
    expect(image.isThumbnail).toBeUndefined();
  });

  it('short-phrase card: new file, no-overlay flag, AI provider kept, stale blob id cleared', () => {
    const image = toDirectorImage({ ...common, base, winner: { kind: 'ai-hook', filePath: 'C:/h.png', label: '', bakedText: true, real: false } }, item, 'openai-image', () => 'data:h');
    expect(image).toMatchObject({ filePath: 'C:/h.png', previewDataUrl: 'data:h', provider: 'openai-image', disableTextOverlay: true });
    expect(image.blobId).toBeUndefined();
  });

  it('real-photo winner is marked collected (never AI-marked)', () => {
    const image = toDirectorImage({ ...common, base: null, winner: { kind: 'real-square', filePath: 'C:/r.png', label: '', bakedText: false, real: true } }, item, 'openai-image', () => 'data:r');
    expect(image).toMatchObject({ provider: 'collected-image', isCollected: true, filePath: 'C:/r.png' });
    expect(image.disableTextOverlay).toBeUndefined();
  });
});

describe('generateImagesWithThumbnailDirector', () => {
  it('passes non-thumbnail calls straight through, untouched', async () => {
    const generate = vi.fn(async () => [] as GeneratedImage[]);
    const onImage = vi.fn();
    const options = thumbOptions({ items: [{ heading: '신청 방법', prompt: 'x' }] });
    await generateImagesWithThumbnailDirector(options, { k: 1 }, onImage, { generate, applyTitleOverlay: vi.fn() });
    expect(generate).toHaveBeenCalledWith(options, { k: 1 }, onImage);
  });

  // Engines that do not draw Korean themselves (leonardo here) keep the app overlay path.
  it('flows without a text mode keep their checkbox; the overlay gets a short phrase, not the title', async () => {
    const generate = vi.fn(async () => aiResult());
    const applyTitleOverlay = vi.fn(async (images: GeneratedImage[]) => images);
    const images = await generateImagesWithThumbnailDirector(
      thumbOptions({ provider: 'leonardoai' as any, thumbnailTextInclude: true, postTitle: '연말정산 미리보기로 13월의 월급 30만원 더 받는 방법' }), {}, undefined,
      { config: {}, generate, applyTitleOverlay },
    );
    const sent = (generate.mock.calls[0] as any[])[0] as GenerateImagesOptions;
    expect(sent.thumbnailTextInclude).toBe(false);
    expect(sent.items[0].isThumbnail).toBe(true);
    expect(images).toHaveLength(1);
    const [, , overlayText, include, items] = applyTitleOverlay.mock.calls[0] as any[];
    expect(include).toBe(true);
    expect(overlayText).toBe('월급 30만원 더');
    // same conditions as generateImages: the item travels along, so allowText:false still skips the overlay
    expect(items).toEqual([{ heading: '🖼️ 썸네일', prompt: 'x' }]);
  });

  it('a background request from the manual thumbnail editor passes through with its own prompt', async () => {
    const generate = vi.fn(async () => aiResult());
    const options = {
      provider: 'nano-banana-pro',
      items: [{ heading: 'thumbnail-bg', prompt: 'High quality background image: soft gradient. No typography.', isThumbnail: true }],
      styleHint: 'background',
      postTitle: '청년월세 20만원 받는 법',
    } as GenerateImagesOptions;
    await generateImagesWithThumbnailDirector(options, {}, undefined, { config: {}, generate, applyTitleOverlay: vi.fn() });
    expect(generate).toHaveBeenCalledWith(options, {}, undefined);
  });

  it("the user's own prompt (regeneration / saved manual prompt) is kept, never swapped for the title", async () => {
    const generate = vi.fn(async () => aiResult());
    await generateImagesWithThumbnailDirector(
      thumbOptions({
        thumbnailDirector: { keepPrompt: true },
        items: [{ heading: '🖼️ 썸네일', prompt: '내가 쓴 썸네일 프롬프트', englishPrompt: 'my own cover prompt' }],
      }), {}, undefined,
      { config: {}, generate, applyTitleOverlay: vi.fn(async (i: GeneratedImage[]) => i) },
    );
    const cover = (generate.mock.calls[0] as any[])[0].items[0];
    expect(cover.prompt).toBe('내가 쓴 썸네일 프롬프트');
    expect(cover.englishPrompt).toBe('my own cover prompt');
    expect(cover.heading).toBe('청년월세 20만원 받는 법'); // the brief's section heading is still the title
  });

  it('image tab slot, AUTO: one AI call, short phrase baked in, no-overlay flag set', async () => {
    const generate = vi.fn(async () => aiResult());
    const applyTitleOverlay = vi.fn(async (images: GeneratedImage[]) => images);
    const images = await generateImagesWithThumbnailDirector(
      thumbOptions({ provider: 'leonardoai' as any, thumbnailDirector: { allowBakedText: true, textMode: 'auto', realImages: [] } }), {}, undefined,
      { config: {}, generate, applyTitleOverlay },
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(images[0].disableTextOverlay).toBe(true);
    expect(applyTitleOverlay).not.toHaveBeenCalled();
    expect(fs.existsSync(images[0].filePath)).toBe(true);
    expect((await sharp(images[0].filePath).metadata()).width).toBe(800);
  });

  it('user photo placed in the post: no AI call; composite marked as a real photo', async () => {
    const generate = vi.fn(async () => aiResult());
    const images = await generateImagesWithThumbnailDirector(
      thumbOptions({ thumbnailDirector: { allowBakedText: true, textMode: 'exclude', realImages: [{ filePath: userPhoto, provider: 'local' }] } }), {}, undefined,
      { config: {}, generate, applyTitleOverlay: vi.fn(async (i: GeneratedImage[]) => i) },
    );
    expect(generate).not.toHaveBeenCalled();
    expect(images[0]).toMatchObject({ provider: 'collected-image', isCollected: true });
  });

  it('real-photo topic without a usable photo: honest cover plus a one-line notice', async () => {
    const images = await generateImagesWithThumbnailDirector(
      thumbOptions({ postTitle: '셀토스 두 트림 가격 차이', collectedImages: ['https://news.example/car.jpg'] as any }), {}, undefined,
      { config: {}, generate: vi.fn(async () => aiResult()), applyTitleOverlay: vi.fn(async (i: GeneratedImage[]) => i) },
    );
    expect(images[0].directorNotice).toContain('실제 사진');
    expect(images[0].directorNotice).toContain('참고용 1장');
  });

  // [2026-09-23 사장님] 나노바나나·GPT 이미지는 한글을 직접 그린다 — 앱 카드·오버레이 없음.
  it.each(['openai-image', 'nano-banana-2', 'nano-banana-pro', 'dropshot', 'flow'])(
    '%s draws the short phrase itself: no app card, no app overlay, marked "text in image"', async (provider) => {
      const generate = vi.fn(async () => aiResult());
      const applyTitleOverlay = vi.fn(async (images: GeneratedImage[]) => images);
      const images = await generateImagesWithThumbnailDirector(
        thumbOptions({ provider: provider as any, thumbnailDirector: { allowBakedText: true, textMode: 'auto', realImages: [] } }), {}, undefined,
        { config: {}, generate, applyTitleOverlay },
      );
      const cover = (generate.mock.calls[0] as any[])[0].items[0];
      expect(cover).toMatchObject({ allowText: true, thumbnailText: '청년월세 20만원 받는 법' });
      expect(applyTitleOverlay).not.toHaveBeenCalled();
      expect(images[0].filePath).toBe(aiFile); // the engine's own image, not an app-made card
      expect(images[0]).toMatchObject({ textRendered: true, disableTextOverlay: true });
    },
  );

  it('the old nano-banana (2.5, "한글 텍스트 깨짐") still gets a text-free image and the app card', async () => {
    const generate = vi.fn(async () => aiResult());
    const images = await generateImagesWithThumbnailDirector(
      thumbOptions({ provider: 'nano-banana' as any, thumbnailDirector: { allowBakedText: true, textMode: 'auto', realImages: [] } }), {}, undefined,
      { config: {}, generate, applyTitleOverlay: vi.fn(async (i: GeneratedImage[]) => i) },
    );
    expect((generate.mock.calls[0] as any[])[0].items[0].thumbnailText).toBeUndefined();
    expect(images[0].filePath).not.toBe(aiFile);
    expect(images[0].disableTextOverlay).toBe(true);
  });

  it('a text-drawing engine with no copy decided gets a text-free brief (allowText off)', async () => {
    const generate = vi.fn(async () => aiResult());
    await generateImagesWithThumbnailDirector(
      thumbOptions({ provider: 'openai-image' as any, items: [{ heading: '🖼️ 썸네일', prompt: 'x', allowText: true }], thumbnailDirector: { textMode: 'exclude' } }),
      {}, undefined, { config: {}, generate, applyTitleOverlay: vi.fn(async (i: GeneratedImage[]) => i) },
    );
    expect((generate.mock.calls[0] as any[])[0].items[0]).toMatchObject({ allowText: false, thumbnailText: undefined });
  });

  it('a failed AI generation returns an empty list, as before', async () => {
    const images = await generateImagesWithThumbnailDirector(thumbOptions(), {}, undefined, { config: {}, generate: vi.fn(async () => [] as GeneratedImage[]), applyTitleOverlay: vi.fn() });
    expect(images).toEqual([]);
  });
});
