/**
 * 쿠팡 이미지 수집 테스트 (AdsPower 활성화)
 */
async function test() {
  const url = 'https://link.coupang.com/a/d4ALJW';
  console.log('=== 쿠팡 이미지 수집 테스트 (AdsPower) ===');
  console.log('URL:', url);
  
  // ✅ AdsPower 활성화!
  const { setAdsPowerEnabled } = require('./dist/crawler/crawlerBrowser.js');
  setAdsPowerEnabled(true);
  console.log('✅ AdsPower 활성화됨');
  
  const { crawlProductSpecs } = require('./dist/crawler/productSpecCrawler.js');
  const result = await crawlProductSpecs(url);
  
  if (!result) { 
    console.log('❌ FAIL: null result'); 
    // 브라우저 정리
    try { const { closeAll } = require('./dist/crawler/crawlerBrowser.js'); await closeAll(); } catch {}
    process.exit(1); 
  }
  
  console.log('\n=== 결과 ===');
  console.log('Name:', result.productName?.substring(0, 60));
  console.log('Price:', result.price);
  console.log('Brand:', result.brand);
  console.log('Rating:', result.rating);
  console.log('Images:', (result.images || []).length, '장');
  
  (result.images || []).forEach((u, i) => {
    console.log(`  #${i+1}:`, u.substring(0, 100));
  });

  // HTML 결과 파일 생성
  if (result.images && result.images.length > 0) {
    const html = `<!DOCTYPE html><html><head><title>쿠팡 이미지 테스트</title>
<style>body{background:#1a1a2e;color:#fff;font-family:sans-serif;padding:20px}
.grid{display:flex;flex-wrap:wrap;gap:10px}
.card{width:180px;text-align:center;background:#16213e;border-radius:8px;padding:8px}
.card img{width:100%;height:150px;object-fit:cover;border-radius:6px}
.label{color:#0f0;font-size:11px;margin-top:4px}
.url{color:#888;font-size:9px;word-break:break-all;margin-top:2px}</style></head>
<body><h1>쿠팡: 총 ${result.images.length}장</h1>
<p style="color:#aaa">${result.productName}</p>
<div class="grid">${result.images.map((u, i) => {
      const isReview = u.includes('review') || u.includes('sdp-review');
      const type = i === 0 ? 'MAIN' : (isReview ? 'REVIEW' : 'GALLERY');
      return `<div class="card"><img src="${u}" onerror="this.style.background='#f00'"><div class="label">#${i+1} ${type}</div><div class="url">${u.substring(0, 80)}</div></div>`;
    }).join('')}</div></body></html>`;
    
    require('fs').writeFileSync('coupang_images.html', html);
    console.log('\n✅ HTML 결과: coupang_images.html');
    require('child_process').execSync('start coupang_images.html', { cwd: process.cwd() });
  }
  
  // 브라우저 정리
  try { const { closeAll } = require('./dist/crawler/crawlerBrowser.js'); await closeAll(); } catch {}
  process.exit(0);
}

test().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
