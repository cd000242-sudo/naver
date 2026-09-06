/* eslint-disable no-console */
/**
 * R4 shadow 계측 — 관통 판정(throughlineJudge)을 기존 생성물 전부에 돌리고,
 * "miss 에 −5 감점을 얹으면 decision / quality90 miss 가 몇 편이나 뒤집히는가"를 센다.
 * 코드(evaluator)는 건드리지 않는다. 감점 해제 여부는 이 숫자를 보고 결정한다.
 *   env -u ELECTRON_RUN_AS_NODE npx electron tmp/throughline-shadow.cjs
 * 결과: tmp/throughline-shadow.json + tmp/throughline-shadow.log
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app } = require('electron');

const ROOT = path.join(process.cwd(), 'tmp', 'one-article');
const GATE_MODES = new Set(['homefeed', 'affiliate', 'business', 'custom', 'mate']);
const DEDUCT = Number(process.env.SHADOW_DEDUCT || 5);
const CONCURRENCY = 4;
const LOG = path.join(process.cwd(), 'tmp', 'throughline-shadow.log');
const lines = [];
const out = (s) => { lines.push(s); console.log(s); };

function userDataDir() {
  const base = process.env.APPDATA
    || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  const cur = path.join(base, 'better-life-naver');
  return fs.existsSync(cur) ? cur : path.join(base, 'naver-blog-automation');
}

function readMeta(dir) {
  try {
    const log = fs.readFileSync(path.join(dir, 'console.log'), 'utf-8');
    const m = log.match(/\[one-article\] keyword="([^"]*)" mode=([a-z]+)/);
    if (m) return { keyword: m[1], mode: m[2] };
  } catch {}
  return { keyword: null, mode: null };
}

// Mirrors qualityEvaluator.decide() (not exported).
function decide(final, safety) {
  if (safety < 50) return 'regenerate';
  if (final < 60) return 'regenerate';
  if (final < 80) return 'patch';
  return 'pass';
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const dir = process.env.ONE_ARTICLE_USERDATA || userDataDir();
  app.setName(path.basename(dir));
  app.setPath('userData', dir);
  await app.whenReady();

  const { loadConfig, applyConfigToEnv } = require('../dist/configManager.js');
  const { resolveSelectedEngineRoute } = require('../dist/main/ipc/paraphraseAnalysisHandlers.js');
  const { judgeThroughline } = require('../dist/content/throughlineJudge.js');
  const { evaluate } = require('../dist/content/qualityEvaluator.js');
  const { assessQuality90Gate } = require('../dist/content/quality90Gate.js');
  const { paragraphizeForEvaluation, homefeedParagraphSentences } = require('../dist/contentBodyTransforms.js');
  const config = await loadConfig();
  applyConfigToEnv(config);
  const engine = process.env.SHADOW_ENGINE || 'gemini';
  const route = await resolveSelectedEngineRoute(engine, config);
  if (!route) { out(`[shadow] 선택 엔진 ${engine} 라우트 없음 — 중단`); app.exit(1); return; }
  out(`[shadow] engine=${route.engine} deduct=${DEDUCT}`);

  const samples = [];
  for (const stamp of fs.readdirSync(ROOT)) {
    const d = path.join(ROOT, stamp);
    const cj = path.join(d, 'content.json');
    if (!fs.existsSync(cj)) continue;
    let content;
    try { content = JSON.parse(fs.readFileSync(cj, 'utf-8')); } catch { continue; }
    if (!String(content.conclusion || '').trim() || !content.bodyPlain) continue;
    samples.push({ stamp, dir: d, content });
  }
  out(`[shadow] 표본 ${samples.length}편`);

  const rows = await mapLimit(samples, CONCURRENCY, async ({ stamp, dir: d, content }) => {
    const meta = readMeta(d);
    const contentMode = content.__generatedMode || meta.mode || 'seo';
    const mode = GATE_MODES.has(contentMode) ? contentMode : 'seo';
    const rawText = fs.existsSync(path.join(d, 'material.txt')) ? fs.readFileSync(path.join(d, 'material.txt'), 'utf-8') : '';
    const intro = String(content.introduction || '').trim();
    const ev = evaluate({
      title: content.selectedTitle || '',
      headings: content.headings || [],
      rawText,
      primaryKeyword: meta.keyword && !/^https?:\/\//i.test(meta.keyword) ? meta.keyword : String((content.hashtags || [])[0] || '').replace(/^#/, ''),
      secondaryKeywords: [],
      mode,
      contentMode,
      groundingText: rawText,
      aiExperienceOptIn: contentMode === 'affiliate',
      sourceIsUrl: /^https?:\/\//i.test(String(meta.keyword || '')),
      body: paragraphizeForEvaluation([intro, content.bodyPlain, content.conclusion].filter(Boolean).join('\n\n'), homefeedParagraphSentences(contentMode)),
    });
    const q = assessQuality90Gate(ev, mode);
    const judge = await judgeThroughline(content, async () => route);
    let shadow = null;
    if (judge.judged && !judge.holds) {
      const final = ev.finalScore - DEDUCT;
      const adj = { ...ev, finalScore: final, modeScore: { ...ev.modeScore, score: ev.modeScore.score - DEDUCT }, decision: decide(final, ev.safetyScore.score) };
      const q2 = assessQuality90Gate(adj, mode);
      shadow = { decision: adj.decision, miss: q2.miss, decisionFlip: adj.decision !== ev.decision, missFlip: q2.miss !== q.miss };
    }
    const row = {
      stamp, mode: contentMode, title: content.selectedTitle || '',
      final: ev.finalScore, modeS: ev.modeScore.score, decision: ev.decision, miss: q.miss,
      judged: judge.judged, holds: judge.holds, breakAt: judge.breakAt, reason: judge.reason, patchable: judge.patchable,
      shadow,
    };
    out(`  ${row.judged ? (row.holds ? '✅' : `⚠️ ${row.breakAt}`) : '⏭️'} [${contentMode}] final ${row.final} mode ${row.modeS} ${row.decision}/${row.miss ? 'miss' : 'ok'}${shadow ? ` → −${DEDUCT}: ${shadow.decision}/${shadow.miss ? 'miss' : 'ok'}${shadow.decisionFlip || shadow.missFlip ? ' ◀ 뒤집힘' : ''}` : ''} · ${row.title.slice(0, 40)}${row.judged && !row.holds ? `\n       ${row.reason}` : ''}`);
    return row;
  });

  const judged = rows.filter((r) => r.judged);
  const misses = judged.filter((r) => !r.holds);
  const byBreak = {};
  for (const r of misses) byBreak[r.breakAt] = (byBreak[r.breakAt] || 0) + 1;
  const byMode = {};
  for (const r of judged) {
    byMode[r.mode] = byMode[r.mode] || { n: 0, miss: 0 };
    byMode[r.mode].n++;
    if (!r.holds) byMode[r.mode].miss++;
  }
  const dFlips = misses.filter((r) => r.shadow?.decisionFlip);
  const mFlips = misses.filter((r) => r.shadow?.missFlip);
  out('');
  out(`[shadow] 판정 ${judged.length}/${rows.length}편 · miss ${misses.length}편 (${judged.length ? Math.round((misses.length / judged.length) * 100) : 0}%) · breakAt ${JSON.stringify(byBreak)}`);
  out(`[shadow] 모드별 miss: ${Object.entries(byMode).map(([m, v]) => `${m} ${v.miss}/${v.n}`).join(' · ')}`);
  out(`[shadow] −${DEDUCT} 감점 시 decision 뒤집힘 ${dFlips.length}편 · quality90 miss 뒤집힘 ${mFlips.length}편 (miss 중 patch 불가(intro) ${misses.filter((r) => !r.patchable).length}편)`);
  for (const r of [...new Set([...dFlips, ...mFlips])]) out(`  - ${r.stamp} [${r.mode}] ${r.decision}→${r.shadow.decision} miss ${r.miss}→${r.shadow.miss} final ${r.final} · ${r.title.slice(0, 40)}`);
  fs.writeFileSync(path.join(process.cwd(), 'tmp', 'throughline-shadow.json'), JSON.stringify(rows, null, 2), 'utf-8');
  fs.writeFileSync(LOG, lines.join('\n') + '\n', 'utf-8');
  app.exit(0);
}

main().catch((e) => { console.error(e); try { fs.writeFileSync(LOG, lines.join('\n') + '\n' + String(e && e.stack || e), 'utf-8'); } catch {} app.exit(1); });
