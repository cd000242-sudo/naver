/**
 * ✅ AdsPower + Playwright 쿠팡 크롤링 테스트
 */

const { chromium } = require('playwright');

const ADSPOWER_BASE = 'http://local.adspower.com:50325';
const API_KEY = '2b089fcd2704515c0882358279b5814a00861c0d195b98af';

function apiKey(prefix = '?') {
  return API_KEY ? `${prefix}api_key=${API_KEY}` : '';
}

async function checkStatus() {
  console.log('\n🔍 [1/5] AdsPower 상태 확인...');
  try {
    const res = await fetch(`${ADSPOWER_BASE}/status${apiKey()}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) { console.log('   ✅ AdsPower 실행 중!'); return true; }
    console.log(`   ❌ 응답 오류: ${res.status}`);
    return false;
  } catch (e) {
    console.log('   ❌ AdsPower 연결 불가. 실행해 주세요.');
    return false;
  }
}

async function createProfile(name) {
  console.log(`\n📝 [2/5] 프로필 생성: "${name}"...`);
  try {
    const res = await fetch(`${ADSPOWER_BASE}/api/v1/user/create${apiKey()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, group_id: '0', repeat_config: ['0'], user_proxy_config: { proxy_soft: 'no_proxy' } }),
    });
    const data = await res.json();
    if (data.code === 0 && data.data?.id) {
      console.log(`   ✅ 프로필 생성 성공! ID: ${data.data.id}`);
      return data.data.id;
    }
    console.log(`   ❌ 실패: ${data.msg}`);
    return null;
  } catch (e) {
    console.log(`   ❌ 오류: ${e.message}`);
    return null;
  }
}

async function openBrowser(profileId) {
  console.log(`\n🌐 [3/5] AdsPower 브라우저 열기...`);
  try {
    const res = await fetch(
      `${ADSPOWER_BASE}/api/v1/browser/start?user_id=${encodeURIComponent(profileId)}${apiKey('&')}`
    );
    const data = await res.json();
    if (data.code === 0 && data.data?.ws?.puppeteer) {
      console.log(`   ✅ 브라우저 열기 성공!`);
      console.log(`   📡 WS: ${data.data.ws.puppeteer}`);
      return data.data.ws.puppeteer;
    }
    console.log(`   ❌ 실패: ${data.msg}`);
    return null;
  } catch (e) {
    console.log(`   ❌ 오류: ${e.message}`);
    return null;
  }
}

async function crawlCoupang(wsEndpoint) {
  console.log(`\n🎭 [4/5] Playwright → 쿠팡 크롤링...`);
  
  const browser = await chromium.connectOverCDP(wsEndpoint);
  console.log('   ✅ Playwright 연결 성공!');
  
  const context = browser.contexts()[0];
  // 새 페이지 생성 (기존 페이지는 AdsPower 내부 페이지라 리다이렉트 시 context 파괴됨)
  const page = await context.newPage();
  
  // 쿠팡 메인 접속
  console.log('   🔗 쿠팡 메인 접속...');
  await page.goto('https://www.coupang.com', { waitUntil: 'load', timeout: 30000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  const mainTitle = await page.title();
  console.log(`   📄 타이틀: ${mainTitle}`);
  
  // 쿠팡 검색
  console.log('   🔗 쿠팡 "노트북" 검색...');
  await page.goto('https://www.coupang.com/np/search?component=&q=%EB%85%B8%ED%8A%B8%EB%B6%81&channel=user', 
    { waitUntil: 'load', timeout: 30000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000); // 리다이렉트 대기
  
  const searchTitle = await page.title();
  console.log(`   📄 검색 타이틀: ${searchTitle}`);
  
  // 상품 추출 (안전하게)
  try {
    const products = await page.evaluate(() => {
      const items = document.querySelectorAll('.search-product, li[class*="search-product"]');
      const results = [];
      for (let i = 0; i < Math.min(items.length, 5); i++) {
        const item = items[i];
        const name = item.querySelector('.name, .search-product-link .name')?.textContent?.trim() || '';
        const price = item.querySelector('.price-value')?.textContent?.trim() || '';
        if (name) results.push({ name: name.substring(0, 60), price });
      }
      // 상품 못 찾으면 전체 텍스트에서 힌트
      if (results.length === 0) {
        const bodyText = document.body?.innerText?.substring(0, 500) || '';
        return [{ name: `[페이지 텍스트] ${bodyText.substring(0, 100)}`, price: '' }];
      }
      return results;
    });
    
    console.log(`\n   📦 상품 ${products.length}개 추출:`);
    products.forEach((p, i) => {
      console.log(`      ${i+1}. ${p.name}${p.price ? ' — ₩' + p.price : ''}`);
    });
  } catch (evalErr) {
    console.log(`   ⚠️ 상품 추출 중 오류 (리다이렉트): ${evalErr.message?.substring(0, 80)}`);
    // 재시도: 현재 URL과 타이틀만 출력
    try {
      const currentUrl = page.url();
      const currentTitle = await page.title();
      console.log(`   📍 현재 URL: ${currentUrl}`);
      console.log(`   📄 현재 타이틀: ${currentTitle}`);
    } catch (e2) {}
  }
  
  // User-Agent
  try {
    const ua = await page.evaluate(() => navigator.userAgent);
    console.log(`\n   🖥️ UA: ${ua.substring(0, 80)}...`);
  } catch (e) {}
  
  // 차단 확인
  try {
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || '');
    const blocked = bodyText.includes('차단') || bodyText.includes('bot') || bodyText.includes('captcha');
    console.log(`   🛡️ 차단 여부: ${blocked ? '⚠️ 차단됨' : '✅ 정상 접속'}`);
  } catch (e) {}
  
  await browser.close();
  console.log('   ✅ Playwright 연결 해제');
}

async function cleanup(profileId) {
  console.log(`\n🧹 [5/5] 정리...`);
  try {
    await fetch(`${ADSPOWER_BASE}/api/v1/browser/stop?user_id=${encodeURIComponent(profileId)}${apiKey('&')}`);
    console.log('   ✅ 브라우저 닫기');
  } catch (e) {}
  try {
    await fetch(`${ADSPOWER_BASE}/api/v1/user/delete${apiKey()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: [profileId] }),
    });
    console.log('   ✅ 테스트 프로필 삭제');
  } catch (e) {}
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  🧪 AdsPower + Playwright 쿠팡 크롤링 테스트');
  console.log('═══════════════════════════════════════════');
  
  if (!(await checkStatus())) { console.log('\n⚠️ AdsPower 먼저 실행!'); process.exit(1); }
  
  const profileId = await createProfile('쿠팡테스트_' + Date.now());
  if (!profileId) { console.log('\n⚠️ 프로필 생성 실패'); process.exit(1); }
  
  try {
    const ws = await openBrowser(profileId);
    if (!ws) { await cleanup(profileId); process.exit(1); }
    await crawlCoupang(ws);
  } catch (e) {
    console.error(`\n❌ 오류: ${e.message}`);
  } finally {
    await cleanup(profileId);
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  🎉 테스트 완료!');
  console.log('═══════════════════════════════════════════\n');
}

main().catch(console.error);
