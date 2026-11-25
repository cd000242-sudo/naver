// [2026-11-25 owner decision (가)] Shopping-connect thumbnail: keep the collected product photo and,
//   only when the "thumbnail copy" setting is ON, draw the copy on top of it once at publish time.
//   Setting OFF → original photo. Overlay failure → original photo + logged reason. Body images untouched.
import { readFileSync } from 'fs';
import { describe, expect, it, vi } from 'vitest';
import { publishOverlayDecision, withTextInImage } from '../image/director/thumbnailTextState';
import { createShoppingRepresentativeThumbnail } from '../image/shoppingReferenceGeneration';

vi.mock('electron', () => ({ app: { getPath: () => '.', isPackaged: false } }));
vi.mock('puppeteer-extra', () => ({ default: { use: () => undefined, launch: vi.fn() } }));
vi.mock('puppeteer-extra-plugin-stealth', () => ({ default: () => ({}) }));

const ON = { includeThumbnailText: true, shoppingConnect: true };
const OFF = { includeThumbnailText: false, shoppingConnect: true };
const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('publish decision for shopping thumbnails', () => {
  const representative = createShoppingRepresentativeThumbnail(
    { url: 'https://shop-phinf.pstatic.net/a.jpg' },
    '와이퍼 후기',
  );
  // BlogExecutor.processImages keeps only provider/isThumbnail — the text flags never reach the editor.
  const afterMainWhitelist = { provider: 'collected-image', isThumbnail: true, filePath: 'https://x/a.jpg' };

  it('setting ON → the representative product photo gets the copy once', () => {
    expect(publishOverlayDecision(representative, ON).apply).toBe(true);
    expect(publishOverlayDecision(afterMainWhitelist, ON).apply).toBe(true);
    expect(publishOverlayDecision({ provider: 'collected', isThumbnail: true }, ON).apply).toBe(true);
    expect(publishOverlayDecision({ provider: 'shopping' }, ON).apply).toBe(true);
  });

  it('setting OFF → original photo, same reason as before', () => {
    expect(publishOverlayDecision(representative, OFF)).toEqual({ apply: false, reason: '썸네일 문구 설정 꺼짐' });
    expect(publishOverlayDecision(afterMainWhitelist, OFF).apply).toBe(false);
  });

  it('never a second copy and never over a non-product image', () => {
    expect(publishOverlayDecision(withTextInImage(afterMainWhitelist), ON).apply).toBe(false);
    expect(publishOverlayDecision({ provider: 'collected-overlay' }, ON).apply).toBe(false);
    expect(publishOverlayDecision({ provider: 'collected-image-with-text' }, ON).apply).toBe(false);
    expect(publishOverlayDecision({ provider: 'openai-image' }, ON).apply).toBe(false);
    expect(publishOverlayDecision({}, ON).apply).toBe(false);
    expect(publishOverlayDecision(undefined, ON).apply).toBe(false);
  });

  it('non-shopping rules are unchanged (preserved original / unknown state stay untouched)', () => {
    const normal = { includeThumbnailText: true, shoppingConnect: false };
    expect(publishOverlayDecision(representative, normal).apply).toBe(false);
    expect(publishOverlayDecision(afterMainWhitelist, normal).apply).toBe(false);
  });
});

describe('main process carries the setting to the editor', () => {
  it('BlogExecutor forwards includeThumbnailText into runOptions (it was dropped)', () => {
    expect(src('../main/services/BlogExecutor.ts'))
      .toMatch(/const runOptions = \{[\s\S]*?includeThumbnailText: \(payload as any\)\.includeThumbnailText === true,[\s\S]*?\};/);
  });

  it('only the first intro image is decided — body images never get the copy', () => {
    const editor = src('../automation/editorHelpers.ts');
    expect(editor).toMatch(/publishOverlayDecision\(firstIntroImage, \{/);
    expect(editor).toMatch(/shoppingConnect: isShoppingConnectModeGlobal === true/);
  });

  it('a shopping overlay must load the product photo or fail (no gradient card)', () => {
    const editor = src('../automation/editorHelpers.ts');
    expect(editor).toMatch(/generateThumbnailWithTextOverlay\(\s*imagePath,\s*resolveThumbnailOverlayText\(blogTitle\),\s*undefined,\s*\{ requireSourceImage: isShoppingConnectModeGlobal === true \},?\s*\)/);
  });

  it('overlay failure keeps the original photo inserted and counted as the intro thumbnail', () => {
    const editor = src('../automation/editorHelpers.ts');
    const catchBlock = editor.slice(editor.indexOf('} catch (overlayError) {'), editor.indexOf('} catch (overlayError) {') + 900);
    expect(catchBlock).toMatch(/→ 원본 삽입/);
    expect(catchBlock).toMatch(/insertImagesAtCurrentCursor\(introImages/);
    expect(catchBlock).toMatch(/thumbnailInsertedInIntro = true;/);
  });

  it('generateThumbnailWithTextOverlay with requireSourceImage throws when the photo cannot be read', async () => {
    const { generateThumbnailWithTextOverlay } = await import('../image/tableImageGenerator');
    await expect(generateThumbnailWithTextOverlay('Z:/__missing__/product.jpg', '문구', undefined, { requireSourceImage: true }))
      .rejects.toThrow(/상품 사진/);
  });
});

describe('renderer paths send the same setting for shopping posts', () => {
  const handlers = src('../renderer/modules/publishingHandlers.ts');
  const fullAuto = src('../renderer/modules/fullAutoFlow.ts');
  const multi = src('../renderer/modules/multiAccountManager.ts');
  const continuous = src('../renderer/modules/continuousPublishing.ts');

  it('full-auto: pipeline setting → formData → payload, no shopping gate', () => {
    expect(handlers).toMatch(/const includeThumbnailText = pipelineCfg\.image\.thumbnailTextInclude;/);
    expect(fullAuto).toMatch(/\n\s*includeThumbnailText: formData\.includeThumbnailText \?\? false,\r?\n/);
  });

  it('semi-auto: formData carries the same pipeline setting as full-auto', () => {
    const semi = handlers.slice(handlers.indexOf('const semiPipelineCfg = resolvePipelineConfig'));
    expect(semi).toMatch(/mode: 'semi-auto',[\s\S]*?includeThumbnailText: semiPipelineCfg\.image\.thumbnailTextInclude,[\s\S]*?contentMode: semiAutoContentMode/);
  });

  it('continuous: the run setting goes into every item formData', () => {
    expect(continuous).toMatch(/scheduleType: item\.scheduleType \|\| 'naver-server',\s*includeThumbnailText,/);
  });

  it('multi-account: main gets the same OR the item generation uses', () => {
    expect(multi).toMatch(/includeThumbnailText: queueItem\.includeThumbnailText === true \|\| itemPipelineCfg\.image\.thumbnailTextInclude === true,/);
    expect(multi).not.toMatch(/includeThumbnailText: queueItem\.includeThumbnailText \?\? false,/);
  });

  it('shopping AI subheading images stay text-free (ZERO text rule untouched)', () => {
    expect(continuous).toMatch(/thumbnailTextInclude: isShoppingAiMode \? false : includeThumbnailText,/);
    expect(multi).toMatch(/const includeThumbnailText = isShoppingConnect\s*\? false/);
  });
});
