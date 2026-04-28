// v2.7.28 — 쇼핑커넥트 크롤링 진단 스크립트
// 사용:
//   node scripts/test-shopping-crawl.mjs <스마트스토어/브랜드스토어 URL>
//
// 동작: 빌드된 dist/sourceAssembler.js의 fetchShoppingImages를 호출해
//   Stage 1(TLS)/Stage 2(Puppeteer)/Stage 3(Playwright) 중 어느 단계에서
//   크롤링 결과가 나오는지, 제목/이미지 수/가격을 출력.
//
// 사전 조건: npm run build 한 번 실행되어 dist/sourceAssembler.js 존재해야 함.

import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ override: false });

const url = process.argv[2];
if (!url) {
  console.error('❌ URL 인자 필요. 예시:');
  console.error('   node scripts/test-shopping-crawl.mjs https://smartstore.naver.com/...');
  process.exit(1);
}

const distPath = path.join(__dirname, '..', 'dist', 'sourceAssembler.js');
let fetchShoppingImages;
try {
  const moduleUrl = pathToFileURL(distPath).href;
  const mod = await import(moduleUrl);
  fetchShoppingImages = mod.fetchShoppingImages;
  if (!fetchShoppingImages) {
    throw new Error('dist/sourceAssembler.js에 fetchShoppingImages export 없음');
  }
} catch (err) {
  console.error('❌ dist 빌드 누락 또는 import 실패:', err.message);
  console.error('💡 먼저 다음을 실행:  npm run build');
  process.exit(1);
}

console.log('=================================================');
console.log('🛒 쇼핑커넥트 크롤링 진단');
console.log('=================================================');
console.log(`URL: ${url}`);
console.log('');

const startedAt = Date.now();

try {
  const result = await fetchShoppingImages(url, { imagesOnly: false });
  const elapsedMs = Date.now() - startedAt;

  console.log('');
  console.log('=================================================');
  console.log('📊 결과');
  console.log('=================================================');
  console.log(`소요 시간: ${(elapsedMs / 1000).toFixed(1)}초`);
  console.log(`제목: ${result?.title || '❌ 없음'}`);
  console.log(`가격: ${result?.price || '❌ 없음'}`);
  console.log(`이미지: ${result?.images?.length || 0}개`);
  console.log(`설명: ${result?.description ? `${result.description.substring(0, 100)}...` : '❌ 없음'}`);
  console.log(`스펙: ${result?.spec ? `${result.spec.substring(0, 100)}...` : '❌ 없음'}`);
  console.log(`리뷰: ${result?.reviewTexts?.length || 0}개`);
  console.log('');

  const hasMinimalContent = (result?.title && result.title.length > 0) || (result?.images && result.images.length > 0);
  if (hasMinimalContent) {
    console.log('✅ 크롤링 성공 — 위 결과로 글 생성 가능');
    process.exit(0);
  } else {
    console.log('❌ 크롤링 결과 비어있음 — 위 콘솔 로그에서 어느 Stage에서 실패했는지 확인');
    console.log('💡 흔한 원인:');
    console.log('  1. 네이버 셀렉터/JSON-LD 구조 변경 (소스 업데이트 필요)');
    console.log('  2. Puppeteer/Playwright 봇 감지 (User-Agent / Stealth 우회 깨짐)');
    console.log('  3. URL 형식 인식 실패 (smartstore.naver.com / brand.naver.com / naver.me 인지)');
    console.log('  4. 네트워크 타임아웃');
    process.exit(2);
  }
} catch (err) {
  const elapsedMs = Date.now() - startedAt;
  console.log('');
  console.log('=================================================');
  console.log('❌ 예외 발생');
  console.log('=================================================');
  console.log(`소요 시간: ${(elapsedMs / 1000).toFixed(1)}초`);
  console.log(`메시지: ${err?.message || String(err)}`);
  if (err?.stack) {
    console.log('');
    console.log('스택:');
    console.log(err.stack.split('\n').slice(0, 10).join('\n'));
  }
  process.exit(3);
}
