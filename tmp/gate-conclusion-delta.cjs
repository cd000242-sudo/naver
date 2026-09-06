/* eslint-disable no-console */
/**
 * R0 계측 — 품질 게이트가 결론(conclusion)을 읽게 되면 점수·decision·quality90 이 얼마나 뒤집히는가.
 * tmp/one-article/<stamp>/{content.json,material.txt,console.log} 를 전부 읽어 두 팔로 evaluate() 한다.
 *   A: introduction + bodyPlain          (현행)
 *   B: introduction + bodyPlain + conclusion (R0)
 *   node tmp/gate-conclusion-delta.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const { evaluate } = require('../dist/content/qualityEvaluator.js');
const { assessQuality90Gate } = require('../dist/content/quality90Gate.js');
const { paragraphizeForEvaluation, homefeedParagraphSentences } = require('../dist/contentBodyTransforms.js');

const ROOT = path.join(process.cwd(), 'tmp', 'one-article');
const GATE_MODES = new Set(['homefeed', 'affiliate', 'business', 'custom', 'mate']);

function readMeta(dir) {
  let mode = null; let keyword = null;
  try {
    const log = fs.readFileSync(path.join(dir, 'console.log'), 'utf-8');
    const m = log.match(/\[one-article\] keyword="([^"]*)" mode=([a-z]+)/);
    if (m) { keyword = m[1]; mode = m[2]; }
  } catch {}
  return { mode, keyword };
}

function primaryKeyword(content, keyword) {
  if (keyword && !/^https?:\/\//i.test(keyword)) return keyword;
  const tag = Array.isArray(content.hashtags) ? content.hashtags[0] : '';
  return String(tag || '').replace(/^#/, '');
}

function run() {
  const rows = [];
  for (const stamp of fs.readdirSync(ROOT)) {
    const dir = path.join(ROOT, stamp);
    const cj = path.join(dir, 'content.json');
    if (!fs.existsSync(cj)) continue;
    let content;
    try { content = JSON.parse(fs.readFileSync(cj, 'utf-8')); } catch { continue; }
    const conclusion = String(content.conclusion || '').trim();
    if (!conclusion || !content.bodyPlain) continue;
    const meta = readMeta(dir);
    const contentMode = content.__generatedMode || meta.mode || 'seo';
    const mode = GATE_MODES.has(contentMode) ? contentMode : 'seo';
    const rawText = fs.existsSync(path.join(dir, 'material.txt')) ? fs.readFileSync(path.join(dir, 'material.txt'), 'utf-8') : '';
    const intro = String(content.introduction || '').trim();
    const maxS = homefeedParagraphSentences(contentMode);
    const base = {
      title: content.selectedTitle || '',
      headings: content.headings || [],
      rawText,
      primaryKeyword: primaryKeyword(content, meta.keyword),
      secondaryKeywords: [],
      mode,
      contentMode,
      groundingText: rawText,
      aiExperienceOptIn: contentMode === 'affiliate',
      sourceIsUrl: /^https?:\/\//i.test(String(meta.keyword || '')),
    };
    const a = evaluate({ ...base, body: paragraphizeForEvaluation([intro, content.bodyPlain].filter(Boolean).join('\n\n'), maxS) });
    const b = evaluate({ ...base, body: paragraphizeForEvaluation([intro, content.bodyPlain, conclusion].filter(Boolean).join('\n\n'), maxS) });
    const qa = assessQuality90Gate(a, mode);
    const qb = assessQuality90Gate(b, mode);
    rows.push({
      stamp, mode: contentMode,
      final: [a.finalScore, b.finalScore], modeS: [a.modeScore.score, b.modeScore.score],
      human: [a.humanlikeScore.score, b.humanlikeScore.score], safety: [a.safetyScore.score, b.safetyScore.score],
      decision: [a.decision, b.decision], miss: [qa.miss, qb.miss],
      newIssues: [...b.modeScore.issues, ...b.humanlikeScore.issues, ...b.safetyScore.issues]
        .filter((i) => ![...a.modeScore.issues, ...a.humanlikeScore.issues, ...a.safetyScore.issues].includes(i)),
    });
  }

  const flips = rows.filter((r) => r.decision[0] !== r.decision[1] || r.miss[0] !== r.miss[1]);
  const avg = (k, i) => (rows.reduce((s, r) => s + r[k][i], 0) / rows.length).toFixed(1);
  console.log(`표본 ${rows.length}편 (결론 있는 글만)`);
  console.log(`평균 final ${avg('final', 0)} → ${avg('final', 1)} · mode ${avg('modeS', 0)} → ${avg('modeS', 1)} · human ${avg('human', 0)} → ${avg('human', 1)} · safety ${avg('safety', 0)} → ${avg('safety', 1)}`);
  const deltas = rows.map((r) => r.final[1] - r.final[0]);
  console.log(`final 델타 분포: min ${Math.min(...deltas)} max ${Math.max(...deltas)} · 하락 ${deltas.filter((d) => d < 0).length}편 · 상승 ${deltas.filter((d) => d > 0).length}편`);
  console.log(`decision/quality90 뒤집힘 ${flips.length}편`);
  for (const f of flips) {
    console.log(`  - ${f.stamp} [${f.mode}] decision ${f.decision[0]}→${f.decision[1]} miss ${f.miss[0]}→${f.miss[1]} final ${f.final[0]}→${f.final[1]}`);
  }
  const issueCount = new Map();
  for (const r of rows) for (const i of r.newIssues) issueCount.set(i.slice(0, 60), (issueCount.get(i.slice(0, 60)) || 0) + 1);
  console.log('결론 편입으로 새로 뜬 issue (상위 10):');
  for (const [i, n] of [...issueCount.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10)) console.log(`  ${n}편 · ${i}`);
  fs.writeFileSync(path.join(process.cwd(), 'tmp', 'gate-conclusion-delta.json'), JSON.stringify(rows, null, 2));
}

run();
