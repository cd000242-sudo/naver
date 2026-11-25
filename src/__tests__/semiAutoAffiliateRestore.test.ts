/**
 * Semi-auto publish must not silently drop a shopping-connect article's link and mode
 * after an app restart (the input fields are empty then), and the shopping AI image run
 * must register its representative collected photo in the image management tab early.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { stampGenerationMode } from '../content/generationModeStamp.js';

type Resolver = (input: {
  typedAffiliateLink?: string;
  sourceUrl?: string;
  uiContentMode?: string;
  structuredContent?: unknown;
  savedPost?: { affiliateLink?: string; contentMode?: string } | null;
}) => {
  affiliateLink?: string;
  contentMode: string;
  source: 'input' | 'post' | 'none';
  blocked: boolean;
  plainContentMode: string;
};

let resolveSemiAutoAffiliatePublish: Resolver;

beforeAll(async () => {
  vi.stubGlobal('window', {});
  const mod: any = await import('../renderer/utils/shoppingConnectUtils.js');
  resolveSemiAutoAffiliatePublish = mod.resolveSemiAutoAffiliatePublish;
});

const LINK = 'https://naver.me/abc123';

function affiliateArticle(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const content: Record<string, unknown> = { selectedTitle: '상품 글', ...extra };
  stampGenerationMode(content, 'affiliate');
  return content;
}

describe('resolveSemiAutoAffiliatePublish', () => {
  it('typed link wins over the link stored on the article', () => {
    const r = resolveSemiAutoAffiliatePublish({
      typedAffiliateLink: 'https://naver.me/typed',
      structuredContent: affiliateArticle({ affiliateLink: LINK }),
      uiContentMode: 'seo',
    });
    expect(r).toMatchObject({ affiliateLink: 'https://naver.me/typed', contentMode: 'affiliate', source: 'input', blocked: false });
  });

  it('affiliate URL in the source URL field still counts as input', () => {
    const r = resolveSemiAutoAffiliatePublish({ sourceUrl: 'https://link.coupang.com/a/xyz', uiContentMode: 'seo' });
    expect(r).toMatchObject({ affiliateLink: 'https://link.coupang.com/a/xyz', contentMode: 'affiliate', source: 'input' });
  });

  it('empty inputs fall back to the link stored on the article content', () => {
    const r = resolveSemiAutoAffiliatePublish({
      typedAffiliateLink: '',
      sourceUrl: '',
      uiContentMode: 'seo',
      structuredContent: affiliateArticle({ affiliateLink: `  ${LINK}  ` }),
    });
    expect(r).toMatchObject({ affiliateLink: LINK, contentMode: 'affiliate', source: 'post', blocked: false });
  });

  it('empty inputs fall back to the saved post record link (post list entry)', () => {
    const r = resolveSemiAutoAffiliatePublish({
      uiContentMode: 'seo',
      structuredContent: { selectedTitle: 'x' },
      savedPost: { affiliateLink: LINK, contentMode: 'affiliate' },
    });
    expect(r).toMatchObject({ affiliateLink: LINK, contentMode: 'affiliate', source: 'post', blocked: false });
  });

  it('article generated in shopping-connect mode without any link is blocked, not silently SEO', () => {
    const r = resolveSemiAutoAffiliatePublish({ uiContentMode: 'seo', structuredContent: affiliateArticle() });
    expect(r.blocked).toBe(true);
    expect(r.affiliateLink).toBeUndefined();
    expect(r.plainContentMode).toBe('seo');
  });

  it('saved post contentMode=affiliate without link is blocked too', () => {
    const r = resolveSemiAutoAffiliatePublish({
      uiContentMode: '',
      structuredContent: {},
      savedPost: { contentMode: 'affiliate' },
    });
    expect(r.blocked).toBe(true);
  });

  it('plain fallback never stays affiliate even when the UI selector says affiliate', () => {
    const r = resolveSemiAutoAffiliatePublish({ uiContentMode: 'affiliate', structuredContent: affiliateArticle() });
    expect(r.blocked).toBe(true);
    expect(r.plainContentMode).toBe('seo');
  });

  it('non-shopping article keeps the UI mode exactly as before', () => {
    const content: Record<string, unknown> = {};
    stampGenerationMode(content, 'homefeed');
    const r = resolveSemiAutoAffiliatePublish({ uiContentMode: 'homefeed', structuredContent: content });
    expect(r).toMatchObject({ affiliateLink: undefined, contentMode: 'homefeed', source: 'none', blocked: false });
    expect(resolveSemiAutoAffiliatePublish({ uiContentMode: '' })).toMatchObject({ contentMode: 'seo', blocked: false });
  });
});

describe('handleSemiAutoPublish wiring (source)', () => {
  const source = readFileSync(join(process.cwd(), 'src/renderer/modules/publishingHandlers.ts'), 'utf8');
  const semiAuto = source.slice(source.indexOf('export async function handleSemiAutoPublish'));

  it('uses the article-aware resolver instead of reading only the input fields', () => {
    expect(semiAuto).toContain('resolveSemiAutoAffiliatePublish(');
    expect(semiAuto).toContain('글에 저장된 제휴 링크로 발행합니다');
  });

  it('blocks with an explicit confirm and fails closed for auto draft', () => {
    const blockAt = semiAuto.indexOf('.blocked');
    expect(blockAt).toBeGreaterThan(0);
    const blockRegion = semiAuto.slice(blockAt, blockAt + 1500);
    expect(blockRegion).toContain('options.ldbAutoDraft');
    expect(blockRegion).toContain('window.confirm(');
    expect(blockRegion).toContain('링크 없이 일반 글로 발행');
  });
});

describe('shopping AI mode registers the representative photo in the image tab', () => {
  const source = readFileSync(join(process.cwd(), 'src/renderer/modules/publishingHandlers.ts'), 'utf8');

  it('registers the representative thumbnail before heading AI generation starts', () => {
    const repAt = source.indexOf('generatedImgs[0] = createShoppingRepresentativeThumbnail(');
    const aiAt = source.indexOf('const aiImgs = await generateImagesForAutomationSafely(', repAt);
    const registerAt = source.indexOf('registerShoppingRepresentativeInImageTab(', repAt);
    expect(repAt).toBeGreaterThan(0);
    expect(registerAt).toBeGreaterThan(repAt);
    expect(registerAt).toBeLessThan(aiAt);
  });

  it('registers exactly one image flagged as thumbnail into ImageManager and persists it', () => {
    const fnAt = source.indexOf('function registerShoppingRepresentativeInImageTab(');
    expect(fnAt).toBeGreaterThan(0);
    const body = source.slice(fnAt, fnAt + 1800);
    expect(body).toContain('isThumbnail: true');
    expect(body).toContain('ImageManager.addImage(');
    expect(body).toContain('imageManagementGeneratedImages = [');
    expect(body).toContain('saveGeneratedPost(');
  });
});
