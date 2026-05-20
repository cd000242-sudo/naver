// 우리 crawlBrandStoreProduct의 핵심 API 호출 그대로 시뮬레이션
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const PRODUCT_ID = '12863045289';
const BRAND_NAME = 'homelia';
const ORIGINAL_URL = `https://brand.naver.com/${BRAND_NAME}/products/${PRODUCT_ID}`;
const API_URL = `https://m.brand.naver.com/${BRAND_NAME}/i/v1/products/${PRODUCT_ID}`;

console.log(`[Test] 🎯 브랜드스토어 API 호출`);
console.log(`[Test]   브랜드: ${BRAND_NAME}, 상품ID: ${PRODUCT_ID}`);
console.log(`[Test]   API URL: ${API_URL}`);

const headers = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Referer': `https://m.brand.naver.com/${BRAND_NAME}/`,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Origin': 'https://m.brand.naver.com',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'Cache-Control': 'no-cache',
};

// 초기 지연 (rate limit 우회)
await new Promise(r => setTimeout(r, 1000));

const res = await fetch(API_URL, { headers });
console.log(`[Test]   HTTP ${res.status}`);
if (!res.ok) {
  console.error(`[Test] ❌ API 호출 실패: ${res.status}`);
  process.exit(1);
}

const data = await res.json();
console.log(`\n[Test] ✅ API 응답 수신`);
console.log(`  productName: "${data.name?.substring(0, 60) || data.productName?.substring(0, 60) || '(없음)'}"`);

// 가능한 이미지 필드 모두 탐색
const imageFields = {};
const allCandidates = [];

function recurseExtract(obj, pathStr = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const cur = pathStr ? `${pathStr}.${k}` : k;
    if (typeof v === 'string' && v.startsWith('http') && /\.(jpg|jpeg|png|webp|gif)/i.test(v)) {
      imageFields[cur] = (imageFields[cur] || 0) + 1;
      allCandidates.push({ field: cur, url: v });
    } else if (Array.isArray(v)) {
      v.forEach((item, idx) => {
        if (typeof item === 'string' && item.startsWith('http') && /\.(jpg|jpeg|png|webp|gif)/i.test(item)) {
          imageFields[cur] = (imageFields[cur] || 0) + 1;
          allCandidates.push({ field: `${cur}[${idx}]`, url: item });
        } else if (typeof item === 'object') {
          recurseExtract(item, `${cur}[${idx}]`);
        }
      });
    } else if (typeof v === 'object') {
      recurseExtract(v, cur);
    }
  }
}

recurseExtract(data);

console.log(`\n[Test] 📊 발견된 이미지 필드:`);
const sortedFields = Object.entries(imageFields).sort((a, b) => b[1] - a[1]);
for (const [field, count] of sortedFields.slice(0, 20)) {
  console.log(`  ${field}: ${count}개`);
}

// 고유 URL만
const uniqueUrls = Array.from(new Set(allCandidates.map(c => c.url)));
console.log(`\n[Test] 🖼️ 총 ${allCandidates.length}개 이미지 (고유 ${uniqueUrls.length}개)`);

// 우리 코드가 추출하는 mainImage / galleryImages / detailImages 매핑
// 일반적으로 representativeImage / images / detail/itemImages 등을 사용
const mainImageCandidates = ['representativeImageUrl', 'representativeImage', 'mainImageUrl', 'mainImage', 'productImageInfo.url'];
const galleryCandidates = ['productImageInfos', 'imageList', 'productImages', 'images'];

let mainImage = '';
let galleryImages = [];
let detailImages = [];

// JSON 응답 자체에서 직접 추출 시도
if (data.productImageInfos && Array.isArray(data.productImageInfos)) {
  galleryImages = data.productImageInfos.map(i => i.url || i.imageUrl || i.imageUri).filter(Boolean);
  mainImage = galleryImages[0] || '';
}
if (data.representativeImageUrl) mainImage = data.representativeImageUrl;
if (data.representativeImage) mainImage = data.representativeImage;

// detailImages: detailContent / detailContents / itemContents에서 추출
const detailHtml = data.detailContent || data.detailContents || data.itemContents || '';
if (typeof detailHtml === 'string' && detailHtml.length > 0) {
  const imgMatches = detailHtml.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
  detailImages = imgMatches
    .map(m => m.match(/src=["']([^"']+)["']/)?.[1])
    .filter(Boolean)
    .filter(url => url.startsWith('http'));
}

console.log(`\n[Test] 🎯 추출 결과:`);
console.log(`  mainImage: ${mainImage || '(없음)'}`);
console.log(`  galleryImages: ${galleryImages.length}장`);
console.log(`  detailImages: ${detailImages.length}장`);
console.log(`  총: ${[mainImage, ...galleryImages, ...detailImages].filter(Boolean).length}장`);

// 다운로드
const allOfficial = Array.from(new Set([mainImage, ...galleryImages, ...detailImages].filter(Boolean)));
console.log(`\n[Test] 📥 다운로드 시작 (${allOfficial.length}장, 중복 제거됨)`);

const saveDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'official');
await fs.mkdir(saveDir, { recursive: true });

let saved = 0;
let failed = 0;
for (let i = 0; i < allOfficial.length; i++) {
  const url = allOfficial[i];
  try {
    const r = await fetch(url, { headers: { 'User-Agent': headers['User-Agent'] } });
    if (!r.ok) { failed++; continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1024) { failed++; continue; }
    const ext = url.toLowerCase().includes('.png') ? 'png' : 'jpg';
    const tag = i === 0 ? 'main' : (i <= galleryImages.length ? 'gallery' : 'detail');
    const fname = `${tag}-${String(i+1).padStart(2,'0')}.${ext}`;
    await fs.writeFile(path.join(saveDir, fname), buf);
    console.log(`  ✅ ${fname} (${Math.round(buf.length/1024)}KB)`);
    saved++;
  } catch (e) {
    console.warn(`  ❌ [${i+1}] ${e.message?.substring(0, 50)}`);
    failed++;
  }
}

console.log(`\n[Test] 🎉 결과: ${saved}장 저장, ${failed}장 실패`);
console.log(`[Test] 📂 저장 위치: ${saveDir}`);
