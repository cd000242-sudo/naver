// 우리 imageFilters.ts 의 filterDuplicateAndLowQualityImages를 그대로 inline + 다운로드
import * as fs from 'fs/promises';
import * as path from 'path';

const SOURCE_IMAGES = process.argv.slice(2);
if (SOURCE_IMAGES.length === 0) {
  console.error('No URLs provided');
  process.exit(1);
}

// imageFilters.ts 로직 그대로 복제
function filterDuplicateAndLowQualityImages(images) {
  const seenBaseUrls = new Set();
  const seenFileNames = new Set();
  const seenNormalizedUrls = new Set();
  const filtered = [];
  const rejectedByKeyword = [];
  const rejectedByCdn = [];
  const rejectedByDup = [];

  for (const img of images) {
    if (!img || typeof img !== 'string') continue;
    const lowerImg = img.toLowerCase();

    // 비제품 키워드 (전체 리스트 — 본 코드 동일)
    const lowQualityPatterns = [
      '_thumb','_small','_s.','50x50','60x60','80x80','100x100','120x120','150x150',
      'type=f40','type=f60','type=f80','type=f100',
      'blur','placeholder','loading','lazy',
      '/icon/','/logo/','/banner/','/badge/',
      '_icon','_logo','_banner','_badge',
      'reviewmania','review_mania','powerlink','power_link','brandzone','brand_zone',
      'navershopping','naver_shopping','affiliate','ad_','_ad.','promo','coupon','delivery','shipping',
      'npay','naverpay','kakaopay','toss','payment','pay_',
      'arrow','button','btn_','_btn','sprite','.gif','data:image','1x1','spacer','.svg','emoji','emoticon',
      'storefront','store_info','storelogo','brandlogo','store_logo','brand_logo',
      'watermark','copyright','gettyimages','shutterstock','istockphoto','alamy.com','dreamstime','press_photo','editorial',
      'imgnews.pstatic','mimgnews.pstatic','dispatch.cdnser',
      'cert_','_cert','certificate','kc_mark','kcmark','kc인증','warranty','guarantee',
      'notice_','_notice','안내','info_table','info_img','seller_info','판매자','교환','환불','refund','exchange',
      'return_','_return','guide_','_guide','faq_','qna_','review_event','event_banner','popup_','_popup',
      'stamp','seal','ribbon','label_','_label','tag_','_tag','sticker',
      'rocket-','rocketwow','coupang-logo','seller-logo','/np/','/marketing/','/event/','/static/','/assets/',
      'text_','_text','table_','_table','spec_','_spec',
    ];
    const matchedPattern = lowQualityPatterns.find(p => lowerImg.includes(p));
    if (matchedPattern) {
      rejectedByKeyword.push({ img, pattern: matchedPattern });
      continue;
    }

    // 네이버 CDN: 제품 도메인만 허용
    if (lowerImg.includes('pstatic.net') || lowerImg.includes('naver.')) {
      const isProductCdn =
        lowerImg.includes('shop-phinf.pstatic.net') ||
        lowerImg.includes('shopping-phinf.pstatic.net') ||
        lowerImg.includes('checkout.phinf') ||
        lowerImg.includes('image.nmv');
      if (lowerImg.includes('searchad-phinf')) { rejectedByCdn.push({img, reason:'광고'}); continue; }
      if (lowerImg.includes('shopping-phinf') && lowerImg.includes('/main_')) { rejectedByCdn.push({img, reason:'카탈로그썸네일'}); continue; }
      if (!isProductCdn) { rejectedByCdn.push({img, reason:'비제품CDN'}); continue; }
    }

    // URL/파일명/정규화 중복
    const baseUrl = img.split('?')[0].split('#')[0];
    if (seenBaseUrls.has(baseUrl)) { rejectedByDup.push({img, reason:'baseUrl중복'}); continue; }
    const fileName = baseUrl.split('/').pop()?.split('?')[0] || '';
    const normalizedFileName = fileName.replace(/_\d+x\d+/g, '').replace(/-\d+x\d+/g, '');
    if (normalizedFileName && seenFileNames.has(normalizedFileName)) { rejectedByDup.push({img, reason:'파일명중복'}); continue; }
    const normalizedUrl = baseUrl
      .replace(/[?&]type=[a-z]\d+/gi, '')
      .replace(/_thumb/gi, '').replace(/_small/gi, '')
      .replace(/\/thumbnail\//gi, '/')
      .replace(/\/\d+x\d+\//gi, '/')
      .replace(/\?$/, '');
    if (seenNormalizedUrls.has(normalizedUrl)) { rejectedByDup.push({img, reason:'정규화중복'}); continue; }
    seenBaseUrls.add(baseUrl);
    if (normalizedFileName) seenFileNames.add(normalizedFileName);
    seenNormalizedUrls.add(normalizedUrl);
    filtered.push(img);
  }
  return { filtered, rejectedByKeyword, rejectedByCdn, rejectedByDup };
}

const result = filterDuplicateAndLowQualityImages(SOURCE_IMAGES);
console.log(`\n========== 1단계 URL 필터 결과 ==========`);
console.log(`입력: ${SOURCE_IMAGES.length}개`);
console.log(`키워드 제외: ${result.rejectedByKeyword.length}개`);
console.log(`CDN 제외: ${result.rejectedByCdn.length}개`);
console.log(`중복 제외: ${result.rejectedByDup.length}개`);
console.log(`✅ 통과: ${result.filtered.length}개`);

import { fileURLToPath } from 'url';
const saveDir = path.dirname(fileURLToPath(import.meta.url));
console.log(`\n========== 다운로드 + 저장 ==========`);
console.log(`저장 폴더: ${saveDir}`);

let savedCount = 0;
let failedCount = 0;
for (let i = 0; i < result.filtered.length; i++) {
  const url = result.filtered[i];
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
    if (!res.ok) { console.warn(`  [${i+1}] HTTP ${res.status} — ${url.substring(0, 70)}...`); failedCount++; continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) { console.warn(`  [${i+1}] 너무 작음 ${buf.length}B — 스킵`); failedCount++; continue; }
    const ext = url.toLowerCase().includes('.png') || url.includes('PNG') ? 'png' : 'jpg';
    const fname = `image-${String(i+1).padStart(2,'0')}.${ext}`;
    await fs.writeFile(path.join(saveDir, fname), buf);
    console.log(`  ✅ [${i+1}] ${fname} (${Math.round(buf.length/1024)}KB)`);
    savedCount++;
  } catch (e) {
    console.warn(`  ❌ [${i+1}] ${e.message} — ${url.substring(0,70)}...`);
    failedCount++;
  }
}

console.log(`\n========== 최종 결과 ==========`);
console.log(`저장 성공: ${savedCount}개`);
console.log(`저장 실패: ${failedCount}개`);
console.log(`저장 위치: ${saveDir}`);
