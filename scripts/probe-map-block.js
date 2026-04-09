/**
 * 본문에 삽입된 지도 블록의 HTML 구조만 추출하는 프로브
 * - PostWriteForm 진입 → 장소 추가 → .se-main-container 안의 모든 component 정보 덤프
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = path.join(__dirname, '..', '.capture-userdata');
const OUT = path.join(__dirname, '..', 'probe-map-result.json');

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false, viewport: null, args: ['--start-maximized'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // detect blogId
  await page.goto('https://blog.naver.com/MyBlog.naver').catch(() => {});
  await page.waitForTimeout(2000);
  let blogId = null;
  const m = page.url().match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
  if (m) blogId = m[1];
  console.log('blogId =', blogId);
  if (!blogId) { console.error('no blogId'); process.exit(1); }

  await page.goto(`https://blog.naver.com/${blogId}?Redirect=Write`).catch(() => {});
  await page.waitForTimeout(7000);

  // find editor frame
  let editorFrame = null;
  for (let i = 0; i < 30; i++) {
    for (const f of page.frames()) {
      try {
        const ok = await f.evaluate(() => !!document.querySelector('button[data-name="map"]'));
        if (ok) { editorFrame = f; break; }
      } catch {}
    }
    if (editorFrame) break;
    await page.waitForTimeout(500);
  }
  if (!editorFrame) { console.error('no editor frame'); process.exit(1); }
  console.log('editor frame:', editorFrame.url());

  // Click map button
  await editorFrame.evaluate('document.querySelector(\'button[data-name="map"]\').click()');
  await page.waitForTimeout(2000);

  // Type into search
  await editorFrame.evaluate(() => {
    const el = document.querySelector('input[placeholder*="장소"]');
    if (el) { el.focus(); el.value = ''; }
  });
  await editorFrame.type('input[placeholder*="장소"]', '스타벅스 강남', { delay: 50 });
  await editorFrame.press('input[placeholder*="장소"]', 'Enter');
  await page.waitForTimeout(3000);

  // Take screenshot before any clicks for debug
  await page.screenshot({ path: path.join(__dirname, '..', 'probe-step-1-popup-open.png'), fullPage: true });

  // Dump all visible buttons in the place popup
  const popupButtons = await editorFrame.evaluate(() => {
    const popup = document.querySelector('.se-popup-placesMap');
    if (!popup) return { error: 'no popup' };
    const buttons = Array.from(popup.querySelectorAll('button, [role="button"]'));
    return buttons.filter(b => b.offsetParent !== null).map(b => ({
      tag: b.tagName.toLowerCase(),
      className: b.className,
      text: (b.textContent || '').trim().slice(0, 40),
      ariaLabel: b.getAttribute('aria-label'),
      type: b.getAttribute('type'),
    }));
  });
  console.log('popup buttons (visible):');
  for (const b of popupButtons) console.log('  ', b.tag, '|', b.text, '|', b.className);

  // Click first card via real mouse event
  console.log('clicking first card...');
  try {
    await editorFrame.locator('li.se-place-map-search-result-item').first().click();
  } catch (e) { console.log('  card click err:', e.message); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, '..', 'probe-step-2-card-clicked.png'), fullPage: true });

  // After clicking card, dump buttons again to see if 추가 / 확인 changed
  const afterCardButtons = await editorFrame.evaluate(() => {
    const popup = document.querySelector('.se-popup-placesMap');
    if (!popup) return [];
    return Array.from(popup.querySelectorAll('button, [role="button"]'))
      .filter(b => b.offsetParent !== null)
      .map(b => ({ text: (b.textContent || '').trim().slice(0, 40), className: b.className }));
  });
  console.log('buttons after card click:');
  for (const b of afterCardButtons) console.log('  ', b.text, '|', b.className);

  // Click 추가 in highlighted card
  console.log('clicking 추가 in highlighted card...');
  try {
    const highlighted = editorFrame.locator('li.se-place-map-search-result-item.se-is-highlight button.se-place-add-button');
    if (await highlighted.count() > 0) {
      await highlighted.first().click();
    } else {
      await editorFrame.locator('button.se-place-add-button').first().click();
    }
  } catch (e) { console.log('  add click err:', e.message); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(__dirname, '..', 'probe-step-3-add-clicked.png'), fullPage: true });

  // After 추가, look for confirm/finish button
  const afterAddButtons = await editorFrame.evaluate(() => {
    const popup = document.querySelector('.se-popup-placesMap');
    if (!popup) return [];
    return Array.from(popup.querySelectorAll('button, [role="button"]'))
      .filter(b => b.offsetParent !== null)
      .map(b => ({ text: (b.textContent || '').trim().slice(0, 40), className: b.className }));
  });
  console.log('buttons after 추가 click:');
  for (const b of afterAddButtons) console.log('  ', b.text, '|', b.className);

  // Try clicking 확인 if exists
  console.log('looking for 확인/완료 button...');
  try {
    const confirmBtn = editorFrame.locator('.se-popup-placesMap button').filter({ hasText: /^(확인|완료|적용)$/ });
    const cnt = await confirmBtn.count();
    console.log('  confirm count:', cnt);
    if (cnt > 0) {
      await confirmBtn.first().click();
      console.log('  clicked confirm');
    }
  } catch (e) { console.log('  confirm err:', e.message); }

  console.log('waiting 5s for insertion...');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(__dirname, '..', 'probe-step-4-final.png'), fullPage: true });

  // Search all frames in all pages for se-component / .se-main-container
  console.log('total pages:', ctx.pages().length);
  const dump = { framesScanned: [] };
  for (const p of ctx.pages()) {
    for (const f of p.frames()) {
      try {
        const info = await f.evaluate(() => {
          const out = {
            url: location.href,
            hasMainContainer: !!document.querySelector('.se-main-container'),
            seComponentCount: document.querySelectorAll('.se-component').length,
            seComponents: Array.from(document.querySelectorAll('.se-component')).map(c => ({
              className: c.className,
              dataType: c.getAttribute('data-type'),
              dataName: c.getAttribute('data-name'),
              id: c.id,
              textPreview: (c.textContent || '').trim().slice(0, 80),
            })),
            // any element with both 'se-' and 'map' or 'place' in class
            mapLikes: Array.from(document.querySelectorAll('[class*="se-"]')).filter(el => {
              const c = el.className || '';
              return typeof c === 'string' && /map|place/i.test(c) && !/toolbar/i.test(c);
            }).slice(0, 15).map(el => ({
              tag: el.tagName.toLowerCase(),
              className: el.className,
              textPreview: (el.textContent || '').trim().slice(0, 60),
            })),
          };
          // Get full main container HTML if exists
          const mc = document.querySelector('.se-main-container');
          if (mc) out.mainContainerHTML = mc.outerHTML.slice(0, 8000);
          return out;
        });
        dump.framesScanned.push(info);
      } catch (e) {
        dump.framesScanned.push({ url: f.url(), error: String(e.message || e) });
      }
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(dump, null, 2), 'utf8');
  console.log('written to', OUT);
  for (const fi of dump.framesScanned) {
    if (fi.error) { console.log('  X', fi.url, fi.error); continue; }
    if (fi.hasMainContainer || fi.seComponentCount > 0 || (fi.mapLikes && fi.mapLikes.length)) {
      console.log('--- FRAME:', fi.url.slice(0, 80));
      console.log('  hasMainContainer:', fi.hasMainContainer);
      console.log('  seComponentCount:', fi.seComponentCount);
      (fi.seComponents || []).forEach(c => console.log('    se-component:', c.className, '|', c.dataType, '|', c.textPreview));
      (fi.mapLikes || []).forEach(c => console.log('    mapLike:', c.tag, c.className, '|', c.textPreview));
    }
  }

  await page.waitForTimeout(15000);
  await ctx.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
