const fs = require('fs');

async function test() {
  console.log('=== v6: Review First, Gallery Second ===');
  const { crawlFromAffiliateLink } = require('./dist/crawler/productSpecCrawler.js');
  const result = await crawlFromAffiliateLink('https://naver.me/5XcLgMkJ');
  if (!result) { console.log('FAIL: null'); process.exit(1); }
  
  console.log('\n=== RESULTS ===');
  console.log('gallery:', result.galleryImages?.length, 'detail:', result.detailImages?.length);
  result.galleryImages?.forEach((u,i) => console.log('  '+(u.includes('checkout') ? '📸REVIEW' : '🖼️GALLERY')+' #'+(i+1)+': '+u.substring(0,70)));
  
  const all = [];
  if (result.mainImage) all.push({url: result.mainImage, type: 'MAIN'});
  (result.galleryImages||[]).forEach((u,i) => {
    all.push({url: u, type: u.includes('checkout') ? 'REVIEW' : 'GALLERY'});
  });
  // 중요: no-referrer 추가해야 네이버 이미지가 로딩됨
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <title>v6 (${all.length}장)</title>
  <style>body{background:#1a1a2e;color:#eee;font-family:sans-serif;padding:20px}
  h1{color:#e94560}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:15px}
  .card{background:#16213e;border-radius:10px;overflow:hidden}
  .card img{width:100%;height:300px;object-fit:contain;background:#0f3460}
  .label{padding:10px;font-size:13px;color:#a8a8a8;word-break:break-all}
  .idx{color:#e94560;font-weight:bold;font-size:16px}.review{color:#00ff88}.gallery{color:#00d2ff}</style></head>
  <body><h1>v6: 총 ${all.length}장</h1><div class="grid">`;
  all.forEach((item, i) => {
    html += `<div class="card"><img src="${item.url}" referrerpolicy="no-referrer" onload="this.parentNode.querySelector('.dim').textContent=this.naturalWidth+'x'+this.naturalHeight"><div class="label"><span class="idx">#${i+1}</span> <span class="${item.type.toLowerCase()}">${item.type}</span> <span class="dim">...</span><br>${item.url.substring(0,80)}</div></div>`;
  });
  html += '</div></body></html>';
  fs.writeFileSync('collected_images_v6.html', html, 'utf8');
  require('child_process').exec('start "" "collected_images_v6.html"');
  console.log('HTML: collected_images_v6.html');
  process.exit(0);
}
test();
