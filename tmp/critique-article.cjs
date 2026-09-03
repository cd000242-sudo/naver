/* eslint-disable no-console */
// 쇼핑 글 비평 도구 — tmp/one-article/<폴더>/content.json 을 읽어 감사 + 화자·중계·헤징 카운트를 낸다.
const fs = require('node:fs');
const path = require('node:path');
const { auditAffiliateAuthenticity } = require('../dist/content/affiliateAuthenticity.js');
const dir = process.argv[2] || fs.readdirSync('tmp/one-article').filter((d) => fs.existsSync(path.join('tmp/one-article', d, 'content.json'))).sort().pop();
const folder = path.isAbsolute(dir) ? dir : path.join('tmp/one-article', dir);
const c = JSON.parse(fs.readFileSync(path.join(folder, 'content.json'), 'utf8'));
const body = String(c.bodyPlain || '');
const title = String(c.selectedTitle || c.title || '');
const count = (re) => (body.match(re) || []).length;
const sentences = body.split(/(?<=[.!?。])\s+/).filter((s) => s.trim());
const relay = /구매자\s*(?:반응|의견|들은|는|도\s*있|가\s*있)|(?:한|또\s*다른|어떤|일부)\s*구매자|(?:라고|다고|고)\s*(?:남겼|적었|표현했|말했|전했|밝혔)|의견(?:이|도|은)\s*(?:있었|나옵|이어집|갈렸)|반응(?:이|도|은|에는)\s*(?:있|나옵|이어집|갈렸)|후기(?:를|에서|에는|에\s*따르면)|리뷰(?:를|에서|에는|에\s*따르면)/g;
const firstPerson = /써보니|저는|제\s*경우|제가|쓰다\s*보니|써\s*봤|해\s*봤|느꼈|저도|제\s*다리|제\s*방/g;
const hedge = /(?:수\s*있어요|수\s*있습니다|긴\s*해요|수도\s*있|편이에요|편입니다)[.!]?/g;
const meta = /묶어\s*말할|해석할\s*근거|같은\s*의미로|근거(?:가|는)\s*없|단정(?:하기|할\s*수)|확인되지\s*않|해당\s*구매자의\s*경험/g;
const spec = /KC\s*인증|인증\s*정보|R-REI|R-R-|제조국|제조자|소비자분쟁해결기준|이용약관|에너지소비효율/g;
const report = auditAffiliateAuthenticity({ title, body, evidenceMode: 'review_synthesis', aiExperienceOptIn: true });
console.log(`폴더: ${folder}`);
console.log(`제목: ${title}`);
console.log(`본문 ${body.length}자 · 문장 ${sentences.length}개 · 소제목 ${(c.headings || []).length}개`);
console.log(`감사(옵트인): ${report.score}/100 · ${report.issues.map((i) => i.code).join(', ') || '(이슈 없음)'}`);
console.log(`중계 어투 ${count(relay)} · 1인칭 표지 ${count(firstPerson)} · 헤징 종결 ${count(hedge)} · 면책 해설 ${count(meta)} · 규격/인증 나열 ${count(spec)} · "구매자" ${count(/구매자/g)}`);
const hits = (re) => sentences.filter((s) => re.test(s)).slice(0, 4).map((s) => '   - ' + s.slice(0, 110));
if (count(relay)) console.log('중계 예:\n' + hits(new RegExp(relay.source)).join('\n'));
if (count(meta)) console.log('면책 예:\n' + hits(new RegExp(meta.source)).join('\n'));
// [2026-09-03] 비쇼핑(여행·정보) 글 비평 — 후기 중계 · 자료 나열 · 문장형 소제목 · 추상 판정
const relayNonShop = /후기(?:에서는|도 있|의 관찰|가 있|를 보면|에 따르면)|후기 동선|사례에서는|블로그 사례|라고 소개됐|다고 합니다/g;
const materialNarration = /검색 결과에는|검색하면 나오는|작성된 .{0,20}글도|글에는 .{0,30}(?:등장|나옵)|자료에는/g;
const abstractJudgment = /인지가 기준이에요|인지가 기준입니다|인지를 보면 됩니다|기준이 됩니다\.?$/g;
// [2026-09-03] 종결 모양 기반 감지 — src/contentBodyTransforms.ts isSentenceStyleHeadingTitle 와 같은 규칙
const POLITE_STEM_VOWELS = new Set([0, 1, 4, 5, 6, 7, 9, 10, 11, 14, 15]);
const VERB_FINALS_BEFORE_DA = new Set([4, 18, 20]);
const NOUNS_ENDING_IN_YO = ['가요', '수요', '필요', '중요', '주요'];
const SENTENCE_FINAL_DA_WORDS = ['같다', '좋다', '많다', '낫다', '맞다', '다르다', '싶다', '크다', '작다', '길다', '짧다', '어렵다', '쉽다', '아니다', '것이다', '때문이다', '답이다', '뿐이다', '편이다', '셈이다', '중이다'];
const syl = (ch) => { const c = ch.charCodeAt(0); return c < 0xac00 || c > 0xd7a3 ? null : c - 0xac00; };
function isSentenceHeading(title) {
  const cleaned = String(title || '').trim().replace(/[.!?。？！]\s*$/u, '');
  if (cleaned.length < 2) return false;
  const last = cleaned.slice(-1); const p = syl(cleaned.slice(-2, -1));
  if (last === '요') return !NOUNS_ENDING_IN_YO.some((n) => cleaned.endsWith(n)) && p !== null && p % 28 === 0 && POLITE_STEM_VOWELS.has(Math.floor(p / 28) % 21);
  if (last === '죠') return p !== null;
  if (last === '다') return cleaned.endsWith('니다') || (p !== null && VERB_FINALS_BEFORE_DA.has(p % 28)) || SENTENCE_FINAL_DA_WORDS.some((w) => cleaned.endsWith(w));
  return false;
}
const heads = (c.headings || []).map((h) => String(h.title || ''));
console.log(`비쇼핑: 후기 중계 ${count(relayNonShop)} · 자료 나열 ${count(materialNarration)} · 추상 판정 ${count(abstractJudgment)} · 문장형 소제목 ${heads.filter((t) => isSentenceHeading(t.trim())).length}/${heads.length}`);
if (count(relayNonShop)) console.log('중계 예(비쇼핑):\n' + hits(new RegExp(relayNonShop.source)).join('\n'));
if (count(materialNarration)) console.log('자료 나열 예:\n' + hits(new RegExp(materialNarration.source)).join('\n'));
heads.forEach((t) => { if (isSentenceHeading(t.trim())) console.log('   문장형 소제목:', t); });
if (process.argv.includes('--full')) console.log('\n' + fs.readFileSync(path.join(folder, 'article.md'), 'utf8'));
