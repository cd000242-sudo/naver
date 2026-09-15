/**
 * blog-corpus-audit.mjs — 블로그가 쌓아온 글 전체를 보고 고칠 자리를 찾는다.
 *
 * [2026-09-15 사장님] "지금까지 작성한 글들이 있을 거 아냐. 블로그 자체를 최적화부터 시키자고."
 *
 * 앱이 추적한 113편은 7/13 이후 일부다. 블로그 자체를 보려면 블로그가 가진 글을 봐야 한다.
 * 네이버 블로그 RSS(rss.blog.naver.com/{id}.xml)는 최근 50편을 카테고리·태그·발행시각까지
 * 무료로 준다. 크롤링도 API 비용도 없다.
 *
 * 무엇을 보는가 — 전부 "내가 고칠 수 있는 것"만 본다.
 *   1. 주제 응집도   한 블로그가 여러 갈래로 흩어져 있는가
 *   2. 자기 잠식     내 글끼리 같은 검색어를 두고 경쟁하는가
 *   3. 발행 리듬     끊긴 구간이 있는가
 *   4. 제목 틀       같은 형태를 반복해 찍어내는가
 *   5. 태그 운용     비어 있거나 과한가
 *
 * 네이버 내부 기준은 공개돼 있지 않다. 여기서 점수를 매기지 않는다 —
 * 관측된 사실과 "고칠 수 있는 자리"만 적는다.
 *
 * 실행: node scripts/blog-corpus-audit.mjs [blogId ...]
 */

import { get } from 'node:https';

const DEFAULT_BLOGS = ['rimi_77-', 'leader_248', 'leadernam-', 'leader_145'];
const BLOGS = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_BLOGS;

// ─── RSS 적재 ─────────────────────────────────────────────
const unwrap = (v) => String(v ?? '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();

function fetchText(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

function field(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? unwrap(m[1]) : '';
}

function parseFeed(xml) {
  const head = xml.slice(0, xml.indexOf('<item>'));
  const blogTitle = field(head, 'title');
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, block]) => ({
    title: field(block, 'title'),
    category: field(block, 'category') || '(미분류)',
    link: field(block, 'link'),
    description: field(block, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    tags: field(block, 'tag').split(/[,\s]+/).filter(Boolean),
    at: new Date(field(block, 'pubDate')),
  })).filter((it) => it.title && !isNaN(it.at.getTime()));
  return { blogTitle, items };
}

// ─── 분석 헬퍼 ────────────────────────────────────────────
const STOP = new Set(['그리고', '하는', '이런', '저런', '확인', '가이드', '총정리', '정리', '방법', '기준', '경우', '지금', '오늘', '이번', '해야', '되는', '있는', '무엇', '어떻게', '때문']);

/** 제목에서 의미 있는 낱말만 — 2자 이상 한글/영숫자. */
function terms(text) {
  return String(text)
    .replace(/[^가-힣A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** 두 제목이 같은 검색 의도를 노리는가 — 낱말 겹침 비율(Jaccard). */
function overlap(a, b) {
  const A = new Set(terms(a)), B = new Set(terms(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** 제목 끝 형태 — 같은 틀을 반복하면 여기 쏠린다. */
function titleShape(title) {
  const t = title.trim();
  if (/[?？]$/.test(t)) return '물음표';
  if (/(총정리|정리)$/.test(t)) return '총정리';
  if (/(가이드|확인 가이드)$/.test(t)) return '가이드';
  if (/(합니다|입니다|해요|네요|더라고요)$/.test(t)) return '서술형 종결';
  if (/[가-힣]다$/.test(t)) return '평서 종결';
  if (/["“”']/.test(t)) return '인용 포함';
  if (/[·…,]/.test(t)) return '나열형';
  return '명사 종결';
}

// ─── 블로그 한 곳 진단 ────────────────────────────────────
function auditBlog(blogId, feed) {
  const { blogTitle, items } = feed;
  const out = [];
  out.push(`\n${'━'.repeat(62)}`);
  out.push(`■ ${blogId} — "${blogTitle}"`);
  const from = items.at(-1)?.at, to = items[0]?.at;
  out.push(`  최근 ${items.length}편 · ${from?.toISOString().slice(0, 10)} ~ ${to?.toISOString().slice(0, 10)}`);

  // 1. 주제 응집도
  const cats = {};
  items.forEach((it) => { cats[it.category] = (cats[it.category] || 0) + 1; });
  const catList = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const top3 = catList.slice(0, 3).reduce((n, [, c]) => n + c, 0);
  out.push(`\n  [주제 응집도] 카테고리 ${catList.length}개 · 상위 3개가 ${Math.round(top3 / items.length * 100)}% 차지`);
  catList.slice(0, 6).forEach(([c, n]) => out.push(`     ${String(n).padStart(3)}편  ${c}`));
  if (catList.length > 6) out.push(`     … 외 ${catList.length - 6}개`);

  // 2. 자기 잠식 — 내 글끼리 같은 검색어를 노리는 쌍
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s = overlap(items[i].title, items[j].title);
      if (s >= 0.4) pairs.push({ s, a: items[i], b: items[j] });
    }
  }
  pairs.sort((x, y) => y.s - x.s);
  out.push(`\n  [자기 잠식] 제목 낱말이 40% 이상 겹치는 쌍: ${pairs.length}건`);
  pairs.slice(0, 5).forEach((p) => {
    out.push(`     ${Math.round(p.s * 100)}%  ${p.a.at.toISOString().slice(5, 10)} ${p.a.title.slice(0, 32)}`);
    out.push(`           ${p.b.at.toISOString().slice(5, 10)} ${p.b.title.slice(0, 32)}`);
  });

  // 3. 발행 리듬
  const ts = items.map((it) => it.at.getTime()).sort((a, b) => a - b);
  const gaps = ts.slice(1).map((t, i) => (t - ts[i]) / 36e5);
  const spanDays = (ts.at(-1) - ts[0]) / 864e5;
  out.push(`\n  [발행 리듬] 간격 중앙 ${median(gaps).toFixed(1)}시간 · 최장 공백 ${(Math.max(...gaps) / 24).toFixed(1)}일 · 주당 ${(items.length / (spanDays / 7)).toFixed(1)}편`);
  const longGaps = gaps.filter((g) => g > 72).length;
  if (longGaps) out.push(`     3일 넘게 빈 구간 ${longGaps}회`);

  // 4. 제목 틀 반복
  const shapes = {};
  items.forEach((it) => { const s = titleShape(it.title); shapes[s] = (shapes[s] || 0) + 1; });
  const shapeList = Object.entries(shapes).sort((a, b) => b[1] - a[1]);
  const topShare = shapeList[0][1] / items.length;
  out.push(`\n  [제목 틀] ${shapeList.map(([s, n]) => `${s} ${n}`).join(' · ')}`);
  if (topShare >= 0.5) out.push(`     ⚠ "${shapeList[0][0]}" 하나가 ${Math.round(topShare * 100)}% — 같은 틀로 찍어내는 중`);

  // 5. 태그
  const noTag = items.filter((it) => it.tags.length === 0).length;
  const tagCounts = items.map((it) => it.tags.length);
  out.push(`\n  [태그] 태그 없는 글 ${noTag}편 · 평균 ${(tagCounts.reduce((a, c) => a + c, 0) / items.length).toFixed(1)}개`);

  return { text: out.join('\n'), stats: { items, catList, pairs, topShare, noTag, gaps } };
}

/** 관측에서 바로 나오는 손볼 자리. 점수를 매기지 않고 사실만 적는다. */
function actions(blogId, s) {
  const list = [];
  if (s.catList.length >= 8) list.push(`카테고리가 ${s.catList.length}개로 흩어져 있다 — 주력 3개로 묶고 나머지는 하위로 내릴 자리`);
  if (s.pairs.length >= 5) list.push(`제목이 겹치는 글 ${s.pairs.length}쌍 — 내 글끼리 같은 검색어를 두고 경쟁 중이다. 합치거나 각도를 갈라야 한다`);
  const maxGapDays = Math.max(...s.gaps) / 24;
  if (maxGapDays >= 7) list.push(`최장 ${maxGapDays.toFixed(0)}일 공백 — 끊긴 구간이 있다`);
  if (s.topShare >= 0.5) list.push(`제목 틀 하나가 ${Math.round(s.topShare * 100)}% — 형태를 섞을 자리`);
  if (s.noTag > 0) list.push(`태그 없는 글 ${s.noTag}편`);
  return list.length ? list : ['관측된 범위에서 손볼 자리가 두드러지지 않는다'];
}

// ─── 실행 ─────────────────────────────────────────────────
console.log('블로그 코퍼스 감사 — RSS 최근 50편 기준 (API 비용 0)');
const collected = [];
for (const blogId of BLOGS) {
  try {
    const feed = parseFeed(await fetchText(`https://rss.blog.naver.com/${blogId}.xml`));
    if (!feed.items.length) { console.log(`\n■ ${blogId} — RSS 에 글이 없다`); continue; }
    const r = auditBlog(blogId, feed);
    console.log(r.text);
    console.log('\n  ▸ 손볼 자리');
    actions(blogId, r.stats).forEach((a) => console.log(`     · ${a}`));
    collected.push({ blogId, feed });
  } catch (e) {
    console.log(`\n■ ${blogId} — RSS 실패: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 1200));
}

console.log(`\n${'━'.repeat(62)}`);
console.log('※ RSS 는 최근 50편만 준다 — 그 이전 글은 이 감사에 없다.');
console.log('※ 네이버 내부 기준은 공개돼 있지 않다. 여기 있는 건 관측된 사실뿐이다.');
