/**
 * 정확한 제품 이미지만 수집 테스트 (SmartStoreProvider 동일 로직)
 * - 갤러리(공식 상품 사진) + 상세 설명(판매자 등록 이미지)만
 * - 관련상품/추천/리뷰/텍스트배너 완전 제외
 */
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const fs = require('fs');
const os = require('os');

chromium.use(stealth());

const PRODUCT_URL = 'https://m.smartstore.naver.com/bfkr/products/11394122187';

function isJunkUrl(src) {
    if (!src || !src.startsWith('http') || src.startsWith('data:')) return true;
    const junk = ['logo','icon','searchad-phinf','button','emoji','storefront','sprite','1x1',
        'gnb_','favicon','video-phinf','ssl.pstatic.net/static','placeholder',
        'ncpt.naver.com','nid.naver.com','.gif','.svg','banner','emoticon','tracking','pixel',
        'criteo','google','facebook','analytics','adimg'];
    return junk.some(p => src.toLowerCase().includes(p));
}

const upscaleUrl = u => u.replace(/\?type=f\d+(_\d+)?/, '?type=o1000').replace(/\?type=m\d+/, '?type=o1000');

async function main() {
    console.log('🎯 정확한 제품 이미지만 수집 테스트\n');

    const profileDir = path.join(process.env.LOCALAPPDATA || os.homedir(), 'LewordCrawler', 'ChromeProfile');
    if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

    const context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        args: ['--disable-blink-features=AutomationControlled','--no-sandbox','--disable-infobars'],
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        locale: 'ko-KR', timezoneId: 'Asia/Seoul', ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = await context.newPage();
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: { onConnect: { addListener: () => {} }, onMessage: { addListener: () => {} } }, loadTimes: () => ({}), csi: () => ({}) };
        Object.defineProperty(navigator, 'plugins', { get: () => [{ name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' }] });
        Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
    });

    // 워밍업
    console.log('🏠 워밍업...');
    for (const u of ['https://www.naver.com','https://shopping.naver.com/home']) {
        try {
            await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.mouse.move(400, 300); await page.waitForTimeout(2000);
            await page.mouse.wheel(0, 300); await page.waitForTimeout(1500);
        } catch {}
    }

    // 상품 페이지
    console.log('🌐 상품 페이지...');
    await page.goto(PRODUCT_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);

    // 에러 체크 + 리트라이
    const checkErr = async () => {
        try {
            return await page.evaluate(() => {
                const t = document.title || '', b = document.body?.innerText || '';
                if (t.length === 0 && b.trim().length < 50) return true;
                const c = (t+' '+b).toLowerCase();
                return ['에러','시스템오류','서비스 접속이 불가','캡차','captcha'].some(k => c.includes(k));
            });
        } catch { return true; }
    };

    let err = await checkErr();
    for (let r = 0; r < 3 && err; r++) {
        console.log(`⚠️ 리트라이 ${r+1}/3...`);
        try { await page.goto(['https://shopping.naver.com/home','https://www.naver.com','https://search.naver.com/search.naver?query=인기상품'][r], { waitUntil: 'domcontentloaded', timeout: 15000 }); await page.waitForTimeout(4000); } catch {}
        await page.waitForTimeout((r+1)*5000);
        await page.goto(PRODUCT_URL, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(5000);
        err = await checkErr();
        if (!err) console.log(`✅ 성공!`);
    }
    if (err) { console.log('❌ 접속 실패'); await context.close(); return; }

    const title = await page.title();
    console.log(`📄 ${title}\n`);

    // 상세정보 펼쳐보기
    try {
        const expanded = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, a'));
            const btn = btns.find(b => b.textContent?.includes('펼쳐보기'));
            if (btn) { btn.click(); return true; }
            return false;
        });
        if (expanded) { console.log('📖 상세정보 펼쳐보기 클릭'); await page.waitForTimeout(2000); }
    } catch {}

    // 딥 스크롤
    console.log('📜 딥 스크롤...');
    await page.evaluate(async () => {
        let scrolled = 0;
        const max = Math.min(document.body.scrollHeight, 20000);
        while (scrolled < max) { window.scrollBy(0, 600); scrolled += 600; await new Promise(r => setTimeout(r, 150)); }
        window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2000);

    // ✅ 영역 기반 이미지 수집 (SmartStoreProvider 동일 로직)
    console.log('\n🎯 영역 기반 이미지 수집 (관련상품/추천/리뷰 제외)...');
    const phase1Urls = await page.evaluate(() => {
        const results = [];
        const addUrl = u => { if (u && u.startsWith('http') && !u.startsWith('data:')) results.push(u); };

        // 관련상품/추천 영역 이미지 제외
        const excludedImgs = new Set();
        const excludeSels = [
            '[class*="recommend"]','[class*="Recommend"]','[class*="related"]','[class*="Related"]',
            '[class*="similar"]','[class*="Similar"]','[class*="best"]','[class*="Best"]',
            '[class*="ranking"]','[class*="Ranking"]','[class*="together"]','[class*="Together"]',
            '[class*="also"]','[class*="Also"]','[class*="other"]','[class*="Other"]',
            '[class*="review"]','[class*="Review"]', // 리뷰 영역도 제외
            '[data-nclick*="recommend"]','[data-nclick*="similar"]',
        ];
        for (const sel of excludeSels) {
            try { document.querySelectorAll(sel).forEach(c => c.querySelectorAll('img').forEach(i => excludedImgs.add(i))); } catch {}
        }

        const isExcluded = img => {
            if (excludedImgs.has(img)) return true;
            let el = img;
            for (let i = 0; i < 5 && el; i++) {
                el = el.parentElement; if (!el) break;
                const cls = (el.className || '').toLowerCase();
                if (['recommend','related','similar','best','ranking','together','also','other-product','review'].some(k => cls.includes(k))) return true;
            }
            return false;
        };

        // 1. OG 메인 이미지
        addUrl(document.querySelector('meta[property="og:image"]')?.getAttribute('content'));

        // 2. 갤러리 슬라이더
        document.querySelectorAll('img[alt^="추가이미지"]').forEach(img => {
            if (!isExcluded(img)) addUrl(img.src);
        });

        // 3. 상세 설명 영역 (SmartEditor)
        const detailSels = ['.se-image-resource','.__se_image_link img','.se-module-image img',
            '.product-detail-content img','[class*="detail-content"] img','[class*="DetailContent"] img',
            '[class*="product_detail"] img','[class*="product-content"] img'];
        for (const sel of detailSels) {
            try { document.querySelectorAll(sel).forEach(img => { if (!isExcluded(img)) addUrl(img.getAttribute('data-src') || img.src); }); } catch {}
        }

        // 4. iframe 내부 (상세 설명)
        try {
            document.querySelectorAll('iframe').forEach(iframe => {
                try {
                    const doc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (!doc) return;
                    doc.querySelectorAll('img').forEach(img => {
                        const src = img.src || img.getAttribute('data-src');
                        if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon')
                            && !src.includes('banner') && !src.includes('button') && !src.endsWith('.gif') && !src.endsWith('.svg'))
                            addUrl(src);
                    });
                } catch {}
            });
        } catch {}

        return results;
    });

    // 필터링 + 정렬
    const allImages = new Map();
    const filtered = [];
    let mainAdded = false;

    for (const rawUrl of phase1Urls) {
        if (rawUrl.includes('shopping-phinf') && rawUrl.includes('/main_')) continue;
        if (isJunkUrl(rawUrl)) { filtered.push(rawUrl); continue; }
        const url = upscaleUrl(rawUrl);
        const norm = url.split('?')[0];
        if (allImages.has(norm)) continue;
        const type = !mainAdded ? 'main' : 'gallery';
        allImages.set(norm, { url, type });
        if (!mainAdded) mainAdded = true;
    }

    const images = [...allImages.values()];
    console.log(`\n📊 결과: ${images.length}개 정확한 제품 이미지 | ${filtered.length}개 필터링 제거`);

    // HTML 생성
    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>제품 이미지 - ${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0f0f23;color:#eee;font-family:'Segoe UI',sans-serif;padding:24px}
h1{text-align:center;margin-bottom:8px;background:linear-gradient(135deg,#00d2ff,#7b2ff7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:26px}
.info{text-align:center;color:#888;font-size:13px;margin-bottom:6px}.info b{color:#00d2ff}
.warn{text-align:center;color:#f43f5e;font-size:12px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.card{background:#1a1a3e;border-radius:10px;overflow:hidden;transition:all .25s}.card:hover{transform:translateY(-4px);box-shadow:0 8px 25px rgba(0,210,255,.15)}
.card img{width:100%;height:280px;object-fit:cover;cursor:pointer}.card .meta{padding:8px 12px;display:flex;align-items:center;gap:6px;font-size:11px}
.idx{color:#555}.badge{padding:2px 8px;border-radius:8px;font-weight:600;font-size:10px}
.badge-main{background:#0a2647;color:#00d2ff;border:1px solid #00d2ff}.badge-gallery{background:#1a0a3e;color:#a855f7}
</style></head><body>
<h1>🎯 ${title}</h1>
<div class="info">✅ 정확한 제품 이미지 <b>${images.length}개</b></div>
<div class="warn">❌ 필터링 제거: 로고/아이콘/배너 ${filtered.length}개 | 관련상품/추천/리뷰 = 수집하지 않음</div>
<div class="grid">${images.map((img,i) => `<div class="card"><img src="${img.url}" alt="#${i+1}" loading="lazy" onclick="window.open(this.src)"><div class="meta"><span class="idx">#${i+1}</span><span class="badge badge-${img.type}">${img.type === 'main' ? '메인' : '갤러리/상세'}</span></div></div>`).join('')}</div>
</body></html>`;

    const htmlPath = path.join(__dirname, 'collected_images.html');
    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`✅ HTML: ${htmlPath}`);

    const preview = await context.newPage();
    await preview.goto('file:///' + htmlPath.replace(/\\/g, '/'));
    console.log('🌐 미리보기 열림! 30초 후 종료...');
    await preview.waitForTimeout(30000);
    await context.close();
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
