const fs = require('fs');
const d = JSON.parse(fs.readFileSync('test-review-result.json', 'utf8'));
const imgs = d.galleryImages.map(i => i.replace(/^\[\d+\] /, ''));

let cards = '';
for (let i = 0; i < imgs.length; i++) {
    const u = imgs[i];
    const label = u.includes('checkout.phinf') ? 'REVIEW' :
        u.includes('image.nmv') ? 'VIDEO' : 'PRODUCT';
    const fname = u.split('/').pop().substring(0, 30);
    cards += `<div class="card" id="card${i}">
        <img src="${u}" onload="this.parentElement.classList.add('ok')" onerror="this.parentElement.classList.add('fail')">
        <p>[${i + 1}] ${label}<br>${fname}</p>
    </div>\n`;
}

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Review Gallery Test</title>
<style>
body{background:#111;color:#fff;font-family:sans-serif;padding:20px}
h1{text-align:center}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.card{background:#222;border-radius:8px;overflow:hidden;padding:5px}
.card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px}
.card p{text-align:center;font-size:11px;margin:4px 0;color:#aaa;word-break:break-all}
.ok{border:2px solid #0f0}
.fail{border:2px solid #f00}
</style></head>
<body>
<h1>Review Image Gallery (${imgs.length} images)</h1>
<p style="text-align:center;color:#888">Green border = loaded OK, Red border = FAILED (404)</p>
<div class="grid">
${cards}
</div>
</body></html>`;

fs.writeFileSync('test-review-gallery.html', html);
console.log('Generated gallery with ' + imgs.length + ' images');
