const puppeteer = require('puppeteer');

async function analyzeReviewSection() {
  console.log('브랜드 스토어 리뷰 섹션 분석 시작...');
  
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  // User-Agent 설정
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  await page.goto('https://brand.naver.com/vendict/products/9618793884', { 
    waitUntil: 'networkidle2',
    timeout: 60000 
  });
  
  // 5초 대기
  await new Promise(r => setTimeout(r, 5000));
  
  // 리뷰 탭 클릭 시도
  console.log('리뷰 탭 찾는 중...');
  try {
    // 리뷰 탭/버튼 찾기
    const reviewTabClicked = await page.evaluate(() => {
      // 다양한 리뷰 탭 선택자 시도
      const selectors = [
        'a[href*="review"]',
        'button[class*="review"]',
        '[class*="tab"][class*="review"]',
        '[data-nclick*="review"]',
        '[class*="Review"]',
        'li[class*="review"]',
        'span:contains("리뷰")',
        'a:contains("리뷰")',
        '[class*="_1YShY"]', // 네이버 브랜드 스토어 탭 클래스
        '[class*="tab"]'
      ];
      
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent || '';
            if (text.includes('리뷰') || text.includes('Review') || text.includes('후기')) {
              el.click();
              return { clicked: true, selector, text: text.substring(0, 50) };
            }
          }
        } catch (e) {}
      }
      
      // 탭 영역에서 리뷰 찾기
      const allTabs = document.querySelectorAll('[role="tab"], [class*="tab"], li a, nav a');
      for (const tab of allTabs) {
        const text = tab.textContent || '';
        if (text.includes('리뷰') || text.includes('후기')) {
          tab.click();
          return { clicked: true, selector: 'tab search', text: text.substring(0, 50) };
        }
      }
      
      return { clicked: false };
    });
    
    console.log('리뷰 탭 클릭 결과:', reviewTabClicked);
    
    // 리뷰 로드 대기
    await new Promise(r => setTimeout(r, 5000));
  } catch (e) {
    console.log('리뷰 탭 클릭 실패:', e.message);
  }
  
  // 스크롤 여러 번 (리뷰 로드)
  for (let i = 0; i < 15; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 1000));
  }
  
  await new Promise(r => setTimeout(r, 5000));
  
  // 모든 img 태그 개수 확인
  const imgCount = await page.evaluate(() => document.querySelectorAll('img').length);
  console.log('전체 img 태그 개수:', imgCount);
  
  // 리뷰 관련 요소 분석
  const analysis = await page.evaluate(() => {
    const results = {
      checkoutImages: [],
      shopnbuyerImages: [],
      reviewClassImages: [],
      allPstatic: []
    };
    
    // checkout.phinf 이미지 (리뷰 이미지)
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.dataset?.src || '';
      const lowerSrc = src.toLowerCase();
      
      if (lowerSrc.includes('checkout.phinf') || lowerSrc.includes('checkout-phinf')) {
        results.checkoutImages.push(src.substring(0, 150));
      }
      
      if (lowerSrc.includes('shopnbuyer')) {
        results.shopnbuyerImages.push(src.substring(0, 150));
      }
      
      // 부모 요소에 review 클래스가 있는 이미지
      let parent = img.parentElement;
      let depth = 0;
      while (parent && depth < 5) {
        const className = (parent.className || '').toLowerCase();
        if (className.includes('review') || className.includes('photo') || className.includes('리뷰')) {
          results.reviewClassImages.push({
            src: src.substring(0, 150),
            parentClass: className.substring(0, 100)
          });
          break;
        }
        parent = parent.parentElement;
        depth++;
      }
      
      // 모든 pstatic 이미지
      if (lowerSrc.includes('pstatic.net') && !lowerSrc.includes('static/www') && !lowerSrc.includes('static/common')) {
        results.allPstatic.push(src.substring(0, 150));
      }
    });
    
    return results;
  });
  
  console.log('\n=== checkout.phinf 이미지 (' + analysis.checkoutImages.length + '개) ===');
  analysis.checkoutImages.slice(0, 5).forEach((src, i) => {
    console.log((i + 1) + '. ' + src);
  });
  
  console.log('\n=== shopnbuyer 이미지 (' + analysis.shopnbuyerImages.length + '개) ===');
  analysis.shopnbuyerImages.slice(0, 5).forEach((src, i) => {
    console.log((i + 1) + '. ' + src);
  });
  
  console.log('\n=== review 클래스 부모를 가진 이미지 (' + analysis.reviewClassImages.length + '개) ===');
  analysis.reviewClassImages.slice(0, 5).forEach((img, i) => {
    console.log((i + 1) + '. ' + img.src);
    console.log('   parent: ' + img.parentClass);
  });
  
  console.log('\n=== 전체 pstatic 이미지 (' + analysis.allPstatic.length + '개) ===');
  
  await browser.close();
}

analyzeReviewSection().catch(e => console.error('오류:', e.message));

