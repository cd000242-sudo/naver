// 앱 글 vs LLM 직접 작성 글 — 같은 평가기·같은 자료로 채점한다.
// npx tsx tmp/compare-vs-llm.cjs verify
const fs = require('fs');
const path = require('path');
const { evaluate } = require(path.resolve('src/content/qualityEvaluator.ts'));
const { checkTitlePayoff } = require(path.resolve('src/content/titlePayoffCheck.ts'));
const { checkTitleAnswer } = require(path.resolve('src/content/titleAnswerCheck.ts'));
const { isSentenceStyleHeadingTitle } = require(path.resolve('src/contentBodyTransforms.ts'));

const tag = process.argv[2] || 'verify';
const dir = path.join('tmp', 'one-article', `batch-${tag}`);

function score(label, mode, kw, doc, material) {
  const headings = (doc.headings || []).map((h) => ({ title: String(h.title || ''), content: String(h.content || '') }));
  const body = [doc.introduction, ...headings.map((h) => `${h.title}\n${h.content}`), doc.conclusion].filter(Boolean).join('\n\n');
  const r = evaluate({
    body, title: doc.selectedTitle || '', headings, mode, contentMode: mode,
    rawText: material, groundingText: material, primaryKeyword: kw, sourceIsUrl: false,
  });
  const payoff = checkTitlePayoff({ title: doc.selectedTitle || '', primaryKeyword: kw,
    payoffZone: [doc.introduction, headings[0] && headings[0].title, headings[0] && headings[0].content].filter(Boolean).join('\n') });
  const answer = checkTitleAnswer({ title: doc.selectedTitle || '', primaryKeyword: kw,
    introduction: String(doc.introduction || ''), body: headings.map((h) => `${h.title}\n${h.content}`).join('\n') });
  const quotes = (body.match(/["“][^"”\n]{8,160}["”]/g) || []).length;
  const sentence = headings.filter((h) => isSentenceStyleHeadingTitle(h.title)).length;
  return {
    label, mode, kw,
    modeScore: r.modeScore.score, final: r.finalScore, safety: r.safetyScore.score, human: r.humanlikeScore.score,
    decision: r.decision,
    payoff: payoff.checked ? Math.round(payoff.coverage * 100) : null,
    answer: answer.checked ? Math.round(answer.answerRate * 100) : null,
    quotes, headings: headings.length, sentence,
    chars: body.replace(/\s/g, '').length,
    safetyIssues: r.safetyScore.issues, modeIssues: r.modeScore.issues,
  };
}

const rows = [];
for (const line of fs.readFileSync(path.join(dir, 'index.txt'), 'utf8').split('\n').filter(Boolean)) {
  const [mode, i, kw, , folderPart] = line.split('|');
  const folder = folderPart.replace('folder=', '').trim();
  const material = fs.readFileSync(path.join('tmp', 'one-article', folder, 'material.txt'), 'utf8');
  const app = JSON.parse(fs.readFileSync(path.join('tmp', 'one-article', folder, 'content.json'), 'utf8'));
  const llmPath = path.join('tmp', 'llm-baseline', `${mode}__${kw}.json`);
  if (!fs.existsSync(llmPath)) continue;
  const llm = JSON.parse(fs.readFileSync(llmPath, 'utf8'));
  rows.push(score('앱', mode, kw, app, material));
  rows.push(score('LLM', mode, kw, llm, material));
}

const pad = (v, n) => String(v == null ? '-' : v).padStart(n);
console.log('키워드                        | 쪽  | 모드 종합 안전 사람 | 결정      | 상환 응답 | 인용 소제목(서술) | 글자');
for (let i = 0; i < rows.length; i += 2) {
  for (const r of [rows[i], rows[i + 1]]) {
    console.log(`${r.kw.padEnd(24)} | ${r.label.padEnd(3)} | ${pad(r.modeScore, 4)} ${pad(r.final, 4)} ${pad(r.safety, 4)} ${pad(r.human, 4)} | ${r.decision.padEnd(9)} | ${pad(r.payoff, 4)} ${pad(r.answer, 4)} | ${pad(r.quotes, 4)} ${pad(r.headings, 6)}(${r.sentence}) | ${r.chars}`);
  }
}
const side = (l) => rows.filter((r) => r.label === l);
const avg = (l, k) => { const g = side(l).filter((r) => r[k] != null); return Math.round(g.reduce((a, r) => a + r[k], 0) / g.length); };
console.log('\n=== 평균 ===');
console.log('쪽  | 모드 종합 안전 사람 | pass | 상환 응답 | 인용≥1 | 서술형소제목 | 글자');
for (const l of ['앱', 'LLM']) {
  const s = side(l);
  console.log(`${l.padEnd(3)} | ${pad(avg(l, 'modeScore'), 4)} ${pad(avg(l, 'final'), 4)} ${pad(avg(l, 'safety'), 4)} ${pad(avg(l, 'human'), 4)} | ${s.filter((r) => r.decision === 'pass').length}/${s.length}  | ${pad(avg(l, 'payoff'), 4)} ${pad(avg(l, 'answer'), 4)} | ${s.filter((r) => r.quotes >= 1).length}/${s.length}    | ${s.reduce((a, r) => a + r.sentence, 0)}/${s.reduce((a, r) => a + r.headings, 0)}        | ${avg(l, 'chars')}`);
}
console.log('\n=== LLM 글에서 평가기가 잡은 문제(상위) ===');
const bag = {};
for (const r of side('LLM')) for (const m of [...r.safetyIssues, ...r.modeIssues]) bag[m.slice(0, 60)] = (bag[m.slice(0, 60)] || 0) + 1;
Object.entries(bag).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([m, c]) => console.log(`  ${c}회  ${m}`));
console.log('\n=== 앱 글에서 잡힌 문제(상위) ===');
const bag2 = {};
for (const r of side('앱')) for (const m of [...r.safetyIssues, ...r.modeIssues]) bag2[m.slice(0, 60)] = (bag2[m.slice(0, 60)] || 0) + 1;
Object.entries(bag2).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([m, c]) => console.log(`  ${c}회  ${m}`));
