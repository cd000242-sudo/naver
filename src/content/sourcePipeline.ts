// [2026-09-22 audit P0-1/P0-4/H6/H7 + P1 relevance v2] Source pipeline: clean per document,
// rank relevance (entity/intent/topic-freshness aware — see sourceRelevanceRanking.ts), and
// render the writer input WITH source labels. Structured documents (from
// collectContentFromPlatforms) are preferred; the legacy "[자료 N — 제목]" bundle is
// parsed into documents as a fallback so the same per-block cleaning applies to every path.
//
// Every stage reports counts so a 73%-loss can never again read as "사이트 껍데기 제거",
// and a Seoul-jeonse article can never again pass for "청약통장 금리" on shared filler words.

import { parseLegacyMaterialBundle, type SourceDocument } from './sourceDocument.js';
import { renderSourceDocumentsForWriter, summarizeSourceDocuments } from './sourceDocumentRender.js';
import { buildResearchSummary } from './researchSummary.js';
import { computeSourceRanking, type SourceRankingEntry, type TopicType } from './sourceRelevanceRanking.js';
import { stripSourceNoise, stripSourceNoiseFromBody } from './sourceNoiseFilter.js';

export interface SourcePipelineMetrics {
  rawSources: number;
  rawChars: number;
  cleanChars: number;
  removedChars: number;
  removedRatio: number;         // 0..1
  acceptedSources: number;
  rejectedSources: number;
  unknownDateSources: number;
  rejectedReasons: Record<string, number>;
  usedStructured: boolean;
  level: 'ok' | 'warn' | 'weak';
  topicType: TopicType;
}

export interface SourcePipelineResult {
  rawText: string;
  documents: SourceDocument[];
  ranking: SourceRankingEntry[];
  metrics: SourcePipelineMetrics;
  logLine: string;
}

interface PipelineSource {
  rawText?: string;
  contentMode?: string;
  url?: string;
  sourceType?: string;
  metadata?: Record<string, unknown>;
}

export interface PrepareSourceMaterialOptions {
  /** Injectable clock for deterministic freshness tests. */
  now?: Date;
  /**
   * Optional async LLM-judge hook for ambiguous-relevance documents. NOT invoked by
   * prepareSourceMaterial itself — this function stays synchronous so the existing
   * unawaited call site in contentGenerator.ts keeps working. Accepted here only so
   * callers share the same options shape as rankSourceDocuments (sourceRelevanceRanking.ts);
   * use rankSourceDocuments directly when the judge pass is actually needed.
   */
  judgeAmbiguous?: (doc: SourceDocument, keyword: string) => Promise<{ verdict: 'accept' | 'reject' | 'unknown'; model: string }>;
  /**
   * [P1] Verdicts already obtained for ambiguous documents (id → verdict). contentGenerator runs the
   * one batched selected-engine judge call between two synchronous passes and feeds the result here:
   * 'reject' flips the document to REJECT_JUDGE_IRRELEVANT and the verdict is recorded on the ranking entry.
   */
  judgeVerdicts?: Record<string, { verdict: 'accept' | 'reject' | 'unknown'; model: string }>;
}

const WARN_RATIO = 0.3;
const WEAK_RATIO = 0.5;

function levelFor(removedRatio: number): SourcePipelineMetrics['level'] {
  if (removedRatio > WEAK_RATIO) return 'weak';
  if (removedRatio > WARN_RATIO) return 'warn';
  return 'ok';
}

function reasonCount(reasons: Record<string, number>, key: string): number {
  return reasons[key] || 0;
}

function formatLog(m: SourcePipelineMetrics): string {
  const prefix = m.level === 'weak' ? '⛔ QUALITY_GATE_WEAK ' : m.level === 'warn' ? '⚠️ WARNING ' : '';
  const reasons = Object.entries(m.rejectedReasons).map(([k, v]) => `${k}=${v}`).join(',');
  return `[SourcePipeline] ${prefix}raw_sources=${m.rawSources} raw_chars=${m.rawChars} clean_chars=${m.cleanChars} `
    + `removed_chars=${m.removedChars} removed_ratio=${(m.removedRatio * 100).toFixed(1)}% `
    + `accepted_sources=${m.acceptedSources} rejected_sources=${m.rejectedSources}${reasons ? `(${reasons})` : ''} `
    + `unknown_date=${m.unknownDateSources} mode=${m.usedStructured ? 'structured' : 'legacy-bundle'} `
    + `topic=${m.topicType} entity_mismatch=${reasonCount(m.rejectedReasons, 'REJECT_ENTITY_MISMATCH')} `
    + `body_irrelevant=${reasonCount(m.rejectedReasons, 'REJECT_BODY_IRRELEVANT')} too_old=${reasonCount(m.rejectedReasons, 'REJECT_TOO_OLD')} `
    + `duplicate=${reasonCount(m.rejectedReasons, 'REJECT_DUPLICATE')} low_quality=${reasonCount(m.rejectedReasons, 'REJECT_LOW_SOURCE_QUALITY')}`;
}

function cleanDocuments(docs: SourceDocument[]): SourceDocument[] {
  return docs.map((doc) => {
    const cleaned = stripSourceNoiseFromBody(doc.body);
    const rawChars = doc.body.length;
    const cleanChars = cleaned.text.length;
    return {
      ...doc,
      cleanedBody: cleaned.text,
      retention: { rawChars, cleanChars, removedChars: Math.max(0, rawChars - cleanChars) },
    };
  });
}

function isUrlMode(source: PipelineSource): boolean {
  return Boolean(source.url) || source.sourceType === 'naver_news' || source.sourceType === 'daum_news';
}

/**
 * Prepare writer material. Returns the (possibly re-rendered) rawText plus metrics.
 * URL mode keeps the legacy string path (the article itself is the material); keyword mode
 * uses structured documents when available, else parses the legacy bundle into documents.
 *
 * Stays synchronous — see PrepareSourceMaterialOptions.judgeAmbiguous doc comment.
 */
export function prepareSourceMaterial(
  source: PipelineSource,
  keyword: string,
  opts: PrepareSourceMaterialOptions = {},
): SourcePipelineResult {
  const rawText = String(source.rawText || '');
  const mode = String(source.contentMode || 'seo');
  const structured = Array.isArray(source.metadata?.sourceDocuments)
    ? (source.metadata!.sourceDocuments as SourceDocument[]).filter((d) => d && typeof d.body === 'string' && d.body.trim())
    : [];

  // URL / paraphrase mode: the user's article is the material — block-aware noise strip only.
  if (isUrlMode(source) || (structured.length === 0 && !parseLegacyMaterialBundle(rawText))) {
    const noise = stripSourceNoise(rawText);
    const metrics: SourcePipelineMetrics = {
      rawSources: noise.documents?.total ?? (rawText.trim() ? 1 : 0),
      rawChars: rawText.length,
      cleanChars: noise.text.length,
      removedChars: Math.max(0, rawText.length - noise.text.length),
      removedRatio: rawText.length > 0 ? Math.max(0, rawText.length - noise.text.length) / rawText.length : 0,
      acceptedSources: noise.documents?.kept ?? (noise.text.trim() ? 1 : 0),
      rejectedSources: 0,
      unknownDateSources: 0,
      rejectedReasons: {},
      usedStructured: false,
      level: 'ok',
      topicType: 'EVERGREEN',
    };
    metrics.level = levelFor(metrics.removedRatio);
    return { rawText: noise.text, documents: [], ranking: [], metrics, logLine: formatLog(metrics) };
  }

  let usedStructured = true;
  let docs = structured;
  let preambleTierNotice = '';
  let snippetSection = '';
  if (docs.length === 0) {
    usedStructured = false;
    const bundle = parseLegacyMaterialBundle(rawText)!;
    docs = bundle.documents;
    snippetSection = bundle.snippetSection;
    // Keep the material-grade notice (useful), drop the old "번호표를 옮기지 마라" lines —
    // the renderer's preamble replaces them with the attribution-positive instruction.
    preambleTierNotice = bundle.preamble
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('※') && !line.trim().startsWith('=== '))
      .join('\n')
      .trim();
  } else {
    // Structured path: the snippet section still lives in the legacy string (after the docs).
    const bundle = parseLegacyMaterialBundle(rawText);
    snippetSection = bundle?.snippetSection || '';
    preambleTierNotice = (bundle?.preamble || '')
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('※') && !line.trim().startsWith('=== '))
      .join('\n')
      .trim();
  }

  const rawChars = docs.reduce((sum, d) => sum + d.body.length, 0) + snippetSection.length;
  const cleaned = cleanDocuments(docs);
  const forceTopicType: TopicType | undefined = mode === 'homefeed' ? 'NEWS_ISSUE' : undefined;
  const base = computeSourceRanking(cleaned, keyword, {
    mode,
    now: opts.now,
    forceTopicType,
  });
  const verdicts = opts.judgeVerdicts ?? {};
  const scored = base.ranked.map((d) => (verdicts[d.id]?.verdict === 'reject'
    ? { ...d, relevance: { ...(d.relevance || { score: 0 }), accepted: false, reason: 'REJECT_JUDGE_IRRELEVANT' as const } }
    : d));
  const ranking = base.ranking.map((e) => (verdicts[e.id]
    ? { ...e, judge: verdicts[e.id], ...(verdicts[e.id].verdict === 'reject' ? { accepted: false, reason: 'REJECT_JUDGE_IRRELEVANT' as const } : {}) }
    : e));
  const topicType = base.topicType;
  const accepted = scored.filter((d) => d.relevance?.accepted !== false);
  const rejected = scored.filter((d) => d.relevance?.accepted === false);
  const rejectedReasons: Record<string, number> = {};
  for (const d of rejected) {
    const reason = d.relevance?.reason || 'REJECTED';
    rejectedReasons[reason] = (rejectedReasons[reason] || 0) + 1;
  }
  // Never drop everything on relevance alone — if the scorer rejects all, keep the docs and warn.
  const writerDocs = accepted.length > 0 ? accepted : scored;
  const rendered = renderSourceDocumentsForWriter(writerDocs);
  // [P1] Research Summary (code-extracted) goes BEFORE the long documents so numbers, dates and
  // official statements — with their source ids — are the first thing the writer reads.
  const research = buildResearchSummary(writerDocs, keyword).text;
  const parts = [preambleTierNotice, research, rendered, snippetSection.trim()].filter(Boolean);
  const finalText = parts.join('\n\n');
  // Retention measures CLEANING loss only (chrome stripped from bodies). Relevance/freshness
  // rejections are reported separately as accepted/rejected — a stale-but-clean document is not "lost".
  const cleanChars = scored.reduce((sum, d) => sum + (d.cleanedBody ?? d.body).length, 0) + snippetSection.length;
  const summary = summarizeSourceDocuments(scored);

  const metrics: SourcePipelineMetrics = {
    rawSources: docs.length,
    rawChars,
    cleanChars,
    removedChars: Math.max(0, rawChars - cleanChars),
    removedRatio: rawChars > 0 ? Math.max(0, rawChars - cleanChars) / rawChars : 0,
    acceptedSources: accepted.length > 0 ? accepted.length : scored.length,
    rejectedSources: accepted.length > 0 ? rejected.length : 0,
    unknownDateSources: summary.unknownDate,
    rejectedReasons: accepted.length > 0 ? rejectedReasons : { ALL_REJECTED_KEPT: rejected.length },
    usedStructured,
    level: 'ok',
    topicType,
  };
  metrics.level = levelFor(metrics.removedRatio);
  return { rawText: finalText, documents: scored, ranking, metrics, logLine: formatLog(metrics) };
}
