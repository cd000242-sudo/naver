/**
 * 노출 실측 감사 — 게이트 점수와 본문 축이 *실제 노출*을 예측하는지 정답표로 검정한다.
 *
 *   npx tsx scripts/exposure-gate-audit.ts
 *
 * 정답표: published-posts.json 의 exposureChecks (exposurePoller 가 24/48/72h 에 통합탭을
 * 실측). 판정 불가(프로브 무응답) 기록은 splitExposureGroups 가 걸러낸다 — 무응답을
 * 미노출로 세면 2026-07~08 처럼 표본이 통째로 오염된다.
 *
 * 2026-09-11 최초 실행 (노출 20 · 미노출 19 · 판정불가 63):
 *   - 게이트 전 항목이 무변별. finalScore AUC 0.46, modeScore 0.39, humanlike 0.51.
 *     점수를 올려도 노출은 오르지 않는다 — 임계 상향의 근거가 없다.
 *   - 유일한 후보 신호는 소제목 수 (AUC 0.74, 5.4개 vs 4.2개). 모드 내부에서도 유지
 *     (seo 0.75 · homefeed 0.81), affiliate 는 무관(0.52).
 *   - 표본이 작다(모드별 6~16편). 데이터가 쌓이면 다시 돌려서 확인할 것.
 *
 * AUC 읽는 법: 0.5 = 무변별, 1.0 = 완전 예측, 0.0 = 완전 역방향.
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadPublishedPosts, splitExposureGroups } from '../src/analytics/publishedPostTracker';
import { evaluateHumanlike } from '../src/content/evaluators/humanlikeEval';

const TONE = ['거든요','잖아요','더라고요','네요','죠','는데요','군요','라니','말이죠','싶어요','같아요'];
const occ = (t: string, w: string) => t.split(w).length - 1;
const sumw = (t: string, ws: string[]) => ws.reduce((a, w) => a + occ(t, w), 0);

const USER = path.join(process.env.APPDATA || '', 'better-life-naver');
const arts: any[] = (() => { const j = JSON.parse(fs.readFileSync(path.join(USER, 'content-policy-articles.json'), 'utf8')); return Array.isArray(j) ? j : Object.values(j)[0] as any[]; })();
const byTitle = new Map<string, any>();
for (const a of arts) byTitle.set(String(a.title || '').trim(), a);

const posts = loadPublishedPosts(USER);
const { exposed, notExposed } = splitExposureGroups(posts);
const feat = (p: any) => {
  const a = byTitle.get(String(p.title || '').trim());
  if (!a) return null;
  const body = String(a.body || '');
  if (!body) return null;
  const h = evaluateHumanlike({ body, title: String(a.title || ''), mode: 'general' } as any);
  return {
    본문길이: body.length,
    제목길이: String(p.title || '').length,
    소제목수: Array.isArray(a.headings) ? a.headings.length : 0,
    질문수: (body.split('?').length - 1),
    말투밀도: sumw(body, TONE) / Math.max(1, body.length) * 1000,
    사람다움: h.score,
    문장분산: Number((h.details as any).burstinessStdDev) || 0,
  } as Record<string, number>;
};
const withMode = (ps: any[]) => ps.map(p => { const f = feat(p); return f ? { mode: String(p.mode || '?'), f } : null; }).filter(Boolean) as { mode: string; f: Record<string, number> }[];
const AM = withMode(exposed), BM = withMode(notExposed);
const A = exposed.map(feat).filter(Boolean) as Record<string, number>[];
const B = notExposed.map(feat).filter(Boolean) as Record<string, number>[];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const auc = (a: number[], b: number[]) => { let w = 0, t = 0; for (const x of a) for (const y of b) { t++; if (x > y) w++; else if (x === y) w += 0.5; } return t ? w / t : NaN; };
const gv = (p: any, k: string) => { const e = p.evaluator || {}; if (k in e) return Number(e[k]); const d = e.details || {}; return k in d ? Number(d[k]) : NaN; };
const GATE_KEYS = ['finalScore', 'modeScore', 'safetyScore', 'humanlikeScore', 'originality', 'firstParty', 'rewriteCount'];
console.log('정답표 — 노출 ' + exposed.length + ' · 미노출 ' + notExposed.length);
console.log('');
console.log('게이트 항목'.padEnd(18) + '노출평균  미노출평균    AUC   판정');
for (const k of GATE_KEYS) {
  const a = exposed.map(p => gv(p, k)).filter(Number.isFinite);
  const b = notExposed.map(p => gv(p, k)).filter(Number.isFinite);
  if (!a.length || !b.length) continue;
  const u = auc(a, b);
  console.log(k.padEnd(18) + mean(a).toFixed(1).padStart(7) + mean(b).toFixed(1).padStart(10) + u.toFixed(2).padStart(8)
    + '  ' + (u >= 0.65 ? '예측함' : u <= 0.35 ? '역방향 예측' : '무관'));
}
console.log('');
console.log('조인 성공 — 노출 ' + A.length + ' · 미노출 ' + B.length);
console.log('');
console.log('축'.padEnd(12) + '노출평균  미노출평균    AUC   판정');
for (const k of Object.keys(A[0] || {})) {
  const a = A.map(x => x[k]), b = B.map(x => x[k]);
  const u = auc(a, b);
  const v = u >= 0.65 ? '예측함' : u <= 0.35 ? '역방향 예측' : '무관';
  console.log(k.padEnd(12) + mean(a).toFixed(1).padStart(7) + mean(b).toFixed(1).padStart(10) + u.toFixed(2).padStart(8) + '  ' + v);
}

console.log('');
console.log('모드 내부 — 소제목 수');
const modes = [...new Set([...AM, ...BM].map(x => x.mode))];
for (const m of modes) {
  const a = AM.filter(x => x.mode === m).map(x => x.f['소제목수']);
  const b = BM.filter(x => x.mode === m).map(x => x.f['소제목수']);
  if (!a.length || !b.length) { console.log('  ' + m.padEnd(16) + '노출 ' + a.length + ' / 미노출 ' + b.length + ' — 한쪽이 비어 비교 불가'); continue; }
  console.log('  ' + m.padEnd(16) + '노출 ' + mean(a).toFixed(1) + '개(n=' + a.length + ') vs 미노출 ' + mean(b).toFixed(1) + '개(n=' + b.length + ')  AUC ' + auc(a, b).toFixed(2));
}

// ── 키워드 모양 vs 노출 ────────────────────────────────────────────────
// 2026-09-11 실측(affiliate 11편): 키워드에 상황어가 있으면 3/3 노출, 없으면 0/6.
// 상품명으로 검색하면 상위가 스마트스토어·공식몰이라 블로그가 낄 자리가 없다.
const KW_SITUATION = /고민|기준|고르는|후기|써본|예민|비교|차이|이유|어떤|방법|추천|증상|관리|볼륨|탈모|소음|세척|저녁|아침|처음|언제/;
console.log('');
console.log('키워드 모양 vs 노출 (모드별)');
const modesAll = [...new Set([...exposed, ...notExposed].map(p => String((p as any).mode || '?')))];
for (const m of modesAll) {
  const rows = [
    ...exposed.filter(p => String((p as any).mode) === m).map(p => ({ ok: true, kw: String((p as any).keyword || '') })),
    ...notExposed.filter(p => String((p as any).mode) === m).map(p => ({ ok: false, kw: String((p as any).keyword || '') })),
  ];
  const grp = (has: boolean) => {
    const g = rows.filter(r => KW_SITUATION.test(r.kw) === has);
    return g.length ? g.filter(r => r.ok).length + '/' + g.length : '-';
  };
  console.log('  ' + m.padEnd(16) + '상황어 있음 ' + grp(true).padStart(6) + '   없음 ' + grp(false).padStart(6));
}
