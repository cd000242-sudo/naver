/**
 * 이미지 필터 파이프라인 단독 테스트
 * Playwright MCP에서 수집한 실제 이미지 URL로 1~4단계 필터를 테스트합니다.
 * 
 * 실행: npx tsx tmp_test_filter.ts
 */

import fs from 'fs/promises';
import path from 'path';

// ═══════════════════════════════════════════════════════
// 실제 수집된 이미지 URLs (Playwright MCP에서 추출)
// ═══════════════════════════════════════════════════════
const COLLECTED_IMAGES = [
  // OG 이미지 (제품 대표)
  "https://shop-phinf.pstatic.net/20241218_290/1734510167425VaDBA_JPEG/2527003520097885_927748043.jpg?type=o1000",
  // N페이 배너
  "https://ssl.pstatic.net/static/common/gnb/banner/promo_npay_2309.png",
  // 스토어 로고/배너
  "https://shop-phinf.pstatic.net/20250331_39/1743380672861emA9C_JPEG/23988756443223142_209520856.jpg?type=m120",
  "https://shop-phinf.pstatic.net/20250331_1/1743381042887X8W8I_JPEG/400x90_PC.jpg?type=w640",
  // 대표이미지 (1000px)
  "https://shop-phinf.pstatic.net/20241218_290/1734510167425VaDBA_JPEG/2527003520097885_927748043.jpg?type=m1000_pd",
  // 갤러리 썸네일 (40px - 추가이미지)
  "https://shop-phinf.pstatic.net/20241218_290/1734510167425VaDBA_JPEG/2527003520097885_927748043.jpg?type=f40",
  "https://shop-phinf.pstatic.net/20241218_208/1734510966491HqFtN_JPEG/5443136862828899_390035174.jpg?type=f40",
  "https://shop-phinf.pstatic.net/20250124_60/1737680939342fh93o_JPEG/24089950140685825_666714722.jpg?type=f40",
  "https://shop-phinf.pstatic.net/20250124_215/1737680939611TgknJ_JPEG/24089950391223146_218463886.jpg?type=f40",
  // 쿠폰/프로모 배너 (3300x378)
  "https://shop-phinf.pstatic.net/20260305_237/1772685783662X7t2A_PNG/03_3300x378_23342EC3.png",
  // 리뷰 이미지 (checkout.phinf)
  "https://phinf.pstatic.net/checkout.phinf/20250604_50/17490342761919iYvV_JPEG/1749034240035.jpg?type=f300_300",
  "https://phinf.pstatic.net/checkout.phinf/20250411_289/17443501593792O8os_JPEG/1000023300.jpg?type=f300_300",
  "https://phinf.pstatic.net/checkout.phinf/20250315_148/1741996854805TzhDl_JPEG/IMG_4763.jpeg?type=f300_300",
  "https://phinf.pstatic.net/checkout.phinf/20250212_86/1739372332883XOmDl_JPEG/IMG_4723.jpeg?type=f300_300",
  // 관련 상품 (80x80 - 같은 스토어)
  "https://shop-phinf.pstatic.net/20241218_299/1734510143416HAu46_JPEG/8468008379991528_1057322591.jpg?type=f80_80",
  "https://shop-phinf.pstatic.net/20260206_53/1770365308542DrmcN_JPEG/104498159640164113_474410147.jpg?type=f80_80",
  "https://shop-phinf.pstatic.net/20260206_70/1770366950094qLqfb_JPEG/104499797190133656_1810965797.jpg?type=f80_80",
  // 추천 상품 (200px)
  "https://shop-phinf.pstatic.net/20250909_135/1757404832063gBb8q_JPEG/91537629186464607_949159403.jpg?type=f200",
  "https://shop-phinf.pstatic.net/20260204_281/17701776288180mnRA_JPEG/47828524578476461_168981910.jpg?type=f200",
  "https://shop-phinf.pstatic.net/20250613_188/1749780904194jnxJ3_JPEG/25399006659976159_152484022.jpg?type=f200",
  "https://shop-phinf.pstatic.net/20250917_105/17580729682813cWOA_JPEG/92205778420177180_187023373.jpg?type=f200",
  "https://shop-phinf.pstatic.net/20241211_247/1733899588721enE83_JPEG/67283200555629978_1045374086.jpg?type=f200",
  // 대표이미지 (100px 썸네일)
  "https://shop-phinf.pstatic.net/20241218_290/1734510167425VaDBA_JPEG/2527003520097885_927748043.jpg?type=f100",
  // 인증정보 마크 (GIF)
  "https://img-shop.pstatic.net/front/common/certification/mark_19.gif?type=f65_65",
  // 카탈로그 썸네일 (shopping-phinf main_*)
  "https://shopping-phinf.pstatic.net/main_8590747/85907473106.3.jpg?type=f80",
  "https://shopping-phinf.pstatic.net/main_8702013/87020134416.1.jpg?type=f80",
  "https://shopping-phinf.pstatic.net/main_8971048/89710484451.jpg?type=f80",
  "https://shopping-phinf.pstatic.net/main_8907839/89078399004.jpg?type=f80",
  "https://shopping-phinf.pstatic.net/main_8288498/82884981106.24.jpg?type=f80",
  // 같은 스토어의 다른 상품 (80x80)
  "https://shop-phinf.pstatic.net/20260127_188/17694761046997Tiyg_JPEG/79606566396282371_1213683183.jpg?type=f80_80",
  "https://shop-phinf.pstatic.net/20191210_287/1575948262475hSWW7_JPEG/13308097023682948_1461533191.jpg?type=f80_80",
  "https://shop-phinf.pstatic.net/20260204_281/17701776288180mnRA_JPEG/47828524578476461_168981910.jpg?type=f80_80",
  "https://shop-phinf.pstatic.net/20231117_265/1700201654276SQvQj_JPEG/14137335223813407_549726488.jpg?type=f80_80",
  "https://shop-phinf.pstatic.net/20250122_198/1737508549274oA6yn_JPEG/71641354409845986_1425273031.jpg?type=f80_80",
];

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
      console.log(`  ❌ [URL필터] ${img.substring(0, 90)}...`);
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
        console.log(`  ❌ [광고CDN] ${img.substring(0, 90)}...`);
        continue;
      }
      if (lowerImg.includes('shopping-phinf') && lowerImg.includes('/main_')) {
        console.log(`  ❌ [카탈로그] ${img.substring(0, 90)}...`);
        continue;
      }
      if (!isProductCdn) {
        console.log(`  ❌ [비제품CDN] ${img.substring(0, 90)}...`);
        continue;
      }
    }

    // URL 중복 체크
    const baseUrl = img.split('?')[0].split('#')[0];
    if (seenBaseUrls.has(baseUrl)) {
      console.log(`  ❌ [중복base] ${img.substring(0, 90)}...`);
      continue;
    }

    const fileName = baseUrl.split('/').pop()?.split('?')[0] || '';
    const normalizedFileName = fileName.replace(/_\d+x\d+/g, '').replace(/-\d+x\d+/g, '');
    if (normalizedFileName && seenFileNames.has(normalizedFileName)) {
      console.log(`  ❌ [중복파일] ${img.substring(0, 90)}...`);
      continue;
    }

    const normalizedUrl = baseUrl
      .replace(/[?&]type=[a-z]\d+/gi, '')
      .replace(/_thumb/gi, '')
      .replace(/_small/gi, '')
      .replace(/\/thumbnail\//gi, '/')
      .replace(/\/\d+x\d+\//gi, '/')
      .replace(/\?$/, '');
    if (seenNormalizedUrls.has(normalizedUrl)) {
      console.log(`  ❌ [중복norm] ${img.substring(0, 90)}...`);
      continue;
    }

    seenBaseUrls.add(baseUrl);
    if (normalizedFileName) seenFileNames.add(normalizedFileName);
    seenNormalizedUrls.add(normalizedUrl);
    filtered.push(img);
  }

  return filtered;
}

// ═══════════════════════════════════════════════════════
// 메인 실행
// ═══════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 이미지 필터 파이프라인 테스트');
  console.log('📌 상품: 롯데 에코제트 LE-910 공기청정기');
  console.log(`📸 수집된 이미지: ${COLLECTED_IMAGES.length}개`);
  console.log('═══════════════════════════════════════════════════════');

  // ────────────────────────────────────
  // 0단계: 설정 로드
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
    console.log(`\n[Config] Gemini: ${geminiApiKey ? '✅' : '❌'} | OpenAI: ${openaiApiKey ? '✅' : '❌'}`);
  } catch (e) {
    console.warn('[Config] ⚠️ settings.json 로드 실패:', (e as Error).message);
  }

  // ────────────────────────────────────
  // 1단계: URL 기반 필터
  // ────────────────────────────────────
  console.log('\n────────────────────────────────────');
  console.log('🔍 1단계: URL 기반 필터 (main.ts filterDuplicateAndLowQualityImages)');
  console.log('────────────────────────────────────');

  const stage1Result = filterDuplicateAndLowQualityImages(COLLECTED_IMAGES);

  console.log(`\n✅ 1단계 결과: ${COLLECTED_IMAGES.length}개 → ${stage1Result.length}개`);
  console.log('통과한 이미지:');
  stage1Result.forEach((url, i) => {
    console.log(`  ${i + 1}. ${url.substring(0, 100)}`);
  });

  // ────────────────────────────────────
  // 2~4단계: 콘텐츠 분석 + 유사도 + AI Vision
  // ────────────────────────────────────
  if (stage1Result.length > 1) {
    console.log('\n────────────────────────────────────');
    console.log('🔬 2~4단계: analyzeAndFilterShoppingImages');
    console.log('────────────────────────────────────');

    try {
      const { analyzeAndFilterShoppingImages } = await import('./src/image/shoppingImageAnalyzer.js');
      const stage234Result = await analyzeAndFilterShoppingImages(stage1Result, {
        referenceImageUrl: stage1Result[0],
        geminiApiKey,
        openaiApiKey,
      });

      console.log(`\n✅ 2~4단계 결과: ${stage1Result.length}개 → ${stage234Result.length}개`);
      console.log('최종 통과 이미지:');
      stage234Result.forEach((url: string, i: number) => {
        console.log(`  ${i + 1}. ${url}`);
      });

      // 최종 요약
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('📊 파이프라인 최종 요약');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`  원본 수집:      ${COLLECTED_IMAGES.length}개`);
      console.log(`  1단계 URL필터: ${stage1Result.length}개 (−${COLLECTED_IMAGES.length - stage1Result.length})`);
      console.log(`  2~4단계 분석:  ${stage234Result.length}개 (−${stage1Result.length - stage234Result.length})`);
      console.log(`  ──────────────`);
      console.log(`  최종 통과:      ${stage234Result.length}개`);
      console.log('═══════════════════════════════════════════════════════');
    } catch (err) {
      console.error('❌ 2~4단계 실행 실패:', (err as Error).message);
      console.error('스택:', (err as Error).stack);
    }
  } else {
    console.log('\n⚠️ 1단계 통과 이미지가 1개 이하 → 2~4단계 생략');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 파이프라인 최종 요약');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  원본 수집:      ${COLLECTED_IMAGES.length}개`);
    console.log(`  1단계 URL필터: ${stage1Result.length}개 (−${COLLECTED_IMAGES.length - stage1Result.length})`);
    console.log(`  ──────────────`);
    console.log(`  최종 통과:      ${stage1Result.length}개`);
    console.log('═══════════════════════════════════════════════════════');
  }
}

main().catch(err => {
  console.error('❌ 테스트 실패:', err);
  process.exit(1);
});
