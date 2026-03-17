// test-review-result.json에서 HTML 갤러리 자동 생성
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./test-review-result.json', 'utf8'));
const urls = data.galleryImages.map(i => i.replace(/^\[\d+\]\s*/, ''));

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>수집된 이미지 미리보기</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
  h1 { color: #00d2ff; }
  .info { color: #aaa; margin-bottom: 20px; font-size: 15px; }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
  .card { background: #16213e; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
  .card img { width: 100%; height: 250px; object-fit: cover; cursor: pointer; }
  .card img:hover { opacity: 0.8; }
  .card .label { padding: 8px 12px; font-size: 13px; color: #aaa; }
  .card .label span { color: #00d2ff; font-weight: bold; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 8px; font-size: 11px; margin-left: 6px; }
  .badge.review { background: #0fa; color: #000; }
  .badge.gallery { background: #06f; color: #fff; }
</style>
</head>
<body>
<h1>📸 수집된 이미지 미리보기</h1>
<div class="info">
  <b>상품명:</b> ${data.name}<br>
  <b>총 이미지:</b> ${data.totalImages}개
</div>
<div class="gallery">
${urls.map((url, i) => {
    const isReview = url.includes('checkout.phinf');
    const type = isReview ? '리뷰' : '갤러리';
    const badgeClass = isReview ? 'review' : 'gallery';
    return `  <div class="card">
    <img src="${url}" onclick="window.open(this.src)" onerror="this.style.background='#333';this.alt='로드실패'" />
    <div class="label"><span>#${i + 1}</span> <span class="badge ${badgeClass}">${type}</span></div>
  </div>`;
}).join('\n')}
</div>
</body>
</html>`;

fs.writeFileSync('./test-review-gallery.html', html, 'utf8');
console.log('HTML 생성 완료! 이미지 ' + urls.length + '개');
