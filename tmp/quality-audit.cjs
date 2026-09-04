// 사장님 기준 4가지 감사. npx tsx tmp/quality-audit.cjs <batch-tag> [...]
//  ① 제목의 궁금증을 본문이 푸는가 — TitlePayoff(도입부) · TitleAnswer(본문)
//  ② 환각 — 조작 검사·근거 무결성·안전 점수
//  ③ 모드별 노출급 — 게이트 모드/종합 점수와 결정
//  ④ 소제목 — 서술형 비율·조각·중복
const fs = require('fs');
const path = require('path');
const { isSentenceStyleHeadingTitle } = require(path.resolve('src/contentBodyTransforms.ts'));
const { isFragmentHeadingTitle } = require(path.resolve('src/content/headingStyleRepair.ts'));

const PRICE = { input: 2.5, cached: 0.25, output: 15 };
const SITUATION = /처음|먼저|버튼|신청|고민|헷갈|불편|놓치|다시|막히|필요|찾을|때|하면/;
const rows = [];

for (const tag of process.argv.slice(2)) {
  const dir = path.join('tmp', 'one-article', `batch-${tag}`);
  if (!fs.existsSync(path.join(dir, 'index.txt'))) continue;
  for (const line of fs.readFileSync(path.join(dir, 'index.txt'), 'utf8').split('\n').filter(Boolean)) {
    const [mode, i, kw, , folderPart] = line.split('|');
    const folder = folderPart.replace('folder=', '').trim();
    const log = fs.readFileSync(path.join(dir, `${mode}-${i}.log`), 'utf8');

    const num = (re) => { const m = log.match(re); return m ? Number(m[1]) : null; };
    const payoff = num(/\[TitlePayoff\][^\n]*?제목 상환 (\d+)%/);
    const answer = num(/\[TitleAnswer\][^\n]*?본문 응답 (\d+)%/);
    const gates = [...log.matchAll(/QualityGate\] 🎯 .*?점수 (\d+)\/100 · 종합 (\d+)\/100 \(안전 (\d+) · 사람다움 (\d+)\) \| decision=(\w+)/g)];
    const last = gates[gates.length - 1];
    const fabrication = (log.match(/근거 없는 구체 수치|지어낸|조작 의심|FabricationCheck\] ⚠️/g) || []).length;
    const evidence = (log.match(/근거 무결성[^\n]*위반|evidenceIntegrity[^\n]*<100/g) || []).length;
    const hallucination = (log.match(/강한 환각 의심/g) || []).length;
    const hallWarn = (log.match(/환각 경고 신호/g) || []).length;
    const regen = (log.match(/시도 2\/1: 요청/g) || []).length > 0 ? 1 : 0;
    const headingRepair = (log.match(/\[HeadingRepair\] ✏️/g) || []).length;
    const bp = log.match(/\[Blueprint\] ✅ 인용 (\d+)·사실 (\d+)/);
    const calls = [...log.matchAll(/promptTokens=(\d+) cachedTokens=(\S+) completionTokens=(\d+)/g)];
    let tin = 0, cached = 0, tout = 0;
    for (const m of calls) { tin += +m[1]; cached += Number.isFinite(+m[2]) ? +m[2] : 0; tout += +m[3]; }
    const cost = ((tin - cached) * PRICE.input + cached * PRICE.cached + tout * PRICE.output) / 1e6;
    const elapsed = num(/one-article\] 완료 (\d+)s/);

    let titles = [], sentence = 0, fragment = 0, quotes = 0, cue = null, body = 0, dupe = 0;
    const cj = path.join('tmp', 'one-article', folder, 'content.json');
    if (fs.existsSync(cj)) {
      const c = JSON.parse(fs.readFileSync(cj, 'utf8'));
      titles = (c.headings || []).map((h) => String(h.title || ''));
      sentence = titles.filter(isSentenceStyleHeadingTitle).length;
      fragment = titles.filter(isFragmentHeadingTitle).length;
      dupe = titles.length - new Set(titles).size;
      const text = [c.introduction, ...titles.map((_, k) => c.headings[k].content), c.conclusion].filter(Boolean).join('\n');
      quotes = (text.match(/["“][^"”\n]{8,160}["”]/g) || []).length;
      cue = SITUATION.test(String(c.introduction || '').slice(0, 260)) ? 1 : 0;
      body = text.replace(/\s/g, '').length;
    }
    rows.push({ tag, mode, i: +i, kw, payoff, answer, gateMode: last ? +last[1] : null, final: last ? +last[2] : null,
      safety: last ? +last[3] : null, human: last ? +last[4] : null, decision: last ? last[5] : null,
      fabrication, evidence, hallucination, hallWarn, regen, headingRepair, quotes, cue, body,
      headings: titles.length, sentence, fragment, dupe, bpQuotes: bp ? +bp[1] : null, bpFacts: bp ? +bp[2] : null,
      cost: +cost.toFixed(3), elapsed, titles });
  }
}

const n = rows.length || 1;
const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
const avg = (k) => { const g = rows.filter((r) => r[k] != null); return g.length ? Math.round(g.reduce((a, r) => a + r[k], 0) / g.length) : null; };
console.log('편 | 제목상환/본문응답 | 게이트(모드/종합/안전/사람) | 소제목 서술·조각 | 인용 | 환각 | 재생성 | 본문 | $');
for (const r of rows) {
  console.log(`${r.tag} ${r.mode}-${r.i} ${r.kw}`.padEnd(34)
    + ` ${String(r.payoff ?? '-')}%/${String(r.answer ?? '-')}%`.padEnd(11)
    + ` ${r.gateMode ?? '-'}/${r.final ?? '-'}/${r.safety ?? '-'}/${r.human ?? '-'}`.padEnd(17)
    + ` ${r.sentence}·${r.fragment}/${r.headings}`.padEnd(9)
    + ` q${r.quotes}` + ` h${r.hallucination}w${r.hallWarn}f${r.fabrication}`
    + ` r${r.regen}` + ` ${r.body}자 $${r.cost}`);
}
console.log(`\n=== ${rows.length}편 요약 ===`);
console.log(`제목 상환 평균 ${avg('payoff')}% · 본문 응답 평균 ${avg('answer')}% · 상환 100% ${rows.filter((r) => r.payoff === 100).length}/${rows.length}`);
console.log(`게이트 pass ${rows.filter((r) => r.decision === 'pass').length}/${rows.length} · 모드 ${avg('gateMode')} · 종합 ${avg('final')} · 안전 ${avg('safety')} · 사람다움 ${avg('human')}`);
console.log(`강한 환각 ${sum('hallucination')} · 환각 경고 ${sum('hallWarn')} · 조작 의심 ${sum('fabrication')}`);
console.log(`소제목 ${sum('headings')}개 중 서술형 ${sum('sentence')} (${Math.round(sum('sentence') / Math.max(1, sum('headings')) * 100)}%) · 조각 ${sum('fragment')} · 중복 ${sum('dupe')} · 보정 ${sum('headingRepair')}`);
console.log(`인용 ≥1 ${rows.filter((r) => r.quotes >= 1).length}/${rows.length} · 도입부 상황 ${rows.filter((r) => r.cue === 1).length}/${rows.length} · 재생성 ${sum('regen')}/${rows.length}`);
console.log(`편당 $${(sum('cost') / n).toFixed(3)} · 총 $${sum('cost').toFixed(2)} · 소요 평균 ${avg('elapsed')}s`);
