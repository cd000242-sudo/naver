/**
 * 네이버 블로그 에디터 "장소(지도)" 셀렉터 채집 스크립트 (v2)
 *
 * 변경점:
 *   - persistent context 사용 → 한 번 로그인하면 유지
 *   - 모든 프레임(중첩 포함)에 클릭 레코더 1초마다 재주입
 *   - 클릭 발생 시 즉시 JSON 저장
 *
 * 사용법: node scripts/capture-naver-place-selectors.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RESULT_PATH = path.join(__dirname, '..', 'capture-result.json');
const USER_DATA_DIR = path.join(__dirname, '..', '.capture-userdata');

const INSPECTOR = `
(() => {
  if (window.__captureArmed) return;
  window.__captureArmed = true;
  window.__captured = window.__captured || [];
  const dump = (el) => {
    if (!el) return null;
    const attrs = {};
    for (const a of el.attributes) attrs[a.name] = a.value;
    const path = (() => {
      const parts = [];
      let cur = el;
      while (cur && cur.nodeType === 1 && parts.length < 8) {
        let seg = cur.tagName.toLowerCase();
        if (cur.id) { seg += '#' + cur.id; parts.unshift(seg); break; }
        if (cur.className && typeof cur.className === 'string') {
          seg += '.' + cur.className.trim().split(/\\s+/).slice(0, 3).join('.');
        }
        parts.unshift(seg);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    })();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: (typeof el.className === 'string') ? el.className : null,
      attrs,
      ariaLabel: el.getAttribute && el.getAttribute('aria-label'),
      dataName: el.getAttribute && el.getAttribute('data-name'),
      text: (el.innerText || el.textContent || '').trim().slice(0, 80),
      outerHTML: (el.outerHTML || '').slice(0, 800),
      path,
    };
  };
  document.addEventListener('click', (e) => {
    try {
      const target = dump(e.target);
      // climb 3 ancestors for context
      const ancestors = [];
      let cur = e.target.parentElement;
      for (let i = 0; i < 3 && cur; i++) { ancestors.push(dump(cur)); cur = cur.parentElement; }
      window.__captured.push({ at: Date.now(), target, ancestors });
    } catch (err) {}
  }, true);
})();
`;

(async () => {
  if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || await context.newPage();

  const result = { steps: [], capturedAt: new Date().toISOString() };
  const save = () => fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8');
  save();

  console.log('\n========================================');
  console.log(' 네이버 장소 셀렉터 채집 v2');
  console.log('========================================\n');
  console.log('[1] 로그인 안 되어있으면 네이버 로그인 (한 번만 — 다음부터는 유지)');

  await page.goto('https://www.naver.com/').catch(() => {});

  // Wait until user is on a page that's not nid.naver
  console.log('[2] 로그인 완료되면 블로그 글쓰기 페이지로 자동 이동합니다 (10초 대기)');
  await page.waitForTimeout(10000);

  // Try to detect blog ID from gnb
  let blogId = null;
  try {
    blogId = await page.evaluate(() => {
      const a = document.querySelector('a[href*="blog.naver.com/"]');
      if (a) {
        const m = a.href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
        if (m) return m[1];
      }
      return null;
    });
  } catch {}

  if (blogId) {
    const writeUrl = `https://blog.naver.com/${blogId}?Redirect=Write`;
    console.log('[자동 이동]', writeUrl);
    await page.goto(writeUrl).catch(() => {});
  } else {
    console.log('[!] 블로그 ID 자동 감지 실패. 직접 글쓰기 페이지로 가주세요.');
  }

  console.log('\n[3] 클릭 레코더가 1초마다 모든 프레임에 재주입됩니다.');
  console.log('    아래 순서로 천천히 클릭해주세요:\n');
  console.log('    ① 툴바 "장소" 버튼');
  console.log('    ② 장소 패널 검색창 클릭 + 업체명 입력 + Enter');
  console.log('    ③ 검색 결과 첫 번째 카드');
  console.log('    ④ "추가" 버튼');
  console.log('    ⑤ 본문에 삽입된 지도 블록\n');
  console.log('각 클릭마다 capture-result.json 에 즉시 저장됩니다.');
  console.log('완료되면 터미널에서 Ctrl+C\n');

  // Auto-watch any new page/tab opened in this context
  context.on('page', (p) => {
    console.log(`[+page] ${p.url()}`);
    p.on('framenavigated', (f) => {
      if (f === p.mainFrame()) console.log(`[nav] ${f.url()}`);
    });
  });

  let tickCount = 0;
  setInterval(async () => {
    tickCount++;
    const pages = context.pages();
    // Re-inject inspector into all frames of all pages
    for (const p of pages) {
      for (const frame of p.frames()) {
        try { await frame.evaluate(INSPECTOR); } catch {}
      }
    }
    // Collect captured clicks from all pages
    const all = [];
    for (const p of pages) {
      for (const frame of p.frames()) {
        try {
          const clicks = await frame.evaluate(() => {
            const c = window.__captured || [];
            window.__captured = [];
            return c;
          });
          if (clicks && clicks.length) {
            for (const c of clicks) all.push({ pageUrl: p.url(), frameUrl: frame.url(), ...c });
          }
        } catch {}
      }
    }
    if (all.length) {
      result.steps.push(...all);
      save();
      console.log(`[${new Date().toLocaleTimeString()}] +${all.length} click(s) saved (total ${result.steps.length})`);
      for (const c of all) {
        console.log(`  → tag=${c.target?.tag} class="${c.target?.className}" text="${c.target?.text?.slice(0,40)}" aria="${c.target?.ariaLabel || ''}"`);
      }
    }
    if (tickCount % 10 === 0) {
      const totalFrames = pages.reduce((n, p) => n + p.frames().length, 0);
      console.log(`[heartbeat] pages=${pages.length} frames=${totalFrames}`);
      for (const p of pages) console.log(`   - ${p.url()}`);
    }
  }, 1000);

  await new Promise(() => {});
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
