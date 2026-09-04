// 최근 배치들의 소제목 서술형 비율 실측. npx tsx tmp/heading-style-audit.cjs after2 spot bind gate
const fs = require('fs'); const path = require('path');
const { isSentenceStyleHeadingTitle } = require(path.resolve('src/contentBodyTransforms.ts'));
const LONE = /(^|\s)(의|은|는|이|가|을|를|과|와|도|에|로|에서|부터|까지)(\s|$)/u;
let tot = 0, sent = 0, frag = 0;
for (const tag of process.argv.slice(2)) {
  const dir = path.join('tmp', 'one-article', `batch-${tag}`);
  if (!fs.existsSync(path.join(dir, 'index.txt'))) continue;
  for (const line of fs.readFileSync(path.join(dir, 'index.txt'), 'utf8').split('\n').filter(Boolean)) {
    const [mode, i, kw, , folderPart] = line.split('|');
    const folder = folderPart.replace('folder=', '').trim();
    const cj = path.join('tmp', 'one-article', folder, 'content.json');
    if (!fs.existsSync(cj)) continue;
    const titles = (JSON.parse(fs.readFileSync(cj, 'utf8')).headings || []).map((h) => String(h.title || ''));
    const s = titles.filter(isSentenceStyleHeadingTitle);
    const f = titles.filter((t) => t.trim().length < 4 || LONE.test(t.trim()));
    tot += titles.length; sent += s.length; frag += f.length;
    console.log(`${tag} ${mode}-${i}`.padEnd(18) + `서술 ${s.length}/${titles.length} 조각 ${f.length} | ` + s.concat(f).join(' · ').slice(0, 80));
  }
}
console.log(`\n합계: 소제목 ${tot} · 서술형 ${sent} (${Math.round(sent / tot * 100)}%) · 조각 ${frag}`);
