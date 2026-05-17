// src/main/utils/imageFilters.ts
// 이미지 URL 중복/저품질/비제품 필터링 헬퍼
// [v2.10.252] main.ts에서 분리 — god-file 압축 11단계.

export function filterDuplicateAndLowQualityImages(images: string[]): string[] {
  const seenBaseUrls = new Set<string>();
  const seenFileNames = new Set<string>();
  const seenNormalizedUrls = new Set<string>(); // ✅ [2026-02-27] 정규화된 URL 중복 체크
  const filtered: string[] = [];

  for (const img of images) {
    if (!img || typeof img !== 'string') continue;

    // 1. 저품질/비제품 이미지 키워드 필터링 (강화됨)
    const lowerImg = img.toLowerCase();
    const isLowQualityOrNonProduct =
      // 크기 관련
      lowerImg.includes('_thumb') ||
      lowerImg.includes('_small') ||
      lowerImg.includes('_s.') ||
      lowerImg.includes('50x50') ||
      lowerImg.includes('60x60') ||
      lowerImg.includes('80x80') ||
      lowerImg.includes('100x100') ||
      lowerImg.includes('120x120') ||
      lowerImg.includes('150x150') ||
      lowerImg.includes('type=f40') ||
      lowerImg.includes('type=f60') ||
      lowerImg.includes('type=f80') ||
      lowerImg.includes('type=f100') ||
      // 품질 관련
      lowerImg.includes('blur') ||
      lowerImg.includes('placeholder') ||
      lowerImg.includes('loading') ||
      lowerImg.includes('lazy') ||
      // 비제품 이미지 (아이콘, 로고, 배너)
      lowerImg.includes('/icon/') ||
      lowerImg.includes('/logo/') ||
      lowerImg.includes('/banner/') ||
      lowerImg.includes('/badge/') ||
      lowerImg.includes('_icon') ||
      lowerImg.includes('_logo') ||
      lowerImg.includes('_banner') ||
      lowerImg.includes('_badge') ||
      // ✅ [2026-02-01 추가] 배찌/마크/제휴 관련
      lowerImg.includes('reviewmania') ||
      lowerImg.includes('review_mania') ||
      lowerImg.includes('powerlink') ||
      lowerImg.includes('power_link') ||
      lowerImg.includes('brandzone') ||
      lowerImg.includes('brand_zone') ||
      lowerImg.includes('navershopping') ||
      lowerImg.includes('naver_shopping') ||
      lowerImg.includes('affiliate') ||
      lowerImg.includes('ad_') ||
      lowerImg.includes('_ad.') ||
      lowerImg.includes('promo') ||
      lowerImg.includes('coupon') ||
      lowerImg.includes('delivery') ||
      lowerImg.includes('shipping') ||
      // 결제 관련
      lowerImg.includes('npay') ||
      lowerImg.includes('naverpay') ||
      lowerImg.includes('kakaopay') ||
      lowerImg.includes('toss') ||
      lowerImg.includes('payment') ||
      lowerImg.includes('pay_') ||
      // 기타 UI 요소
      lowerImg.includes('arrow') ||
      lowerImg.includes('button') ||
      lowerImg.includes('btn_') ||
      lowerImg.includes('_btn') ||
      lowerImg.includes('sprite') ||
      lowerImg.includes('.gif') ||
      lowerImg.includes('data:image') ||
      lowerImg.includes('1x1') ||
      lowerImg.includes('spacer') ||
      lowerImg.includes('.svg') ||
      lowerImg.includes('emoji') ||
      lowerImg.includes('emoticon') ||
      lowerImg.includes('storefront') ||
      lowerImg.includes('store_info') ||
      lowerImg.includes('storelogo') ||
      lowerImg.includes('brandlogo') ||
      lowerImg.includes('store_logo') ||
      lowerImg.includes('brand_logo') ||
      // ✅ [2026-02-27] 워터마크/저작권 이미지 필터링 강화
      lowerImg.includes('watermark') ||
      lowerImg.includes('copyright') ||
      lowerImg.includes('gettyimages') ||
      lowerImg.includes('shutterstock') ||
      lowerImg.includes('istockphoto') ||
      lowerImg.includes('alamy.com') ||
      lowerImg.includes('dreamstime') ||
      lowerImg.includes('press_photo') ||
      lowerImg.includes('editorial') ||
      // ✅ [2026-02-27] 뉴스/언론사 이미지 필터링
      lowerImg.includes('imgnews.pstatic') ||
      lowerImg.includes('mimgnews.pstatic') ||
      lowerImg.includes('dispatch.cdnser') ||
      // ✅ [2026-02-27] 쇼핑몰 비제품 이미지 (인증/안내/정보 텍스트)
      lowerImg.includes('cert_') ||
      lowerImg.includes('_cert') ||
      lowerImg.includes('certificate') ||
      lowerImg.includes('kc_mark') ||
      lowerImg.includes('kcmark') ||
      lowerImg.includes('kc인증') ||
      lowerImg.includes('warranty') ||
      lowerImg.includes('guarantee') ||
      lowerImg.includes('notice_') ||
      lowerImg.includes('_notice') ||
      lowerImg.includes('안내') ||
      lowerImg.includes('info_table') ||
      lowerImg.includes('info_img') ||
      lowerImg.includes('seller_info') ||
      lowerImg.includes('판매자') ||
      lowerImg.includes('교환') ||
      lowerImg.includes('환불') ||
      lowerImg.includes('refund') ||
      lowerImg.includes('exchange') ||
      lowerImg.includes('return_') ||
      lowerImg.includes('_return') ||
      lowerImg.includes('guide_') ||
      lowerImg.includes('_guide') ||
      lowerImg.includes('faq_') ||
      lowerImg.includes('qna_') ||
      lowerImg.includes('review_event') ||
      lowerImg.includes('event_banner') ||
      lowerImg.includes('popup_') ||
      lowerImg.includes('_popup') ||
      lowerImg.includes('stamp') ||
      lowerImg.includes('seal') ||
      lowerImg.includes('ribbon') ||
      lowerImg.includes('label_') ||
      lowerImg.includes('_label') ||
      lowerImg.includes('tag_') ||
      lowerImg.includes('_tag') ||
      lowerImg.includes('sticker') ||
      // ✅ [2026-02-27] 쿠팡 특화 비제품 패턴
      lowerImg.includes('rocket-') ||
      lowerImg.includes('rocketwow') ||
      lowerImg.includes('coupang-logo') ||
      lowerImg.includes('seller-logo') ||
      lowerImg.includes('/np/') ||
      lowerImg.includes('/marketing/') ||
      lowerImg.includes('/event/') ||
      lowerImg.includes('/static/') ||
      lowerImg.includes('/assets/') ||
      // ✅ [2026-02-27] 텍스트/문서 이미지 패턴
      lowerImg.includes('text_') ||
      lowerImg.includes('_text') ||
      lowerImg.includes('table_') ||
      lowerImg.includes('_table') ||
      lowerImg.includes('spec_') ||
      lowerImg.includes('_spec');

    if (isLowQualityOrNonProduct) {
      console.log(`[ImageFilter] ⏭️ 비제품/저품질 제외: ${img.substring(0, 80)}...`);
      continue;
    }

    // ✅ [2026-02-08] 네이버 쇼핑 이미지는 제품 CDN 도메인 확인
    if (lowerImg.includes('pstatic.net') || lowerImg.includes('naver.')) {
      const isProductCdn =
        lowerImg.includes('shop-phinf.pstatic.net') ||
        lowerImg.includes('shopping-phinf.pstatic.net') ||
        lowerImg.includes('checkout.phinf') ||  // ✅ [2026-02-08] 리뷰 이미지 CDN
        lowerImg.includes('image.nmv');          // ✅ [2026-02-08] 비디오 썸네일 CDN
      // ✅ [2026-02-08] 광고 이미지는 제품 CDN이어도 제외
      if (lowerImg.includes('searchad-phinf')) {
        console.log(`[ImageFilter] ⏭️ 광고 이미지 제외: ${img.substring(0, 80)}...`);
        continue;
      }
      // shopping-phinf/main_ 은 다른 상품의 카탈로그 썸네일
      if (lowerImg.includes('shopping-phinf') && lowerImg.includes('/main_')) {
        console.log(`[ImageFilter] ⏭️ 카탈로그 썸네일 제외: ${img.substring(0, 80)}...`);
        continue;
      }
      if (!isProductCdn) {
        console.log(`[ImageFilter] ⏭️ 비제품 네이버 CDN 제외: ${img.substring(0, 80)}...`);
        continue;
      }
    }

    // 2. 기본 URL 중복 체크
    const baseUrl = img.split('?')[0].split('#')[0];
    if (seenBaseUrls.has(baseUrl)) {
      console.log(`[ImageFilter] ⏭️ URL 중복 제외: ${baseUrl.substring(0, 60)}...`);
      continue;
    }

    // 3. 파일명 기반 중복 체크 (같은 파일이 다른 크기로 존재하는 경우)
    const fileName = baseUrl.split('/').pop()?.split('?')[0] || '';
    // 파일명에서 크기 정보 제거 (예: image_250x250.jpg → image.jpg)
    const normalizedFileName = fileName.replace(/_\d+x\d+/g, '').replace(/-\d+x\d+/g, '');

    if (normalizedFileName && seenFileNames.has(normalizedFileName)) {
      console.log(`[ImageFilter] ⏭️ 파일명 중복 제외: ${fileName}`);
      continue;
    }

    // ✅ [2026-02-27] 4. 정규화된 URL 중복 제거 (type=f640/f130 등 네이버 CDN 변형)
    const normalizedUrl = baseUrl
      .replace(/[?&]type=[a-z]\d+/gi, '')  // 네이버 type 파라미터 제거
      .replace(/_thumb/gi, '')              // 썸네일 접미사 제거
      .replace(/_small/gi, '')
      .replace(/\/thumbnail\//gi, '/')      // 쿠팡 썸네일 경로 정규화
      .replace(/\/\d+x\d+\//gi, '/')        // 크기 경로 정규화
      .replace(/\?$/, '');
    if (seenNormalizedUrls.has(normalizedUrl)) {
      console.log(`[ImageFilter] ⏭️ 정규화 URL 중복 제외: ${normalizedUrl.substring(0, 60)}...`);
      continue;
    }

    seenBaseUrls.add(baseUrl);
    if (normalizedFileName) seenFileNames.add(normalizedFileName);
    seenNormalizedUrls.add(normalizedUrl);
    filtered.push(img);
  }

  console.log(`[ImageFilter] ✅ 필터링 완료: ${images.length}개 → ${filtered.length}개`);
  return filtered;
}
