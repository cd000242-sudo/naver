/**
 * SPEC-CAFE-000 — Spike A3: 게시판 목록 API 실증
 *
 * 실행: npm run build && npx ts-node scripts/spike/cafe-api-check.ts
 *
 * 전제:
 * - A1 PASS
 * - TEST_CAFE_ID 설정
 *
 * 검증 항목:
 * 1. apis.naver.com/cafe-web/cafe2/CafeMenuList.json 응답 코드
 * 2. 필요한 헤더/쿠키
 * 3. 응답 body 구조 (menus 배열 형식)
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import 'dotenv/config';
import * as path from 'path';

async function main() {
  const naverId = process.env.NAVER_ID_SPIKE || process.env.NAVER_ID;
  const naverPassword = process.env.NAVER_PASSWORD_SPIKE || process.env.NAVER_PASSWORD;
  const testCafeId = process.env.TEST_CAFE_ID;

  if (!naverId || !naverPassword || !testCafeId) {
    console.error('❌ NAVER_ID_SPIKE, NAVER_PASSWORD_SPIKE, TEST_CAFE_ID 필요');
    process.exit(1);
  }

  console.log('🐙 SPIKE A3: 게시판 API 실증');
  console.log(`   테스트 카페: ${testCafeId}\n`);

  const { NaverBlogAutomation } = require(path.join(__dirname, '..', '..', 'dist', 'naverBlogAutomation.js'));
  const automation = new NaverBlogAutomation({ naverId, naverPassword }, (m: string) => console.log('  ' + m));

  try {
    await automation.setupBrowser();
    await automation.loginToNaver();
    const page = (automation as any).page;

    // 먼저 카페 메인 방문해서 Referer 정합성 확보
    console.log('\n📍 Step 1: 카페 메인 방문 (Referer 설정)');
    await page.goto(`https://cafe.naver.com/${testCafeId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    // ━━━ API 호출 (브라우저 내부 fetch) ━━━
    console.log('\n📍 Step 2: CafeMenuList.json API 호출');
    const apiResults: any[] = [];

    // 여러 엔드포인트 시도
    const endpoints = [
      `https://apis.naver.com/cafe-web/cafe2/CafeMenuList.json?cafeId=${testCafeId}`,
      `https://apis.naver.com/cafe-web/cafe2/CafeMenuListV2.json?cafeId=${testCafeId}`,
      `https://cafe.naver.com/CafeMenuList.nhn?clubid=${testCafeId}`,
    ];

    for (const url of endpoints) {
      console.log(`\n  URL: ${url}`);
      const result = await page.evaluate(async (apiUrl: string, cafeId: string) => {
        try {
          const res = await fetch(apiUrl, {
            credentials: 'include',
            headers: {
              'Referer': `https://cafe.naver.com/${cafeId}`,
              'Accept': 'application/json, text/plain, */*',
              'X-Requested-With': 'XMLHttpRequest',
            },
          });
          const text = await res.text();
          return {
            status: res.status,
            ok: res.ok,
            contentType: res.headers.get('content-type'),
            bodyLength: text.length,
            bodyPreview: text.substring(0, 500),
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      }, url, testCafeId);

      apiResults.push({ url, result });

      if ((result as any).status) {
        console.log(`    Status: ${(result as any).status}`);
        console.log(`    Content-Type: ${(result as any).contentType}`);
        console.log(`    Body length: ${(result as any).bodyLength}`);
        if ((result as any).ok) {
          console.log(`    Preview: ${(result as any).bodyPreview?.substring(0, 300)}...`);
        }
      } else {
        console.log(`    Error: ${(result as any).error}`);
      }
    }

    // ━━━ 덤프 ━━━
    console.log('\n📍 Step 3: 자동 덤프');
    const { dumpFailure } = require(path.join(__dirname, '..', '..', 'dist', 'debug', 'domDumpManager.js'));
    const dumpResult = await dumpFailure(page, {
      action: 'SPIKE_A3_API_CHECK',
      accountId: naverId,
      context: {
        cafeId: testCafeId,
        apiResults,
      },
    });
    console.log(`  ${dumpResult.success ? '✅' : '❌'} ${dumpResult.dumpPath || dumpResult.error}`);

    // ━━━ 판정 ━━━
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 A3 VERDICT:');
    const successfulEndpoint = apiResults.find(r => (r.result as any)?.ok);
    if (successfulEndpoint) {
      console.log('   ✅ PASS — API 응답 200 확인');
      console.log(`   성공 endpoint: ${successfulEndpoint.url}`);
      console.log('   → 게시판 자동 크롤링 가능');
    } else {
      const hasAuth = apiResults.some(r => [401, 403].includes((r.result as any)?.status));
      if (hasAuth) {
        console.log('   🟡 TOKEN_REQUIRED — 추가 토큰 필요');
        console.log('   → events.log에서 실제 헤더 분석 후 토큰 추출');
      } else {
        console.log('   ❌ FAIL — API 접근 불가');
        console.log('   → 사용자 수동 게시판 입력 UI 필요');
      }
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ 스파이크 실패:', (error as Error).message);
    process.exit(1);
  } finally {
    try { await automation.closeBrowser(); } catch {}
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
