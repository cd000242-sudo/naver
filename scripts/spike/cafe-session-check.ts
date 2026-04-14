/**
 * SPEC-CAFE-000 — Spike A1: 블로그 로그인 세션이 cafe.naver.com에서 재사용 가능한지 실증
 *
 * 실행: npm run build && npx ts-node scripts/spike/cafe-session-check.ts
 *
 * 전제: .env.spike 파일에 NAVER_ID_SPIKE, NAVER_PASSWORD_SPIKE 설정
 *
 * 검증 항목:
 * 1. NID_AUT 쿠키의 domain이 '.naver.com'인가 (와일드카드 공유 가능)
 * 2. cafe.naver.com 메인 페이지 진입 시 로그인 상태 유지되는가
 * 3. 카페 관련 DOM이 로그인 상태로 렌더링되는가
 *
 * 결과: 콘솔 로그 + %APPDATA%/BetterLifeNaver/debug-dumps/*_SPIKE_A1_*/
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  const naverId = process.env.NAVER_ID_SPIKE || process.env.NAVER_ID;
  const naverPassword = process.env.NAVER_PASSWORD_SPIKE || process.env.NAVER_PASSWORD;

  if (!naverId || !naverPassword) {
    console.error('❌ NAVER_ID_SPIKE, NAVER_PASSWORD_SPIKE 환경변수 필요');
    console.error('   또는 .env에 NAVER_ID, NAVER_PASSWORD 설정');
    process.exit(1);
  }

  console.log(`🐙 SPIKE A1: 세션 재사용 실증 시작`);
  console.log(`   계정: ${naverId.substring(0, 3)}***`);
  console.log('');

  // dist/ 빌드 결과 사용 (TS 직접 실행 시 electron import 문제 회피)
  const { NaverBlogAutomation } = require(path.join(__dirname, '..', '..', 'dist', 'naverBlogAutomation.js'));

  const automation = new NaverBlogAutomation(
    { naverId, naverPassword },
    (msg: string) => console.log('  ' + msg)
  );

  try {
    // ━━━ Step 1: 브라우저 시작 + 네이버 로그인 ━━━
    console.log('📍 Step 1: 브라우저 시작 + 네이버 로그인...');
    await automation.setupBrowser();
    await automation.loginToNaver();
    console.log('  ✅ 로그인 완료\n');

    const page = (automation as any).page;
    if (!page) throw new Error('page가 없음');

    // ━━━ Step 2: cafe.naver.com 방문 ━━━
    console.log('📍 Step 2: cafe.naver.com 진입...');
    await page.goto('https://cafe.naver.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000)); // 네트워크 안정화

    const currentUrl = page.url();
    console.log(`  현재 URL: ${currentUrl}`);

    // ━━━ Step 3: 로그인 상태 DOM 확인 ━━━
    console.log('\n📍 Step 3: 로그인 상태 확인...');
    const loginStatus = await page.evaluate(() => {
      // 가능한 로그인 DOM 셀렉터
      const selectors = [
        '.gnb_my_name',
        '.gnb_name',
        '[class*="MyView"]',
        '.gnb_my',
        'a[href*="logout"]',
        '#gnb_logout_button',
      ];
      const results: Record<string, string | null> = {};
      for (const s of selectors) {
        const el = document.querySelector(s);
        results[s] = el ? ((el as HTMLElement).innerText || 'exists').substring(0, 50) : null;
      }
      return results;
    }).catch((e: Error) => ({ error: e.message }));
    console.log('  DOM 체크 결과:');
    console.log('  ' + JSON.stringify(loginStatus, null, 2).replace(/\n/g, '\n  '));

    const isLoggedIn = Object.values(loginStatus).some(v => v && v !== null && typeof v === 'string');
    console.log(`\n  ${isLoggedIn ? '✅' : '❌'} 로그인 상태: ${isLoggedIn ? 'YES' : 'NO'}`);

    // ━━━ Step 4: NID_AUT 쿠키 domain 확인 ━━━
    console.log('\n📍 Step 4: NID_AUT 쿠키 확인...');
    const cookies = await page.cookies('https://cafe.naver.com', 'https://www.naver.com', 'https://nid.naver.com');
    const nidAut = cookies.find((c: any) => c.name === 'NID_AUT');
    const nidSes = cookies.find((c: any) => c.name === 'NID_SES');

    if (nidAut) {
      console.log(`  NID_AUT domain: ${nidAut.domain}`);
      console.log(`  NID_AUT length: ${nidAut.value?.length}`);
      console.log(`  NID_AUT expires: ${nidAut.expires > 0 ? new Date(nidAut.expires * 1000).toISOString() : 'session'}`);
    } else {
      console.log('  ❌ NID_AUT 쿠키 없음!');
    }

    if (nidSes) {
      console.log(`  NID_SES domain: ${nidSes.domain}`);
    } else {
      console.log('  ⚠️  NID_SES 쿠키 없음');
    }

    // ━━━ Step 5: 전체 덤프 ━━━
    console.log('\n📍 Step 5: 자동 DOM 덤프 저장...');
    const { dumpFailure } = require(path.join(__dirname, '..', '..', 'dist', 'debug', 'domDumpManager.js'));
    const dumpResult = await dumpFailure(page, {
      action: 'SPIKE_A1_SESSION_CHECK',
      accountId: naverId,
      context: {
        cafeUrl: currentUrl,
        isLoggedIn,
        nidAutDomain: nidAut?.domain,
        nidSesDomain: nidSes?.domain,
        loginStatus,
      },
    });

    if (dumpResult.success) {
      console.log(`  ✅ 덤프 저장: ${dumpResult.dumpPath}`);
    } else {
      console.log(`  ❌ 덤프 저장 실패: ${dumpResult.error}`);
    }

    // ━━━ 최종 판정 ━━━
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 A1 VERDICT:');

    const nidDomainOk = nidAut?.domain === '.naver.com' || nidAut?.domain === 'naver.com';
    const verdict = isLoggedIn && nidDomainOk ? 'PASS' : 'FAIL';
    console.log(`   Result: ${verdict}`);
    console.log(`   로그인 유지: ${isLoggedIn ? 'YES' : 'NO'}`);
    console.log(`   NID_AUT domain OK: ${nidDomainOk ? 'YES (' + nidAut?.domain + ')' : 'NO (' + (nidAut?.domain || 'missing') + ')'}`);

    if (verdict === 'PASS') {
      console.log('\n   ✅ A1 통과 — 블로그 세션 재사용 가능');
      console.log('   → Next: A2 (cafe-editor-dom.ts) 실행');
    } else {
      console.log('\n   ❌ A1 실패 — cafeLoginFlow.ts 작성 필요');
      console.log('   → SPEC-CAFE-000 재검토');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ 스파이크 실패:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    try {
      await automation.closeBrowser();
    } catch {}
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
