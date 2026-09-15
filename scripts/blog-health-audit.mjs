/**
 * blog-health-audit.mjs — 블로그 자체가 건강한가를 실측으로 가른다.
 *
 * [2026-09-15 사장님] "글을 잘 써서 올리는 것도 중요한데 문제는 내 블로그 자체가
 * 최적화가 되어 있냐는 거지."
 *
 * 그래서 이 하네스는 "글이 좋은가"를 보지 않는다. 같은 앱으로 쓴 글이 블로그마다
 * 다른 성적을 내는지 — 즉 차이가 글에서 오는지 블로그에서 오는지만 가른다.
 *
 * 설계 원칙
 *  - 측정 타당성을 먼저 감사한다. 제 제목을 그대로 검색해 1위를 찾은 건 노출이 아니다.
 *  - 대신 그 값을 버리지 않고 "자기제목 회수율"이라는 별도 지표로 쓴다.
 *    제 제목으로도 못 잡히면 그건 순위 문제가 아니라 수집/색인 문제다.
 *  - 프로브가 실패한 체크(카드 0개 파싱·fetch 오류)는 "미노출"이 아니다. 판정 불가다.
 *    실측에서 전체 체크의 52%가 이것이었다 — 미노출로 세면 모든 블로그 성적이 깎이고,
 *    실패율이 높은 블로그가 부당하게 나쁘게 보인다.
 *  - 표본이 작다. 모든 비율에 Wilson 95% 구간을 붙이고, 겹치면 "차이 없음"으로 읽는다.
 *  - 교란(모드·키워드 유형)을 통제한 뒤에도 남는 차이만 블로그 신호로 본다.
 *
 * 실행: node scripts/blog-health-audit.mjs [userDataDir]
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DATA_DIR = process.argv[2]
  || join(homedir(), 'AppData', 'Roaming', 'better-life-naver');

const TOP_N = 10;          // "노출"의 정의 — 통합탭 10위 이내
const MIN_SAMPLE = 5;      // 이보다 적으면 비율을 해석하지 않는다

// ─── 통계 헬퍼 ────────────────────────────────────────────
/** Wilson score 95% 신뢰구간 — 0/n, n/n 에서도 무너지지 않는다. */
function wilson(hit, n) {
  if (n === 0) return [0, 1];
  const z = 1.96, p = hit / n;
  const d = 1 + z * z / n;
  const c = p + z * z / (2 * n);
  const s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - s) / d), Math.min(1, (c + s) / d)];
}

/** 정확 이항검정(단측) — 기준선 p 에서 hit 이하가 나올 확률. */
function binomTailAtMost(hit, n, p) {
  let logFact = [0];
  for (let i = 1; i <= n; i++) logFact[i] = logFact[i - 1] + Math.log(i);
  let sum = 0;
  for (let k = 0; k <= hit; k++) {
    const logC = logFact[n] - logFact[k] - logFact[n - k];
    sum += Math.exp(logC + k * Math.log(p || 1e-12) + (n - k) * Math.log(1 - p || 1e-12));
  }
  return Math.min(1, sum);
}

/** 이진 라벨에 대한 연속값의 AUC. 0.5 = 무예측. */
function auc(pairs) {
  const pos = pairs.filter((x) => x.y === 1).map((x) => x.v);
  const neg = pairs.filter((x) => x.y === 0).map((x) => x.v);
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const ci = (hit, n) => { const [lo, hi] = wilson(hit, n); return `[${pct(lo)}~${pct(hi)}]`; };
const rate = (hit, n) => `${String(hit).padStart(3)}/${String(n).padEnd(3)} ${pct(hit / n).padStart(4)} ${ci(hit, n)}`;

// ─── 데이터 적재 ──────────────────────────────────────────
function loadJson(name) {
  const p = join(DATA_DIR, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const posts = loadJson('published-posts.json');
if (!posts) {
  console.error(`[BlogHealth] published-posts.json 없음: ${DATA_DIR}`);
  process.exit(1);
}
const articles = loadJson('content-policy-articles.json') || [];

const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();

/** 프로브가 판정에 실패한 체크 — 미노출이 아니라 "모름"이다. */
const PROBE_FAILURE_NOTE = /상위 0개 중 미발견|^fetch 실패|^오류:/;
const probeFailed = (c) => c.probeFailed === true || PROBE_FAILURE_NOTE.test(c.notes || '');

/** 글 하나를 판정 가능한 한 줄로 접는다. */
function fold(post) {
  const raw = Array.isArray(post.exposureChecks) ? post.exposureChecks : [];
  const checks = raw.filter((c) => !probeFailed(c));
  const found = checks.filter((c) => c.position != null);
  const bestPos = found.length ? Math.min(...found.map((c) => c.position)) : null;
  // 검색어가 제목 그대로면 "노출 측정"이 아니라 "자기 글 회수" 측정이다.
  const selfTitle = norm(post.keyword) === norm(post.title);
  return {
    id: post.id,
    blog: post.blogId || '(미상)',
    mode: post.mode || '(미상)',
    keyword: post.keyword || '',
    title: post.title || '',
    url: post.url || '',
    publishedAt: post.publishedAt || '',
    score: post.evaluator?.finalScore ?? null,
    humanlike: post.evaluator?.humanlikeScore ?? null,
    checks: checks.length,
    probeFails: raw.length - checks.length,
    selfTitle,
    bestPos,
    exposed: bestPos != null && bestPos <= TOP_N,
    everFound: bestPos != null,
  };
}

const allFolded = posts.map(fold);
const rows = allFolded.filter((r) => r.checks > 0);

// 구조 특징 조인 (본문·소제목은 정책 아카이브에만 있다)
const byUrl = new Map();
for (const a of articles) if (a.url) byUrl.set(String(a.url).trim(), a);
for (const r of rows) {
  const a = byUrl.get(r.url.trim());
  if (!a) continue;
  r.headingCount = Array.isArray(a.headings) ? a.headings.length : null;
  r.bodyLen = typeof a.body === 'string' ? a.body.length : null;
  r.introLen = typeof a.intro === 'string' ? a.intro.length : null;
}

const groupBy = (arr, f) => arr.reduce((o, r) => ((o[f(r)] ||= []).push(r), o), {});
const hits = (arr) => arr.filter((r) => r.exposed).length;

// ─── STAGE 0 — 측정 타당성 ────────────────────────────────
console.log('\n══ STAGE 0 · 측정 타당성 감사 ══════════════════════════');
const selfN = rows.filter((r) => r.selfTitle).length;
const rawChecks = posts.reduce((n, p) => n + (p.exposureChecks?.length || 0), 0);
const failChecks = posts.reduce((n, p) => n + (p.exposureChecks || []).filter(probeFailed).length, 0);
console.log(`  전체 체크            ${rawChecks}회 중 프로브 실패 ${failChecks}회 (${pct(failChecks / rawChecks)})  ← 판정 불가, 미노출 아님`);
console.log(`  판정 가능한 글        ${rows.length}편 (원본 ${posts.length}편, 유효 체크가 0인 ${allFolded.length - rows.length}편 제외)`);
console.log(`  검색어=제목 그대로    ${selfN}편 (${pct(selfN / rows.length)})  ← 노출 측정으로 못 씀`);
console.log(`  진짜 키워드로 측정    ${rows.length - selfN}편`);
console.log('  ※ 제 제목을 그대로 검색해 1위를 찾은 건 "노출"이 아니라 "색인 확인"이다.');
console.log('    아래에서 두 지표를 분리해 쓴다.');

// ─── STAGE 1 — 자기제목 회수율 (색인 건강) ─────────────────
console.log('\n══ STAGE 1 · 자기제목 회수율 = 색인 건강 ═══════════════');
console.log('  제 제목을 그대로 검색했을 때 1위로 잡히는가. 이건 순위 경쟁이 아니다.');
console.log('  못 잡히면 경쟁에서 밀린 게 아니라 수집·색인 쪽 문제다.\n');
const selfRows = rows.filter((r) => r.selfTitle);
const selfByBlog = groupBy(selfRows, (r) => r.blog);
for (const [blog, arr] of Object.entries(selfByBlog).sort((a, b) => b[1].length - a[1].length)) {
  const top1 = arr.filter((r) => r.bestPos === 1).length;
  const mark = arr.length < MIN_SAMPLE ? ' (표본 부족)' : '';
  console.log(`  ${blog.padEnd(14)} 1위회수 ${rate(top1, arr.length)}${mark}`);
}

// ─── STAGE 2 — 진짜 키워드 노출률 + 유의성 ────────────────
console.log('\n══ STAGE 2 · 진짜 키워드 노출률 (10위 이내) ════════════');
const realRows = rows.filter((r) => !r.selfTitle);
const baseline = hits(rows) / rows.length;
console.log(`  전체 기준선(전 지표 합산): ${pct(baseline)}\n`);
const realByBlog = groupBy(realRows, (r) => r.blog);
for (const [blog, arr] of Object.entries(realByBlog).sort((a, b) => b[1].length - a[1].length)) {
  const h = hits(arr);
  const mark = arr.length < MIN_SAMPLE ? ' (표본 부족 — 해석 보류)' : '';
  console.log(`  ${blog.padEnd(14)} ${rate(h, arr.length)}${mark}`);
}

console.log('\n  ── 블로그 전체(제목검색 포함) 기준 이항검정 ──');
for (const [blog, arr] of Object.entries(groupBy(rows, (r) => r.blog)).sort((a, b) => b[1].length - a[1].length)) {
  if (arr.length < MIN_SAMPLE) continue;
  const h = hits(arr);
  const p = binomTailAtMost(h, arr.length, baseline);
  const verdict = p < 0.01 ? '◀ 기준선보다 유의하게 낮음' : p < 0.05 ? '◀ 낮은 편' : '';
  console.log(`  ${blog.padEnd(14)} ${rate(h, arr.length)}  p=${p.toExponential(1)} ${verdict}`);
}

// ─── STAGE 3 — 교란 통제 ──────────────────────────────────
console.log('\n══ STAGE 3 · 교란 통제 (모드 구성이 원인인가) ══════════');
console.log('  블로그마다 쓰는 모드가 다르면 노출률 차이가 모드 탓일 수 있다.\n');
const modes = [...new Set(rows.map((r) => r.mode))];
const blogsBig = Object.entries(groupBy(rows, (r) => r.blog))
  .filter(([, a]) => a.length >= MIN_SAMPLE).map(([b]) => b);
process.stdout.write('  '.padEnd(16) + modes.map((m) => m.padEnd(16)).join('') + '\n');
for (const blog of blogsBig) {
  let line = '  ' + blog.padEnd(14);
  for (const m of modes) {
    const arr = rows.filter((r) => r.blog === blog && r.mode === m);
    line += (arr.length ? `${hits(arr)}/${arr.length}`.padEnd(16) : '-'.padEnd(16));
  }
  console.log(line);
}

// ─── STAGE 4 — 글 수준 특징 (블로그 고정효과 + 측정오염 통제) ─────────
console.log('\n══ STAGE 4 · 글 특징이 노출을 예측하는가 ═══════════════');
console.log('  두 겹으로 통제한다.');
console.log('   (1) 블로그 고정효과 — 표본이 가장 큰 블로그 안에서만 본다');
console.log('   (2) 측정 오염 — "제목 그대로 검색" 행을 빼고 다시 본다.');
console.log('       빼지 않으면 제목·키워드가 길수록 잘 잡히는 것처럼 보인다.');
console.log('       길어서 잘 잡힌 게 아니라, 제 제목을 검색했으니 당연히 잡힌 것이다.\n');
const anchorBlog = Object.entries(groupBy(rows, (r) => r.blog))
  .sort((a, b) => b[1].length - a[1].length)[0][0];
const inBlog = rows.filter((r) => r.blog === anchorBlog);
const inBlogClean = inBlog.filter((r) => !r.selfTitle);
const features = [
  ['품질 최종점수', (r) => r.score],
  ['사람같은 정도', (r) => r.humanlike],
  ['소제목 개수', (r) => r.headingCount],
  ['본문 길이', (r) => r.bodyLen],
  ['서론 길이', (r) => r.introLen],
  ['제목 길이', (r) => r.title.length],
  ['키워드 길이', (r) => r.keyword.length],
];

function aucTable(label, set) {
  console.log(`  ── ${label} · ${anchorBlog} ${set.length}편 / 노출 ${hits(set)}편 ──`);
  /*
   * AUC 는 두 그룹의 쌍 비교라, 작은 쪽 그룹이 한 자리면 한두 편이 바뀌어도 값이 크게 흔들린다.
   * 8편을 하한으로 둔다 — 넘지 못하면 숫자를 결론으로 쓰지 않는다.
   */
  const minorClass = Math.min(hits(set), set.length - hits(set));
  if (minorClass < 8) {
    console.log(`     ⚠ 검정력 부족 (작은 쪽 그룹 ${minorClass}편) — 방향 참고용, 결론으로 쓰지 말 것.`);
  }
  for (const [name, get] of features) {
    const pairs = set
      .map((r) => ({ v: get(r), y: r.exposed ? 1 : 0 }))
      .filter((x) => typeof x.v === 'number' && Number.isFinite(x.v));
    const a = auc(pairs);
    if (a == null) { console.log(`     ${name.padEnd(14)} 판정 불가 (한쪽 그룹이 비어 있음)`); continue; }
    const gap = Math.abs(a - 0.5);
    const strength = gap < 0.1 ? '무예측' : gap < 0.2 ? '약한 신호' : '신호 있음';
    const dir = a < 0.5 ? ' (↓ 낮을수록 노출)' : '';
    console.log(`     ${name.padEnd(14)} AUC ${a.toFixed(2)}  n=${String(pairs.length).padStart(3)}  ${strength}${dir}`);
  }
  console.log('');
}
aucTable('오염 포함 — 읽지 말 것(대조용)', inBlog);
aucTable('오염 제거 — 진짜 키워드만', inBlogClean);

// ─── STAGE 5 — 검정력·한계 ────────────────────────────────
console.log('\n══ STAGE 5 · 이 결과로 말할 수 있는 것과 없는 것 ═══════');
const joined = rows.filter((r) => r.headingCount != null).length;
console.log(`  구조 특징 조인 성공   ${joined}/${rows.length}편 ${joined < rows.length * 0.5 ? '← 절반 미만, STAGE 4는 참고용' : ''}`);
console.log(`  표본 ${MIN_SAMPLE}편 미만 블로그  ${Object.entries(groupBy(rows, (r) => r.blog)).filter(([, a]) => a.length < MIN_SAMPLE).map(([b, a]) => `${b}(${a.length})`).join(', ') || '없음'}`);
console.log('  · 비율 구간이 겹치는 블로그끼리는 "차이 있다"고 말할 수 없다.');
console.log('  · AUC 는 인과가 아니라 상관이다. 같은 블로그 안에서만 계산해 블로그 효과는 뺐다.');
console.log('  · 네이버의 내부 기준은 공개돼 있지 않다. 여기 있는 건 전부 관측된 결과뿐이다.\n');
