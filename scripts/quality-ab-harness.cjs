/* eslint-disable no-console */
/**
 * [2026-09-22 audit P0] A/B quality harness.
 *
 *   electron scripts/quality-ab-harness.cjs --stage=source              # free: search → clean → retention metrics (BEFORE vs AFTER)
 *   electron scripts/quality-ab-harness.cjs --stage=generate            # paid: full generation per keyword, reads generation-runs A~G
 *   electron scripts/quality-ab-harness.cjs --stage=generate --keywords="키워드1|키워드2"
 *
 * Output: tmp/quality-ab/<stamp>/{summary.md, results.json, <keyword>/…}
 * The BEFORE column for source retention replays the pre-fix sourceNoiseFilter semantics
 * (whole-bundle tail cut at the first "관련 기사/무단 전재" marker) taken from git HEAD~N when
 * available, so the 73%-loss number can be compared like-for-like on today's search results.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');
const { app } = require('electron');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
}));
const STAGE = args.stage || 'source'; // source | generate | report | keys
const DEFAULT_KEYWORDS = [
  '2026 청년도약계좌 조건',          // 정책/지원금
  '청약통장 금리',                   // 금융 (audit repro)
  '2026 셀토스 하이브리드 모의견적',  // 자동차 (audit repro)
  '변우석 텐텐',                     // 연예 최신 이슈 (audit repro)
  '제주 10월 가볼만한곳',            // 여행/지역
];
const KEYWORDS = args.keywords ? String(args.keywords).split('|').map((s) => s.trim()).filter(Boolean) : DEFAULT_KEYWORDS;
const MODES = args.mode ? String(args.mode).split('|') : ['seo', 'seo', 'seo', 'homefeed', 'seo'];

function userDataDir() {
  const base = process.env.APPDATA
    || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  return path.join(base, 'better-life-naver');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(process.cwd(), 'tmp', 'quality-ab', stamp);
fs.mkdirSync(outDir, { recursive: true });
const logStream = fs.createWriteStream(path.join(outDir, 'console.log'), { flags: 'a' });
for (const level of ['log', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...a) => {
    try { logStream.write(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n'); } catch { /* ignore */ }
    orig(...a);
  };
}

/** Pre-fix noise filter replay: whole-bundle tail cut at the earliest body-end marker. */
function buildLegacyTailCut() {
  let src = '';
  try {
    src = execSync('git show d9e8dd32:src/content/sourceNoiseFilter.ts', { encoding: 'utf8' });
  } catch {
    return null;
  }
  const start = src.indexOf('const BODY_END_MARKERS');
  const end = src.indexOf('];', start);
  if (start < 0 || end < 0) return null;
  const literal = src.slice(src.indexOf('[', start), end + 1);
  let markers;
  try { markers = eval(literal); } catch { return null; } // eslint-disable-line no-eval
  const boundary = /(?:^|\n)\s*(?:---\s*참고 자료|===\s*상위 노출 글 본문 발췌)/;
  return (text) => {
    const b = text.search(boundary);
    const head = b >= 0 ? text.slice(0, b) : text;
    let earliest = -1;
    for (const re of markers) {
      const at = head.search(re);
      if (at >= 0 && (earliest < 0 || at < earliest)) earliest = at;
    }
    if (earliest < 400 || earliest < head.length * 0.25) return text;
    return head.slice(0, earliest) + (b >= 0 ? text.slice(b) : '');
  };
}

const NUMERIC_SENTENCE = /\d[\d,.]*\s*(?:원|만원|억|%|명|건|회|일|월|년|kg|cm|km|인치|시간|분)/;
function numericSentences(text) {
  return String(text || '').split(/(?<=[.!?。])\s+|\n+/).map((s) => s.trim()).filter((s) => NUMERIC_SENTENCE.test(s));
}
function numbersIn(text) {
  // Comma-normalized ("7,500" == "7500") so formatting is not counted as a lost fact.
  return new Set((String(text || '').match(/\d[\d,.]*/g) || []).map((n) => n.replace(/[.,]$/, '').replace(/,/g, '')));
}
/** Body-only text of a model draft: the article fields, not preWritingAnalysis/evidence/image prompts. */
function draftBodyText(raw) {
  const text = String(raw || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return text;
  let obj;
  try { obj = JSON.parse(text.slice(start, end + 1)); } catch { return text; }
  const str = (v) => (typeof v === 'string' ? v : '');
  const headings = Array.isArray(obj.headings) ? obj.headings.map((h) => `${str(h && h.title)}\n${str(h && h.content)}`).join('\n') : '';
  return [str(obj.selectedTitle), str(obj.introduction), headings, str(obj.bodyPlain), str(obj.conclusion)].filter(Boolean).join('\n');
}
/** Draft→Final fact metrics from a generation-run directory (last body attempt in D vs F). */
function runFactMetrics(runDir) {
  const readRun = (f) => (runDir && fs.existsSync(path.join(runDir, f)) ? fs.readFileSync(path.join(runDir, f), 'utf8') : '');
  const B = readRun('B-research-input.txt');
  const attempts = readRun('D-model-output.txt').split(/\n\n===== .*? =====\n/).filter((t) => t.trim().length > 1500);
  const lastDraft = draftBodyText(attempts[attempts.length - 1] || '');
  const F = readRun('F-final-before-publish.txt');
  const numsB = numbersIn(B); const numsD = numbersIn(lastDraft); const numsF = numbersIn(F);
  const draftNumsInSources = [...numsD].filter((n) => numsB.has(n));
  const lostAfterPost = draftNumsInSources.filter((n) => !numsF.has(n));
  const attrD = attributionsIn(lastDraft); const attrF = attributionsIn(F);
  const lostAttributions = attrD.filter((a) => !F.includes(a.replace(/\s+(?:에 따르면|에서는|기준으로|에 의하면)$/, '')));
  return {
    draftAttempts: attempts.length, draftBodyChars: lastDraft.length,
    numericSentencesDraft: numericSentences(lastDraft).length, numericSentencesFinal: numericSentences(F).length,
    draftNumbersFromSources: draftNumsInSources.length, lostNumbers: lostAfterPost.slice(0, 10),
    factPreservation: draftNumsInSources.length ? +((draftNumsInSources.length - lostAfterPost.length) / draftNumsInSources.length).toFixed(3) : null,
    attributionsDraft: attrD.length, attributionsFinal: attrF.slice(0, 8), lostAttributions: lostAttributions.slice(0, 8),
    finalLength: F.length,
  };
}
function attributionsIn(text) {
  return (String(text || '').match(/[가-힣A-Za-z]{2,12}(?:부|청|처|원|공단|협회|위원회|은행|공사|연구원|일보|뉴스|신문|방송|소속사|공식)\s*(?:발표|보도|자료|입장|기준|안내)?\s*(?:에 따르면|에서는|기준으로|에 의하면)/g) || []);
}

async function sourceStage(ctx, keyword, mode) {
  const { collectContentFromPlatforms } = ctx.sourceAssembler;
  const { prepareSourceMaterial } = ctx.sourcePipeline;
  const t0 = Date.now();
  const collected = await collectContentFromPlatforms(keyword, {
    maxPerSource: 10, clientId: ctx.config.naverClientId, clientSecret: ctx.config.naverClientSecret,
    logger: (m) => console.log(m),
  });
  const raw = collected.collectedText || '';
  const before = ctx.legacyTailCut ? ctx.legacyTailCut(raw) : raw;
  const after = prepareSourceMaterial({ rawText: raw, contentMode: mode, metadata: { sourceDocuments: collected.sourceDocuments || [] } }, keyword);
  const dir = path.join(outDir, keyword.replace(/[\\/:*?"<>|]/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'A-search-raw.json'), JSON.stringify({ searchStatus: collected.searchStatus, sourceCount: collected.sourceCount, urls: collected.urls, sourceDocuments: (collected.sourceDocuments || []).map((d) => ({ ...d, body: `${d.body.slice(0, 200)}…(${d.body.length}자)` })) }, null, 2));
  fs.writeFileSync(path.join(dir, 'B-before-legacy-cut.txt'), before);
  fs.writeFileSync(path.join(dir, 'B-after-pipeline.txt'), after.rawText);
  const row = {
    keyword, mode, ms: Date.now() - t0,
    searchStatus: collected.searchStatus?.overall || (collected.success ? 'SEARCH_OK' : 'SEARCH_EMPTY'),
    searchSummary: collected.searchStatus?.summary || '',
    rawSources: after.metrics.rawSources,
    rawChars: raw.length,
    beforeChars: before.length,
    beforeRetention: raw.length ? +(before.length / raw.length).toFixed(3) : 0,
    afterChars: after.rawText.length,
    afterRetention: after.metrics.rawChars ? +(1 - after.metrics.removedRatio).toFixed(3) : 0,
    accepted: after.metrics.acceptedSources, rejected: after.metrics.rejectedSources,
    rejectedReasons: after.metrics.rejectedReasons, unknownDate: after.metrics.unknownDateSources,
    labelledSources: (after.rawText.match(/\[자료 S\d+\]/g) || []).length,
    level: after.metrics.level, logLine: after.logLine,
    dates: (collected.sourceDocuments || []).map((d) => d.pubDate || 'UNKNOWN_DATE'),
  };
  console.log(`[AB:source] ${keyword} → ${JSON.stringify(row)}`);
  return row;
}

async function generateStage(ctx, keyword, mode) {
  const { collectContentFromPlatforms, assembleContentSource } = ctx.sourceAssembler;
  const { generateStructuredContent } = ctx.contentGenerator;
  // --provider= overrides the configured engine (e.g. when the configured key has no credit).
  const provider = args.provider || ctx.config.defaultAiProvider || 'gemini';
  const t0 = Date.now();
  const collected = await collectContentFromPlatforms(keyword, {
    maxPerSource: 10, clientId: ctx.config.naverClientId, clientSecret: ctx.config.naverClientSecret, logger: (m) => console.log(m),
  });
  const { source } = await assembleContentSource({
    keywords: [keyword], targetAge: 'all', generator: provider, minChars: Number(ctx.config.minCharCount) || 2500,
    baseText: collected.collectedText || undefined, sourceDocuments: collected.sourceDocuments, searchStatus: collected.searchStatus,
    realtimeCrawlRequested: true, useRealTimeInfo: !!collected.collectedText,
    naverClientId: ctx.config.naverClientId, naverClientSecret: ctx.config.naverClientSecret,
  });
  source.contentMode = mode;
  source.toneStyle = 'friendly';
  let content; let error = null;
  try {
    content = await generateStructuredContent(source, { provider });
  } catch (e) {
    error = String(e && e.message || e);
  }
  const runId = content && content._generationRunId;
  const runDir = runId ? path.join(app.getPath('userData'), 'generation-runs', runId) : null;
  const readRun = (f) => (runDir && fs.existsSync(path.join(runDir, f)) ? fs.readFileSync(path.join(runDir, f), 'utf8') : '');
  const meta = runDir && fs.existsSync(path.join(runDir, 'meta.json')) ? JSON.parse(readRun('meta.json')) : null;
  const history = runDir && fs.existsSync(path.join(runDir, 'E-postprocess-history.json')) ? JSON.parse(readRun('E-postprocess-history.json')) : [];
  const fact = runFactMetrics(runDir);
  const row = {
    keyword, mode, provider, ms: Date.now() - t0, error, runId,
    selectedModel: meta?.selectedModel, actualModelsUsed: meta?.actualModelsUsed,
    grounding: meta ? { requested: meta.groundingRequested, used: meta.groundingActuallyUsed } : null,
    searchStatus: meta?.searchStatus, sourceRetention: meta?.sourceRetention,
    instructionChars: meta?.instructionChars, sourceChars: meta?.sourceChars,
    instructionToSource: meta && meta.sourceChars ? +(meta.instructionChars / meta.sourceChars).toFixed(2) : null,
    outputChars: meta?.outputChars, outputTruncated: meta?.outputTruncated === true, jsonComplete: meta?.jsonComplete !== false,
    integrity: meta?.integrity, publishDecision: meta?.publishDecision,
    unsupportedAttributions: (meta?.extra?.unsupportedAttributions || []).length,
    postProcessSteps: history.length,
    postDeletedChars: history.reduce((s, h) => s + (h.deletedChars || 0), 0),
    postDeletedSentences: history.reduce((s, h) => s + ((h.deletedSentences || []).length), 0),
    ...fact, title: content?.selectedTitle,
    files: runDir ? fs.readdirSync(runDir) : [],
  };
  fs.writeFileSync(path.join(outDir, `${keyword.replace(/[\\/:*?"<>|]/g, '_')}-generate.json`), JSON.stringify(row, null, 2));
  console.log(`[AB:generate] ${keyword} → decision=${row.publishDecision} models=${JSON.stringify(row.actualModelsUsed)} fact=${row.factPreservation} lost=${row.lostNumbers.join(',')}`);
  return row;
}

async function main() {
  const dir = process.env.ONE_ARTICLE_USERDATA || userDataDir();
  app.setName(path.basename(dir));
  app.setPath('userData', dir);
  app.setPath('temp', path.join(outDir, 'electron-temp'));
  fs.mkdirSync(path.join(outDir, 'electron-temp'), { recursive: true });
  await app.whenReady();
  const { loadConfig, applyConfigToEnv } = require('../dist/configManager.js');
  const config = await loadConfig();
  applyConfigToEnv(config);
  // Presence-only summary (never the values) so a credit/key failure is explainable.
  const keyPresence = ['openaiApiKey', 'geminiApiKey', 'claudeApiKey', 'perplexityApiKey']
    .map((k) => `${k}=${config[k] ? 'set' : '-'}`).join(' ');
  console.log(`[AB] provider=${args.provider || config.defaultAiProvider || 'gemini'} (configured=${config.defaultAiProvider || '-'}) ${keyPresence}`);
  if (args.stage === 'keys') { app.exit(0); return; }
  const ctx = {
    config,
    sourceAssembler: require('../dist/sourceAssembler.js'),
    sourcePipeline: require('../dist/content/sourcePipeline.js'),
    contentGenerator: require('../dist/contentGenerator.js'),
    legacyTailCut: buildLegacyTailCut(),
  };
  const results = [];
  if (STAGE === 'report' && args.from) {
    // Recompute Draft→Final fact metrics for an earlier generate run (--from=<outDir>).
    const prior = JSON.parse(fs.readFileSync(path.join(args.from, 'results.json'), 'utf8'));
    for (const r of prior) {
      const runDir = r.runId ? path.join(app.getPath('userData'), 'generation-runs', r.runId) : null;
      results.push(runDir && fs.existsSync(runDir) ? { ...r, ...runFactMetrics(runDir) } : r);
    }
  }
  for (let i = 0; STAGE !== 'report' && i < KEYWORDS.length; i += 1) {
    const keyword = KEYWORDS[i];
    const mode = MODES[i] || 'seo';
    try {
      results.push(STAGE === 'generate' ? await generateStage(ctx, keyword, mode) : await sourceStage(ctx, keyword, mode));
    } catch (e) {
      console.error(`[AB] ${keyword} failed: ${e && e.stack || e}`);
      results.push({ keyword, mode, error: String(e && e.message || e) });
    }
  }
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  const md = [`# quality-ab ${STAGE} ${stamp}`, ''];
  if (STAGE === 'source') {
    md.push('| keyword | status | sources | raw | BEFORE(legacy cut) | AFTER(pipeline) | accepted/rejected | unknownDate | labelled |', '|---|---|---|---|---|---|---|---|---|');
    for (const r of results) md.push(`| ${r.keyword} | ${r.searchStatus || r.error} | ${r.rawSources ?? ''} | ${r.rawChars ?? ''} | ${r.beforeChars ?? ''} (${r.beforeRetention ?? ''}) | ${r.afterChars ?? ''} (${r.afterRetention ?? ''}) | ${r.accepted ?? ''}/${r.rejected ?? ''} | ${r.unknownDate ?? ''} | ${r.labelledSources ?? ''} |`);
  } else {
    md.push('| keyword | decision | model(s) | grounding | instr:source | truncated | json | unsupportedAttr | post steps | deleted chars/sentences | numeric draft→final | fact keep (lost) | attr draft→final (lost) | final len |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of results) md.push(`| ${r.keyword} | ${r.publishDecision || r.error} | ${(r.actualModelsUsed || []).map((m) => `${m.stage}=${m.model}`).join('<br>')} | ${r.grounding ? `${r.grounding.requested}/${r.grounding.used}` : ''} | ${r.instructionToSource ?? ''} | ${r.outputTruncated} | ${r.jsonComplete} | ${r.unsupportedAttributions ?? ''} | ${r.postProcessSteps ?? ''} | ${r.postDeletedChars ?? ''}/${r.postDeletedSentences ?? ''} | ${r.numericSentencesDraft ?? ''}→${r.numericSentencesFinal ?? ''} | ${r.factPreservation ?? ''} (${(r.lostNumbers || []).join(' ')}) | ${r.attributionsDraft ?? ''}→${(r.attributionsFinal || []).length} (${(r.lostAttributions || []).length}) | ${r.finalLength ?? ''} |`);
  }
  fs.writeFileSync(path.join(outDir, 'summary.md'), md.join('\n'));
  console.log(md.join('\n'));
  console.log(`[AB] output: ${outDir}`);
  app.exit(0);
}

main().catch((e) => { console.error(e); app.exit(1); });
