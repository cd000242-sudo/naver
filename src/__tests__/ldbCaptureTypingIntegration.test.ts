// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { materializeLdbImages } from '../main/ldb-images.js';
import { prepareLdbDrafts } from '../renderer/modules/ldbDraftImport.js';
import { ImageManager } from '../renderer/modules/imageManagerCore.js';
import { hydrateImageManagerFromImages, syncGlobalImagesFromImageManager, filterImagesForPublish } from '../renderer/modules/imageSyncService.js';
import { displayGeneratedImages } from '../renderer/modules/imageDisplayGrid.js';
import { collectFormData } from '../renderer/modules/formAndAutomation.js';
import { getStableImageKey, deriveImageSourceCaption, IMAGE_CAPTION_MAX_LENGTH } from '../renderer/utils/imageHelpers.js';
import { toFileUrlMaybe } from '../renderer/utils/headingKeyUtils.js';
import { escapeHtml } from '../renderer/utils/htmlUtils.js';

const roots: string[] = [];
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
beforeEach(() => {
  document.body.innerHTML = '<div id="generated-images-grid"></div><div id="prompts-container"></div><input id="naver-id" value="test-blog"><input id="post-title"><textarea id="post-content"></textarea>';
  Object.assign(globalThis, { ImageManager, generatedImages: [], currentStructuredContent: null, currentPostId: null,
    appendLog: vi.fn(), toastManager: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
    syncGlobalImagesFromImageManager, displayGeneratedImages, filterImagesForPublish,
    getStableImageKey, deriveImageSourceCaption, IMAGE_CAPTION_MAX_LENGTH, toFileUrlMaybe, escapeHtml,
    normalizeHeadingKeyForVideoCache: (value: string) => String(value || '').replace(/\s+/gu, '').toLowerCase(),
    getHeadingVideoPreviewFromCache: () => null, updatePromptItemsWithImages: vi.fn(),
    UnifiedDOMCache: { getGenerator: () => 'agent-codex', getRealCategory: () => '', getRealCategoryName: () => '' },
    readUnifiedCtasFromUi: () => [], resolveAffiliateLink: () => undefined, normalizeReadableBodyText: (value: string) => value,
    getUrlsAsString: () => '', loadGeneratedPosts: () => [], unifiedPublishModeInput: null, scheduleDateInput: null });
  vi.spyOn(ImageManager, 'syncAllPreviews').mockImplementation(() => {});
  vi.spyOn(ImageManager, 'updateHeadingAnalysisPreview').mockImplementation(() => {});
  ImageManager.clearAll(); localStorage.clear();
});
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); document.body.innerHTML = ''; });
async function fixture(realSource?: string) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ldb-capture-typing-')); roots.push(directory);
  const headings = ['첫 장면', '두 번째 장면', '세 번째 장면', '마지막 장면'].map(title => ({ title, content: '장면 설명입니다.' }));
  const bytes: Buffer[] = [];
  for (let index = 0; index < 5; index += 1) bytes.push(index === 0 && realSource ? await readFile(realSource)
    : await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 25 * index, g: 100, b: 150 } } }).png().toBuffer());
  const formats = await Promise.all(bytes.map(async raw => (await sharp(raw).metadata()).format));
  const post = { id: 'ldb_capture', title: '자료 장면 정리', content: '도입부\n\n' + headings.map(h => `${h.title}\n${h.content}`).join('\n\n'), headings,
    publishMode: 'draft', images: bytes.map((raw, index) => ({ heading: index === 0 ? '썸네일' : headings[index - 1].title, isThumbnail: index === 0,
      filePath: `data:image/${formats[index]};base64,${raw.toString('base64')}`, provider: 'collected', isCollected: true,
      caption: index === 0 && realSource ? 'OpenAI Codex CLI 공식 문서 QA 캡처 · 게시용 자료 아님' : `테스트 장면 ${index} · QA 래스터`,
      sourceUrl: index === 0 && realSource ? 'https://learn.chatgpt.com/docs/codex/cli' : `https://www.imbc.com/video/${index}`, disableTextOverlay: true,
      officialVerified: true, rightsReview: { approved: true } })) };
  return { directory, post, bytes };
}
function display(post: any) {
  (globalThis as any).currentStructuredContent = post.structuredContent;
  (globalThis as any).currentPostId = post.id;
  (window as any).currentStructuredContent = post.structuredContent;
  hydrateImageManagerFromImages(post.structuredContent, post.images);
  displayGeneratedImages((window as any).imageManagementGeneratedImages);
}
async function verifyPipeline(realSource?: string) {
  const f = await fixture(realSource);
  const materialized = await materializeLdbImages([f.post], f.directory) as any[];
  const prepared = prepareLdbDrafts(materialized); const draft = prepared.drafts[0];
  for (const [index, image] of draft.images.entries()) {
    expect(image).toMatchObject({ caption: f.post.images[index].caption, sourceUrl: f.post.images[index].sourceUrl,
      provider: 'collected', isCollected: true, disableTextOverlay: true, sha256: digest(f.bytes[index]), _ldbPostId: draft.id });
    expect(image).not.toHaveProperty('officialVerified'); expect(image).not.toHaveProperty('rightsReview');
    expect(digest(await readFile(image.filePath))).toBe(digest(f.bytes[index]));
  }
  display(draft);
  expect(ImageManager.getAllImages()).toHaveLength(5);
  expect(document.querySelectorAll('#generated-images-grid img')).toHaveLength(5);
  expect(document.querySelector<HTMLImageElement>('#generated-images-grid img')!.style.objectFit).toBe('contain');
  expect([...document.querySelectorAll<HTMLInputElement>('.image-source-caption-input')].map(el => el.value)).toEqual(expect.arrayContaining(f.post.images.map(image => image.caption)));
  const storedFile = path.join(f.directory, 'saved-posts.json'); await writeFile(storedFile, JSON.stringify(prepared.posts));
  const [reloaded] = JSON.parse(await readFile(storedFile, 'utf8'));
  expect(reloaded.images[0]).not.toHaveProperty('previewDataUrl'); display(reloaded);
  expect(document.querySelector<HTMLImageElement>('#generated-images-grid img')!.src).toMatch(/^file:/u);
  const filtered = filterImagesForPublish(reloaded.structuredContent, (window as any).imageManagementGeneratedImages);
  expect(filtered).toHaveLength(5); expect(filtered.map(image => image.originalIndex)).toEqual([0, 1, 2, 3, 4]);
  const payload = collectFormData();
  expect(payload.generatedImages).toHaveLength(5);
  for (const [index, image] of payload.generatedImages.entries()) {
    expect(image).toMatchObject({ filePath: reloaded.images[index].filePath, sourceUrl: f.post.images[index].sourceUrl,
      caption: f.post.images[index].caption, isCollected: true, disableTextOverlay: true, sha256: digest(f.bytes[index]) });
    expect(digest(await readFile(image.filePath))).toBe(digest(f.bytes[index]));
  }
  return { ...f, draft, materialized };
}
describe('actual raster → app image manager → typing payload', () => {
  it('preserves five distinct files, attribution and exact slots through real UI functions and persistence', async () => { await verifyPipeline(); });
  it.runIf(Boolean(process.env.LDB_CAPTURE_FIXTURE))('preserves actual official browser-capture PNG bytes through the same app path', async () => { await verifyPipeline(process.env.LDB_CAPTURE_FIXTURE); });
  it('does not merge preceding-article assets on hydration or prefer their matching heading names when typing', async () => {
    const f = await fixture(); const first = prepareLdbDrafts(await materializeLdbImages([f.post], f.directory)).drafts[0];
    display(first); const stale = ImageManager.getAllImages().map((image: any) => ({ ...image, _ldbPostId: 'ldb_previous' }));
    (window as any).imageManagementGeneratedImages = stale;
    hydrateImageManagerFromImages(first.structuredContent, first.images);
    expect((window as any).imageManagementGeneratedImages).toHaveLength(5);
    expect((window as any).imageManagementGeneratedImages.every((image: any) => image._ldbPostId === first.id)).toBe(true);
    for (const [key, values] of ImageManager.imageMap) ImageManager.imageMap.set(key, values.map((image: any) => ({ ...image, _ldbPostId: 'ldb_previous' })));
    const filtered = filterImagesForPublish(first.structuredContent, first.images);
    expect(filtered).toHaveLength(5); expect(filtered.every(image => image._ldbPostId === first.id)).toBe(true);
  });
  it.each(['caption', 'sourceUrl'])('rejects unsafe attribution metadata before disk or renderer import: %s', async key => {
    const f = await fixture(); (f.post.images[0] as any)[key] = key === 'caption' ? 'x'.repeat(201) : 'javascript:alert(1)';
    await expect(materializeLdbImages([f.post], f.directory)).rejects.toThrow();
    expect(() => prepareLdbDrafts([f.post])).toThrow();
  });
  it('rejects duplicate captured content and mismatched heading placement instead of filling a different slot', async () => {
    const f = await fixture(); f.post.images[1].filePath = f.post.images[0].filePath;
    const materialized = await materializeLdbImages([f.post], f.directory);
    expect(() => prepareLdbDrafts(materialized)).toThrow(/중복/u);
    const other = await fixture(); other.post.images[2].heading = '없는 소제목';
    expect(() => prepareLdbDrafts([other.post])).toThrow(/소제목/u);
  });
  it('uses a real local string path for savedToLocal and never treats the boolean true as an upload location', async () => {
    const f = await fixture(); const draft = prepareLdbDrafts(await materializeLdbImages([f.post], f.directory)).drafts[0];
    display(draft); const images = filterImagesForPublish(draft.structuredContent, draft.images);
    expect(images.every(image => image.savedToLocal === image.filePath && typeof image.savedToLocal === 'string')).toBe(true);
  });
  it('rejects conflicting AI provenance rather than relabeling a generated image as collected', async () => {
    const f = await fixture(); f.post.images[0].provider = 'openai-image';
    await expect(materializeLdbImages([f.post], f.directory)).rejects.toThrow(/출처/u);
    expect(() => prepareLdbDrafts([f.post])).toThrow(/출처/u);
  });
  it.each(['caption-control', 'source-credentials', 'source-control', 'missing-source', 'bad-hash', 'bad-dimensions'])('validates attribution and file metadata: %s', async failure => {
    const f = await fixture(); const image: any = f.post.images[0];
    if (failure === 'caption-control') image.caption = '장면\n설명';
    if (failure === 'source-credentials') image.sourceUrl = 'https://secret:pass@www.imbc.com/a';
    if (failure === 'source-control') image.sourceUrl = 'https://www.imbc.com/a\nb';
    if (failure === 'missing-source') delete image.sourceUrl;
    if (failure === 'bad-hash') image.sha256 = 'wrong';
    if (failure === 'bad-dimensions') image.width = -1;
    if (!['bad-hash', 'bad-dimensions'].includes(failure)) await expect(materializeLdbImages([f.post], f.directory)).rejects.toThrow();
    expect(() => prepareLdbDrafts([f.post])).toThrow();
  });
  it('does not accept a complete raster signature when pixels are corrupt or the declared MIME is false', async () => {
    const f = await fixture();
    f.post.images[0].filePath = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 224]).toString('base64');
    await expect(materializeLdbImages([f.post], f.directory)).rejects.toThrow(/이미지/u);
    const jpeg = await sharp(f.bytes[0]).jpeg().toBuffer();
    f.post.images[0].filePath = `data:image/png;base64,${jpeg.toString('base64')}`;
    await expect(materializeLdbImages([f.post], f.directory)).rejects.toThrow(/형식/u);
  });
});
