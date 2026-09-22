// [2026-09-22 Critique Loop] Builds offline fixtures for critiqueLoopFiveTypes.test.ts from
// real P1 generation-run snapshots on disk. Reads D-model-output.txt (raw model JSON, possibly
// several "body attempt N" retries), A-search-raw.json (source metadata, no bodies) and
// B-research-input.txt (per-document bodies) and writes one compact JSON fixture per run under
// src/__tests__/fixtures/critique/<slug>.json. Node >=18, CommonJS, offline ($0), no network.

'use strict';

const fs = require('fs');
const path = require('path');

let safeParseJson;
try {
  // eslint-disable-next-line global-require
  safeParseJson = require('../dist/jsonParser.js').safeParseJson;
} catch {
  safeParseJson = null;
}

function parseJsonLoose(text) {
  if (safeParseJson) {
    try {
      return safeParseJson(text);
    } catch {
      /* fall through to JSON.parse */
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const APPDATA = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
const RUNS_DIR = path.join(APPDATA, 'better-life-naver', 'generation-runs');
const OUT_DIR = path.join(__dirname, '..', 'src', '__tests__', 'fixtures', 'critique');

const BODY_TRUNCATE_CHARS = 1500;

const RUNS = [
  { slug: 'policy', runId: '20260922-143533-3056zs', keyword: '2026 청년도약계좌 조건', mode: 'seo', topicType: 'POLICY' },
  { slug: 'finance', runId: '20260922-144423-31x0dj', keyword: '청약통장 금리', mode: 'seo', topicType: 'EVERGREEN' },
  { slug: 'car', runId: '20260922-145151-j5s30r', keyword: '2026 셀토스 하이브리드 모의견적', mode: 'seo', topicType: 'CAR' },
  { slug: 'entertainment', runId: '20260922-145518-jia9c6', keyword: '변우석 텐텐', mode: 'homefeed', topicType: 'NEWS_ISSUE' },
  { slug: 'travel', runId: '20260922-145752-3kkif5', keyword: '제주 10월 가볼만한곳', mode: 'seo', topicType: 'EVERGREEN' },
];

/**
 * D-model-output.txt holds one or more "===== body attempt N =====" sections: the model
 * sometimes retries and a short self-critique JSON (clickAnalysis-only, no headings) can be
 * interleaved between full attempts. The block actually used for publishing is the one with
 * the most headings (ties -> the later attempt), verified against F-final-before-publish.txt
 * for all 5 runs in this fixture set.
 */
function pickBestBlock(rawText) {
  const blocks = rawText.split(/=====\s*body attempt \d+\s*=====/);
  let best = null;
  let bestHeadingCount = -1;
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const parsed = parseJsonLoose(trimmed);
    if (!parsed || typeof parsed !== 'object') continue;
    const headingCount = Array.isArray(parsed.headings) ? parsed.headings.length : 0;
    if (headingCount >= bestHeadingCount) {
      best = parsed;
      bestHeadingCount = headingCount;
    }
  }
  return best;
}

function buildBodyPlain(introduction, headings, conclusion) {
  return [introduction, ...headings.map((h) => `${h.title}\n\n${h.content}`), conclusion].join('\n\n');
}

function buildContent(modelOutput) {
  const headings = (Array.isArray(modelOutput.headings) ? modelOutput.headings : []).map((h) => ({
    title: String(h?.title ?? ''),
    content: String(h?.content ?? ''),
    summary: '',
    keywords: [],
    imagePrompt: '',
  }));
  const introduction = String(modelOutput.introduction ?? '');
  const conclusion = String(modelOutput.conclusion ?? '');
  const bodyPlain = buildBodyPlain(introduction, headings, conclusion);
  return {
    status: 'success',
    generationTime: '0',
    selectedTitle: String(modelOutput.selectedTitle ?? ''),
    titleAlternatives: [],
    titleCandidates: [],
    bodyHtml: '',
    bodyPlain,
    headings,
    hashtags: Array.isArray(modelOutput.hashtags) ? modelOutput.hashtags : [],
    images: [],
    metadata: {},
    quality: {},
    introduction,
    conclusion,
  };
}

// --- B-research-input.txt: per-document bodies -----------------------------------------

const DOC_HEADER_RE = /^\[자료\s+(S\d+)\]\s*$/;

function parseDocBlock(id, lines) {
  let title = '';
  let sourceName = '';
  let domain = '';
  let url = '';
  let pubDate = '';
  let dateStatus = 'UNKNOWN_DATE';
  let sourceType = 'unknown';
  let sourceTier = 'UNKNOWN';
  let bodyStart = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('제목:')) title = line.slice('제목:'.length).trim();
    else if (line.startsWith('기관/매체:')) sourceName = line.slice('기관/매체:'.length).trim();
    else if (line.startsWith('출처:') && !sourceName) sourceName = line.slice('출처:'.length).trim();
    else if (line.startsWith('도메인:')) domain = line.slice('도메인:'.length).trim();
    else if (line.startsWith('URL:')) url = line.slice('URL:'.length).trim();
    else if (line.startsWith('게시일:')) {
      const m = /게시일:\s*(\S+)\s*\|\s*(\S+)/.exec(line);
      if (m) { pubDate = m[1]; dateStatus = m[2]; }
    } else if (line.startsWith('자료 유형:')) {
      const m = /자료\s*유형:\s*(\S+)\s*·\s*신뢰\s*등급:\s*(\S+)/.exec(line);
      if (m) { sourceType = m[1]; sourceTier = m[2]; }
    } else if (line.startsWith('본문:')) {
      bodyStart = i + 1;
      break;
    }
  }
  const body = bodyStart >= 0 ? lines.slice(bodyStart).join('\n').trim() : '';
  return { id, title, sourceName, domain, url, pubDate, dateStatus, sourceType, sourceTier, body };
}

function parseResearchInput(text) {
  const lines = text.split('\n');
  const headerLines = [];
  lines.forEach((line, idx) => {
    const m = DOC_HEADER_RE.exec(line.trim());
    if (m) headerLines.push({ line: idx, id: m[1] });
  });
  const docs = [];
  for (let i = 0; i < headerLines.length; i += 1) {
    const cur = headerLines[i];
    const next = i + 1 < headerLines.length ? headerLines[i + 1].line : lines.length;
    docs.push(parseDocBlock(cur.id, lines.slice(cur.line + 1, next)));
  }
  return docs;
}

// --- A-search-raw.json: pre-body metadata -----------------------------------------------

function loadSourceMeta(runDir) {
  const raw = fs.readFileSync(path.join(runDir, 'A-search-raw.json'), 'utf-8');
  const parsed = JSON.parse(raw);
  const byId = new Map();
  for (const doc of Array.isArray(parsed.sourceDocuments) ? parsed.sourceDocuments : []) {
    byId.set(doc.id, doc);
  }
  return byId;
}

// --- Document merge ------------------------------------------------------------------------

function buildDocuments(runDir) {
  const metaById = loadSourceMeta(runDir);
  const researchText = fs.readFileSync(path.join(runDir, 'B-research-input.txt'), 'utf-8');
  const parsedDocs = parseResearchInput(researchText);

  return parsedDocs.map((doc) => {
    const meta = metaById.get(doc.id) || {};
    return {
      id: doc.id,
      title: meta.title || doc.title,
      sourceType: meta.sourceType || doc.sourceType,
      sourceName: meta.sourceName || doc.sourceName,
      domain: doc.domain || undefined,
      url: meta.url || doc.url,
      pubDate: meta.pubDate || doc.pubDate || undefined,
      dateStatus: meta.dateStatus || doc.dateStatus,
      sourceTier: meta.sourceTier || doc.sourceTier,
      body: doc.body.slice(0, BODY_TRUNCATE_CHARS),
      relevance: { accepted: true },
    };
  });
}

// --- Main ------------------------------------------------------------------------------------

function buildFixture(run) {
  const runDir = path.join(RUNS_DIR, run.runId);
  const modelOutputRaw = fs.readFileSync(path.join(runDir, 'D-model-output.txt'), 'utf-8');
  const modelOutput = pickBestBlock(modelOutputRaw);
  if (!modelOutput || !Array.isArray(modelOutput.headings) || modelOutput.headings.length === 0) {
    throw new Error(`[${run.slug}] no valid model output block with headings found in ${run.runId}`);
  }
  const content = buildContent(modelOutput);
  const documents = buildDocuments(runDir);

  const fixture = {
    runId: run.runId,
    keyword: run.keyword,
    mode: run.mode,
    topicType: run.topicType,
    content,
    documents,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${run.slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2), 'utf-8');
  const bytes = Buffer.byteLength(fs.readFileSync(outPath));
  console.log(`[${run.slug}] wrote ${outPath} (${(bytes / 1024).toFixed(1)} KB, ${modelOutput.headings.length} headings, ${documents.length} documents)`);
}

function main() {
  for (const run of RUNS) {
    buildFixture(run);
  }
}

main();
