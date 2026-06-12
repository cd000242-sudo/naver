// SPEC-STABILITY-2026 Phase 6.5 — live tail-typing harness (release gate).
// Drives the app's COMPILED automation functions (dist/automation/*) against
// the real Naver editor. Verifies the rich-paste tail: divider / previous-post
// block (oglink card) / hashtags. It NEVER publishes — the draft stays open
// for human inspection, then the window closes itself.
//
// Run: npm run build && node scripts/harness/flow-tail-harness.cjs [mode]
//   mode = fullauto(기본) | continuous | multi
const puppeteer = require('puppeteer');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildMobileRichHtml,
  pasteRichHtmlAtCursor,
  ensureTailTypingReady,
} = require('../../dist/automation/richTextPaste.js');
const { safeKeyboardType } = require('../../dist/automation/typingUtils.js');
const {
  log, sleep, waitForLogin, findEditorFrame, closeDraftPopup,
  closeEditorPopups, countTailEvidence, resolveCookieFile,
} = require('./harness-lib.cjs');

const OUT_DIR = path.join(process.cwd(), 'tmp', 'tail-typing-live-test');
fs.mkdirSync(OUT_DIR, { recursive: true });
const SHOT = path.join(OUT_DIR, 'result.png');
const PROFILE_DIR = path.join(OUT_DIR, 'profile'); // persists login across runs

// ── Flow presets ─────────────────────────────────────────────────────────
// 풀오토: 설정 이전글 + CTA + 해시태그 (전체 꼬리)
// 연속:   체이닝 이전글(후킹+카드) + 해시태그 — 동일URL CTA는 S16에서 스킵됨
// 다중:   일반 CTA만 + 해시태그 (previousPostUrl 없는 플로우)
const MODE = (process.argv[2] || 'fullauto').toLowerCase();
const PRESETS = {
  fullauto:   { useCta: true,  usePrev: true,  label: '풀오토' },
  continuous: { useCta: false, usePrev: true,  label: '연속발행' },
  multi:      { useCta: true,  usePrev: false, label: '다중계정' },
};
const PRESET = PRESETS[MODE] || PRESETS.fullauto;

const HOOK_TEXT = '다른 인기글 보러가기!!';
const PREV_URL = 'https://blog.naver.com/leadernam-/224312673656';
const HASHTAGS = ['#애국가', '#무궁화', '#대한민국', '#광복절', '#한국'];
const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const BODY_TEXT = [
  '오늘은 애국가를 한 소절씩 따라 불러보는 날입니다.',
  '',
  '동해 물과 백두산이 마르고 닳도록',
  '하느님이 보우하사 우리나라 만세.',
  '',
  '무궁화 삼천리 화려 강산',
  '대한 사람 대한으로 길이 보전하세.',
  '',
  '광복절이 다가오면 무궁화가 더 귀하게 느껴집니다.',
  '대한민국의 하루하루를 응원합니다.',
].join('\n');

// Mirrors the app flow: the conclusion is a SEPARATE second rich paste — the
// exact scenario where the tail used to land ABOVE this final line.
const CONCLUSION_TEXT = [
  '오늘도 끝까지 읽어주셔서 감사합니다.',
  '',
  '꿀팁이 있다면 댓글로 알려주세요!',
].join('\n');

(async () => {
  log('🧭 하네스 모드: ' + PRESET.label + ' (' + MODE + ')');
  log('🚀 브라우저 실행 중... (앱과 동일한 시스템 Chrome, 로그인 유지 프로필)');
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    userDataDir: PROFILE_DIR,
    defaultViewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
  });
  const page = (await browser.pages())[0] || (await browser.newPage());

  try {
    try {
      const cookieFile = resolveCookieFile(fs, path);
      if (cookieFile && fs.existsSync(cookieFile)) {
        const parsed = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
        const cookies = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
        if (cookies.length > 0) {
          await page.setCookie(...cookies.map((c) => { const x = { ...c }; delete x.partitionKey; return x; }));
          log('🍪 앱 세션 쿠키 ' + cookies.length + '개 주입 (' + path.basename(path.dirname(cookieFile)) + ')');
        }
      }
    } catch (e) { log('⚠️ 쿠키 주입 실패: ' + e.message); }

    // Already logged in from a previous run? Skip straight to the editor.
    const existing = await page.cookies('https://naver.com').catch(() => []);
    if (!existing.some((c) => c.name === 'NID_AUT')) {
      await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'domcontentloaded', timeout: 60000 });
      log('🔐 열린 창에서 네이버 로그인을 해주세요 (최대 5분 대기 — 이번 1회만, 다음부터는 자동 유지)...');
      if (!(await waitForLogin(page, 5 * 60 * 1000))) {
        log('❌ 로그인 대기 시간 초과 — 종료합니다.');
        await browser.close();
        return;
      }
    } else {
      log('✅ 저장된 로그인 세션 재사용 — 로그인 단계 건너뜀');
    }
    log('✅ 로그인 확인! 글쓰기 에디터로 이동합니다...');

    await page.goto('https://blog.naver.com/GoBlogWrite.naver', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined);
    await sleep(3000);
    await closeDraftPopup(page);
    const frame = await findEditorFrame(page, 60000);
    if (!frame) {
      log('❌ 에디터 프레임을 찾지 못했습니다 — 종료합니다.');
      await page.screenshot({ path: SHOT, fullPage: true }).catch(() => undefined);
      await browser.close();
      return;
    }
    log('✅ 에디터 감지. 팝업 정리 중...');
    await closeEditorPopups(page, frame);

    // -- title --------------------------------------------------------------
    const titleHandle = await frame.$('.se-section-documentTitle .se-text-paragraph, .se-documentTitle .se-text-paragraph');
    if (titleHandle) {
      const box = await titleHandle.boundingBox().catch(() => null);
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(400);
      await safeKeyboardType(page, '애국가 한 소절, 오늘의 테스트 글', { delay: 15 });
      await sleep(300);
      await page.keyboard.press('Enter');
      await sleep(400);
      log('✅ 제목 입력 완료');
    } else {
      log('⚠️ 제목 영역을 못 찾음 — 본문부터 진행');
    }

    // -- body: the app's real rich paste ------------------------------------
    const rich = buildMobileRichHtml(BODY_TEXT, { fontSizePx: 19, highlight: true, maxChunkChars: 38 });
    const pasteResult = await pasteRichHtmlAtCursor(page, frame, rich.html, rich.plainText);
    log(`📋 리치 붙여넣기(본문): ok=${pasteResult.ok} (${pasteResult.beforeChars}→${pasteResult.afterChars}자, 사유=${pasteResult.reason || '-'})`);
    await page.keyboard.press('Enter');
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(500);

    // App-flow mirror: conclusion as a separate second paste.
    const richConclusion = buildMobileRichHtml(CONCLUSION_TEXT, { fontSizePx: 19, highlight: false, maxChunkChars: 38 });
    const conclusionResult = await pasteRichHtmlAtCursor(page, frame, richConclusion.html, richConclusion.plainText);
    log(`📋 리치 붙여넣기(마무리): ok=${conclusionResult.ok} (${conclusionResult.beforeChars}→${conclusionResult.afterChars}자)`);
    await page.keyboard.press('Enter');
    await sleep(300);
    await page.keyboard.press('Enter');
    await sleep(500);

    // -- TAIL: keyboard-only sequence ----------------------------------------
    // 붙여넣기 → 엔터5 → 줄긋기 → 엔터1 → 후킹 → 엔터1 → 링크 → 카드 대기 →
    // 엔터5 → 해시태그. NO mouse clicks: a click can land mid-paragraph and
    // drop the tail into the middle of the body.
    log('🧪 [핵심 테스트] 붙여넣기 소화 대기 + 키 입력 등록 검증 사다리');
    for (const mod of ['Control', 'Shift', 'Alt']) await page.keyboard.up(mod).catch(() => undefined);
    const ready = await ensureTailTypingReady(page, frame, log);
    log(ready ? '✅ 키보드 입력 검증 통과 (probe Enter 1회 포함)' : '⚠️ 키보드 복구 실패 — 그래도 진행');
    // probe Enter already consumed one — type the remaining four.
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Enter');
      await sleep(120);
    }
    await safeKeyboardType(page, SEPARATOR, { delay: 5 });
    await page.keyboard.press('Enter');
    if (PRESET.usePrev) await safeKeyboardType(page, HOOK_TEXT, { delay: 10 });
    await page.keyboard.press('Enter');
    if (PRESET.usePrev || PRESET.useCta) await safeKeyboardType(page, PREV_URL, { delay: 10 });
    await sleep(600); // let Naver recognize the URL before the trigger Enter
    await page.keyboard.press('Enter');
    // Naver converts a bare URL line into an oglink card a moment after the
    // trailing Enter. Give it a full settle window before judging.
    log('⏳ 링크 카드 생성 대기 (최대 18초)...');
    const waitForCard = async (ms) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        await sleep(750);
        const ev = await countTailEvidence(frame);
        if (ev && ev.linkCards > 0) return true;
      }
      return false;
    };
    const cardSeen = await waitForCard(18000);
    log(cardSeen ? '✅ 링크 카드 감지!' : '⚠️ 링크 카드 미감지 (URL 텍스트는 남아있을 수 있음)');

    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press('Enter');
      await sleep(150);
    }
    await safeKeyboardType(page, HASHTAGS.join(' '), { delay: 25 });
    await sleep(800);
    log('✅ 해시태그 타이핑 완료');

    // -- serialization forensics (2026-06-11 S13-2) ---------------------------
    const modelCheck = await frame.evaluate(() => {
      let root = null; { let bs = -1; document.querySelectorAll('[contenteditable="true"]').forEach((el) => { const s = el.querySelectorAll('.se-component').length * 100000 + (el.innerText || '').length; if (s > bs) { bs = s; root = el; } }); }
      if (!root) return null;
      const targets = { divider: '━━━━━', hook: '다른 인기글 보러가기', hashtag: '#애국가', sentinel: '￬' };
      const found = {};
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const txt = n.textContent || '';
        for (const [key, t] of Object.entries(targets)) {
          if (txt.includes(t) && !found[key]) {
            let depth = 0; let el = n.parentElement;
            const inComponent = !!(el && el.closest('.se-component'));
            while (el && el !== root) { depth += 1; el = el.parentElement; }
            found[key] = { inComponent, depth, parentTag: n.parentElement ? n.parentElement.tagName : '?' };
          }
        }
      }
      return found;
    }).catch(() => null);
    log('🔬 [직렬화 포렌식] ' + JSON.stringify(modelCheck));

    // -- verdict --------------------------------------------------------------
    const ev = await countTailEvidence(frame);
    const frameEl = await page.$('#mainFrame, iframe[name="mainFrame"]').catch(() => null);
    if (frameEl) {
      await frameEl.screenshot({ path: SHOT }).catch(() => undefined);
    } else {
      await page.screenshot({ path: SHOT, fullPage: true }).catch(() => undefined);
    }
    const tailText = await frame.evaluate(() => {
      const t = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
      return t.slice(-260);
    }).catch(() => '(읽기 실패)');
    log(`📄 본문 끝 260자: ...${tailText}`);
    if (ev) {
      log('──────── TAIL-TEST 결과 ────────');
      log(`본문(애국가)   : ${ev.anthem ? 'PASS' : 'FAIL'}`);
      log(`━ 구분선      : ${ev.dividers >= 1 ? `PASS (${ev.dividers}개)` : 'FAIL (0개)'}`);
      log(`후킹 문구     : ${ev.hook ? 'PASS' : 'FAIL'}`);
      log(`이전글 링크카드: ${ev.linkCards >= 1 ? `PASS (${ev.linkCards}개)` : 'FAIL (0개)'}`);
      log(`해시태그      : ${ev.hashtagFirst && ev.hashtagLast ? 'PASS (#애국가~#한국)' : 'FAIL'}`);
      log(`꼬리 위치(본문 뒤): ${ev.tailAfterBody ? 'PASS' : 'FAIL — 본문 중간 삽입!'}`);
      const allPass = ev.anthem && ev.dividers >= 1 && ev.hook && ev.linkCards >= 1 && ev.hashtagFirst && ev.hashtagLast && ev.tailAfterBody;
      log(allPass ? '🎉 TAIL-TEST: ALL PASS' : '❌ TAIL-TEST: 일부 FAIL — 스크린샷 확인');
      log(`📸 스크린샷: ${SHOT}`);
    } else {
      log('❌ 검증 단계에서 에디터 상태를 읽지 못했습니다.');
    }

    log('🛑 발행하지 않습니다. 에디터에서 직접 확인하세요 — 창은 3분 뒤 자동 종료됩니다.');
    await sleep(3 * 60 * 1000);
    await browser.close();
  } catch (error) {
    log(`❌ 하네스 오류: ${error.message}`);
    await page.screenshot({ path: SHOT, fullPage: true }).catch(() => undefined);
    await sleep(60 * 1000);
    await browser.close().catch(() => undefined);
  }
})();
