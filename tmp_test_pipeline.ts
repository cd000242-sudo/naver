/**
 * 독립 테스트 스크립트: 이미지 수집 파이프라인 전체 테스트
 * Electron 없이 직접 크롤러 + 필터 + 분석을 실행합니다.
 * 
 * 실행: npx tsx tmp_test_pipeline.ts
 */

import fs from 'fs/promises';
import path from 'path';

const TEST_URL = 'https://smartstore.naver.com/bfkr/products/11394122187';

// ═══════════════════════════════════════════════════════
// 1단계: URL 기반 필터 (main.ts filterDuplicateAndLowQualityImages 복제)
// ═══════════════════════════════════════════════════════
function filterDuplicateAndLowQualityImages(images: string[]): string[] {
  const seenBaseUrls = new Set<string>();
  const seenFileNames = new Set<string>();
  const seenNormalizedUrls = new Set<string>();
  const filtered: string[] = [];

  for (const img of images) {
    if (!img || typeof img !== 'string') continue;

    const lowerImg = img.toLowerCase();
    const isLowQualityOrNonProduct =
      lowerImg.includes('_thumb') || lowerImg.includes('_small') ||
      lowerImg.includes('_s.') || lowerImg.includes('50x50') ||
      lowerImg.includes('60x60') || lowerImg.includes('80x80') ||
      lowerImg.includes('100x100') || lowerImg.includes('120x120') ||
      lowerImg.includes('150x150') || lowerImg.includes('type=f40') ||
      lowerImg.includes('type=f60') || lowerImg.includes('type=f80') ||
      lowerImg.includes('type=f100') || lowerImg.includes('blur') ||
      lowerImg.includes('placeholder') || lowerImg.includes('loading') ||
      lowerImg.includes('lazy') || lowerImg.includes('/icon/') ||
      lowerImg.includes('/logo/') || lowerImg.includes('/banner/') ||
      lowerImg.includes('/badge/') || lowerImg.includes('_icon') ||
      lowerImg.includes('_logo') || lowerImg.includes('_banner') ||
      lowerImg.includes('_badge') || lowerImg.includes('reviewmania') ||
      lowerImg.includes('powerlink') || lowerImg.includes('brandzone') ||
      lowerImg.includes('navershopping') || lowerImg.includes('affiliate') ||
      lowerImg.includes('ad_') || lowerImg.includes('_ad.') ||
      lowerImg.includes('promo') || lowerImg.includes('coupon') ||
      lowerImg.includes('delivery') || lowerImg.includes('shipping') ||
      lowerImg.includes('npay') || lowerImg.includes('naverpay') ||
      lowerImg.includes('kakaopay') || lowerImg.includes('toss') ||
      lowerImg.includes('payment') || lowerImg.includes('pay_') ||
      lowerImg.includes('arrow') || lowerImg.includes('button') ||
      lowerImg.includes('btn_') || lowerImg.includes('_btn') ||
      lowerImg.includes('sprite') || lowerImg.includes('.gif') ||
      lowerImg.includes('data:image') || lowerImg.includes('1x1') ||
      lowerImg.includes('spacer') || lowerImg.includes('.svg') ||
      lowerImg.includes('emoji') || lowerImg.includes('emoticon') ||
      lowerImg.includes('storefront') || lowerImg.includes('store_info') ||
      lowerImg.includes('storelogo') || lowerImg.includes('brandlogo') ||
      lowerImg.includes('store_logo') || lowerImg.includes('brand_logo') ||
      lowerImg.includes('watermark') || lowerImg.includes('copyright') ||
      lowerImg.includes('gettyimages') || lowerImg.includes('shutterstock') ||
      lowerImg.includes('imgnews.pstatic') || lowerImg.includes('mimgnews.pstatic') ||
      lowerImg.includes('cert_') || lowerImg.includes('_cert') ||
      lowerImg.includes('certificate') || lowerImg.includes('kc_mark') ||
      lowerImg.includes('warranty') || lowerImg.includes('guarantee') ||
      lowerImg.includes('notice_') || lowerImg.includes('_notice') ||
      lowerImg.includes('info_table') || lowerImg.includes('info_img') ||
      lowerImg.includes('seller_info') || lowerImg.includes('refund') ||
      lowerImg.includes('exchange') || lowerImg.includes('return_') ||
      lowerImg.includes('_return') || lowerImg.includes('guide_') ||
      lowerImg.includes('_guide') || lowerImg.includes('faq_') ||
      lowerImg.includes('qna_') || lowerImg.includes('review_event') ||
      lowerImg.includes('event_banner') || lowerImg.includes('popup_') ||
      lowerImg.includes('_popup') || lowerImg.includes('stamp') ||
      lowerImg.includes('seal') || lowerImg.includes('ribbon') ||
      lowerImg.includes('label_') || lowerImg.includes('_label') ||
      lowerImg.includes('tag_') || lowerImg.includes('_tag') ||
      lowerImg.includes('sticker') || lowerImg.includes('rocket-') ||
      lowerImg.includes('rocketwow') || lowerImg.includes('coupang-logo') ||
      lowerImg.includes('seller-logo') || lowerImg.includes('/np/') ||
      lowerImg.includes('/marketing/') || lowerImg.includes('/event/') ||
      lowerImg.includes('/static/') || lowerImg.includes('/assets/') ||
      lowerImg.includes('text_') || lowerImg.includes('_text') ||
      lowerImg.includes('table_') || lowerImg.includes('_table') ||
      lowerImg.includes('spec_') || lowerImg.includes('_spec');

    if (isLowQualityOrNonProduct) {
      console.log(`[1단계] ⏭️ 비제품/저품질 제외: ${img.substring(0, 80)}...`);
      continue;
    }

    // 네이버 쇼핑 이미지 CDN 체크
    if (lowerImg.includes('pstatic.net') || lowerImg.includes('naver.')) {
      const isProductCdn =
        lowerImg.includes('shop-phinf.pstatic.net') ||
        lowerImg.includes('shopping-phinf.pstatic.net') ||
        lowerImg.includes('checkout.phinf') ||
        lowerImg.includes('image.nmv');
      if (lowerImg.includes('searchad-phinf')) {
        console.log(`[1단계] ⏭️ 광고 이미지 제외: ${img.substring(0, 80)}...`);
        continue;
      }
      if (lowerImg.includes('shopping-phinf') && lowerImg.includes('/main_')) {
        console.log(`[1단계] ⏭️ 카탈로그 썸네일 제외: ${img.substring(0, 80)}...`);
        continue;
      }
      if (!isProductCdn) {
        console.log(`[1단계] ⏭️ 비제품 네이버 CDN 제외: ${img.substring(0, 80)}...`);
        continue;
      }
    }

    // URL 중복 체크
    const baseUrl = img.split('?')[0].split('#')[0];
    if (seenBaseUrls.has(baseUrl)) continue;

    const fileName = baseUrl.split('/').pop()?.split('?')[0] || '';
    const normalizedFileName = fileName.replace(/_\d+x\d+/g, '').replace(/-\d+x\d+/g, '');
    if (normalizedFileName && seenFileNames.has(normalizedFileName)) continue;

    const normalizedUrl = baseUrl
      .replace(/[?&]type=[a-z]\d+/gi, '')
      .replace(/_thumb/gi, '')
      .replace(/_small/gi, '')
      .replace(/\/thumbnail\//gi, '/')
      .replace(/\/\d+x\d+\//gi, '/')
      .replace(/\?$/, '');
    if (seenNormalizedUrls.has(normalizedUrl)) continue;

    seenBaseUrls.add(baseUrl);
    if (normalizedFileName) seenFileNames.add(normalizedFileName);
    seenNormalizedUrls.add(normalizedUrl);
    filtered.push(img);
  }

  return filtered;
}

// ═══════════════════════════════════════════════════════
// 메인 테스트 실행
// ═══════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 이미지 수집 파이프라인 테스트 시작');
  console.log(`📌 URL: ${TEST_URL}`);
  console.log('═══════════════════════════════════════════════════════');

  // ────────────────────────────────────
  // 0단계: 설정 로드 (Gemini/OpenAI API 키)
  // ────────────────────────────────────
  let geminiApiKey = '';
  let openaiApiKey = '';
  try {
    const settingsPath = path.join(
      process.env.APPDATA || '',
      'better-life-naver',
      'settings.json'
    );
    const raw = await fs.readFile(settingsPath, 'utf-8');
    const config = JSON.parse(raw);
    geminiApiKey = config.geminiApiKey || '';
    openaiApiKey = config.openaiApiKey || '';
    console.log(`\n[Config] Gemini API 키: ${geminiApiKey ? geminiApiKey.substring(0, 10) + '...' : '❌ 없음'}`);
    console.log(`[Config] OpenAI API 키: ${openaiApiKey ? openaiApiKey.substring(0, 10) + '...' : '❌ 없음'}`);
  } catch (e) {
    console.warn('[Config] ⚠️ settings.json 로드 실패:', (e as Error).message);
  }

  // ────────────────────────────────────
  // 크롤러 실행: collectShoppingImages
  // ────────────────────────────────────
  console.log('\n────────────────────────────────────');
  console.log('🛒 크롤러 실행 중...');
  console.log('────────────────────────────────────');

  const { collectShoppingImages } = await import('./src/crawler/shopping/index.js');
  const crawlResult = await collectShoppingImages(TEST_URL, {
    timeout: 30000,
    maxImages: 100,
    includeDetails: true,
    useCache: false,
  });

  if (!crawlResult.success) {
    console.error('❌ 크롤링 실패:', crawlResult.error);
    process.exit(1);
  }

  const rawImages = crawlResult.images.map((img: any) => img.url);
  console.log(`\n📸 크롤러 수집: ${rawImages.length}개 이미지`);
  rawImages.forEach((url: string, i: number) => {
    console.log(`  ${i + 1}. ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
  });

  // ────────────────────────────────────
  // 1단계: URL 기반 필터
  // ────────────────────────────────────
  console.log('\n────────────────────────────────────');
  console.log('🔍 1단계: URL 기반 필터');
  console.log('────────────────────────────────────');

  const filteredImages = filterDuplicateAndLowQualityImages(rawImages);
  console.log(`\n✅ 1단계 결과: ${rawImages.length}개 → ${filteredImages.length}개 (제외: ${rawImages.length - filteredImages.length}개)`);
  filteredImages.forEach((url: string, i: number) => {
    console.log(`  ${i + 1}. ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
  });

  // ────────────────────────────────────
  // 2~4단계: 콘텐츠 분석 + 유사도 + AI Vision
  // ────────────────────────────────────
  if (filteredImages.length > 1) {
    console.log('\n────────────────────────────────────');
    console.log('🔬 2~4단계: 콘텐츠 분석 + 유사도 + AI Vision');
    console.log('────────────────────────────────────');

    const { analyzeAndFilterShoppingImages } = await import('./src/image/shoppingImageAnalyzer.js');
    const analyzedImages = await analyzeAndFilterShoppingImages(filteredImages, {
      referenceImageUrl: filteredImages[0],
      geminiApiKey,
      openaiApiKey,
    });

    console.log(`\n✅ 2~4단계 결과: ${filteredImages.length}개 → ${analyzedImages.length}개 (추가 제외: ${filteredImages.length - analyzedImages.length}개)`);
    analyzedImages.forEach((url: string, i: number) => {
      console.log(`  ${i + 1}. ${url.substring(0, 100)}${url.length > 100 ? '...' : ''}`);
    });

    // ────────────────────────────────────
    // 최종 요약
    // ────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 파이프라인 최종 요약');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  크롤러 수집:     ${rawImages.length}개`);
    console.log(`  1단계 URL 필터: ${filteredImages.length}개 (제외 ${rawImages.length - filteredImages.length})`);
    console.log(`  2~4단계 분석:   ${analyzedImages.length}개 (제외 ${filteredImages.length - analyzedImages.length})`);
    console.log(`  ────────────────`);
    console.log(`  최종 통과:       ${analyzedImages.length}개`);
    console.log('═══════════════════════════════════════════════════════');
  } else {
    console.log('\n⚠️ 1단계 통과 이미지가 1개 이하 → 2~4단계 생략');
  }
}

main().catch(err => {
  console.error('❌ 테스트 실패:', err);
  process.exit(1);
});
