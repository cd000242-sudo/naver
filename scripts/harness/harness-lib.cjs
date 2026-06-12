// SPEC-STABILITY-2026 Phase 6.5 — shared helpers for the live tail harness.
// Extracted from the tmp/ harness when it was promoted to a release gate.
const log = (m) => console.log(`[${new Date().toLocaleTimeString('ko-KR', { hour12: false })}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForLogin(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cookies = await page.cookies('https://naver.com').catch(() => []);
    if (cookies.some((c) => c.name === 'NID_AUT')) return true;
    await sleep(2000);
  }
  return false;
}

async function findEditorFrame(page, timeoutMs) {
  // Naver's SmartEditor lives inside the #mainFrame iframe — same lookup the
  // app's switchToMainFrame() uses. The redesigned editor dropped
  // .se-main-container, so detect by still-present editable components.
  const READY = '.se-section-text, .se-text-paragraph, [contenteditable="true"], .se-component';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const handle = await page.$('#mainFrame, iframe[name="mainFrame"]').catch(() => null);
    if (handle) {
      const frame = await handle.contentFrame().catch(() => null);
      if (frame) {
        const ready = await frame.evaluate((sel) => !!document.querySelector(sel), READY).catch(() => false);
        if (ready) return frame;
      }
    }
    await sleep(1500);
  }
  return null;
}

async function closeDraftPopup(page) {
  // "이어서 작성하시겠어요?" draft-restore dialog blocks editor access.
  for (const sel of ['.se-popup-button-cancel', 'button.se__cancel', '.btn_cancel', 'button[class*="cancel"]']) {
    await page.evaluate((s) => {
      document.querySelectorAll(s).forEach((el) => { if (el instanceof HTMLElement) el.click(); });
    }, sel).catch(() => undefined);
  }
}

async function closeEditorPopups(page, frame) {
  const selectors = [
    '.se-popup-button-cancel',
    '.se-popup-close-button',
    'button.se-popup-close',
    '.se-help-panel-close-button',
    'button[class*="close"][class*="help"]',
  ];
  for (let round = 0; round < 3; round += 1) {
    for (const target of [frame, page]) {
      for (const sel of selectors) {
        await target.evaluate((s) => {
          const el = document.querySelector(s);
          if (el instanceof HTMLElement) el.click();
        }, sel).catch(() => undefined);
      }
    }
    await sleep(800);
  }
}

// Markers match the harness presets (애국가 본문 + 표준 꼬리 시퀀스).
async function countTailEvidence(frame) {
  return frame.evaluate(() => {
    const root = document.querySelector('.se-main-container') || document.body;
    const text = root.innerText || '';
    const linkSelectors = ['.se-oglink', '.se-module-oglink', '.se-section-oglink', '[data-module="oglink"]'];
    const cards = new Set();
    for (const sel of linkSelectors) {
      document.querySelectorAll(sel).forEach((el) => cards.add(el.closest('.se-component') || el));
    }
    const lastBodyIdx = text.indexOf('꿀팁이 있다면');
    const dividerIdx = text.indexOf('━');
    return {
      dividers: (text.match(/━{10,}/g) || []).length,
      hook: text.includes('다른 인기글 보러가기'),
      linkCards: cards.size,
      hashtagFirst: text.includes('#애국가'),
      hashtagLast: text.includes('#한국'),
      anthem: text.includes('동해 물과 백두산이'),
      tailAfterBody: lastBodyIdx >= 0 && dividerIdx >= 0 && dividerIdx > lastBodyIdx,
    };
  }).catch(() => null);
}

// Reuse the app's saved session cookies (same mechanism the app uses).
// Path is discovered from APPDATA — first account dir with a cookies.json —
// or overridden via NAVER_SESSION_COOKIES.
function resolveCookieFile(fs, path) {
  if (process.env.NAVER_SESSION_COOKIES) return process.env.NAVER_SESSION_COOKIES;
  const base = path.join(process.env.APPDATA || '', 'better-life-naver', 'sessions');
  try {
    for (const dir of fs.readdirSync(base)) {
      const candidate = path.join(base, dir, 'cookies.json');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* sessions dir absent — manual login fallback */ }
  return null;
}

module.exports = {
  log,
  sleep,
  waitForLogin,
  findEditorFrame,
  closeDraftPopup,
  closeEditorPopups,
  countTailEvidence,
  resolveCookieFile,
};
