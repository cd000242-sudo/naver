const path = require('path'); const fs = require('fs');
const D = path.join(__dirname, '..', '..', 'dist');
const { extractVerifiableClaims } = require(path.join(D, 'content/fabricationCheck.js'));
const { extractKoreanFactTokens } = require(path.join(D, 'content/koreanFactTokens.js'));
const articles = JSON.parse(fs.readFileSync(process.env.APPDATA + '/better-life-naver/content-policy-articles.json', 'utf8'));
const want = ['블랙핑크 10주년', '거제 근포땅굴 여행', '한다감 임신'];
for (const key of want) {
  const a = articles.find((x) => String(x.title || '').includes(key));
  if (!a) { console.log('없음:', key); continue; }
  console.log('\n===', a.title.slice(0, 50));
  const heads = (a.headings || []).map((h) => String(h?.title || h || '').trim()).filter(Boolean);
  const body = String(a.body || '');
  let from = 0; const cuts = [];
  for (const t of heads) { const at = body.indexOf(t, from); if (at >= 0) { cuts.push({ t, at }); from = at + t.length; } }
  cuts.forEach((c, i) => {
    const sec = body.slice(c.at, i + 1 < cuts.length ? cuts[i + 1].at : body.length);
    const cl = extractVerifiableClaims(sec);
    const ppl = cl.filter((x) => x.kind === 'people').map((x) => x.claim);
    const dt = cl.filter((x) => x.kind === 'date').map((x) => x.claim);
    const tok3 = extractKoreanFactTokens(sec, 12).filter((t) => t.length === 3);
    console.log(` [${i + 1}] ${c.t.slice(0, 24)}`);
    console.log(`     people=${JSON.stringify(ppl)} date=${JSON.stringify(dt)} 3자토큰=${JSON.stringify(tok3)}`);
  });
}
