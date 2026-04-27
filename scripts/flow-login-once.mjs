// Flow 로그인 1회 헬퍼 (v2 — 자동 감지 방식)
// 화면 중앙에 visible 브라우저 띄우고, 사용자 로그인 완료를 자동 폴링.
// 로그인 감지 즉시 쿠키 저장 후 자동 종료.

import { chromium } from 'playwright';
import * as path from 'path';
import * as os from 'os';

const PROFILE_DIR = path.join(process.env.APPDATA || os.homedir(), 'Better Life Naver', 'flow-chromium-profile');
const FLOW_URL = 'https://labs.google/fx/tools/flow';
const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 5 * 60 * 1000; // 5분 대기

console.log('🌐 Flow 로그인 헬퍼 v2');
console.log('📁 프로필:', PROFILE_DIR);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  args: [
    '--disable-blink-features=AutomationControlled',
    '--window-position=300,100',  // 화면 좌상단에서 약간 띄워서 명확하게 보이게
    '--window-size=1280,800',
  ],
  ignoreDefaultArgs: ['--enable-automation'],
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  timeout: 60000,
});

await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

const page = ctx.pages()[0] || await ctx.newPage();
await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

// 창 강제 포커스
try { await page.bringToFront(); } catch {}

console.log('\n✅ 브라우저가 떴습니다 (좌상단 (300,100) 위치, 1280x800).');
console.log('📌 "Sign in" 클릭 → Google 로그인 → Flow 메인 화면 보이면 끝');
console.log('💾 로그인 감지 시 자동으로 쿠키 저장 후 종료됩니다 (Enter 누르지 마세요).');
console.log(`⏱️  최대 대기 시간: ${MAX_WAIT_MS / 1000}초\n`);

const startedAt = Date.now();
let logged = false;

// v3: 폴링 안정화 — Google 로그인 도중 redirect/navigate로 컨텍스트가 일시
// 끊겨도 break하지 않고 인내. 쿠키 직접 검사 폴백 + page.url() 안정화 대기.
async function checkLoginViaCookie() {
  try {
    const cookies = await ctx.cookies();
    const hasGoogleSession = cookies.some(
      (c) => /^(SID|HSID|SSID|SAPISID|__Secure-1PSID|__Secure-3PSID|LSID)$/.test(c.name)
    );
    return hasGoogleSession;
  } catch { return false; }
}
async function checkLoginViaApi() {
  try {
    const session = await page.evaluate(async () => {
      try {
        const res = await fetch('/fx/api/auth/session', { credentials: 'include' });
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    });
    return session?.user ? session : null;
  } catch { return null; }
}

while (Date.now() - startedAt < MAX_WAIT_MS) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  const elapsed = Math.round((Date.now() - startedAt) / 1000);

  // 1차: API 세션 (정확하지만 navigate 중엔 실패 가능 — 무시)
  const apiSession = await checkLoginViaApi();
  if (apiSession?.user) {
    logged = true;
    console.log(`\n✅ 로그인 감지 (API): ${apiSession.user.email || apiSession.user.name || 'unknown'}`);
    break;
  }

  // 2차: Google 쿠키 직접 검사 (navigate 중에도 유효)
  const cookieLogged = await checkLoginViaCookie();
  if (cookieLogged) {
    // 쿠키는 있는데 API가 아직 안 잡히면 페이지 안정화 대기 + 재시도
    process.stdout.write(`\r   🔓 Google 쿠키 감지됨 — Flow 페이지 안정화 대기 중... ${elapsed}s`);
    await new Promise((r) => setTimeout(r, 5000));
    // Flow 페이지로 명시 이동해서 세션 부착
    try {
      const curUrl = page.url();
      if (!curUrl.includes('labs.google/fx')) {
        await page.goto(FLOW_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      }
    } catch {}
    const retryApi = await checkLoginViaApi();
    if (retryApi?.user) {
      logged = true;
      console.log(`\n✅ 로그인 감지 (쿠키+API): ${retryApi.user.email || retryApi.user.name || 'unknown'}`);
      break;
    }
  } else {
    process.stdout.write(`\r   ⏳ 로그인 대기 중... ${elapsed}s`);
  }
}

console.log('');
if (logged) {
  console.log('💾 쿠키 flush 중 (context.close)...');
  await ctx.close();
  console.log('✅ 완료. 이제 1000회 마라톤이 가능합니다.');
  process.exit(0);
} else {
  console.log(`⏰ 5분 대기 종료. 로그인 미감지 — 다시 시도해주세요.`);
  await ctx.close();
  process.exit(1);
}
