// [2026-09-23 Freeze Check] Static input-size audit for every Critique Loop stage — 0 model calls.
//
// Measures what each stage actually receives (total chars / evidence chars / article chars /
// ~tokens) so that fixing the 700-char excerpt problem did not swing the other way into an
// unbounded prompt. Also checks for duplicated evidence blocks and for coverage of the values
// the stored live runs actually argued about.
//
//   node scripts/critique-input-audit.cjs [--out=tmp/quality-loop/input-audit.json]

'use strict';

const fs = require('fs');
const path = require('path');

const { buildArticleModel } = require('../dist/quality/critique/sectionModel.js');
const { buildEvidencePack, describeEvidence, describeKeyFacts, evidenceCorpus } = require('../dist/quality/critique/evidence.js');
const { buildCriticPrompt, buildEditorialPrompt, describeSearchIntent } = require('../dist/quality/critique/criticPrompt.js');
const { buildEditorPrompt, buildVerificationPrompt } = require('../dist/quality/critique/editorPrompts.js');
const { buildJudgePrompt } = require('../dist/quality/critique/finalJudge.js');
const { classifyHashtags } = require('../dist/quality/critique/hashtagProvenance.js');

const CHARS_PER_TOKEN = 1.7; // same estimator as scripts/prompt-budget-report.cjs
const APPDATA = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const RUNS_DIR = path.join(APPDATA, 'better-life-naver', 'generation-runs');
const FIXTURE_DIR = path.join(__dirname, '..', 'src', '__tests__', 'fixtures', 'critique');
const SLUGS = ['policy', 'finance', 'car', 'entertainment', 'travel'];
/** BEFORE = the excerpt size the first Critique Loop version used. */
const BEFORE_EXCERPT_CHARS = 700;

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true']; }));
const tokens = (text) => Math.round(String(text || '').length / CHARS_PER_TOKEN);
const readText = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '');

/** Truncate every document body to simulate the pre-fix pack. */
function shrinkPack(pack, perDoc) {
  return { ...pack, items: pack.items.map((it) => ({ ...it, excerpt: it.excerpt.slice(0, perDoc) })) };
}

function stageRow(name, prompt, evidenceChars, articleChars) {
  return {
    stage: name,
    totalChars: prompt.length,
    evidenceChars,
    articleChars,
    otherChars: prompt.length - evidenceChars - articleChars,
    estTokens: tokens(prompt),
  };
}

function auditFixture(slug) {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${slug}.json`), 'utf-8'));
  const model = buildArticleModel(fixture.content);
  const pack = buildEvidencePack(fixture.documents, fixture.keyword, '', { extraMaterial: fixture.extraMaterial });
  const ctx = {
    today: '2026-09-23', keyword: fixture.keyword, contentMode: fixture.mode, topicType: fixture.topicType,
    searchIntent: describeSearchIntent(fixture.keyword, fixture.topicType, fixture.mode),
  };
  const articleChars = model.sections.reduce((n, s) => n + s.title.length + s.text.length, 0);
  const evidenceBlock = describeEvidence(pack);
  const keyFacts = describeKeyFacts(pack);
  const evidenceChars = evidenceBlock.length + keyFacts.length;

  // One realistic issue per stage shape: a MAJOR fact issue on s2 citing the first document.
  const issue = {
    issueKey: 'aaaaaaaaaaaa', severity: 'MAJOR', type: 'UNSUPPORTED_VALUE', sectionId: 's2',
    exactSpan: (model.sections.find((s) => s.id === 's2') || model.sections[1]).text.split(/(?<=[.!?])\s+/)[0] || '문장',
    operation: 'REPLACE', evidenceIds: [fixture.documents[0].id], problem: '자료에 없는 값', requiredChange: '자료 값으로 고친다',
    state: 'OPEN', origin: 'critic', round: 1,
  };
  const targetIds = model.sections.filter((s) => s.kind === 'section').slice(0, 4).map((s) => s.id);
  const editorCtx = { today: ctx.today, keyword: ctx.keyword, title: model.title, searchIntent: ctx.searchIntent };
  const citedEvidenceChars = describeEvidence(pack, [fixture.documents[0].id]).length;

  const criticPrompt = buildCriticPrompt(ctx, model, pack);
  const editorPrompt = buildEditorPrompt(editorCtx, model, targetIds, [issue], pack);
  const verifyPrompt = buildVerificationPrompt(editorCtx, model, targetIds, [issue], pack, 1);
  const editorialPrompt = buildEditorialPrompt({ ...ctx, homefeed: fixture.mode === 'homefeed', removedValues: [] }, model);
  const hashtags = classifyHashtags({ hashtags: model.hashtags, primaryKeyword: fixture.keyword, relatedKeywords: [], relatedKeywordsAreLlmExpanded: false, articleText: '' });
  const judgePrompt = buildJudgePrompt({ ...ctx, hashtags, precheckHardStops: [], openIssues: [issue] }, model, pack);

  const targetArticleChars = model.sections.filter((s) => targetIds.includes(s.id)).reduce((n, s) => n + s.title.length + s.text.length, 0);
  const writerPrompt = readText(path.join(RUNS_DIR, fixture.runId, 'C-final-prompt.txt'));

  // BEFORE (first Critique Loop version): 700-char excerpts.
  const beforePack = shrinkPack(pack, BEFORE_EXCERPT_CHARS);
  const beforeCritic = buildCriticPrompt(ctx, model, beforePack);
  const beforeJudge = buildJudgePrompt({ ...ctx, hashtags, precheckHardStops: [], openIssues: [] }, model, beforePack);

  // Measured on the ACTUAL judge prompt, not a local copy of any cap.
  const judgeEvidencePrinted = describeEvidence(pack);
  const judgeHasDoc = (id) => judgePrompt.includes(`[${id}] `);

  return {
    slug, runId: fixture.runId, keyword: fixture.keyword, mode: fixture.mode,
    documents: pack.items.length,
    docBodyChars: pack.items.map((it) => it.excerpt.length),
    corpusChars: evidenceCorpus(pack).length,
    stages: [
      stageRow('Writer', writerPrompt, 0, 0),
      stageRow('Critic 1', criticPrompt, evidenceChars, articleChars),
      stageRow('Editor', editorPrompt, citedEvidenceChars, targetArticleChars),
      stageRow('Verification', verifyPrompt, citedEvidenceChars, targetArticleChars),
      stageRow('Editorial', editorialPrompt, 0, articleChars),
      stageRow('Judge', judgePrompt, judgeEvidencePrinted.length + keyFacts.length, articleChars),
    ],
    digestDuplicationChars: keyFacts.length,
    before: {
      criticTotal: beforeCritic.length, criticEvidence: describeEvidence(beforePack).length,
      judgeTotal: beforeJudge.length, judgeEvidence: Math.min(describeEvidence(beforePack).length, 6000),
    },
    after: {
      criticTotal: criticPrompt.length, criticEvidence: evidenceBlock.length,
      judgeTotal: judgePrompt.length, judgeEvidence: judgeEvidencePrinted.length,
    },
    // Duplicate detection: the same document body printed twice inside one prompt.
    duplicateEvidenceInPrompt: pack.items.filter((it) => it.excerpt.length > 200
      && criticPrompt.split(it.excerpt.slice(0, 200)).length - 1 > 1).map((it) => it.id),
    judgeDocsPrinted: pack.items.filter((it) => judgeHasDoc(it.id)).map((it) => it.id),
    judgeDocsDropped: pack.items.filter((it) => !judgeHasDoc(it.id)).map((it) => it.id),
    criticDocsDropped: pack.items.filter((it) => !criticPrompt.includes(`[${it.id}] `)).map((it) => it.id),
    perDocBudget: Math.max(1200, Math.min(4000, Math.floor(24000 / Math.max(1, pack.items.length)))),
    capHitDocs: pack.items.filter((it) => it.excerpt.length >= Math.max(1200, Math.min(4000, Math.floor(24000 / Math.max(1, pack.items.length))))).map((it) => it.id),
    prompts: { critic: criticPrompt, judge: judgePrompt, editor: editorPrompt },
  };
}

/** Values the stored live runs actually argued about — the Critic/Judge must be able to judge them. */
const COVERAGE = {
  travel: ['10월 18일', '16∼22일', '10월 31일'],
  policy: ['10월 7일', '7,500만원', '기업은행', '50만원'],
  finance: ['청약', '금리'],
  car: ['트림'],
  entertainment: ['텐텐'],
};

function main() {
  const rows = SLUGS.map(auditFixture);
  for (const r of rows) {
    console.log(`\n== ${r.slug} (${r.keyword}, ${r.mode}) docs=${r.documents} bodies=[${r.docBodyChars.join(',')}] corpus=${r.corpusChars}`);
    console.log('stage         total    evidence  article   ~tokens');
    for (const s of r.stages) {
      console.log(`${s.stage.padEnd(13)} ${String(s.totalChars).padStart(7)} ${String(s.evidenceChars).padStart(9)} ${String(s.articleChars).padStart(8)} ${String(s.estTokens).padStart(9)}`);
    }
    console.log(`BEFORE/AFTER  critic evidence ${r.before.criticEvidence} -> ${r.after.criticEvidence} | judge evidence ${r.before.judgeEvidence} -> ${r.after.judgeEvidence}`);
    console.log(`docs printed — critic dropped: ${r.criticDocsDropped.join(',') || 'none'} | judge dropped: ${r.judgeDocsDropped.join(',') || 'none'} | per-doc budget ${r.perDocBudget}, budget-capped: ${r.capHitDocs.join(',') || 'none'}`);
    console.log(`digest duplication (key facts also inside bodies): ${r.digestDuplicationChars} chars`);
    console.log(`duplicate evidence inside critic prompt: ${r.duplicateEvidenceInPrompt.join(',') || 'none'}`);
    const needles = COVERAGE[r.slug] || [];
    for (const needle of needles) {
      const inCritic = r.prompts.critic.includes(needle);
      const inJudge = r.prompts.judge.includes(needle);
      console.log(`  coverage "${needle}": critic=${inCritic ? 'YES' : 'no'} judge=${inJudge ? 'YES' : 'no'}`);
    }
  }
  const out = args.out || path.join('tmp', 'quality-loop', 'input-audit.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(rows.map((r) => ({ ...r, prompts: undefined })), null, 2), 'utf-8');
  console.log(`\nwrote ${out}`);
}

if (require.main === module) main();
module.exports = { auditFixture };
