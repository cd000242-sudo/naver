// 저장된 글로 제목 상환·본문 응답 재계산(추가 호출 없음). npx tsx tmp/payoff-recompute.cjs <tags...>
const fs = require('fs'); const path = require('path');
const { checkTitlePayoff } = require(path.resolve('src/content/titlePayoffCheck.ts'));
const { checkTitleAnswer } = require(path.resolve('src/content/titleAnswerCheck.ts'));
let n = 0, pSum = 0, aSum = 0, full = 0;
const rows = [];
for (const tag of process.argv.slice(2)) {
  const idx = path.join('tmp', 'one-article', `batch-${tag}`, 'index.txt');
  if (!fs.existsSync(idx)) continue;
  for (const line of fs.readFileSync(idx, 'utf8').split('\n').filter(Boolean)) {
    const [mode, i, kw, , folderPart] = line.split('|');
    const cj = path.join('tmp', 'one-article', folderPart.replace('folder=', '').trim(), 'content.json');
    if (!fs.existsSync(cj)) continue;
    const c = JSON.parse(fs.readFileSync(cj, 'utf8'));
    const h = Array.isArray(c.headings) ? c.headings : [];
    const kwMain = (c.metadata && Array.isArray(c.metadata.keywords) ? c.metadata.keywords[0] : '') || kw;
    const payoff = checkTitlePayoff({ title: c.selectedTitle || '', primaryKeyword: kwMain,
      payoffZone: [c.introduction, h[0] && h[0].title, h[0] && h[0].content].filter(Boolean).join('\n') });
    const answer = checkTitleAnswer({ title: c.selectedTitle || '', primaryKeyword: kwMain,
      introduction: String(c.introduction || ''),
      body: [...h.map((x) => `${x.title || ''}\n${x.content || ''}`), c.conclusion].filter(Boolean).join('\n') });
    if (!payoff.checked) continue;
    n += 1; pSum += payoff.coverage; aSum += answer.checked ? answer.answerRate : 0;
    if (payoff.coverage >= 0.999) full += 1;
    rows.push(`${tag} ${mode}-${i} ${kw}`.padEnd(34) + ` 상환 ${Math.round(payoff.coverage * 100)}% / 응답 ${answer.checked ? Math.round(answer.answerRate * 100) : '-'}%`
      + (payoff.unpaid.length ? `  미상환: ${payoff.unpaid.join(', ')}` : ''));
  }
}
console.log(rows.join('\n'));
console.log(`\n${n}편 · 제목 상환 평균 ${Math.round(pSum / n * 100)}% · 본문 응답 평균 ${Math.round(aSum / n * 100)}% · 상환 100% ${full}/${n}`);
