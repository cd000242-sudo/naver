/**
 * SPEC-CAFE-000 — Spike A2: 카페 에디터 DOM 구조 실증
 *
 * 실행: npm run build && npx ts-node scripts/spike/cafe-editor-dom.ts
 *
 * 전제:
 * - A1 (cafe-session-check.ts) PASS
 * - .env.spike에 TEST_CAFE_ID, TEST_BOARD_ID 설정 (매니저 권한 카페)
 *
 * 검증 항목:
 * 1. 카페 글쓰기 페이지 iframe 구조 (몇 단계 중첩, ID/name)
 * 2. #mainFrame 또는 동등 iframe 존재 여부
 * 3. 블로그 SmartEditor ONE 셀렉터 6개 매칭률
 * 4. 게시판 선택 UI DOM 구조
 *
 * 결과: 콘솔 + debug-dumps/*_SPIKE_A2_EDITOR_DOM_*/
 * → frames.html 파일에서 전체 DOM 확인 가능
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import 'dotenv/config';
import * as path from 'path';

async function main() {
  const naverId = process.env.NAVER_ID_SPIKE || process.env.NAVER_ID;
  const naverPassword = process.env.NAVER_PASSWORD_SPIKE || process.env.NAVER_PASSWORD;
  const testCafeId = process.env.TEST_CAFE_ID;
  const testBoardId = process.env.TEST_BOARD_ID || 'L';

  if (!naverId || !naverPassword || !testCafeId) {
    console.error('❌ 필수 환경변수 누락');
    console.error('   NAVER_ID_SPIKE, NAVER_PASSWORD_SPIKE, TEST_CAFE_ID');
    process.exit(1);
  }

  console.log('🐙 SPIKE A2: 카페 에디터 DOM 실증');
  console.log(`   테스트 카페: ${testCafeId}`);
  console.log(`   게시판: ${testBoardId}\n`);

  const { NaverBlogAutomation } = require(path.join(__dirname, '..', '..', 'dist', 'naverBlogAutomation.js'));

  const automation = new NaverBlogAutomation(
    { naverId, naverPassword },
    (msg: string) => console.log('  ' + msg)
  );

  try {
    await automation.setupBrowser();
    await automation.loginToNaver();
    const page = (automation as any).page;

    // ━━━ 카페 글쓰기 페이지 진입 ━━━
    const writeUrl = `https://cafe.naver.com/${testCafeId}/ArticleWrite.nhn?boardtype=${testBoardId}`;
    console.log(`\n📍 진입: ${writeUrl}`);
    await page.goto(writeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 5000)); // 에디터 로딩 대기

    // ━━━ Step 1: 프레임 구조 덤프 ━━━
    console.log('\n📍 Step 1: 프레임 구조');
    const frames = page.frames();
    console.log(`  총 프레임: ${frames.length}개`);
    for (const f of frames) {
      console.log(`  - name="${f.name()}" url="${f.url().substring(0, 80)}..."`);
    }

    // ━━━ Step 2: #mainFrame 존재 확인 ━━━
    console.log('\n📍 Step 2: #mainFrame 탐지');
    let mainFrame = frames.find((f: any) => f.name() === 'mainFrame');
    if (!mainFrame) {
      mainFrame = frames.find((f: any) => {
        const url = f.url();
        return url.includes('cafe.naver.com') && url.includes('ArticleWrite');
      });
    }

    if (mainFrame) {
      console.log(`  ✅ mainFrame 발견: ${mainFrame.name()}`);
    } else {
      console.log('  ❌ mainFrame 없음 — 다른 ID/구조일 수 있음');
    }

    // ━━━ Step 3: 셀렉터 매칭 (메인 프레임 기준) ━━━
    console.log('\n📍 Step 3: 블로그 셀렉터 매칭률');
    const targetFrame = mainFrame || page;
    const selectorCheck = await targetFrame.evaluate(() => {
      const selectors = {
        '.se-main-container': false,
        '.se-section-text': false,
        '.se-text-paragraph': false,
        '.se-editing-area': false,
        '[contenteditable="true"]': false,
        '.se-component': false,
        '.cafe-editor': false,
        'textarea[name="content"]': false,
        'select[name="menu"]': false, // 게시판 선택
        'select[name="bulletinType"]': false,
      };
      for (const s of Object.keys(selectors)) {
        (selectors as any)[s] = !!document.querySelector(s);
      }
      return selectors;
    }).catch((e: Error) => ({ error: e.message }));

    console.log('  셀렉터 매칭:');
    let matchCount = 0;
    let totalCount = 0;
    for (const [sel, exists] of Object.entries(selectorCheck)) {
      if (sel === 'error') continue;
      totalCount++;
      if (exists) matchCount++;
      console.log(`    ${exists ? '✅' : '❌'} ${sel}`);
    }
    const matchRate = totalCount > 0 ? Math.round((matchCount / totalCount) * 100) : 0;
    console.log(`\n  매칭률: ${matchCount}/${totalCount} (${matchRate}%)`);

    // ━━━ Step 4: 게시판 선택 UI 분석 ━━━
    console.log('\n📍 Step 4: 게시판 선택 UI');
    const boardUI = await targetFrame.evaluate(() => {
      const select = document.querySelector('select[name="menu"], select[name="bulletinType"], select[id*="board"]') as HTMLSelectElement | null;
      if (select) {
        return {
          type: 'native-select',
          name: select.name || select.id,
          options: Array.from(select.options).slice(0, 10).map(o => ({ value: o.value, text: o.text })),
          count: select.options.length,
        };
      }
      // 커스텀 드롭다운 탐색
      const custom = document.querySelector('[class*="board_select"], [class*="BoardSelect"], [class*="menu_select"]');
      if (custom) {
        return {
          type: 'custom-dropdown',
          html: custom.outerHTML.substring(0, 500),
        };
      }
      return { type: 'not-found' };
    }).catch((e: Error) => ({ error: e.message }));
    console.log(`  타입: ${(boardUI as any).type}`);
    if ((boardUI as any).options) {
      console.log(`  옵션 개수: ${(boardUI as any).count}`);
      console.log('  샘플 옵션:');
      for (const opt of (boardUI as any).options.slice(0, 5)) {
        console.log(`    - ${opt.value}: ${opt.text}`);
      }
    }

    // ━━━ Step 5: 전체 덤프 ━━━
    console.log('\n📍 Step 5: 자동 DOM 덤프');
    const { dumpFailure } = require(path.join(__dirname, '..', '..', 'dist', 'debug', 'domDumpManager.js'));
    const dumpResult = await dumpFailure(page, {
      action: 'SPIKE_A2_EDITOR_DOM',
      accountId: naverId,
      context: {
        cafeId: testCafeId,
        boardId: testBoardId,
        frameCount: frames.length,
        mainFrameFound: !!mainFrame,
        matchRate,
        selectorCheck,
        boardUI,
      },
    });
    console.log(`  ${dumpResult.success ? '✅' : '❌'} ${dumpResult.dumpPath || dumpResult.error}`);

    // ━━━ 최종 판정 ━━━
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎯 A2 VERDICT:');
    let verdict: 'PASS' | 'PARTIAL' | 'FAIL';
    if (mainFrame && matchRate >= 50) {
      verdict = 'PASS';
      console.log('   ✅ PASS — editorHelpers 대부분 재사용 가능');
    } else if (mainFrame && matchRate >= 20) {
      verdict = 'PARTIAL';
      console.log('   🟡 PARTIAL — cafeEditorHelpers 신규 작성 필요 (+1~2일)');
    } else {
      verdict = 'FAIL';
      console.log('   ❌ FAIL — 카페 에디터 재설계 필요 (+3~5일)');
    }
    console.log(`   mainFrame: ${!!mainFrame}`);
    console.log(`   매칭률: ${matchRate}%`);
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
