import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const IMAGES = process.argv.slice(2);
const saveDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'haan-9619286590');
await fs.mkdir(saveDir, { recursive: true });

console.log(`[Test] 📥 다운로드 시작 (${IMAGES.length}장)`);
console.log(`[Test] 📂 저장 위치: ${saveDir}\n`);

let saved = 0, failed = 0;
for (let i = 0; i < IMAGES.length; i++) {
  const url = IMAGES[i];
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } });
    if (!r.ok) { console.warn(`  ❌ [${i+1}] HTTP ${r.status}`); failed++; continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1024) { failed++; continue; }
    const u = url.toLowerCase();
    const ext = u.includes('.png') || u.includes('_png') ? 'png' : (u.includes('.gif') ? 'gif' : 'jpg');
    const fname = `image-${String(i+1).padStart(2,'0')}.${ext}`;
    await fs.writeFile(path.join(saveDir, fname), buf);
    console.log(`  ✅ ${fname} (${Math.round(buf.length/1024)}KB)`);
    saved++;
  } catch (e) {
    console.warn(`  ❌ [${i+1}] ${e.message?.substring(0, 60)}`);
    failed++;
  }
}
console.log(`\n[Test] 🎉 ${saved}장 저장, ${failed}장 실패`);
