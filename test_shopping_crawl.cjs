/**
 * ✅ v10 — SmartStoreProvider와 동일한 영역 기반 필터링 적용
 * 관련상품/추천/배너 제외, 정크 URL 필터, 상세 영역만 수집
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ADSPOWER_BASE = 'http://local.adspower.com:50325';
const TARGET_URL = process.argv[2] || 'https://smartstore.naver.com/bfkr/products/11394122187';
const OUTPUT_DIR = path.join(__dirname, 'crawl_result');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function downloadImage(url, filepath) {
  try {
    const res = await fetch(url, { headers: { 'Referer': 'https://smartstore.naver.com/' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return false;
    fs.writeFileSync(filepath, buf);
    return true;
  } catch { return false; }
}

async function main() {
  console.log('🛒 v10 — 영역 기반 이미지 필터링');
  console.log('URL:', TARGET_URL, '\n');

  if (fs.existsSync(OUTPUT_DIR)) fs.rmSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // AdsPower 연결
  try { await fetch(`${ADSPOWER_BASE}/status`); } catch { console.error('❌ AdsPower 미실행!'); return; }

  let profileId = '', userId = '';
  try {
    const r = await fetch(`${ADSPOWER_BASE}/api/v1/user/list?page_size=10`);
    const d = await r.json();
    if (d.code === 0 && d.data?.list?.length > 0) {
      profileId = d.data.list[0].serial_number || '1';
      userId = d.data.list[0].user_id || '';
    }
  } catch {}

  // 브라우저 닫기 → 설정 → 재시작
  try { await fetch(`${ADSPOWER_BASE}/api/v1/browser/stop?serial_number=${profileId}`); } catch {}
  await sleep(2000);
  try {
    await fetch(`${ADSPOWER_BASE}/api/v1/user/update`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        user_proxy_config: { proxy_soft: 'no_proxy' },
        fingerprint_config: { screen_resolution: '1920_1080',
          ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
      }),
    });
  } catch {}
  await sleep(1000);

  const openRes = await fetch(`${ADSPOWER_BASE}/api/v1/browser/start?serial_number=${profileId}`);
  const openData = await openRes.json();
  if (openData.code !== 0 || !openData.data?.ws?.puppeteer) { console.error('❌ 브라우저 실패'); return; }

  const browser = await chromium.connectOverCDP(openData.data.ws.puppeteer);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await context.newPage();
  console.log('✅ 연결 완료\n');

  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const finalUrl = page.url();
    console.log('URL:', finalUrl);

    const bodyText = await page.evaluate(() => document.body.innerText || '');
    const html = await page.content();
    const hasCaptcha = html.includes('captcha') || html.includes('자동등록방지');

    if (hasCaptcha) {
      console.log('⏳ 캡차! 풀어주세요 (60초)');
      await page.waitForTimeout(60000);
      await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
    }

    if (bodyText.includes('접속이 불가') || html.includes('에러페이지')) {
      console.error('❌ 에러:', bodyText.substring(0, 200));
      return;
    }

    // 상품 정보
    const og = await page.evaluate(() => {
      const g = (n) => (document.querySelector('meta[property="' + n + '"]') || {}).content || '';
      return { title: g('og:title') || document.title, desc: g('og:description'), img: g('og:image'), price: g('product:price:amount') };
    });
    console.log('🏷️', og.title);
    console.log('💰', og.price || '(없음)');

    // ✅ 상세정보 펼쳐보기 클릭
    try {
      const expanded = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a'));
        const btn = btns.find(b => b.textContent?.includes('펼쳐보기'));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (expanded) { console.log('📖 상세정보 펼쳐봄'); await page.waitForTimeout(2000); }
    } catch {}

    // ✅ 딥 스크롤
    console.log('스크롤...');
    await page.evaluate(async () => {
      const maxScroll = Math.min(document.body.scrollHeight, 20000);
      for (let p = 0; p < maxScroll; p += 600) {
        window.scrollBy(0, 600);
        await new Promise(r => setTimeout(r, 150));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2000);

    // ═══════════════════════════════════════════════════════════════
    // ✅ SmartStoreProvider와 동일한 영역 기반 이미지 수집
    // ═══════════════════════════════════════════════════════════════
    const collectedUrls = await page.evaluate(() => {
      const results = [];
      const addUrl = (u, type) => { if (u && u.startsWith('http') && !u.startsWith('data:')) results.push({ url: u, type }); };

      // ✅ 관련상품/추천 영역의 이미지 제외
      const excludedImgs = new Set();
      const excludeSelectors = [
        '[class*="recommend"]', '[class*="Recommend"]',
        '[class*="related"]', '[class*="Related"]',
        '[class*="similar"]', '[class*="Similar"]',
        '[class*="best"]', '[class*="Best"]',
        '[class*="ranking"]', '[class*="Ranking"]',
        '[class*="together"]', '[class*="Together"]',
        '[class*="also"]', '[class*="Also"]',
        '[class*="other"]', '[class*="Other"]',
        '[data-nclick*="recommend"]', '[data-nclick*="similar"]',
      ];
      for (const sel of excludeSelectors) {
        try {
          document.querySelectorAll(sel).forEach(c => {
            c.querySelectorAll('img').forEach(img => excludedImgs.add(img));
          });
        } catch {}
      }

      const isExcluded = (img) => {
        if (excludedImgs.has(img)) return true;
        let el = img;
        for (let i = 0; i < 5 && el; i++) {
          el = el.parentElement;
          if (!el) break;
          const cls = (el.className || '').toLowerCase();
          if (cls.includes('recommend') || cls.includes('related') ||
            cls.includes('similar') || cls.includes('best') ||
            cls.includes('ranking') || cls.includes('together') ||
            cls.includes('also') || cls.includes('other-product')) return true;
        }
        return false;
      };

      // 정크 URL 필터
      const isJunk = (src) => {
        if (!src || !src.startsWith('http') || src.startsWith('data:')) return true;
        const lower = src.toLowerCase();
        const junkPatterns = ['logo', 'icon', 'searchad-phinf', 'button', 'emoji',
          'storefront', 'sprite', '1x1', 'gnb_', 'favicon', 'video-phinf',
          'ssl.pstatic.net/static', 'placeholder', 'ncpt.naver.com', 'nid.naver.com',
          'banner', 'member', 'npay', 'npoint', 'badge', 'arrow'];
        return junkPatterns.some(p => lower.includes(p));
      };

      // 1. OG 메인 이미지
      const ogImg = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      if (ogImg) addUrl(ogImg, 'main');

      // 2. 갤러리 (alt="추가이미지")
      document.querySelectorAll('img[alt^="추가이미지"]').forEach(img => {
        if (!isExcluded(img)) addUrl(img.src, 'gallery');
      });

      // 3. 상세 설명 영역 이미지
      const detailSelectors = [
        '.se-image-resource', '.__se_image_link img', '.se-module-image img',
        '.product-detail-content img', '[class*="detail-content"] img',
        '[class*="DetailContent"] img', '[class*="product_detail"] img',
        '[class*="product-content"] img',
      ];
      for (const sel of detailSelectors) {
        try {
          document.querySelectorAll(sel).forEach(img => {
            if (!isExcluded(img) && !isJunk(img.src)) {
              addUrl(img.getAttribute('data-src') || img.src, 'detail');
            }
          });
        } catch {}
      }

      // 4. iframe 내부 상세
      try {
        document.querySelectorAll('iframe').forEach(iframe => {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!doc) return;
            doc.querySelectorAll('img').forEach(img => {
              const src = img.src || img.getAttribute('data-src');
              if (src && !isJunk(src) && !src.endsWith('.gif') && !src.endsWith('.svg')) {
                addUrl(src, 'detail');
              }
            });
          } catch {}
        });
      } catch {}

      // 중복 제거
      const seen = new Set();
      return results.filter(r => {
        const norm = r.url.split('?')[0];
        if (seen.has(norm)) return false;
        seen.add(norm);
        return true;
      });
    });

    const mainImgs = collectedUrls.filter(i => i.type === 'main');
    const galleryImgs = collectedUrls.filter(i => i.type === 'gallery');
    const detailImgs = collectedUrls.filter(i => i.type !== 'main' && i.type !== 'gallery');
    const sorted = [...mainImgs, ...galleryImgs, ...detailImgs];

    console.log(`\n📊 수집 결과:`);
    console.log(`  메인: ${mainImgs.length}개`);
    console.log(`  갤러리: ${galleryImgs.length}개`);
    console.log(`  상세: ${detailImgs.length}개`);
    console.log(`  총: ${sorted.length}개\n`);

    // 다운로드
    const downloaded = [];
    for (let i = 0; i < sorted.length; i++) {
      const img = sorted[i];
      const ext = img.url.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
      const fn = `img_${String(i+1).padStart(3,'0')}_${img.type}.${ext}`;
      process.stdout.write(`  [${i+1}/${sorted.length}] ${fn}...`);
      const ok = await downloadImage(img.url, path.join(OUTPUT_DIR, fn));
      if (ok) {
        const st = fs.statSync(path.join(OUTPUT_DIR, fn));
        downloaded.push({ filename: fn, src: img.url, size: st.size, type: img.type });
        console.log(` ✅ ${Math.round(st.size/1024)}KB`);
      } else { console.log(` ❌`); }
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'page_screenshot.png'), fullPage: false });

    // HTML
    const typeColor = { main: '#e94560', gallery: '#4fc3f7', detail: '#66bb6a' };
    const rpt = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>이미지 수집 v10</title>
<style>body{font-family:'Segoe UI',sans-serif;background:#1a1a2e;color:#eee;padding:20px}h1{color:#e94560;text-align:center}.info{background:#16213e;padding:15px;border-radius:10px;margin-bottom:20px}.info p{margin:5px 0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:15px}.card{background:#16213e;border-radius:10px;overflow:hidden;border:1px solid #0f3460}.card img{width:100%;height:200px;object-fit:contain;background:#0a0a1a}.card .meta{padding:10px;font-size:13px}.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;color:#fff}.summary{text-align:center;margin:20px 0;padding:15px;background:#0f3460;border-radius:10px}.num{font-size:48px;color:#e94560;font-weight:bold}.stats{display:flex;justify-content:center;gap:20px;margin-top:10px}</style></head><body>
<h1>🛒 이미지 수집 결과 (영역 기반 필터)</h1>
<div class="info"><p><strong>제품명:</strong> ${og.title}</p><p><strong>가격:</strong> ${og.price||'없음'}</p><p><strong>URL:</strong> ${finalUrl}</p></div>
<div class="summary"><div class="num">${downloaded.length}</div><div>개 제품 이미지만 수집</div>
<div class="stats"><span><span class="tag" style="background:#e94560">메인</span> ${mainImgs.length}</span>
<span><span class="tag" style="background:#4fc3f7">갤러리</span> ${galleryImgs.length}</span>
<span><span class="tag" style="background:#66bb6a">상세</span> ${detailImgs.length}</span></div></div>
<h2>📸 페이지</h2><img src="page_screenshot.png" style="max-width:100%;border-radius:10px;margin-bottom:20px">
<h2>🖼️ 이미지</h2><div class="grid">${downloaded.map((d,i)=>{
const c = typeColor[d.type] || '#aaa';
return `<div class="card"><img src="${d.filename}" loading="lazy"><div class="meta"><span class="tag" style="background:${c}">${d.type}</span> #${i+1} · ${Math.round(d.size/1024)}KB</div></div>`;
}).join('')}</div></body></html>`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'report.html'), rpt, 'utf-8');

    console.log('\n╔════════════════════════════════════╗');
    console.log('║  ✅ 영역 기반 필터링 완료!         ║');
    console.log('╠════════════════════════════════════╣');
    console.log('║ 제품:', (og.title||'').substring(0,30));
    console.log('║ 메인:', mainImgs.length + '개');
    console.log('║ 갤러리:', galleryImgs.length + '개');
    console.log('║ 상세:', detailImgs.length + '개');
    console.log('║ 총:', downloaded.length + '개');
    console.log('╚════════════════════════════════════╝');
    console.log('\n👉 crawl_result/report.html');

  } catch (err) {
    console.error('❌:', err.message);
  } finally {
    await page.close();
    try { await browser.close(); } catch {}
    try { await fetch(`${ADSPOWER_BASE}/api/v1/browser/stop?serial_number=${profileId}`); } catch {}
  }
}

main().catch(console.error);
