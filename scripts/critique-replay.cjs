// [2026-09-23 Quality Fix 1] Offline replay of stored Critique Loop runs — 0 model calls.
//
// For each generation-run directory with Q1-critic.json it reconstructs the article the loop
// saw (from the Critic prompt), the evidence the Writer saw (B-research-input bodies +
// C-final-prompt blueprint material) and replays the deterministic parts of the new pipeline:
// high-risk claim scanner, seed/Critic merge, propagation, and terminal reconciliation over the
// recorded ledger + recorded Judge verdict. Prints one row per run and writes a JSON report.
//
//   node scripts/critique-replay.cjs [--runs=id1,id2] [--out=tmp/quality-loop/replay.json]

'use strict';

const fs = require('fs');
const path = require('path');

const { buildArticleModel } = require('../dist/quality/critique/sectionModel.js');
const { buildEvidencePack, evidenceCorpus } = require('../dist/quality/critique/evidence.js');
const { scanHighRiskClaims, mergeSeedsWithCritic } = require('../dist/quality/critique/claimScanner.js');
const { propagateUnsupportedValues } = require('../dist/quality/critique/issuePropagation.js');
const { buildAllowedValues, extractClaimTokens, quoteSupported } = require('../dist/quality/critique/claimNormalize.js');
const { isIntegrityIssue } = require('../dist/quality/critique/issueTaxonomy.js');

const APPDATA = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const RUNS_DIR = path.join(APPDATA, 'better-life-naver', 'generation-runs');
const DEFAULT_RUNS = [
  '20260922-191510-hr3r5z', '20260922-193310-0baqv0', '20260922-194812-92dbnq',
  '20260922-195843-ddr04w', '20260922-201400-jq7nj0', '20260922-203544-orfmzm',
];
const FACT_TYPES = new Set(['UNSUPPORTED_VALUE', 'UNSUPPORTED_QUOTE', 'UNSUPPORTED_ENTITY', 'FACT_ERROR', 'CONTRADICTION', 'MIXED_ENTITY']);

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true']; }));
const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null);
const readText = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '');

/** The Critic prompt carries the article exactly as the loop saw it: "[id] (h2) title\ntext". */
function articleFromCriticPrompt(prompt) {
  const start = prompt.indexOf('## 글 (');
  const end = prompt.indexOf('## 검수 계약');
  const block = prompt.slice(start, end > start ? end : undefined);
  const title = (block.match(/^제목: (.*)$/m) || [])[1] || '';
  const headings = []; let introduction = ''; let conclusion = ''; let cta = '';
  const re = /^\[(\w+)\] (?:\((h[23])\) )?(.*)$/gm;
  const marks = [...block.matchAll(re)];
  marks.forEach((m, i) => {
    const text = block.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : undefined).trim();
    if (m[1] === 'intro') introduction = text;
    else if (m[1] === 'conclusion') conclusion = text;
    else if (m[1] === 'cta') cta = text;
    else headings.push({ title: m[3].trim(), content: text, summary: '', keywords: [], imagePrompt: '' });
  });
  const bodyPlain = [introduction, ...headings.map((h) => `${h.title}\n\n${h.content}`), conclusion].filter(Boolean).join('\n\n');
  return { status: 'success', generationTime: '0', selectedTitle: title, titleAlternatives: [], titleCandidates: [], bodyHtml: '', bodyPlain, headings, hashtags: [], images: [], metadata: {}, quality: {}, introduction, conclusion, cta: cta ? { text: cta } : undefined };
}

/** B-research-input: "[자료 Sxx]" blocks with header lines then body. */
function documentsFromResearchInput(runDir) {
  const text = readText(path.join(runDir, 'B-research-input.txt'));
  const meta = readJson(path.join(runDir, 'A-search-raw.json'));
  const byId = new Map(((meta && meta.sourceDocuments) || []).map((d) => [d.id, d]));
  const docs = [];
  const re = /^\[자료 (S\d+)\]\r?\n([\s\S]*?)(?=^\[자료 S\d+\]|(?![\s\S]))/gm;
  for (const m of text.matchAll(re)) {
    const id = m[1];
    const lines = m[2].split(/\r?\n/);
    const bodyStart = lines.findIndex((l, i) => i > 0 && l.trim() === '');
    const body = lines.slice(bodyStart + 1).join('\n').trim();
    const base = byId.get(id) || {};
    docs.push({ id, title: base.title || (lines[0] || '').replace(/^제목:\s*/, ''), sourceType: base.sourceType || 'unknown', sourceName: base.sourceName, domain: base.domain, url: base.url || '', pubDate: base.pubDate, dateStatus: base.dateStatus || 'UNKNOWN_DATE', body, sourceTier: base.sourceTier || 'UNKNOWN', relevance: { accepted: true } });
  }
  return docs;
}

function blueprintMaterial(runDir) {
  const prompt = readText(path.join(runDir, 'C-final-prompt.txt'));
  const start = prompt.indexOf('[원본 텍스트]');
  if (start < 0) return '';
  const rest = prompt.slice(start);
  const end = rest.indexOf('[리서치 요약');
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 8000);
}

/** Values/quotes in `span` that `allowed` does not carry. */
function unsupportedIn(span, allowed) {
  const t = extractClaimTokens(span);
  const values = [...t.dates, ...t.numbers].filter((v) => !allowed.dates.has(v) && !allowed.numbers.has(v));
  const quotes = t.quotes.filter((q) => !quoteSupported(q, allowed));
  return { values, quotes, checkable: extractClaimTokens(span).dates.length + extractClaimTokens(span).numbers.length + t.quotes.length > 0 };
}

/**
 * Provenance of a flagged claim:
 *   IN_DOCS        the accepted documents carry it — the reviewer was wrong (excerpt blindness)
 *   BLUEPRINT_ONLY only the blueprint block carries it — it came from material the relevance
 *                  pipeline had REJECTED (groundBlueprintMaterial closes this)
 *   UNSUPPORTED    neither — a real fabrication
 *   UNVERIFIABLE   no number/date/quote to check (a prose claim)
 */
function verifyFlag(span, docsAllowed, fullAllowed) {
  const inDocs = unsupportedIn(span, docsAllowed);
  if (!inDocs.checkable) return 'UNVERIFIABLE';
  if (inDocs.values.length === 0 && inDocs.quotes.length === 0) return 'IN_DOCS';
  const inFull = unsupportedIn(span, fullAllowed);
  return inFull.values.length === 0 && inFull.quotes.length === 0 ? 'BLUEPRINT_ONLY' : 'UNSUPPORTED';
}

function replayRun(runId) {
  const runDir = path.join(RUNS_DIR, runId);
  const meta = readJson(path.join(runDir, 'meta.json'));
  const q1 = readJson(path.join(runDir, 'Q1-critic.json'));
  const q5 = readJson(path.join(runDir, 'Q5-judge.json'));
  const ledger = readJson(path.join(runDir, 'Q-ledger.json'));
  if (!meta || !q1) return { runId, error: 'missing Q1-critic.json' };

  const content = articleFromCriticPrompt(q1.prompt);
  const model = buildArticleModel(content);
  const documents = documentsFromResearchInput(runDir);
  // Two corpora. docsCorpus = what the relevance pipeline ACCEPTED (B block: cleaned documents +
  // research brief). fullCorpus adds the blueprint block, which in these stored runs still carried
  // the pre-filter collected text — that is how a rejected article's quote reached the draft.
  const researchInput = readText(path.join(runDir, 'B-research-input.txt'));
  const docsEvidence = buildEvidencePack(documents, meta.keyword, '', { extraMaterial: researchInput });
  const docsCorpus = evidenceCorpus(docsEvidence);
  const fullCorpus = `${docsCorpus} ${blueprintMaterial(runDir)}`;
  const docsAllowed = buildAllowedValues(docsCorpus);
  const fullAllowed = buildAllowedValues(fullCorpus);
  // The scanner runs against the accepted documents — with groundBlueprintMaterial in place that is
  // also exactly what the blueprint and the Writer see.
  const corpus = docsCorpus;

  const seeds = scanHighRiskClaims(model, corpus);
  const majorSeeds = seeds.filter((s) => s.severity === 'MAJOR');
  const criticFacts = [...(q1.issues || []), ...(q1.dropped || [])].filter((i) => FACT_TYPES.has(i.type));
  const criticVerified = criticFacts.map((i) => ({ ...i, verdict: verifyFlag(i.exactSpan, docsAllowed, fullAllowed) }));
  const judgeVerified = ((q5 && q5.blockingIssues) || []).map((b) => ({ ...b, verdict: verifyFlag(b.exactSpan, docsAllowed, fullAllowed) }));
  const real = (v) => v === 'UNSUPPORTED' || v === 'BLUEPRINT_ONLY';
  const merged = mergeSeedsWithCritic(majorSeeds, criticVerified.filter((i) => real(i.verdict) && i.severity !== 'MINOR'), corpus);
  const firstCycle = [...criticVerified.filter((i) => real(i.verdict) && i.severity !== 'MINOR'), ...merged.keptSeeds];
  const propagated = propagateUnsupportedValues(firstCycle, model, corpus);

  // Terminal reconciliation over the RECORDED final ledger + recorded Judge verdict.
  const finalIssues = (ledger && ledger.issues) || [];
  const openFinal = finalIssues.filter((i) => (i.state === 'OPEN' || i.state === 'REGRESSED') && (i.severity === 'CRITICAL' || i.severity === 'MAJOR'));
  const integrityOpen = openFinal.filter((i) => isIntegrityIssue(i));
  const editorialOpen = openFinal.filter((i) => !isIntegrityIssue(i));
  const recordedReasons = ((meta.extra && meta.extra.qualityLoop && meta.extra.qualityLoop.manualReviewReasons) || []);
  const hardStop = recordedReasons.some((r) => /^(PRESERVATION_VIOLATION|REVISION_NOOP|OUTPUT_TRUNCATED|JSON_INCOMPLETE|SOURCE_ZERO|NO_ROUTE|LOOP_ERROR)/.test(r));
  const judgeDecision = q5 ? q5.decision : 'n/a';
  const expected = integrityOpen.length > 0 || hardStop ? 'MANUAL_REVIEW' : judgeDecision === 'BLOCK' ? 'MANUAL_REVIEW' : 'AUTO_PUBLISH';

  return {
    runId, keyword: meta.keyword, corpusChars: corpus.length, sections: model.sections.length,
    // One claim = one sentence prefix, so a Critic span and the Judge's longer quote of it count once.
    DRAFT_UNSUPPORTED_FACTS: new Set([
      ...majorSeeds.map((s) => s.exactSpan),
      ...criticVerified.filter((i) => real(i.verdict)).map((i) => i.exactSpan),
      ...judgeVerified.filter((b) => real(b.verdict)).map((b) => b.exactSpan),
    ].map((span) => String(span).replace(/\s+/g, '').slice(0, 30))).size,
    PRECHECK_CAUGHT: majorSeeds.length,
    PRECHECK_HINTS: seeds.length - majorSeeds.length,
    CRITIC_FLAGGED: criticFacts.length,
    CRITIC_REAL: criticVerified.filter((i) => real(i.verdict)).length,
    CRITIC_IN_DOCS_FP: criticVerified.filter((i) => i.verdict === 'IN_DOCS').length,
    CRITIC_UNVERIFIABLE: criticVerified.filter((i) => i.verdict === 'UNVERIFIABLE').length,
    BLUEPRINT_ONLY: [...criticVerified, ...judgeVerified].filter((i) => i.verdict === 'BLUEPRINT_ONLY').length,
    JUDGE_BLOCKS: judgeVerified.length,
    JUDGE_IN_DOCS_FP: judgeVerified.filter((b) => b.verdict === 'IN_DOCS').length,
    SEEDS_COVERED_BY_CRITIC: merged.coveredSeeds.length,
    PROPAGATED: propagated.length,
    RECORDED_CYCLES: (meta.extra && meta.extra.qualityLoop && meta.extra.qualityLoop.revisionCycles) || 0,
    FINAL_INTEGRITY_OPEN: integrityOpen.length,
    FINAL_EDITORIAL_OPEN: editorialOpen.length,
    JUDGE: judgeDecision,
    RECORDED_DECISION: (meta.extra && meta.extra.qualityLoop && meta.extra.qualityLoop.decision) || meta.publishDecision,
    EXPECTED_DECISION: expected,
    details: {
      majorSeeds: majorSeeds.map((s) => ({ section: s.sectionId, type: s.type, problem: s.problem })),
      criticFlags: criticVerified.map((i) => ({ section: i.sectionId, type: i.type, severity: i.severity, verdict: i.verdict, span: String(i.exactSpan).slice(0, 60) })),
      judgeFlags: judgeVerified.map((b) => ({ section: b.sectionId, verdict: b.verdict, span: String(b.exactSpan).slice(0, 60) })),
      integrityOpen: integrityOpen.map((i) => `${i.sectionId}/${i.type}`),
      editorialOpen: editorialOpen.map((i) => `${i.sectionId}/${i.type}`),
      hardStopReasons: recordedReasons.filter((r) => /^(PRESERVATION_VIOLATION|REVISION_NOOP)/.test(r)),
    },
  };
}

function main() {
  const runs = args.runs ? args.runs.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_RUNS;
  const rows = runs.map(replayRun);
  const cols = ['runId', 'DRAFT_UNSUPPORTED_FACTS', 'PRECHECK_CAUGHT', 'PRECHECK_HINTS', 'CRITIC_FLAGGED', 'CRITIC_REAL', 'CRITIC_IN_DOCS_FP', 'BLUEPRINT_ONLY', 'JUDGE_BLOCKS', 'JUDGE_IN_DOCS_FP', 'PROPAGATED', 'RECORDED_CYCLES', 'FINAL_INTEGRITY_OPEN', 'FINAL_EDITORIAL_OPEN', 'JUDGE', 'RECORDED_DECISION', 'EXPECTED_DECISION'];
  console.log(cols.join('\t'));
  for (const r of rows) console.log(cols.map((c) => (r[c] === undefined ? '' : String(r[c]))).join('\t'));
  const out = args.out || path.join('tmp', 'quality-loop', 'replay.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(rows, null, 2), 'utf-8');
  console.log(`\nwrote ${out}`);
}

if (require.main === module) main();
module.exports = { replayRun, articleFromCriticPrompt, documentsFromResearchInput, verifyFlag };
