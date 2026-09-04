// 3자 비교 — 앱(API 키) vs 앱(에이전트 구독) vs LLM 직접 작성.
// 같은 키워드·같은 평가기·같은 크롤 자료로 채점한다.
// npx tsx tmp/compare-3way.cjs
const fs = require('fs');
const path = require('path');
const { evaluate } = require(path.resolve('src/content/qualityEvaluator.ts'));
const { checkTitlePayoff } = require(path.resolve('src/content/titlePayoffCheck.ts'));
const { checkTitleAnswer } = require(path.resolve('src/content/titleAnswerCheck.ts'));
const { isSentenceStyleHeadingTitle } = require(path.resolve('src/contentBodyTransforms.ts'));

const SIDES = [
  { label: '앱-API', batch: 'verify' },
  { label: '앱-에이전트', batch: 'agent' },
];

function readBatch(tag) {
  const idx = path.join('tmp', 'one-article', `batch-${tag}`, 'index.txt');
  if (!fs.existsSync(idx)) return [];
  const out = [];
  for (const line of fs.readFileSync(idx, 'utf8').split('\n').filter(Boolean)) {
    const [mode, i, kw, , folderPart] = line.split('|');
    const folder = folderPart.replace('folder=', '').trim();
    const dir = path.join('tmp', 'one-article', folder);
    const cj = path.join(dir, 'content.json');
    if (!fs.existsSync(cj)) continue;
    out.push({ mode, kw, doc: JSON.parse(fs.readFileSync(cj, 'utf8')), material: fs.readFileSync(path.join(dir, 'material.txt'), 'utf8'), log: path.join('tmp', 'one-article', `batch-${tag}`, `${mode}-${i}.log`) });
  }
  return out;
}

function score(label, mode, kw, doc, material, logPath) {
  const headings = (doc.headings || []).map((h) => ({ title: String(h.title || ''), content: String(h.content || '') }));
  const body = [doc.introduction, ...headings.map((h) => `${h.title}\n${h.content}`), doc.conclusion].filter(Boolean).join('\n\n');
  const r = evaluate({ body, title: doc.selectedTitle || '', headings, mode, contentMode: mode, rawText: material, groundingText: material, primaryKeyword: kw, sourceIsUrl: false });
  const payoff = checkTitlePayoff({ title: doc.selectedTitle || '', primaryKeyword: kw, payoffZone: [doc.introduction, headings[0] && headings[0].title, headings[0] && headings[0].content].filter(Boolean).join('\n') });
  const answer = checkTitleAnswer({ title: doc.selectedTitle || '', primaryKeyword: kw, introduction: String(doc.introduction || ''), body: headings.map((h) => `${h.title}\n${h.content}`).join('\n') });
  let elapsed = null, cost = 0, blueprint = null;
  if (logPath && fs.existsSync(logPath)) {
    const log = fs.readFileSync(logPath, 'utf8');
    const e = log.match(/one-article\] 완료 (\d+)s/); elapsed = e ? +e[1] : null;
    const bp = log.match(/\[Blueprint\] ✅ 인용 (\d+)·사실 (\d+)/); blueprint = bp ? `q${bp[1]}f${bp[2]}` : (/\[Blueprint\] ⚠️/.test(log) ? '실패' : null);
    for (const m of log.matchAll(/promptTokens=(\d+) cachedTokens=(\S+) completionTokens=(\d+)/g)) {
      const cached = Number.isFinite(+m[2]) ? +m[2] : 0;
      cost += ((+m[1] - cached) * 2.5 + cached * 0.25 + (+m[3]) * 15) / 1e6;
    }
  }
  return {
    label, mode, kw,
    modeScore: r.modeScore.score, final: r.finalScore, safety: r.safetyScore.score, human: r.humanlikeScore.score, decision: r.decision,
    payoff: payoff.checked ? Math.round(payoff.coverage * 100) : null,
    answer: answer.checked ? Math.round(answer.answerRate * 100) : null,
    quotes: (body.match(/["“][^"”\n]{8,160}["”]/g) || []).length,
    headings: headings.length, sentence: headings.filter((h) => isSentenceStyleHeadingTitle(h.title)).length,
    chars: body.replace(/\s/g, '').length, elapsed, cost: +cost.toFixed(3), blueprint,
    issues: [...r.safetyScore.issues, ...r.modeScore.issues],
  };
}

const byKw = new Map();
for (const side of SIDES) {
  for (const p of readBatch(side.batch)) {
    if (!byKw.has(p.kw)) byKw.set(p.kw, { material: p.material, mode: p.mode, rows: [] });
    byKw.get(p.kw).rows.push(score(side.label, p.mode, p.kw, p.doc, p.material, p.log));
  }
}
for (const [kw, entry] of byKw) {
  const llmPath = path.join('tmp', 'llm-baseline', `${entry.mode}__${kw}.json`);
  if (!fs.existsSync(llmPath)) continue;
  const llm = JSON.parse(fs.readFileSync(llmPath, 'utf8'));
  const row = score('LLM직접', entry.mode, kw, llm, entry.material, null);
  row.cost = llm.cost || 0;
  entry.rows.push(row);
}

const agentKws = new Set(readBatch('agent').map((p) => p.kw));
const pad = (v, n) => String(v == null ? '-' : v).padStart(n);
console.log('키워드                    | 쪽          | 모드 종합 안전 사람 | 결정       | 상환 응답 | 인용 소제목(서술) | 글자 | 소요 | $');
for (const [kw, entry] of byKw) {
  if (!agentKws.has(kw)) continue;
  for (const r of entry.rows) {
    console.log(`${kw.padEnd(22)} | ${r.label.padEnd(11)} | ${pad(r.modeScore, 4)} ${pad(r.final, 4)} ${pad(r.safety, 4)} ${pad(r.human, 4)} | ${r.decision.padEnd(10)} | ${pad(r.payoff, 4)} ${pad(r.answer, 4)} | ${pad(r.quotes, 4)} ${pad(r.headings, 6)}(${r.sentence}) | ${pad(r.chars, 4)} | ${pad(r.elapsed, 4)}s | ${r.cost.toFixed(3)}`);
  }
  console.log('');
}
console.log('=== 평균 (에이전트가 돈 키워드만) ===');
console.log('쪽          | 편 | 모드 종합 안전 사람 | pass | 상환 응답 | 인용≥1 | 서술형 | 글자 | 소요 | 편당 $');
for (const label of ['앱-API', '앱-에이전트', 'LLM직접']) {
  const rows = [...byKw.entries()].filter(([kw]) => agentKws.has(kw)).flatMap(([, e]) => e.rows.filter((r) => r.label === label));
  if (rows.length === 0) continue;
  const avg = (k) => { const g = rows.filter((r) => r[k] != null); return g.length ? Math.round(g.reduce((a, r) => a + r[k], 0) / g.length) : null; };
  console.log(`${label.padEnd(11)} | ${rows.length}  | ${pad(avg('modeScore'), 4)} ${pad(avg('final'), 4)} ${pad(avg('safety'), 4)} ${pad(avg('human'), 4)} | ${rows.filter((r) => r.decision === 'pass').length}/${rows.length}  | ${pad(avg('payoff'), 4)} ${pad(avg('answer'), 4)} | ${rows.filter((r) => r.quotes >= 1).length}/${rows.length}    | ${rows.reduce((a, r) => a + r.sentence, 0)}/${rows.reduce((a, r) => a + r.headings, 0)}    | ${pad(avg('chars'), 4)} | ${pad(avg('elapsed'), 4)}s | ${(rows.reduce((a, r) => a + r.cost, 0) / rows.length).toFixed(3)}`);
}
