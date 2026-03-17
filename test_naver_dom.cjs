const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');

(async () => {
  const res = await axios.get('http://local.adspower.com:50325/api/v1/browser/start?serial_number=6', { timeout: 30000 });
  const ws = res.data?.data?.ws?.puppeteer;
  if (!ws) { console.log('No WS'); process.exit(1); }

  const browser = await chromium.connectOverCDP(ws);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  // 새 네이버 쇼핑 베스트 URL로 이동
  await page.goto('https://snxbest.naver.com/home', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  
  // 스크롤
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 3));
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('URL:', page.url());
  console.log('Title:', await page.title());

  const analysis = await page.evaluate(() => {
    const result = {};
    
    // 상품 링크 찾기
    const productLinks = document.querySelectorAll('a[href*="smartstore"], a[href*="product"], a[href*="catalog"], a[href*="naver.com"]');
    result.productLinkCount = productLinks.length;
    
    // 이미지가 있는 요소 찾기
    const allImgs = document.querySelectorAll('img');
    result.totalImgs = allImgs.length;
    
    // 가격 패턴이 있는 텍스트 찾기
    const allEls = document.querySelectorAll('*');
    let priceCount = 0;
    for (const el of allEls) {
      if (el.children.length === 0 && (el.textContent || '').match(/[\d,]+원/)) {
        priceCount++;
      }
    }
    result.priceCount = priceCount;
    
    // li 내부 상품 분석
    const lis = document.querySelectorAll('li');
    const productLis = [];
    for (const li of lis) {
      const img = li.querySelector('img');
      const a = li.querySelector('a');
      const text = (li.textContent || '').trim();
      if (img && a && text.length > 10 && text.match(/[\d,]+원/)) {
        productLis.push(li);
      }
    }
    result.productLiCount = productLis.length;
    
    // 상위 3개 샘플 분석
    const samples = [];
    for (let i = 0; i < Math.min(3, productLis.length); i++) {
      const li = productLis[i];
      const imgs = Array.from(li.querySelectorAll('img')).slice(0, 3).map(img => ({
        src: (img.src || '').substring(0, 300),
        alt: img.alt,
        className: img.className,
      }));
      
      const links = Array.from(li.querySelectorAll('a')).slice(0, 3).map(a => ({
        href: (a.href || '').substring(0, 200),
        text: (a.textContent || '').trim().substring(0, 100),
      }));
      
      const text = li.textContent || '';
      const priceMatch = text.match(/[\d,]+원/g);
      
      samples.push({
        className: (li.className || '').substring(0, 200),
        text: text.substring(0, 300),
        imgs,
        links,
        prices: priceMatch || [],
        outerHTML: li.outerHTML.substring(0, 500),
      });
    }
    result.samples = samples;
    
    return result;
  });

  fs.writeFileSync('./naver_dom_analysis.json', JSON.stringify(analysis, null, 2), 'utf8');
  console.log('OK');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
