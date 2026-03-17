import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

async function run() {
  chromium.use(stealth());
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  console.log('Visiting Coupang Main...');
  await page.goto('https://www.coupang.com', { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  
  console.log('Visiting Coupang Search...');
  const res = await page.goto('https://www.coupang.com/np/search?component=&q=macbook', { waitUntil: 'load' });
  console.log('Status:', res?.status());
  
  const content = await page.content();
  if (content.includes('Access Denied')) {
    console.log('❌ Access Denied on search page');
  } else {
    console.log('✅ Search page loaded successfully');
  }
  
  await browser.close();
  process.exit(0);
}

run();
