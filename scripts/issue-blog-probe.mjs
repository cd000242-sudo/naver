/**
 * issue-blog-probe.mjs — 연예·이슈 블로그의 글이 지금 실제로 어디에 있는지 잰다.
 *
 * [2026-09-15 사장님] "난 연예 이슈만 먼저 보고 싶어. 그 글이 지금 계속 작업하는 블로그라서."
 *
 * 코퍼스 감사(blog-corpus-audit)는 이 블로그의 기본 위생이 이미 좋다고 나왔다
 * (카테고리 6개·자기잠식 0쌍·최장 공백 2.5일). 그래서 더 안쪽을 본다 —
 * **어떤 글이 이기고 어떤 글이 지는가.**
 *
 * 방법
 *   RSS 로 최근 글을 받아, 제목 앞부분에서 사람이 실제로 칠 법한 검색어를 뽑고,
 *   통합탭을 그대로 fetch 해 내 글의 자리를 찾는다. API 비용 0.
 *
 * 정직하게 붙이는 단서
 *   - 검색어는 **내가 제목에서 뽑은 것**이지 사장님이 고른 키워드가 아니다.
 *     연예 이슈는 "인물명 + 사건"이 실제 검색어라 제목 앞머리와 대체로 일치하지만,
 *     빗나간 건은 결과에 그대로 표시한다.
 *   - 지금 순위는 발행 시점 순위가 아니다. 이슈 글은 시간이 지나면 밀린다.
 *     그래서 경과일을 항상 같이 적는다 — 이걸 빼고 비교하면 옛 글이 부당하게 나빠 보인다.
 */

import { get as httpsGet } from 'node:https';
import { probeDynamicSerp } from '../dist/analytics/dynamicSerpProbe.js';

const BLOG = process.argv[2] || 'leader_248';
const LIMIT = Number(process.argv[3] || 14);

const unwrap = (v) => String(v ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();

function fetchText(url) {
  return new Promise((resolve, reject) => {
    httpsGet(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

const field = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? unwrap(m[1]) : '';
};

/**
 * 제목에서 검색어를 뽑는다.
 *
 * 연예 이슈 제목은 "인물명 + 사건"으로 시작하고 뒤는 후킹 문구다.
 * 쉼표·말줄임·따옴표 앞까지가 검색 의도이고, 거기서 앞 3어절이면 충분하다.
 * 지어내지 않는다 — 제목에 있는 말만 쓴다.
 */
export function deriveIssueQuery(title) {
  let head = String(title)
    .replace(/^[“"'‘]/, '')
    .split(/[,，…·|｜"”]/)[0]
    .replace(/[?!.]+$/, '')
    .trim();
  const words = head.split(/\s+/).filter(Boolean);
  return words.slice(0, 3).join(' ');
}

const feed = await fetchText(`https://rss.blog.naver.com/${BLOG}.xml`);
const items = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)]
  .map(([, b]) => ({
    title: field(b, 'title'),
    category: field(b, 'category') || '(미분류)',
    at: new Date(field(b, 'pubDate')),
  }))
  .filter((i) => i.title && !isNaN(i.at.getTime()))
  .slice(0, LIMIT);

console.log(`통합탭 실측 — ${BLOG} 최근 ${items.length}편 · ${new Date().toLocaleString('ko-KR')}`);
console.log('경과  순위     카드  같은블로그  검색어 / 제목');
console.log('─'.repeat(78));

const rows = [];
for (const it of items) {
  const q = deriveIssueQuery(it.title);
  const ageDays = (Date.now() - it.at.getTime()) / 864e5;
  let rank = null, total = 0, ok = false, mine = 0;
  try {
    const r = await probeDynamicSerp(q, { maxCards: 30, timeout: 15000 });
    ok = r.fetchSuccess && r.totalCards > 0;
    total = r.totalCards;
    const idx = r.cards.findIndex((c) => c.blogger.toLowerCase() === BLOG.toLowerCase());
    rank = idx >= 0 ? idx + 1 : null;
    // 같은 이슈에 내 블로그 글이 여러 개 걸려 있으면 자기들끼리 자리를 나눠 갖는다.
    mine = r.cards.filter((c) => c.blogger.toLowerCase() === BLOG.toLowerCase()).length;
  } catch { /* 네트워크 실패는 판정 불가로 남긴다 */ }
  const verdict = !ok ? '판정불가' : rank ? `${rank}위` : '30위밖';
  console.log(
    `${ageDays.toFixed(1).padStart(4)}일 ${verdict.padEnd(8)} ${String(total).padStart(4)} ${String(mine).padStart(9)}  ${q}  ←  ${it.title.slice(0, 34)}`,
  );
  rows.push({ ...it, q, ageDays, rank, ok, mine });
  await new Promise((r) => setTimeout(r, 2500));
}

// ─── 요약 ─────────────────────────────────────────────────
const judged = rows.filter((r) => r.ok);
const top10 = judged.filter((r) => r.rank && r.rank <= 10);
console.log('\n' + '─'.repeat(78));
console.log(`판정 가능 ${judged.length}/${rows.length}편 · 10위 이내 ${top10.length}편 (${judged.length ? Math.round(top10.length / judged.length * 100) : 0}%)`);

const fresh = judged.filter((r) => r.ageDays <= 2);
const aged = judged.filter((r) => r.ageDays > 2);
const rateOf = (a) => (a.length ? `${a.filter((r) => r.rank && r.rank <= 10).length}/${a.length}` : '-');
console.log(`  2일 이내 글: ${rateOf(fresh)}   ·   2일 초과 글: ${rateOf(aged)}   ← 이슈 글은 밀린다, 나이를 빼고 보면 안 된다`);

const byCat = {};
judged.forEach((r) => { (byCat[r.category] ||= []).push(r); });
console.log('\n카테고리별 10위 이내');
Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)
  .forEach(([c, a]) => console.log(`  ${c.padEnd(14)} ${rateOf(a)}`));
