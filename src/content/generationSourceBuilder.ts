// [2026-09-22 P1] One source pipeline for every publish path.
//
// Before this module the manual (renderer) path was the only one that searched, cleaned and
// labelled sources before writing: SmartScheduler and multi-account built
// `{ type: 'keyword', value }` and called the generator, which never reads `type` and throws
// "원본 텍스트가 비어 있습니다" — both paths were dead. They now go through the same
// collect → assemble steps the renderer uses, with an explicit SourceStatus so a
// search-based article is never written from nothing.

import type { AppConfig } from '../configManager.js';
import {
  assembleContentSource,
  collectContentFromPlatforms,
  type SourceAssemblyInput,
} from '../sourceAssembler.js';
import type { ContentGeneratorProvider, ContentSource } from '../contentGenerator.js';
import { planExpandedRetrieval } from './thinMaterialExpansion.js';
import { MATERIAL_DOCUMENT_SEPARATOR } from './eventCohesion.js';
import type { SourceDocument } from './sourceDocument.js';

export type SourceStatus = 'SOURCE_OK' | 'SOURCE_PARTIAL' | 'SOURCE_EMPTY' | 'SOURCE_PIPELINE_FAILED';

type CollectResult = Awaited<ReturnType<typeof collectContentFromPlatforms>>;

export interface CollectKeywordOptions {
  maxPerSource?: number;
  targetDate?: string;
  /** Force the thin-material expansion even when config.expandedRetrieval is off (re-search). */
  forceExpandedRetrieval?: boolean;
  logger?: (message: string) => void;
}

/** Search credentials resolved the same way configManager does (search API first, datalab fallback). */
export function resolveSearchCredentials(config: AppConfig): { clientId?: string; clientSecret?: string } {
  // Search API credentials first, datalab as fallback — same order as configManager.
  return {
    clientId: config.naverClientId || config.naverDatalabClientId || undefined,
    clientSecret: config.naverClientSecret || config.naverDatalabClientSecret || undefined,
  };
}

/**
 * Collect keyword materials (search API → full texts → structured documents), with the optional
 * thin-material expansion. Shared by the renderer IPC handler, SmartScheduler and multi-account.
 */
export async function collectKeywordMaterials(
  keyword: string,
  config: AppConfig,
  options: CollectKeywordOptions = {},
): Promise<CollectResult> {
  const logger = options.logger ?? ((msg: string) => console.log(msg));
  const { clientId: crawlClientId, clientSecret: crawlClientSecret } = resolveSearchCredentials(config);
  if (!crawlClientId || !crawlClientSecret) {
    logger(
      '[SourceBuilder] ⚠️ 네이버 검색 API 자격증명 불완전 '
      + `(clientId=${crawlClientId ? '있음' : '없음'}, clientSecret=${crawlClientSecret ? '있음' : '없음'}) `
      + '→ 빠른 수집 경로를 쓸 수 없어 느린 폴백으로 진행합니다. 설정에서 네이버 검색 API Client Secret을 입력하세요.',
    );
  }
  // Grounding (paid Google search) only when the user picked it as the fact-check engine.
  const allowGroundingFallback = String((config as Record<string, unknown>).factCheckEngine || '').trim() === 'gemini-grounding';
  const collectOnce = (query: string) => collectContentFromPlatforms(query, {
    maxPerSource: options.maxPerSource ?? 10,
    clientId: crawlClientId,
    clientSecret: crawlClientSecret,
    logger,
    targetDate: options.targetDate,
    allowGroundingFallback,
  });
  const result = await collectOnce(keyword);

  const expandedRetrieval = options.forceExpandedRetrieval === true
    || (config as Record<string, unknown>).expandedRetrieval === true;
  const plan = planExpandedRetrieval(String(result?.collectedText ?? ''), keyword, { enabled: expandedRetrieval });
  logger(`[ExpandedRetrieval] ${plan.reason}`);
  if (!plan.shouldExpand) return result;

  const extraTexts: string[] = [];
  const extraDocs: SourceDocument[] = [];
  let extraCount = 0;
  for (const query of plan.queries) {
    try {
      const extra = await collectOnce(query);
      if (extra?.success && extra.collectedText) {
        extraTexts.push(extra.collectedText);
        extraDocs.push(...(extra.sourceDocuments ?? []));
        extraCount += extra.sourceCount ?? 0;
        logger(`[ExpandedRetrieval] ✅ "${query}" — ${extra.collectedText.length}자 추가`);
      } else {
        logger(`[ExpandedRetrieval] ⚪ "${query}" — 추가 자료 없음`);
      }
    } catch (expandError) {
      logger(`[ExpandedRetrieval] "${query}" 실패: ${(expandError as Error)?.message}`);
    }
  }
  if (extraTexts.length === 0) return result;
  return {
    ...result,
    success: true,
    collectedText: [String(result?.collectedText ?? ''), ...extraTexts]
      .filter((text) => text.trim().length > 0)
      .join(MATERIAL_DOCUMENT_SEPARATOR),
    sourceCount: (result?.sourceCount ?? 0) + extraCount,
    sourceDocuments: [...(result?.sourceDocuments ?? []), ...extraDocs],
  };
}

/** SOURCE_EMPTY / PARTIAL / FAILED / OK from what the collector actually returned. */
export function resolveSourceStatus(collected: Partial<CollectResult> | null | undefined): SourceStatus {
  if (!collected) return 'SOURCE_PIPELINE_FAILED';
  const overall = String(collected.searchStatus?.overall || '');
  const docs = collected.sourceDocuments?.length ?? 0;
  const text = String(collected.collectedText || '').trim().length;
  if (overall === 'SEARCH_RATE_LIMITED' || overall === 'SEARCH_BLOCKED') return 'SOURCE_PIPELINE_FAILED';
  if (!collected.success && text === 0 && docs === 0) {
    return collected.message ? 'SOURCE_PIPELINE_FAILED' : 'SOURCE_EMPTY';
  }
  if (docs === 0 && text === 0) return 'SOURCE_EMPTY';
  if (overall === 'SEARCH_PARTIAL') return 'SOURCE_PARTIAL';
  return 'SOURCE_OK';
}

export interface KeywordGenerationSourceOptions {
  keyword: string;
  config: AppConfig;
  generator: ContentGeneratorProvider;
  contentMode?: string;
  targetAge?: '20s' | '30s' | '40s' | '50s' | 'all';
  toneStyle?: string;
  minChars?: number;
  title?: string;
  manualTitleOverride?: string;
  affiliateUrl?: string;
  categoryHint?: string;
  contentPolicyPrompt?: string;
  previousTitles?: string[];
  scheduleDate?: string;
  /** Re-search once with expansion when the first pass is empty (SmartScheduler / multi-account). */
  retryWhenEmpty?: boolean;
  logger?: (message: string) => void;
}

export interface KeywordGenerationSourceResult {
  source: ContentSource;
  sourceStatus: SourceStatus;
  collected: CollectResult;
  warnings: string[];
  assemblyInput: SourceAssemblyInput;
}

export class SourceEmptyError extends Error {
  readonly code: 'SOURCE_EMPTY' | 'SOURCE_PIPELINE_FAILED';
  readonly keyword: string;
  constructor(code: 'SOURCE_EMPTY' | 'SOURCE_PIPELINE_FAILED', keyword: string, detail?: string) {
    super(`${code}: "${keyword}" 근거 자료를 찾지 못해 글을 쓰지 않습니다${detail ? ` (${detail})` : ''} — 수동 검토 또는 재검색 필요`);
    this.name = 'SourceEmptyError';
    this.code = code;
    this.keyword = keyword;
  }
}

function buildRecencyDirective(scheduleDate?: string): string {
  const referenceDate = (() => {
    const d = scheduleDate ? new Date(scheduleDate) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  })();
  const currentYear = new Date().getFullYear();
  return `[최신성 규칙]
- 기준일: ${referenceDate} (현재 ${currentYear}년)
- 작성 내용은 기준일 기준 최신 정보(최근 동향/최근 발표/최근 이슈)를 우선 반영하세요.
- '최근' 또는 '올해'라고 할 때는 ${currentYear}년을 의미합니다.
- 확실하지 않은 과거 수치/사실은 단정하지 말고 일반적인 설명으로 처리하세요.`;
}

/**
 * Build the writer source for a keyword exactly like the manual path: collect → (re-search once
 * when empty) → assembleContentSource with structured documents, search status and the
 * "real-time material was expected" flag. Throws SourceEmptyError when a search-based article
 * would otherwise be written from nothing.
 */
export async function buildKeywordGenerationSource(
  opts: KeywordGenerationSourceOptions,
): Promise<KeywordGenerationSourceResult> {
  const keyword = String(opts.keyword || '').trim();
  if (!keyword) throw new SourceEmptyError('SOURCE_EMPTY', keyword, 'keyword empty');
  const logger = opts.logger ?? ((msg: string) => console.log(msg));

  let collected = await collectKeywordMaterials(keyword, opts.config, { maxPerSource: 10, targetDate: opts.scheduleDate, logger });
  let sourceStatus = resolveSourceStatus(collected);
  if (sourceStatus === 'SOURCE_EMPTY' && opts.retryWhenEmpty !== false) {
    logger(`[SourceBuilder] "${keyword}" 1차 수집 0건 → 키워드 분해 재검색 1회`);
    collected = await collectKeywordMaterials(keyword, opts.config, { maxPerSource: 10, targetDate: opts.scheduleDate, forceExpandedRetrieval: true, logger });
    sourceStatus = resolveSourceStatus(collected);
  }
  logger(`[SourceBuilder] "${keyword}" status=${sourceStatus} docs=${collected.sourceDocuments?.length ?? 0} chars=${String(collected.collectedText || '').length} search=${collected.searchStatus?.overall || '-'}`);
  if (sourceStatus === 'SOURCE_EMPTY' || sourceStatus === 'SOURCE_PIPELINE_FAILED') {
    throw new SourceEmptyError(sourceStatus, keyword, collected.searchStatus?.summary || collected.message);
  }

  const crawledText = String(collected.collectedText || '');
  const recency = buildRecencyDirective(opts.scheduleDate);
  const assemblyInput: SourceAssemblyInput = {
    generator: opts.generator,
    keywords: [keyword],
    targetAge: opts.targetAge ?? 'all',
    minChars: opts.minChars,
    title: opts.title || undefined,
    baseText: crawledText || undefined,
    draftText: `${recency}\n[주제 고정 규칙]\n- 이 글의 주제는 반드시 "${keyword}" 하나로만 유지하세요.\n- 실시간 수집 정보도 위 주제와 직접 관련된 내용만 사용하세요.\n\n[실시간 수집된 최신 정보 - 아래 내용을 반드시 참고하여 정확한 글 작성]\n\n${crawledText.substring(0, 10000)}`,
    useRealTimeInfo: crawledText.length > 0,
    sourceDocuments: collected.sourceDocuments,
    searchStatus: collected.searchStatus,
    realtimeCrawlRequested: true,
    previousTitles: opts.previousTitles,
    naverClientId: resolveSearchCredentials(opts.config).clientId,
    naverClientSecret: resolveSearchCredentials(opts.config).clientSecret,
  } as SourceAssemblyInput;
  const { source: assembled, warnings } = await assembleContentSource(assemblyInput);
  const source: ContentSource = {
    ...assembled,
    contentMode: (opts.contentMode || assembled.contentMode || 'seo') as ContentSource['contentMode'],
    toneStyle: (opts.toneStyle || assembled.toneStyle) as ContentSource['toneStyle'],
    ...(opts.manualTitleOverride ? { manualTitleOverride: opts.manualTitleOverride } : {}),
    ...(opts.affiliateUrl ? { affiliateUrl: opts.affiliateUrl } : {}),
    ...(opts.categoryHint ? { categoryHint: opts.categoryHint } : {}),
    ...(opts.contentPolicyPrompt ? { contentPolicyPrompt: opts.contentPolicyPrompt } : {}),
    metadata: { ...(assembled.metadata || {}), sourceStatus },
  } as ContentSource;
  return { source, sourceStatus, collected, warnings, assemblyInput };
}
