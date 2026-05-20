// v2.10.313 시뮬레이션 결과 — 24개 이미지 다운로드 + 폴더 저장
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const IMAGES = [
  { type: 'main', url: 'https://shop-phinf.pstatic.net/20250704_205/17516151521764ySUx_JPEG/69309230990897889_761366050.jpg?type=blur0_8' },
  { type: 'gallery-0', url: 'https://shop-phinf.pstatic.net/20250912_85/1757664937886xzrqN_JPEG/seWnjIxsfb_10.jpg?type=f860' },
  { type: 'gallery-1', url: 'https://shop-phinf.pstatic.net/20250827_294/1756286308866Gi53Q_JPEG/10901226877169630_911538461.jpg?type=f860' },
  { type: 'gallery-3', url: 'https://shop-phinf.pstatic.net/20250704_280/1751615101891UdCpn_JPEG/85747977022484203_833011626.jpg?type=f860' },
  { type: 'gallery-4', url: 'https://shop-phinf.pstatic.net/20250704_154/1751615105682mIEbC_JPEG/4329417801835690_28525739.jpg?type=f860' },
  { type: 'gallery-5', url: 'https://shop-phinf.pstatic.net/20250704_282/17516151128539kilz_JPEG/27609611989045707_207925734.jpg?type=f860' },
  { type: 'gallery-6', url: 'https://shop-phinf.pstatic.net/20250704_225/1751615122598foyv4_JPEG/85747993717934005_754628159.jpg?type=f860' },
  { type: 'gallery-7', url: 'https://shop-phinf.pstatic.net/20250704_159/1751615123066glyLB_JPEG/85747994191039138_1324489940.jpg?type=f860' },
  { type: 'gallery-8', url: 'https://shop-phinf.pstatic.net/20250704_107/1751615132063KLzMq_JPEG/85747955194677730_2122273483.jpg?type=f860' },
  { type: 'gallery-9', url: 'https://shop-phinf.pstatic.net/20250704_26/1751615132427szzSK_JPEG/85747955561407235_1747077494.jpg?type=f860' },
  { type: 'gallery-10', url: 'https://shop-phinf.pstatic.net/20250704_183/1751615145877nyUFn_JPEG/26785428679427490_1695189505.jpg?type=f860' },
  { type: 'review-0', url: 'https://phinf.pstatic.net/image.nmv/shopnbuyer_2026_04_30_3348/xz51CaLotA_01.jpg?type=ffn300_300' },
  { type: 'review-1', url: 'https://phinf.pstatic.net/image.nmv/shopnbuyer_2026_04_26_831/tp6t4JT6kL_03.jpg?type=ffn300_300' },
  { type: 'review-2', url: 'https://phinf.pstatic.net/image.nmv/shopnbuyer_2026_04_14_138/9tSL2Std4N_03.jpg?type=ffn300_300' },
  { type: 'review-3', url: 'https://phinf.pstatic.net/image.nmv/shopnbuyer_2026_05_04_2027/BJifTACFRH_03.jpg?type=ffn300_300' },
  { type: 'review-4', url: 'https://phinf.pstatic.net/image.nmv/shopnbuyer_2026_04_27_199/tG9VkT4rwn_03.jpg?type=ffn300_300' },
  { type: 'review-5', url: 'https://phinf.pstatic.net/image.nmv/shopnbuyer_2026_04_01_2695/hPAN5nFc4p_03.jpg?type=ffn300_300' },
  { type: 'review-6', url: 'https://phinf.pstatic.net/image.nmv/shopnbuyer_2026_05_14_3286/skxGWF9epF_03.jpg?type=ffn300_300' },
  { type: 'review-7', url: 'https://phinf.pstatic.net/image.nmv/shopnbuyer_2026_04_28_1112/NdUMUl2b0I_03.jpg?type=ffn300_300' },
  { type: 'review-8', url: 'https://phinf.pstatic.net/image.nmv/shopnbuyer_2026_05_20_3794/z1VeKpAHIL_03.jpg?type=ffn300_300' },
  { type: 'review-9', url: 'https://phinf.pstatic.net/checkout.phinf/20260505_129/1777971945559FmSPy_JPEG/IMG_7121.jpeg?type=f300_300' },
  { type: 'review-10', url: 'https://phinf.pstatic.net/checkout.phinf/20260517_220/1778992935260saA4p_JPEG/1000034932.jpg?type=f300_300' },
  { type: 'review-11', url: 'https://phinf.pstatic.net/checkout.phinf/20260517_273/17790162884949yJAt_JPEG/KakaoTalk_20260517_200938246_01.jpg?type=f300_300' },
];

// blur 대표이미지는 제외 (실제 앱에선 polling으로 진짜 큰 이미지)
const filtered = IMAGES.filter(i => !/[?&]type=blur/i.test(i.url));

const saveDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'homelia-12059215662');
await fs.mkdir(saveDir, { recursive: true });

console.log(`[Test] 📥 다운로드 시작 — ${filtered.length}장 (blur 1장 제외)`);
console.log(`[Test] 📂 저장: ${saveDir}\n`);

let saved = 0, failed = 0;
for (const img of filtered) {
  try {
    const r = await fetch(img.url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120 Safari/537.36' }});
    if (!r.ok) { console.warn(`  ❌ ${img.type}: HTTP ${r.status}`); failed++; continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1024) { console.warn(`  ❌ ${img.type}: 너무 작음 ${buf.length}B`); failed++; continue; }
    const ext = img.url.toLowerCase().includes('.png') ? 'png' : 'jpg';
    const fname = `${img.type}.${ext}`;
    await fs.writeFile(path.join(saveDir, fname), buf);
    console.log(`  ✅ ${fname} (${Math.round(buf.length/1024)}KB)`);
    saved++;
  } catch (e) {
    console.warn(`  ❌ ${img.type}: ${e.message?.substring(0, 50)}`);
    failed++;
  }
}
console.log(`\n[Test] 🎉 ${saved}장 저장, ${failed}장 실패`);
