import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { detectPlatform, extractProductInfo } from '../crawler/shopping/utils/UrlResolver.js';
import { ERROR_PAGE_INDICATORS } from '../crawler/shopping/types.js';

const root = process.cwd();

function readSource(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

describe('shopping-connect policy and crawler hardening', () => {
  it('classifies creator-issued links separately from direct store links', () => {
    const source = readSource('src/renderer/utils/shoppingConnectUtils.ts');

    expect(source).toContain('classifyShoppingConnectLink');
    expect(source).toContain('brandconnect\\.naver\\.com');
    expect(source).toContain('direct-smartstore');
    expect(source).toContain('direct-brandstore');
    expect(source).toContain('needsResolve');
    expect(source).toContain('imageCollectionSupported?: boolean');
    expect(source).toContain("kind: 'coupang-partners'");
    expect(source).toContain('imageCollectionSupported: false');
  });

  it('keeps a clear FTC disclosure on all full-auto paths', () => {
    const ftcPresets = readSource('src/automation/ftcDisclosurePresets.ts');
    const ftcResolver = readSource('src/renderer/utils/ftcResolver.ts');
    const pipelineConfig = readSource('src/renderer/modules/pipelineConfig.ts');
    const fullAutoFlow = readSource('src/renderer/modules/fullAutoFlow.ts');
    const multiAccountManager = readSource('src/renderer/modules/multiAccountManager.ts');

    for (const source of [ftcPresets, pipelineConfig]) {
      expect(source).toContain('쇼핑커넥트/제휴마케팅 활동');
      expect(source).toContain('수수료');
    }
    expect(ftcResolver).toContain('DEFAULT_AFFILIATE_FTC_DISCLOSURE');
    expect(ftcResolver).toContain("from '../../automation/ftcDisclosurePresets.js'");
    expect(fullAutoFlow).toContain('const disclosureCfg = pipelineCfg.disclosure');
    expect(multiAccountManager).toContain('const _disclosureCfg = itemPipelineCfg.disclosure');
  });

  it('extracts structured product metadata and page quality diagnostics', () => {
    const source = readSource('src/crawler/strategies/shoppingStrategy.ts');

    expect(source).toContain('application/ld+json');
    expect(source).toContain('og:title');
    expect(source).toContain('detectProductPageQuality');
    expect(source).toContain('availability');
    expect(source).toContain('canonicalUrl');
  });

  it('returns collection diagnostics from shopping image collection', () => {
    const source = readSource('src/crawler/shopping/index.ts');
    const handler = readSource('src/main/ipc/imageCollectShoppingHandlers.ts');

    expect(source).toContain('buildDiagnostics');
    expect(source).toContain('quality: imageCount === 0');
    expect(handler).toContain('finalImageCount');
    expect(handler).toContain('resolvedUrl');
    expect(handler).toContain('requiresCoupangApi');
    expect(handler).toContain('reviewFallbackWhenGalleryWeak: true');
    expect(handler).toContain('officialGalleryImageCount');
    expect(handler).toContain('AI 유사도 분석 생략');
    expect(readSource('src/crawler/shopping/providers/BrandStoreProvider.ts')).toContain('공식 추가이미지');
    expect(readSource('src/crawler/shopping/providers/SmartStoreProvider.ts')).toContain('공식 추가이미지');
    expect(handler).toContain('쿠팡은 현재 공개 상품 페이지가 Access Denied');
  });

  it('routes brandconnect affiliate URLs as smart-store product URLs', () => {
    const brandConnectUrl = 'https://brandconnect.naver.com/affiliates/960440895958720?channelProductNo=11514694336';
    const directSmartStoreUrl = 'https://smartstore.naver.com/e_samjung/products/11514694336?NaPm=ct%3Dmq2whn5i';

    expect(detectPlatform(brandConnectUrl)).toBe('smart-store');
    expect(extractProductInfo(brandConnectUrl)).toEqual({ productId: '11514694336' });
    expect(extractProductInfo(directSmartStoreUrl)).toEqual({
      productId: '11514694336',
      storeName: 'e_samjung',
    });
    expect(ERROR_PAGE_INDICATORS).not.toContain('brandconnect');
  });

  it('fails fast when Naver returns a service error page during image collection', () => {
    const types = readSource('src/crawler/shopping/types.ts');
    const baseProvider = readSource('src/crawler/shopping/providers/BaseProvider.ts');
    const smartStoreProvider = readSource('src/crawler/shopping/providers/SmartStoreProvider.ts');
    const crawlerBrowser = readSource('src/crawler/crawlerBrowser.ts');

    expect(types).toContain('현재 서비스 접속이 불가합니다');
    expect(types).toContain('동시에 접속하는 이용자 수가 많거나');
    expect(baseProvider).toContain('result.isErrorPage');
    expect(smartStoreProvider).toContain('isErrorPage: true');
    expect(smartStoreProvider).toContain('navigateWithRetry(page, mobileUrl, 0)');
    expect(crawlerBrowser).toContain('maxRetries <= 0');
  });

  it('exhausts SmartStore image fallbacks without accepting wrong products', () => {
    const baseProvider = readSource('src/crawler/shopping/providers/BaseProvider.ts');
    const smartStoreProvider = readSource('src/crawler/shopping/providers/SmartStoreProvider.ts');

    expect(baseProvider).toContain('recoverable error page');
    expect(baseProvider).toContain('bestFailure');
    expect(baseProvider).toContain('executeStrategyWithTimeout');
    expect(baseProvider).toContain('Strategy timed out after');
    expect(baseProvider).toContain('includeDetails: false');
    expect(baseProvider).toContain("img.type === 'review'");
    expect(baseProvider).toContain('isReviewImageUrl');
    expect(baseProvider).toContain('checkout\\.phinf');
    expect(baseProvider).toContain("img.type === 'detail'");
    expect(baseProvider).toContain('detectErrorPage');
    expect(baseProvider).toContain('htmlToVisibleText');
    expect(readSource('src/crawler/shopping/index.ts')).toContain('includeDetails: false');
    expect(smartStoreProvider).toContain('mobileApiDeepStrategy');
    expect(smartStoreProvider).toContain('buildMobileApiCandidates');
    expect(smartStoreProvider).toContain('buildAffiliateCrawlerCandidates');
    expect(smartStoreProvider).toContain('brandconnect.naver.com/affiliates');
    expect(smartStoreProvider).toContain('decodeURIComponent');
    expect(smartStoreProvider).toContain('collectImagesDeep');
    expect(smartStoreProvider).toContain('affiliate-product-crawler');
    expect(smartStoreProvider).toContain('naver-shopping-search-api');
    expect(smartStoreProvider).toContain('Naver Shopping API returned no exact productId match');
    expect(smartStoreProvider).toContain("String(item?.productId || '') === productId");
  });
});
