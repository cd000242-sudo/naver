/**
 * 공통어를 사전 없이 데이터로 정한다 — 문서 빈도(DF)가 높은 말은 그 글만의 말이 아니다.
 * 저장된 글 150편에서 DF 를 세면 "화장실·주차장·소속사" 는 걸러지고
 * "김영웅·한다감·근포땅굴" 같은 그 사건만의 말이 남는다. 유료 호출 0.
 */
const path = require('path'); const fs = require('fs');
const D = path.join(__dirname, '..', '..', 'dist');
const { extractKoreanFactTokens } = require(path.join(D, 'content/koreanFactTokens.js'));
const articles = JSON.parse(fs.readFileSync(process.env.APPDATA + '/better-life-naver/content-policy-articles.json', 'utf8'));

const df = new Map();
for (const a of articles) {
  const toks = new Set(extractKoreanFactTokens(String(a.body || ''), 400));
  for (const t of toks) df.set(t, (df.get(t) || 0) + 1);
}
const N = articles.length;
const sorted = [...df.entries()].sort((x, y) => y[1] - x[1]);
console.log('총 토큰:', df.size, '/ 문서', N);
console.log('\n--- DF 상위 25 (공통어 후보) ---');
console.log(sorted.slice(0, 25).map(([t, c]) => `${t}(${c})`).join(' '));
for (const cut of [0.10, 0.05, 0.03, 0.02]) {
  const th = Math.max(2, Math.ceil(N * cut));
  const common = sorted.filter(([, c]) => c >= th).length;
  console.log(`DF >= ${th} (${(cut * 100).toFixed(0)}%) → 공통어 ${common}개, 남는 고유어 ${df.size - common}개`);
}
const th = Math.max(2, Math.ceil(N * 0.03));
const stop = new Set(sorted.filter(([, c]) => c >= th).map(([t]) => t));
fs.writeFileSync(path.join(__dirname, 'stopwords.json'), JSON.stringify({ N, threshold: th, words: [...stop] }, null, 2));
console.log('\n--- 검증: 이 말들이 걸러지나 ---');
for (const w of ['화장실', '주차장', '소속사', '스케줄', '플랫폼', '해산물', '한다감', '근포마', '매미성', '블링크']) {
  console.log(` ${w.padEnd(5)} DF=${String(df.get(w) ?? 0).padStart(3)} → ${stop.has(w) ? '공통어(제외)' : '고유어(유지)'}`);
}
