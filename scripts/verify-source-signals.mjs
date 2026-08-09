#!/usr/bin/env node
/**
 * 실시간 스냅샷 검증 하네스
 *
 * 왜 필요한가:
 *   정책 레인이 오래 0건이었는데 아무도 몰랐다. 수집기가 실패해도 조용히
 *   빈 배열을 돌려주고, 레인은 스냅샷에서 통째로 빠지고, 화면엔 "원본 수집 중"
 *   만 떴다. 실패가 사람 눈에 닿기까지 며칠이 걸렸다.
 *
 *   브리프도 마찬가지다. 선택한 키워드에 기사 사실이 안 붙으면 마인드맵이
 *   껍데기가 되는데, 몇 %가 비었는지 아무도 세지 않았다.
 *
 *   그래서 "무엇이 있어야 정상인가" 를 코드로 못 박고, 어긋나면 실패시킨다.
 *
 * 사용:
 *   node scripts/verify-source-signals.mjs                  로컬 파일 검사
 *   node scripts/verify-source-signals.mjs --live           배포본 검사
 *   node scripts/verify-source-signals.mjs --min-brief=90   브리프 커버리지 하한(%)
 *   node scripts/verify-source-signals.mjs --warn-only      실패해도 exit 0 (관측용)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = join(ROOT, 'spa', 'public', 'data', 'source-signals.json');
const LIVE = 'https://leaderspro.kr/data/source-signals.json';

/** 반드시 있어야 하는 레인과 최소 건수. 하나라도 비면 화면에 빈 탭이 생긴다. */
const REQUIRED_LANES = [
  { id: 'naver', min: 5 },
  { id: 'daum', min: 5 },
  { id: 'nate', min: 3 },
  { id: 'zum', min: 5 },
  { id: 'policy', min: 3 },
  { id: 'issue', min: 3 },
];

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const hasFlag = (name) => process.argv.includes(`--${name}`);

const MIN_BRIEF_PCT = Number(arg('min-brief', 85));
/** 스냅샷이 이보다 오래되면 크론이 멈춘 것이다. */
const MAX_AGE_MIN = Number(arg('max-age', 90));

function hasBrief(item) {
  const insight = item?.insight;
  if (!insight) return false;
  const facts = insight.facts;
  if (Array.isArray(facts) && facts.length > 0) return true;
  return Boolean(insight.body || insight.summary);
}

async function loadSnapshot() {
  if (hasFlag('live')) {
    const res = await fetch(`${LIVE}?cb=${Date.now()}`);
    if (!res.ok) throw new Error(`배포본 HTTP ${res.status}`);
    return { source: LIVE, data: await res.json() };
  }
  if (!existsSync(LOCAL)) throw new Error(`파일 없음: ${LOCAL}`);
  return { source: LOCAL, data: JSON.parse(readFileSync(LOCAL, 'utf8')) };
}

const problems = [];
const notes = [];

const { source, data } = await loadSnapshot();
const lanes = new Map((data.lanes || []).map((lane) => [lane.id, lane]));

console.log('='.repeat(66));
console.log('실시간 스냅샷 검증');
console.log('='.repeat(66));
console.log(`대상    ${source}`);
console.log(`갱신    ${data.updatedAt || '(없음)'}`);

// ── 신선도 ───────────────────────────────────────────────────────────
if (data.updatedAt) {
  const ageMin = Math.round((Date.now() - new Date(data.updatedAt).getTime()) / 60000);
  const stale = ageMin > MAX_AGE_MIN;
  console.log(`나이    ${ageMin}분 ${stale ? `← ${MAX_AGE_MIN}분 초과` : ''}`);
  if (stale) problems.push(`스냅샷이 ${ageMin}분 전 것이다. 크론이 멈췄는지 확인 필요`);
} else {
  problems.push('updatedAt 이 없다');
}

// ── 레인 ─────────────────────────────────────────────────────────────
console.log('\n레인');
console.log('-'.repeat(66));
let total = 0;
let withBrief = 0;
const missingBrief = [];

for (const required of REQUIRED_LANES) {
  const lane = lanes.get(required.id);
  const items = lane?.items || [];
  total += items.length;
  const laneBriefs = items.filter(hasBrief).length;
  withBrief += laneBriefs;
  items.filter((i) => !hasBrief(i)).forEach((i) => missingBrief.push(`${required.id}: ${i.keyword}`));

  const pct = items.length ? Math.round((laneBriefs / items.length) * 100) : 0;
  const ok = items.length >= required.min;
  console.log(
    `  ${ok ? 'OK  ' : '❌  '}${required.id.padEnd(7)}${String(items.length).padStart(3)}건`
    + `  (최소 ${required.min})  브리프 ${String(pct).padStart(3)}%`,
  );
  if (!lane) problems.push(`${required.id} 레인이 스냅샷에 아예 없다 — 수집기가 0건을 돌려줬다`);
  else if (items.length < required.min) problems.push(`${required.id} 레인 ${items.length}건 (최소 ${required.min})`);
}

for (const lane of lanes.keys()) {
  if (!REQUIRED_LANES.some((r) => r.id === lane)) notes.push(`알 수 없는 레인: ${lane}`);
}

// ── 브리프 커버리지 ──────────────────────────────────────────────────
const briefPct = total ? Math.round((withBrief / total) * 100) : 0;
console.log('\n브리프 커버리지');
console.log('-'.repeat(66));
console.log(`  ${withBrief}/${total}건 = ${briefPct}%  (하한 ${MIN_BRIEF_PCT}%)`);
if (briefPct < MIN_BRIEF_PCT) {
  problems.push(`브리프 커버리지 ${briefPct}% < 하한 ${MIN_BRIEF_PCT}%`);
}
if (missingBrief.length > 0) {
  console.log('  브리프 없는 항목:');
  missingBrief.slice(0, 10).forEach((m) => console.log(`    · ${m}`));
  if (missingBrief.length > 10) console.log(`    … 그 외 ${missingBrief.length - 10}건`);
}

// ── 브리프 내용 품질 ─────────────────────────────────────────────────
// 사실이 있다고 다 쓸 수 있는 게 아니다. 출처 없는 사실은 확인할 방법이 없다.
let noLink = 0;
let noTitle = 0;
for (const lane of lanes.values()) {
  for (const item of lane.items || []) {
    if (!hasBrief(item)) continue;
    const insight = item.insight || {};
    if (!(insight.links || []).length) noLink += 1;
    if (!insight.titles?.seo && !insight.titles?.home) noTitle += 1;
  }
}
console.log('\n브리프 내용');
console.log('-'.repeat(66));
console.log(`  출처 링크 없음  ${noLink}건`);
console.log(`  추천 제목 없음  ${noTitle}건`);
if (withBrief > 0 && noLink / withBrief > 0.5) {
  problems.push(`브리프 절반 이상(${noLink}/${withBrief})에 출처 링크가 없다 — 확인 경로가 끊긴다`);
}

// ── 결과 ─────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(66));
notes.forEach((n) => console.log(`참고: ${n}`));
if (problems.length === 0) {
  console.log('통과 — 모든 레인과 브리프 커버리지가 기준을 만족한다.');
  process.exit(0);
}
console.log(`문제 ${problems.length}건`);
problems.forEach((p) => console.log(`  ❌ ${p}`));
process.exit(hasFlag('warn-only') ? 0 : 1);
