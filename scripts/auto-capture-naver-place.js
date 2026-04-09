/**
 * 네이버 블로그 에디터 "장소(지도)" 셀렉터 자동 채집
 *
 * 동작:
 *   - persistent context (.capture-userdata) 의 로그인 쿠키 사용
 *   - blog.naver.com 으로 가서 blogId 자동 감지
 *   - 글쓰기 페이지 진입 → 에디터 iframe 탐색
 *   - 장소 버튼 자동 클릭 → 검색 → 첫 카드 → 추가 → 지도 블록
 *   - 각 단계마다 element 정보를 capture-result.json 에 즉시 저장
 *   - 실패해도 가능한 만큼 덤프하고, 디버깅용으로 모든 frame URL/HTML 도 저장
 *
 * 사용법: node scripts/auto-capture-naver-place.js [검색어]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RESULT_PATH = path.join(__dirname, '..', 'capture-result.json');
const USER_DATA_DIR = path.join(__dirname, '..', '.capture-userdata');
const SEARCH_TERM = process.argv[2] || '스타벅스 강남';

const DUMP_SRC = `
(el) => {
  if (!el) return null;
  const attrs = {};
  for (const a of el.attributes) attrs[a.name] = a.value;
  const buildPath = (e) => {
    const parts = [];
    let cur = e;
    while (cur && cur.nodeType === 1 && parts.length < 10) {
      let seg = cur.tagName.toLowerCase();
      if (cur.id) { seg += '#' + cur.id; parts.unshift(seg); break; }
      if (cur.className && typeof cur.className === 'string' && cur.className.trim()) {
        seg += '.' + cur.className.trim().split(/\\s+/).slice(0, 4).join('.');
      }
      parts.unshift(seg);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    className: (typeof el.className === 'string') ? el.className : null,
    attrs,
    ariaLabel: el.getAttribute && el.getAttribute('aria-label'),
    dataName: el.getAttribute && el.getAttribute('data-name'),
    text: (el.innerText || el.textContent || '').trim().slice(0, 120),
    outerHTML: (el.outerHTML || '').slice(0, 1200),
    path: buildPath(el),
  };
}
`;

const result = { steps: [], frames: [], capturedAt: new Date().toISOString(), searchTerm: SEARCH_TERM };
function save(label, data) {
  result.steps.push({ label, ts: Date.now(), ...data });
  fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[SAVED] ${label}`);
}
function fail(label, err) {
  result.steps.push({ label, ts: Date.now(), error: String(err && err.message || err) });
  fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[FAIL ] ${label}: ${err && err.message || err}`);
}

async function dumpFramesSnapshot(page, label) {
  const list = [];
  for (const f of page.frames()) {
    let html = '';
    try {
      html = await f.evaluate(() => document.documentElement.outerHTML.slice(0, 4000));
    } catch {}
    list.push({ url: f.url(), name: f.name(), htmlSnippet: html });
  }
  result.frames.push({ label, ts: Date.now(), pageUrl: page.url(), frames: list });
  fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8');
}

// Find frame containing element matching predicate
async function findFrameWith(page, jsTest, label, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const f of page.frames()) {
      try {
        const ok = await f.evaluate(jsTest);
        if (ok) return f;
      } catch {}
    }
    await page.waitForTimeout(500);
  }
  await dumpFramesSnapshot(page, `frame-not-found:${label}`);
  throw new Error(`frame with ${label} not found in ${timeoutMs}ms`);
}

// Find element across all frames in page (first match)
async function findInAnyFrame(page, jsExpr) {
  for (const f of page.frames()) {
    try {
      const found = await f.evaluate(jsExpr);
      if (found) return { frame: f, value: found };
    } catch {}
  }
  return null;
}

(async () => {
  console.log('========================================');
  console.log(' 네이버 장소 셀렉터 자동 채집');
  console.log('========================================');
  console.log('search term:', SEARCH_TERM);
  fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2), 'utf8');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || await context.newPage();

  // Track all new pages/popups
  const allPages = new Set([page]);
  context.on('page', (p) => {
    allPages.add(p);
    console.log(`[+page] ${p.url()}`);
    p.on('close', () => allPages.delete(p));
  });

  // Step 0: detect blogId from www.naver.com my-area
  console.log('[0] navigating to https://www.naver.com/ to detect blogId...');
  try {
    await page.goto('https://www.naver.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    fail('goto:naver', e);
  }
  await page.waitForTimeout(3000);

  let blogId = null;
  // Strategy A: read MyView blog link in the right-panel "내가 자주 가는" area
  try {
    blogId = await page.evaluate(() => {
      // The myView 블로그 link
      const links = Array.from(document.querySelectorAll('a[href*="blog.naver.com/"]'));
      // Filter to exclude reserved paths and pick the first plain /{userid} link
      const RESERVED = ['PostList','PostView','PostWriteForm','section','recommend','prologue','market','connect','widget','BlogHome','BuddyManage','MyBlog','LikeListShow'];
      for (const a of links) {
        const m = a.href.match(/^https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/?(?:[?#]|$)/);
        if (m && !RESERVED.includes(m[1]) && !m[1].endsWith('.naver')) return m[1];
      }
      return null;
    });
  } catch {}

  // Strategy B: navigate to /MyBlog.naver which 302s to /{blogId}
  if (!blogId) {
    console.log('[0] strategy A failed, trying /MyBlog.naver redirect...');
    try {
      await page.goto('https://blog.naver.com/MyBlog.naver', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const m = page.url().match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)(?:[\?\/#]|$)/);
      if (m && !['PostList','PostView','PostWriteForm','section','recommend','prologue','MyBlog'].includes(m[1]) && !m[1].endsWith('.naver')) {
        blogId = m[1];
      }
    } catch {}
  }

  // Strategy C: navigate to /PostList.naver which redirects similarly
  if (!blogId) {
    console.log('[0] strategy B failed, trying /PostList.naver redirect...');
    try {
      await page.goto('https://blog.naver.com/PostList.naver', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const m = page.url().match(/[?&]blogId=([a-zA-Z0-9_-]+)/) || page.url().match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)(?:[\?\/#]|$)/);
      if (m && !['PostList','PostView','PostWriteForm','section','recommend','prologue'].includes(m[1]) && !m[1].endsWith('.naver')) {
        blogId = m[1];
      }
    } catch {}
  }

  console.log('[0] detected blogId =', blogId);
  save('blog_id', { blogId, currentUrl: page.url() });
  if (!blogId) {
    await dumpFramesSnapshot(page, 'no-blog-id');
    console.error('[0] FATAL: cannot detect blog ID. Login may have expired.');
    await context.close();
    process.exit(1);
  }

  // Step 1: open write page
  const writeUrl = `https://blog.naver.com/${blogId}?Redirect=Write`;
  console.log('[1] opening:', writeUrl);
  try {
    await page.goto(writeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    fail('goto:write', e);
  }
  await page.waitForTimeout(6000);
  console.log('[1] settled. pages =', context.pages().length);
  for (const p of context.pages()) console.log('     -', p.url());

  // Pick the page that looks like the editor
  let editorPage = null;
  for (const p of context.pages()) {
    if (p.url().includes('PostWriteForm') || p.url().includes('Write') || p.url().includes('blog.naver.com')) {
      editorPage = p;
    }
  }
  editorPage = editorPage || page;
  console.log('[1] editorPage =', editorPage.url());
  await editorPage.bringToFront().catch(() => {});

  // Sometimes write page redirects to a popup. Wait for editor frame.
  await editorPage.waitForTimeout(3000);
  console.log('[1] frames in editorPage:');
  for (const f of editorPage.frames()) console.log('     -', f.url());

  await dumpFramesSnapshot(editorPage, 'after-open-write');

  // Step 2: dismiss any 임시저장/팝업 dialogs
  console.log('[2] dismissing draft/help popups (best-effort)...');
  for (const p of context.pages()) {
    for (const f of p.frames()) {
      try {
        await f.evaluate(() => {
          // 작성중이던 글이 있어요 → "취소"
          const btns = Array.from(document.querySelectorAll('button'));
          for (const b of btns) {
            const t = (b.textContent || '').trim();
            if (t === '취소' || t === '닫기' || t === '나가기' || t === '확인') {
              // Only click 취소/닫기 to be safe
              if (t === '취소' || t === '닫기') b.click();
            }
          }
          // Also any 헬프 닫기 X buttons
          document.querySelectorAll('[class*="se-help"] [class*="close"], button[class*="se-help-panel-close"]').forEach(e => {
            try { e.click(); } catch {}
          });
        });
      } catch {}
    }
  }
  await editorPage.waitForTimeout(1500);

  // Step 3: find toolbar 장소 button across all frames in all pages
  console.log('[3] searching for 장소 button in any frame of any page...');
  let placeFrame = null;
  let placeBtn = null;
  outer: for (let attempt = 0; attempt < 30; attempt++) {
    for (const p of context.pages()) {
      for (const f of p.frames()) {
        try {
          const found = await f.evaluate(() => {
            // candidates
            const sels = [
              'button[aria-label*="장소"]',
              'button[data-name="map"]',
              'button[data-type="map"]',
              'button.se-map-toolbar-button',
              'button[class*="map"]',
            ];
            for (const s of sels) {
              const el = document.querySelector(s);
              if (el && el.offsetParent !== null) return s;
            }
            // text-based
            const all = Array.from(document.querySelectorAll('button, a'));
            for (const el of all) {
              const t = (el.textContent || '').trim();
              const al = el.getAttribute('aria-label') || '';
              if ((t === '장소' || al === '장소' || al.includes('장소')) && el.offsetParent !== null) {
                return 'text-match';
              }
            }
            return null;
          });
          if (found) {
            placeFrame = f;
            console.log(`[3] found 장소 button via "${found}" in frame: ${f.url()}`);
            break outer;
          }
        } catch {}
      }
    }
    if (attempt === 0 || attempt === 10 || attempt === 20) {
      console.log(`[3] attempt ${attempt+1}/30 ... pages=${context.pages().length}`);
    }
    await editorPage.waitForTimeout(1000);
  }

  if (!placeFrame) {
    fail('find:place_button', 'not found in any frame');
    await dumpFramesSnapshot(editorPage, 'place-button-not-found');
    console.error('[3] FATAL. dumped all frame snapshots.');
    console.log('keeping browser open 60s for manual inspection...');
    await editorPage.waitForTimeout(60000);
    await context.close();
    process.exit(1);
  }

  // Capture place button info
  try {
    placeBtn = await placeFrame.evaluate(`(${DUMP_SRC})(
      document.querySelector('button[aria-label*="장소"]')
      || document.querySelector('button[data-name="map"]')
      || Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').trim()==='장소' || (b.getAttribute('aria-label')||'').includes('장소'))
    )`);
    save('place_button', { frameUrl: placeFrame.url(), element: placeBtn });
  } catch (e) {
    fail('dump:place_button', e);
  }

  // Click it
  console.log('[3] clicking 장소 button...');
  try {
    await placeFrame.evaluate(`(
      document.querySelector('button[aria-label*="장소"]')
      || document.querySelector('button[data-name="map"]')
      || Array.from(document.querySelectorAll('button')).find(b => (b.textContent||'').trim()==='장소' || (b.getAttribute('aria-label')||'').includes('장소'))
    ).click()`);
  } catch (e) {
    fail('click:place_button', e);
  }
  await editorPage.waitForTimeout(2500);
  await dumpFramesSnapshot(editorPage, 'after-click-place-button');

  // Step 4: find search input in place panel
  console.log('[4] searching for place search input...');
  let panelFrame = null;
  let searchSel = null;
  outer2: for (let attempt = 0; attempt < 20; attempt++) {
    for (const p of context.pages()) {
      for (const f of p.frames()) {
        try {
          const found = await f.evaluate(() => {
            const sels = [
              'input[placeholder*="장소"]',
              'input[placeholder*="검색"]',
              'input[aria-label*="장소"]',
              'input.se-map-search-input',
              'input[type="search"]',
              'input[type="text"][class*="map"]',
              'input[type="text"][class*="search"]',
            ];
            for (const s of sels) {
              const el = document.querySelector(s);
              if (el && el.offsetParent !== null) return s;
            }
            return null;
          });
          if (found) { panelFrame = f; searchSel = found; break outer2; }
        } catch {}
      }
    }
    await editorPage.waitForTimeout(500);
  }

  if (!panelFrame) {
    fail('find:search_input', 'not found');
    await dumpFramesSnapshot(editorPage, 'search-input-not-found');
  } else {
    console.log(`[4] found search input via "${searchSel}" in frame ${panelFrame.url()}`);
    try {
      const dump = await panelFrame.evaluate(`(${DUMP_SRC})(document.querySelector(${JSON.stringify(searchSel)}))`);
      save('search_input', { frameUrl: panelFrame.url(), selector: searchSel, element: dump });
    } catch (e) { fail('dump:search_input', e); }

    // Type the search term
    try {
      await panelFrame.evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(searchSel)});
        el.focus();
        el.value = '';
      })()`);
      await panelFrame.type(searchSel, SEARCH_TERM, { delay: 50 });
      await panelFrame.press(searchSel, 'Enter');
      console.log('[4] typed and pressed Enter');
    } catch (e) { fail('type:search', e); }
  }

  await editorPage.waitForTimeout(3000);
  await dumpFramesSnapshot(editorPage, 'after-search');

  // Step 5: find first result card
  console.log('[5] searching for first result card...');
  let cardSel = null;
  if (panelFrame) {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        cardSel = await panelFrame.evaluate(() => {
          const sels = [
            'li[class*="se-place-map"]',
            'ul[class*="se-place"] > li',
            'ul[class*="result"] > li',
            'li[class*="result"]',
            '[class*="map_result"] li',
            '[class*="search_result"] li',
            'li[class*="card"]',
          ];
          for (const s of sels) {
            const els = document.querySelectorAll(s);
            for (const el of els) {
              if (el.offsetParent !== null && (el.textContent || '').trim().length > 0) return s;
            }
          }
          return null;
        });
        if (cardSel) break;
      } catch {}
      await editorPage.waitForTimeout(500);
    }
  }

  if (!cardSel) {
    fail('find:first_card', 'not found');
    await dumpFramesSnapshot(editorPage, 'first-card-not-found');
  } else {
    console.log(`[5] found card list via "${cardSel}"`);
    try {
      const dump = await panelFrame.evaluate(`(${DUMP_SRC})(document.querySelector(${JSON.stringify(cardSel)}))`);
      save('first_card', { frameUrl: panelFrame.url(), selector: cardSel, element: dump });
    } catch (e) { fail('dump:first_card', e); }

    // Click first card
    try {
      await panelFrame.evaluate(`document.querySelector(${JSON.stringify(cardSel)}).click()`);
      console.log('[5] clicked first card');
    } catch (e) { fail('click:first_card', e); }
  }

  await editorPage.waitForTimeout(2000);
  await dumpFramesSnapshot(editorPage, 'after-click-card');

  // Step 6: find 추가 button
  console.log('[6] searching for 추가 button...');
  let addFrame = null;
  let addInfo = null;
  outer3: for (let attempt = 0; attempt < 20; attempt++) {
    for (const p of context.pages()) {
      for (const f of p.frames()) {
        try {
          const found = await f.evaluate(() => {
            const all = Array.from(document.querySelectorAll('button, a'));
            for (const el of all) {
              const t = (el.textContent || '').trim();
              if ((t === '추가' || t === '추가하기' || t === '확인') && el.offsetParent !== null) {
                return { tag: el.tagName.toLowerCase(), text: t };
              }
            }
            return null;
          });
          if (found) { addFrame = f; addInfo = found; break outer3; }
        } catch {}
      }
    }
    await editorPage.waitForTimeout(500);
  }

  if (!addFrame) {
    fail('find:add_button', 'not found');
    await dumpFramesSnapshot(editorPage, 'add-button-not-found');
  } else {
    console.log(`[6] found 추가 button:`, addInfo);
    try {
      const dump = await addFrame.evaluate(`(${DUMP_SRC})(Array.from(document.querySelectorAll('button, a')).find(el => { const t=(el.textContent||'').trim(); return (t==='추가'||t==='추가하기') && el.offsetParent!==null; }))`);
      save('add_button', { frameUrl: addFrame.url(), element: dump });
    } catch (e) { fail('dump:add_button', e); }

    try {
      await addFrame.evaluate(`Array.from(document.querySelectorAll('button, a')).find(el => { const t=(el.textContent||'').trim(); return (t==='추가'||t==='추가하기') && el.offsetParent!==null; }).click()`);
      console.log('[6] clicked 추가');
    } catch (e) { fail('click:add_button', e); }
  }

  await editorPage.waitForTimeout(3000);
  await dumpFramesSnapshot(editorPage, 'after-click-add');

  // Step 7: find inserted map block in editor body
  console.log('[7] searching for inserted map block in editor body...');
  let mapBlockFrame = null;
  let mapBlockSel = null;
  outer4: for (let attempt = 0; attempt < 20; attempt++) {
    for (const p of context.pages()) {
      for (const f of p.frames()) {
        try {
          const found = await f.evaluate(() => {
            // Restrict to editor body, exclude toolbar
            const root = document.querySelector('.se-main-container') || document;
            const sels = [
              '.se-component.se-placesMap',
              '.se-component.se-map',
              '.se-component[class*="map"]',
              'div.se-component.se-l-default[class*="map"]',
              '[data-type="placesMap"]',
              '[data-type="map"]',
              '.se-placesMap',
              '.se-map',
            ];
            for (const s of sels) {
              const els = root.querySelectorAll(s);
              for (const el of els) {
                // Exclude any toolbar button
                if (el.closest && el.closest('.se-toolbar')) continue;
                if (el.className && typeof el.className === 'string' && el.className.includes('toolbar')) continue;
                if (el.offsetParent !== null) return s;
              }
            }
            return null;
          });
          if (found) { mapBlockFrame = f; mapBlockSel = found; break outer4; }
        } catch {}
      }
    }
    await editorPage.waitForTimeout(500);
  }

  if (!mapBlockFrame) {
    fail('find:map_block', 'not found');
    await dumpFramesSnapshot(editorPage, 'map-block-not-found');
  } else {
    console.log(`[7] found map block via "${mapBlockSel}" in frame ${mapBlockFrame.url()}`);
    try {
      const dump = await mapBlockFrame.evaluate(`(() => {
        const root = document.querySelector('.se-main-container') || document;
        const els = root.querySelectorAll(${JSON.stringify(mapBlockSel)});
        for (const el of els) {
          if (el.closest && el.closest('.se-toolbar')) continue;
          if (el.className && typeof el.className === 'string' && el.className.includes('toolbar')) continue;
          if (el.offsetParent !== null) return (${DUMP_SRC})(el);
        }
        return null;
      })()`);
      save('map_block', { frameUrl: mapBlockFrame.url(), selector: mapBlockSel, element: dump });
    } catch (e) { fail('dump:map_block', e); }
  }

  console.log('========================================');
  console.log(' DONE. results in capture-result.json');
  console.log('========================================');
  console.log('keeping browser open 30s for inspection...');
  await editorPage.waitForTimeout(30000);
  await context.close();
})().catch((e) => {
  console.error('FATAL:', e && e.stack || e);
  process.exit(1);
});
