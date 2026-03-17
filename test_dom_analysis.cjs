const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');

(async () => {
  const res = await axios.get('http://local.adspower.com:50325/api/v1/browser/start?serial_number=6', { timeout: 30000 });
  const ws = res.data?.data?.ws?.puppeteer;
  if (!ws) { process.exit(1); }

  const browser = await chromium.connectOverCDP(ws);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();

  await page.goto('https://www.coupang.com/np/goldbox', { waitUntil: 'load', timeout: 30000 });
  await new Promise(r => setTimeout(r, 7000));

  const analysis = await page.evaluate(() => {
    const result = {};
    
    // 모든 상품 링크 찾기
    const vpLinks = document.querySelectorAll('a[href*="/vp/"], a[href*="/products/"]');
    result.vpLinkCount = vpLinks.length;

    const samples = [];
    for (let i = 0; i < Math.min(3, vpLinks.length); i++) {
      const link = vpLinks[i];
      const parentLi = link.closest('li');
      const parentDiv = link.closest('div[class]');
      const container = parentLi || parentDiv || link;

      // 이미지
      const imgs = container.querySelectorAll('img');
      const imgData = Array.from(imgs).slice(0, 5).map(img => ({
        src: (img.src || '').substring(0, 300),
        dataSrc: img.getAttribute('data-src') || '',
        dataImgSrc: img.getAttribute('data-img-src') || '',
        className: img.className,
      }));

      // 가격
      const allEls = container.querySelectorAll('*');
      const priceData = [];
      for (const el of allEls) {
        const text = (el.textContent || '').trim();
        if (text.match(/[0-9,]+원/) || text.match(/[0-9,]{3,}/)) {
          priceData.push({
            tag: el.tagName,
            className: el.className,
            text: text.substring(0, 100),
          });
          if (priceData.length >= 5) break;
        }
      }

      // 이름
      const nameEls = container.querySelectorAll('[class*="name"], [class*="title"], [class*="Name"], [class*="Title"], [class*="description"]');
      const nameData = Array.from(nameEls).slice(0, 3).map(el => ({
        className: el.className,
        text: (el.textContent || '').trim().substring(0, 100),
      }));

      samples.push({
        href: (link.href || '').substring(0, 150),
        containerTag: container.tagName,
        containerClass: (container.className || '').substring(0, 300),
        imgs: imgData,
        prices: priceData,
        names: nameData,
      });
    }
    result.samples = samples;
    return result;
  });

  fs.writeFileSync('./dom_analysis.json', JSON.stringify(analysis, null, 2), 'utf8');
  console.log('OK');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
