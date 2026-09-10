/**
 * SPEC-EVENT-RETRIEVAL-2026 Phase 0 측정 — 저장본 재계산, 유료 호출 없음.
 *
 * 자료 원문은 저장되지 않는다. 그래서 결과물(발행 본문)에서 억지 조립의 자국을 잰다:
 * 한 글 안의 섹션들이 같은 사건을 말하는가. 사건 서명 = 인물 ∪ 날짜.
 */
const path = require('path');
const fs = require('fs');
const D = path.join(__dirname, '..', '..', 'dist');
const { extractVerifiableClaims } = require(path.join(D, 'content/fabricationCheck.js'));
const { extractKoreanFactTokens } = require(path.join(D, 'content/koreanFactTokens.js'));

const signature = (text) => {
  const claims = extractVerifiableClaims(text || '');
  const people = new Set(claims.filter((c) => c.kind === 'people').map((c) => c.claim));
  const dates = new Set(claims.filter((c) => c.kind === 'date').map((c) => c.claim));
  for (const t of extractKoreanFactTokens(text || '', 12)) if (t.length === 3) people.add(t);
  return { people, dates };
};
const inter = (a, b) => [...a].filter((x) => b.has(x)).length;

const articles = JSON.parse(fs.readFileSync(process.env.APPDATA + '/better-life-naver/content-policy-articles.json', 'utf8'));
const rows = [];
for (const a of articles) {
  const heads = Array.isArray(a.headings) ? a.headings : [];
  const body = String(a.body || '');
  if (!body || heads.length < 2) continue;
  // 소제목 위치로 본문을 섹션으로 자른다
  const cuts = [];
  let from = 0;
  for (const h of heads) {
    const t = String(h?.title || h || '').trim();
    if (!t) continue;
    const at = body.indexOf(t, from);
    if (at < 0) continue;
    cuts.push({ title: t, at });
    from = at + t.length;
  }
  if (cuts.length < 2) continue;
  const sections = cuts.map((c, i) => body.slice(c.at, i + 1 < cuts.length ? cuts[i + 1].at : body.length));
  const whole = signature(body);
  if (whole.people.size === 0 && whole.dates.size === 0) continue;
  const sigs = sections.map(signature);
  /*
   * 고아 = **엔티티를 가졌는데** 다른 어느 섹션과도 인물·날짜가 하나도 안 겹치는 섹션.
   * 엔티티가 없는 섹션은 고아가 아니라 "근거 없음" 이다 — 여행·일상 글은 원래
   * 인물·날짜가 적다. 이걸 안 가르면 전부 고아로 세어 측정이 무의미해진다(1차 실패).
   */
  const evidenced = sigs.map((s) => s.people.size + s.dates.size > 0);
  const evidencedCount = evidenced.filter(Boolean).length;
  if (evidencedCount < 2) continue; // 비교할 근거가 2개 미만이면 판정 불가
  const orphan = sigs.filter((s, i) => {
    if (!evidenced[i]) return false;
    const others = sigs.filter((_, j) => j !== i && evidenced[j]);
    return others.length > 0 && others.every((o) => inter(s.people, o.people) === 0 && inter(s.dates, o.dates) === 0);
  }).length;
  rows.push({ id: a.article_id, title: a.title, sections: sigs.length, evidenced: evidencedCount, orphan,
    people: whole.people.size, dates: whole.dates.size, status: a.exposure_status });
}

const withOrphan = rows.filter((r) => r.orphan > 0);
console.log('=== Phase 0 기준선 ===');
console.log('분석 대상 글:', rows.length, '/ 저장 글', articles.length);
console.log('고아 섹션이 있는 글:', withOrphan.length, `(${(withOrphan.length / rows.length * 100).toFixed(1)}%)`);
const totalSec = rows.reduce((s, r) => s + r.evidenced, 0);
const totalOrphan = rows.reduce((s, r) => s + r.orphan, 0);
console.log('근거 있는 섹션:', totalSec, '/ 고아 섹션:', totalOrphan, `(${(totalOrphan / totalSec * 100).toFixed(1)}%)`);
console.log('\n--- 고아 섹션 많은 글 상위 10 ---');
withOrphan.sort((a, b) => b.orphan - a.orphan || b.sections - a.sections).slice(0, 10)
  .forEach((r) => console.log(` ${r.orphan}/${r.evidenced} 근거섹션(전체${r.sections}) · 인물${r.people} 날짜${r.dates} | ${r.title.slice(0, 42)}`));
fs.writeFileSync(path.join(__dirname, 'baseline.json'), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
console.log('\nbaseline.json 저장:', rows.length, '행');
