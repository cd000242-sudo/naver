/**
 * AdsPower + Playwright 크롤링 테스트
 * 실제 앱 환경과 동일: AdsPower CDP → 지문 마스킹 + 프록시
 */
const { chromium } = require('playwright');

const ADSPOWER_BASE = 'http://local.adspower.com:50325';
const URL = 'https://smartstore.naver.com/koneinfo/products/12990059708';

async function run() {
  console.log('🌐 AdsPower + Playwright 크롤링 테스트\n');

  // 1. AdsPower 상태 확인
  console.log('1️⃣ AdsPower 상태 확인...');
  try {
    const statusRes = await fetch(`${ADSPOWER_BASE}/status`);
    if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);
    console.log('   ✅ AdsPower 실행 중!\n');
  } catch (e) {
    console.log(`   ❌ AdsPower에 연결할 수 없습니다: ${e.message}`);
    console.log('   → AdsPower를 먼저 실행해주세요.');
    return;
  }

  // 2. 프로필 목록 조회
  console.log('2️⃣ 프로필 목록 조회...');
  const listRes = await fetch(`${ADSPOWER_BASE}/api/v1/user/list?page_size=10`);
  const listData = await listRes.json();
  
  if (listData.code !== 0 || !listData.data?.list?.length) {
    console.log('   ❌ 프로필이 없습니다. AdsPower에서 프로필을 먼저 생성해주세요.');
    return;
  }

  const profile = listData.data.list[0];
  const profileId = profile.serial_number || profile.user_id;
  console.log(`   ✅ 프로필 발견: ${profile.name || profileId}\n`);

  // 3. 프로필 브라우저 열기
  console.log('3️⃣ 프로필 브라우저 열기...');
  const openRes = await fetch(`${ADSPOWER_BASE}/api/v1/browser/start?serial_number=${profileId}`);
  const openData = await openRes.json();

  if (openData.code !== 0 || !openData.data?.ws?.puppeteer) {
    console.log(`   ❌ 브라우저 열기 실패: ${openData.msg}`);
    return;
  }

  const wsEndpoint = openData.data.ws.puppeteer;
  console.log(`   ✅ WebSocket: ${wsEndpoint.substring(0, 50)}...\n`);

  // 4. Playwright CDP 연결
  console.log('4️⃣ Playwright CDP 연결...');
  const browser = await chromium.connectOverCDP(wsEndpoint);
  const contexts = browser.contexts();
  const context = contexts[0] || await browser.newContext();
  const page = await context.newPage();
  console.log('   ✅ 연결 완료!\n');

  // 5. 스마트스토어 크롤링
  console.log(`5️⃣ 크롤링: ${URL}`);
  
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    try { await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {}
  }
  await page.waitForTimeout(5000);

  const title = await page.title();
  const html = await page.content();
  
  // 에러/캡챠 체크
  const isError = html.includes('서비스 접속이 불가') || 
                  title.includes('에러') || html.includes('에러페이지');
  const isCaptcha = html.includes('captcha') || html.includes('보안문자') || 
                    html.includes('wtm_captcha') || html.includes('ncpt.naver.com');

  if (isError || isCaptcha) {
    console.log(`   ⚠️ ${isError ? '에러 페이지' : '캡챠'} 감지 → 새로고침...`);
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(3000);
      try { await page.reload({ waitUntil: 'networkidle', timeout: 15000 }); } catch {}
      await page.waitForTimeout(3000);
      const retryHtml = await page.content();
      const retryTitle = await page.title();
      if (!retryHtml.includes('에러') && !retryTitle.includes('에러') && 
          !retryHtml.includes('captcha') && !retryHtml.includes('서비스 접속이 불가')) {
        console.log(`   ✅ ${i+1}번째 새로고침에서 복구!`);
        break;
      }
    }
  }

  // 최종 데이터 추출
  await page.waitForTimeout(3000);
  const finalHtml = await page.content();
  const finalTitle = await page.title();
  
  const ogTitle = finalHtml.match(/property="og:title"\s*content="([^"]+)"/)?.[1];
  const ogDesc  = finalHtml.match(/property="og:description"\s*content="([^"]+)"/)?.[1];
  const ogImage = finalHtml.match(/property="og:image"\s*content="([^"]+)"/)?.[1];
  const ogPrice = finalHtml.match(/product:price:amount"\s*content="([^"]+)"/)?.[1];

  console.log(`\n${'='.repeat(55)}`);
  console.log(` 📦 크롤링 결과`);
  console.log(`${'='.repeat(55)}`);
  console.log(`  페이지 제목: ${finalTitle}`);
  console.log(`  HTML 크기: ${(finalHtml.length / 1024).toFixed(1)} KB`);
  console.log(`  상품명: ${ogTitle || '❌'}`);
  console.log(`  설명: ${ogDesc ? ogDesc.substring(0, 80) : '❌'}`);
  console.log(`  가격: ${ogPrice ? Number(ogPrice).toLocaleString() + '원' : '❌'}`);
  console.log(`  이미지: ${ogImage ? '✅ ' + ogImage.substring(0, 70) : '❌'}`);
  
  const success = !!(ogTitle || finalHtml.length > 100000);
  console.log(`\n  ${success ? '🎉 크롤링 성공!' : '❌ 크롤링 실패'}`);
  console.log(`${'='.repeat(55)}`);

  // 6. 정리
  await page.close();
  await browser.close();
  
  // AdsPower 브라우저 닫기
  try {
    await fetch(`${ADSPOWER_BASE}/api/v1/browser/stop?serial_number=${profileId}`);
    console.log('\n🧹 AdsPower 브라우저 닫기 완료');
  } catch {}
}

run().catch(e => console.log('오류:', e.message));
