import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
// ✅ [2026-05-25 v2.10.356] OpenAI RPM preemptive throttler + 누진 backoff
// ✅ [2026-06-02] 호출 간 최소 간격(10s) + 30→60→90→120 누진 backoff
import {
  openaiRpmThrottler,
  getQuotaBackoffMs,
  getOpenAiMinIntervalMs,
  getOpenAiMaxCompletionTokens,
  getOpenAiRateLimitPatienceMs,
  getOpenAiRateLimitWaitMs,
  isOpenAiHardQuotaError,
  isOpenAiRateLimitError,
} from './utils/openaiRpmThrottler.js';
import type { ImageNarrativeContext } from './imageNarrative/types.js';
// ✅ [2026-01-25] Perplexity 추가
import { generatePerplexityContent, translatePerplexityError } from './perplexity.js';
// ✅ [v2.7.52] modelRegistry SSOT
import { CLAUDE_MODELS, GEMINI_TEXT_MODELS } from './runtime/modelRegistry.js';
import { getGeminiFreeTierDailyLimit, formatGeminiFreeTierSummary } from './geminiQuotaPolicy.js';
import {
  buildGeminiKeyExecutionPlan,
  resolveContentGenerationCostPolicy,
  type ContentGenerationCostPolicy,
} from './geminiCostOptimizer.js';

import JSON5 from 'json5';
import { getGeminiModel } from './gemini.js';
import { trackApiUsage } from './apiUsageTracker.js';
// ✅ [2026-02-11] getRelatedKeywords import 제거 — 인라인 템플릿 전용이었음
import { app, BrowserWindow } from 'electron';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { JSON_SCHEMA_DESCRIPTION } from './contentGenerator/schema';
import { humanizeContent, humanizeHtmlContent, analyzeAiDetectionRisk, resetHumanizerLog } from './aiHumanizer.js';
import { resolveHumanizeIntensity } from './contentHumanizationPolicy.js';
import { optimizeContentForNaver, optimizeHtmlForNaver, analyzeNaverScore, resetOptimizerLog, detectCategory } from './contentOptimizer.js';
import { analyzeContentBySemantic, isLlmRubricEnabled } from './contentSemanticScoring.js';
import { buildPersonaCard } from './authgrDefense.js';
import { selfCritiqueAndRewrite, isSelfCritiqueEnabled } from './contentSelfCritique.js';
import { buildSystemPromptFromHint, buildFullPrompt, loadShoppingPrompt, getGeoOverlayPrompt, type PromptMode } from './promptLoader.js';
import { isReviewAvailable, isReviewGuardEnabled, buildReviewGuardBlock } from './content/reviewGuard.js';
import { isGeneralContentGuardEnabled, hasGroundingSource, buildGeneralContentGuardBlock } from './content/generalContentGuard.js';
import { isCelebrityFactGuardEnabled, isCelebrityContext, buildCelebrityFactGuardBlock, detectCelebrityAssertionRisk } from './content/celebrityAssertionSanitizer.js';
import {
  assessQuality90Gate,
  isQuality90Mode,
} from './content/quality90Gate.js';
import {
  auditAffiliateAuthenticity,
  buildAffiliateAuthenticityContract,
  buildAffiliateTitleEvidenceDirective,
  classifyAffiliateEvidence,
} from './content/affiliateAuthenticity.js';
import {
  buildEvidenceAndIntentFinalContract,
  buildTitleEvidenceFinalContract,
  hasExplicitFirstPartyEvidence,
} from './content/evidenceIntegrity.js';
// ✅ [2026-04-20 SPEC-HOMEFEED-100/SEO-100] 실전 통합 훅
import { validateContent as runValidationPipeline } from './services/contentValidationPipeline.js';
import { loadAeoRules } from './aeoRulesManager.js';
import { isFeatureEnabled } from './services/featureFlagConfig.js';
// ✅ [v1.4.48 Stage A.2] require() 혼용 제거 → 정적 import로 통일 (모듈 인스턴스 단일 보장)
import { processAutoPublishContent, getRecentPeriods, recordSelectedTitle, type TitleSelectionResult } from './titleSelector.js';
import { trendAnalyzer } from './agents/trendAnalyzer.js';
import { loadConfig, getConfigSync } from './configManager.js';
import { isMaskedSecretValue } from './security/secretValueUtils.js';
// [Phase 3-1/v2.10.139] god file 분해 1단계 — pure string helper 추출
import {
  removeEmojis,
  stripAllFormatting,
  stripInternalMarkers,
  removeOrdinalHeadingLabelsFromBody,
  normalizeTitleWhitespace,
  normalizeBodyWhitespacePreserveNewlines,
} from './contentTextHelpers';
// [Phase 3-5/v2.10.143] 제목 cleanup helper 5개 모두 활성화 — contentGenerator.ts 원본 정의 제거 완료
import {
  stripOrdinalHeadingPrefix,
  sanitizeTitleSpecialChars,
  cleanupStartingTitleTokens,
  cleanupTrailingTitleTokens,
  cleanupColonQuotePattern,
} from './contentTitleHelpers';
import { removeDuplicatePhrases as removeDuplicatePhrasesFromTitle } from './contentTitleDuplicateRemoval.js';
import {
  buildGeminiBillingBlockMessage,
  classifyGeminiBillingBlock,
} from './geminiBillingBlock.js';
import {
  buildSameEngineRecoveryInstruction,
  isTerminalContentGenerationError,
} from './contentGenerationFailurePolicy.js';
import { assessCustomPromptAdherence } from './contentPromptAdherence.js';
import {
  classifyOpenAiDiagnosticError,
  formatWaitBudgetKo,
  formatWaitDurationKo,
  isOpenAiConnectionIssue,
  normalizeErrorMessage,
  readHeaderValue,
  safeStringifyError,
} from './contentErrorDiagnostics.js';
import { getAutoToneByCategory } from './contentTonePolicy.js';
import { sanitizeStructuredContentClaims } from './contentClaimSanitizer.js';
import {
  detectDuplicateContent,
  removeRepeatedFullContent,
  validateHeadingOrder,
} from './contentDuplicateHeuristics.js';
import { buildUrlModeDirective } from './contentUrlModeDirective.js';
import { buildRecentWinnersBlock } from './contentRecentWinnersBlock.js';
import {
  applyManualTitleOverride,
  normalizeManualTitleOverride,
} from './contentManualTitlePolicy.js';
import { appendClaudeStrongAbstentionBlock } from './contentPromptAddons.js';
import {
  appendAiTabFriendlyPrompt,
  loadAiTabFriendlyPrompt,
  shouldApplyAiTabFriendlyPrompt,
} from './contentAiTabPrompt.js';
import { resolvePromptTemperature } from './contentTemperaturePolicy.js';
import { buildContentJsonOutputFormat } from './contentJsonPromptFormat.js';
import { buildCustomModeOverridePrompt } from './contentCustomModePrompt.js';
import { applyFactCheckHardConstraint } from './contentFactCheckConstraint.js';
import { appendReviewAnalysisPrompt } from './contentReviewAnalysisPrompt.js';
import { appendShoppingOfficialSafetyGuard } from './contentShoppingPromptAddons.js';
import {
  buildContentExpansionRetryInstruction,
  shouldRunFinalQualityEvaluation,
} from './contentLengthRetryPolicy.js';
import {
  prependDuplicatePatternRetryInstruction,
  prependFaithfulnessRetryInstruction,
  prependInvalidJsonResponseInstruction,
  prependJsonParseRetryInstruction,
  prependSectionDistinctnessRetryInstruction,
  prependValidationRetryInstruction,
} from './contentRetryPromptPolicy.js';
import { getContentProviderTimeoutMs } from './contentProviderTimeoutPolicy.js';
import {
  readNonNegativeIntegerEnv,
  readNonNegativeMsEnv,
  readOptionalNonNegativeMsEnv,
} from './contentEnvNumberPolicy.js';
import { getProviderRateLimitWaitMs } from './providerRateLimitWaitPolicy.js';
import {
  createContentGenerationAbortError,
  createProviderTimeoutSignal,
  sleepWithAbort,
  throwIfContentGenerationAborted,
  withProviderTimeout,
} from './contentAbortTimeoutPolicy.js';
import { translateGeminiError } from './contentGeminiErrorPolicy.js';
import {
  BudgetExceededError,
  enforceGeminiBudgetSafety,
} from './contentGeminiBudgetSafety.js';
export { BudgetExceededError } from './contentGeminiBudgetSafety.js';
import { waitForGeminiUsageMetadata } from './contentGeminiUsageMetadata.js';
import { fixUtf8Encoding } from './contentEncodingPolicy.js';
import { buildGeminiModelChain } from './contentGeminiModelPolicy.js';
import { resolveGeminiPromptCacheEligibility } from './contentGeminiCacheEligibility.js';
import {
  getGeminiPromptCacheKey,
  getGeminiResultCacheKey,
  isStructuralGeminiCacheError,
} from './contentGeminiCachePolicy.js';
import {
  isGeminiCacheSupportedForKey,
  markGeminiCacheUnsupported,
} from './contentGeminiCacheSupportRegistry.js';
import {
  deleteCachedGeminiPrompt,
  getCachedGeminiPrompt,
  pruneExpiredGeminiPromptCaches,
  setCachedGeminiPrompt,
} from './contentGeminiPromptCache.js';
import { invokeGeminiStreamWithCacheFallback } from './contentGeminiCacheStreamFallback.js';
import {
  getCachedGeminiResult,
  setCachedGeminiResult,
} from './contentGeminiResultCache.js';
import { ProviderRequestGate } from './contentProviderRequestGate.js';
import { optimizeForViral } from './contentViralOptimizer.js';
import {
  canPublishShoppingConnectQuality,
  detectBannedHeadingPatterns as detectBannedHeadingPatternsImpl,
  SHOPPING_CONNECT_PUBLISH_MIN_SCORE,
  SHOPPING_CONNECT_TARGET_SCORE,
  validateShoppingConnectContent as validateShoppingConnectContentImpl,
} from './contentShoppingConnectValidation.js';
import {
  optimizeHeadingsForMode,
  syncHeadingsWithBodyPlain,
} from './contentHeadingOptimizer.js';
import { characterCount, visibleCharacterCount } from './contentTextMetrics.js';
import { formatPrice } from './services/priceNormalizer.js';
import { cleanEscapeSequences } from './contentEscapeCleanup.js';
import { filterExaggeratedContent } from './contentExaggerationFilter.js';
import { removeDuplicateHeadings } from './contentDuplicateCleanup.js';
import { validateSeoContent } from './contentSeoValidator.js';
import { validateHomefeedContent } from './contentHomefeedValidator.js';
import {
  sanitizeContentFakeSources,
  sanitizeContentHtmlTags,
  sanitizeContentMetaCritique,
} from './contentSanitizers.js';
export {
  classifyGeminiBillingBlock,
  isGeminiPrepaidCreditsDepletedError,
} from './geminiBillingBlock.js';
export type { GeminiBillingBlockKind } from './geminiBillingBlock.js';
export { buildGeminiModelChain } from './contentGeminiModelPolicy.js';
// [Phase 3-6/v2.10.144] 제목 품질 validator 4개 추출
import {
  computeSeoTitleCriticalIssues,
  computeHomefeedTitleCriticalIssues,
  computeAffiliateTitleCriticalIssues,
  computeHomefeedIntroCriticalIssues,
} from './contentTitleValidators';
// [Phase 3-13/v2.10.159] selectTitleFormula 추출 — 이전 FORMULAS imports는 contentTitleSelector 내부로 이동
import { selectTitleFormula } from './contentTitleSelector';
// [Phase 3-14/v2.10.160] 제목 prefix helpers 추출 (buildTitlePrefixCandidates는 내부 helper만, 외부 노출 안 함)
import {
  stripReviewTitlePrefixFromHeading,
  stripSelectedTitlePrefixFromHeadings,
  stripLeadingSubjectHookFromHeadings,
} from './contentTitlePrefixHelpers';
// [Phase 3-15/v2.10.161] 본문 hook 추출 (homefeed/seo 품질 게이트)
import {
  applyHomefeedNarrativeHookBlock,
  applySeoQualityHookBlock,
} from './contentBodyHooks';
// [Phase 3-16~19/v2.10.162~165] StructuredContent 변환 + 일반 helper
import {
  applyOrdinalHeadingMarkerFix,
  removeEmojisFromContent,
  normalizeContentLineBreaks,
  // [v2.10.393] ensureContentParagraphBreaks 재활성화 (한국어 종결어미 한정 split).
  //   contentBodyTransforms.ts의 정규식이 (?<=[가-힣][.!?])로 영문 약어/소수점 회귀 차단.
  ensureContentParagraphBreaks,
  limitRegexOccurrences,
  truncateHeadingTitles,
  removeInternalStructureMarkersFromContent,
} from './contentBodyTransforms';
// [Phase 3-17/v2.10.163] 제목 안전성 검증 helper는 contentStructuredValidator.ts에서 사용
// [Phase 3-18/v2.10.164] 키워드 전처리 helper
import { getPrimaryKeywordFromSource, getSecondaryKeywordsFromSource, preprocessLongKeyword } from './contentKeywordHelpers';
// [SPEC-PROMPT-2026-REFRESH Phase 1/v2.10.231] 일반론 도망 감지 + 인용 토큰 밀도 측정
import { detectPlatitudes, isPlatitudeHardBlockEnabled } from './contentPlatitudeDetector';
// [Gap C 시맨틱 / SPEC-REVIEW-001 확장] 옵트인 섹션 변별 판정 (기본 OFF, ungrounded 1회 호출)
import { isSemanticDistinctnessJudgeEnabled, judgeSectionDistinctness } from './content/sectionDistinctnessJudge';
// [Phase 3-20/v2.10.166] 키워드 prefix + review title (applyKeywordPrefixToTitle는 내부 helper)
import {
  applyKeywordPrefixToStructuredContent,
  sanitizeReviewTitle,
} from './contentKeywordPrefix';
import { applyHeadingKeywordPatch } from './contentHeadingKeywordPatch';
import {
  applyKeywordAsTitleLock,
  resolveKeywordAsTitleValue,
} from './contentKeywordTitlePolicy';
import { collapseDuplicateLeadingYearTitle } from './contentTitleYearGuard';
// [Phase 3-21/v2.10.167] SEO+homefeed 결과 병합 (finalizeStructuredContent export 통해 cycle 안전)
import { mergeSeoWithHomefeedOverlay } from './contentMergeOverlay';
// [Phase 3-8/v2.10.146] 제목 품질 scoring data + retry feedback
import {
  buildTitleRetryFeedback,
} from './contentTitleQuality';
// [Phase 3-9/v2.10.147] evaluateTitleQuality 추출
import { evaluateTitleQuality } from './contentTitleEvaluator';
// [Phase 3-10~11/v2.10.148~149] review helper 5개 추출
import {
  isReviewArticleType,
  sanitizeReviewHeadingTitle,
  getReviewProductName,
  extractLikelyProductNameFromTitle,
  normalizeReviewProductName,
} from './contentReviewHelpers';
// [Phase 3-12/v2.10.150] 상품 카테고리 감지 추출
import {
  detectProductCategory,
  type ProductCategory,
  type ProductCategoryResult,
} from './contentProductCategory';
// [Phase 3-2/v2.10.140, Phase 7.4-q] re-export — 기존 외부 호출자 호환 유지
export { stripAllFormatting, stripInternalMarkers, removeOrdinalHeadingLabelsFromBody };
import { splitPromptByMarker, adjustForPerplexity } from './promptSplitter.js';
import { safeParseJson, cleanJsonOutput, tryFixJson, fixJsonAtPosition } from './jsonParser';
import { recoverLooseStructuredContentFields } from './contentStructuredRecovery';
import { validateStructuredContent } from './contentStructuredValidator';
import {
  buildGeminiEmptyResponseUserMessage,
} from './contentGenerationUserGuidance';

// ✅ [v1.4.51] Gemini 빈 응답 전용 에러 클래스 — finishReason별 대응 위해
// SAFETY/RECITATION → 재시도 금지, MAX_TOKENS → 설정 조정 후 재시도, OTHER → 일반 재시도
export class GeminiEmptyResponseError extends Error {
  constructor(
    message: string,
    public readonly finishReason: string,
    public readonly promptTokens: number = 0,
    public readonly thinkingTokens: number = 0,
    public readonly outputTokens: number = 0
  ) {
    super(message);
    this.name = 'GeminiEmptyResponseError';
  }
  /** 재시도해도 의미없는 영구 실패인지 (SAFETY/RECITATION) */
  get isPermanent(): boolean {
    return this.finishReason === 'SAFETY' || this.finishReason === 'RECITATION';
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ✅ [2026-04-20 SPEC-HOMEFEED-100 W1 / SEO-100 W1] 실전 통합 훅
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
/**
 * Post-generation validator log. Non-blocking, analysis only.
 * Runs after a successful generation to:
 *   1) emit critical/warning issues to the log
 *   2) attach validation metrics to the returned content so publishMeta
 *      can correlate features × issues
 * ✅ [v1.4.77] 0원 아티팩트 감지 시 ZeroPriceArtifactError throw (상위에서 재생성 트리거)
 * 이외 critical 이슈는 여전히 non-blocking (로그만). Never mutates content.
 */
export class ZeroPriceArtifactError extends Error {
  constructor(public readonly detail: string) {
    super(`0원 아티팩트 감지 — 발행 차단: ${detail}`);
    this.name = 'ZeroPriceArtifactError';
  }
}

// [Phase 7.4-q] stripInternalMarkers -> contentTextHelpers.ts

function runPostGenValidator(content: any, source: any): void {
  if (!isFeatureEnabled('validator')) return;
  let result: any;
  try {
    const mode: 'homefeed' | 'seo' = source?.contentMode === 'seo' ? 'seo' : 'homefeed';
    const mainKeyword = source?.keywords?.[0] || source?.title || '';
    // ✅ [SPEC-AEO-EXPOSURE-2026 R2] external rules — file absent → DEFAULT (unchanged behavior).
    // Read per call so aeo_rules.json edits take effect without a rebuild (beta tuning).
    const aeoRules = loadAeoRules(path.join(app.getPath('userData'), 'aeo_rules.json'));
    result = runValidationPipeline(content, {
      skipFingerprint: true, // 속도 우선 — fingerprint는 이미 authgrDefense가 별도 수행
      mode,
      mainKeyword,
      title: content?.selectedTitle || content?.title || '',
      imageCount: Array.isArray(content?.headings) ? content.headings.length : 0,
      aeoRules,
    });
    (content as any).__validationResult = result;
    if (result.metrics.criticalIssueCount > 0) {
      console.warn(
        `[Validator] ⚠️ Critical ${result.metrics.criticalIssueCount}건: ` +
          result.issues
            .filter((i: any) => i.severity === 'critical')
            .map((i: any) => i.message)
            .join(' | '),
      );
    } else if (result.metrics.totalIssueCount > 0) {
      console.log(`[Validator] ℹ️ 이슈 ${result.metrics.totalIssueCount}건 (비차단)`);
    } else {
      console.log('[Validator] ✅ 이슈 없음');
    }
  } catch (err) {
    if (err instanceof ZeroPriceArtifactError) throw err; // 내부 throw는 그대로 전파
    console.error('[Validator] 파사드 호출 실패, 발행 계속:', err);
    return;
  }
  // ✅ [v1.4.77] 0원 아티팩트는 blocking 게이트 — 단, 가격이 실제로 등장하는 쇼핑/제휴 맥락에서만.
  //   이 게이트의 목적은 "가격 크롤 실패 → 0원" 아티팩트 차단(쇼핑커넥트/리뷰). 정보성 글
  //   (SEO/홈피드/정책 등)의 "정부기여금 0원·수수료 0원" 같은 정당한 사실은 절대 차단하지 않는다.
  const zeroPriceIssue = result?.issues?.find(
    (i: any) => i.category === 'price_artifact' && i.severity === 'critical',
  );
  if (zeroPriceIssue) {
    const url = typeof source?.url === 'string' ? source.url : '';
    const isPriceContext =
      source?.contentMode === 'affiliate' ||
      source?.isReviewType === true ||
      source?.isShoppingConnectMode === true ||
      /(smartstore\.naver|brand\.naver|naver\.me|coupang|aliexpress|11st|gmarket)/i.test(url);
    if (isPriceContext) {
      throw new ZeroPriceArtifactError(zeroPriceIssue.message || '본문/소제목에 0원 패턴');
    }
    // 비쇼핑(정보성) 맥락: 차단하지 않고 로그만 — 0원은 정당한 사실일 수 있음.
    console.warn(`[Validator] ℹ️ 0원 아티팩트 감지(비쇼핑 맥락 — 발행 차단 안 함): ${zeroPriceIssue.message}`);
  }
}

// [Phase 7.4-u] recent winners prompt block -> contentRecentWinnersBlock.ts

// [Phase 3-1/v2.10.139] removeEmojis 함수는 contentTextHelpers.ts로 추출됨 (god file 분해).

// [Phase 3-2/v2.10.140] stripAllFormatting 함수는 contentTextHelpers.ts로 추출됨 (god file 분해).
//   외부 호출자 (naverBlogAutomation.ts, contentGenerator.test.ts)는 contentGenerator.ts의
//   re-export를 통해 변경 없이 작동.

// [Phase 3-4/v2.10.142] stripOrdinalHeadingPrefix → contentTitleHelpers.ts

// [Phase 7.4-q] removeOrdinalHeadingLabelsFromBody -> contentTextHelpers.ts

// [Phase 3-5/v2.10.143] sanitizeTitleSpecialChars → contentTitleHelpers.ts

// [Phase 3-5/v2.10.143] cleanupStartingTitleTokens → contentTitleHelpers.ts


// [Phase 3-5/v2.10.143] cleanupTrailingTitleTokens → contentTitleHelpers.ts

// [Phase 3-5/v2.10.143] cleanupColonQuotePattern -> contentTitleHelpers.ts

// [Phase 3-20/v2.10.166] applyKeywordPrefixToTitle + applyKeywordPrefixToStructuredContent -> contentKeywordPrefix.ts

// [Phase 3-14/v2.10.160] buildTitlePrefixCandidates + stripReviewTitlePrefixFromHeading + stripSelectedTitlePrefixFromHeadings -> contentTitlePrefixHelpers.ts

// [Phase 3-10/v2.10.148] isReviewArticleType -> contentReviewHelpers.ts

// [Phase 3-3/v2.10.141] normalizeTitleWhitespace, normalizeBodyWhitespacePreserveNewlines
//   contentTextHelpers.ts로 추출 (god file 분해).

// [Phase 3-19/v2.10.165] limitRegexOccurrences -> contentBodyTransforms.ts

// [Phase 3-11/v2.10.149] getReviewProductName -> contentReviewHelpers.ts

// [Phase 3-12/v2.10.150] detectProductCategory + ProductCategory + ProductCategoryResult -> contentProductCategory.ts

// [Phase 3-11/v2.10.149] extractLikelyProductNameFromTitle + normalizeReviewProductName -> contentReviewHelpers.ts

// [Phase 3-20/v2.10.166] sanitizeReviewTitle -> contentKeywordPrefix.ts

// [Phase 3-10/v2.10.148] sanitizeReviewHeadingTitle -> contentReviewHelpers.ts

// [Phase 3-6/v2.10.144] 4개 title quality validator -> contentTitleValidators.ts

// [Phase 3-17/v2.10.163] validateTitleContainsKeyword + detectPromptLeakageInTitle + validateTitleNotTooSimilarToKeyword + assessHallucinationRisk -> contentTitleSafetyChecks.ts

// [Phase 3-18/v2.10.164] getPrimaryKeywordFromSource + preprocessLongKeyword -> contentKeywordHelpers.ts

// [Phase 3-15/v2.10.161] buildHomefeedDebateHookSummaryBlock + insertSummaryBlockAfterIntroBeforeFirstHeading + applyHomefeedNarrativeHookBlock + applySeoQualityHookBlock -> contentBodyHooks.ts

// [Phase 3-7/v2.10.145] interface TitleFormula + 4 FORMULAS + CATEGORY_FORMULA_PRIORITY -> contentTitleFormulas.ts
// [Phase 3-13/v2.10.159] selectTitleFormula -> contentTitleSelector.ts

// [Phase 3-8/v2.10.146] ISSUE_ACTION_MAP + buildTitleRetryFeedback -> contentTitleQuality.ts

async function generateTitleOnlyPatch(source: ContentSource, mode: PromptMode, categoryHint?: string, provider?: string): Promise<{
  selectedTitle?: string;
  titleCandidates?: TitleCandidate[];
  titleAlternatives?: string[];
}> {
  const primaryKeyword = getPrimaryKeywordFromSource(source);
  const articleSnippet = source.rawText ? source.rawText.substring(0, 1000) : '';
  // ✅ [2026-03-13] affiliate 모드: 상품명 축약 전처리 (키워드 나열 방지)
  let originalTitle = source.title || '';
  if (mode === 'affiliate' && originalTitle.length > 25) {
    const processed = preprocessLongKeyword(originalTitle);
    console.log(`[TitleGen] ✅ 상품명 축약: "${originalTitle.substring(0, 50)}" → "${processed.coreKeyword}"`);
    originalTitle = processed.coreKeyword;
  }

  // ✅ [2026-02-02] 카테고리별 제목 프롬프트 로드 (카테고리 → 기본 폴백)
  let titlePrompt = '';
  try {
    // 카테고리 매핑 (한글 → 영문 파일명)
    const categoryToFile: Record<string, string> = {
      '연예': 'entertainment', '스포츠': 'sports', '건강': 'health',
      'IT': 'it', '패션': 'fashion', '음식': 'food', '여행': 'travel',
      '라이프': 'life', '리빙': 'living', '육아': 'parenting',
      '반려동물': 'pet', '사회': 'society', '생활': 'tips',
      'entertainment': 'entertainment', 'sports': 'sports', 'health': 'health',
      'it_review': 'it', 'it': 'it', 'fashion': 'fashion', 'food': 'food',
      'travel': 'travel', 'lifestyle': 'life', 'life': 'life', 'living': 'living',
      'parenting': 'parenting', 'pet': 'pet', 'society': 'society', 'tips': 'tips',
      'shopping_review': 'living', 'finance': 'society'
    };

    // 1. 카테고리별 프롬프트 시도 (mode/category.prompt)
    const categoryFile = categoryToFile[categoryHint || ''] || '';
    let promptLoaded = false;

    if (categoryFile) {
      const categoryPromptPath = path.join(app.getAppPath(), 'dist', 'prompts', 'title', mode, `${categoryFile}.prompt`);
      if (fsSync.existsSync(categoryPromptPath)) {
        titlePrompt = fsSync.readFileSync(categoryPromptPath, 'utf-8');
        console.log(`[TitleGen] ✅ 카테고리별 제목 프롬프트 로드: ${mode}/${categoryFile}.prompt`);
        promptLoaded = true;
      }
    }

    // 2. 카테고리별 없으면 기본 프롬프트 (mode/base.prompt)
    if (!promptLoaded) {
      const basePromptPath = path.join(app.getAppPath(), 'dist', 'prompts', 'title', mode, 'base.prompt');
      if (fsSync.existsSync(basePromptPath)) {
        titlePrompt = fsSync.readFileSync(basePromptPath, 'utf-8');
        console.log(`[TitleGen] ✅ 기본 제목 프롬프트 로드: ${mode}/base.prompt`);
        promptLoaded = true;
      }
    }

    // 3. 모드 폴더 없으면 레거시 방식 (title/mode.prompt)
    if (!promptLoaded) {
      let legacyFile = 'seo.prompt';
      if (mode === 'homefeed') legacyFile = 'homefeed.prompt';
      else if (mode === 'affiliate') legacyFile = 'affiliate.prompt';

      const legacyPath = path.join(app.getAppPath(), 'dist', 'prompts', 'title', legacyFile);
      if (fsSync.existsSync(legacyPath)) {
        titlePrompt = fsSync.readFileSync(legacyPath, 'utf-8');
        console.log(`[TitleGen] ✅ 레거시 제목 프롬프트 로드: ${legacyFile}`);
      }
    }
  } catch (e) {
    console.log('[TitleGen] ⚠️ 제목 전용 프롬프트 로드 실패, 기본 규칙 사용');
  }

  // ✅ [v1.4.47] 프롬프트 내부 하드코딩된 기간 예시 일괄 마스킹
  // 원인: 프롬프트 파일 16개에 "3개월", "한 달", "2주" 등이 예시 제목에 박혀있어
  //       AI가 그대로 복사 → 매 글마다 기간 표현 반복
  // 해결: 프롬프트를 런타임에 마스킹 + 강제 금지 지시 주입
  if (titlePrompt) {
    const beforeLen = titlePrompt.length;
    titlePrompt = titlePrompt
      // 숫자+기간 단위를 일반화: "3개월" → "장기간", "2주" → "꾸준히", "한 달" → "한동안"
      .replace(/\d+\s*개월\s*(?:차|째|만에|이용|사용|동안|후|전)?/g, '장기간')
      .replace(/\d+\s*주\s*(?:차|째|만에|이용|사용|동안|후|전)?/g, '꾸준히')
      .replace(/\d+\s*년\s*(?:차|째|만에|이용|사용|동안|후|전)?/g, '오랜 기간')
      .replace(/한\s*달(?:\s*(?:써본|써보니|쓴|복용|사용|후|전))?/g, '한동안 써본')
      .replace(/반년(?:\s*(?:써본|써보니|쓴|복용|사용|후|전))?/g, '오래 써본');
    console.log(`[TitleGen] 🔧 프롬프트 기간 예시 마스킹: ${beforeLen}자 → ${titlePrompt.length}자`);

    // 강제 금지 지시 주입
    titlePrompt += '\n\n🚫🚫🚫 [v1.4.47 강제 규칙 — 위반 시 0점]\n' +
      '1. 제목에 숫자+기간 단위(N주/N개월/N년/한 달/반년) 절대 사용 금지\n' +
      '2. 실제 경험 근거가 없는 체험·기간·가족 반응을 만들지 않기\n' +
      '3. 구체성이 필요하면 금액/비율/개수/조건/방법/대상/비교 등을 사용\n' +
      '4. 위 규칙 위반 시 제목 후보는 0점 처리됩니다.\n';

    if (mode === 'affiliate') {
      titlePrompt += `\n\n${buildAffiliateTitleEvidenceDirective(source)}`;
    }

    // ✅ [v1.4.82] 현재 년도를 컨텍스트로 주입 — "오랜 기간" 마스킹으로 AI가 년도를 모르는 문제 해결
    // 정부지원금/법규/시즌성 글에서 "2026년 정부 지원금" 같은 년도 표기 필요 시 AI가 실제 년도 사용
    const __currentYear = new Date().getFullYear();
    titlePrompt += `\n\n📅 [현재 년도 컨텍스트] 지금은 ${__currentYear}년입니다.\n` +
      `시즌성/연도 기반 콘텐츠(정부지원금/법규/트렌드/연도별 정보)에서 년도를 표기할 때는\n` +
      `반드시 "${__currentYear}년" 형태로 정확히 쓰세요. "올해", "최신", "현재" 같은 추상 표현보다\n` +
      `구체적인 년도 숫자가 SEO/신뢰도 관점에서 유리합니다. (단, 체험 기간은 여전히 금지)\n`;
  }

  // ✅ [v1.4.47] 기본 규칙 (프롬프트 로드 실패 시 폴백) — 하드코딩된 기간 예시 제거
  const defaultTitleRules = mode === 'homefeed'
    ? `[제목 방향] 메인 주제 + 독자의 구체 상황·차이·판단 기준 중 내용에 맞는 한 가지. 근거 없는 감정과 반응 금지.`
    : mode === 'affiliate'
      ? `[제목 방향] {상품명(브랜드+모델명)} + 입력에서 확인된 구매 판단 기준. 단어 나열과 근거 없는 체험 표현 금지.`
      : `[제목 방향] 메인 주제 + 독자의 질문에 답하는 조건·방법·대상 중 입력 근거에 맞는 한 가지. 클릭 트리거와 숫자 개수 강제 금지.`;

  const schema = `Output ONLY valid JSON. NO markdown.\n\n{"selectedTitle": "string", "titleCandidates": [{"text": "string", "score": 95}, {"text": "string", "score": 90}, {"text": "string", "score": 85}]}`;

  const subKeywords = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 5).join(', ')
    : '';

  const prompt = `
${titlePrompt || defaultTitleRules}

${schema}

[TASK]
아래 조건으로 제목 3개만 생성. 본문/소제목/해시태그 절대 생성 금지.

- mode: ${mode}
- originalTitle: ${originalTitle || '(없음)'}
- primaryKeyword: ${primaryKeyword || '(없음)'}
- subKeywords: ${subKeywords || '(없음)'}
${mode === 'homefeed' ? `
⛔⛔⛔ [홈피드 절대 규칙 — 위반 시 0점]
1. 같은 단어를 제목에 2번 이상 쓰지 마세요. (예: "침대 배치 공식 침대 배치" → 0점)
2. 키워드를 나열하지 마세요. 자연스러운 한 문장으로 쓰세요.
3. 28~42자를 권장하되, 사실과 고유명사를 훼손해 길이를 맞추지 마세요.
4. 서브키워드는 문장 이해에 실제로 필요할 때만 사용하고 나열하지 마세요.
` : ''}
${mode === 'affiliate' ? `
⛔⛔⛔ [쇼핑커넥트 절대 규칙 — 위반 시 0점]
1. 상품명의 모든 키워드를 넣지 마세요. "브랜드명 + 모델명"만 사용하세요.
   ❌ "린백 컴퓨터 학생 책상 의자 린백 후기" (키워드 나열 = 0점)
   ✅ "린백 LB221HA, 허리가 예민하면 볼 부분" (구체 판단 기준 = 100점)
2. 키워드를 나열하지 마세요. 자연스러운 한 문장으로 쓰세요.
3. 같은 단어를 제목에 2번 이상 쓰지 마세요. (예: "린백...린백" → 0점)
4. originalTitle을 그대로 쓰거나 단어를 재배열하면 0점입니다.
5. 반드시 25~45자 이내.
${buildAffiliateTitleEvidenceDirective(source)}
` : ''}
${(mode === 'homefeed' || mode === 'seo' || mode === 'mate') && subKeywords ? `
💡 [보조 키워드]
서브키워드는 제목의 의미가 더 분명해질 때만 1개 이하로 사용할 수 있습니다. 위치와 개수를 강제하지 말고 나열하지 마세요.
` : ''}
${source.customPrompt ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 [사용자 추가 지시사항 - 최우선 반영]
━━━━━━━━━━━━━━━━━━━━━━━━━━━
${source.customPrompt.trim()}

⚠️ 위 사용자 지시사항을 제목 생성에 반드시 반영하세요.
━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}
[ARTICLE SNIPPET]
${articleSnippet}

JSON:
`.trim();

  // ✅ [2026-02-09 v2] 이전 생성 제목 히스토리 (연속발행 시 중복 방지)
  let previousTitlesPrompt = '';
  if (source.previousTitles && source.previousTitles.length > 0) {
    previousTitlesPrompt = `\n\n⛔ [이전 생성 제목 — 절대 유사하게 만들지 마세요]\n`;
    source.previousTitles.slice(-10).forEach((t: string, i: number) => {
      previousTitlesPrompt += `${i + 1}. "${t}"\n`;
    });
    previousTitlesPrompt += `→ 위 제목들과 구조/표현이 겹치면 0점입니다.\n`;
  }

  // ✅ [v1.4.46] 최근 사용한 기간 표현 동적 금지 — 연속 발행 시 "2주 3주 6개월 3개월" 반복 차단
  try {
    const { getRecentPeriods } = await import('./titleSelector.js');
    const recentPeriods = getRecentPeriods();
    if (recentPeriods.length > 0) {
      previousTitlesPrompt += `\n\n🚫 [최근 사용한 기간 표현 — 이번 제목에서 절대 사용 금지]\n`;
      previousTitlesPrompt += recentPeriods.map(p => `- "${p}"`).join('\n') + '\n';
      previousTitlesPrompt += `→ 위 기간 표현을 반복하면 0점입니다.\n`;
      previousTitlesPrompt += `→ 이번 제목은 기간(N주/N개월/N년) 표현 대신 다른 구체성을 사용하세요:\n`;
      previousTitlesPrompt += `   금액(월 3만원), 비율(4.57%), 개수(딱 하나), 조건(자격 기준),\n`;
      previousTitlesPrompt += `   방법명(이 설정), 대상(알바생), 비교(vs), 장소, 인물, 상황 등\n`;
    }
  } catch (e) {
    console.warn('[TitleGen] getRecentPeriods 로드 실패:', e);
  }

  // ✅ [v2.10.56] 비용 폭증 회귀 차단 — 제목 재생성 3회 → 1회로 단축
  //   사용자 보고: '한편당 50회 호출' — 제목만 4번(0+1+2+3) 호출되던 것을 2번(0+1)으로
  //   기존: MAX_RETRIES=3 → 4번 호출 (attempt 0,1,2,3)
  //   변경: MAX_RETRIES=1 → 2번 호출 (attempt 0,1) — 1차 실패 시 1회 재시도
  // ✅ [v2.10.59] 비용 절감 모드 기본 ON — 사용자 명시 OFF가 아니면 단 1회 호출
  //   사용자 요청: '자동으로 ON 시키라'
  //   기본 1회 호출 (MAX_RETRIES=0). costSaverMode === false 시에만 1회 재시도(MAX_RETRIES=1)
  let MAX_RETRIES = 0;
  try {
    const config = await loadConfig();
    if ((config as any).costSaverMode === false) MAX_RETRIES = 1;
  } catch { /* 기본값 유지 (절감 모드) */ }
  let bestResult: { selectedTitle?: string; titleCandidates?: TitleCandidate[]; titleAlternatives?: string[] } = {};
  let bestScore = 0;
  let prevTitle = '';
  let prevScore = 0;
  let prevIssues: string[] = [];
  const usedFormulaIds: string[] = [];
  const titleEvidenceContract = buildTitleEvidenceFinalContract(source, mode);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // ✅ [v2] 매 시도마다 다른 공식 패턴 선택
      // ✅ [v1.4.57] articleType 전달 — shopping_expert_review 전용 풀 분기에 필수
      const formula = selectTitleFormula(
        mode,
        attempt,
        usedFormulaIds,
        categoryHint,
        source.articleType,
        hasGroundingSource(source),
        hasExplicitFirstPartyEvidence(source),
      );
      usedFormulaIds.push(formula.id);
      const formulaInstruction = `\n\n🎯 [이번 제목 방향 참고: ${formula.name}]\n${formula.instruction}\n예시: "${formula.example}"\n⚠️ 예시는 입력 근거와 맞을 때만 참고하고 사실·자연스러움과 충돌하면 사용하지 마세요.`;

      // ✅ [v2] 재시도 시 이전 실패 피드백
      const retryFeedback = buildTitleRetryFeedback(attempt, prevTitle, prevScore, prevIssues);

      // ✅ [v2.10.56] silent 폴백 회귀 — 사용자 선택 provider 100% 존중 (자동 폴백 금지 원칙)
      // ✅ [v2.10.60] 사용자가 환경설정에서 'subWorkProvider' 명시 선택한 경우 그 모델 사용
      //   기본 'same': 본문과 동일 (현재 동작 유지, silent 폴백 0)
      //   'gpt-mini'/'gemini-flash'/'haiku': 사용자 명시 선택 → 부수 작업만 분리
      const titleTemp = 0.7 + (attempt * 0.05);
      const titlePromptFull = `${prompt}${formulaInstruction}${previousTitlesPrompt}${retryFeedback}\n\n${titleEvidenceContract}`;
      let raw: string;
      // 부수 작업 모델 결정 (사용자 명시 선택 — silent 폴백 0)
      let subProvider: 'same' | 'gpt-mini' | 'gemini-flash' | 'haiku' = 'same';
      try {
        const _cfg = await loadConfig();
        subProvider = ((_cfg as any).subWorkProvider as any) || 'same';
      } catch { /* 기본 same */ }

      if (subProvider === 'gpt-mini') {
        // 사용자 명시: 부수만 GPT-4.1 mini (저렴)
        process.env.OPENAI_STRUCTURED_MODEL = 'gpt-4.1-mini';
        raw = await callOpenAI(titlePromptFull, titleTemp, 650);
        delete process.env.OPENAI_STRUCTURED_MODEL;
      } else if (subProvider === 'gemini-flash') {
        // 사용자 명시: 부수만 Gemini Flash (가장 저렴)
        raw = await callGemini(titlePromptFull, titleTemp, 650, { useGrounding: false });
      } else if (subProvider === 'haiku') {
        // 사용자 명시: 부수만 Claude Haiku
        process.env.CLAUDE_STRUCTURED_MODEL = 'claude-haiku-4-5-20251001';
        raw = await callClaude(titlePromptFull, titleTemp, 650);
        delete process.env.CLAUDE_STRUCTURED_MODEL;
      } else {
        // 기본 'same': 본문과 동일 모델
        if (provider === 'agent-codex' || provider === 'agent-claude') {
          raw = await callAgent(provider, titlePromptFull, { mode });
        } else if (provider === 'perplexity') {
          raw = await callPerplexity(titlePromptFull, titleTemp, 650);
        } else if (provider === 'openai') {
          raw = await callOpenAI(titlePromptFull, titleTemp, 650);
        } else if (provider === 'claude') {
          raw = await callClaude(titlePromptFull, titleTemp, 650);
        } else {
          raw = await callGemini(titlePromptFull, titleTemp, 650, { useGrounding: false });
        }
      }
      console.log(`[TitleGen] 시도 ${attempt + 1}/${MAX_RETRIES + 1} — 공식: ${formula.name}`);

      const parsed = safeParseJson<any>(raw);

      // ✅ [2026-04-11 FIX] 개행 제거 — 제목에 \n이 포함되면 뒷부분 잘림 + 본문 혼입
      let selectedTitle = typeof parsed?.selectedTitle === 'string'
        ? String(parsed.selectedTitle).replace(/[\r\n]+/g, ' ').trim()
        : undefined;
      let titleCandidates = Array.isArray(parsed?.titleCandidates)
        ? parsed.titleCandidates.map((c: any) => ({
          text: String(c?.text || '').replace(/[\r\n]+/g, ' ').trim(),
          score: Number(c?.score) || 0,
          reasoning: String(c?.reasoning || '').trim(),
        })).filter((c: any) => c.text)
        : undefined;

      if (!selectedTitle) continue;

      // ✅ [2026-02-09 FIX] 품질 평가 전에 제목 정제 실행!
      // 기존: AI 원본 → 품질 평가 → (나중) 정제 → 중복/빈괄호가 검증을 우회
      // 수정: AI 원본 → 정제 → 품질 평가 → 정제된 제목으로 반환
      selectedTitle = removeDuplicatePhrasesFromTitle(
        cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars(selectedTitle))))
      ).trim();

      if (titleCandidates) {
        titleCandidates = titleCandidates.map((c: { text: string; score: number; reasoning: string }) => ({
          ...c,
          text: removeDuplicatePhrasesFromTitle(
            cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars(c.text))))
          ).trim(),
        })).filter((c: { text: string }) => c.text);
      }

      if (!selectedTitle) continue;

      // ✅ [v2] 품질 검증 (정제된 제목으로) — 이제 이슈 목록도 반환
      // ✅ [v1.4.57] articleType 전달 — shopping_expert_review 후기형 표현 감점
      const quality = evaluateTitleQuality(selectedTitle, primaryKeyword || '', mode, categoryHint, source.articleType);
      let qualityScore = quality.score;
      const qualityIssues = [...quality.issues];

      // ✅ [2026-03-06] 홈피드 서브키워드 토픽 매칭 가점/감점
      if (mode === 'homefeed') {
        const subKwArr = Array.isArray((source.metadata as any)?.keywords)
          ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k)))
          : [];
        if (subKwArr.length > 0) {
          const subKwIncluded = subKwArr.filter((k: string) => selectedTitle.includes(String(k))).length;
          if (subKwIncluded >= 1) {
            qualityScore = Math.min(100, qualityScore + 10);
            console.log(`[TitleQuality] +10점: 홈피드 서브키워드 포함 (토픽 매칭 강화, ${subKwIncluded}개)`);
          } else {
            qualityScore = Math.max(0, qualityScore - 15);
            qualityIssues.push('홈피드: 서브키워드 미포함 (토픽 매칭 실패 위험)');
            console.log(`[TitleQuality] -15점: 홈피드 서브키워드 미포함 (토픽 매칭 실패 위험)`);
          }
        }
      }

      console.log(`[TitleGen] 시도 ${attempt + 1}: "${selectedTitle}" → ${qualityScore}점 (공식: ${formula.name})`);
      if (qualityIssues.length > 0) {
        console.log(`[TitleGen]   감점: ${qualityIssues.join(', ')}`);
      }

      // ✅ [v2] 합격 기준 75점
      if (qualityScore >= 75) {
        console.log(`[TitleGen] ✅ 품질 검증 통과 (${qualityScore}점, 공식: ${formula.name})`);
        // ✅ [v1.4.48 Stage A.2] 정적 import 사용
        recordSelectedTitle(selectedTitle);
        return {
          selectedTitle,
          titleCandidates,
          titleAlternatives: titleCandidates?.map((c: any) => c.text).filter(Boolean) || undefined
        };
      }

      // ✅ titleCandidates 중 더 높은 점수의 제목이 있으면 그걸 선택
      if (titleCandidates && titleCandidates.length > 0) {
        for (const candidate of titleCandidates) {
          const candQuality = evaluateTitleQuality(candidate.text, primaryKeyword || '', mode, categoryHint, source.articleType);
          if (candQuality.score > qualityScore && candQuality.score >= 75) {
            console.log(`[TitleGen] ✅ 후보 제목이 더 우수: "${candidate.text}" (${candQuality.score}점 > ${qualityScore}점)`);
            // ✅ [v1.4.48 Stage A.2] 정적 import 사용
            recordSelectedTitle(candidate.text);
            return {
              selectedTitle: candidate.text,
              titleCandidates,
              titleAlternatives: titleCandidates.map((c: { text: string }) => c.text).filter(Boolean)
            };
          }
          if (candQuality.score > bestScore) {
            bestScore = candQuality.score;
            bestResult = {
              selectedTitle: candidate.text,
              titleCandidates,
              titleAlternatives: titleCandidates.map((c: { text: string }) => c.text).filter(Boolean)
            };
          }
        }
      }

      // 최고 점수 갱신
      if (qualityScore > bestScore) {
        bestScore = qualityScore;
        bestResult = {
          selectedTitle,
          titleCandidates,
          titleAlternatives: titleCandidates?.map((c: any) => c.text).filter(Boolean) || undefined
        };
      }

      if (attempt < MAX_RETRIES) {
        // ✅ [v2] 다음 시도를 위해 현재 실패 정보 저장
        prevTitle = selectedTitle;
        prevScore = qualityScore;
        prevIssues = qualityIssues;
        console.log(`[TitleGen] ⚠️ 품질 미달 (${qualityScore}점 < 75점), 재생성 시도 ${attempt + 2}/${MAX_RETRIES + 1} — 다음 공식으로 교체`);
      }
    } catch (e) {
      console.error(`[TitleGen] 시도 ${attempt + 1} 실패:`, e);
    }
  }

  // 최선의 결과 반환
  console.log(`[TitleGen] 최종 결과: "${bestResult.selectedTitle}" (${bestScore}점)`);
  // ✅ [v1.4.48 Stage A.2] 정적 import 사용 — 모듈 인스턴스 단일 보장
  if (bestResult.selectedTitle) {
    recordSelectedTitle(bestResult.selectedTitle);
  }
  return bestResult;
}

/**
 * ✅ [2026-01-30] 제목 품질 평가 (감점 방식)
 * 100점에서 시작해서 문제 발견 시 감점
 */
// [Phase 3-8/v2.10.146] CATEGORY_BONUSES -> contentTitleQuality.ts

// [Phase 3-9/v2.10.147] evaluateTitleQuality -> contentTitleEvaluator.ts

async function generateHomefeedIntroOnlyPatch(source: ContentSource, current: StructuredContent, provider?: string): Promise<{ introduction?: string } | null> {
  const categoryHint = source.categoryHint as string | undefined;
  const systemPrompt = buildFullPrompt('homefeed', categoryHint, false, undefined, undefined, (source as any).hookHint, buildRecentWinnersBlock(source));
  const selectedTitle = String(current?.selectedTitle || '').trim();

  const schema = `Output ONLY valid JSON. NO markdown.\n\n{\n  "introduction": "string"\n}`;

  const prompt = `
${systemPrompt}

${schema}

[TASK]
홈판 모드 도입부만 다시 작성하세요.
- 정확히 3줄
- 첫 문장 15~25자 이내
- 배경 설명/요약/정리 금지
- 문체: 사용자 설정 글톤 어미 적용 (기본: 자연스러운 구어체)
- ⚠️ 서브키워드 1개 이상 도입부에 자연스럽게 포함

제목: ${selectedTitle || '(없음)'}
${(() => {
      const kwArr = Array.isArray((source?.metadata as any)?.keywords)
        ? (source.metadata as any).keywords.slice(1).filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k))).slice(0, 3)
        : [];
      return kwArr.length > 0 ? `서브키워드: ${kwArr.join(', ')}\n→ 위 서브키워드 중 1개 이상 도입부에 포함하세요.` : '';
    })()}

현재 도입부(문제 있음):
${String(current?.introduction || '').trim()}

JSON:
`.trim();

  try {
    // ✅ [v2.10.56] silent 폴백 회귀 — 사용자 선택 provider 그대로 (자동 폴백 금지 원칙)
    let raw: string;
    if (provider === 'agent-codex' || provider === 'agent-claude') {
      raw = await callAgent(provider, prompt, { mode: 'homefeed' });
    } else if (provider === 'perplexity') {
      raw = await callPerplexity(prompt, 0.9, 450);
    } else if (provider === 'openai') {
      raw = await callOpenAI(prompt, 0.9, 450);
    } else if (provider === 'claude') {
      raw = await callClaude(prompt, 0.9, 450);
    } else {
      raw = await callGemini(prompt, 0.9, 450, { useGrounding: false });
    }
    const parsed = safeParseJson<any>(raw);
    const introduction = typeof parsed?.introduction === 'string' ? String(parsed.introduction).trim() : '';
    if (!introduction) return null;
    return { introduction };
  } catch {
    return null;
  }
}

// [Phase 3-21/v2.10.167] mergeSeoWithHomefeedOverlay -> contentMergeOverlay.ts

export function finalizeStructuredContent(content: StructuredContent, source: ContentSource): StructuredContent {
  let finalContent = removeEmojisFromContent(content);
  finalContent = removeInternalStructureMarkersFromContent(finalContent);

  // ✅ [Phase 7] Source Fidelity 측정 — URL 입력 시 LLM 압축·정보 누락 감지
  // 사용자 진단: "url 넣어서 발행하면 내용들이 많이 압축되고 중요한 내용도 빠짐"
  // 동작: 측정·경고만, 자동 재시도는 데이터 검증 후 별도 단계.
  let _resultBodyForGates = '';
  try {
    const { checkSourceFidelity, extractResultBody } = require('./content/sourceFidelityCheck');
    _resultBodyForGates = extractResultBody(finalContent as any);
    // ✅ [v2.10.173] URL 모드는 *원본 100% 보존* — strict 임계 적용
    //   사용자 요청: "원본 내용이 100% 다 들어있어야 되는 거 아닌가요?"
    //   기본(키워드): compression 0.5 / retention 0.7
    //   URL 모드: compression 0.85 / retention 0.92 (사실상 100% 보존 요구)
    const _isUrlMode = !!source.url || source.sourceType === 'naver_news' || source.sourceType === 'daum_news';
    const fidelityInput = {
      rawText: source.rawText ?? '',
      resultBody: _resultBodyForGates,
      ...(_isUrlMode ? { minCompressionRatio: 0.85, minRetentionScore: 0.92 } : {}),
    };
    const fidelity = checkSourceFidelity(fidelityInput);
    if (!fidelity.passed) {
      const note = `⚠️ Source Fidelity 미달: ${fidelity.reason}`;
      console.warn(`[Fidelity] ${note} | 누락 샘플: ${fidelity.missingFacts.slice(0, 5).join(' / ')}`);
      finalContent.quality = finalContent.quality ?? ({ warnings: [], score: 0 } as any);
      if (Array.isArray((finalContent.quality as any).warnings)) {
        (finalContent.quality as any).warnings.push(note);
        if (fidelity.missingFacts.length > 0) {
          (finalContent.quality as any).warnings.push(
            `누락된 핵심 정보 (상위 ${Math.min(5, fidelity.missingFacts.length)}건): ${fidelity.missingFacts.slice(0, 5).join(', ')}`,
          );
        }
      }
    } else if (fidelity.totalFacts > 0) {
      console.log(`[Fidelity] ✅ 보존율 ${(fidelity.retentionScore * 100).toFixed(0)}% (${fidelity.retainedFacts}/${fidelity.totalFacts}), 압축률 ${(fidelity.compressionRatio * 100).toFixed(0)}%`);
    }
  } catch (fidelityErr) {
    console.warn('[Fidelity] 검사 모듈 로드 실패 (측정 스킵):', (fidelityErr as Error)?.message);
  }

  // [v2.10.169] 환각 표지 탐지 — 원본 vs 결과 sentiment mismatch + 부정 키워드 환각
  //   사용자 보고 사례: 정준하 "이중생활" → 원본 *기부/선행* 긍정 → 결과 *폭로/논란* 부정
  //   소제목은 원본 충실, 본문에서 의미 왜곡 환각
  try {
    if ((source.rawText ?? '').length >= 200 && _resultBodyForGates) {
      const { checkHallucination, inferHallucinationCategory } = require('./content/hallucinationCheck');
      // ✅ [v2.10.176] 카테고리별 사전 분기 — false-positive 차단
      const _hallCategory = inferHallucinationCategory({
        contentMode: source.contentMode,
        toneStyle: source.toneStyle,
        categoryHint: source.categoryHint,
      });
      const hallucination = checkHallucination(source.rawText ?? '', _resultBodyForGates, _hallCategory);
      if (hallucination.warnings.length > 0) {
        console.warn(`[Hallucination] ⚠️ 환각 의심 신호 ${hallucination.warnings.length}개:`);
        for (const w of hallucination.warnings) console.warn(`  - ${w}`);
        finalContent.quality = finalContent.quality ?? ({ warnings: [], score: 0 } as any);
        if (Array.isArray((finalContent.quality as any).warnings)) {
          for (const w of hallucination.warnings) {
            (finalContent.quality as any).warnings.push(`🚨 환각 의심: ${w}`);
          }
        }
      }
      if (hallucination.isLikelyHallucinated) {
        console.error(`[Hallucination] 🚨 강한 환각 신호 감지 — 원본 P${hallucination.positiveOriginal}/N${hallucination.negativeOriginal} → 결과 P${hallucination.positiveResult}/N${hallucination.negativeResult}, 의심 부정 키워드: ${hallucination.suspiciousNegativeKeywords.join(', ')}`);
        finalContent.quality = finalContent.quality ?? ({ warnings: [], score: 0 } as any);
        if (Array.isArray((finalContent.quality as any).warnings)) {
          (finalContent.quality as any).warnings.push(
            `🚨 [CRITICAL] 환각 가능성 높음 — 원본은 ${hallucination.positiveOriginal >= hallucination.negativeOriginal ? '긍정' : '부정'}인데 결과는 ${hallucination.positiveResult >= hallucination.negativeResult ? '긍정' : '부정'}. 발행 전 본문 검토 필수.`,
          );
        }
      }
    }
  } catch (hallErr) {
    console.warn('[Hallucination] 검사 모듈 로드 실패 (측정 스킵):', (hallErr as Error)?.message);
  }

  // ✅ [SPEC-DEFAMATION-2026 P0] 실존인물 미확인 단정 탐지 → legalRisk='danger' + 발행전 경고.
  //   완화(hedge) 안 함 — 판례상 면책 효과 없음(legal-research.md). 위험 문장을 표면화해
  //   사용자가 발행 전 삭제/확인하도록 유도(라이브 발행 신뢰 원칙: 하드차단은 P1 발행게이트).
  try {
    // [검토 M2] 탐지(발행 전 경고)는 컨텍스트 무관하게 돌린다 — 가십 글이 흔히 seo/일반 모드로
    //   작성되어 celebrity 게이트를 우회하는 구멍을 막는다. 오탐은 M1 필터(해명/정책/확정)가 억제.
    if (isCelebrityFactGuardEnabled()) {
      const celebRisk = detectCelebrityAssertionRisk(finalContent);
      if (celebRisk.risky) {
        console.error(`[CelebrityGuard] 🚨 실존인물 미확인 단정 감지 ${celebRisk.samples.length}건: ${celebRisk.samples.join(' / ')}`);
        finalContent.quality = finalContent.quality ?? ({ warnings: [], score: 0 } as any);
        (finalContent.quality as any).legalRisk = 'danger';
        if (Array.isArray((finalContent.quality as any).warnings)) {
          (finalContent.quality as any).warnings.push(
            `🚨 [법적위험] 실존인물 미확인 단정 감지 — 허위조작정보법(7·7) 위반 소지. 발행 전 해당 문장 삭제/확인 필수: ${celebRisk.samples.slice(0, 3).join(' / ')}`,
          );
        }
      }
    }
  } catch (celebErr) {
    console.warn('[CelebrityGuard] 스캔 실패 (스킵):', (celebErr as Error)?.message);
  }

  // ✅ [Phase B] LDF L5 — qualityGate 통합 (이전엔 dead code, 호출 0건)
  // 발행 전 품질 위험 신호 측정. 차단은 다음 단계에서 발행 흐름과 연결.
  try {
    const { prePublishGate } = require('./content/qualityGate');
    const inferredCategory = (() => {
      const hint = (source.categoryHint as string | undefined) ?? '';
      const valid = ['food','parenting','beauty','health','travel','tech','lifestyle','entertainment','finance','general'];
      return valid.includes(hint) ? hint : 'general';
    })();
    const gateResult = prePublishGate({
      title: (finalContent as any).selectedTitle ?? (finalContent as any).title ?? '',
      content: _resultBodyForGates || (finalContent as any).bodyPlain || '',
      category: inferredCategory as any,
      strictness: 'moderate',
      mode: source.contentMode || 'seo',
    });
    finalContent.quality = finalContent.quality ?? ({ warnings: [], score: 0 } as any);
    (finalContent.quality as any).prePublishGate = {
      allowed: gateResult.allowed,
      score: gateResult.score,
      blockers: gateResult.blockers,
      warnings: gateResult.warnings,
      estimatedRiskImpact: gateResult.estimatedRiskImpact,
    };
    if (!gateResult.allowed) {
      console.warn(`[QualityGate] ⛔ 차단 사유: ${gateResult.blockers.join(' / ')} (점수 ${gateResult.score}, 위험도 ${gateResult.estimatedRiskImpact})`);
      if (Array.isArray((finalContent.quality as any).warnings)) {
        (finalContent.quality as any).warnings.push(`⛔ 품질 게이트 차단: ${gateResult.blockers.join(' / ')}`);
      }
    } else if (gateResult.warnings.length > 0) {
      console.log(`[QualityGate] ⚠️ ${gateResult.warnings.length}건 경고 (점수 ${gateResult.score})`);
      if (Array.isArray((finalContent.quality as any).warnings)) {
        for (const w of gateResult.warnings.slice(0, 5)) {
          (finalContent.quality as any).warnings.push(`⚠️ [Gate] ${w}`);
        }
      }
    } else {
      console.log(`[QualityGate] ✅ 통과 (점수 ${gateResult.score}, 위험도 ${gateResult.estimatedRiskImpact})`);
    }
  } catch (gateErr) {
    console.warn('[QualityGate] 모듈 로드 실패 (측정 스킵):', (gateErr as Error)?.message);
  }

  // ✅ [Phase B] LDF L0/L1 — revenueEngine 카테고리 수익성 메타 추가 (이전엔 dead code)
  // 글이 어떤 카테고리이고, 그 카테고리 평균 CPC·수수료·월 천장이 무엇인지 메타에 기록.
  // 사용자가 "이 글은 수익이 될 가능성이 있나"를 보게 함.
  try {
    const { CATEGORY_ECONOMICS } = require('./content/revenueEngine');
    const inferredCategory = (() => {
      const hint = (source.categoryHint as string | undefined) ?? '';
      const valid = ['food','parenting','beauty','health','travel','tech','lifestyle','entertainment','finance','general'];
      return valid.includes(hint) ? hint : 'general';
    })();
    const econ = (CATEGORY_ECONOMICS as any)[inferredCategory];
    if (econ) {
      finalContent.quality = finalContent.quality ?? ({ warnings: [], score: 0 } as any);
      (finalContent.quality as any).revenueMeta = {
        category: inferredCategory,
        type: econ.type,
        avgCPC: econ.avgCPC,
        avgCommission: econ.avgCommission,
        monthlyCeiling: econ.monthlyCeiling,
      };
      console.log(`[RevenueEngine] 📊 ${inferredCategory} (${econ.type}) | CPC ${econ.avgCPC}원, 수수료 ${econ.avgCommission}원, 천장 ${(econ.monthlyCeiling/10000).toFixed(0)}만원/월`);
    }
  } catch (revErr) {
    console.warn('[RevenueEngine] 모듈 로드 실패:', (revErr as Error)?.message);
  }

  // ✅ [SPEC-CONVERSION-001 L2-1.8 + L2-1.10] Feature flag CHAINED_GEN_V1 게이트 + 메트릭 기록
  // 본 단계는 *메트릭 수집만* — 실제 stage 3~5 LLM 호출 통합은 후속.
  // 호출자가 flag ON 켜면 stage 1·2 결정론 결과가 quality.chainedMeta에 기록되고,
  // chainedGenMetrics에도 누적되어 operationsDashboard.getChainedGenSnapshot으로 노출.
  try {
    const { runChainedGenerationSync, summarizeMetrics } = require('./content/chainedGeneration');
    const { recordChainedGenRun } = require('./monitor/chainedGenMetrics');
    const chained = runChainedGenerationSync({
      title: (finalContent as any).selectedTitle ?? (finalContent as any).title ?? '',
      rawText: source.rawText ?? '',
      productHint: (source as any).productHint ?? '',
      existingHint: source.categoryHint as string | undefined,
    });
    recordChainedGenRun(chained);
    if (chained.enabled) {
      const summary = summarizeMetrics(chained);
      finalContent.quality = finalContent.quality ?? ({ warnings: [], score: 0 } as any);
      (finalContent.quality as any).chainedMeta = {
        category: chained.category,
        personaName: chained.persona.name,
        personaTone: chained.persona.tone,
        totalElapsedMs: summary.totalElapsedMs,
        successfulStages: summary.successfulStages,
        totalStages: summary.totalStages,
      };
      console.log(`[ChainedGen V1] ${chained.category} / ${chained.persona.name} / ${chained.persona.tone} | stages ${summary.successfulStages}/${summary.totalStages}`);
    }
  } catch (chainErr) {
    console.warn('[ChainedGen V1] 모듈 로드 실패 (메트릭만 스킵):', (chainErr as Error)?.message);
  }

  // ✅ [SPEC-CONVERSION-001] CHAINED_DRAFT_V1 진입 포인트 — 옵트인.
  //    flag OFF면 즉시 noop. ON이고 호출자가 LLM provider 주입 가능 시점에만 활성.
  //    현재 finalize 단계에선 LLM provider 주입 X → 본 진입은 *상위 호출자* 책임.
  //    (e.g., generateAffiliateContent에서 직접 maybeRunChainedDraft 호출)
  //
  //    본 위치는 *진입 가능성 알림* 로그만 출력. 실제 호출 hookup은 후속 작업.
  if (process.env.CHAINED_DRAFT_V1 === '1' || process.env.CHAINED_DRAFT_V1 === 'true' || process.env.CHAINED_DRAFT_V1 === 'on') {
    console.log('[ChainedDraft V1] flag ON — 상위 호출자에서 maybeRunChainedDraft 사용 권장');
  }

  // ✅ [2026-03-14] 연속 줄바꿈 정리 (AI가 생성한 \n\n\n → \n\n, 본문 내 이중 빈 줄 방지)
  finalContent = removeInternalStructureMarkersFromContent(finalContent);
  finalContent = normalizeContentLineBreaks(finalContent);

  // [v2.10.393] 사후 문단 분할 재활성화 — 한국어 종결어미만 split하는 안전 정규식 적용.
  //   사용자 보고 (v2.10.392): AI prompt 의미응집 블록 적용했어도 한 뭉텅이로 출력됨.
  //   AI prompt(v2.10.389-392)만으론 모바일 친화 단락 불완전 → 사후 안전망 필요.
  //   v2.10.391 OFF 이유(영문 약어/소수점/이니셜 잘림)는 contentBodyTransforms.ts의
  //   정규식 한국어 limit (?<=[가-힣][.!?])로 해소.
  finalContent = ensureContentParagraphBreaks(finalContent);

  // ✅ 소제목 길이 제한 (60자 이내로 완화 - 너무 짧으면 정보 전달력 하락)
  finalContent = truncateHeadingTitles(finalContent, 60);

  const manualTitleOverride = normalizeManualTitleOverride((source as any).manualTitleOverride);
  if (manualTitleOverride) {
    console.log(`[finalizeStructuredContent] 📌 사용자 지정 제목 고정: "${manualTitleOverride}"`);
    finalContent = applyManualTitleOverride(finalContent, manualTitleOverride) as StructuredContent;

    try {
      if (finalContent.bodyPlain) {
        finalContent.bodyPlain = removeOrdinalHeadingLabelsFromBody(finalContent.bodyPlain);
      }
      if (finalContent.bodyHtml) {
        finalContent.bodyHtml = removeOrdinalHeadingLabelsFromBody(finalContent.bodyHtml);
      }
      if (Array.isArray(finalContent.headings)) {
        finalContent.headings = finalContent.headings.map((h: any) => ({
          ...h,
          body: h.body ? removeOrdinalHeadingLabelsFromBody(String(h.body)) : h.body
        }));
      }
      sanitizeStructuredContentClaims(finalContent);
    } catch { /* ignore */ }

    applyHomefeedNarrativeHookBlock(finalContent, source);
    try { applyOrdinalHeadingMarkerFix(finalContent); } catch { /* ignore */ }
    finalContent = removeInternalStructureMarkersFromContent(finalContent);

    runPostGenValidator(finalContent, source);
    return finalContent;
  }

  // ✅ [2026-02-24] 키워드를 제목으로 그대로 사용하는 모드
  // 사용자가 명시적으로 선택한 경우, 모든 제목 조작/평가를 건너뛰고 키워드 원문 그대로 사용
  const keywordAsTitleValue = resolveKeywordAsTitleValue(source);
  if (keywordAsTitleValue) {
    const kwTitle = keywordAsTitleValue;
    console.log(`[finalizeStructuredContent] 📌 키워드를 제목으로 그대로 사용: "${kwTitle}"`);
    finalContent = applyKeywordAsTitleLock(finalContent as any, kwTitle) as StructuredContent;

    // 본문 클리닝은 유지 (제목만 건너뜀)
    try {
      if (finalContent.bodyPlain) {
        finalContent.bodyPlain = removeOrdinalHeadingLabelsFromBody(finalContent.bodyPlain);
      }
      if (finalContent.bodyHtml) {
        finalContent.bodyHtml = removeOrdinalHeadingLabelsFromBody(finalContent.bodyHtml);
      }
      if (Array.isArray(finalContent.headings)) {
        finalContent.headings = finalContent.headings.map((h: any) => ({
          ...h,
          body: h.body ? removeOrdinalHeadingLabelsFromBody(String(h.body)) : h.body
        }));
      }
      sanitizeStructuredContentClaims(finalContent);
    } catch { /* ignore */ }

    applyHomefeedNarrativeHookBlock(finalContent, source);
    try { applyOrdinalHeadingMarkerFix(finalContent); } catch { /* ignore */ }
    finalContent = removeInternalStructureMarkersFromContent(finalContent);

    runPostGenValidator(finalContent, source);
    return finalContent;
  }

  try {
    if (finalContent.selectedTitle) {
      finalContent.selectedTitle = collapseDuplicateLeadingYearTitle(cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars(finalContent.selectedTitle)))));
    }
    if ((finalContent as any).title) {
      (finalContent as any).title = collapseDuplicateLeadingYearTitle(cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars((finalContent as any).title)))));
    }
    if (Array.isArray(finalContent.titleAlternatives)) {
      finalContent.titleAlternatives = finalContent.titleAlternatives
        .map((t) => collapseDuplicateLeadingYearTitle(cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars(t))))))
        .filter(Boolean);
    }
    if (Array.isArray(finalContent.titleCandidates)) {
      finalContent.titleCandidates = finalContent.titleCandidates.map((c: any) => ({
        ...c,
        text: collapseDuplicateLeadingYearTitle(cleanupColonQuotePattern(cleanupTrailingTitleTokens(cleanupStartingTitleTokens(sanitizeTitleSpecialChars(c?.text))))),
      }));
    }

    // 본문 전체 클리닝 (?: 등 제거)
    if (finalContent.bodyPlain) {
      finalContent.bodyPlain = removeOrdinalHeadingLabelsFromBody(finalContent.bodyPlain);
    }
    if (finalContent.bodyHtml) {
      finalContent.bodyHtml = removeOrdinalHeadingLabelsFromBody(finalContent.bodyHtml);
    }

    // ✅ [신규] 소제목 본문에도 HTML 태그 제거 적용 (<u>, <b>, <i> 등)
    if (Array.isArray(finalContent.headings)) {
      finalContent.headings = finalContent.headings.map((h: any) => ({
        ...h,
        body: h.body ? removeOrdinalHeadingLabelsFromBody(String(h.body)) : h.body
      }));
    }
    sanitizeStructuredContentClaims(finalContent);
  } catch (e) {
    console.warn('[contentGenerator] catch ignored:', e);
  }

  // ✅ 제품/쇼핑/IT 리뷰: 상품명 prefix 우선 적용 (제목이 상품명으로 반드시 시작)
  if (isReviewArticleType(source?.articleType)) {
    const productName = getReviewProductName(source);
    if (productName) {
      applyKeywordPrefixToStructuredContent(finalContent, productName);
    }
  }
  const primaryKeyword = (source.metadata as any)?.keywords?.[0]
    ? String((source.metadata as any).keywords[0]).trim()
    : '';
  if (primaryKeyword) {
    try {
      const pn = isReviewArticleType(source?.articleType) ? String(getReviewProductName(source) || '').trim() : '';
      const n = (s: string) => String(s || '').replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '').toLowerCase();
      const pnN = n(pn);
      const pkN = n(primaryKeyword);
      if (pnN && pkN && (pnN.includes(pkN) || pkN.includes(pnN))) {
        return removeInternalStructureMarkersFromContent(finalContent);
      }
    } catch (e) {
      console.warn('[contentGenerator] catch ignored:', e);
    }
    // 제목에 주제가 완전히 빠진 경우만 보완한다. 이미 들어간 키워드를 첫 3글자로
    // 옮기거나 서론·결론에 다시 삽입하면 자연스러운 문장과 검색 의도가 훼손된다.
    applyKeywordPrefixToStructuredContent(finalContent, primaryKeyword);
  }
  applyHomefeedNarrativeHookBlock(finalContent, source);
  applySeoQualityHookBlock(finalContent, source);  // ✅ [2026-03-06] SEO 런타임 품질 게이트
  try {
    applyOrdinalHeadingMarkerFix(finalContent);
  } catch (e) {
    console.warn('[contentGenerator] catch ignored:', e);
  }
  sanitizeStructuredContentClaims(finalContent);
  finalContent = removeInternalStructureMarkersFromContent(finalContent);

  // ✅ [2026-01-19 수정] affiliate 모드 수익 배분 고지는 최상단에 삽입됨
  // 마무리글에 중복 삽입하지 않음 (사용자 요청)
  // if (source.contentMode === 'affiliate') { ... } 제거됨

  // ✅ [2026-02-24] 최종 품질 게이트: 키워드 접두사 + 클램핑 후 제목 재검증
  // 이전 아키텍처에서는 접두사 적용 전에만 검증 → 최종 제목 무검증 통과
  if (finalContent.selectedTitle) {
    try {
      // ✅ [v1.4.57] finalMode에 custom/business 유지 (이전: seo로 강제 폴백 → 검증 부정확)
      const finalMode = (source.contentMode || 'seo') as PromptMode;
      const finalCategoryHint = (source as any).categoryHint as string | undefined;
      const finalPK = primaryKeyword || (source.metadata as any)?.keywords?.[0] || '';
      const finalCheck = evaluateTitleQuality(finalContent.selectedTitle, String(finalPK), finalMode, finalCategoryHint, source.articleType);
      if (finalCheck.score < 50) {
        console.warn(`[FinalQualityGate] ⚠️ 최종 제목 품질 미달 (${finalCheck.score}점): "${finalContent.selectedTitle}"`);
        console.warn(`[FinalQualityGate]   issues: ${finalCheck.issues.join(', ')}`);
        // 접두사로 인한 훼손 → cleanup만 재적용하여 복구 시도
        finalContent.selectedTitle = removeDuplicatePhrasesFromTitle(
          cleanupColonQuotePattern(cleanupTrailingTitleTokens(
            cleanupStartingTitleTokens(sanitizeTitleSpecialChars(finalContent.selectedTitle))
          ))
        ).trim();
        const rescueCheck = evaluateTitleQuality(finalContent.selectedTitle, String(finalPK), finalMode, finalCategoryHint, source.articleType);
        console.log(`[FinalQualityGate] 복구 후: "${finalContent.selectedTitle}" (${rescueCheck.score}점)`);
      }
    } catch (e) {
      console.error('[FinalQualityGate] 검증 실패:', e);
    }
  }

  runPostGenValidator(finalContent, source);
  return finalContent;
}

// [Phase 3-16/v2.10.162] applyOrdinalHeadingMarkerFix + removeEmojisFromContent + normalizeContentLineBreaks + ensureContentParagraphBreaks -> contentBodyTransforms.ts

// ✅ [2026-01-21] 소제목 길이 제한 (30자 이내로 완화 - 제품명 포함 가능)
// [Phase 3-19/v2.10.165] truncateHeadingTitles -> contentBodyTransforms.ts

// ✅ [2026-02-11] templateCache 제거 — 인라인 템플릿 전용 캐시였음

// ✅ 카테고리별 프리셋
export interface ContentPreset {
  name: string;
  categoryHint: SourceCategoryHint;
  articleType: ArticleType;
  targetAge: '20s' | '30s' | '40s' | '50s' | 'all';
  minChars: number;
  provider: ContentGeneratorProvider;
  description: string;
}

/**
 * 프리셋을 소스에 적용
 * @param presetKey 프리셋 키
 * @param source 기본 소스 (선택사항)
 * @returns 프리셋이 적용된 소스
 */
export function applyPreset(presetKey: string, source?: Partial<ContentSource>): ContentSource {
  const preset = CONTENT_PRESETS[presetKey];
  if (!preset) {
    throw new Error(`프리셋을 찾을 수 없습니다: ${presetKey}`);
  }

  return {
    sourceType: 'custom_text',
    categoryHint: preset.categoryHint,
    articleType: preset.articleType,
    targetAge: preset.targetAge,
    rawText: source?.rawText || '',
    productInfo: source?.productInfo,
    personalExperience: source?.personalExperience,
  };
}

// ✅ 모든 카테고리 기본 글자수: 2800자 (양보다 질, 알찬 내용)
export const CONTENT_PRESETS: Record<string, ContentPreset> = {
  // 쇼핑/리뷰 프리셋
  shopping_review: {
    name: '쇼핑 사용후기',
    categoryHint: '쇼핑',
    articleType: 'shopping_review',
    targetAge: 'all',
    minChars: 2500,
    provider: 'gemini',
    description: '제품 사용후기 및 쇼핑 후기 (모든 연령대)',
  },
  shopping_expert_review: {
    name: '전문 리뷰',
    categoryHint: '쇼핑',
    articleType: 'shopping_expert_review',
    targetAge: 'all',
    minChars: 2800,
    provider: 'gemini',
    description: '전문가 관점의 제품 분석 리뷰 (모든 연령대)',
  },
  it_review: {
    name: 'IT 제품 리뷰',
    categoryHint: 'IT',
    articleType: 'it_review',
    targetAge: 'all',
    minChars: 2800, // ✅ IT 리뷰: 2800~3300자
    provider: 'gemini',
    description: 'IT 제품 상세 리뷰 (모든 연령대)',
  },
  // 연예/스포츠 프리셋
  entertainment: {
    name: '연예 뉴스',
    categoryHint: '연예',
    articleType: 'entertainment',
    targetAge: 'all',
    minChars: 2800, // ✅ 연예 뉴스: 2800~3300자
    provider: 'gemini',
    description: '연예인 소식 및 이슈 (모든 연령대)',
  },
  sports: {
    name: '스포츠 뉴스',
    categoryHint: '스포츠',
    articleType: 'sports',
    targetAge: 'all',
    minChars: 2800, // ✅ 스포츠 뉴스: 2800~3300자
    provider: 'gemini',
    description: '스포츠 경기 및 선수 소식 (모든 연령대)',
  },
  // 라이프스타일 프리셋
  food_review: {
    name: '맛집 리뷰',
    categoryHint: '맛집',
    articleType: 'general',
    targetAge: 'all',
    minChars: 2800, // ✅ 맛집 후기: 2800~3300자
    provider: 'gemini',
    description: '맛집 방문 후기 및 추천 (모든 연령대)',
  },
  travel: {
    name: '여행 후기',
    categoryHint: '여행',
    articleType: 'general',
    targetAge: 'all',
    minChars: 3000, // ✅ 여행 후기: 3000~3500자 (상세하게)
    provider: 'gemini',
    description: '여행지 소개 및 후기 (모든 연령대)',
  },
  // 육아/교육 프리셋
  parenting: {
    name: '육아 정보',
    categoryHint: '육아',
    articleType: 'general',
    targetAge: 'all',
    minChars: 2800, // ✅ 육아 정보: 2800~3300자
    provider: 'gemini',
    description: '육아 팁 및 정보 공유 (모든 연령대)',
  },
  // 재테크 프리셋
  finance: {
    name: '재테크 정보',
    categoryHint: '재테크',
    articleType: 'finance',
    targetAge: 'all',
    minChars: 2800, // ✅ 재테크: 2800~3300자
    provider: 'gemini',
    description: '재테크 및 투자 정보 (모든 연령대)',
  },
};

export type SourceCategoryHint =
  // 기존 카테고리
  | '연예' | '스포츠' | '건강' | '경제' | 'IT' | '쇼핑'
  // 라이프스타일
  | '여행' | '음식' | '맛집' | '레시피' | '요리'
  | '패션' | '뷰티' | '메이크업' | '스킨케어' | '헤어'
  | '리빙' | '인테리어' | 'DIY' | '홈데코' | '정리수납'
  // 육아/교육
  | '육아' | '교육' | '임신' | '출산' | '유아' | '초등' | '중등' | '고등'
  | '학습' | '영어' | '독서' | '놀이' | '장난감'
  // 재테크/부동산
  | '재테크' | '투자' | '주식' | '부동산' | '세금' | '절세' | '금융'
  | '적금' | '예금' | '펀드' | '코인' | '암호화폐'
  // 취미/문화
  | '영화' | '드라마' | '책' | '음악' | '게임' | '애니메이션'
  | '사진' | '카메라' | '취미' | '공예' | '그림'
  // 반려동물
  | '반려동물' | '강아지' | '고양이' | '펫푸드' | '펫용품'
  // 자동차
  | '자동차' | '카리뷰' | '중고차' | '카테크' | '자동차용품'
  // 직장/커리어
  | '직장' | '취업' | '이직' | '커리어' | '자기계발' | '부업'
  // 기타 (자유 입력용)
  | '기타'
  // 문자열도 허용 (사용자 커스텀)
  | string;
export type ContentGeneratorProvider = 'gemini' | 'openai' | 'claude' | 'perplexity' | 'agent-codex' | 'agent-claude';

export type ArticleType =
  // 뉴스/정보
  | 'news'
  | 'sports'
  | 'health'
  | 'finance'
  | 'general'
  // 리뷰
  | 'it_review'
  | 'shopping_review'
  | 'shopping_expert_review'
  | 'shopping_spec_analysis'
  | 'product_review'
  | 'place_review'
  | 'restaurant_review'
  // 라이프스타일
  | 'travel'
  | 'food'
  | 'recipe'
  | 'fashion'
  | 'beauty'
  | 'interior'
  // 육아/교육
  | 'parenting'
  | 'education'
  | 'learning'
  // 취미/문화
  | 'hobby'
  | 'culture'
  | 'entertainment'
  // 기타
  | 'tips'
  | 'howto'
  | 'guide'
  | 'traffic-hunter';

export interface ProductInfo {
  name: string;
  brand?: string;
  price: number;
  category: string;
  purchaseLink?: string;
  specs?: Record<string, unknown>;
}

export type TargetTrafficStrategy = 'viral' | 'steady';

export interface ContentSource {
  sourceType: 'naver_news' | 'daum_news' | 'custom_text';
  url?: string;
  title?: string;
  rawText: string;
  crawledTime?: string;
  categoryHint?: SourceCategoryHint | string;
  metadata?: Record<string, unknown>;
  generator?: ContentGeneratorProvider;
  articleType?: ArticleType;
  productInfo?: ProductInfo;
  personalExperience?: string;
  targetTraffic?: TargetTrafficStrategy;
  targetAge?: '20s' | '30s' | '40s' | '50s' | 'all';
  toneStyle?: 'friendly' | 'professional' | 'casual' | 'formal' | 'humorous' | 'community_fan' | 'mom_cafe' | 'storyteller' | 'expert_review' | 'calm_info'
    | 'sincere_exposure' | 'data_verified' | 'text_hip' | 'mentor' | 'self_interview'; // ✅ [작업 14] 12개 활성 + 3개 deprecated(casual/formal/humorous, UI 미노출)
  contentMode?: 'seo' | 'homefeed' | 'traffic-hunter' | 'affiliate' | 'custom' | 'business' | 'mate' | 'image-narrative'; // ✅ [v1.4.20] business 추가, [Phase 2] image-narrative 추가
  // ✅ [SPEC-IMAGE-NARRATIVE-2026 Phase 2] 이미지 내러티브 모드 옵션
  imageNarrative?: {
    images: Array<{ buffer: Buffer; mimeType: string }>;
    mode?: 'travel' | 'food' | 'lodging' | 'daily' | 'review' | 'cafe' | 'auto';
    provider?: 'gemini' | 'openai' | 'claude';
    context?: ImageNarrativeContext;
  };
  isFullAuto?: boolean; // ✅ 완전자동 발행 모드 (자동화 보조 프롬프트 적용)
  isReviewType?: boolean; // ✅ 리뷰형 글 (구매전환 유도)
  customPrompt?: string; // ✅ 사용자 정의 프롬프트 (추가 지시사항)
  // ✅ [v1.4.20] 업체 홍보 모드 전용 - 업체 정보 (가짜 번호 생성 방지)
  businessInfo?: {
    name?: string;       // 업체명
    phone?: string;      // 전화번호
    kakao?: string;      // 카카오톡 ID/링크
    address?: string;    // 주소 (사무소/매장 위치)
    hours?: string;      // 영업시간
    region?: string;     // 서비스 지역 (지역구 시): "부산, 울산, 경남" / 전국구 시: 빈 값
    serviceArea?: 'nationwide' | 'regional';  // ✅ [v1.4.22] 서비스 범위
    extra?: string;      // 추가 정보 (자격증/경력/특징 등)
    // [2026-06-12] 홍보 대상 — 업체 자체 vs 취급 상품 판매
    promoTarget?: 'business' | 'product';
    researchUrl?: string; // 심층 리서치 URL (홈페이지/상품 페이지)
    promoAngle?: string;          // 이번 글 강조 각도 라벨 (로테이션)
    promoAngleDirective?: string; // 각도별 작성 지시
  };
  images?: string[]; // ✅ 크롤링된 이미지 URL 목록 (Shopping Connect)
  collectedImages?: string[]; // ✅ [2026-02-01 FIX] 수집된 이미지 (중복 크롤링 방지용)
  // ✅ [2026-01-30] 쇼핑커넥트 풀스펙 크롤링 정보
  productSpec?: string;       // 제품 스펙 (크기, 무게, 소재 등)
  productPrice?: string;      // 제품 가격
  productReviews?: string[];  // 리뷰 텍스트 배열 (최대 5개)
  productReviewImages?: string[]; // 포토리뷰 이미지 URL
  previousTitles?: string[]; // ✅ [2026-02-09 v2] 이전 생성 제목 (연속발행 중복 방지)
  /** Fail-closed originality policy context injected before the model call. */
  contentPolicyPrompt?: string;
  manualTitleOverride?: string; // User-entered title that must not be rewritten by AI/SEO title logic
  useKeywordAsTitle?: boolean; // ✅ [2026-02-24] 키워드를 제목으로 그대로 사용 (제목 생성/평가 건너뛰기)
  keywordForTitle?: string; // ✅ [2026-02-24] useKeywordAsTitle=true 일 때 사용할 키워드 원문
  aiTabFriendly?: boolean; // [v2.10.235 Phase 3-A] AI 탭 친화 모드 — 6,000~8,000자 + bullet/리스트 강제
}
export interface TitleCandidate {
  text: string;
  score: number;
  reasoning: string;
}

export interface HeadingPlan {
  title: string;
  content?: string;  // ✅ Gemini가 생성하는 본문 내용
  summary: string;
  keywords: string[];
  imagePrompt: string;
}

export type RiskLevel = 'low' | 'medium' | 'high';
export type LegalRiskLevel = 'safe' | 'caution' | 'danger';

export interface GeneratedContentMetadata {
  category: SourceCategoryHint | string;
  targetAge: '20s' | '30s' | '40s' | '50s' | 'all';
  urgency: 'breaking' | 'depth' | 'evergreen';
  estimatedReadTime: string;
  wordCount: number;
  aiDetectionRisk: RiskLevel;
  legalRisk: LegalRiskLevel;
  seoScore: number;
  keywordStrategy: string;
  publishTimeRecommend: string;
  originalTitle?: string;
  tone?: 'friendly' | 'expert' | 'relatable';
  estimatedEngagement?: {
    views: number;
    comments: number;
    shares: number;
  };
}

export interface QualitySignals {
  aiDetectionRisk: RiskLevel;
  legalRisk: LegalRiskLevel;
  seoScore: number;
  originalityScore: number;
  readabilityScore: number;
  warnings: string[];
  viralPotential?: number;
  engagementScore?: number;
}

export interface ImagePlan {
  heading: string;
  prompt: string;
  placement: string;
  alt: string;
  caption: string;
}

export interface CommentTrigger {
  position: number;
  type: 'opinion' | 'experience' | 'vote';
  text: string;
}

export interface ShareTrigger {
  position: number;
  quote: string;
  prompt: string;
}

export interface BookmarkValue {
  reason: string;
  seriesPromise: string;
}

export interface ViralHooks {
  commentTriggers: CommentTrigger[];
  shareTrigger: ShareTrigger;
  bookmarkValue: BookmarkValue;
}

export interface TrafficStrategy {
  peakTrafficTime: string;
  publishRecommendTime: string;
  shareableQuote: string;
  controversyLevel: 'none' | 'low' | 'medium';
  retentionHook: string;
}

export interface PostPublishActions {
  selfComments: string[];
  shareMessage: string;
  notificationMessage: string;
}

export interface StructuredContent {
  status: 'success' | 'warning' | 'error';
  generationTime: string;
  selectedTitle: string;
  titleAlternatives: string[];
  titleCandidates: TitleCandidate[];
  bodyHtml: string;
  bodyPlain: string;
  content?: string;
  headings: HeadingPlan[];
  hashtags: string[];
  images: ImagePlan[];
  metadata: GeneratedContentMetadata;
  quality: QualitySignals;
  introduction?: string; // ✅ 도입부 (홈판 모드: 3줄 권장)
  conclusion?: string;   // ✅ 마무리 (홈판 모드: 여운형 2줄)
  viralHooks?: ViralHooks;
  trafficStrategy?: TrafficStrategy;
  postPublishActions?: PostPublishActions;
  cta?: {
    text: string;
    link?: string;
  };
  collectedImages?: string[]; // ✅ 소스에서 수집된 이미지 확인용
}
interface GenerateOptions {
  provider?: ContentGeneratorProvider;
  minChars?: number;
  contentMode?: 'seo' | 'homefeed' | 'mate'; // ✅ SEO/홈판/네이버 메이트 노출 최적화 모드
  signal?: AbortSignal; // ✅ [2026-04-03] 중지 시 즉시 AI API 호출 abort
}

export function detectBannedHeadingPatterns(headings: Array<{ title: string }>): string[] {
  return detectBannedHeadingPatternsImpl(headings);
}

export function validateShoppingConnectContent(
  content: StructuredContent,
  minimumBodyChars?: number,
): { score: number; feedback: string[] } {
  return validateShoppingConnectContentImpl(content, { minimumBodyChars });
}

// ✅ [2026-02-11] getCurrentSeason() 제거 — 인라인 템플릿 전용이었음

type OpenAiDiagnosticLevel = 'info' | 'warn' | 'error';

function emitOpenAiDiagnosticLog(message: string, level: OpenAiDiagnosticLevel = 'info'): void {
  const line = `[OpenAIDiag] ${message}`;
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  logger(line);

  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('automation:log', line);
      }
    }
  } catch {
    // Renderer log forwarding is best-effort only.
  }
}

function isOpenAiDiagnosticsEnabled(): boolean {
  const env = process.env.OPENAI_DIAGNOSTICS;
  if (env === '0' || env?.toLowerCase() === 'false') return false;
  if (env === '1' || env?.toLowerCase() === 'true') return true;
  return process.platform === 'darwin';
}

async function callOpenAIChatCompletionsRest(
  apiKey: string,
  params: Record<string, unknown>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
  diagnosticsEnabled = false,
): Promise<any> {
  const timeoutLabel = `OpenAI API 호출 시간 초과 (${timeoutMs / 1000}초)`;
  const requestAbort = createProviderTimeoutSignal(timeoutMs, timeoutLabel, externalSignal);
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const modelName = String(params.model || '(unknown)');
  const requestStart = Date.now();

  try {
    if (typeof fetch !== 'function') {
      throw new Error('현재 실행 환경에서 fetch API를 사용할 수 없습니다.');
    }

    if (diagnosticsEnabled) {
      const messages = Array.isArray((params as any).messages) ? (params as any).messages : [];
      const userChars = messages
        .filter((msg: any) => msg?.role === 'user')
        .map((msg: any) => String(msg?.content || '').length)
        .reduce((a: number, b: number) => a + b, 0);
      const systemChars = messages
        .filter((msg: any) => msg?.role === 'system')
        .map((msg: any) => String(msg?.content || '').length)
        .reduce((a: number, b: number) => a + b, 0);
      emitOpenAiDiagnosticLog(
        `CHAT_REQUEST_START model=${modelName} maxTokens=${String((params as any).max_completion_tokens || '')} ` +
        `timeoutMs=${timeoutMs} systemChars=${systemChars} userChars=${userChars} baseUrl=${baseUrl}`,
      );
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
      signal: requestAbort.signal,
    });
    const responseText = await response.text();
    let payload: any = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = { raw: responseText };
    }

    if (!response.ok) {
      const apiError: any = new Error(
        payload?.error?.message ||
        payload?.raw ||
        `OpenAI API HTTP ${response.status}`,
      );
      apiError.status = response.status;
      apiError.code = payload?.error?.code;
      apiError.type = payload?.error?.type;
      apiError.param = payload?.error?.param;
      apiError.headers = response.headers;
      apiError.response = { status: response.status, headers: response.headers };
      apiError.error = payload?.error;
      throw apiError;
    }

    if (diagnosticsEnabled) {
      const requestId = readHeaderValue(response.headers, 'x-request-id') || readHeaderValue(response.headers, 'openai-request-id') || '(none)';
      const promptTokens = payload?.usage?.prompt_tokens ?? '(n/a)';
      const completionTokens = payload?.usage?.completion_tokens ?? '(n/a)';
      const textLength = String(payload?.choices?.[0]?.message?.content || '').length;
      emitOpenAiDiagnosticLog(
        `CHAT_RESPONSE_OK status=${response.status} model=${modelName} elapsedMs=${Date.now() - requestStart} ` +
        `requestId=${requestId} promptTokens=${promptTokens} completionTokens=${completionTokens} textLength=${textLength}`,
      );
    }

    return payload;
  } catch (error) {
    if (diagnosticsEnabled) {
      emitOpenAiDiagnosticLog(
        `CHAT_REQUEST_ERROR kind=${classifyOpenAiDiagnosticError(error)} model=${modelName} ` +
        `elapsedMs=${Date.now() - requestStart} message="${normalizeErrorMessage(error).slice(0, 220)}"`,
        'error',
      );
    }
    throw requestAbort.normalizeError(error);
  } finally {
    requestAbort.dispose();
  }
}

async function runOpenAiDiagnosticPreflight(
  apiKey: string,
  modelName: string,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<void> {
  if (!isOpenAiDiagnosticsEnabled()) return;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const preflightTimeoutMs = Math.min(20_000, Math.max(8_000, timeoutMs));
  const startedAt = Date.now();
  const requestAbort = createProviderTimeoutSignal(
    preflightTimeoutMs,
    `OpenAI 사전 진단 시간 초과 (${preflightTimeoutMs / 1000}초)`,
    externalSignal,
  );

  emitOpenAiDiagnosticLog(
    `PREFLIGHT_START baseUrl=${baseUrl} model=${modelName} platform=${process.platform}/${process.arch} ` +
    `node=${process.versions.node || 'n/a'} electron=${process.versions.electron || 'n/a'} ` +
    `fetch=${typeof fetch} keyLength=${apiKey.length}`,
  );

  try {
    if (typeof fetch !== 'function') {
      throw new Error('현재 실행 환경에서 fetch API를 사용할 수 없습니다.');
    }

    const response = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: requestAbort.signal,
    });
    const responseText = await response.text();
    let payload: any = null;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      payload = { raw: responseText };
    }

    const requestId = readHeaderValue(response.headers, 'x-request-id') || readHeaderValue(response.headers, 'openai-request-id') || '(none)';
    if (!response.ok) {
      const apiError: any = new Error(payload?.error?.message || payload?.raw || `OpenAI /models HTTP ${response.status}`);
      apiError.status = response.status;
      apiError.code = payload?.error?.code;
      apiError.type = payload?.error?.type;
      apiError.headers = response.headers;
      apiError.response = { status: response.status, headers: response.headers };
      apiError.error = payload?.error;
      apiError.__openAiPreflightLogged = true;
      emitOpenAiDiagnosticLog(
        `PREFLIGHT_FAIL status=${response.status} kind=${classifyOpenAiDiagnosticError(apiError)} ` +
        `elapsedMs=${Date.now() - startedAt} requestId=${requestId} message="${normalizeErrorMessage(apiError).slice(0, 220)}"`,
        'error',
      );
      throw apiError;
    }

    const modelIds = Array.isArray(payload?.data) ? payload.data.map((model: any) => String(model?.id || '')).filter(Boolean) : [];
    const modelListed = modelIds.includes(modelName);
    emitOpenAiDiagnosticLog(
      `PREFLIGHT_OK status=${response.status} elapsedMs=${Date.now() - startedAt} requestId=${requestId} ` +
      `modelCount=${modelIds.length} selectedModelListed=${modelListed}`,
      modelListed ? 'info' : 'warn',
    );
  } catch (error) {
    const normalized = requestAbort.normalizeError(error);
    if (!(error as any)?.__openAiPreflightLogged) {
      emitOpenAiDiagnosticLog(
        `PREFLIGHT_ERROR kind=${classifyOpenAiDiagnosticError(normalized)} elapsedMs=${Date.now() - startedAt} ` +
        `message="${normalizeErrorMessage(normalized).slice(0, 220)}"`,
        'error',
      );
    }
    throw normalized;
  } finally {
    requestAbort.dispose();
  }
}

// ✅ 2축 분리 구조 프롬프트 생성 함수 (노출 목적 × 카테고리)
// ✅ [v1.4.23] export for testing (vitest)
export function buildModeBasedPrompt(
  source: ContentSource,
  mode: PromptMode,
  metrics?: { searchVolume?: number; documentCount?: number },
  minChars?: number
): string {
  const rawText = source.rawText?.trim() || '';
  const title = source.title || '';
  const categoryHint = source.categoryHint as string | undefined;
  const isFullAuto = source.isFullAuto || false;
  const isReviewType = source.isReviewType || false;

  // ✅ 글톤: 사용자 설정 우선, 없으면 카테고리에 맞게 자동 선택
  // ⚠️ 홈판 모드에서는 friendly/casual만 허용 (professional/formal 금지 - 기자체/설명체 방지)
  const userSelectedTone = source.toneStyle;
  // ✅ [v1.7.0] 노출 모드 × 카테고리 2차원 매트릭스로 자동 톤 결정
  //   mode 전달로 SEO/홈판/affiliate 각각 최적 톤 매핑됨
  let toneStyle = userSelectedTone || getAutoToneByCategory(categoryHint, mode);
  // ⚠️ [v1.7.0] 홈판 가드: 사용자가 professional/formal/expert_review/calm_info를 고르면
  //   친근형으로 완화 (홈판 피드에서 격식체는 이질감)
  if (mode === 'homefeed' && userSelectedTone && (toneStyle === 'professional' || toneStyle === 'formal' || toneStyle === 'expert_review' || toneStyle === 'calm_info')) {
    console.log(`[PromptBuilder] ⚠️ 홈판 모드에서 격식 톤 ${toneStyle} → friendly 완화 (독자 피드 이질감 방지)`);
    toneStyle = 'friendly';
  }
  if (userSelectedTone) {
    console.log(`[PromptBuilder] ✅ 사용자 선택 글톤 적용: ${toneStyle} (mode: ${mode})`);
  } else {
    console.log(`[PromptBuilder] 🎯 자동 톤 매칭: mode=${mode} × 카테고리=${categoryHint || 'general'} → 글톤=${toneStyle}`);
  }

  // ✅ 2축 분리 + 완전자동 모드: [노출 목적 base] + [카테고리 보정] + [자동화 보조] + [글톤]
  // 이제 buildFullPrompt 내부에서 toneStyle을 처리합니다.
  const contentMode = (source.contentMode as PromptMode) || 'seo';

  // ✅ [2026-03-16 v2] custom 모드: 사용자 프롬프트 최우선 + 품질 가드레일 동시 적용
  // [2026-05-27] 모든 모드(SEO/홈판/쇼핑/업체/custom)에서 개인 프롬프트 입력 시 동일 분기 — 사용자 프롬프트 100% 반영,
  //   기존 모드별 base 프롬프트 완전 대체. productInfo/businessInfo는 user 메시지에 자동 전달되어 보존.
  // [v2.10.394] 사용자 명시 요청: SEO/홈판/쇼핑/업체 모드에서는 base prompt + customPrompt 추가 방식.
  //   사용자정의 모드(custom)만 완전 대체 유지 (각 모드 baseline 보존하면서 사용자 지시 추가).
  //   buildFullPrompt 내부에 customPrompt 첨부 흐름(line 689)이 이미 있음.
  let systemPromptResult: string;
  const isUserPromptMode = !!(source.customPrompt && source.customPrompt.trim());
  const isCustomModeOverride = isUserPromptMode && contentMode === 'custom';
  if (isCustomModeOverride) {
    // 사용자정의 모드: 사용자 프롬프트를 최우선 지시사항으로, SEO/홈판급 품질 규칙을 가드레일로 적용
    systemPromptResult = buildCustomModeOverridePrompt({
      customPrompt: source.customPrompt!,
      toneStyle,
    });
    const modeLabels: Record<string, string> = { custom: '사용자정의', affiliate: '쇼핑커넥트', seo: 'SEO', homefeed: '홈판', business: '업체홍보', mate: '네이버 메이트' };
    const modeLabel = modeLabels[contentMode] || contentMode;
    console.log(`[PromptBuilder] ✅ ${modeLabel} 모드 + 개인 프롬프트: 사용자 프롬프트 100% 반영 + 품질 가드레일 (${source.customPrompt!.length}자)`);
  } else if (contentMode === 'affiliate') {
    // 🛒 [쇼핑커넥트 2026] .prompt 파일 모듈화 + articleType 분기
    // shopping_review → affiliate/shopping_review.prompt (사용후기)
    // shopping_expert_review → affiliate/shopping_expert_review.prompt (전문 리뷰)
    const productPriceForPrompt = formatPrice(source.productPrice)
      ?? formatPrice(source.productInfo?.price)
      ?? undefined;
    const productInfoForPrompt = {
      name: source.productInfo?.name || source.title,
      spec: source.productSpec,
      price: productPriceForPrompt,
      reviews: source.productReviews,
    };

    // P0 review guard (SPEC-REVIEW-001): detect missing review data before
    // assembling the prompt so downstream blocks can branch on it.
    const reviewAvailable = isReviewAvailable(source.productReviews);
    const affiliateEvidence = classifyAffiliateEvidence(source);
    const reviewGuardOn = isReviewGuardEnabled();

    systemPromptResult = buildFullPrompt('seo', source.categoryHint, source.isFullAuto, toneStyle, productInfoForPrompt, (source as any).hookHint, buildRecentWinnersBlock(source));

    // ✅ .prompt 파일에서 쇼핑 프롬프트 로드 (articleType 기반 분기)
    // SPEC-REVIEW-001 option C: "사용후기" mode is logically inconsistent with
    // reviewCount === 0 — you cannot write a testimonial with no testimony.
    // We tried auto-promoting to shopping_expert_review (option A) but the
    // expert mode forces "전문성 시그널" and "카테고리 일반론 비교" which in
    // the no-review state manufactured unsubstantiated generalisations and
    // comparative numbers. Option C: dedicated shopping_spec_analysis mode —
    // a neutral curator voice bound strictly to the supplied spec/price.
    const requestedArticleType = source.articleType || 'shopping_review';
    let shoppingArticleType = requestedArticleType;
    if (affiliateEvidence.mode === 'spec_only' && reviewGuardOn && requestedArticleType === 'shopping_review') {
      shoppingArticleType = 'shopping_spec_analysis';
      console.log('[PromptBuilder] 🔄 articleType auto-promoted: shopping_review → shopping_spec_analysis (작성자 경험/구매자 리뷰 없음)');
    }
    const shoppingPrompt = loadShoppingPrompt(shoppingArticleType, toneStyle);

    if (shoppingPrompt) {
      // .prompt 파일 로드 성공 → 모듈화된 프롬프트 사용
      systemPromptResult += `\n\n${shoppingPrompt}`;
      systemPromptResult = appendShoppingOfficialSafetyGuard(systemPromptResult);
      console.log(`[PromptBuilder] ✅ 쇼핑커넥트 모듈 프롬프트 적용: ${shoppingArticleType}`);
    } else {
      // ✅ [v1.4.12] 인라인 폴백 dead code 제거 — .prompt 파일 정상 로드 시 절대 진입 불가
      // dist/prompts/affiliate/{shopping_review,shopping_expert_review}.prompt 보장됨
      console.error(`[PromptBuilder] ❌ 쇼핑 .prompt 파일 로드 실패 — affiliate prompt 누락. shoppingArticleType=${shoppingArticleType}`);
    } // end of shoppingPrompt if/else

    // P0 review guard: append the no-experience block AFTER the shopping prompt
    // so recency effect keeps the model constrained even when earlier archetype
    // instructions demand experiential writing.
    if (affiliateEvidence.mode === 'spec_only' && reviewGuardOn) {
      systemPromptResult += `\n\n${buildReviewGuardBlock({
        reviewCount: 0,
        hasSpec: Boolean(source.productSpec),
        hasPrice: Boolean(productPriceForPrompt),
      })}`;
      console.log('[PromptBuilder] 🔒 P0 review guard applied: reviews=0 (SPEC-REVIEW-001)');
    } else if (affiliateEvidence.mode === 'first_party') {
      console.log('[PromptBuilder] 사용자 실사용 메모 확인 — P0 리뷰 부재 가드 미적용');
    } else if (reviewAvailable) {
      console.log(`[PromptBuilder] 구매자 리뷰 확인: ${Array.isArray(source.productReviews) ? source.productReviews.length : 0}건 — REVIEW_SYNTHESIS 적용`);
    } else if (!reviewGuardOn) {
      console.warn('[PromptBuilder] ⚠️ REVIEW_GUARD_V1=false — guard 비활성 상태로 발행');
    }
  } else {
    systemPromptResult = buildFullPrompt(
      contentMode,
      source.categoryHint,
      source.isFullAuto,
      toneStyle,
      undefined,
      (source as any).hookHint,
      buildRecentWinnersBlock(source),
      undefined, // bloggerIdentity: 호출자에서 주입 가능 (v1.8.0 LDF)
      (source as any).primaryKeyword || (source as any).keywords?.[0], // v1.8.1 LDF Phase 2: CTR 훅 매개
    );
  }

  // ✅ [v2.10.63] GEO/AEO 오버레이 — 기본 ON (사용자가 명시 OFF 시에만 비활성)
  //   v2.10.62 기본 OFF → v2.10.63 기본 ON 전환 (사용자 요청: "수익나는법")
  //   네이버 SEO 룰 충돌 0 (오버레이 자체가 base.prompt 룰을 어기지 않는 범위에서만 작동)
  //   비용: 1편당 ~2~3K 토큰 추가 → ~₩100~200/편 (캐싱 시 절감)
  try {
    const geoCfg = getConfigSync();
    const geoOn = (geoCfg as any)?.geoOptimization !== false; // 기본 ON: undefined도 true 취급
    const geoEligibleMode = contentMode === 'seo' || contentMode === 'affiliate' || contentMode === 'mate';
    if (geoOn && geoEligibleMode) {
      const overlay = getGeoOverlayPrompt();
      if (overlay) {
        systemPromptResult += `\n\n${overlay}`;
        console.log(`[PromptBuilder] 🌐 GEO/AEO 오버레이 적용 (mode=${contentMode}, 기본 ON)`);
      } else {
        console.warn('[PromptBuilder] geo-overlay.prompt 로드 실패 — 미적용');
      }
    }
  } catch (e) {
    console.warn('[PromptBuilder] GEO 오버레이 처리 중 예외 — 미적용:', e);
  }

  // ✅ [v2.10.74 Phase 2] LLM 충실도 강제 — 네이버 fact-check RAG 자료 있을 때만 적용
  //   목적: LLM이 [Article Content]에 없는 사실을 생성 못하도록 강제 (모르는 것은 안 쓴다)
  //   조건: source.hasFactCheckSource === true (main.ts에서 RAG 주입 + 검증 통과 시 set)
  if ((source as any).hasFactCheckSource === true) {
    systemPromptResult = applyFactCheckHardConstraint(systemPromptResult, true);
    console.log('[PromptBuilder] 🚨 HARD_CONSTRAINT (Phase 2) 적용 — 자료 기반 작성 강제');
  }

  // ✅ [SPEC-REVIEW-001 확장] 범용 근거부재 가드 — 전 카테고리 공통.
  //   근거 자료(팩트체크/rawText) 없이 키워드만으로 쓰는 비쇼핑 글에서 체험 위장·
  //   사실 날조·가짜 회상체·빈 마무리 상투구를 차단. 쇼핑(affiliate)은 reviewGuard 담당,
  //   근거 있는 글은 위 HARD_CONSTRAINT 담당 → 둘 다 해당 안 되는 빈 경로만 커버.
  if (contentMode !== 'affiliate' && isGeneralContentGuardEnabled() && !hasGroundingSource(source)) {
    systemPromptResult += `\n\n${buildGeneralContentGuardBlock()}`;
    console.log(`[PromptBuilder] 🔒 범용 근거부재 가드 적용 — ungrounded, mode=${contentMode}`);
  }

  // ✅ [SPEC-DEFAMATION-2026 P0] 실존인물(연예/스포츠/homefeed) 미확인 단정 억제 — 허위조작정보법(7·7) 대응.
  //   generalGuard와 달리 hasGroundingSource로 게이트하지 않는다: 크롤 가십(rawText≥50)이 '근거'로
  //   오인정되어도 검증된 사실이 아니므로, celebrity 컨텍스트면 grounding 유무와 무관하게 억제한다.
  // 프롬프트 억제는 celebrity 컨텍스트에서만(토큰 비용). homefeed는 스켈레톤 point 6가 이미
  // 동일 취지를 담으므로 블록 중복주입 스킵(검토 P0.5 — 토큰 절감).
  if (isCelebrityFactGuardEnabled() && isCelebrityContext(source) && contentMode !== 'homefeed') {
    systemPromptResult += `\n\n${buildCelebrityFactGuardBlock()}`;
    console.log(`[PromptBuilder] ⚖️ 실존인물 안전 가드 적용 — mode=${contentMode}`);
  }

  // ✅ [Traffic Hunter 통합] 모드별 온도(Temperature) 설정
  // ✅ [v1.4.35] SEO 0.2 → 0.5 (로봇 회귀 방지, "사람보다 사람처럼" 우선)
  //              0.2는 거의 deterministic이라 학습 데이터의 평균 어조로 회귀.
  //              0.5는 키워드 정확도를 유지하면서 어휘/표현 다양성 확보.
  let systemPrompt = systemPromptResult;

  // [SPEC-PROMPT-2026-REFRESH Phase 3-B / v2.10.236] Claude Sonnet abstention 강화 prompt
  //   조건: source.claudeAbstentionStrong === true (config.claudeAbstentionMode === true + provider claude).
  //   동작: systemPrompt 끝에 강한 abstention 지시 추가 — Sonnet의 96.7% abstention 성능 극대화.
  //   Gemini Flash 사용자에게는 base.prompt F6 룰만 적용되고 이 강화 inject는 생략 (Sonnet 전용).
  if ((source as any).claudeAbstentionStrong === true) {
    systemPrompt = appendClaudeStrongAbstentionBlock(systemPrompt, true);
    console.log('[PromptBuilder] 🛡️ Claude Sonnet STRONG abstention 강화 prompt 추가');
  }

  // [SPEC-PROMPT-2026-REFRESH Phase 3-A / v2.10.235] AI 탭 친화 모드 prompt 추가
  //   조건: source.aiTabFriendly === true (configManager.aiTabFriendlyMode === true → contentGenerator에서 source에 플래그 세팅).
  //   동작: src/prompts/seo/ai-tab-friendly.prompt 로드해서 systemPrompt 끝에 append.
  //   효과: 6,000~8,000자 + bullet/리스트 + 정의문 + 정보 탐색형 키워드 룰 LLM에 강제.
  //   실패 시 graceful skip (기본 SEO 룰만 적용).
  if (shouldApplyAiTabFriendlyPrompt(source, contentMode)) {
    try {
      const aiTabPrompt = loadAiTabFriendlyPrompt({
        appPath: app.getAppPath(),
        currentDir: __dirname,
        existsSync: fsSync.existsSync,
        readFileSync: fsSync.readFileSync,
      });
      systemPrompt = appendAiTabFriendlyPrompt(systemPrompt, aiTabPrompt);
      if (aiTabPrompt.source === 'dist') {
        console.log('[PromptBuilder] 🎯 AI 탭 친화 프롬프트 추가 (ai-tab-friendly.prompt)');
      } else if (aiTabPrompt.source === 'dev') {
        console.log('[PromptBuilder] 🎯 AI 탭 친화 프롬프트 추가 (dev src 폴백)');
      } else {
        console.warn('[PromptBuilder] ⚠️ ai-tab-friendly.prompt 파일 없음 — 기본 SEO 룰만 적용');
      }
    } catch (e: any) {
      console.warn('[PromptBuilder] AI 탭 친화 프롬프트 로드 실패 — graceful skip:', e?.message || e);
    }
  }

  // ✅ [v1.4.14] 글자수 지침은 user 파트로 이동 (캐시 적중률 향상)
  // 이전: system에 ${minChars} 직접 삽입 → 매 글 캐시 미스
  // 이후: [원본 텍스트] 마커 이후로 이동 → system 정적 유지

  const primaryKeyword = getPrimaryKeywordFromSource(source);
  const subKeywords = Array.isArray((source.metadata as any)?.keywords)
    ? (source.metadata as any).keywords
      .slice(1)
      .filter((k: any) => String(k).length >= 2 && !/^\d+$/.test(String(k)))
      .slice(0, 5)
      .join(', ')
    : '';

  console.log(`[PromptBuilder] 글톤 및 프롬프트 생성 완료: ${toneStyle}, 메인키워드=${primaryKeyword}`);

  // ✅ 리뷰형일 때 구매 전 제품 분석 프롬프트 추가
  if (isReviewType) {
    systemPrompt = appendReviewAnalysisPrompt(systemPrompt, true);
    console.log(`[PromptBuilder] 리뷰형 구매 전 분석 프롬프트 추가됨`);
  }

  console.log(`[PromptBuilder] 2축 분리 프롬프트 생성: mode=${mode}, category=${categoryHint || 'general'}, isFullAuto=${isFullAuto}, isReviewType=${isReviewType}`);

  const jsonOutputFormat = buildContentJsonOutputFormat({
    contentMode,
    mode,
    source,
    title,
    rawText,
    primaryKeyword,
    subKeywords,
    metrics,
    minChars,
  });

  let finalContract = '';
  if (contentMode === 'affiliate') {
    finalContract = buildAffiliateAuthenticityContract(source);
    console.log(`[PromptBuilder] 쇼핑 진정성 계약 적용: ${classifyAffiliateEvidence(source).mode}`);
  } else if (contentMode === 'seo' || contentMode === 'homefeed' || contentMode === 'mate' || contentMode === 'business' || contentMode === 'custom') {
    finalContract = buildEvidenceAndIntentFinalContract(source, contentMode);
    console.log(`[PromptBuilder] 근거·의도 최종 계약 적용: ${contentMode}, firstParty=${hasExplicitFirstPartyEvidence(source)}`);
  }

  // This contract must be last so category and JSON-output rules cannot override evidence safety.
  return `${systemPrompt}\n\n${jsonOutputFormat}${finalContract ? `\n\n${finalContract}` : ''}`.trim();
}

// ✅ [2026-02-11] 데드코드 제거 완료
// buildPrompt()의 인라인 템플릿(~2,900줄)은 AI API에 전달되지 않는 데드코드였음.
// 모든 모드에서 buildModeBasedPrompt()가 실제 시스템 프롬프트를 생성함.
// 이 함수는 하위 호환성을 위해 buildModeBasedPrompt()로 위임만 함.
function buildPrompt(
  source: ContentSource,
  minChars: number,
  metrics?: { searchVolume?: number; documentCount?: number }
): string {
  const contentMode = (source.contentMode || 'seo') as PromptMode;
  return buildModeBasedPrompt(source, contentMode, metrics, minChars);
}

// JSON 파싱 함수는 jsonParser.ts로 이동

// [Phase 7.4-r] official/latest guide claim sanitizer -> contentClaimSanitizer.ts
// [Phase 7.4-s] duplicate/similarity heuristics -> contentDuplicateHeuristics.ts
// [Phase 7.4-u] escape sequence cleanup -> contentEscapeCleanup.ts
// [Phase 7.4-v] exaggeration/prompt leak filter -> contentExaggerationFilter.ts

// [Phase 7.4-ae] structured response validation -> contentStructuredValidator.ts

/**
 * ✅ SEO 모드 전용 검증 및 보정 함수
 * - 제목 키워드 배치 검증
 * - 제목 길이 검증 (25~35자)
 * - 소제목 5개 이상 권장
 */
export function validateBusinessContent(content: StructuredContent, source: ContentSource): { hasCritical: boolean; violations: string[]; warnings: string[] } {
  if (source.contentMode !== 'business') return { hasCritical: false, violations: [], warnings: [] };

  const violations: string[] = [];
  const warnings: string[] = [];
  const bodyText = content.bodyPlain || '';
  const allText = `${content.selectedTitle || ''} ${bodyText} ${(content.headings || []).map((h: any) => `${h?.title || ''} ${h?.content || ''}`).join(' ')}`;

  console.log('[BusinessValidator] 🔍 업체 홍보 모드 검증 시작...');

  // 1. businessInfo 필드가 본문에 그대로 있는지 검증
  const info = source.businessInfo;
  if (info) {
    if (info.name) {
      const nameCount = (allText.match(new RegExp(info.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (nameCount === 0) {
        violations.push(`업체명 "${info.name}"이 본문에 한 번도 없음 (필수 노출 누락)`);
      } else if (nameCount < 2) {
        warnings.push(`업체명 "${info.name}" 등장 ${nameCount}회 (권장 3~6회)`);
      } else if (nameCount > 8) {
        warnings.push(`업체명 "${info.name}" 등장 ${nameCount}회 (과다 반복 위험, 권장 3~6회)`);
      }
    }

    if (info.phone) {
      // 입력한 전화번호가 본문에 있는지
      if (!allText.includes(info.phone)) {
        violations.push(`전화번호 "${info.phone}"이 본문에 없음 — AI가 가짜 번호 생성 또는 누락`);
      }
      // 가짜 번호 패턴 감지 (입력값 외 다른 번호)
      const phonePatterns = allText.match(/(?:0\d{1,2}-?\d{3,4}-?\d{4}|01[0-9]-?\d{3,4}-?\d{4}|1[5-9]\d{2}-?\d{4})/g) || [];
      for (const found of phonePatterns) {
        const normalized = found.replace(/-/g, '');
        const inputNormalized = info.phone.replace(/-/g, '');
        if (normalized !== inputNormalized) {
          violations.push(`⛔ 가짜 전화번호 감지: "${found}" (입력값 "${info.phone}"과 다름)`);
        }
      }
    }

    if (info.kakao && !allText.includes(info.kakao)) {
      warnings.push(`카카오톡 "${info.kakao}"가 본문에 없음`);
    }

    if (info.address && !allText.includes(info.address.split(' ')[0])) {
      warnings.push(`주소 일부가 본문에 없음`);
    }

    // 전국구 vs 지역구 일치 검증
    if (info.serviceArea === 'regional' && info.region) {
      const firstRegion = info.region.split(/[,/\s]+/)[0];
      if (firstRegion && !allText.includes(firstRegion)) {
        violations.push(`지역명 "${firstRegion}"이 본문/제목에 없음 (지역구 모드 필수)`);
      }
    }
    if (info.serviceArea === 'nationwide') {
      // 다른 지역명 임의 추가 감지 (강남/송파 등 특정 지역)
      const suspiciousRegions = ['강남', '송파', '서초', '잠실', '명동', '홍대', '이태원'];
      const found = suspiciousRegions.filter(r => allText.includes(r));
      if (found.length > 0) {
        warnings.push(`전국구인데 특정 지역명 발견: ${found.join(', ')}`);
      }
    }

    const trustedBusinessText = [
      source.rawText || '',
      info.name || '',
      info.phone || '',
      info.kakao || '',
      info.address || '',
      info.hours || '',
      info.region || '',
      info.extra || '',
    ].join(' ');
    const businessStats = allText.match(/\d[\d,]*(?:\.\d+)?\s*(?:건|개|년|개월|평|만원|원|시간|일|회|%|퍼센트|점)/g) || [];
    const unsupportedStats = Array.from(new Set(businessStats))
      .filter(stat => !trustedBusinessText.includes(stat.trim()))
      .slice(0, 5);
    if (unsupportedStats.length > 0) {
      warnings.push(`입력 근거 없는 수치 표현 감지: ${unsupportedStats.join(', ')} — 실제 입력값이 아니면 삭제/완화 필요`);
    }
  }

  // 2. 소제목 5~7개 검증
  const headingCount = Array.isArray(content.headings) ? content.headings.length : 0;
  if (headingCount < 5) {
    violations.push(`소제목 ${headingCount}개 (필수 5~7개)`);
  } else if (headingCount > 7) {
    warnings.push(`소제목 ${headingCount}개 (권장 5~7개)`);
  }

  // 3. 마지막 소제목이 "문의/연락처" 안내인지 검증
  if (Array.isArray(content.headings) && content.headings.length > 0) {
    const lastHeading = content.headings[content.headings.length - 1];
    const lastTitle = String(lastHeading?.title || '');
    const ctaKeywords = ['문의', '견적', '상담', '연락', '예약', '안내', '신청'];
    if (!ctaKeywords.some(kw => lastTitle.includes(kw))) {
      warnings.push(`마지막 소제목이 CTA 안내 아님: "${lastTitle}" (필수: 문의/견적/상담/연락처 키워드)`);
    }
  }

  // 4. 광고법 단정 표현 감지
  const bannedTerms = [
    { term: '100% 보장', regex: /100\s*%\s*보장/g },
    { term: '100% 만족', regex: /100\s*%\s*만족/g },
    { term: '최저가', regex: /최저가/g },
    { term: '업계 1위', regex: /업계\s*1위/g },
    { term: '국내 1위', regex: /국내\s*1위/g },
    { term: '최고의', regex: /최고의/g },
  ];
  for (const { term, regex } of bannedTerms) {
    if (regex.test(allText)) {
      violations.push(`⛔ 광고법 위반 표현 감지: "${term}"`);
    }
  }

  // 결과 로깅
  if (violations.length > 0) {
    console.error(`[BusinessValidator] ❌ Critical 위반 ${violations.length}개:`, violations);
  }
  if (warnings.length > 0) {
    console.warn(`[BusinessValidator] ⚠️ 경고 ${warnings.length}개:`, warnings);
  }
  if (violations.length === 0 && warnings.length === 0) {
    console.log('[BusinessValidator] ✅ 모든 검증 통과');
  }

  // quality 객체에 저장
  if (!content.quality) {
    content.quality = {
      aiDetectionRisk: 'low',
      legalRisk: (violations.length > 0 ? 'danger' : (warnings.length > 0 ? 'caution' : 'safe')) as LegalRiskLevel,
      seoScore: 70,
      originalityScore: 70,
      readabilityScore: 70,
      warnings: [],
    };
  }
  content.quality.warnings = [
    ...(content.quality.warnings || []),
    ...violations.map(v => `BusinessValidator: ${v}`),
    ...warnings.map(w => `BusinessValidator: ${w}`),
  ];

  return { hasCritical: violations.length > 0, violations, warnings };
}

/**
 * ⚡ 목표 글자수에 따라 동적 타임아웃 계산
 * - 배포 환경 안정성: 네트워크 환경이 다양하므로 충분한 시간 제공
 * - 첫 연결 지연 고려: DNS 해석, TLS 핸드쉐이크 등
 * - 사양과 무관: AI 처리는 서버에서 수행됨
 */
function getTimeoutMs(minChars: number, retryAttempt: number = 0): number {
  return getContentProviderTimeoutMs(minChars, retryAttempt);
}

const GEMINI_CACHE_CREATE_TIMEOUT_MS = 10_000;

function withGeminiTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return withProviderTimeout(promise, timeoutMs, label);
}

const geminiRequestGate = new ProviderRequestGate({ sleep: sleepWithAbort });
export const GEMINI_RATE_LIMIT_MIN_WAIT_MS = 75_000;
export const GEMINI_RATE_LIMIT_MAX_SINGLE_WAIT_MS = 180_000;

function getGeminiMinIntervalMs(config: any): number {
  const envValue = readOptionalNonNegativeMsEnv('GEMINI_MIN_INTERVAL_MS');
  if (envValue !== undefined) return envValue;
  return config?.geminiPlanType === 'paid' ? 8000 : 10_000;
}

export function getGeminiRateLimitPatienceMs(config: any): number {
  const envValue = readOptionalNonNegativeMsEnv('GEMINI_RATE_LIMIT_PATIENCE_MS');
  if (envValue !== undefined) return envValue;
  return config?.geminiPlanType === 'paid' ? 12 * 60 * 1000 : 5 * 60 * 1000;
}

async function throttleGeminiRequest(modelName: string, config: any, signal?: AbortSignal): Promise<void> {
  const minIntervalMs = getGeminiMinIntervalMs(config);
  if (minIntervalMs <= 0) return;

  const key = `Gemini:${config?.geminiPlanType || 'auto'}:${modelName}`;
  await geminiRequestGate.throttle(
    key,
    minIntervalMs,
    signal,
    (waitMs) => `[GeminiThrottle] ${modelName} RPM 보호 — ${Math.round(waitMs / 1000)}초 대기`,
  );
}

function recordGeminiRateLimitBackoff(modelName: string, config: any, waitMs: number): void {
  const key = `Gemini:${config?.geminiPlanType || 'auto'}:${modelName}`;
  geminiRequestGate.recordBackoff(key, waitMs);
}

export function getGeminiRateLimitWaitMs(error: unknown, fallbackMs: number): number {
  const raw = `${normalizeErrorMessage(error)}\n${safeStringifyError(error)}`;
  const patterns = [
    /retry\s+in\s+([\d.]+)\s*(ms|s|m)?/i,
    /retryDelay["'\s:]+([\d.]+)\s*(ms|s|m)?/i,
    /"retryDelay"\s*:\s*"([\d.]+)\s*(ms|s|m)?"/i,
  ];
  const waits: number[] = [];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value < 0) continue;
    const unit = (match[2] || 's').toLowerCase();
    const ms = unit === 'm' ? value * 60_000 : unit === 'ms' ? value : value * 1000;
    waits.push(Math.round(ms + 1000));
  }

  const retrySeconds = raw.match(/retryDelay[\s\S]{0,120}?seconds["'\s:]+([\d.]+)/i)
    || raw.match(/RetryInfo[\s\S]{0,160}?seconds["'\s:]+([\d.]+)/i);
  if (retrySeconds) {
    const seconds = Number(retrySeconds[1]);
    if (Number.isFinite(seconds) && seconds >= 0) waits.push(Math.round(seconds * 1000 + 1000));
  }

  const headerWait = getProviderRateLimitWaitMs(error, fallbackMs, ['retry-after']);
  waits.push(headerWait);

  const waitMs = Math.max(
    GEMINI_RATE_LIMIT_MIN_WAIT_MS,
    fallbackMs,
    ...waits.filter((value) => Number.isFinite(value) && value > 0),
  );
  return Math.min(waitMs, GEMINI_RATE_LIMIT_MAX_SINGLE_WAIT_MS);
}

const providerRequestGates = new ProviderRequestGate({ sleep: sleepWithAbort });

async function throttleProviderRequest(provider: string, modelName: string, minIntervalMs: number, signal?: AbortSignal): Promise<void> {
  if (minIntervalMs <= 0) return;
  const key = `${provider}:${modelName}`;
  await providerRequestGates.throttle(
    key,
    minIntervalMs,
    signal,
    (waitMs) => `[${provider}Throttle] ${modelName} RPM 보호 — ${Math.round(waitMs / 1000)}초 대기`,
  );
}

function recordProviderRateLimitBackoff(provider: string, modelName: string, waitMs: number): void {
  const key = `${provider}:${modelName}`;
  providerRequestGates.recordBackoff(key, waitMs);
}

function getClaudeMinIntervalMs(modelName: string): number {
  const lower = modelName.toLowerCase();
  const fallback = lower.includes('opus') ? 10_000 : lower.includes('sonnet') ? 8_000 : 5_000;
  return readNonNegativeMsEnv('CLAUDE_MIN_INTERVAL_MS', fallback);
}

function getClaudeRateLimitPatienceMs(): number {
  return readNonNegativeMsEnv('CLAUDE_RATE_LIMIT_PATIENCE_MS', 5 * 60_000, 60_000);
}

function getClaudeRateLimitWaitMs(error: unknown, fallbackMs: number): number {
  return getProviderRateLimitWaitMs(error, fallbackMs, [
    'retry-after',
    'anthropic-ratelimit-requests-reset',
    'anthropic-ratelimit-tokens-reset',
    'anthropic-ratelimit-input-tokens-reset',
    'anthropic-ratelimit-output-tokens-reset',
  ]);
}

function getPerplexityMinIntervalMs(modelName: string): number {
  const lower = modelName.toLowerCase();
  const fallback = lower.includes('deep-research') ? 12_000 : 2_000;
  return readNonNegativeMsEnv('PERPLEXITY_MIN_INTERVAL_MS', fallback);
}

function getPerplexityRateLimitPatienceMs(): number {
  return readNonNegativeMsEnv('PERPLEXITY_RATE_LIMIT_PATIENCE_MS', 5 * 60_000, 60_000);
}

function getPerplexityRateLimitWaitMs(error: unknown, fallbackMs: number): number {
  return getProviderRateLimitWaitMs(error, fallbackMs, ['retry-after', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']);
}

// ✅ [v1.4.6] Gemini Context Caching — 정적 시스템 프롬프트를 캐시하여 입력 토큰 비용 75% 절감
// 캐시 키: SHA-256(systemText + modelName) → 동일 system 프롬프트 + 동일 모델이면 재사용
// 캐시 TTL: 1시간 (Google 권장값)
// 최소 토큰: Flash 4096, Pro 2048 (그 이상이어야 캐시 가능)
const GEMINI_CACHE_TTL = 3600; // 1시간
const GEMINI_CACHE_MIN_TOKENS = { flash: 4096, pro: 2048 };

/**
 * ✅ [v1.4.77] API 키별 캐시 지원 자동 감지
 * - 캐시 생성/사용 실패한 키는 세션 동안 캐시 스킵
 * - 무료 티어(캐시 미지원)는 한 번 실패 후 영구 일반 호출
 * - 유료 티어(캐시 지원)는 정상 75% 절감 혜택
 * - 앱 재시작 시 리셋되어 다시 시도 (플랜 업그레이드 자동 감지)
 */
/**
 * 캐시 정리 (만료된 항목 제거)
 */
function cleanExpiredCaches(): void {
  for (const entry of pruneExpiredGeminiPromptCaches()) {
    console.log(`[GeminiCache] 만료 캐시 제거: ${entry.cacheName}`);
  }
}

async function callGemini(prompt: string, temperature: number = 0.9, minChars: number = 2000, options: { useGrounding?: boolean; signal?: AbortSignal } = {}): Promise<string> {
  const timeoutMs = getTimeoutMs(minChars);

  // ✅ 설정 로드
  let config: any = null;
  try {
    const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
    config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.warn('[ContentGenerator] Config 로드 실패:', e);
  }

  // ✅ [v1.4.50] Safety Lock — 유료 플랜 사용자의 예산 초과 방지
  // 무료 플랜은 Google이 자동 차단하므로 Safety Lock 불필요 (무료는 한도만 체크)
  // 유료 플랜은 카드 자동 청구되므로 앱에서 직접 차단해야 함
  await enforceGeminiBudgetSafety(config, {
    flushUsage: async () => {
      const { flushGeminiUsage } = await import('./gemini.js');
      await flushGeminiUsage();
    },
    getUsageSnapshot: async () => {
      const { getGeminiUsageSnapshot } = await import('./gemini.js');
      return getGeminiUsageSnapshot();
    },
    warn: console.warn,
    error: console.error,
  });

  // ✅ [2026-03-16] promptSplitter 모듈로 system/user 분리
  // 기존 37줄 하드코딩 systemInstructionText 제거 → .prompt 파일의 규칙이 그대로 system으로 전달
  // ✅ [v1.4.51] geminiUserText/temperature를 mutable로 — 빈 응답 회복 시 프롬프트 증강
  const { system: geminiSystemText, user: geminiUserTextOriginal } = splitPromptByMarker(prompt);
  let geminiUserText = geminiUserTextOriginal;
  let activeTemperature = temperature;
  let promptAugmentationCount = 0;
  const MAX_PROMPT_AUGMENTATIONS = 2;

  // 1. API 키 로드 — 다중 키 로테이션 지원
  const configGeminiKey = config?.geminiApiKey?.trim() || '';
  const envGeminiKey = process.env.GEMINI_API_KEY?.trim() || '';
  if (isMaskedSecretValue(configGeminiKey) && !envGeminiKey) {
    throw new Error('Gemini API 키가 실제 키가 아니라 마스킹된 표시값으로 저장되어 있습니다. 환경설정에서 Gemini 실제 API 키를 다시 입력해주세요.');
  }
  const primaryApiKey = (!isMaskedSecretValue(configGeminiKey) ? configGeminiKey : '') || (!isMaskedSecretValue(envGeminiKey) ? envGeminiKey : '');
  if (!primaryApiKey && (isMaskedSecretValue(configGeminiKey) || isMaskedSecretValue(envGeminiKey))) {
    throw new Error('Gemini API 키가 실제 키가 아니라 마스킹된 표시값으로 저장되어 있습니다. 환경설정에서 Gemini 실제 API 키를 다시 입력해주세요.');
  }
  const rawExtraKeys = Array.isArray(config?.geminiApiKeys) ? config.geminiApiKeys : [];
  const maskedExtraKeyCount = rawExtraKeys.filter((k: string) => isMaskedSecretValue(k)).length;
  if (maskedExtraKeyCount > 0) {
    console.warn(`[Gemini] 마스킹된 보조 API 키 ${maskedExtraKeyCount}개는 호출에서 제외합니다.`);
  }
  const extraKeys: string[] = rawExtraKeys
    .map((k: string) => k.trim())
    .filter((k: string) => k && !isMaskedSecretValue(k));
  const keyPlan = buildGeminiKeyExecutionPlan({
    primaryApiKey,
    extraApiKeys: extraKeys,
    planType: config?.geminiPlanType,
    useFreeQuotaBeforePaid: config?.geminiUseFreeQuotaBeforePaid,
  });
  const allApiKeys = keyPlan.keys;
  if (allApiKeys.length === 0) throw new Error('Gemini API 키가 설정되지 않았습니다.');
  let currentKeyIdx = 0;
  const getNextKey = (): string | null => {
    currentKeyIdx++;
    return currentKeyIdx < allApiKeys.length ? allApiKeys[currentKeyIdx] : null;
  };
  let trimmedKey = allApiKeys[0];

  if (allApiKeys.length > 1) {
    console.log(`[Gemini] 🔑 API 키 ${allApiKeys.length}개 로테이션 준비 완료${keyPlan.freeQuotaFirst ? ' (무료 키 풀 우선)' : ''}`);
  }

  // 2. 모델 설정 — 사용자가 선택한 모델만 사용 (다른 모델로 몰래 전환 금지)
  const { primaryModel, isPro } = buildGeminiModelChain(config as any);
  const modelsToTry = [primaryModel];
  const geminiPlanLabel = config?.geminiPlanType === 'paid'
    ? '유료'
    : config?.geminiPlanType === 'free'
      ? '무료'
      : '자동';
  const isPaidPlan = config?.geminiPlanType === 'paid';
  console.log(`[Gemini] 모델: ${primaryModel} (플랜: ${geminiPlanLabel})`);

  let lastError: Error | null = null;
  // ✅ [v1.4.64] 재시도 3회로 축소 — 실패 확정까지 4분→1분 이하
  const perModelMaxRetries = 3;
  const geminiRateLimitPatienceMs = getGeminiRateLimitPatienceMs(config);
  let geminiRateLimitWaitedMs = 0;

  for (let i = 0; i < modelsToTry.length; i++) {
    const modelName = modelsToTry[i];
    let modelRetryCount = 0;
    let geminiRateLimitRetryCount = 0;
    // 사용자가 선택한 모델만 사용 (폴백 전환 없음)

    while (modelRetryCount < perModelMaxRetries) {
      try {
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const client = new GoogleGenerativeAI(trimmedKey);

        // ✅ [v1.4.6] Gemini Context Caching — 시스템 프롬프트 재사용으로 75% 절감
        // 캐시 가능 조건: system 프롬프트가 충분히 큼 (Flash 4096 토큰, Pro 2048 토큰)
        // 1토큰 ≈ 4자 한국어 기준 → Flash 16,384자, Pro 8,192자
        // ✅ [2026-06-06] 캐시는 기본 OFF.
        //    cacheManager.create가 본문 생성 전 Gemini API 1회를 추가로 사용하므로
        //    Tier 1/RPM 낮은 프로젝트에서는 "버튼 1회"가 "API 2회"가 되어 429가 쉽게 난다.
        //    비용 절감이 필요한 고한도 프로젝트만 ENV GEMINI_CACHE_ENABLED=1로 명시 opt-in.
        const cacheEligibility = resolveGeminiPromptCacheEligibility({
          modelName,
          systemTextLength: geminiSystemText.length,
          isKeySupported: isGeminiCacheSupportedForKey(trimmedKey),
          cacheEnabledEnv: process.env.GEMINI_CACHE_ENABLED,
          cacheDisabledEnv: process.env.GEMINI_CACHE_DISABLED,
        });
        const cacheEnabled = cacheEligibility.enabled;
        let cachedContentName: string | undefined;

        if (cacheEnabled) {
          cleanExpiredCaches();
          const cacheKey = getGeminiPromptCacheKey(geminiSystemText, modelName);
          const existingCache = getCachedGeminiPrompt(cacheKey);

          if (existingCache) {
            // 캐시 히트 — 75% 절감
            cachedContentName = existingCache.cacheName;
            console.log(`[GeminiCache] ✅ 히트: ${cachedContentName.substring(0, 30)}... (system ${geminiSystemText.length}자, 75% 절감)`);
          } else {
            // 캐시 미스 — 새로 생성
            try {
              const { GoogleAICacheManager } = await import('@google/generative-ai/server' as any);
              const cacheManager = new GoogleAICacheManager(trimmedKey);
              const newCache = await withGeminiTimeout<any>(
                cacheManager.create({
                  model: `models/${modelName}`,
                  systemInstruction: { role: 'system', parts: [{ text: geminiSystemText }] },
                  contents: [{ role: 'user', parts: [{ text: '준비 완료' }] }],
                  ttlSeconds: GEMINI_CACHE_TTL,
                }),
                GEMINI_CACHE_CREATE_TIMEOUT_MS,
                `Gemini cache create timeout (${GEMINI_CACHE_CREATE_TIMEOUT_MS / 1000}s)`,
              );
              cachedContentName = newCache.name;
              if (cachedContentName) {
                setCachedGeminiPrompt(cacheKey, {
                  cacheName: cachedContentName,
                  modelName,
                  createdAt: Date.now(),
                  ttlSeconds: GEMINI_CACHE_TTL,
                });
                console.log(`[GeminiCache] 🆕 생성: ${cachedContentName.substring(0, 30)}... (다음 호출부터 75% 절감)`);
              }
            } catch (cacheErr: any) {
              const errMsg = cacheErr?.message || '';
              console.warn(`[GeminiCache] ⚠️ 캐시 생성 실패 (정상 호출로 폴백): ${errMsg.substring(0, 100)}`);
              cachedContentName = undefined;
              // ✅ [v1.4.77] 무료 티어 / 캐시 미지원 키 자동 학습
              // 403 Forbidden, 400 Bad Request, "caching is not supported" 등 구조적 실패는 영구 기록
              const isStructural = isStructuralGeminiCacheError(errMsg);
              if (isStructural) {
                markGeminiCacheUnsupported(trimmedKey, errMsg.substring(0, 60));
              }
            }
          }
        }

        // 모델 인스턴스 생성 (캐시 사용 여부에 따라 분기)
        const model = cachedContentName
          ? client.getGenerativeModelFromCachedContent({
              model: modelName,
              name: cachedContentName,
            } as any)
          : client.getGenerativeModel({ model: modelName });

        console.log(`[Gemini] 시도 중: ${modelName} (시도 ${modelRetryCount + 1}/${perModelMaxRetries})${cachedContentName ? ' [캐시 사용 ✅]' : ''}`);
        // ✅ [v1.4.3] Search Grounding 스마트 적용 — 본문 생성만 ON, 패치는 OFF
        // ✅ [v2.10.336] 원문 모드(크롤링 원문이 프롬프트에 포함, user > 500자)는 그라운딩 OFF.
        //   Perplexity 경로(v2.10.171, line 5672~)와 동일 정책 — Gemini 경로만 누락돼 있었음.
        //   원문 모드에서 그라운딩이 켜져 있으면, 프롬프트의 크롤링 원문 + 검색으로 가져온
        //   같은 기사를 Gemini가 이중으로 받아 거의 그대로 재현 → RECITATION → 빈 응답(0건).
        //   원문 자체가 fact source이므로 그라운딩을 꺼도 환상(hallucination)이 생기지 않는다.
        const configGrounding = (config as any)?.enableSearchGrounding !== false;
        const isRawTextMode = (geminiUserTextOriginal || '').length > 500;
        const useGrounding = (options.useGrounding !== false) && configGrounding && !isRawTextMode;
        if (isRawTextMode) {
          console.log('[Gemini] 📄 원문 모드 감지 (user > 500자) → 그라운딩 OFF (RECITATION 회피, 원문이 fact source)');
        }

        const resultCacheAllowed = minChars < 1000;
        const resultCacheKey = resultCacheAllowed ? getGeminiResultCacheKey({
          modelName,
          systemText: geminiSystemText,
          userText: geminiUserText,
          temperature: activeTemperature,
          useGrounding,
        }) : '';
        const cachedResult = resultCacheAllowed ? getCachedGeminiResult(resultCacheKey) : undefined;
        if (cachedResult) {
          console.log(`[GeminiResultCache] ✅ 동일 프롬프트 캐시 히트 (${modelName}, ${useGrounding ? 'grounded' : 'plain'}) — API 호출 생략`);
          return cachedResult;
        }

        // 캐시 사용 시 systemInstruction 중복 금지 (캐시에 이미 포함)
        const requestConfig: any = {
          contents: [{ role: 'user', parts: [{ text: geminiUserText }] }],
          ...(!cachedContentName && geminiSystemText
            ? { systemInstruction: { role: 'system', parts: [{ text: geminiSystemText }] } }
            : {}),
          generationConfig: {
            temperature: activeTemperature,
            topP: 0.95,
            topK: 40,
            // ✅ [v2.10.207] Pro 모델은 thinking 기반 → maxOutputTokens 16384로 증가 (thinking + 응답 합산)
            //   Flash/Lite는 8192 유지 (비용 절감)
            maxOutputTokens: /2\.5-pro/i.test(modelName) ? 16384 : 8192,
            // ✅ [v2.10.207] thinkingBudget=0은 *Flash/Lite만* — Pro는 thinking이 모델 핵심
            //   기존: modelName.includes('2.5') → Pro까지 thinking 끔 → "루프가 비정상 종료됨" 회귀
            //   변경: 2.5-flash / 2.5-flash-lite 만 thinking 끔 (Pro는 thinking 정상 사용)
            ...(/2\.5-flash/i.test(modelName) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          } as any,
          // ✅ [v1.4.51] 3) safetySettings BLOCK_NONE — SAFETY false positive 박멸
          // 한국어 블로그(의료/금융/법률/관계) 키워드가 기본 BLOCK_MEDIUM_AND_ABOVE에 자주 걸림
          // BLOCK_NONE으로 설정해도 Google이 강제 차단하는 최상위 콘텐츠는 여전히 막힘 → 안전
          // 4개 카테고리 모두 명시적으로 비활성화
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        };
        // ✅ [v1.4.34 FIX] URL 모드 손님 PC 호출 실패 우회
        // 기존: URL 모드(grounding OFF)는 responseMimeType: 'application/json' 활성화
        //       → 일부 손님 PC에서 SDK fetch 단계 실패 (body 형태/크기/JSON 모드 조합)
        //       → 키워드 모드(grounding ON)는 동일 손님 PC에서 정상 작동
        // 변경: URL 모드도 grounding ON으로 통일 — 키워드 모드와 동일 request 형태
        //       응답 cleaner(6571~6580)가 이미 markdown 코드블록 + { } 추출 처리하므로
        //       JSON 모드 없어도 응답 파싱 안전
        // 비용: +$0.035/글 (grounding) — 손님 사고 해결 가치가 더 큼
        if (useGrounding) {
          requestConfig.tools = [{ googleSearch: {} }];
        } else {
          // [v2.10.172] grounding OFF 경로 — 호출자가 명시적으로 options.useGrounding=false로 지정한 경우만 진입
          //   (제목 생성 등 짧은 보조 호출). 본문 생성은 callSite에서 항상 useGrounding 미설정(=ON).
          //   사용자가 environment 설정에서 enableSearchGrounding=false로 끈 경우에도 여기 진입.
          // requestConfig.tools 미설정 (기본 OFF)
        }
        // ✅ [v1.4.77] 캐시 사용 호출 실패 시 즉시 일반 호출로 투명 폴백
        //    4/18 장애 원인: getGenerativeModelFromCachedContent 경로가 일부 환경에서 실패
        //    해결: 캐시 호출 실패 감지 → 해당 API 키를 캐시 미지원으로 기록 → 일반 모델로 즉시 재시도
        //    효과: 무료/유료 구분 없이 모든 사용자가 안전하게 생성됨
        const invokeStream = async (): Promise<any> => {
          return await invokeGeminiStreamWithCacheFallback({
            modelName,
            apiKey: trimmedKey,
            systemText: geminiSystemText,
            cachedContentName,
            requestConfig,
            activeModel: model,
            getPlainModel: () => client.getGenerativeModel({ model: modelName }),
            markUnsupported: markGeminiCacheUnsupported,
            deletePromptCache: deleteCachedGeminiPrompt,
            warn: console.warn,
          });
        };
        // ✅ [2026-01-28 FIX] 첫 응답 타임아웃 60초로 증가 (유료 API 안정성)
        const firstResponseTimeoutMs = Math.min(timeoutMs, 60_000);

        console.log(`[Gemini] 🚀 ${modelName} 호출 (Search Grounding: ${useGrounding ? 'ON +$0.035' : 'OFF (비용 절감)'})${cachedContentName ? ' [캐시 시도 ✅]' : ''}`);
        await throttleGeminiRequest(modelName, config, options.signal);
        const streamPromise = invokeStream();
        const streamResult = await withProviderTimeout(
          streamPromise,
          firstResponseTimeoutMs,
          `⏱️ 연결 타임아웃 (${Math.round(firstResponseTimeoutMs / 1000)}초)`,
          options.signal,
        );
        let text = '';

        // ✅ [v2.10.29] 스트림 전체 수신 타임아웃 (3분) + signal abort 시 즉시 break
        //   Google generative-ai SDK가 signal 미지원이므로 for-await 안에서 직접 체크.
        const recvPromise = (async () => {
          for await (const chunk of streamResult.stream) {
            if (options.signal?.aborted) break; // 사용자 취소 즉시 루프 종료
            text += chunk.text();
          }
        })();

        const receiveTimeoutMs = Math.min(Math.max(timeoutMs, 90_000), 180_000);
        await withProviderTimeout(
          recvPromise,
          receiveTimeoutMs,
          `⏱️ 생성 시간 초과(${Math.round(receiveTimeoutMs / 1000)}초)`,
          options.signal,
        );
        throwIfContentGenerationAborted(options.signal);

        if (text && text.trim()) {
          console.log(`✅ [Gemini] 응답 수신 완료 (모델: ${modelName}, 길이: ${text.length})`);

          // ✅ [2026-03-19] 사용량 추적 (스트리밍 완료 후 aggregated response에서 추출)
          // ✅ [v1.4.50] thinking 토큰 반영 — Gemini 2.5는 thoughtsTokenCount가 별도 집계됨
          //    이전: promptTokenCount + candidatesTokenCount (실측 대비 ~60% 과소 집계)
          //    수정: totalTokenCount - promptTokenCount (output + thinking 모두 포함)
          //    실측: thinking 토큰이 output의 20배까지 나와서 앱 추정이 실제의 40%밖에 안 됐음
          try {
            const aggResponse = await waitForGeminiUsageMetadata(streamResult);
            const usageMeta = (aggResponse as any)?.usageMetadata;
            if (usageMeta) {
              const promptTokens = usageMeta.promptTokenCount || 0;
              const totalTokens = usageMeta.totalTokenCount || 0;
              // output = total - prompt (thinking/reasoning 토큰 포함)
              const effectiveOutput = totalTokens > promptTokens
                ? totalTokens - promptTokens
                : (usageMeta.candidatesTokenCount || 0);
              trackApiUsage('gemini', {
                inputTokens: promptTokens,
                outputTokens: effectiveOutput,
                model: modelName,
              });
            }
          } catch { /* usage 추출 실패는 무시 — 생성 성공이 우선 */ }

          // 1. 인코딩 보정
          text = fixUtf8Encoding(text);

          // 2. JSON 정리 및 추출
          let cleaned = text.trim();
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');
          }
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start !== -1 && end !== -1 && end > start) {
            cleaned = cleaned.substring(start, end + 1);
          }

          if (resultCacheAllowed) setCachedGeminiResult(resultCacheKey, cleaned);
          return cleaned;
        }
        // ✅ [v1.4.51] 빈 응답을 GeminiEmptyResponseError로 throw — finishReason별 대응
        let finishReason = 'UNKNOWN';
        let promptT = 0, thinkingT = 0, candT = 0;
        try {
          const aggResp = await waitForGeminiUsageMetadata(streamResult);
          finishReason = aggResp?.candidates?.[0]?.finishReason || 'UNKNOWN';
          const usage = (aggResp as any).usageMetadata || {};
          promptT = usage.promptTokenCount || 0;
          const totalT = usage.totalTokenCount || 0;
          candT = usage.candidatesTokenCount || 0;
          thinkingT = Math.max(0, totalT - promptT - candT);
        } catch { /* 진단 실패는 무시 — finishReason=UNKNOWN으로 진행 */ }

        const emptyMsg = `응답 비어있음 (finishReason=${finishReason}, in=${promptT}, think=${thinkingT}, out=${candT})`;
        console.error(`[Gemini] ❌ ${emptyMsg}`);
        throw new GeminiEmptyResponseError(emptyMsg, finishReason, promptT, thinkingT, candT);

      } catch (error) {
        // ✅ [v1.4.50] Safety Lock 에러는 재시도/폴백 금지 — 즉시 상위로 전파
        if (error instanceof BudgetExceededError) throw error;

        // ✅ [v1.4.51] 빈 응답 에러 — 프롬프트 증강으로 무조건 회복
        // BLOCK_NONE + thinkingBudget 0 + 60K maxOutput으로 거의 안 뜨지만,
        // RECITATION(safetySettings 무시)이나 잔여 SAFETY는 프롬프트 증강으로 회복
        if (error instanceof GeminiEmptyResponseError) {
          lastError = error;

          // 프롬프트 증강 시도 (최대 2회 — 1회: 가드 추가, 2회: 더 강한 가드 + temp 상승)
          if (promptAugmentationCount < MAX_PROMPT_AUGMENTATIONS) {
            promptAugmentationCount++;
            // finishReason별 맞춤 가드
            let guard = '';
            if (error.finishReason === 'RECITATION') {
              guard = '\n\n[필수] 외부 문서/저작물을 그대로 옮기지 말고, 100% 새로운 표현과 문장으로 작성하세요. 인용·복사·발췌 금지.';
            } else if (error.finishReason === 'SAFETY') {
              guard = '\n\n[필수] 안전하고 일반적인 표현으로 작성하세요. 자극적·민감·논쟁적 단어를 피하고 중립적 어조를 유지하세요.';
            } else {
              // MAX_TOKENS / UNKNOWN — 분량 압축 + 가드
              guard = '\n\n[필수] 핵심만 간결하게 작성하세요. 불필요한 반복을 피하고, 요청된 분량 범위 내에서 마무리하세요.';
            }
            // 누적 증강(2회차는 더 강하게)
            if (promptAugmentationCount === 2) {
              guard += ' (재요청) 이전 응답이 비어있었습니다. 반드시 응답을 생성해주세요.';
            }
            geminiUserText = geminiUserTextOriginal + guard;
            // temperature 살짝 상승 — 동일 입력 반복 방지 (cap 1.0)
            activeTemperature = Math.min(1.0, activeTemperature + 0.1);
            console.warn(`[Gemini] 🔄 빈 응답 회복 #${promptAugmentationCount} (${error.finishReason}) → 프롬프트 증강 + temp ${activeTemperature.toFixed(2)}`);
            continue; // 같은 modelRetryCount, 다음 attempt
          }

          // 증강 2회 모두 실패 → 키 로테이션
          const nextKey = getNextKey();
          if (nextKey) {
            console.warn(`[Gemini] 🔑 빈 응답 회복 실패 → 다음 키로 재시도`);
            trimmedKey = nextKey;
            promptAugmentationCount = 0; // 새 키엔 처음부터
            geminiUserText = geminiUserTextOriginal;
            activeTemperature = temperature;
            continue;
          }
          // ✅ [v1.4.64] 모든 회복 수단 소진 → 명확한 에러 (다른 모델로 전환 안 함)
          console.error(`[Gemini] ❌ ${modelName} 빈 응답 회복 불가`);
          throw new Error(buildGeminiEmptyResponseUserMessage(modelName));
        }

        const errMsg = (error as Error).message || String(error);
        const errMsgLower = errMsg.toLowerCase();
        lastError = error as Error;
        const isQuota = errMsgLower.includes('429') || errMsgLower.includes('quota') || errMsgLower.includes('too many requests') || errMsgLower.includes('resource exhausted');
        const isLimitZero = errMsgLower.includes('limit: 0') || errMsgLower.includes('free_tier');
        const isServerError = errMsgLower.includes('503') || errMsgLower.includes('500') || errMsgLower.includes('internal') || errMsgLower.includes('unavailable') || errMsgLower.includes('overloaded');

        const billingBlockKind = classifyGeminiBillingBlock(error);
        if (billingBlockKind !== 'none') {
          const nextKey = getNextKey();
          if (nextKey) {
            console.warn(`💳 [Gemini] 현재 키 결제 상태 사용 불가(${billingBlockKind}) → 다음 Gemini 키로 즉시 전환`);
            trimmedKey = nextKey;
            continue;
          }
          throw new Error(buildGeminiBillingBlockMessage(billingBlockKind, modelName));
        }

        // ✅ [v1.4.64] limit:0 = 이 모델의 무료 사용이 Google에 의해 차단됨
        //   다른 모델로 몰래 전환하지 않고, 사용자에게 명확히 안내
        if (isQuota && isLimitZero) {
          console.error(`❌ [Gemini] ${modelName} 무료 할당량 0 — 사용자 안내 후 중단`);
          throw new Error(
            `🚫 [${modelName}] 이 모델은 현재 무료 사용이 차단되었습니다.\n\n` +
            `📌 원인: Google이 이 모델의 무료 API 호출을 일시적으로 차단했습니다.\n\n` +
            `💡 해결 방법:\n` +
            `  1) Google AI Studio(aistudio.google.com) → 요금제에서 신용카드를 등록하고 유료(Pay-as-you-go)로 전환하세요.\n` +
            `     → 유료 전환 시 분당/일일 한도가 대폭 상향됩니다.\n` +
            `  2) 다른 무료 모델을 사용하려면 설정 → AI 엔진에서 모델을 변경하세요.\n` +
            `  3) 다른 Google AI Studio 프로젝트의 무료 키를 보조 키로 등록하면 무료 한도를 먼저 분산 사용할 수 있습니다.\n` +
            `     단, 같은 프로젝트에서 키만 여러 개 만들면 한도는 늘어나지 않습니다.\n\n` +
            `⚠️ 참고: ${formatGeminiFreeTierSummary()}`
          );
        }

        // ✅ [v1.4.49] 429 RPD 감지 — 일일 한도 소진 시 재시도 무의미
        //   GenerateRequestsPerDayPerProjectPerModel 또는 retry in N(N > 5분)이면 RPD
        const isDailyQuotaExhausted = isQuota && (
          errMsg.includes('GenerateRequestsPerDayPerProjectPerModel') ||
          errMsg.includes('PerDay') ||
          // retry in 힌트가 5분(300초) 이상이면 RPD 소진으로 판단
          (() => {
            const m = errMsg.match(/retry in ([\d.]+)s/i);
            return m ? parseFloat(m[1]) >= 300 : false;
          })()
        );
        if (isDailyQuotaExhausted) {
          console.error(`❌ [Gemini] ${modelName} 일일 무료 할당량 소진 → 재시도 무의미`);
          // 다른 키가 있으면 키 로테이션 시도
          const nextKey = getNextKey();
          if (nextKey) {
            console.log(`🔑 [Gemini] 일일 한도 소진 → 다음 키로 전환`);
            trimmedKey = nextKey;
            continue;
          }
          // ✅ [v1.4.64] 무료/유료 계정 구분하여 안내
          const dailyLimit = getGeminiFreeTierDailyLimit(modelName);
          throw new Error(
            `⏳ [${modelName}] 오늘의 무료 할당량(${dailyLimit}회/일)을 모두 사용했습니다.\n\n` +
            `📌 현재 모드: ${geminiPlanLabel}\n\n` +
            (isPaidPlan
              ? `💡 유료 계정인데 한도 초과가 발생했다면:\n` +
                `  → Google AI Studio에서 분당/일일 요청 한도를 확인하세요.\n` +
                `  → 한도 상향 요청이 필요할 수 있습니다.\n`
              : config?.geminiPlanType === 'auto'
                ? `💡 해결 방법:\n` +
                  `  1) 다른 Google AI Studio 프로젝트의 보조 키를 추가하면 프로젝트별 한도를 분산할 수 있습니다.\n` +
                  `  2) 같은 프로젝트에서 키만 여러 개 만들면 한도는 늘어나지 않습니다.\n` +
                  `  3) 모든 보조 키가 소진되면 내일 자정(태평양 시간) 이후 자동 초기화됩니다.\n`
              : `💡 해결 방법:\n` +
                `  1) 내일 자정(태평양 시간) 이후 자동 초기화됩니다.\n` +
                `  2) Google AI Studio → 요금제에서 신용카드 등록 후 유료 전환하세요.\n` +
                `     → 유료 전환 시 한도가 수천 회/일로 대폭 상향됩니다.\n` +
                `  3) 다른 Google AI Studio 프로젝트의 키를 추가하면 프로젝트별 한도를 분산할 수 있습니다.\n` +
                `     단, 같은 프로젝트에서 키만 여러 개 만들면 한도는 늘어나지 않습니다.\n`
            ) +
            `\n⚠️ 참고: ${formatGeminiFreeTierSummary()}`
          );
        }

        // ✅ [v1.4.44] 429 RPM 제한 → 키 로테이션 시도 → patient wait 재시도
        if (isQuota) {
          // 다른 키가 있으면 먼저 키 교체 시도 (대기 없이 즉시)
          const nextKey = getNextKey();
          if (nextKey) {
            console.log(`🔑 [Gemini] 키 로테이션: ${trimmedKey.substring(0, 10)}... → ${nextKey.substring(0, 10)}...`);
            trimmedKey = nextKey;
            continue; // 대기 없이 즉시 재시도
          }

          // RPM/TPM은 결제 부족이 아니라 시간창 제한이다. Google retry hint를 존중해
          // 같은 Gemini 모델로 patient wait 한다. 다른 엔진/모델로 전환하지 않는다.
          const fallbackWaitMs = Math.min(
            GEMINI_RATE_LIMIT_MIN_WAIT_MS + (geminiRateLimitRetryCount * 30_000),
            GEMINI_RATE_LIMIT_MAX_SINGLE_WAIT_MS,
          );
          const waitMs = getGeminiRateLimitWaitMs(error, fallbackWaitMs);
          const waitSec = Math.round(waitMs / 1000);

          if (geminiRateLimitWaitedMs + waitMs <= geminiRateLimitPatienceMs) {
            geminiRateLimitRetryCount++;
            geminiRateLimitWaitedMs += waitMs;
            recordGeminiRateLimitBackoff(modelName, config, waitMs);
            const logMsg =
              `⏳ Gemini 분당/토큰 요청 한도 대기 — ${waitSec}초 후 같은 모델로 자동 재시도합니다. ` +
              `(누적 ${formatWaitDurationKo(geminiRateLimitWaitedMs)}/${formatWaitBudgetKo(geminiRateLimitPatienceMs)}, 자동 엔진 전환 없음)`;
            console.warn(`[Gemini] ${logMsg}`);
            if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
              (window as any).appendLog(logMsg);
            }
            await sleepWithAbort(waitMs, options.signal);
            // 키 인덱스 리셋 (로테이션 재시작)
            currentKeyIdx = 0; trimmedKey = allApiKeys[0];
            continue;
          }

          // patient wait 예산을 다 쓴 경우에만 구체적 안내
          throw new Error(
            `⚡ [${modelName}] 분당/토큰 요청 한도(RPM/TPM)가 ${formatWaitDurationKo(geminiRateLimitWaitedMs)} 동안 풀리지 않았습니다.\n\n` +
            `📌 원인: ${config?.geminiPlanType === 'auto' ? '자동 모드에서 현재 프로젝트의 분당/토큰 한도 초과' : isPaidPlan ? '후불 계정이어도 프로젝트·모델별 RPM/TPM 제한 초과' : '무료 플랜의 낮은 분당 요청 한도 초과'}입니다.\n\n` +
            `💡 해결 방법:\n` +
            `  1) 앱은 같은 Gemini 모델로 자동 대기했지만 아직 Google 제한이 풀리지 않았습니다.\n` +
            `  2) 연속 발행 간격을 더 늘리거나 잠시 후 다시 실행하세요.\n` +
            (isPaidPlan
              ? `  3) Google AI Studio의 Rate limits 화면에서 이 프로젝트의 ${modelName} RPM/TPM을 확인하고 상향을 요청하세요.\n`
              : config?.geminiPlanType === 'auto'
                ? `  3) 보조 키 풀에 다른 프로젝트 키를 추가하면 앱이 다음 키로 자동 전환합니다.\n`
              : `  3) 유료 전환 시 프로젝트 사용량 등급에 따라 분당/일일 한도가 상향됩니다.\n`
            )
          );
        }

        // ✅ [v1.4.64] 503/500 서버 에러 → 지수 백오프 최대 3회 (약 21초)
        if (isServerError) {
          modelRetryCount++;
          if (modelRetryCount < perModelMaxRetries) {
            const baseMs = 3000;
            const expMs = Math.min(baseMs * Math.pow(2, modelRetryCount - 1), 30000);
            const jitterMs = Math.floor(Math.random() * 1000);
            const waitMs = expMs + jitterMs;
            // [2026-06-07 사용자 요청] Gemini 서버 상태 공지 UI 안내 비표시.
            //   재시도는 그대로 진행하되 사용자 UI 로그에는 노출하지 않음 (서버 안정화로 안내 빈도 감소).
            //   디버그용 console.warn은 유지 — 로그 분석 시 추적 가능.
            const logMsg = `🔧 Gemini 응답 오류 — ${Math.round(waitMs/1000)}초 후 재시도합니다. (${modelRetryCount}/${perModelMaxRetries})`;
            console.warn(`[Gemini] ${logMsg}`);
            await sleepWithAbort(waitMs, options.signal);
            continue;
          }
          throw new Error(
            `🔧 [${modelName}] Gemini 응답을 받지 못했습니다. (503/500)\n\n` +
            `💡 해결 방법:\n` +
            `  1) 잠시 후 다시 시도하세요.\n` +
            `  2) 계속 발생하면 API 키와 사용량 한도를 확인하세요.\n` +
            `  3) 급한 작업은 설정에서 다른 AI 엔진(Claude/OpenAI)으로 변경하세요.`
          );
        }

        // ✅ [v1.4.64] 404 모델 없음 → 다른 모델로 전환하지 않고 명확히 안내
        if (errMsg.includes('404') || errMsg.includes('not found')) {
          throw new Error(
            `❌ [${modelName}] 이 모델을 찾을 수 없습니다.\n\n` +
            `📌 원인: Google이 이 모델을 중단했거나, 모델명이 변경되었습니다.\n\n` +
            `💡 해결 방법:\n` +
            `  → 설정 → AI 엔진에서 다른 모델(Flash, Flash-Lite)을 선택하세요.`
          );
        }

        // 기타 오류 → 재시도 1회 후 실패
        modelRetryCount++;
        if (modelRetryCount < 2) {
          // ✅ [2026-04-18] 100자 → 500자 확장 — HTTP 상태코드/사유 가려지는 문제 해소
          console.warn(`[Gemini] ${modelName} 오류: ${errMsg.substring(0, 500)} → 5초 후 재시도`);
          await sleepWithAbort(5000, options.signal);
          continue;
        }
        console.warn(`[Gemini] ${modelName} 오류: ${errMsg.substring(0, 500)}`);
        break;
      }
    }
  }

  const finalError = lastError || new Error('알 수 없는 오류');
  // callGemini 내에서 이미 구체적 에러 메시지로 throw한 경우 그대로 전달
  const finalMsg = finalError.message;
  if (finalMsg.includes('📌 원인') || finalMsg.includes('💡 해결')) {
    throw finalError; // already user-friendly
  }
  throw new Error(translateGeminiError(finalMsg));
}

// ✅ [2026-01-25] callOpenAI 함수 제거됨 - Perplexity로 대체
// 이전: ~185줄의 OpenAI API 호출 코드
// 현재: callPerplexity 함수가 perplexity.ts 모듈을 사용






// ✅ [2026-02-22 FIX] Perplexity API 직접 호출 (이중 프롬프트 래핑 버그 수정)
// 기존 문제: generatePerplexityContent() → buildEnhancedPrompt()가 이미 완성된 시스템 프롬프트를
// "주제"로 다시 감싸는 이중 래핑 → Perplexity가 자유형식 텍스트 반환 → JSON 파싱 실패
// 수정: callGemini/callOpenAI와 동일하게 프롬프트를 직접 API에 전달
async function callPerplexity(prompt: string, temperature: number = 0.7, minChars: number = 2000, signal?: AbortSignal): Promise<string> {
  console.log('[Perplexity] 콘텐츠 생성 시작 (직접 API 호출)');

  // 1. API 키 로드 (config 우선, env 폴백)
  let apiKey: string | undefined;
  try {
    const { loadConfig } = await import('./configManager.js');
    const config = await loadConfig();
    // ✅ [2026-03-30 DEBUG] API 키 로드 상태 진단 로그
    console.log('[Perplexity] Config 로드 결과:', {
      hasConfig: !!config,
      configKeys: config ? Object.keys(config).filter(k => k.toLowerCase().includes('perplexity')) : [],
      perplexityApiKey: config?.perplexityApiKey ? `${config.perplexityApiKey.substring(0, 8)}...` : '(없음)',
      envKey: process.env.PERPLEXITY_API_KEY ? `${process.env.PERPLEXITY_API_KEY.substring(0, 8)}...` : '(없음)',
    });
    const configKey = config?.perplexityApiKey?.trim() || '';
    const envKey = process.env.PERPLEXITY_API_KEY?.trim() || '';
    if (isMaskedSecretValue(configKey) && !envKey) {
      throw new Error('Perplexity API 키가 실제 키가 아니라 마스킹된 표시값으로 저장되어 있습니다. 환경설정에서 Perplexity 실제 API 키를 다시 입력해주세요.');
    }
    apiKey = (!isMaskedSecretValue(configKey) ? configKey : '') || (!isMaskedSecretValue(envKey) ? envKey : undefined);
    if (!apiKey && (isMaskedSecretValue(configKey) || isMaskedSecretValue(envKey))) {
      throw new Error('Perplexity API 키가 실제 키가 아니라 마스킹된 표시값으로 저장되어 있습니다. 환경설정에서 Perplexity 실제 API 키를 다시 입력해주세요.');
    }
  } catch (e) {
    console.warn('[Perplexity] Config 로드 실패 (env 폴백 사용):', e);
    apiKey = process.env.PERPLEXITY_API_KEY;
  }

  if (!apiKey) {
    console.error('[Perplexity] ❌ API 키를 찾을 수 없습니다. config와 env 모두 비어있음.');
    throw new Error('Perplexity API 키가 설정되지 않았습니다. 환경설정(⚙️)에서 Perplexity API 키를 입력해주세요. (Perplexity 웹 구독과 API 키는 별도입니다. https://www.perplexity.ai/settings/api 에서 API 키를 발급받으세요)');
  }
  console.log(`[Perplexity] ✅ API 키 확인됨: *** (길이: ${apiKey.length})`);


  // 2. 모델 및 타임아웃 설정
  // ✅ [2026-03-20 FIX] config에서 직접 읽기 (env보다 config 우선 — 이중 안전장치)
  let modelName = 'sonar';
  try {
    const { loadConfig } = await import('./configManager.js');
    const cfg = await loadConfig();
    modelName = cfg.perplexityModel || process.env.PERPLEXITY_MODEL || 'sonar';
  } catch {
    modelName = process.env.PERPLEXITY_MODEL || 'sonar';
  }
  const timeoutMs = getTimeoutMs(minChars);
  const maxAttempts = 99;
  const maxTransientRetries = 5;
  const rateLimitPatienceMs = getPerplexityRateLimitPatienceMs();
  let rateLimitWaitedMs = 0;
  let rateLimitRetryCount = 0;
  let transientRetryCount = 0;
  let lastError: Error | null = null;

  // ✅ [2026-03-16] promptSplitter 모듈로 system/user 분리 (인라인 50줄 코드 제거)
  // 키워드/원문 모드 자동 판별은 adjustForPerplexity()에서 처리
  const baseSplit = splitPromptByMarker(prompt);
  const { system: systemMessageRaw, user: userMessage } = adjustForPerplexity(baseSplit);

  // ✅ [v2.10.171] Perplexity Sonar 톤 보정 — 사용자 보고 "점수 낮고 너무 딱딱"
  //   원인: Sonar는 검색-회상 모델이라 AI 보고체("알아보겠습니다", "살펴보겠습니다") 빈번 사용 →
  //         analyzeNaverScore originality 페널티 + 인간적 표현 부족
  //   해결: system 프롬프트 prefix에 AI 보고체 금지 + 인간적 표현 권장 명시
  const perplexityToneGuide = `[Perplexity 작성 톤 가이드 — 절대 준수]
1. AI 보고체 절대 금지: "알아보겠습니다", "살펴보겠습니다", "시작하겠습니다", "마치겠습니다", "도움이 되셨으면" 등 *대화 진행 안내 문장* 일체 사용 금지.
2. 검색 인용 톤 금지: "~에 따르면", "출처에 의하면", "최근 보도에 따르면" 같은 *기사체 인용 표현* 사용 금지. 자연스러운 설명체로 풀어 쓰되, 기사 문장을 그대로 베껴 적지 마라.
3. 인간적 표현은 개수를 맞추지 않는다. 구체적인 맥락·판단 이유·예외로 자연스럽게 쓰고, "솔직히/막상/사실은" 같은 상투어를 반복하지 않는다.
4. 문장 길이: 평균 30~70자 한 문장. 한 호흡으로 읽히는 짧고 부드러운 흐름. 문단당 3~5문장.
5. 사실 그라운딩 (최우선): 검색 결과·원본 자료에 없는 수치·비율·통계·처리 기간·성공률·날짜는 절대 만들어내지 마라. 확인되지 않으면 "공식 안내 기준으로 확인이 필요하다"처럼 정직하게 처리하고, "보장됩니다" 같은 단정 표현은 금지. 직접 경험하지 않은 일을 경험한 것처럼 쓰지 마라.

`;
  const systemMessage = perplexityToneGuide + systemMessageRaw;

  // ✅ [v2.10.171] Sonar 전용 temperature 보정 — Gemini 0.5 동등 결과 위해 +0.25 boost
  //   이유: Sonar는 검색 인용 모드라 동일 temperature에서 Gemini 대비 stiff
  //   SEO 0.5 → 0.75, homefeed 0.7 → 0.9 (clamp [0.5, 1.0])
  const sonarTemperature = modelName.includes('sonar')
    ? Math.min(1.0, Math.max(0.5, temperature + 0.25))
    : temperature;
  if (sonarTemperature !== temperature) {
    console.log(`[Perplexity] 🔥 Sonar temperature 보정: ${temperature} → ${sonarTemperature}`);
  }

  // ✅ [v2.10.171] search_recency_filter 조건부 — 원문 모드는 검색 비활성화 (stiff 톤 차단)
  //   원문 모드(user > 500자): rawText가 fact source → 외부 검색 인용 톤 불필요
  //   키워드 모드(user <= 500자): 검색 활용 가치 있음 → recency 유지
  const isKeywordMode = userMessage.length <= 500;
  console.log(`[Perplexity] 메시지 분리: system=${systemMessage.length}자, user=${userMessage.length}자 (${isKeywordMode ? '키워드' : '원문'} 모드)`);

  for (let retry = 0; retry < maxAttempts; retry++) {
    try {
      console.log(`[Perplexity] 시도 ${retry + 1}: 모델 ${modelName}, 타임아웃 ${timeoutMs / 1000}초, 한도 대기 누적 ${Math.round(rateLimitWaitedMs / 1000)}초`);

      const OpenAI = (await import('openai')).default;
      const client = new OpenAI({
        apiKey: apiKey.trim(),
        baseURL: 'https://api.perplexity.ai',
      });

      await throttleProviderRequest('Perplexity', modelName, getPerplexityMinIntervalMs(modelName), signal);

      // ✅ [2026-02-23 FIX] system + user 메시지 분리로 Perplexity 거부 방지
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ];

      // ✅ [v2.10.28] Perplexity SDK signal 전달 — 사용자 취소 시 fetch 즉시 abort
      // ✅ [v2.10.171] Sonar temperature boost + recency 조건부 + top_p 0.9 추가 (다양성)
      const createPromise = client.chat.completions.create({
        model: modelName,
        messages: messages,
        temperature: sonarTemperature,
        max_tokens: 8192,
        ...(modelName.includes('sonar') ? {
          top_p: 0.9,  // 다양한 어휘 선택 — stiff 톤 완화
          ...(isKeywordMode ? { search_recency_filter: 'month' } : {}),  // 키워드 모드만 검색 활용
        } : {}),
      } as any, signal ? { signal } as any : undefined);

      const response = await withProviderTimeout(
        createPromise,
        timeoutMs,
        `Perplexity API 호출 시간 초과 (${timeoutMs / 1000}초)`,
        signal,
      );
      const text = response.choices[0]?.message?.content?.trim() || '';

      if (!text) {
        throw new Error('Perplexity API 빈 응답');
      }

      // ✅ [2026-03-19] 사용량 추적
      const pplxUsage = (response as any).usage;
      trackApiUsage('perplexity', {
        inputTokens: pplxUsage?.prompt_tokens || 0,
        outputTokens: pplxUsage?.completion_tokens || 0,
        model: modelName,
      });

      console.log(`[Perplexity] ✅ 생성 완료: ${modelName} (시도 ${retry + 1}), ${text.length}자`);
      return text;

    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message?.toLowerCase() || '';
      const errorStr = safeStringifyError(error).toLowerCase();
      const status = (error as any)?.status || (error as any)?.response?.status;

      console.error(`[Perplexity] ⚠️ 시도 ${retry + 1} 실패: ${lastError.message}`);

      // API 키 오류는 즉시 중단
      if (errorMessage.includes('api key') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
        throw new Error(translatePerplexityError(lastError));
      }

      const isHardBillingError =
        errorMessage.includes('insufficient') ||
        errorMessage.includes('credits') ||
        errorMessage.includes('credit balance') ||
        errorMessage.includes('payment') ||
        errorMessage.includes('billing') ||
        errorStr.includes('insufficient') ||
        errorStr.includes('credits');
      if (isHardBillingError && !errorMessage.includes('429')) {
        throw new Error(translatePerplexityError(lastError));
      }

      const isRateLimit =
        status === 429 ||
        errorMessage.includes('429') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests');
      if (isRateLimit) {
        const fallbackWaitMs = Math.min(10_000 * Math.pow(1.5, rateLimitRetryCount), 90_000);
        const waitMs = getPerplexityRateLimitWaitMs(error, fallbackWaitMs);
        const nextWaitedMs = rateLimitWaitedMs + waitMs;

        if (nextWaitedMs <= rateLimitPatienceMs) {
          rateLimitRetryCount++;
          rateLimitWaitedMs = nextWaitedMs;
          recordProviderRateLimitBackoff('Perplexity', modelName, waitMs);
          const logMsg =
            `⏳ [Perplexity ${modelName}] 요청 한도 대기 — ${Math.round(waitMs / 1000)}초 후 같은 모델로 자동 재시도 ` +
            `(누적 ${formatWaitDurationKo(rateLimitWaitedMs)}/${formatWaitBudgetKo(rateLimitPatienceMs)}, 자동 폴백 없음)`;
          console.warn(logMsg);
          if (typeof (globalThis as any).window !== 'undefined' && typeof (globalThis as any).window.appendLog === 'function') {
            (globalThis as any).window.appendLog(logMsg);
          }
          await sleepWithAbort(waitMs, signal);
          continue;
        }

        throw new Error(
          `Perplexity API 요청 한도(RPM)를 초과했습니다. 앱이 같은 모델로 ${formatWaitDurationKo(rateLimitWaitedMs)} 대기했지만 아직 제한이 풀리지 않았습니다.\n` +
          `원본 오류: ${lastError.message}`
        );
      }

      const isRetryable =
        errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503') ||
        errorMessage.includes('server error') || errorMessage.includes('internal') ||
        errorMessage.includes('timeout') || errorMessage.includes('시간 초과') ||
        errorMessage.includes('빈 응답') || errorMessage.includes('empty') ||
        errorMessage.includes('network') || errorMessage.includes('fetch') ||
        errorMessage.includes('econnreset') || errorMessage.includes('econnrefused');
      if (isRetryable && transientRetryCount < maxTransientRetries) {
        const delay = Math.min(2000 * Math.pow(2, transientRetryCount), 30000) + Math.floor(Math.random() * 1000);
        transientRetryCount++;
        console.log(`[Perplexity] 🔄 ${delay}ms 후 재시도...`);
        await sleepWithAbort(delay, signal);
        continue;
      }

      throw new Error(translatePerplexityError(lastError));
    }
  }

  throw new Error(`Perplexity 생성 실패: ${lastError ? translatePerplexityError(lastError) : '원인 불명'}`);
}

// ✅ [2026-01-25] callOpenAI 함수 - 기존 OpenAI API 호출 로직
async function callOpenAI(prompt: string, temperature: number = 0.9, minChars: number = 2000, signal?: AbortSignal): Promise<string> {
  console.log('[OpenAI] JSON 형식 준수 요청 - 유니코드 이스케이프 4자리, 쉼표 필수');

  // ✅ [2026-02-24 FIX] 방어적 설정 로드 (callGemini/callPerplexity 패턴 통일)
  let config: any = null;
  try {
    const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
    config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.warn('[OpenAI] Config 로드 실패 (env 폴백 사용):', e);
  }

  const openAIClients = new Map<string, OpenAI>();
  function getOpenAIClient(apiKey?: string): OpenAI {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API 키가 설정되어 있지 않습니다. 환경설정 → API 키에서 OpenAI 키를 입력해주세요.');
    }
    if (isMaskedSecretValue(key)) {
      throw new Error('OpenAI API 키가 실제 키가 아니라 마스킹된 표시값으로 저장되어 있습니다. 환경설정에서 OpenAI 실제 API 키를 다시 입력해주세요.');
    }
    if (!openAIClients.has(key)) {
      openAIClients.set(key, new OpenAI({
        apiKey: key,
        maxRetries: 0,
        timeout: 120_000,
      }));
    }
    return openAIClients.get(key)!;
  }

  // ✅ [2026-03-23 FIX] config에서 직접 API 키를 가져와 전달 (process.env 폴백)
  // applyConfigToEnv가 빈 문자열일 때 delete process.env.OPENAI_API_KEY 하므로
  // config.openaiApiKey가 있으면 직접 전달해야 확실히 로드됨
  const rawConfigApiKey = config?.openaiApiKey?.trim() || undefined;
  const envOpenAiKey = process.env.OPENAI_API_KEY?.trim() || undefined;
  if (isMaskedSecretValue(rawConfigApiKey) && !envOpenAiKey) {
    throw new Error(
      'OpenAI API 키가 실제 키가 아니라 마스킹된 표시값으로 저장되어 있습니다. 환경설정에서 OpenAI 실제 API 키를 다시 입력해주세요.'
    );
  }
  const configApiKey = !isMaskedSecretValue(rawConfigApiKey) ? rawConfigApiKey : undefined;
  if (configApiKey) {
    console.log(`[OpenAI] ✅ config에서 직접 API 키 로드됨 (길이: ${configApiKey.length})`);
  } else {
    console.log(`[OpenAI] config.openaiApiKey 없음, process.env.OPENAI_API_KEY 폴백 (${process.env.OPENAI_API_KEY ? '있음' : '없음'})`);
  }
  const directOpenAiApiKey = configApiKey || envOpenAiKey;
  if (!directOpenAiApiKey) {
    throw new Error('OpenAI API 키가 설정되어 있지 않습니다. 환경설정 → API 키에서 OpenAI 키를 입력해주세요.');
  }
  if (isMaskedSecretValue(directOpenAiApiKey)) {
    throw new Error('OpenAI API 키가 실제 키가 아니라 마스킹된 표시값으로 저장되어 있습니다. 환경설정에서 OpenAI 실제 API 키를 다시 입력해주세요.');
  }
  const client = getOpenAIClient(configApiKey);
  const diagnosticsEnabled = isOpenAiDiagnosticsEnabled();
  if (diagnosticsEnabled) {
    emitOpenAiDiagnosticLog(
      `CONFIG keySource=${configApiKey ? 'config.openaiApiKey' : 'OPENAI_API_KEY'} keyLength=${directOpenAiApiKey.length} ` +
      `baseUrl=${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')} ` +
      `platform=${process.platform}/${process.arch}`,
    );
  }

  // ✅ [v1.4.77] UI 선택 모델 = 실제 호출 모델 1:1. 크로스 모델 폴백 없음.
  const uiSelectedModel = config?.primaryGeminiTextModel || '';
  let openAIModels: string[];
  if (uiSelectedModel === 'openai-gpt4o-mini') {
    openAIModels = ['gpt-4.1-mini'];
    console.log('[OpenAI] 🧠 GPT-4.1 mini — 폴백 없음');
  } else if (uiSelectedModel === 'openai-gpt41') {
    openAIModels = ['gpt-4.1'];
    console.log('[OpenAI] ⚖️ GPT-4.1 — 폴백 없음');
  } else if (uiSelectedModel === 'openai-gpt4o') {
    openAIModels = ['gpt-4o'];
    console.log('[OpenAI] 🚀 GPT-4o — 폴백 없음');
  } else if (uiSelectedModel === 'openai-gpt4o-search') {
    // [2026-05-28 M3 P2] SPEC-MIGRATION-2026 — web search grounding for OpenAI.
    //   gpt-4o-search-preview is the only OpenAI text model that supports
    //   web_search_options today. Response is plain text (no json_object),
    //   so downstream parser must accept text fallback.
    openAIModels = ['gpt-4o-search-preview'];
    console.log('[OpenAI] 🔎 GPT-4o Search Preview — Web grounding ON');
  } else {
    openAIModels = ['gpt-4.1'];
    console.log('[OpenAI] ⚖️ GPT-4.1 (기본) — 폴백 없음');
  }
  const useOpenAIGrounding = uiSelectedModel === 'openai-gpt4o-search';

  const customModel = process.env.OPENAI_STRUCTURED_MODEL;
  const modelsToTry = customModel ? [customModel] : openAIModels;

  let lastError: Error | null = null;
  const timeoutMs = getTimeoutMs(minChars);
  const maxCompletionTokens = getOpenAiMaxCompletionTokens(minChars);
  const maxAttemptsPerModel = 99;
  const maxTransientRetriesPerModel = 0;
  const openAiRateLimitPatienceMs = getOpenAiRateLimitPatienceMs();

  for (const modelName of modelsToTry) {
    let rateLimitWaitedMs = 0;
    let rateLimitRetryCount = 0;
    let transientRetryCount = 0;
    let preflightDone = false;

    for (let retry = 0; retry < maxAttemptsPerModel; retry++) {
      try {
        console.log(`[OpenAI] 시도: ${modelName} (${retry + 1}), 타임아웃: ${timeoutMs / 1000}초, 한도 대기 누적: ${Math.round(rateLimitWaitedMs / 1000)}초`);

        if (diagnosticsEnabled && !preflightDone) {
          await runOpenAiDiagnosticPreflight(directOpenAiApiKey, modelName, timeoutMs, signal);
          preflightDone = true;
        }

        // ✅ [2026-05-25 v2.10.356] preemptive throttling — RPM 한도 도달 직전이면 호출자 측에서 대기
        //   사용자 보고 "OpenAI 60s backoff 후에도 RPM 초과 자꾸 뜸" 근본 차단
        // ✅ [2026-06-02] 호출 간 최소 간격(기본 10s) 강제 — 글 1편당 다수 호출 burst를 직렬 분산.
        //   타임아웃 타이머 생성 전에 대기해야 간격 대기가 API 타임아웃 예산을 깎지 않는다.
        await openaiRpmThrottler.throttle(getOpenAiMinIntervalMs(modelName, maxCompletionTokens), signal);

        // ✅ [2026-03-16] system/user 분리: AI 규칙 인식률 향상
        const { system: oaiSystem, user: oaiUser } = splitPromptByMarker(prompt);

        // ✅ [v2.10.28] OpenAI SDK signal 전달 — 사용자 취소 시 fetch 즉시 abort
        // [2026-05-28 M3 P2] search-preview 모델 분기: web_search_options ON,
        //   response_format/json_object/temperature/top_p 미지원 → 평문 + 파서 fallback.
        const isSearchPreview = modelName.includes('search-preview');
        const baseParams: any = {
          model: modelName,
          messages: [
            ...(oaiSystem ? [{ role: 'system' as const, content: oaiSystem }] : []),
            { role: 'user' as const, content: oaiUser },
          ],
          max_completion_tokens: maxCompletionTokens,
        };
        if (isSearchPreview) {
          baseParams.web_search_options = {};
        } else {
          baseParams.temperature = temperature;
          baseParams.top_p = 0.9;
          baseParams.response_format = { type: 'json_object' };
        }
        let response: any;
        try {
          response = await callOpenAIChatCompletionsRest(directOpenAiApiKey, baseParams, timeoutMs, signal, diagnosticsEnabled);
        } catch (restError) {
          const restMessage = normalizeErrorMessage(restError).toLowerCase();
          if (!restMessage.includes('fetch api를 사용할 수 없습니다') && !restMessage.includes('fetch api')) {
            throw restError;
          }

          console.warn('[OpenAI] native fetch 사용 불가 → SDK 보조 경로로 동일 모델 1회 호출');
          const timeoutLabel = `OpenAI API 호출 시간 초과 (${timeoutMs / 1000}초)`;
          const requestAbort = createProviderTimeoutSignal(timeoutMs, timeoutLabel, signal);
          try {
            const createPromise = client.chat.completions.create(
              baseParams,
              {
                signal: requestAbort.signal,
                timeout: timeoutMs,
                maxRetries: 0,
              } as any,
            );

            response = await withProviderTimeout(
              createPromise,
              timeoutMs,
              timeoutLabel,
              signal,
            );
          } catch (requestError) {
            throw requestAbort.normalizeError(requestError);
          } finally {
            requestAbort.dispose();
          }
        }
        // ✅ [2026-05-25 v2.10.356] 호출 성공 기록 — RPM 적응형 가속에 활용
        openaiRpmThrottler.recordCall();
        const text = response.choices[0]?.message?.content?.trim() || '';

        if (!text) throw new Error('빈 응답');

        // ✅ [2026-03-19] 사용량 추적
        const oaiUsage = (response as any).usage;
        trackApiUsage('openai', {
          inputTokens: oaiUsage?.prompt_tokens || 0,
          outputTokens: oaiUsage?.completion_tokens || 0,
          model: modelName,
        });

        console.log(`[OpenAI] ✅ 성공: ${modelName}, ${text.length}자`);
        console.log(`[OpenAI] 📋 응답 미리보기: ${text.substring(0, 200)}...`);
        return text;

      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error).message?.toLowerCase() || '';
        const errorStr = safeStringifyError(error).toLowerCase();

        // ✅ [2026-02-24 FIX] 에러 분류: 즉시 실패 vs 재시도 가능 vs 다음 모델

        // 1) 인증 오류 → 즉시 throw (재시도 무의미)
        const isAuthError = errorMessage.includes('401') || errorMessage.includes('403') ||
          errorMessage.includes('unauthorized') || errorMessage.includes('forbidden') ||
          errorMessage.includes('invalid api key') || errorMessage.includes('invalid_api_key');
        if (isAuthError) {
          throw new Error(`OpenAI API 키가 유효하지 않습니다. 환경설정에서 API 키를 확인해주세요.\n원본 오류: ${(error as Error).message}`);
        }

        // 2) 결제/크레딧 오류 → 진짜 billing hard limit만 즉시 throw
        // ✅ [2026-04-09 FIX] 429 rate limit의 'quota' 키워드를 billing으로 오판하던 버그 수정
        // OpenAI 429 에러: "You exceeded your current quota" → 일시적 rate limit일 수 있음
        // 진짜 billing 에러: billing_hard_limit_reached, insufficient_quota (영구적)
        const isHardBillingError = errorStr.includes('billing_hard_limit_reached') ||
          errorMessage.includes('insufficient_quota') ||
          (errorMessage.includes('billing') && !errorMessage.includes('429')) ||
          (errorMessage.includes('payment') && errorMessage.includes('required'));
        if (isHardBillingError) {
          throw new Error(`OpenAI API 결제 한도에 도달했습니다. OpenAI 대시보드에서 결제 정보를 확인해주세요.\n원본 오류: ${(error as Error).message}`);
        }

        // 3) 모델 없음 → 다음 모델로 즉시 이동 (재시도 불필요)
        const isModelNotFound = errorMessage.includes('model') &&
          (errorMessage.includes('not found') || errorMessage.includes('does not exist'));
        if (isModelNotFound) {
          console.log(`[OpenAI] ⚠️ 모델 ${modelName} 없음, 다음 모델 시도`);
          break; // 이 모델의 재시도 루프 탈출 → 다음 모델
        }

        // ✅ [v2.7.94] 429/quota/rate-limit → 명확한 안내 후 throw (자동 폴백 금지)
        //   사용자 지시: "다른걸로 폴백되면 그모델로하지 뭐하러 모델을 선택해서 하겠니"
        //   기존(v2.7.93까지): break로 다음 모델 자동 전환 → 사용자 선택 무시
        //   수정: throw로 명확한 원인 + 해결 방법 안내
        const isQuotaOrRateLimit = isOpenAiRateLimitError(error, errorMessage);
        if (isQuotaOrRateLimit) {
          // ✅ RPM 한도는 1분 단위로 복구 → 같은 모델 유지 + 누진 backoff retry
          //   v2.10.355까지: 60s 1회 retry → 사용자 보고 "재시도 후에도 실패"
          //   v2.10.356: 60→90→120 시퀀스 작성했으나 maxRetries=2라 실제론 1회만 발동(버그)
          //   v2.11.x [2026-06-02]: 30s → 60s → 90s → 120s 누진 4회 실제 발동 (maxRetries 동기화)
          //   모델 변경 아니라 [[feedback_no_fallback]] 룰과 충돌 없음.
          // ✅ [2026-06-06] OpenAI 선택 존중 + patient mode:
          //   RPM/TPM은 사용자가 돈으로 올리기보다 기다리길 원하는 경우가 많다.
          //   4회 고정 retry 후 실패하지 않고, reset/retry-after 힌트를 반영해 12분까지 같은 모델로 대기한다.
          const isHardQuota = isOpenAiHardQuotaError(error, errorMessage);
          if (!isHardQuota) {
            const fallbackBackoffMs = getQuotaBackoffMs(rateLimitRetryCount);
            const backoffMs = getOpenAiRateLimitWaitMs(error, fallbackBackoffMs);
            const nextWaitedMs = rateLimitWaitedMs + backoffMs;
            openaiRpmThrottler.record429(backoffMs);

            if (nextWaitedMs <= openAiRateLimitPatienceMs) {
              rateLimitRetryCount++;
              const logMsg =
                `⏳ [OpenAI ${modelName}] 요청/토큰 한도 대기 — ${Math.round(backoffMs / 1000)}초 후 같은 모델로 자동 재시도 ` +
                `(누적 ${formatWaitDurationKo(nextWaitedMs)}/${formatWaitBudgetKo(openAiRateLimitPatienceMs)} 허용, 자동 폴백 없음)`;
              console.warn(logMsg);
              if (typeof (globalThis as any).window !== 'undefined' && typeof (globalThis as any).window.appendLog === 'function') {
                (globalThis as any).window.appendLog(logMsg);
              }
              await sleepWithAbort(backoffMs, signal);
              rateLimitWaitedMs = nextWaitedMs;
              continue; // 같은 모델 재시도
            }
          }

          console.error(`[OpenAI] ❌ ${modelName} 할당량/속도 제한 — patient wait exhausted or hard quota`);
          throw new Error(
            `🚫 [OpenAI ${modelName}] API 한도를 초과했습니다.\n\n` +
            `📌 원인: ${isHardQuota ? '월간 결제/크레딧 한도 소진' : `요청/토큰 한도(RPM/TPM) 초과 — 앱이 약 ${formatWaitDurationKo(rateLimitWaitedMs)} 대기했지만 아직 풀리지 않음`}\n\n` +
            `💡 해결 방법:\n` +
            `  1) 그대로 다시 누르면 앱이 같은 모델로 천천히 대기하며 재시도합니다.\n` +
            `  2) 한도가 자주 걸리면 환경변수 OPENAI_MIN_INTERVAL_MS를 더 크게 설정하거나 잠시 후 실행하세요.\n` +
            `  3) 결제/크레딧 문제라면 platform.openai.com → Billing에서 월 한도·잔액을 확인하세요.\n\n` +
            `⚠️ 자동으로 다른 모델로 전환하지 않습니다 (사용자가 선택한 모델 존중).`
          );
        }

        // 5) 서버/네트워크 에러 → 대기 후 재시도
        const isConnectionIssue = isOpenAiConnectionIssue(error, errorMessage);
        const isRetryable =
          errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503') ||
          errorMessage.includes('server error') || errorMessage.includes('internal error') ||
          errorMessage.includes('시간 초과') || errorMessage.includes('timeout') ||
          errorMessage.includes('빈 응답') || errorMessage.includes('empty') ||
          errorMessage.includes('network') || errorMessage.includes('fetch') ||
          errorMessage.includes('econnreset') || errorMessage.includes('econnrefused') ||
          isConnectionIssue;

        if (isRetryable) {
          const retryKind = isConnectionIssue ? '연결 오류' : '일시 오류';
          console.log(`[OpenAI] ⚠️ ${modelName} ${retryKind} (${transientRetryCount + 1}/${maxTransientRetriesPerModel + 1}): ${(error as Error).message}`);
          if (transientRetryCount < maxTransientRetriesPerModel) {
            const delay = Math.min(5000 * Math.pow(2, transientRetryCount), 30000) + Math.floor(Math.random() * 1000);
            transientRetryCount++;
            const retryMsg = `🔌 [OpenAI ${modelName}] ${retryKind} 감지 - ${Math.round(delay / 1000)}초 후 같은 모델로 재시도합니다.`;
            console.log(`[OpenAI] ${retryMsg}`);
            if (typeof (globalThis as any).window !== 'undefined' && typeof (globalThis as any).window.appendLog === 'function') {
              (globalThis as any).window.appendLog(retryMsg);
            }
            await sleepWithAbort(delay, signal);
            continue; // 같은 모델 재시도
          }
          throw new Error(
            `OpenAI API 연결 실패로 같은 모델(${modelName})을 ${maxTransientRetriesPerModel + 1}회 재시도했지만 응답을 받지 못했습니다.\n\n` +
            `📌 원인: 모델 문제가 아니라 PC/네트워크/방화벽/VPN/프록시/OpenAI 접속 경로의 일시적 연결 실패입니다.\n\n` +
            `💡 해결 방법:\n` +
            `  1) 인터넷 연결과 VPN/프록시/방화벽을 확인한 뒤 다시 실행하세요.\n` +
            `  2) 같은 네트워크에서 https://api.openai.com 접속이 막히지 않는지 확인하세요.\n` +
            `  3) 잠시 후 다시 실행하면 앱이 같은 OpenAI 모델로 재시도합니다.\n\n` +
            `원본 오류: ${(error as Error).message}`
          );
        }

        // 5) 알 수 없는 에러 → 다음 모델로 이동 (이전: 즉시 throw)
        console.log(`[OpenAI] ⚠️ ${modelName} 알 수 없는 오류, 다음 모델 시도: ${(error as Error).message}`);
        break;
      }
    }
  }

  if (lastError && isOpenAiConnectionIssue(lastError, lastError.message)) {
    throw new Error(
      `OpenAI API 연결 실패. 시도한 모델: ${modelsToTry.join(', ')}\n` +
      `마지막 오류: ${lastError.message}\n\n` +
      `모델(${modelsToTry.join(', ')})이 없어져서가 아니라 네트워크 연결이 실패한 상태입니다.`
    );
  }

  throw new Error(`OpenAI 모델 사용 불가. 시도한 모델: ${modelsToTry.join(', ')}\n마지막 오류: ${lastError?.message}`);
}


// ✅ [2026-01-25] getAnthropicClient 헬퍼 함수 복원
const anthropicClients = new Map<string, Anthropic>();
function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.CLAUDE_API_KEY;
  if (!key) {
    throw new Error('Claude API 키가 설정되어 있지 않습니다. 환경설정 → API 키에서 Claude 키를 입력해주세요.');
  }
  if (isMaskedSecretValue(key)) {
    throw new Error('Claude API 키가 실제 키가 아니라 마스킹된 표시값으로 저장되어 있습니다. 환경설정에서 Claude 실제 API 키를 다시 입력해주세요.');
  }
  if (!anthropicClients.has(key)) {
    anthropicClients.set(key, new Anthropic({ apiKey: key }));
  }
  return anthropicClients.get(key)!;
}


// ✅ 에이전트 모드 — 사용자 본인 codex/claude 구독 CLI로 글 생성 (API 토큰 과금 0).
//   모든 글생성 모드(SEO/홈피드/쇼핑/사진)가 공유하는 agentCli 서비스를 호출한다(중복 구현 금지).
//   silent 폴백 절대 금지: 미설치/미로그인/한도소진은 AgentCliError 그대로 throw → 차단형 모달.
interface CallAgentOptions {
  signal?: AbortSignal;
  /** Content mode (seo/homefeed/affiliate/photo) — tailors the autonomous self-critique. */
  mode?: string;
  /** When true, send the prompt as-is (no writing envelope). Use for judge/eval calls. */
  raw?: boolean;
}

async function callAgent(
  provider: 'agent-codex' | 'agent-claude',
  prompt: string,
  opts: CallAgentOptions = {},
): Promise<string> {
  const { signal, mode, raw } = opts;
  const { generateWithAgent } = await import('./agentCli/index.js');
  const { wrapAsAgenticTask, AGENTIC_TIMEOUT_MS } = await import('./agentCli/agenticEnvelope.js');
  const { agentTextProviderToCli } = await import('./runtime/modelRegistry.js');
  const cliProvider = agentTextProviderToCli(provider);
  // Activate the CLI's own reasoning loop (analyze -> draft -> self-critique -> revise -> JSON)
  // instead of a one-shot pass. Iteration runs inside one subscription call (API cost 0).
  // Judge/eval calls (raw) skip the writing envelope — they are not content generation.
  const agenticPrompt = raw ? prompt : wrapAsAgenticTask(prompt, mode);
  const modeTag = raw ? 'raw' : (mode || 'generic');
  console.log(`[Agent] 🤖 ${cliProvider} 구독 CLI로 콘텐츠 생성 시작 (자율 반복 모드: ${modeTag}, API 과금 0)`);
  const result = await generateWithAgent({
    provider: cliProvider,
    prompt: agenticPrompt,
    timeoutMs: AGENTIC_TIMEOUT_MS,
    signal,
  });
  console.log(`[Agent] ✅ ${cliProvider} 응답 수신 (${result.durationMs}ms, ${result.text.length}자)`);
  return result.text;
}

async function callClaude(prompt: string, temperature: number = 0.9, minChars: number = 2000, signal?: AbortSignal): Promise<string> {
  console.log('[Claude] JSON 형식 준수 요청 - 유니코드 이스케이프 4자리, 쉼표 필수');

  // ✅ [2026-02-24 FIX] 방어적 설정 로드 (callGemini/callPerplexity 패턴 통일)
  let config: any = null;
  try {
    const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
    config = await loadConfig();
    applyConfigToEnv(config);
  } catch (e) {
    console.warn('[Claude] Config 로드 실패 (env 폴백 사용):', e);
  }

  const timeoutMs = getTimeoutMs(minChars);
  console.log(`[Claude] 시작: 목표 ${minChars}자, 타임아웃 ${timeoutMs / 1000}초`);

  // ✅ [2026-03-23 FIX] config에서 직접 API 키를 가져와 전달 (process.env 폴백)
  // callOpenAI와 동일한 패턴: applyConfigToEnv가 빈 문자열일 때 delete하므로 직접 전달 필요
  const rawConfigClaudeKey = config?.claudeApiKey?.trim() || undefined;
  const envClaudeKey = process.env.CLAUDE_API_KEY?.trim() || undefined;
  if (isMaskedSecretValue(rawConfigClaudeKey) && !envClaudeKey) {
    throw new Error('Claude API 키가 실제 키가 아니라 마스킹된 표시값으로 저장되어 있습니다. 환경설정에서 Claude 실제 API 키를 다시 입력해주세요.');
  }
  const configClaudeKey = !isMaskedSecretValue(rawConfigClaudeKey) ? rawConfigClaudeKey : undefined;
  if (configClaudeKey) {
    console.log(`[Claude] ✅ config에서 직접 API 키 로드됨 (길이: ${configClaudeKey.length})`);
  } else {
    console.log(`[Claude] config.claudeApiKey 없음, process.env.CLAUDE_API_KEY 폴백 (${process.env.CLAUDE_API_KEY ? '있음' : '없음'})`);
  }
  const client = getAnthropicClient(configClaudeKey);

  // ✅ [v1.4.44] 사용자 선택 모델 강제 — 다른 모델로 자동 폴백 제거
  // Haiku 선택 시 Sonnet으로 폴백되면 비용이 3~5배 증가하는 문제 해결
  const uiSelectedModel = config?.primaryGeminiTextModel || '';
  let claudeModels: string[];
  if (uiSelectedModel === 'claude-haiku') {
    claudeModels = [CLAUDE_MODELS.HAIKU];
    console.log('[Claude] 💜 UI 선택: Claude Haiku 4.5 (가성비 모드) — 폴백 없음');
  } else if (uiSelectedModel === 'claude-sonnet') {
    claudeModels = [CLAUDE_MODELS.SONNET];
    console.log('[Claude] 📜 UI 선택: Claude Sonnet 4.6 (균형 모드) — 폴백 없음');
  } else if (uiSelectedModel === 'claude-opus') {
    claudeModels = [CLAUDE_MODELS.OPUS];
    console.log('[Claude] 👑 UI 선택: Claude Opus 4.8 (최고 성능 모드) — 폴백 없음');
  } else {
    // 기본 (claude provider로 왔지만 specific 모델 미지정)
    claudeModels = [CLAUDE_MODELS.SONNET];
    console.log('[Claude] ✨ 기본 모드: Claude Sonnet 4.6');
  }

  // 환경 변수로 지정된 모델이 있으면 대체
  const customModel = process.env.CLAUDE_STRUCTURED_MODEL;
  const modelsToTry = customModel ? [customModel] : claudeModels;

  let lastError: Error | null = null;
  const maxAttemptsPerModel = 99;
  const maxTransientRetriesPerModel = 5;
  const claudeRateLimitPatienceMs = getClaudeRateLimitPatienceMs();

  // 각 모델을 순차적으로 시도
  for (const modelName of modelsToTry) {
    let rateLimitWaitedMs = 0;
    let rateLimitRetryCount = 0;
    let transientRetryCount = 0;

    for (let retry = 0; retry < maxAttemptsPerModel; retry++) {
      try {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[Claude] 콘텐츠 생성 시작`);
        console.log(`  • 모델: ${modelName} (${retry + 1})`);
        console.log(`  • 목표 분량: ${minChars}자`);
        console.log(`  • 타임아웃: ${timeoutMs / 1000}초`);
        console.log(`  • Temperature: ${temperature}`);
        console.log(`  • 한도 대기 누적: ${Math.round(rateLimitWaitedMs / 1000)}초`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        const startTime = Date.now();

        // ✅ [2026-03-16] promptSplitter 모듈로 system/user 분리 (인라인 코드 제거)
        // Anthropic API는 system을 top-level 파라미터로 받음
        const { system: claudeSystem, user: claudeUser } = splitPromptByMarker(prompt);
        await throttleProviderRequest('Claude', modelName, getClaudeMinIntervalMs(modelName), signal);

        // Prompt caching: Anthropic charges cache writes at 1.25x input and
        // cache reads at 0.1x. Mark the large static system prompt as cacheable
        // so subsequent posts within the 5-minute TTL reuse it at ~90% discount.
        //
        // SDK 0.21.1 safety: this SDK version types `system` as `string` only
        // (messages.d.ts:348), so we pass the array form via `as any` and guard
        // against runtime rejection with a try/catch that falls back to the
        // plain-string system. This keeps the request working even if the
        // server or SDK ever stops accepting the array form.
        //
        // Prompt cache is opt-in. It is a same-request feature when supported,
        // but older SDK/server combinations may reject the array form and cause
        // an extra retry. Keep one-click generation to one provider call by default.
        const CACHE_MIN_CHARS = 4000;
        const cacheDisabled = process.env.CLAUDE_PROMPT_CACHE_DISABLED === '1';
        const cacheOptIn = process.env.CLAUDE_PROMPT_CACHE_ENABLED === '1';
        const useSystemCache = cacheOptIn && !cacheDisabled && !!claudeSystem && claudeSystem.length >= CACHE_MIN_CHARS;

        // ✅ [v2.7.65] Claude Opus 4.7부터 temperature 파라미터 deprecate
        //   사용자 보고: 400 invalid_request_error "`temperature` is deprecated for this model"
        //   조치: Opus 4.7+ 모델은 temperature 미전송, Sonnet/Haiku는 기존 유지
        const isOpusDeprecatedTemp = /^claude-opus-4-[7-9]|^claude-opus-[5-9]/.test(modelName);
        const buildRequest = (withCache: boolean): any => ({
          model: modelName,
          max_tokens: 8192,
          ...(isOpusDeprecatedTemp ? {} : { temperature: temperature }),
          ...(claudeSystem
            ? {
                system: withCache
                  ? [{ type: 'text', text: claudeSystem, cache_control: { type: 'ephemeral' } }]
                  : claudeSystem,
              }
            : {}),
          messages: [{ role: 'user' as const, content: claudeUser }],
        });

        // ✅ [v2.10.28] Anthropic SDK signal 전달 — 사용자 취소 시 fetch 즉시 abort
        const claudeOpts = signal ? { signal } as any : undefined;
        let createPromise: Promise<any>;
        if (useSystemCache) {
          // Attempt cached form; on any failure that looks like an SDK/schema
          // issue, silently retry with the plain string form.
          createPromise = (async () => {
            try {
              return await (client.messages.create as any)(buildRequest(true), claudeOpts);
            } catch (cacheErr: any) {
              const msg = String(cacheErr?.message || cacheErr || '');
              const looksLikeSchemaError = /system|content|cache_control|type|400|invalid/i.test(msg);
              if (looksLikeSchemaError) {
                console.warn(`[Claude] ⚠️ 캐시 적용 요청 거부됨 (${msg.substring(0, 120)}) → 레거시 string 형식으로 재시도`);
                return await (client.messages.create as any)(buildRequest(false), claudeOpts);
              }
              throw cacheErr;
            }
          })();
        } else {
          createPromise = (client.messages.create as any)(buildRequest(false), claudeOpts);
        }

        const response = await withProviderTimeout(
          createPromise,
          timeoutMs,
          `Claude API 호출 시간 초과 (${timeoutMs / 1000}초)`,
          signal,
        );

        const responseTime = Date.now() - startTime;
        console.log(`[Claude] API 응답 수신: ${responseTime}ms`);

        // 텍스트 추출
        let text = (response.content as any[])
          .map((block: any) => ('text' in block ? block.text : ''))
          .join('');

        // ✅ UTF-8 인코딩 문제 해결 (한글 깨짐 방지)
        const hasKorean = /[가-힣]/.test(text);
        const hasReplacementChar = text.includes('\ufffd') || text.includes('�');

        if (!hasKorean || hasReplacementChar) {
          console.log('[Claude] 한글 인코딩 문제 감지, 복구 시도...');
          text = fixUtf8Encoding(text);
        }

        console.log('[Claude] 응답 길이:', text.length, '자');

        if (!text.trim()) {
          throw new Error('Claude 응답이 비어 있습니다.');
        }

        // ✅ [2026-03-19] 사용량 추적
        const claudeUsage = (response as any).usage;
        const cacheCreate = claudeUsage?.cache_creation_input_tokens || 0;
        const cacheRead = claudeUsage?.cache_read_input_tokens || 0;
        if (useSystemCache) {
          if (cacheRead > 0) {
            console.log(`[Claude] 💰 캐시 히트: ${cacheRead} 토큰 재사용 (0.1x 단가) — 절감 적용됨`);
          } else if (cacheCreate > 0) {
            console.log(`[Claude] 📝 캐시 생성: ${cacheCreate} 토큰 write (1.25x 단가, 이후 5분간 재사용 가능)`);
          } else {
            console.log(`[Claude] ⚠️ 캐시 미적용: 시스템 프롬프트가 1024 토큰 미만이거나 서버가 스킵`);
          }
        }
        // Anthropic usage fields are disjoint: input_tokens excludes cached
        // segments. Pass cache counts separately so the tracker applies the
        // 1.25x (write) / 0.1x (read) multipliers instead of full input price.
        trackApiUsage('claude', {
          inputTokens: claudeUsage?.input_tokens || 0,
          outputTokens: claudeUsage?.output_tokens || 0,
          cacheCreationTokens: cacheCreate,
          cacheReadTokens: cacheRead,
          model: modelName,
        });

        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`✅ [Claude] 생성 완료: ${text.length}자, ${elapsed.toFixed(1)}초`);
        return text;

      } catch (error) {
        lastError = error as Error;
        const errorMessage = (error as Error).message?.toLowerCase() || '';
        const errorStr = safeStringifyError(error).toLowerCase();
        const statusText = String((error as any)?.status ?? (error as any)?.response?.status ?? '');

        // ✅ [2026-02-24 FIX] 에러 분류: 즉시 실패 vs 재시도 가능 vs 다음 모델

        // 1) 인증 오류 → 즉시 throw (재시도 무의미)
        const isAuthError = errorMessage.includes('401') || errorMessage.includes('403') ||
          errorMessage.includes('unauthorized') || errorMessage.includes('forbidden') ||
          errorMessage.includes('invalid api key') || errorMessage.includes('invalid_api_key') ||
          errorMessage.includes('authentication');
        if (isAuthError) {
          throw new Error(`Claude API 키가 유효하지 않습니다. 환경설정에서 API 키를 확인해주세요.\n원본 오류: ${(error as Error).message}`);
        }

        // 2) 크레딧 부족 오류 → 즉시 throw
        const isCreditError = errorMessage.includes('credit') ||
          errorMessage.includes('balance') || errorMessage.includes('too low') ||
          errorStr.includes('credit');
        if (isCreditError) {
          throw new Error(
            `Claude API 크레딧이 부족합니다. Anthropic Console에서 크레딧을 충전해주세요.\n` +
            `원본 오류: ${(error as Error).message}`
          );
        }

        // 3) 모델 없음/접근 불가 → 즉시 throw with 친절 안내 (v2.7.37)
        const isModelNotFound = (errorMessage.includes('not_found') && errorMessage.includes('model')) ||
          (errorMessage.includes('404') && (errorMessage.includes('model') || errorStr.includes('not_found'))) ||
          errorMessage.includes('does not exist') ||
          errorMessage.includes('does not have access');
        if (isModelNotFound) {
          // ✅ [v2.7.37] sonnet/opus 안 됨 보고 대응 — 친절 진단 메시지
          const isSonnetOrOpus = modelName.includes('sonnet') || modelName.includes('opus');
          if (isSonnetOrOpus) {
            throw new Error(
              `Claude ${modelName} 모델에 접근할 수 없습니다.\n` +
              `\n` +
              `가능한 원인:\n` +
              `1. Anthropic Console(console.anthropic.com)에 로그인 → Settings → Plan 확인\n` +
              `2. 무료/체험 등급 키는 Sonnet/Opus 미접근. 유료 결제 필요\n` +
              `3. 신규 모델은 활성화 신청 필요할 수 있음 (workspace 설정)\n` +
              `4. Claude Haiku는 작동 확인됨 — 같은 키로 Haiku 사용 또는 Console에서 권한 확인\n` +
              `\n` +
              `원본 오류: ${(error as Error).message}`
            );
          }
          console.log(`[Claude] ⚠️ 모델 ${modelName} 없음, 다음 모델 시도`);
          break;
        }

        const isRateLimit = statusText === '429' ||
          errorMessage.includes('429') ||
          errorMessage.includes('rate limit') ||
          errorMessage.includes('too many requests');
        if (isRateLimit) {
          const fallbackWaitMs = Math.min(10_000 * Math.pow(1.5, rateLimitRetryCount), 90_000);
          const waitMs = getClaudeRateLimitWaitMs(error, fallbackWaitMs);
          const nextWaitedMs = rateLimitWaitedMs + waitMs;

          if (nextWaitedMs <= claudeRateLimitPatienceMs) {
            rateLimitRetryCount++;
            rateLimitWaitedMs = nextWaitedMs;
            recordProviderRateLimitBackoff('Claude', modelName, waitMs);
            const logMsg =
              `⏳ [Claude ${modelName}] 요청/토큰 한도 대기 — ${Math.round(waitMs / 1000)}초 후 같은 모델로 자동 재시도 ` +
              `(누적 ${formatWaitDurationKo(rateLimitWaitedMs)}/${formatWaitBudgetKo(claudeRateLimitPatienceMs)}, 자동 폴백 없음)`;
            console.warn(logMsg);
            if (typeof (globalThis as any).window !== 'undefined' && typeof (globalThis as any).window.appendLog === 'function') {
              (globalThis as any).window.appendLog(logMsg);
            }
            await sleepWithAbort(waitMs, signal);
            continue;
          }

          throw new Error(
            `Claude API 요청/토큰 한도(RPM/TPM)를 초과했습니다. 앱이 같은 모델로 ${formatWaitDurationKo(rateLimitWaitedMs)} 대기했지만 아직 제한이 풀리지 않았습니다.\n` +
            `원본 오류: ${(error as Error).message}`
          );
        }

        // 4) 재시도 가능한 에러 → 대기 후 재시도 (같은 모델)
        const isRetryable =
          errorMessage.includes('overloaded') ||
          errorMessage.includes('529') || // Anthropic overloaded
          errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503') ||
          errorMessage.includes('server error') || errorMessage.includes('internal error') ||
          errorMessage.includes('시간 초과') || errorMessage.includes('timeout') ||
          errorMessage.includes('비어 있습니다') || errorMessage.includes('empty') ||
          errorMessage.includes('network') || errorMessage.includes('fetch') ||
          errorMessage.includes('econnreset') || errorMessage.includes('econnrefused');

        if (isRetryable) {
          console.log(`[Claude] ⚠️ ${modelName} 재시도 가능 에러 (${transientRetryCount + 1}/${maxTransientRetriesPerModel + 1}): ${(error as Error).message}`);
          if (transientRetryCount < maxTransientRetriesPerModel) {
            const delay = Math.min(2000 * Math.pow(2, transientRetryCount), 30000) + Math.floor(Math.random() * 1000);
            transientRetryCount++;
            console.log(`[Claude] 🔄 ${delay}ms 후 재시도...`);
            await sleepWithAbort(delay, signal);
            continue; // 같은 모델 재시도
          }
          throw new Error(`Claude API 일시 오류가 반복되어 중단했습니다. 원본 오류: ${(error as Error).message}`);
        }

        // 5) 알 수 없는 에러 → 선택 모델 유지 원칙상 즉시 명확히 실패
        throw new Error(`Claude API 오류: ${(error as Error).message}`);
      }
    }
  }

  // 모든 모델 시도 실패
  throw new Error(
    `Claude 모델을 사용할 수 없습니다. 시도한 모델: ${modelsToTry.join(', ')}\n` +
    `마지막 오류: ${lastError?.message || '알 수 없는 오류'}`
  );
}

/**
 * ✅ [2026-02-08] Gemini Google Search Grounding 기반 웹 리서치
 * - 네이버 API/RSS 소스 수집 실패 시 Google 검색을 통해 정보 수집
 * - 공식 사이트, 전문 블로그, 뉴스 등에서 신뢰성 높은 정보 직접 리서치
 * - 키워드에 대한 전문적/체계적 콘텐츠를 생성 소스로 반환
 */
/**
 * ✅ [2026-02-08] Perplexity Sonar 실시간 웹 검색 기반 리서치
 * - 네이버 API/RSS 소스 수집 실패 시 Perplexity의 실시간 웹 검색으로 정보 수집
 * - Sonar 모델은 검색 + 생성이 통합되어 있어 리서치에 최적
 * - Gemini Grounding보다 먼저 시도 (더 빠르고 가벼움)
 */
/**
 * ✅ [2026-02-08] Gemini Grounding 기반 공식 사이트 URL 검색
 * - 글 내용/키워드를 분석하여 관련 공식 사이트 URL을 동적으로 검색
 * - HTTP HEAD 요청으로 URL 유효성 검증 (404/에러 페이지 차단)
 * - 행동 유발 카테고리 (비즈니스, 티켓, 여행 등)에서 활용
 */
export async function findRelevantOfficialSite(
  keyword: string,
  category?: string,
  bodySnippet?: string
): Promise<{
  url: string;
  siteName: string;
  description: string;
  success: boolean;
}> {
  console.log(`\n🔗 [공식사이트 검색] 키워드: "${keyword}", 카테고리: "${category || '미지정'}"`);
  const emptyResult = { url: '', siteName: '', description: '', success: false };

  try {
    // API 키 로드
    let apiKey: string | undefined;
    try {
      const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
      const config = await loadConfig();
      applyConfigToEnv(config);
      apiKey = config?.geminiApiKey?.trim() || process.env.GEMINI_API_KEY;
    } catch (e) {
      apiKey = process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
      console.log('[공식사이트 검색] ⚠️ Gemini API 키 없음');
      return emptyResult;
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(apiKey.trim());

    // 키워드 컨텍스트 활용
    const contextInfo = bodySnippet
      ? `\n글 내용 요약: "${bodySnippet.substring(0, 300)}"`
      : '';

    const searchPrompt = `
아래 키워드/주제에 대해 Google 검색을 통해 일반 사용자들이 실제로 방문하는 가장 대표적인 공식 사이트 URL을 1개만 찾아주세요.

키워드: "${keyword}"
카테고리: "${category || '일반'}"${contextInfo}

[중요 조건]
1. 반드시 실제 존재하는, 접속 가능한 URL만 제공
2. 공공기관, 정부 사이트, 공식 브랜드 사이트, 대형 서비스 사이트 우선
3. 에러 페이지, 없는 페이지, 리다이렉트만 되는 페이지 절대 금지
4. 네이버 블로그, 개인 블로그, 광고성 페이지 절대 금지
5. 사용자가 해당 주제에 대해 실제로 "여기를 방문해야겠다"고 느낄 사이트

[예시]
- "청년 지원금" → https://www.youthcenter.go.kr (온라인청년센터)
- "인터파크 티켓" → https://tickets.interpark.com (인터파크 티켓)
- "여권 발급" → https://www.passport.go.kr (여권 안내)
- "건강검진 예약" → https://www.nhis.or.kr (국민건강보험공단)
- "KTX 예매" → https://www.letskorail.com (한국철도공사)

[출력 형식 - 반드시 아래 형식으로만 응답]
URL: (실제 URL)
사이트명: (사이트 이름)
설명: (한 줄 설명)
`.trim();

    const model = client.getGenerativeModel({
      model: GEMINI_TEXT_MODELS.FLASH,
      // @ts-ignore
      tools: [{ googleSearch: {} }],
    });

    const result = await Promise.race([
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: searchPrompt }] }],
        generationConfig: {
          temperature: 0.1, // 정확도 최우선
          maxOutputTokens: 500,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('공식사이트 검색 타임아웃 (30초)')), 30000)
      ),
    ]);

    const text = result.response.text().trim();
    if (!text) {
      console.log('[공식사이트 검색] ⚠️ 빈 응답');
      return emptyResult;
    }

    // URL 추출
    const urlMatch = text.match(/URL:\s*(https?:\/\/[^\s\n]+)/i);
    const siteNameMatch = text.match(/사이트명:\s*(.+)/);
    const descMatch = text.match(/설명:\s*(.+)/);

    if (!urlMatch || !urlMatch[1]) {
      // 텍스트에서 URL 직접 추출 시도
      const fallbackUrl = text.match(/(https?:\/\/[^\s\n\)]+)/);
      if (!fallbackUrl) {
        console.log('[공식사이트 검색] ⚠️ URL을 추출할 수 없음');
        return emptyResult;
      }
      // URL만 추출된 경우
      const rawUrl = fallbackUrl[1].replace(/[.,;:!?]$/, '');
      const validated = await validateUrl(rawUrl);
      if (!validated) return emptyResult;
      return { url: rawUrl, siteName: keyword, description: '', success: true };
    }

    const rawUrl = urlMatch[1].replace(/[.,;:!?]$/, '');
    const siteName = siteNameMatch?.[1]?.trim() || keyword;
    const description = descMatch?.[1]?.trim() || '';

    // ✅ URL 유효성 검증 (HTTP HEAD)
    const isValid = await validateUrl(rawUrl);
    if (!isValid) {
      console.log(`[공식사이트 검색] ❌ URL 검증 실패: ${rawUrl}`);
      return emptyResult;
    }

    console.log(`✅ [공식사이트 검색] 검증 완료: ${siteName} (${rawUrl})`);
    return { url: rawUrl, siteName, description, success: true };

  } catch (error) {
    console.warn(`[공식사이트 검색] ⚠️ 실패: ${(error as Error).message}`);
    return emptyResult;
  }
}

/**
 * URL 유효성 검증: HTTP HEAD 요청으로 200 응답인지 확인
 * 에러 페이지, 404, 리다이렉트 루프 등 차단
 */
async function validateUrl(url: string): Promise<boolean> {
  try {
    console.log(`   🔍 URL 검증 중: ${url}`);

    // 기본 형식 검증
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // 블랙리스트: 블로그, 광고, 검색 페이지 차단
    const blacklist = [
      'blog.naver.com', 'tistory.com', 'brunch.co.kr',
      'google.com/search', 'search.naver.com',
      'ad.', 'ads.', 'click.', 'redirect.',
      'bit.ly', 'goo.gl', 'tinyurl.com', // 단축 URL 차단
    ];
    if (blacklist.some(bl => url.includes(bl))) {
      console.log(`   ❌ 블랙리스트 URL: ${url}`);
      return false;
    }

    // ✅ [2026-02-08 강화] GET 요청으로 실제 페이지 내용까지 검증
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });

    clearTimeout(timeoutId);

    // 1단계: HTTP 상태 코드 확인
    if (!response.ok) {
      console.log(`   ❌ HTTP 오류: ${response.status} ${url}`);
      return false;
    }

    // ✅ [2026-07-02] 200이지만 redirect follow 후 최종 URL이 에러 페이지인 경우 차단.
    //   실측: bokjiro.go.kr/ssis-crms → 200 + 최종 /error/error.html (본문 문구 스캔으론 못 걸러짐).
    //   canonical 판정은 automation/editorOfficialSiteTail.ts의 isErrorPageUrl과 동일 규칙.
    try {
      const finalUrl = (response as { url?: string }).url || url;
      const finalPath = new URL(finalUrl).pathname.toLowerCase();
      if (/(?:^|\/)(?:error|errors|404|403|500|nopage|not[-_]?found)(?:\/|\.|$)|error[._-]?(?:page|html?|jsp|do|aspx?|php)/i.test(finalPath)) {
        console.log(`   ❌ 에러 페이지 리다이렉트 감지: ${finalUrl} (원본: ${url})`);
        return false;
      }
    } catch { /* URL 파싱 실패 시 기존 흐름 유지 */ }

    // 2단계: 페이지 본문에서 에러 페이지 키워드 감지
    const body = await response.text();
    const bodyLower = body.toLowerCase().substring(0, 5000); // 앞부분만 확인

    // 에러 페이지 감지 키워드 (한국어 + 영어)
    const errorKeywords = [
      // 한국어 에러 페이지
      '페이지를 찾을 수 없습니다',
      '요청하신 페이지를 찾을 수 없',
      '존재하지 않는 페이지',
      '잘못된 주소',
      '페이지가 존재하지 않',
      '서비스 점검 중',
      '접근 권한이 없습니다',
      '서비스 종료',
      '준비 중입니다',
      // 영어 에러 페이지
      'page not found',
      '404 not found',
      'this page doesn\'t exist',
      'the page you requested',
      'cannot be found',
      'no longer available',
      'has been removed',
      'access denied',
      '403 forbidden',
      '500 internal server error',
      'service unavailable',
      'under maintenance',
      'coming soon',
    ];

    const isErrorPage = errorKeywords.some(kw => bodyLower.includes(kw));

    if (isErrorPage) {
      // title 태그로 교차 확인
      const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
      const pageTitle = titleMatch?.[1]?.trim() || '';
      console.log(`   ❌ 에러 페이지 감지! title: "${pageTitle.substring(0, 50)}" URL: ${url}`);
      return false;
    }

    // 3단계: 페이지에 실질적인 콘텐츠가 있는지 확인
    // body가 너무 짧으면 빈 페이지로 간주 (리다이렉트 루프 등)
    if (body.length < 200) {
      console.log(`   ❌ 빈 페이지/리다이렉트: 본문 ${body.length}자 ${url}`);
      return false;
    }

    console.log(`   ✅ URL 검증 통과: ${response.status} (${body.length}자) ${url}`);
    return true;
  } catch (error) {
    console.log(`   ❌ URL 접속 불가: ${(error as Error).message}`);
    return false;
  }
}

export async function researchWithPerplexity(keyword: string): Promise<{
  content: string;
  title: string;
  success: boolean;
}> {
  console.log(`\n🔍 [Perplexity Research] 실시간 웹 검색 리서치 시작: "${keyword}"`);
  const startTime = Date.now();

  try {
    // API 키 확인
    let apiKey: string | undefined;
    let perplexityModel: string = 'sonar';
    try {
      const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
      const config = await loadConfig();
      applyConfigToEnv(config);
      apiKey = config?.perplexityApiKey?.trim() || process.env.PERPLEXITY_API_KEY;
      perplexityModel = config?.perplexityModel || process.env.PERPLEXITY_MODEL || 'sonar';
    } catch (e) {
      apiKey = process.env.PERPLEXITY_API_KEY;
      perplexityModel = process.env.PERPLEXITY_MODEL || 'sonar';
    }

    if (!apiKey) {
      console.log('[Perplexity Research] ⚠️ Perplexity API 키 없음 → 건너뜀');
      return { content: '', title: '', success: false };
    }

    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({
      apiKey: apiKey.trim(),
      baseURL: 'https://api.perplexity.ai',
    });

    const researchPrompt = `
아래 키워드에 대해 실시간 웹 검색을 통해 최신 정보를 수집하고,
블로그 글 작성에 활용할 수 있는 체계적인 리서치 자료를 한국어로 작성해주세요.

🔍 키워드: "${keyword}"

[필수 수집 항목]
1. 핵심 정보: 정의, 개념, 배경
2. 상세 내용: 특징, 장단점, 종류/분류
3. 실용 정보: 구체적 방법, 팁, 주의사항
4. 최신 동향: 트렌드, 통계, 최근 변화
5. 전문가 의견: 공식 기관/브랜드 정보

[출력 규칙]
- 각 항목을 소제목과 함께 구조화
- 구체적인 수치, 날짜, 출처 포함
- 최소 2000자 이상 상세히 작성
- 실제 검색 결과 기반으로 정확하게 작성
`.trim();

    const response = await Promise.race([
      client.chat.completions.create({
        model: perplexityModel, // ✅ [2026-03-19 FIX] 하드코딩 'sonar' 제거 → 사용자 설정 perplexityModel 존중
        messages: [
          {
            role: 'system',
            content: '당신은 전문 리서치 어시스턴트입니다. 실시간 웹 검색 결과를 바탕으로 정확하고 최신의 정보를 체계적으로 정리합니다.'
          },
          { role: 'user', content: researchPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.3,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Perplexity 리서치 타임아웃 (60초)')), 60000)
      ),
    ]);

    const content = response.choices[0]?.message?.content?.trim() || '';

    if (!content || content.length < 200) {
      console.warn(`[Perplexity Research] ⚠️ 결과 부족 (${content?.length || 0}자)`);
      return { content: '', title: '', success: false };
    }

    // HTML 태그 정리
    const cleanedContent = content
      .replace(/<\/?u>/gi, '')
      .replace(/<\/?b>/gi, '')
      .replace(/<\/?i>/gi, '')
      .replace(/<\/?em>/gi, '')
      .replace(/<\/?strong>/gi, '');

    const elapsed = Date.now() - startTime;
    console.log(`✅ [Perplexity Research] 리서치 완료! ${cleanedContent.length}자 (${elapsed}ms)`);

    // 제목 추출
    let title = keyword;
    const firstLine = cleanedContent.split('\n').find(l => l.trim().length > 0);
    if (firstLine) {
      const cleaned = firstLine.replace(/^#+\s*/, '').replace(/^\*\*|\*\*$/g, '').trim();
      if (cleaned.length > 5 && cleaned.length < 100) {
        title = cleaned;
      }
    }

    return { content: cleanedContent, title, success: true };
  } catch (error) {
    const errMsg = (error as Error).message;
    // API 키 오류는 로그만 남기고 조용히 실패
    if (errMsg.includes('401') || errMsg.includes('API key') || errMsg.includes('unauthorized')) {
      console.log(`[Perplexity Research] ⚠️ API 키 인증 실패 → 건너뜀`);
    } else {
      console.warn(`[Perplexity Research] ⚠️ 리서치 실패: ${errMsg}`);
    }
    return { content: '', title: '', success: false };
  }
}

export async function researchWithGeminiGrounding(keyword: string): Promise<{
  content: string;
  title: string;
  sources: string[];
  success: boolean;
}> {
  console.log(`\n🔍 [Gemini Grounding] Google 검색 기반 웹 리서치 시작: "${keyword}"`);
  const startTime = Date.now();

  try {
    // API 키 로드
    let apiKey: string | undefined;
    try {
      const { loadConfig, applyConfigToEnv } = await import('./configManager.js');
      const config = await loadConfig();
      applyConfigToEnv(config);
      apiKey = config?.geminiApiKey?.trim() || process.env.GEMINI_API_KEY;
    } catch (e) {
      apiKey = process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
      console.warn('[Gemini Grounding] ⚠️ Gemini API 키 없음');
      return { content: '', title: '', sources: [], success: false };
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(apiKey.trim());

    // ✅ Google Search grounding이 지원되는 stable 모델만 사용
    const modelsToTry = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
    ];

    const researchPrompt = `
당신은 전문 리서치 어시스턴트입니다. 아래 키워드/주제에 대해 Google 검색을 통해 최신 정보를 수집하고, 
블로그 글 작성에 활용할 수 있는 체계적인 리서치 자료를 작성해주세요.

🔍 키워드: "${keyword}"

[필수 수집 항목]
1. 핵심 정보: 정의, 개념, 배경
2. 상세 내용: 특징, 장단점, 종류/분류
3. 실용 정보: 구체적 방법, 팁, 주의사항
4. 최신 동향: 트렌드, 통계, 최근 변화
5. 전문가 의견: 공식 기관/브랜드 정보

[출력 형식]
- 한국어로 작성
- 각 항목을 소제목과 함께 구조화
- 구체적인 수치, 날짜, 출처 포함
- 최소 2000자 이상 작성
- 실제 정보 기반으로 정확하게 작성 (추측 금지)
`.trim();

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Gemini Grounding] 모델 ${modelName}으로 리서치 시도...`);

        const model = client.getGenerativeModel({
          model: modelName,
          // @ts-ignore - googleSearch tool은 SDK 타입에 아직 미반영될 수 있음
          tools: [{ googleSearch: {} }],
        });

        const result = await Promise.race([
          model.generateContent({
            contents: [{ role: 'user', parts: [{ text: researchPrompt }] }],
            generationConfig: {
              temperature: 0.3, // 정보 정확도를 위해 낮은 temperature
              maxOutputTokens: 8000,
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Grounding 타임아웃 (90초)')), 90000)
          ),
        ]);

        const response = result.response;
        const text = response.text();

        if (!text || text.trim().length < 200) {
          console.warn(`[Gemini Grounding] ⚠️ ${modelName}: 결과 부족 (${text?.length || 0}자)`);
          continue;
        }

        // 출처(grounding sources) 추출
        const sources: string[] = [];
        try {
          const candidates = response.candidates;
          if (candidates && candidates[0]) {
            const groundingMetadata = (candidates[0] as any).groundingMetadata;
            if (groundingMetadata?.groundingChunks) {
              for (const chunk of groundingMetadata.groundingChunks) {
                if (chunk.web?.uri) {
                  sources.push(chunk.web.uri);
                }
              }
            }
            if (groundingMetadata?.webSearchQueries) {
              console.log(`[Gemini Grounding] 검색 쿼리: ${groundingMetadata.webSearchQueries.join(', ')}`);
            }
          }
        } catch (e) {
          // 출처 추출 실패는 무시
        }

        const elapsed = Date.now() - startTime;
        console.log(`✅ [Gemini Grounding] 리서치 완료! ${text.length}자, ${sources.length}개 출처 (${elapsed}ms)`);

        // 제목 추출 (첫 줄이 # 으로 시작하거나, 키워드 기반)
        let title = keyword;
        const firstLine = text.split('\n').find(l => l.trim().length > 0);
        if (firstLine) {
          const cleaned = firstLine.replace(/^#+\s*/, '').trim();
          if (cleaned.length > 5 && cleaned.length < 100) {
            title = cleaned;
          }
        }

        return {
          content: text,
          title,
          sources,
          success: true,
        };
      } catch (modelError) {
        const errMsg = (modelError as Error).message;
        console.warn(`[Gemini Grounding] ⚠️ ${modelName} 실패: ${errMsg}`);

        // 타임아웃이면 다음 모델 시도
        if (errMsg.includes('타임아웃')) continue;
        // 모델 미지원이면 다음 모델 시도
        if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('not supported')) continue;
        // 기타 오류도 다음 모델 시도
        continue;
      }
    }

    console.warn('[Gemini Grounding] ⚠️ 모든 모델에서 리서치 실패');
    return { content: '', title: '', sources: [], success: false };
  } catch (error) {
    console.error(`[Gemini Grounding] ❌ 리서치 실패: ${(error as Error).message}`);
    return { content: '', title: '', sources: [], success: false };
  }
}

export async function generateStructuredContent(
  source: ContentSource,
  options: GenerateOptions = {},
): Promise<StructuredContent> {
  // ✅ [SPEC-IMAGE-NARRATIVE-2026 Phase 2] image-narrative mode branch
  if (source.contentMode === 'image-narrative') {
    const { buildNarrativeContent } = await import('./imageNarrative/narrativeBuilder/builder.js');
    const { aggregateInferences } = await import('./imageNarrative/inferenceAggregator/aggregator.js');

    const imgOpts = source.imageNarrative;
    if (!imgOpts?.images?.length) {
      throw new Error('[image-narrative] imageNarrative.images 배열이 비어 있습니다.');
    }

    const imageInputs = imgOpts.images.map((img, i) => ({
      imageId: `img-${i}`,
      buffer: img.buffer,
      mimeType: img.mimeType,
    }));

    const plan = await aggregateInferences(imageInputs, {
      mode: imgOpts.mode ?? 'auto',
      provider: imgOpts.provider ?? 'gemini',
      context: imgOpts.context,
    });

    // ✅ 에이전트 모드: vision 추론은 vendor로(위), 글 작성만 구독 CLI로 분리.
    //   글로벌 엔진(primaryGeminiTextModel)이 agent-*면 텍스트 provider로 승격.
    let narrativeTextProvider: string = imgOpts.provider ?? 'gemini';
    try {
      const { isAgentTextProvider } = await import('./runtime/modelRegistry.js');
      const { loadConfig } = await import('./configManager.js');
      const cfg = await loadConfig();
      const textEngine = (cfg as any)?.primaryGeminiTextModel;
      if (isAgentTextProvider(textEngine)) narrativeTextProvider = textEngine;
    } catch { /* config 로드 실패 시 vision provider 유지 */ }

    return buildNarrativeContent(plan, {
      provider: narrativeTextProvider as any,
      context: imgOpts.context,
    });
  }

  if (!source?.rawText || !source.rawText.trim()) {
    throw new Error('원본 텍스트가 비어 있습니다. 키워드 또는 URL을 다시 확인해주세요.');
  }
  // ✅ [v2.7.27] Adaptive Limiter — 메인 스레드 lag 발생 시 동시성 자동 다운
  const { globalLimiter } = await import('./runtime/adaptiveLimiter.js');
  const release = await globalLimiter.acquire('content');
  try {

  // ✅ [핵심 수정] 에러 페이지 크롤링 감지 - 쇼핑커넥트 모드에서만 캡차/에러 페이지 방지
  // ✅ [2026-01-21 FIX] SEO/홈피드 모드에서는 이 로직을 건너뜀 (키워드에 '오류' 포함 시 오작동 방지)
  const isShoppingConnectMode = source.contentMode === 'affiliate' || source.isReviewType === true ||
    (source.url && (source.url.includes('smartstore.naver.com') ||
      source.url.includes('brand.naver.com') ||
      source.url.includes('naver.me')));

  // rawText뿐만 아니라 title에서도 에러 키워드 감지 (쇼핑커넥트 모드에서만)
  const errorKeywords = [
    '에러페이지', '에러 페이지', '에러 - ', '시스템오류', '시스템 오류',
    '접속이 불안정', '서비스 접속이', 'error page', 'system error', 'error -',
    '접근이 차단', '캡차', 'captcha', '로그인이 필요', 'access denied',
    '페이지를 찾을 수 없', '존재하지 않는 페이지', 'not found', '404',
    '점검 중', '서버 오류', '일시적 오류', '접속 불가', '차단되었습니다',
    'blocked', 'denied', 'forbidden', 'unauthorized', '권한이 없습니다'
  ];

  // ✅ [2026-02-16 FIX] 에러 페이지 감지 개선: rawText 앞부분(500자) + title에서만 검사
  // 실제 에러 페이지는 짧고(500자 미만) 맨 앞에 에러 메시지가 나옴
  // rawText가 1500자 이상이면 실제 상품 정보가 크롤링된 것으로 간주
  const rawTextLength = source.rawText?.length || 0;
  const isLikelyRealContent = rawTextLength > 1500;
  const textHead = `${(source.rawText || '').substring(0, 500)} ${source.title || ''}`.toLowerCase();
  const hasErrorKeyword = errorKeywords.some(kw => textHead.includes(kw.toLowerCase()));

  // ✅ [2026-01-21 FIX] 에러 페이지 감지는 쇼핑커넥트 모드에서만!
  // ✅ [2026-02-16 FIX] rawText가 충분히 길면 실제 콘텐츠로 간주 (에러 페이지 오판 방지)
  const isErrorPage = isShoppingConnectMode && hasErrorKeyword && !isLikelyRealContent;

  // ✅ 디버그 로그
  if (textHead.includes('에러') || textHead.includes('오류')) {
    console.log(`[ContentGenerator] 🔍 에러 키워드 감지 분석:`);
    console.log(`   - isShoppingConnectMode: ${isShoppingConnectMode}`);
    console.log(`   - rawText 길이: ${rawTextLength}자`);
    console.log(`   - isLikelyRealContent (>1500자): ${isLikelyRealContent}`);
    console.log(`   - title: "${source.title || '없음'}"`);
    console.log(`   - hasErrorKeyword: ${hasErrorKeyword}`);
    console.log(`   - isErrorPage (최종): ${isErrorPage}`);
  }

  if (isErrorPage) {
    // ✅ [2026-03-15 FIX] 에러 페이지 감지 시 검색 API 폴백 완전 제거 (다른 제품 콘텐츠 주입 방지)
    // 기존: searchShopping으로 스토어명/키워드 검색 → 다른 제품 rawText 대체 → 다른 제품 글 생성 버그
    // 변경: 에러 페이지 감지되면 즉시 에러 throw
    console.warn('[ContentGenerator] ⚠️ 에러 페이지 감지 - 검색 API 폴백 없이 에러 반환');
    console.log('[ContentGenerator] 📋 source 정보:', {
      url: source.url,
      title: source.title,
      rawTextLength: source.rawText?.length,
    });

    throw new Error(
      '❌ 제휴 링크 크롤링 실패: 에러 페이지가 감지되었습니다.\n\n' +
      '🔧 해결 방법:\n' +
      '1. 제휴 링크가 유효한지 확인해주세요\n' +
      '2. 잠시 후 다시 시도해주세요 (네이버 측 일시적 문제일 수 있음)\n' +
      '3. 직접 브라우저에서 제휴 링크를 열어 상품 페이지가 정상적으로 표시되는지 확인해주세요\n\n' +
      '💡 팁: smartstore.naver.com 또는 brand.naver.com 직접 URL을 사용하면 더 안정적입니다.'
    );
  }

  // ✅ 하이브리드 모드 비활성화 (2024-01-02)
  // 기존: SEO + 홈판 동시 생성 후 결과 합침 → API 비용 2배, 모드 구분 무의미
  // 변경: 사용자가 선택한 모드만 사용 → API 비용 절감, 모드별 명확한 구분
  // const requestedMode = (options as any).contentMode || source.contentMode || 'seo';
  // const skipHybrid = (source as any).__skipHybrid === true;
  // if (!skipHybrid && (requestedMode === 'seo' || requestedMode === 'homefeed')) {
  //   const baseSource: ContentSource = { ...source, contentMode: 'seo' };
  //   const overlaySource: ContentSource = { ...source, contentMode: 'homefeed' };
  //   (baseSource as any).__skipHybrid = true;
  //   (overlaySource as any).__skipHybrid = true;
  //
  //   try {
  //     const seoPromise = generateStructuredContent(baseSource, options);
  //     const homePromise = (async () => {
  //       await new Promise((r) => setTimeout(r, 800));
  //       return generateStructuredContent(overlaySource, options);
  //     })();
  //     const [seo, home] = await Promise.all([seoPromise, homePromise]);
  //     return mergeSeoWithHomefeedOverlay(seo, home, source);
  //   } catch (err) {
  //     try {
  //       const seo = await generateStructuredContent(baseSource, options);
  //       const home = await generateStructuredContent(overlaySource, options);
  //       return mergeSeoWithHomefeedOverlay(seo, home, source);
  //     } catch {
  //       throw err;
  //     }
  //   }
  // }

  // 글자수에 따라 최적 provider 자동 선택
  let provider = options.provider ?? source.generator ?? 'gemini';
  const userSelectedProvider = provider; // ✅ [2026-04-11] 사용자가 선택한 원래 엔진 보존 (폴백 방지용)
  // ✅ 기본 글자수: 3000자 (풍부한 내용 + 최적 분량, 양보다 질 최극상)
  let minChars = options.minChars ?? 2500; // ✅ [v1.4.14] 3000→2500 (출력 토큰 -15%, SEO 안전 1500자 이상 유지)

  // ✅ [v1.4.5] config 로드 (Lite Mode 설정 확인용)
  let config: any = null;
  try {
    const { loadConfig } = await import('./configManager.js');
    config = await loadConfig();
  } catch (e) {
    // config 로드 실패 시 무시 (기본값 사용)
  }
  const costPolicy: ContentGenerationCostPolicy = resolveContentGenerationCostPolicy(config);

  // [SPEC-PROMPT-2026-REFRESH Phase 3-A / v2.10.235] AI 탭 친화 모드 활성 시 minChars 상향
  //   조건: aiTabFriendlyMode === true (사용자 명시 ON) + mode === 'seo'
  //   동작: minChars를 6000으로 상향 (AI 탭 채택 평균 6,000~8,000자).
  //   주의: 자료 외 사실 채우기 금지 — Phase 1 F1~F4 룰이 자동 적용되어 자료 부족 영역은 (자료 부족) 명시.
  if (config?.aiTabFriendlyMode === true && (source.contentMode === 'seo' || source.contentMode === 'mate' || !source.contentMode)) {
    if (minChars < 6000) {
      console.log(`[ContentGenerator] 🎯 AI 탭 친화 모드 활성 — minChars ${minChars} → 6000자 상향`);
      minChars = 6000;
    }
    // source 플래그 세팅 — buildModeBasedPrompt에서 ai-tab-friendly.prompt 합쳐서 system prompt 강화.
    source.aiTabFriendly = true;
  }

  // [SPEC-PROMPT-2026-REFRESH Phase 3-B / v2.10.236] Claude Sonnet abstention 모드 강화
  //   조건: claudeAbstentionMode === true + provider === 'claude' (Sonnet) 동시.
  //   동작: source에 강한 abstention 지시 플래그 세팅 → buildModeBasedPrompt에서 추가 룰 inject.
  //   비용 경고: Sonnet은 Gemini Flash 대비 토큰 ×10 비용 — 사용자 명시 동의 필수.
  //   Gemini Flash 사용자도 base.prompt의 F6 abstention 룰이 적용되므로 무료 효과 일부 누림.
  if (config?.claudeAbstentionMode === true && provider === 'claude') {
    console.log('[ContentGenerator] 🛡️ Claude Sonnet abstention 모드 활성 — 환각률 ↓, 토큰 ×10 비용');
    (source as any).claudeAbstentionStrong = true;
  }

  // ✅ [2026-01-26 FIX] provider가 명시적으로 전달되지 않으면 gemini 기본값 사용
  // Perplexity는 renderer에서 명시적으로 'perplexity'로 전달될 때만 사용
  if (!provider) {
    provider = 'gemini';
  }
  console.log(`[ContentGenerator] 사용 엔진: ${provider} (목표: ${minChars}자)`);

  const openAiContentMaxAttempts = readNonNegativeIntegerEnv('OPENAI_CONTENT_MAX_ATTEMPTS', 0);
  const baseMaxAttempts = provider === 'openai' ? openAiContentMaxAttempts : costPolicy.maxAttempts;
  const sameEngineReliabilityMinAttempts = readNonNegativeIntegerEnv('CONTENT_SAME_ENGINE_MIN_ATTEMPTS', 1);
  const promptRepairMinAttempts = source.customPrompt?.trim() ? 2 : 0;
  const generationQualityMode = String(source.contentMode || 'seo');
  const qualityTargetMinAttempts = isQuality90Mode(generationQualityMode) ? 2 : 0;
  const MAX_ATTEMPTS = Math.max(baseMaxAttempts, sameEngineReliabilityMinAttempts, promptRepairMinAttempts, qualityTargetMinAttempts);
  const RETRY_DELAYS = [0, 1200, 2000, 3000, 4500, 6000, 8000];
  console.log(`[ContentGenerator] 비용 정책: costSaver=${costPolicy.costSaverOn ? 'ON' : 'OFF'}, same-engine retries=${MAX_ATTEMPTS}, reliability=${sameEngineReliabilityMinAttempts}, promptRepair=${promptRepairMinAttempts}, quality90=${qualityTargetMinAttempts}`);

  // ✅ Gemini 전용 강화 재시도 시스템
  // provider 내부 재시도 위에 전체 파이프라인 재실행이 겹치지 않도록 기본 1회만 허용.
  let networkErrorCount = 0;
  const GEMINI_MAX_RETRIES = Math.max(0, Number(process.env.GEMINI_NETWORK_MAX_RETRIES ?? 1));
  const GEMINI_RETRY_DELAYS = [1200, 2000, 3000, 4500, 6000, 8000, 10000];

  if (provider === 'gemini') {
    console.log(`[ContentGenerator] Gemini 전용 네트워크 재시도: 최대 ${GEMINI_MAX_RETRIES}회`);
  }

  // ✅ 성공률 통계 추적
  const statsFile = path.join(app.getPath('userData'), 'content-generation-stats.json');
  let stats = { total: 0, success: 0, failed: 0, attempts: { first: 0, second: 0, third: 0, fourth: 0 } };

  try {
    if (fsSync.existsSync(statsFile)) {
      const statsData = fsSync.readFileSync(statsFile, 'utf-8');
      stats = JSON.parse(statsData);
    }
  } catch (error) {
    console.warn('[ContentGenerator] 통계 파일 읽기 실패, 새로 시작:', (error as Error).message);
  }

  stats.total++;

  // LLM이 목표치보다 짧게 생성되는 경향을 보완하기 위해
  // 연령대/사용자 설정 최소 글자수(minChars)에 적절한 여유를 두고 요청합니다.
  // 제목만 생성하는 경우(minChars < 1000)는 요청 글자수를 줄여서 빠르게 처리
  const isTitleOnly = minChars < 1000;
  // AI에게 요청할 글자수: 1.5배 요청
  // - 2000자 목표 → 3000자 요청 → 실제 2000~2500자 생성
  // 단, 네이버 제한의 80%를 넘지 않음 (80,000자)
  const SAFE_MAX_CHARS = Math.floor(100000 * 0.8); // 80,000자
  const requestMultiplier = isTitleOnly ? 1.5 : 1.2;
  const requestedMinChars = isTitleOnly
    ? Math.round(minChars * requestMultiplier)
    : Math.min(Math.round(minChars * requestMultiplier), SAFE_MAX_CHARS);
  // 검증 기준: 완화 적용 (75% 달성 시 통과)
  // - 75% 이상이면 통과 (2000자 목표 → 1500자 이상이면 OK)
  // - 50% 이상이면 경고만 하고 통과
  // - 50% 미만일 때만 재시도
  const validationMinChars = Math.round(minChars * 0.75); // 75% 달성 시 통과
  const warningMinChars = Math.round(minChars * 0.50); // 경고 기준 50%

  let extraInstruction = '';
  let supplementalInstructionInitialized = false;
  let lastFailReason = ''; // ✅ [2026-03-23] 실패 원인 추적
  let _fidelityRetryUsed = false; // ✅ [Phase 7-B] Source Fidelity 자동 재시도 1회 가드
  let _qualityGateRetryUsed = false; // ✅ [v2.10.178 Phase 2] qualityGate decision='regenerate' 재시도 1회 가드
  let _quality90FollowupRetryUsed = false; // 90점 미달 patch 후에도 부족하면 추가 전체 재생성 1회
  let _distinctnessJudgeUsed = false; // ✅ [Gap C 시맨틱] 섹션 변별 LLM 판정 — 생성당 1회만 호출(비용 가드)
  let _affiliateAuthenticityRetryUsed = false;
  let _shoppingValidationRetryUsed = false;
  // ✅ [2026-04-03] signal 추출 — 중지 시 즉시 abort
  const signal = options.signal;

  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      // ✅ [2026-04-03] 매 시도 전 abort 체크
      throwIfContentGenerationAborted(signal);

      // 재시도 전 대기 (Rate Limit 회피)
      if (attempt > 0) {
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        console.log(`[ContentGenerator] 재시도 ${attempt}/${MAX_ATTEMPTS}: ${delay / 1000}초 대기 후 재개`);
        await sleepWithAbort(delay, signal);
        // ✅ [2026-04-03] 대기 후에도 abort 체크
        throwIfContentGenerationAborted(signal);
      }

      // 재시도 시에도 동일한 분량 요청 (일관성 유지)
      const adjustedMinChars = requestedMinChars;

      console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: 요청 글자수 ${adjustedMinChars}자`);

      console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: 요청 글자수 ${adjustedMinChars}자`);

      if (!supplementalInstructionInitialized) {
        // 이미지 존재는 제품을 직접 보거나 사용했다는 증거가 아니다.
        if (source.images && source.images.length > 0) {
          extraInstruction += `\n\n[참고 이미지 정보]\n사용 가능한 제품 이미지 ${source.images.length}장이 있습니다. 이미지에서 확인되지 않은 감각·크기·사용 장면은 만들지 마세요.`;
        }

      // ✅ [2026-01-21 FIX] 쇼핑커넥트 모드: 제품 리뷰 블로그 스타일 지시문 추가
      // 쇼핑몰 후기글이 아닌 "개인 블로그 제품 리뷰글" 스타일로 작성
      if (isShoppingConnectMode) {
        // ✅ [2026-01-21] 상품 카테고리 자동 감지 및 프롬프트 주입
        const productName = (source as any)?.productInfo?.name || source.title || '';
        const categoryResult = detectProductCategory(productName, source.rawText?.slice(0, 500));

        // 카테고리별 적절한 표현 및 금지 표현 지침
        let categoryGuidance = '';
        if (categoryResult.confidence !== 'low') {
          categoryGuidance = `

════════════════════════════════════════
📦 [상품 카테고리: ${categoryResult.categoryKorean}] - 필수 준수
════════════════════════════════════════

이 상품은 "${categoryResult.categoryKorean}" 카테고리로 분류됐습니다.
- 카테고리에 맞는 어휘라도 제품 정보·사용자 경험·구매자 후기에 실제로 있는 내용만 사용합니다.
- 식품의 맛·향·식감, 화장품의 발림성·흡수감, 의류의 착용감, 가전의 소음·설치감처럼 직접 확인이 필요한 표현은 근거 없이 만들지 않습니다.
- 다른 카테고리의 상투어를 섞지 않습니다.
`;
        }

        extraInstruction += categoryGuidance;
        extraInstruction += `\n\n[쇼핑커넥트 문체 보정]
- 쇼핑몰 구매평이나 광고 문안이 아니라, 친한 친구에게 구매 판단 기준을 알려주는 글로 쓴다.
- 장점과 단점을 따로 나열하는 데 그치지 말고 어떤 상황에서 장점·불편이 되는지 구체적으로 연결한다.
- 작성자 실사용 여부는 AFFILIATE AUTHENTICITY CONTRACT의 근거 모드를 따른다.`;
        console.log('[ContentGenerator] 🛒 쇼핑커넥트 모드: 근거 기반 친구 말투 보정 적용');
      }
        supplementalInstructionInitialized = true;
      }

      let metrics: { searchVolume?: number; documentCount?: number } | undefined;
      try {
        const primaryKeyword = getPrimaryKeywordFromSource(source);
        if (primaryKeyword) {
          console.log(`[ContentGenerator] 키워드 "${primaryKeyword}" 지표 수집 시작...`);
          const config = await loadConfig();
          const searchVol = await trendAnalyzer.getSearchVolume(
            primaryKeyword,
            config.naverAdApiKey || '',
            config.naverAdSecretKey || '',
            config.naverAdCustomerId || ''
          );
          const docCount = await trendAnalyzer.getDocumentCount(
            primaryKeyword,
            config.naverDatalabClientId || '',
            config.naverDatalabClientSecret || ''
          );

          if (searchVol >= 0 || docCount > 0) {
            metrics = {
              searchVolume: searchVol >= 0 ? searchVol : undefined,
              documentCount: docCount > 0 ? docCount : undefined
            };
            console.log(`[ContentGenerator] ✅ "${primaryKeyword}" 지표 주입 완료: 검색량 ${searchVol}, 문서량 ${docCount}`);
          }
        }
      } catch (err) {
        console.warn('[ContentGenerator] ⚠️ 네이버 지표 수집 실패 (무시하고 진행):', (err as Error).message);
      }

      // ✅ [2026-02-11] buildPrompt() 데드 호출 제거 - buildModeBasedPrompt()만 사용
      let raw: string = ''; // ✅ [2026-02-04] undefined 방지 - 빈 문자열로 초기화

      // ✅ 다양성 극대화를 위해 temperature 높임 (매번 다른 글 생성)
      // ✅ 모드별 프롬프트 및 온도 설정 가져오기
      const mode = (source.contentMode || 'seo') as PromptMode;
      let systemPrompt = buildModeBasedPrompt(source, mode, metrics, adjustedMinChars);

      if (extraInstruction.trim()) {
        systemPrompt += `\n\n[RUNTIME RETRY AND CONTEXT INSTRUCTIONS]\n${extraInstruction.trim()}`;
      }

      if (source.contentPolicyPrompt) {
        systemPrompt = `${source.contentPolicyPrompt}\n\n${systemPrompt}`;
        console.log('[ContentPolicy] Recent-post context injected before model generation.');
      }

      // ✅ [v2.10.192 Phase 3.9] 자동 학습 보완 지시 — 누적 SERP history에서 자주 미달하는 신호 자동 추출
      //   첫 글~4건 글까지는 데이터 부족 → skip (silent)
      //   5건+ 누적 시 가장 자주 미달한 신호 top 2를 prompt prefix로 주입
      //   추정 효과 0 — 실측 SERP 비교 결과 기반
      try {
        const { buildAdaptiveLearningDirective } = await import('./analytics/serpHistory.js');
        const { app } = await import('electron');
        const userDataPath = app.getPath('userData');
        const adaptiveDirective = buildAdaptiveLearningDirective(userDataPath, 30, 2);
        if (adaptiveDirective) {
          systemPrompt = adaptiveDirective + '\n' + systemPrompt;
          console.log('[AdaptiveLearning] 📚 자동 학습 보완 지시 주입 (누적 history 기반)');
        }
      } catch { /* silent — 정상 흐름 유지 */ }

      // ✅ [v2.10.173] URL 모드 전용 강화 지시 — 사용자 요청 "원본 100% + 더 좋은 퀄리티"
      //   사용자 보고: "URL로 글생성을 한다면 URL원본보다 훨씬 퀄리티 좋고 잘써줘야되고
      //                원본내용이 100% 다들어있어야되는거아닌가요??"
      //   조치: URL 모드일 때 system 프롬프트 앞에 *원본 보존 + 퀄리티 업그레이드* 지시 prepend
      const urlModeDirective = buildUrlModeDirective(source);
      if (urlModeDirective) {
        systemPrompt = urlModeDirective + systemPrompt;
        console.log('[ContentGenerator] 📜 URL 모드 강화 지시 prepend (원본 100% + 퀄리티 업그레이드)');
      }

      // Phase 4: skipDictInjection 토글 ON 시 페르소나 카드를 시스템 프롬프트 헤더에 prepend.
      // 후처리 어휘 주입이 꺼진 모드에서 LLM이 글 전체 동안 일관된 화자 페르소나를 유지하도록 보강.
      const phase4SkipDict =
        isLlmRubricEnabled({ useLlmRubric: (source as any).useLlmRubric })
        || (source as any).skipDictInjection === true;
      if (phase4SkipDict) {
        const personaCard = buildPersonaCard(detectCategory(source.toneStyle || 'general'));
        systemPrompt = personaCard + '\n' + systemPrompt;
        console.log('[ContentGenerator] 🎭 페르소나 카드 prepend (skipDictInjection 모드)');
      }

      // ✅ [v2.10.172] 사용자 요청 — Gemini 본문 생성은 *반드시* grounding ON (팩트 보장)
      //   기존 (v1.4.4 ~ v2.10.171): smartGrounding 동적 결정
      //     - URL 모드: rawText < 1000 → ON, 그 외 OFF (v2.10.170 비용 절감)
      //     - 키워드 모드: rawText < 2000 OR !hasKeywordInRawText → ON
      //   변경: 본문 생성은 항상 grounding ON. 사용자 enableSearchGrounding 토글만 따름.
      //   사유: "팩트가 꼭 필요" — 환각/추정 차단이 비용 $0.035/글보다 우선
      const rawTextLen = (source.rawText || '').length;
      const isUrlMode = !!source.url || source.sourceType === 'naver_news' || source.sourceType === 'daum_news';
      const smartGrounding = true;
      console.log(`[ContentGenerator] 🧠 Grounding: ON (강제) | mode=${isUrlMode ? 'URL' : 'KEYWORD'}, rawText=${rawTextLen}자`);

      // ✅ [Phase 7.4-y] 모드별 호출 온도는 contentTemperaturePolicy 단일 소스에서 관리.
      const temperature = resolvePromptTemperature(mode);

      console.log(`[ContentGenerator] AI 호출 모드: ${mode}, 온도: ${temperature}`);

      // ✅ 3. AI 엔진 호출 (프롬프트/온도 반영)
      let rawResponse = '';
      console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: ${provider} API 호출 중...`);
      try {
        const apiStart = Date.now();

        // ✅ [2026-04-03 FIX] signal abort 시 즉시 reject하는 래퍼
        const withAbortRace = <T>(promise: Promise<T>): Promise<T> => {
          if (!signal) return promise;
          if (signal.aborted) return Promise.reject(createContentGenerationAbortError(signal));
          return new Promise<T>((resolve, reject) => {
            const onAbort = () => reject(createContentGenerationAbortError(signal));
            signal.addEventListener('abort', onAbort, { once: true });
            promise.then(
              (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
              (e) => { signal.removeEventListener('abort', onAbort); reject(e); }
            );
          });
        };

        // ✅ [v2.10.28] signal을 callX에 직접 전달 — SDK 레벨 fetch abort
        if (provider === 'agent-codex' || provider === 'agent-claude') {
          rawResponse = await withAbortRace(callAgent(provider, systemPrompt, { signal, mode }));
        } else if (provider === 'openai') {
          rawResponse = await withAbortRace(callOpenAI(systemPrompt, temperature, adjustedMinChars, signal));
        } else if (provider === 'claude') {
          rawResponse = await withAbortRace(callClaude(systemPrompt, temperature, adjustedMinChars, signal));
        } else if (provider === 'perplexity') {
          // ✅ [2026-01-25] Perplexity AI (Sonar) 실시간 검색 기반 콘텐츠 생성
          rawResponse = await withAbortRace(callPerplexity(systemPrompt, temperature, adjustedMinChars, signal));
        } else {
          // ✅ [v1.4.4] 동적 Grounding 결정 적용
          rawResponse = await withAbortRace(callGemini(systemPrompt, temperature, adjustedMinChars, { useGrounding: smartGrounding, signal }));
        }
        raw = rawResponse; // Assign rawResponse to raw for subsequent processing
        console.log(`[ContentGenerator] API 완료: ${provider} (${Date.now() - apiStart}ms)`);

        // 성공 시 네트워크 에러 카운트 초기화
        networkErrorCount = 0;
        // ✅ [2026-02-04] 방어 코드: raw?.length 사용 (undefined 방지)
        console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: ${provider} API 응답 받음 (길이: ${raw?.length || 0})`);

        // ✅ [2026-02-23 FIX] AI 거부/메타 응답 사전 감지 (Perplexity "I appreciate..." 패턴)
        // Perplexity Sonar 모델이 시스템 프롬프트를 거부하고 자기소개를 하는 경우를 사전 차단
        if (raw && !raw.trim().startsWith('{') && !raw.trim().startsWith('[')) {
          const refusalPatterns = [
            /^I appreciate/i,
            /^I cannot/i,
            /^I'm (Perplexity|an AI)/i,
            /^I need to clarify/i,
            /^Thank you for/i,
            /^I understand your/i,
            /^As an AI/i,
          ];
          const isRefusal = refusalPatterns.some(p => p.test(raw.trim()));
          if (isRefusal) {
            console.warn(`[ContentGenerator] ⚠️ AI 거부 응답 감지 (${provider}): "${raw.substring(0, 80)}..."`);
            if (typeof window !== 'undefined' && typeof (window as any).appendLog === 'function') {
              (window as any).appendLog(`⚠️ ${provider} 엔진이 프롬프트를 거부했습니다. 재시도합니다...`);
            }
            // ✅ 마지막 시도든 아니든 동일 provider로 재시도 (Gemini 폴백 제거)
            extraInstruction = prependInvalidJsonResponseInstruction(extraInstruction);
            if (attempt < MAX_ATTEMPTS) {
              lastFailReason = `AI 거부 응답 (${raw.substring(0, 60)}...)`;
              continue;
            }
            // 마지막 시도: 거부 응답에서도 JSON 추출 시도 (후속 코드에서 safeParseJson이 처리)
            console.warn(`[ContentGenerator] ⚠️ ${provider} 최종 거부 → JSON 추출 시도로 진행`);
          }
        }

      } catch (apiError) {
        const errorMsg = (apiError as Error).message || '';
        const isNetworkError =
          errorMsg.includes('타임아웃') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('네트워크') ||
          errorMsg.includes('network') ||
          errorMsg.includes('ECONNRESET') ||
          errorMsg.includes('ENOTFOUND') ||
          errorMsg.includes('fetch failed') ||
          errorMsg.includes('응답 대기 시간 초과') ||
          errorMsg.includes('연결 실패') || // ✅ 한글화된 네트워크 오류 처리
          // ✅ 503 서버 과부하 오류 추가 (Gemini API 과부하 시)
          errorMsg.includes('503') ||
          errorMsg.includes('overloaded') ||
          errorMsg.includes('Service Unavailable') ||
          errorMsg.includes('서버 오류') ||
          errorMsg.includes('500') ||
          errorMsg.includes('502') ||
          errorMsg.includes('504');

        if (isNetworkError && provider === 'gemini') {
          networkErrorCount++;

          // ✅ Gemini 전용: 네트워크 에러 시 더 많이 재시도 (폴백 없음)
          if (networkErrorCount <= GEMINI_MAX_RETRIES) {
            const retryDelay = GEMINI_RETRY_DELAYS[Math.min(networkErrorCount - 1, GEMINI_RETRY_DELAYS.length - 1)];

            console.log(`\n${'='.repeat(60)}`);
            console.log(`[Gemini 재시도] ⏳ 네트워크 에러 ${networkErrorCount}/${GEMINI_MAX_RETRIES}`);
            console.log(`[Gemini 재시도] 💡 ${retryDelay / 1000}초 후 자동 재시도합니다...`);
            console.log(`[Gemini 재시도] 📡 인터넷 연결을 확인해주세요.`);
            console.log(`${'='.repeat(60)}\n`);

            // 점진적 대기 후 재시도
            await sleepWithAbort(retryDelay, signal);
            continue;
          }

          // ✅ [2026-04-11 FIX] 네트워크 재시도 소진 → 타 엔진 자동 폴백 제거
          // callGemini 내부에서 이미 모델 순환(Flash→Lite→Pro)을 수행하므로,
          // 여기서 추가 재시도 없이 즉시 throw하여 사용자에게 실패 원인 표시
        }

        // ✅ [2026-04-11 FIX] 할당량 초과(429) — 타 엔진 자동 폴백 제거
        // callGemini 내부에서 이미 모델별 429 재시도 + 순환을 처리하므로,
        // 여기까지 올라온 429는 모든 모델이 소진된 상태. 즉시 throw.
        if (errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('limit: 0') || errorMsg.includes('사용량 초과')) {
          console.warn(`[ContentGenerator] ${provider} 할당량 초과 — 모든 내부 모델 소진. 즉시 실패 처리.`);
        }

        // 네트워크 에러가 아닌 경우 (API 키 문제 등) 그대로 throw
        throw apiError;
      }

      // ⚠️ JSON 파싱 시도 (safeParseJson이 이미 JSON5와 여러 재시도 로직 포함)
      let parsed: StructuredContent;
      try {
        parsed = safeParseJson<StructuredContent>(raw);
        console.log(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: JSON 파싱 성공`);

        // ✅ [2026-04-11 FIX] 제목 개행 제거 — AI가 selectedTitle에 줄바꿈을 넣으면
        // 제목이 잘리거나 본문 첫 줄이 제목에 포함되는 버그 발생
        if (parsed.selectedTitle && typeof parsed.selectedTitle === 'string') {
          parsed.selectedTitle = parsed.selectedTitle.replace(/[\r\n]+/g, ' ').trim();
        }
        if (Array.isArray(parsed.titleCandidates)) {
          parsed.titleCandidates = parsed.titleCandidates.map((c: any) => ({
            ...c,
            text: typeof c?.text === 'string' ? c.text.replace(/[\r\n]+/g, ' ').trim() : c?.text,
          }));
        }

        const looseRecovery = recoverLooseStructuredContentFields(parsed);
        if (looseRecovery.bodyRecovered || looseRecovery.headingsRecovered) {
          console.warn(
            `[ContentGenerator] 느슨한 AI 응답 구조 복구: ` +
            `body=${looseRecovery.bodySource || 'none'}, headings=${looseRecovery.headingsSource || 'none'}`
          );
        }
      } catch (parseError) {
        console.error(`[ContentGenerator] 시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}: JSON 파싱 실패 - 재시도 필요:`, (parseError as Error).message);
        console.error(`[ContentGenerator] 📋 파싱 실패한 raw 응답 앞 300자: ${raw?.substring(0, 300)}`);
        lastFailReason = `JSON 파싱 실패: ${(parseError as Error).message?.substring(0, 100)}`;

        // 마지막 시도가 아니면 재시도
        if (attempt < MAX_ATTEMPTS) {
          console.log(`[시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}] 재시도 중... AI에게 더 엄격한 JSON 형식 요청`);
          // ✅ [v1.4.14] 30줄 → 3줄로 축약. 재시도 시 토큰 -90%
          extraInstruction = prependJsonParseRetryInstruction({ attempt, previousInstruction: extraInstruction });
          continue; // 다음 시도로
        } else {
          // 마지막 시도도 실패
          throw parseError;
        }
      }

      // ✅ CRITICAL: bodyPlain 복구 로직 (Gemini가 'body' 필드로 반환하는 경우 처리)
      // AI가 bodyPlain 대신 body로 반환하거나, headings에만 content가 있는 경우 복구
      if (!parsed.bodyPlain || parsed.bodyPlain.trim().length === 0) {
        // 1차: 'body' 필드에서 복구 시도
        if ((parsed as any).body && typeof (parsed as any).body === 'string' && (parsed as any).body.trim().length > 0) {
          parsed.bodyPlain = (parsed as any).body;
          console.warn('[ContentGenerator] bodyPlain 누락 → body 필드에서 복구');
        }
        // 2차: headings의 content/summary에서 복구 시도
        else if (parsed.headings && parsed.headings.length > 0) {
          const headingContents: string[] = [];
          for (const h of parsed.headings) {
            const headingTitle = h.title || '';
            const headingBody = h.content || h.summary || '';
            if (headingTitle && headingBody) {
              headingContents.push(`${headingTitle}\n\n${headingBody}`);
            } else if (headingBody) {
              headingContents.push(headingBody);
            }
          }
          if (headingContents.length > 0) {
            parsed.bodyPlain = headingContents.join('\n\n\n');
            console.warn(`[ContentGenerator] bodyPlain 누락 → headings에서 복구 (${headingContents.length}개 섹션)`);
          }
        }
        // 3차: bodyHtml에서 텍스트 추출
        else if (parsed.bodyHtml && parsed.bodyHtml.trim().length > 0) {
          parsed.bodyPlain = parsed.bodyHtml
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
          console.warn('[ContentGenerator] bodyPlain 누락 → bodyHtml에서 복구');
        }
      }

      // 이스케이프 문자 정리 (JSON 파싱 후)
      if (parsed.bodyPlain) {
        parsed.bodyPlain = cleanEscapeSequences(parsed.bodyPlain);
      }
      if (parsed.bodyHtml) {
        parsed.bodyHtml = cleanEscapeSequences(parsed.bodyHtml);
      }

      // ⚠️ CRITICAL: 중복 소제목 제거 (AI가 같은 소제목을 반복하는 경우)
      if (parsed.bodyPlain && parsed.headings && parsed.headings.length > 0) {
        parsed.bodyPlain = removeDuplicateHeadings(parsed.bodyPlain, parsed.headings);

        // ⚠️ CRITICAL: 전체 글 구조 반복 감지 및 제거
        parsed.bodyPlain = removeRepeatedFullContent(parsed.bodyPlain, parsed.headings);
      }

      // ⚠️ 소제목 순서 및 중복 검증 (첫 시도 실패 → 1회 재시도 → 통과)
      // ✅ 성능과 품질 균형: 한 번만 재시도, 두 번째도 실패하면 통과
      const headingOrderValidation = validateHeadingOrder(parsed.headings, source.articleType);
      const isLastAttempt = attempt >= MAX_ATTEMPTS;
      const duplicateContentValidation = detectDuplicateContent(parsed.bodyPlain || '', parsed.headings, isLastAttempt);

      if (!duplicateContentValidation.valid && attempt < MAX_ATTEMPTS) {
        const errs = duplicateContentValidation.errors.slice(0, 3).join(', ');
        console.warn(`[ContentGenerator] 중복/패턴 하드게이트 실패: ${errs}`);
        lastFailReason = `중복/패턴 감지: ${errs}`;
        // ✅ [v1.4.14] 5줄 → 1줄 축약
        extraInstruction = prependDuplicatePatternRetryInstruction({
          errors: errs,
          previousInstruction: extraInstruction,
        });
        continue;
      }

      if (!headingOrderValidation.valid || !duplicateContentValidation.valid) {
        const validationErrors = [
          ...headingOrderValidation.errors,
          ...duplicateContentValidation.errors
        ];

        // ✅ 첫 번째 시도에서만 한 번 재시도 (속도와 품질 균형)
        if (attempt === 0) {
          console.warn(`[ContentGenerator] 검증 실패 (1회 재시도): ${validationErrors.slice(0, 2).join(', ')}`);
          extraInstruction = prependValidationRetryInstruction(extraInstruction);
          continue; // 한 번만 재시도
        }

        // ✅ 두 번째 시도(attempt >= 1)에서는 경고 후 바로 통과
        console.warn(`[ContentGenerator] 검증 경고 (통과 처리): ${validationErrors.length}개 이슈`);

        if (!parsed.quality) {
          parsed.quality = {
            aiDetectionRisk: 'low',
            legalRisk: 'safe',
            seoScore: 70,
            originalityScore: 70,
            readabilityScore: 70,
            warnings: [],
          };
        }
        if (!parsed.quality.warnings) {
          parsed.quality.warnings = [];
        }
        parsed.quality.warnings.push(`검증 경고: ${validationErrors.slice(0, 2).join(', ')}`);
      }

      validateStructuredContent(parsed, source);

      // ✅ 제목 전체가 그대로 붙어버린 소제목들에서 제목 부분을 한 번 더 제거 (모드/카테고리 무관 공통 처리)
      stripSelectedTitlePrefixFromHeadings(parsed);

      // ✅ [2026-07-03] 소제목 앞 "{화제 인물}까지 " 매달린 훅 제거 (실명 강제 프롬프트 오버적용).
      //   (a) 즉시 반복("박지성까지 박지성...")은 컨텍스트 무관, (b) 제목 주어 매달림("박지성까지 팬들이...")은
      //   연예/스포츠 등 인물 중심 글에서만(맛집 "김치찌개까지 맛있는" 통합형 오탐 방지).
      let _personCentricHeadings = false;
      try {
        const { inferHallucinationCategory } = require('./content/hallucinationCheck');
        _personCentricHeadings = inferHallucinationCategory({
          contentMode: source.contentMode,
          toneStyle: source.toneStyle,
          categoryHint: source.categoryHint,
        }) === 'celebrity';
      } catch { /* best-effort */ }
      stripLeadingSubjectHookFromHeadings(parsed, _personCentricHeadings);

      // ✅ [소제목 최적화 마스터 모듈] - 구조 검증 후, 모드별 헤딩 타이틀만 보정
      optimizeHeadingsForMode(parsed, source);

      // ✅ [소제목 본문 동기화] - Stage 1 짧은 소제목을 Stage 2 본문의 전체 소제목으로 업데이트
      syncHeadingsWithBodyPlain(parsed);

      // ✅ [v2.10.297] HTML 태그 박멸 — 모든 모드에 무조건 적용 (모드별 검증 함수 우회 시에도 보장)
      sanitizeContentHtmlTags(parsed);
      // ✅ [v1.4.52] 출처 날조 sanitizer — 모든 모드에 무조건 적용 (SEO/홈판/비즈니스/리뷰 등)
      // 모드별 검증 함수 우회 시에도 sanitization 보장
      sanitizeContentFakeSources(parsed);

      // ✅ 모드별 전용 검증 (제목/도입부/톤 등 추가 체크)
      validateSeoContent(parsed, source);      // SEO 모드: 키워드/숫자/트리거 검증
      validateHomefeedContent(parsed, source); // 홈판 모드: 소제목/도입부/기자체 검증
      validateBusinessContent(parsed, source); // ✅ [v1.4.24] business 모드: 가짜 번호/광고법/CTA 검증

      // [2026-06-23] "키워드 그대로 제목으로 사용" 모드: 아래 제목 품질 패치/재생성을 전면 스킵하고
      //   키워드를 verbatim으로 고정한다. 이 패치 블록(seo/homefeed/affiliate)이 useKeywordAsTitle
      //   플래그를 무시하고 클릭유도형/키워드-prefix 제목으로 덮어써서 "키워드 그대로"가 안 먹고
      //   "종합소득세 환급일 지연 이유, 들어오지? (2026년 최신)" 같은 결과가 나오던 버그.
      const _useKwTitle = !!source.useKeywordAsTitle;
      if (_useKwTitle) {
        // keywordForTitle 우선, 비어 있으면 source의 기본 키워드로 폴백 — 플로우(단일/풀오토/연속)마다
        // 전달 필드가 달라도 verbatim이 작동하도록.
        const _kw = resolveKeywordAsTitleValue(source);
        if (_kw) {
          parsed = applyKeywordAsTitleLock(parsed as any, _kw) as StructuredContent;
        }
      }

      if (!_useKwTitle && (mode === 'seo' || mode === 'mate')) {
        const seoKeyword = getPrimaryKeywordFromSource(source);
        const issues = computeSeoTitleCriticalIssues(parsed.selectedTitle, seoKeyword);
        if (issues.length > 0 && attempt < MAX_ATTEMPTS) {
          if (costPolicy.allowLlmTitlePatch) {
            try {
              const patch = await generateTitleOnlyPatch(source, 'seo', source.categoryHint, provider);
              if (patch.selectedTitle) parsed.selectedTitle = patch.selectedTitle;
              if (patch.titleCandidates && patch.titleCandidates.length > 0) {
                parsed.titleCandidates = patch.titleCandidates;
                parsed.titleAlternatives = patch.titleAlternatives || patch.titleCandidates.map(c => c.text);
              }
              if (!parsed.quality) {
                parsed.quality = {
                  aiDetectionRisk: 'low',
                  legalRisk: 'safe',
                  seoScore: 70,
                  originalityScore: 70,
                  readabilityScore: 70,
                  warnings: [],
                };
              }
              parsed.quality.warnings = [
                ...(parsed.quality.warnings || []),
                `TitlePatch(seo): ${issues.join(', ')}`,
              ];
            } catch {
            }
          } else {
            console.log(`[TitlePatch] costSaver ON — SEO 제목 LLM 패치 생략, 로컬 보정 적용: ${issues.join(', ')}`);
          }

          // 패치 후에는 키워드 포함 여부만 경고한다. 앞쪽 강제 이동은 제목 의미를 깨뜨릴 수 있다.
          if (seoKeyword && parsed.selectedTitle) {
            const kwWords = seoKeyword.trim().split(/[\s,/\-]+/).filter((w: string) => w.length >= 2);
            const firstKwWord = kwWords[0] || seoKeyword.trim();
            const patchedTitle = parsed.selectedTitle.trim();
            const kwIdx = patchedTitle.indexOf(firstKwWord);
            if (kwIdx < 0) {
              console.warn(`[TitlePatch] SEO 제목에 핵심 주제어가 없음. 다음 품질 게이트에서 재평가: "${patchedTitle}"`);
            }
          }
        }
      }

      if (!_useKwTitle && mode === 'homefeed') {
        const hfKeyword = getPrimaryKeywordFromSource(source);
        const titleIssues = computeHomefeedTitleCriticalIssues(parsed.selectedTitle, hfKeyword);
        if (titleIssues.length > 0 && attempt < MAX_ATTEMPTS) {
          if (costPolicy.allowLlmTitlePatch) {
            try {
              const patch = await generateTitleOnlyPatch(source, 'homefeed', source.categoryHint, provider);
              if (patch.selectedTitle) parsed.selectedTitle = patch.selectedTitle;
              if (patch.titleCandidates && patch.titleCandidates.length > 0) {
                parsed.titleCandidates = patch.titleCandidates;
                parsed.titleAlternatives = patch.titleAlternatives || patch.titleCandidates.map(c => c.text);
              }
              if (!parsed.quality) {
                parsed.quality = {
                  aiDetectionRisk: 'low',
                  legalRisk: 'safe',
                  seoScore: 70,
                  originalityScore: 70,
                  readabilityScore: 70,
                  warnings: [],
                };
              }
              parsed.quality.warnings = [
                ...(parsed.quality.warnings || []),
                `TitlePatch(homefeed): ${titleIssues.join(', ')}`,
              ];
            } catch {
            }
          } else {
            console.log(`[TitlePatch] costSaver ON — 홈판 제목 LLM 패치 생략, 로컬 보정 적용: ${titleIssues.join(', ')}`);
          }

          // 제목 패치 결과는 품질 게이트에서 다시 평가한다. 사후 문자열 재배치는
          // 제목의 의미와 자연스러운 호흡을 깨뜨리므로 수행하지 않는다.
        }

        // ✅ 비용 절감 모드 기본 ON — 도입부 재작성 비활성화 (사용자 명시 OFF 시에만 동작)
        const introIssues = computeHomefeedIntroCriticalIssues(parsed.introduction);
        if (introIssues.length > 0 && attempt < MAX_ATTEMPTS && costPolicy.allowLlmIntroPatch) {
          const patch = await generateHomefeedIntroOnlyPatch(source, parsed, provider);
          if (patch?.introduction) {
            parsed.introduction = patch.introduction;
            if (!parsed.quality) {
              parsed.quality = {
                aiDetectionRisk: 'low',
                legalRisk: 'safe',
                seoScore: 70,
                originalityScore: 70,
                readabilityScore: 70,
                warnings: [],
              };
            }
            parsed.quality.warnings = [
              ...(parsed.quality.warnings || []),
              `IntroPatch(homefeed): ${introIssues.join(', ')}`,
            ];
          }
        }
      }

      // ✅ [v2.10.300] TitlePatch/IntroPatch 후 HTML sanitize 재적용 —
      //   patch가 generateTitleOnlyPatch / generateHomefeedIntroOnlyPatch로 새 LLM 호출 →
      //   반환된 selectedTitle/titleCandidates/introduction에 HTML 태그가 들어올 수 있음.
      //   라인 7484의 첫 sanitize는 patch 전에만 적용되므로, patch 후 한 번 더 박멸.
      sanitizeContentHtmlTags(parsed);

      // ✅ [v1.4.18] 소제목 키워드 누락 사후 패치 — 재시도 없이 즉시 보정
      // SEO/홈판 모드에서 메인 키워드가 빠진 소제목을 자동으로 키워드 포함 형태로 변환
      if ((mode === 'seo' || mode === 'homefeed' || mode === 'mate') && Array.isArray(parsed.headings)) {
        const primaryKw = getPrimaryKeywordFromSource(source);
        if (primaryKw) {
          // ✅ [v2.10.227] 사용자 보고: 소제목 "5월 5월 25일 이후 잔액 소멸 이유" (5월 중복)
          //   원인 후보: (a) 따옴표·특수문자 포함된 kwCore가 heading의 평문과 매칭 실패 → 패치 강제 발동,
          //              이후 sanitizer가 따옴표만 제거해 결과적으로 단어 중복
          //              (b) LLM이 자체 prefix를 추가했고 HeadingPatch가 한번 더 추가 (이미 dedup pass 통과한 케이스)
          //   방어: ① kwCore의 선행/후행 punct 제거 ② 패치 후 "kwCore kwCore" 연속 중복 collapse
          const headingPatch = applyHeadingKeywordPatch(parsed.headings as any, primaryKw, { maxPatches: 2 });
          parsed.headings = headingPatch.headings as any;
          if (!headingPatch.core) {
            console.log(`[HeadingPatch] ⏭️ kwCore가 빈 문자열 — 패치 스킵 (${headingPatch.reason})`);
          } else if (!headingPatch.shouldPatch) {
            console.log(`[HeadingPatch] ⏭️ 강제 prefix 스킵: reason=${headingPatch.reason}, kwCore="${headingPatch.core}"`);
          }
          if (headingPatch.targetPrefixCleanedCount > 0) {
            console.log(`[HeadingPatch] 🔧 선두 대상 조사 prefix ${headingPatch.targetPrefixCleanedCount}건 제거 (kwCore="${headingPatch.core}")`);
          }
          if (headingPatch.dedupedCount > 0) {
            console.log(`[HeadingDedup] 🔧 선두 중복 ${headingPatch.dedupedCount}건 제거 (kwCore="${headingPatch.core}")`);
          }
          if (headingPatch.patchedCount > 0) {
            if (!parsed.quality) {
              parsed.quality = {
                aiDetectionRisk: 'low',
                legalRisk: 'safe',
                seoScore: 70,
                originalityScore: 70,
                readabilityScore: 70,
                warnings: [],
              };
            }
            parsed.quality.warnings = [
              ...(parsed.quality.warnings || []),
              `HeadingPatch(${mode}): ${headingPatch.patchedCount}개 소제목에 메인 키워드 자동 추가`,
            ];
            // bodyPlain 재동기화
            try { syncHeadingsWithBodyPlain(parsed); } catch { /* ignore */ }
          }
        }
      }

      // ✅ [SPEC-KEYWORD-ENDGAME Phase 3] 세부키워드 커버리지 게이트 (SEO 모드만) — 서브키워드
      //   (사용자 추가분+블루오션)가 본문 어디에도 없으면 관련 소제목에 패치(롱테일 다면 노출).
      //   본문 어디든 있으면 자연 커버로 무변경. fail-open.
      if (mode === 'seo' && Array.isArray(parsed.headings)) {
        try {
          const _allKw: string[] = ((source.metadata as any)?.keywords || []).map((k: any) => String(k || '').trim()).filter(Boolean);
          const _subKws = _allKw.slice(1);
          if (_subKws.length > 0) {
            const { enforceSubKeywordCoverage } = require('./content/subKeywordCoverageGate');
            const cov = enforceSubKeywordCoverage(parsed, _subKws, { maxKeywords: 3 });
            const covered = cov.items.filter((i: any) => i.inHeadings || i.inBody).length;
            console.log(`[SubKwCoverage] 서브키워드 ${cov.items.length}개 중 자연커버 ${covered} · 패치 ${cov.patchedCount}`);
            if (cov.patchedCount > 0) {
              try { syncHeadingsWithBodyPlain(parsed); } catch { /* ignore */ }
            }
          }
        } catch (e) {
          console.warn('[SubKwCoverage] 게이트 스킵:', (e as Error)?.message);
        }
      }

      const customPromptAdherence = assessCustomPromptAdherence(parsed, source);
      if (customPromptAdherence.checked) {
        if (!parsed.quality) {
          parsed.quality = {
            aiDetectionRisk: 'low',
            legalRisk: 'safe',
            seoScore: 70,
            originalityScore: 70,
            readabilityScore: 70,
            warnings: [],
          };
        }
        (parsed.quality as any).customPromptAdherence = {
          score: customPromptAdherence.score,
          passed: customPromptAdherence.passed,
          missingTerms: customPromptAdherence.missingTerms.slice(0, 10),
          foundForbiddenTerms: customPromptAdherence.foundForbiddenTerms.slice(0, 8),
          missingFeatures: customPromptAdherence.missingFeatures,
        };

        if (!customPromptAdherence.passed && attempt < MAX_ATTEMPTS) {
          lastFailReason = `사용자 프롬프트 미준수: ${customPromptAdherence.issues.join(' / ')}`;
          console.warn(`[PromptAdherence] 🔁 자동 보정 재시도: ${lastFailReason}`);
          extraInstruction = `${customPromptAdherence.retryInstruction}\n${extraInstruction}`;
          continue;
        }

        if (!customPromptAdherence.passed) {
          parsed.quality.warnings = [
            ...(parsed.quality.warnings || []),
            `사용자 프롬프트 준수 경고(${customPromptAdherence.score}점): ${customPromptAdherence.issues.join(' / ')}`,
          ];
          console.warn(`[PromptAdherence] ⚠️ 최종 경고 후 통과: ${customPromptAdherence.issues.join(' / ')}`);
        } else {
          console.log(`[PromptAdherence] ✅ 사용자 프롬프트 준수 통과 (${customPromptAdherence.score}점)`);
        }
      }

      // ✅ [SPEC-PROMPT-2026-REFRESH Phase 1 / v2.10.231] 일반론 도망 + 인용 부족 감지
      //   배경: LLM이 RAG 자료를 받고도 "고양이는 생선을 좋아합니다" 같은 보편 진술로 도망치는 패턴.
      //   조치: 일반론 트리거 15개 어휘 + 인용 토큰 [자료N] 밀도 측정 → 임계 초과 시 quality.warnings 추가.
      //   [v2.10.234 Phase 1b] 첫 시도(attempt === 0)에서 임계 초과 시 재생성 트리거 추가.
      //   [v2.10.237 PlatitudeDetector v2] ROUGE-L overlap + 사실 단락 인용 배치 비율 추가 검증.
      //     source.factCheckRawSource 가 있으면(RAG 활성 케이스) overlap 자동 측정.
      let platitudeReportRef: ReturnType<typeof detectPlatitudes> | null = null;
      try {
        const ragSourceForCheck = (source as any).factCheckRawSource as string | undefined;
        const platitudeReport = detectPlatitudes(parsed, { ragSource: ragSourceForCheck });
        platitudeReportRef = platitudeReport;
        if (platitudeReport.exceedsThreshold) {
          console.warn(`[PlatitudeDetector] ⚠️ ${platitudeReport.reason}`);
          if (!parsed.quality) {
            parsed.quality = {
              aiDetectionRisk: 'low',
              legalRisk: 'safe',
              seoScore: 70,
              originalityScore: 70,
              readabilityScore: 70,
              warnings: [],
            };
          }
          parsed.quality.warnings = [
            ...(parsed.quality.warnings || []),
            `Faithfulness 경고: ${platitudeReport.reason}`,
          ];
          // 원본 보고서 보존 — 추후 재생성 트리거 판단용
          (parsed as any).platitudeReport = platitudeReport;
        } else {
          const overlapInfo = platitudeReport.rougeLOverlap >= 0
            ? `, RAG overlap ${platitudeReport.rougeLOverlap.toFixed(2)}`
            : '';
          const placementInfo = platitudeReport.factualParagraphCount > 0
            ? `, 사실단락 인용 ${(platitudeReport.citationPlacementRatio * 100).toFixed(0)}%`
            : '';
          console.log(
            `[PlatitudeDetector] ✅ 통과 — 일반론 ${platitudeReport.platitudeHitCount}회, 인용 밀도 ${platitudeReport.citationDensity.toFixed(2)}${overlapInfo}${placementInfo}`,
          );
        }
      } catch (platitudeErr: any) {
        console.warn('[PlatitudeDetector] 감지 중 예외 — graceful skip:', platitudeErr?.message || platitudeErr);
      }

      // ✅ [v2.10.234 Phase 1b] 일반론 도망 감지 시 첫 시도(attempt === 0)에서 재생성 트리거
      //   재생성 시 prompt에 faithfulness 강화 추가 지시 + 일반론 어휘 명시 회피 요청.
      //   2회 이상 시도부터는 재생성 X (속도 vs 품질 균형 — 기존 검증 실패 재시도 패턴과 동일).
      // ✅ [2026-05-31 S2] attempt===0 한정 → attempt < MAX_ATTEMPTS 로 확대.
      //   2회 이상 시도에서도 일반론 도망이 감지되면 재생성(여전히 MAX_ATTEMPTS로 bounded).
      //   기존엔 첫 시도만 잡아 재시도 중 다시 일반론이 나와도 통과되던 갭(분석 팀3) 차단.
      if (platitudeReportRef && platitudeReportRef.exceedsThreshold && attempt < MAX_ATTEMPTS) {
        console.warn(`[ContentGenerator] 🔄 Faithfulness 실패 — 재시도(attempt ${attempt}): ${platitudeReportRef.reason}`);
        lastFailReason = `Faithfulness 실패: ${platitudeReportRef.reason}`;
        const platitudeList = platitudeReportRef.matchedTriggers.slice(0, 5).join(', ');
        extraInstruction = prependFaithfulnessRetryInstruction({
          matchedTriggers: platitudeList,
          previousInstruction: extraInstruction,
        });
        continue;
      }

      // ✅ [Gap A — SPEC-REVIEW-001 확장] 재시도 소진 후에도 임계 초과(terminal).
      //   여기 도달했다는 건 위 재시도 조건(attempt < MAX_ATTEMPTS)이 false라는 뜻 →
      //   더 이상 재생성 기회가 없는데도 Faithfulness가 미해결인 상태다.
      //   기존엔 quality.warnings 한 줄만 남기고 그대로 발행되던 갭.
      //   - 항상: aiDetectionRisk='high'로 격상 + 구조적 경고(UI 위험 표시가 정직해짐).
      //   - 옵트인(CONTENT_HARDBLOCK_ON_PLATITUDE): 발행 차단(throw → 8505 catch에서 생성 실패 전파).
      if (platitudeReportRef && platitudeReportRef.exceedsThreshold) {
        if (!parsed.quality) {
          parsed.quality = {
            aiDetectionRisk: 'high',
            legalRisk: 'safe',
            seoScore: 70,
            originalityScore: 70,
            readabilityScore: 70,
            warnings: [],
          };
        }
        parsed.quality.aiDetectionRisk = 'high';
        parsed.quality.warnings = [
          ...(parsed.quality.warnings || []),
          `Faithfulness 미해결(재시도 ${MAX_ATTEMPTS + 1}회 소진): ${platitudeReportRef.reason}`,
        ];
        console.warn(
          `[ContentGenerator] ⚠️ Faithfulness 미해결로 발행 — aiDetectionRisk=high 격상: ${platitudeReportRef.reason}`,
        );
        if (isPlatitudeHardBlockEnabled()) {
          console.error('[ContentGenerator] ⛔ 하드블록(옵트인) 활성 — 발행 차단(생성 실패 처리)');
          throw new Error(`발행 차단(옵트인 하드블록): Faithfulness 임계 초과 — ${platitudeReportRef.reason}`);
        }
      }

      // ✅ [Gap C 시맨틱 — SPEC-REVIEW-001 확장] 옵트인 섹션 변별 판정.
      //   어휘 중복도(C2)는 좋은 글과 텅 빈 글을 분리 못 함(실측). 그래서 선택 엔진(Gemini=무료)에
      //   "각 H2가 서로 다른 정보 단위인가"를 직접 묻는다. 기본 OFF, ungrounded 키워드 글 한정,
      //   생성당 1회만 호출(비용 가드), fail-open(판정 실패는 통과 처리).
      if (
        isSemanticDistinctnessJudgeEnabled()
        && !_distinctnessJudgeUsed
        && mode !== 'affiliate'
        && !isShoppingConnectMode
        && !hasGroundingSource(source)
      ) {
        _distinctnessJudgeUsed = true; // 호출 여부와 무관하게 1회로 제한
        const judgeCaller = async (jp: string): Promise<string> => {
          const jt = 0.2; // 결정적 JSON 유도
          const jc = 300; // <1000 → 60초 타임아웃 + 짧은 JSON 응답 길이거부 없음 (각 호출 내부 타임아웃+signal로 abort)
          if (provider === 'agent-codex' || provider === 'agent-claude') return callAgent(provider, jp, { signal, raw: true });
          if (provider === 'openai') return callOpenAI(jp, jt, jc, signal);
          if (provider === 'claude') return callClaude(jp, jt, jc, signal);
          if (provider === 'perplexity') return callPerplexity(jp, jt, jc, signal);
          return callGemini(jp, jt, jc, { signal });
        };
        const verdict = await judgeSectionDistinctness(parsed, judgeCaller);
        if (verdict.judged && !verdict.distinct) {
          console.warn(`[DistinctnessJudge] 🔁 섹션 중복 감지: ${verdict.reason}`);
          if (attempt < MAX_ATTEMPTS) {
            lastFailReason = `섹션 중복(시맨틱): ${verdict.reason}`;
            extraInstruction = prependSectionDistinctnessRetryInstruction(extraInstruction);
            continue;
          }
          // terminal: 재생성 기회 소진 → 갭 A와 동일하게 high 격상 + 옵트인 차단.
          if (!parsed.quality) {
            parsed.quality = {
              aiDetectionRisk: 'high', legalRisk: 'safe',
              seoScore: 70, originalityScore: 70, readabilityScore: 70, warnings: [],
            };
          }
          parsed.quality.aiDetectionRisk = 'high';
          parsed.quality.warnings = [
            ...(parsed.quality.warnings || []),
            `섹션 중복 미해결(시맨틱): ${verdict.reason}`,
          ];
          console.warn(`[DistinctnessJudge] ⚠️ 섹션 중복 미해결로 발행 — aiDetectionRisk=high 격상`);
          if (isPlatitudeHardBlockEnabled()) {
            console.error('[DistinctnessJudge] ⛔ 하드블록(옵트인) 활성 — 발행 차단');
            throw new Error(`발행 차단(옵트인 하드블록): 섹션 중복 미해결 — ${verdict.reason}`);
          }
        } else {
          console.log(`[DistinctnessJudge] ✅ ${verdict.judged ? '변별 양호' : '판정 생략'} — ${verdict.reason}`);
        }
      }

      // ✅ [2026-02-01] 쇼핑커넥트(affiliate) 모드 제목 검증 및 패치
      // ✅ [FIX] 모든 시도에서 제목 패치 적용 (attempt < MAX_ATTEMPTS 조건 제거)
      // ✅ [2026-02-04 FIX] isShoppingConnectMode도 체크하여 URL 기반 쇼핑커넥트에서도 제목 패치 작동
      if (!_useKwTitle && (isShoppingConnectMode || mode === 'affiliate')) {
        const titleIssues = computeAffiliateTitleCriticalIssues(parsed.selectedTitle, source);
        if (titleIssues.length > 0 && costPolicy.allowLlmTitlePatch) {
          try {
            console.log(`[ContentGenerator] 🛒 쇼핑커넥트 제목 이슈 감지: ${titleIssues.join(', ')}`);
            const patch = await generateTitleOnlyPatch(source, 'affiliate', source.categoryHint, provider);
            if (patch.selectedTitle) {
              console.log(`[ContentGenerator] ✅ 제목 패치 적용: "${patch.selectedTitle}"`);
              parsed.selectedTitle = patch.selectedTitle;
            }
            if (patch.titleCandidates && patch.titleCandidates.length > 0) {
              parsed.titleCandidates = patch.titleCandidates;
              parsed.titleAlternatives = patch.titleAlternatives || patch.titleCandidates.map(c => c.text);
            }
            if (!parsed.quality) {
              parsed.quality = {
                aiDetectionRisk: 'low',
                legalRisk: 'safe',
                seoScore: 70,
                originalityScore: 70,
                readabilityScore: 70,
                warnings: [],
              };
            }
            parsed.quality.warnings = [
              ...(parsed.quality.warnings || []),
              `TitlePatch(affiliate): ${titleIssues.join(', ')}`,
            ];
          } catch {
          }
        } else if (titleIssues.length > 0) {
          console.log(`[TitlePatch] costSaver ON — 쇼핑커넥트 제목 LLM 패치 생략: ${titleIssues.join(', ')}`);
        }
      }

      const optimized = optimizeForViral(parsed, source);

      // ⚡ 과대광고 필터링 (AI 대신 후처리로 이동 - 타임아웃 방지)
      if (optimized.bodyPlain) {
        console.log('[ContentGenerator] 과대광고 필터링 적용 중...');
        optimized.bodyPlain = filterExaggeratedContent(optimized.bodyPlain);
      }

      // 최적화 후에도 이스케이프 문자 정리
      if (optimized.bodyPlain) {
        optimized.bodyPlain = cleanEscapeSequences(optimized.bodyPlain);
      }
      if (optimized.bodyHtml) {
        optimized.bodyHtml = cleanEscapeSequences(optimized.bodyHtml);
      }

      // ✅ [자료]/[자료N] 인용 토큰 제거 — Faithfulness 측정(detectPlatitudes, 위 7821)용
      //   내부 마커이므로 발행 본문엔 노출되면 안 됨. 측정이 끝난 뒤 최종 단계에서 strip.
      //   앞 공백까지 함께 제거해 "한다 [자료]." → "한다." 형태로 깔끔히.
      // ✅ [발행 안전] 내부 마커([자료N]·[원본 텍스트]·[Article Content]) 일괄 제거 — 발행물 절대 노출 금지.
      const stripCitationTokens = stripInternalMarkers;
      if (optimized.bodyPlain) optimized.bodyPlain = stripCitationTokens(optimized.bodyPlain);
      if (optimized.bodyHtml) optimized.bodyHtml = stripCitationTokens(optimized.bodyHtml);
      // ✅ 도입부/마무리 필드도 strip — 날짜 "기준" 못박기·마커가 도입부에 남는 케이스 차단(별도 필드라 누락됐었음).
      if (typeof (optimized as any).introduction === 'string') (optimized as any).introduction = stripCitationTokens((optimized as any).introduction);
      if (typeof (optimized as any).conclusion === 'string') (optimized as any).conclusion = stripCitationTokens((optimized as any).conclusion);
      // 제목 누출이 가장 치명적 — selectedTitle/title + 소제목 title까지 일괄 제거.
      if (typeof (optimized as any).selectedTitle === 'string') {
        (optimized as any).selectedTitle = stripCitationTokens((optimized as any).selectedTitle);
      }
      if (typeof (optimized as any).title === 'string') {
        (optimized as any).title = stripCitationTokens((optimized as any).title);
      }
      if (Array.isArray(optimized.headings)) {
        optimized.headings = optimized.headings.map((h: any) => ({
          ...h,
          ...(typeof h.title === 'string' ? { title: stripCitationTokens(h.title) } : {}),
          ...(typeof h.content === 'string' ? { content: stripCitationTokens(h.content) } : {}),
          ...(typeof h.body === 'string' ? { body: stripCitationTokens(h.body) } : {}),
        }));
      }

      const compactLength = characterCount(optimized.bodyPlain, minChars);
      const plainLength = visibleCharacterCount(optimized.bodyPlain);
      if (plainLength !== compactLength) {
        console.log(`[ContentGenerator] 본문 분량: 표시 ${plainLength}자 / 공백 제외 ${compactLength}자`);
      }

      // ✅ [Phase 7-B] Source Fidelity 자동 재시도 (한 호출에 1회만)
      // 길이 검증 *전에* — fidelity 미달이면 LLM에 누락 fact 명시해 재요청.
      if (!_fidelityRetryUsed && (source.url || (source.rawText ?? '').length >= 500) && attempt < MAX_ATTEMPTS) {
        try {
          const { checkSourceFidelity, extractResultBody, buildFidelityRetryInstruction } = require('./content/sourceFidelityCheck');
          const _rb = extractResultBody(optimized as any);
          // ✅ [v2.10.173] URL 모드 strict 임계 — 원본 100% 보존 강제
          const _isUrlModeForRetry = !!source.url || source.sourceType === 'naver_news' || source.sourceType === 'daum_news';
          const _fid = checkSourceFidelity({
            rawText: source.rawText ?? '',
            resultBody: _rb,
            ...(_isUrlModeForRetry ? { minCompressionRatio: 0.85, minRetentionScore: 0.92 } : {}),
          });

          // [v2.10.169] 환각 표지 탐지 — sentiment mismatch + 부정 키워드 환각
          let _hallucinationFail = false;
          let _hallRetryInstruction = '';
          try {
            const { checkHallucination, buildHallucinationRetryInstruction, inferHallucinationCategory } = require('./content/hallucinationCheck');
            // ✅ [v2.10.176] 카테고리별 사전 분기 — false-positive 차단
            const _hallCategoryRetry = inferHallucinationCategory({
              contentMode: source.contentMode,
              toneStyle: source.toneStyle,
              categoryHint: source.categoryHint,
            });
            const _hall = checkHallucination(source.rawText ?? '', _rb, _hallCategoryRetry);
            if (_hall.isLikelyHallucinated) {
              _hallucinationFail = true;
              _hallRetryInstruction = buildHallucinationRetryInstruction(_hall);
              console.error(`[Hallucination] 🚨 강한 환각 감지 — 자동 재시도 트리거 (cat=${_hallCategoryRetry}, P${_hall.positiveOriginal}/N${_hall.negativeOriginal} → P${_hall.positiveResult}/N${_hall.negativeResult})`);
            }
          } catch { /* hallucination 모듈 실패 시 무시 */ }

          if (!_fid.passed || _hallucinationFail) {
            _fidelityRetryUsed = true;
            console.warn(`[Fidelity] Phase 7-B 자동 재시도: ${_fid.reason ?? ''}${_hallucinationFail ? ' + 환각 의심' : ''}`);
            // ✅ [v2.10.173] URL 모드 strict 임계를 재시도 지시문에도 반영
            const _retryThresholds = _isUrlModeForRetry ? { minCompressionRatio: 0.85, minRetentionScore: 0.92 } : undefined;
            extraInstruction = `${buildFidelityRetryInstruction(_fid, _retryThresholds)}\n${_hallRetryInstruction}\n${extraInstruction}`;
            continue; // for 루프 다음 attempt — 같은 attempt 카운트 보존
          }
        } catch (_e) { /* fidelity 모듈 실패 시 정상 흐름 */ }
      }

      // Final near-threshold output still deserves the real quality/safety
      // evaluation. Aborting before scoring discarded otherwise usable posts.
      const finalNearThresholdQualityEvaluation = isQuality90Mode(generationQualityMode)
        && shouldRunFinalQualityEvaluation({
          visibleChars: plainLength,
          validationMinChars,
          warningMinChars,
          attempt,
          maxAttempts: MAX_ATTEMPTS,
        });
      if (finalNearThresholdQualityEvaluation) {
        console.warn(
          `[ContentGenerator] 최종 본문이 권장 분량보다 짧지만 품질 검사를 계속합니다: ${plainLength}자 / 권장 ${validationMinChars}자`,
        );
      }

      // 검증: 질과 길이의 균형
      if (plainLength >= validationMinChars || finalNearThresholdQualityEvaluation) {
        // ✅ 성공 통계 업데이트
        stats.success++;
        if (attempt === 0) stats.attempts.first++;
        else if (attempt === 1) stats.attempts.second++;
        else if (attempt === 2) stats.attempts.third++;
        else if (attempt === 3) stats.attempts.fourth++;

        const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
        console.log(`[ContentGenerator] ✅ 성공! (시도 ${attempt + 1}번째) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);

        // ✅ AI 탐지 회피 처리 (Humanizer) - 고속 최적화
        console.log('[ContentGenerator] 🔄 AI 탐지 회피 + 네이버 최적화 처리 시작...');
        resetHumanizerLog(); // 로그 플래그 리셋

        // AI 탐지 위험도 분석
        const riskAnalysis = analyzeAiDetectionRisk(optimized.bodyPlain || '');
        console.log(`[ContentGenerator] AI 탐지 위험도: ${riskAnalysis.score}/100`);

        // SEO/Homefeed/Mate는 개인 표현·감탄사·동의어를 새로 삽입하지 않는다.
        // 의미와 근거를 보존하는 cleanup만 적용한다.
        const humanizeIntensity = resolveHumanizeIntensity((source.contentMode || 'seo') as PromptMode);

        // Humanize 적용
        if (optimized.bodyPlain) {
          optimized.bodyPlain = humanizeContent(optimized.bodyPlain, humanizeIntensity, false, source.toneStyle);
        }
        if (optimized.bodyHtml) {
          optimized.bodyHtml = humanizeHtmlContent(optimized.bodyHtml, humanizeIntensity);
        }

        // ✅ [v2.10.361] Perplexity 팩트 검증 + 자동 재작성 (사용자 체크박스 ON 시에만)
        //   환각/거짓 사실 의심 문장 자동 탐지 + 사실 기반 재작성. 비용 ~₩50~150/편.
        try {
          const _config = await loadConfig().catch(() => null);
          if ((_config as any)?.usePerplexityFactCheck === true && optimized.bodyPlain) {
            const { factCheckAndRewrite } = await import('./perplexityFactCheck.js');
            const _topic = String((source as any).title || (source as any).keyword || (source as any).primaryKeyword || '').slice(0, 100);
            const { corrected, result } = await factCheckAndRewrite(optimized.bodyPlain, _topic);
            if (result.suspicious.length > 0) {
              optimized.bodyPlain = corrected;
              // bodyHtml에도 동일 치환 (간단 string replace — exact match)
              if (optimized.bodyHtml) {
                for (const item of result.suspicious) {
                  if (optimized.bodyHtml.includes(item.original)) {
                    optimized.bodyHtml = optimized.bodyHtml.replace(item.original, item.replacement);
                  }
                }
              }
              console.log(`[ContentGenerator] 🌐 Perplexity 팩트검증: ${result.suspicious.length}개 의심 문장 자동 재작성 (${(result.durationMs / 1000).toFixed(1)}s)`);
            } else {
              console.log(`[ContentGenerator] 🌐 Perplexity 팩트검증: 의심 문장 없음 (${(result.durationMs / 1000).toFixed(1)}s)`);
            }
          }
        } catch (factCheckErr: any) {
          // 팩트 검증 실패는 글 생성 자체 실패가 아니므로 swallow + warn
          console.warn('[ContentGenerator] Perplexity 팩트검증 실패 (글은 그대로 사용):', factCheckErr?.message || factCheckErr);
        }

        // quality에 AI 탐지 정보 추가
        if (!optimized.quality) {
          optimized.quality = {
            aiDetectionRisk: 'low',
            legalRisk: 'safe',
            seoScore: 0,
            originalityScore: 0,
            readabilityScore: 0,
            warnings: [],
          };
        }
        optimized.quality.aiDetectionRisk = riskAnalysis.score >= 50 ? 'high' : riskAnalysis.score >= 25 ? 'medium' : 'low';
        if (riskAnalysis.issues.length > 0) {
          optimized.quality.warnings = [
            ...(optimized.quality.warnings || []),
            `AI 탐지 위험 요소: ${riskAnalysis.issues.join(', ')}`,
          ];
        }

        console.log(`[ContentGenerator] ✅ AI 탐지 회피 처리 완료 (강도: ${humanizeIntensity})`);

        // ✅ 네이버 최적화 처리 (2025.12 로직 대응)
        console.log('[ContentGenerator] 🚀 2025년 12월 네이버 최적화 처리 시작...');
        resetOptimizerLog(); // 로그 플래그 리셋

        // 중복 제거 + 저품질 제거 + 전문성 강화 + 애드포스트 최적화
        // Phase 3: LLM rubric 활성 또는 source.skipDictInjection=true 시 사전 후처리 OFF
        const skipDictInjection =
          isLlmRubricEnabled({ useLlmRubric: (source as any).useLlmRubric })
          || (source as any).skipDictInjection === true;
        if (optimized.bodyPlain) {
          optimized.bodyPlain = optimizeContentForNaver(
            optimized.bodyPlain,
            source.toneStyle,
            false,
            { skipDictInjection },
          );

          // Phase 5: Self-critique 2-pass — LLM이 자기 글을 페르소나 관점에서 점검 + 부분 재작성
          if (isSelfCritiqueEnabled({ enableSelfCritique: (source as any).enableSelfCritique })) {
            const personaCard = buildPersonaCard(detectCategory(source.toneStyle || 'general'));
            const critiqued = await selfCritiqueAndRewrite(
              optimized.bodyPlain,
              personaCard,
              (prompt: string) => callGemini(prompt, 0.3, 100, { useGrounding: false }),
            );
            if (critiqued.rewrote) {
              console.log(`[ContentGenerator] ✍️ Self-critique 재작성 적용 (${critiqued.source})`);
              optimized.bodyPlain = critiqued.body;
            } else {
              console.log(`[ContentGenerator] ✍️ Self-critique no-op (${critiqued.source})`);
            }
          }
        }
        if (optimized.bodyHtml) {
          optimized.bodyHtml = optimizeHtmlForNaver(optimized.bodyHtml);
        }

        // 네이버 점수 분석 — LLM rubric (semantic) vs deterministic keyword counter
        const useLlmRubric = isLlmRubricEnabled({ useLlmRubric: (source as any).useLlmRubric });
        const deterministicFallback = () => analyzeNaverScore(optimized.bodyPlain || '');
        const naverScore = useLlmRubric
          ? await analyzeContentBySemantic(
              optimized.bodyPlain || '',
              (prompt: string) => callGemini(prompt, 0.2, 100, { useGrounding: false }),
              deterministicFallback,
            )
          : deterministicFallback();
        const scoreSource = (naverScore as any).source ?? 'deterministic';
        console.log(`[ContentGenerator] 네이버 최적화 점수: ${naverScore.score}/100 (source: ${scoreSource})`);
        console.log(`[ContentGenerator] - 전문성: ${naverScore.details.expertise}, 독창성: ${naverScore.details.originality}`);
        console.log(`[ContentGenerator] - 가독성: ${naverScore.details.readability}, 참여도: ${naverScore.details.engagement}`);

        // quality에 네이버 점수 추가
        if (optimized.quality) {
          optimized.quality.seoScore = naverScore.score;
          optimized.quality.originalityScore = naverScore.details.originality;
          optimized.quality.readabilityScore = naverScore.details.readability;
          if (naverScore.suggestions.length > 0) {
            optimized.quality.warnings = [
              ...(optimized.quality.warnings || []),
              ...naverScore.suggestions.map(s => `💡 ${s}`),
            ];
          }
        }

        console.log('[ContentGenerator] ✅ 네이버 최적화 완료');

        // ✅ [v2.10.177 Phase 1 + v2.10.178 Phase 2.1] 통합 quality gate 계산 + 안전성 재시도
        //   Phase 1: 기존 점수와 동시 계산, decision은 로그+메타로만 보존
        //   Phase 2.1: safety < 50 (강한 환각·금지패턴 신호) 시 자동 재시도 1회 활성화
        //   다른 decision('patch' 등)은 다음 릴리즈에서 단계적 확대
        let _gateResult: any = null;
        let _quality90Assessment: ReturnType<typeof assessQuality90Gate> | null = null;
        // 2026-06-28: 실제 결과 기준 90점 게이트 대상 모드.
        // 기존에는 여기서 decision='pass'(80점 이상)이면 결과가 그대로 내려가
        // SEO/홈판/메이트 90점 목표와 실제 산출물이 어긋날 수 있었다.
        const _modeForGate = (source.contentMode === 'homefeed' || source.contentMode === 'affiliate' || source.contentMode === 'business' || source.contentMode === 'custom' || source.contentMode === 'mate')
          ? source.contentMode
          : 'seo';
        try {
          const { evaluate: evaluateQuality } = require('./content/qualityEvaluator');
          _gateResult = evaluateQuality({
            body: optimized.bodyPlain || '',
            title: optimized.selectedTitle || '',
            headings: optimized.headings || [],
            rawText: source.rawText || '',
            primaryKeyword: getPrimaryKeywordFromSource(source),
            secondaryKeywords: getSecondaryKeywordsFromSource(source),
            mode: _modeForGate,
            contentMode: source.contentMode,
            toneStyle: source.toneStyle,
            categoryHint: source.categoryHint,
            firstPartyEvidenceAvailable: hasExplicitFirstPartyEvidence(source),
            groundingText: [source.title, source.rawText, source.personalExperience]
              .filter(Boolean)
              .join('\n'),
            affiliateEvidenceMode: source.contentMode === 'affiliate'
              ? classifyAffiliateEvidence(source).mode
              : undefined,
          });
          const _modeLabelMap: Record<string, string> = { seo: 'SEO', homefeed: '홈판', affiliate: '제휴', business: '비즈니스', custom: '커스텀', mate: '메이트' };
          const _modeLabel = _modeLabelMap[_modeForGate] || _modeForGate;
          console.log(`[QualityGate] 🎯 ${_modeLabel} 모드 점수 ${_gateResult.modeScore.score}/100 · 종합 ${_gateResult.finalScore}/100 (안전 ${_gateResult.safetyScore.score} · 사람다움 ${_gateResult.humanlikeScore.score}) | decision=${_gateResult.decision}`);
          if (_gateResult.modeScore.issues.length > 0) {
            console.log(`[QualityGate] mode issues: ${_gateResult.modeScore.issues.slice(0, 2).join(' / ')}`);
          }
          if (_gateResult.humanlikeScore.issues.length > 0) {
            console.log(`[QualityGate] humanlike issues: ${_gateResult.humanlikeScore.issues.slice(0, 2).join(' / ')}`);
          }
          if (_gateResult.safetyScore.issues.length > 0) {
            console.log(`[QualityGate] safety issues: ${_gateResult.safetyScore.issues.slice(0, 2).join(' / ')}`);
          }
          _quality90Assessment = assessQuality90Gate(_gateResult, _modeForGate);
          if (_quality90Assessment.miss) {
            console.warn(`[QualityGate90] 🚧 자동 발행 하한 미달 — ${_quality90Assessment.blockingReasons.join(', ')}`);
          } else if (_quality90Assessment.nearTargetAccepted) {
            console.warn(`[QualityGate90] 90점 목표 근접 통과 — mode=${_gateResult.modeScore.score}, final=${_gateResult.finalScore}`);
          } else if (_quality90Assessment.enabled) {
            console.log(`[QualityGate90] ✅ 실제 결과 90점 기준 통과 (${_modeForGate})`);
          }
          // quality 객체에 점수 + decision 동봉 (UI 가시화는 다음 릴리즈)
          if (optimized.quality) {
            (optimized.quality as any).qualityGate = {
              finalScore: _gateResult.finalScore,
              modeScore: _gateResult.modeScore.score,
              safetyScore: _gateResult.safetyScore.score,
              humanlikeScore: _gateResult.humanlikeScore.score,
              decision: _gateResult.decision,
              quality90Target: _quality90Assessment.enabled ? 90 : null,
              quality90TargetReached: _quality90Assessment.targetReached,
              quality90NearTargetAccepted: _quality90Assessment.nearTargetAccepted,
              quality90Miss: _quality90Assessment.miss,
              quality90Reasons: _quality90Assessment.reasons,
            };
            if (_quality90Assessment.nearTargetAccepted) {
              optimized.quality.warnings = [
                ...(optimized.quality.warnings || []),
                `QualityGate90 목표 근접 통과: mode=${_gateResult.modeScore.score}, final=${_gateResult.finalScore}`,
              ];
            }
          }
        } catch (gateErr) {
          console.warn('[QualityGate] 평가 실패 (정상 흐름 유지):', (gateErr as Error)?.message);
        }

        // ✅ [v2.10.179 Phase 2.2] qualityGate decision='regenerate' 전체 자동 재시도 활성화
        //   v2.10.178: safety < 50 (환각·금지패턴)만 활성화
        //   v2.10.179: decision='regenerate' 전체 — finalScore < 60도 포함 (근본적 미달)
        //   여전히 1회 한도 (_qualityGateRetryUsed) + attempt 여유 조건
        if (
          _gateResult
          && (_gateResult.decision === 'regenerate' || _quality90Assessment?.miss)
          && !_qualityGateRetryUsed
          && attempt < MAX_ATTEMPTS
        ) {
          _qualityGateRetryUsed = true;
          const _gateDirective = _quality90Assessment?.miss
            ? _quality90Assessment.directive
            : (_gateResult.retryDirective || '');
          const _trigger = _quality90Assessment?.miss
            ? `QualityGate90 ${_quality90Assessment.reasons.join(', ')}`
            : (_gateResult.safetyScore.score < 50
                ? `safety ${_gateResult.safetyScore.score} < 50`
                : `finalScore ${_gateResult.finalScore} < 60`);
          console.warn(`[QualityGate] 🚨 ${_trigger} — 자동 재시도 트리거 (decision=${_gateResult.decision})`);
          extraInstruction = `${_gateDirective}\n${extraInstruction}`;
          continue; // for 루프 다음 attempt
        }

        // ✅ [v2.10.180 Phase 2.3] qualityGate decision='patch' 시 selfCritique 자동 호출
        //   조건: decision='patch' (finalScore 60~79) — *부분 수정으로 충분*한 케이스
        //   regenerate는 이미 위에서 처리(continue), pass는 그대로 진행, patch만 여기 도달
        //   사용자 enableSelfCritique 토글 *무시*하고 자동 활성화 (qualityGate 신호가 더 정확)
        //   retryDirective를 selfCritique에 전달 → 구체적 미달 항목 우선 수정
        // ✅ [2026-05-31 S2] humanlike 플로어 — finalScore는 통과(pass)했지만 사람다움 점수만
        //   낮은 경우(mode/safety가 높여줌)에도 selfCritique로 사람답게 보정. 이전엔 pass면 무조치라
        //   "AI 티" 글이 그대로 발행되던 갭(분석 팀3 지적) 차단.
        const _humanFloorMiss =
          _gateResult
          && _gateResult.decision === 'pass'
          && _gateResult.humanlikeScore.score < 55;
        const _quality90HardMiss = Boolean(_quality90Assessment?.miss);
        if (
          _gateResult
          && optimized.bodyPlain
          && (_gateResult.decision === 'patch' || _humanFloorMiss || _quality90HardMiss)
          && (costPolicy.allowQualityGateSelfCritique || _quality90HardMiss)
        ) {
          try {
            const _patchPersona = buildPersonaCard(detectCategory(source.toneStyle || 'general'));
            const _patchReason = _quality90HardMiss
              ? `QualityGate90 미달(${_quality90Assessment?.reasons.join(', ')})`
              : (_humanFloorMiss ? `humanlike 플로어 미달(human=${_gateResult.humanlikeScore.score}<55)` : `patch decision (final=${_gateResult.finalScore})`);
            console.log(`[QualityGate] 📝 ${_patchReason} — selfCritique 자동 활성화`);
            const _patchResult = await selfCritiqueAndRewrite(
              optimized.bodyPlain,
              _patchPersona,
              (prompt: string) => callGemini(prompt, 0.3, 100, { useGrounding: false }),
              _quality90Assessment?.directive || _gateResult.retryDirective || '',
            );
            if (_patchResult.rewrote) {
              console.log(`[QualityGate] ✅ patch 적용 (${_patchResult.source}) — 본문 부분 재작성됨`);
              optimized.bodyPlain = _patchResult.body;
              try {
                const { evaluate: evaluateQualityAfterPatch } = require('./content/qualityEvaluator');
                _gateResult = evaluateQualityAfterPatch({
                  body: optimized.bodyPlain || '',
                  title: optimized.selectedTitle || '',
                  headings: optimized.headings || [],
                  rawText: source.rawText || '',
                  primaryKeyword: getPrimaryKeywordFromSource(source),
                  secondaryKeywords: getSecondaryKeywordsFromSource(source),
                  mode: _modeForGate,
                  contentMode: source.contentMode,
                  toneStyle: source.toneStyle,
                  categoryHint: source.categoryHint,
                  firstPartyEvidenceAvailable: hasExplicitFirstPartyEvidence(source),
                  groundingText: [source.title, source.rawText, source.personalExperience]
                    .filter(Boolean)
                    .join('\n'),
                  affiliateEvidenceMode: source.contentMode === 'affiliate'
                    ? classifyAffiliateEvidence(source).mode
                    : undefined,
                });
                _quality90Assessment = assessQuality90Gate(_gateResult, _modeForGate);
                console.log(`[QualityGate90] patch 후 재평가: mode=${_gateResult.modeScore.score}/100 · final=${_gateResult.finalScore}/100 · human=${_gateResult.humanlikeScore.score}/100 · miss=${_quality90Assessment.miss}`);
              } catch (recheckErr) {
                console.warn('[QualityGate90] patch 후 재평가 실패:', (recheckErr as Error)?.message);
              }
              if (optimized.quality) {
                (optimized.quality as any).qualityGate.patchApplied = true;
                (optimized.quality as any).qualityGate.finalScore = _gateResult.finalScore;
                (optimized.quality as any).qualityGate.modeScore = _gateResult.modeScore.score;
                (optimized.quality as any).qualityGate.safetyScore = _gateResult.safetyScore.score;
                (optimized.quality as any).qualityGate.humanlikeScore = _gateResult.humanlikeScore.score;
                (optimized.quality as any).qualityGate.decision = _gateResult.decision;
                (optimized.quality as any).qualityGate.quality90TargetReached = _quality90Assessment?.targetReached ?? false;
                (optimized.quality as any).qualityGate.quality90NearTargetAccepted = _quality90Assessment?.nearTargetAccepted ?? false;
                (optimized.quality as any).qualityGate.quality90Miss = _quality90Assessment?.miss ?? false;
                (optimized.quality as any).qualityGate.quality90Reasons = _quality90Assessment?.reasons ?? [];
              }
            } else {
              console.log(`[QualityGate] patch no-op (${_patchResult.source})`);
            }
          } catch (patchErr) {
            console.warn('[QualityGate] patch 실패 (정상 흐름 유지):', (patchErr as Error)?.message);
          }
        } else if (_gateResult && optimized.quality && (_gateResult.decision === 'patch' || _humanFloorMiss)) {
          optimized.quality.warnings = [
            ...(optimized.quality.warnings || []),
            `QualityGate LLM patch skipped by cost saver (${_humanFloorMiss ? `human=${_gateResult.humanlikeScore.score}` : `final=${_gateResult.finalScore}`})`,
          ];
          console.log('[QualityGate] costSaver ON — LLM selfCritique 생략, 로컬 휴머나이즈 결과 유지');
        }

        if (
          _quality90Assessment?.miss
          && !_quality90FollowupRetryUsed
          && attempt < MAX_ATTEMPTS
        ) {
          _quality90FollowupRetryUsed = true;
          console.warn(`[QualityGate90] 🔁 patch 후에도 90점 미달 — 추가 전체 재시도 (${_quality90Assessment.reasons.join(', ')})`);
          extraInstruction = `${_quality90Assessment.directive}\n${extraInstruction}`;
          continue;
        }

        if (_quality90Assessment?.miss && attempt < MAX_ATTEMPTS) {
          console.warn(`[QualityGate90] 🔁 90점 미달 결과를 반환하지 않고 남은 동일 엔진 시도를 사용합니다 (${attempt + 1}/${MAX_ATTEMPTS + 1})`);
          extraInstruction = `${_quality90Assessment.directive}\n${extraInstruction}`;
          continue;
        }

        if (_quality90Assessment?.miss && attempt === MAX_ATTEMPTS) {
          if (optimized.quality) {
            optimized.quality.warnings = [
              ...(optimized.quality.warnings || []),
              `QualityGate90 publication floor still missed after bounded retries: ${_quality90Assessment.blockingReasons.join(', ')}`,
            ];
          }
          throw new Error(
            `[QUALITY_TARGET_NOT_MET] 자동 발행 하한을 충족하지 못해 발행을 중단했습니다. `
            + `미달 항목: ${_quality90Assessment.blockingReasons.join(', ')}`,
          );
        }

        // ✅ [v2.10.187 Phase 3.6+] 자동 SERP 벤치마크 — opt-out 방식
        //   v2.10.186까지: 기본 OFF (opt-in) → 대부분 사용자가 효과 못 봄 (사용자 지적)
        //   v2.10.187+: 명시 false가 아니면 ON (undefined도 ON) — API 키 있을 때만 작동
        //   사용자가 명시적으로 OFF 한 경우만 OFF. 그 외는 자동 활성화.
        //   결과: optimized.quality.serpBenchmark 메타에 동봉
        //   실패 시: silent (정상 흐름 유지)
        try {
          const _autoCfg = await loadConfig();
          // ✅ 핵심 변경: !== false로 변경 (undefined도 ON 처리, 사용자 명시 OFF만 OFF)
          const _autoEnabled = (_autoCfg as any).autoSerpBenchmark !== false;
          const _serpClientId = (_autoCfg as any).naverSearchClientId || (_autoCfg as any).naverDatalabClientId || '';
          const _serpSecret = (_autoCfg as any).naverSearchClientSecret || (_autoCfg as any).naverDatalabClientSecret || '';
          if (_autoEnabled && _serpClientId && _serpSecret && optimized.bodyPlain && optimized.bodyPlain.length >= 100) {
            const _autoKw = getPrimaryKeywordFromSource(source) || (optimized.selectedTitle || '').split(/\s+/).slice(0, 2).join(' ');
            if (_autoKw && _autoKw.length >= 2) {
              // ✅ [v2.10.196 Phase 3.13] probeSerp → probeUnifiedSerp 업그레이드
              //   정적(API) + 동적(통합탭 HTML) 통합 분석 — 키워드 진입 난이도까지 산출
              const { probeUnifiedSerp } = await import('./analytics/unifiedSerpProbe.js');
              const { analyzeBenchmark } = await import('./analytics/benchmarkAnalyzer.js');
              const _autoMode = (source.contentMode === 'homefeed' || source.contentMode === 'affiliate' || source.contentMode === 'business')
                ? source.contentMode
                : 'seo';
              console.log(`[AutoSerpBenchmark] 🔍 통합 분석 시작: "${_autoKw}" (mode=${_autoMode})`);
              const _unifiedReport = await probeUnifiedSerp(_autoKw, _serpClientId, _serpSecret, {
                display: 10,
                mode: _autoMode as any,
              });
              const _serpReport = _unifiedReport.staticReport;
              console.log(`[AutoSerpBenchmark] 🎯 키워드 난이도: ${_unifiedReport.difficulty.tier} — ${_unifiedReport.difficulty.reasoning}`);

              if (_gateResult) {
                const _ourConcrete = (_gateResult.modeScore.details as Record<string, number>).concreteNumberCount ?? 0;
                const _ourExp = (_gateResult.humanlikeScore.details as Record<string, number>).directExperience ?? 0;
                const _bench = analyzeBenchmark(_gateResult, optimized.bodyPlain.length, _ourConcrete, _ourExp, _serpReport);
                console.log(`[AutoSerpBenchmark] ${_bench.summary}`);
                console.log(`[AutoSerpBenchmark] 우선순위 보완 ${_bench.topPriorityFix.length}건, 강점 ${_bench.strengths.length}건`);
                if (optimized.quality) {
                  (optimized.quality as any).serpBenchmark = {
                    keyword: _bench.keyword,
                    ourFinalScore: _bench.ourFinalScore,
                    serpAvgFinalScore: _bench.serpAvgFinalScore,
                    serpMedianFinalScore: _bench.serpMedianFinalScore,
                    ranking: _bench.ranking,
                    summary: _bench.summary,
                    topPriorityFix: _bench.topPriorityFix,
                    strengths: _bench.strengths,
                    signalGapsCount: _bench.signalGaps.length,
                    // ✅ [v2.10.196] 통합 분석 결과 — 난이도 tier + 스마트블록/인플루언서
                    difficulty: _unifiedReport.difficulty,
                    hasSmartblock: _unifiedReport.dynamicReport?.hasSmartblock ?? false,
                    influencerCount: _unifiedReport.dynamicReport?.influencerCount ?? 0,
                    totalCards: _unifiedReport.dynamicReport?.totalCards ?? 0,
                  };
                }

                // ✅ [v2.10.190 Phase 3.8.1] SERP 결과 누적 저장 — 실측 통계용
                //   userData/serp-benchmark-history.json에 append (최근 200개 유지)
                //   추정 효과 종결 — 사용자 자기 글들의 실측 추이 확인 가능
                try {
                  const { appendHistory } = await import('./analytics/serpHistory.js');
                  const { app } = await import('electron');
                  const userDataPath = app.getPath('userData');
                  appendHistory(userDataPath, {
                    timestamp: new Date().toISOString(),
                    keyword: _bench.keyword,
                    mode: _autoMode,
                    ourFinalScore: _bench.ourFinalScore,
                    serpAvgFinalScore: _bench.serpAvgFinalScore,
                    serpMedianFinalScore: _bench.serpMedianFinalScore,
                    ranking: _bench.ranking,
                    topPriorityFix: _bench.topPriorityFix,
                    strengths: _bench.strengths,
                    // ✅ [v2.10.197 Phase 3.14] 난이도 정보 동봉 (history 분석용)
                    difficultyTier: _unifiedReport.difficulty.tier,
                    hasSmartblock: _unifiedReport.difficulty.hasSmartblock,
                    influencerRatio: _unifiedReport.difficulty.influencerRatio,
                  });
                } catch { /* history 저장 실패는 silent (정상 흐름 유지) */ }
              }
            }
          }
        } catch (autoErr) {
          console.warn('[AutoSerpBenchmark] 자동 벤치마크 실패 (정상 흐름 유지):', (autoErr as Error)?.message);
        }

        // ✅ [2026 100점] 쇼핑커넥트 모드: 금지 패턴 자동 검증
        const contentMode = source.contentMode || 'seo';
        if (contentMode === 'affiliate') {
          const evidenceMode = classifyAffiliateEvidence(source).mode;
          const authenticity = auditAffiliateAuthenticity({
            title: optimized.selectedTitle,
            body: optimized.bodyPlain,
            evidenceMode,
          });

          if (authenticity.score < 85 && !_affiliateAuthenticityRetryUsed && attempt < MAX_ATTEMPTS) {
            _affiliateAuthenticityRetryUsed = true;
            extraInstruction = `${authenticity.retryDirective}\n${extraInstruction}`;
            lastFailReason = `쇼핑 진정성 ${authenticity.score}/100: ${authenticity.issues.map(issue => issue.code).join(', ')}`;
            console.warn(`[Shopping Authenticity] 재작성: ${lastFailReason}`);
            continue;
          }

          if (authenticity.score < 85) {
            const reasons = authenticity.issues.map(issue => issue.message).join(' / ');
            throw new Error(`쇼핑커넥트 진정성 검수 미통과(${authenticity.score}/100). 자동 발행을 중단했습니다: ${reasons}`);
          }

          if (!optimized.quality) {
            optimized.quality = {
              aiDetectionRisk: 'low',
              legalRisk: 'safe',
              seoScore: 0,
              originalityScore: 0,
              readabilityScore: 0,
              warnings: [],
            };
          }
          (optimized.quality as any).affiliateAuthenticity = {
            score: authenticity.score,
            evidenceMode,
            hardFail: authenticity.hardFail,
          };
          console.log(`[Shopping Authenticity] 통과: ${authenticity.score}/100 (${evidenceMode})`);

          const validation = validateShoppingConnectContent(optimized, validationMinChars);
          const shoppingQualityPublishable = canPublishShoppingConnectQuality(validation.score);
          if (!shoppingQualityPublishable && !_shoppingValidationRetryUsed && attempt < MAX_ATTEMPTS) {
            _shoppingValidationRetryUsed = true;
            const corrections = validation.feedback
              .filter(message => message.startsWith('❌') || message.startsWith('⚠️'))
              .join('\n- ');
            extraInstruction = `[쇼핑커넥트 품질 재작성]\n- ${corrections}\n광고 문구가 아닌 실제 구매 판단 정보로 보완하고 발행 하한 ${SHOPPING_CONNECT_PUBLISH_MIN_SCORE}점 이상, 목표 ${SHOPPING_CONNECT_TARGET_SCORE}점에 가깝게 다시 작성하세요.\n${extraInstruction}`;
            console.warn(`[Shopping Connect] 품질 ${validation.score}/100 — 발행 하한 ${SHOPPING_CONNECT_PUBLISH_MIN_SCORE}점 이상을 위해 전체 재작성`);
            continue;
          }
          if (!shoppingQualityPublishable) {
            throw new Error(
              `[QUALITY_TARGET_NOT_MET] 쇼핑커넥트 품질이 ${validation.score}/100으로 안전 발행 하한 ${SHOPPING_CONNECT_PUBLISH_MIN_SCORE}점에 미달해 자동 발행을 중단했습니다. `
              + validation.feedback.filter(message => message.startsWith('❌') || message.startsWith('⚠️')).join(' / '),
            );
          }
          if (optimized.quality) {
            (optimized.quality as any).shoppingValidation = {
              score: validation.score,
              passed: true,
              targetReached: validation.score >= SHOPPING_CONNECT_TARGET_SCORE,
              nearTargetAccepted: validation.score < SHOPPING_CONNECT_TARGET_SCORE,
              feedback: validation.feedback,
            };
          }
          if (validation.score < SHOPPING_CONNECT_TARGET_SCORE) {
            console.warn(`[Shopping Connect] 90점 목표 근접 통과: ${validation.score}/100 (발행 하한 ${SHOPPING_CONNECT_PUBLISH_MIN_SCORE})`);
          }
          if (validation.score < 100) {
            console.warn(`[Shopping Connect] ⚠️ 품질 점수: ${validation.score}/100`);
            validation.feedback.forEach(f => console.log(`[Shopping Connect] ${f}`));

            // quality에 검증 결과 추가
            if (!optimized.quality) {
              optimized.quality = {
                aiDetectionRisk: 'low',
                legalRisk: 'safe',
                seoScore: 70,
                originalityScore: 70,
                readabilityScore: 70,
                warnings: [],
              };
            }
            optimized.quality.warnings = [
              ...(optimized.quality.warnings || []),
              `[쇼핑커넥트 검증] 품질 ${validation.score}/100`,
              ...validation.feedback.filter(f => f.startsWith('❌') || f.startsWith('⚠️')),
            ];
          } else {
            console.log(`[Shopping Connect] ✅ 품질 점수: ${validation.score}/100 (완벽!)`);
          }
        }

        // 통계 파일 저장
        try {
          await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
        } catch (error) {
          console.warn('[ContentGenerator] 통계 파일 저장 실패:', (error as Error).message);
        }

        // ✅ 최종 구조화 및 클리닝 (이모지, [공지], ?: 등 제거)
        return finalizeStructuredContent(optimized, source);
      }

      // ✅ [v1.4.14] 50% 이상이면 경고만 하고 통과 (재시도 비용 절감) - 60→50%로 완화
      const minAcceptableChars = warningMinChars; // 50% 기준
      if (plainLength >= minAcceptableChars) {
        if (isQuality90Mode(generationQualityMode)) {
          if (attempt < MAX_ATTEMPTS) {
            lastFailReason = `90점 품질 모드 본문 길이 미달: ${plainLength}자 / 최소 검증선 ${validationMinChars}자`;
            extraInstruction = buildContentExpansionRetryInstruction({
              plainLength,
              minChars,
              requestedMinChars,
              attempt,
              safeMaxChars: SAFE_MAX_CHARS,
            });
            console.warn(`[QualityGate90] ${lastFailReason} — 짧은 결과를 반환하지 않고 재작성`);
            continue;
          }
          throw new Error(
            `[QUALITY_TARGET_NOT_MET] 90점 품질 검사를 실행할 최소 분량에 미달해 자동 발행을 중단했습니다. `
            + `현재 ${plainLength}자 / 최소 ${validationMinChars}자`,
          );
        }
        console.warn(`[ContentGenerator] 글자수 경고: ${plainLength}자 (목표: ${minChars}자, ${Math.round((plainLength / minChars) * 100)}%)`);

        // ✅ 경고 후 통과도 성공으로 카운트
        stats.success++;
        if (attempt === 0) stats.attempts.first++;
        else if (attempt === 1) stats.attempts.second++;
        else if (attempt === 2) stats.attempts.third++;
        else if (attempt === 3) stats.attempts.fourth++;

        const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
        console.log(`[ContentGenerator] ✅ 경고 후 통과 (시도 ${attempt + 1}번째) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);

        // 통계 파일 저장
        try {
          await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
        } catch (error) {
          console.warn('[ContentGenerator] 통계 파일 저장 실패:', (error as Error).message);
        }
        // 경고를 quality에 추가
        if (!optimized.quality) {
          optimized.quality = {
            aiDetectionRisk: 'low',
            legalRisk: 'safe',
            seoScore: 0,
            originalityScore: 0,
            readabilityScore: 0,
            warnings: [],
          };
        }
        if (!optimized.quality.warnings) {
          optimized.quality.warnings = [];
        }
        optimized.quality.warnings.push(
          `본문 길이가 목표보다 짧습니다 (${plainLength}자 / 목표: ${minChars}자). 내용의 질을 우선시하여 통과합니다.`
        );

        // ✅ 이모지 자동 제거 (AI가 생성한 이모지 제거)
        return finalizeStructuredContent(optimized, source);
      }

      // 60% 미만일 때만 재시도
      if (attempt === MAX_ATTEMPTS) {
        if (isQuality90Mode(generationQualityMode)) {
          throw new Error(
            `[QUALITY_TARGET_NOT_MET] 본문이 ${plainLength}자로 너무 짧아 90점 품질 기준을 검증할 수 없습니다. `
            + `최소 ${validationMinChars}자 이상으로 다시 생성해주세요.`,
          );
        }
        // ✅ [2026-03-23 FIX] 최종 시도에서는 글자수에 관계없이 항상 경고 후 통과
        // 이전: 50% 미만이면 throw → 발행 전체 실패
        // 수정: 짧은 글이라도 발행하는 것이 에러보다 나음
        console.warn(`[ContentGenerator] 글자수 경고 (최종): ${plainLength}자 (목표: ${minChars}자, ${Math.round((plainLength / minChars) * 100)}%)`);
        if (!optimized.quality) {
          optimized.quality = {
            aiDetectionRisk: 'low',
            legalRisk: 'safe',
            seoScore: 0,
            originalityScore: 0,
            readabilityScore: 0,
            warnings: [],
          };
        }

        if (!optimized.quality.warnings) {
          optimized.quality.warnings = [];
        }

        if (plainLength >= minChars * 0.5) {
          optimized.quality.warnings.push(
            `본문 길이가 목표보다 약간 짧습니다 (${plainLength}자 / 목표: ${minChars}자). 최대한 내용을 보존하여 출력합니다.`
          );
        } else {
          // ✅ [2026-03-23] 50% 미만이어도 에러 없이 진행 — 연속발행 안정성 최우선
          console.warn(`[ContentGenerator] ⚠️ 본문 길이 미달 (${plainLength}자 / 목표: ${minChars}자, ${Math.round((plainLength / minChars) * 100)}%) - 그래도 진행`);
          optimized.quality.warnings.push(
            `⚠️ 본문이 목표보다 많이 짧습니다 (${plainLength}자 / 목표: ${minChars}자). 내용 보강을 권장합니다.`
          );
        }

        // ✅ 성공 통계 (경고 후 통과)
        stats.success++;
        if (attempt === 0) stats.attempts.first++;
        else if (attempt === 1) stats.attempts.second++;
        else if (attempt === 2) stats.attempts.third++;
        else if (attempt === 3) stats.attempts.fourth++;
        const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
        console.log(`[ContentGenerator] ✅ 최종 경고 후 통과 (시도 ${attempt + 1}번째) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);

        try {
          await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
        } catch (error) {
          console.warn('[ContentGenerator] 통계 파일 저장 실패:', (error as Error).message);
        }

        return finalizeStructuredContent(optimized, source);
      }

      // 재시도 시 목표치 증가
      // - 1차 재시도: 1.20배 (20% 증가)
      // - 2차 재시도: 1.40배 (40% 증가)
      lastFailReason = `글자수 미달: ${plainLength}자 / 목표 ${minChars}자 (${Math.round((plainLength / minChars) * 100)}%)`;
      console.warn(`[ContentGenerator] ⚠️ 시도 ${attempt + 1}: ${lastFailReason}`);
      extraInstruction = buildContentExpansionRetryInstruction({
        plainLength,
        minChars,
        requestedMinChars,
        attempt,
        safeMaxChars: SAFE_MAX_CHARS,
      });

    } catch (error) {
      // 오류 처리
      const errMsg = (error as Error).message || '알 수 없는 오류';
      const terminalError = isTerminalContentGenerationError(error);

      // ✅ [v1.4.41] 매번 lastFailReason 설정 (마지막 시도 포함) — "알 수 없음" 방지
      lastFailReason = errMsg.substring(0, 300);

      if (terminalError || attempt === MAX_ATTEMPTS) {
        // ✅ 실패 통계 업데이트
        stats.failed++;
        const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
        console.error(`[ContentGenerator] ❌ 실패! (${terminalError ? '재시도 불가 오류' : '최대 시도 횟수 초과'}) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);
        console.error(`[ContentGenerator] 마지막 에러: ${errMsg}`);

        // 통계 파일 저장
        try {
          await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
        } catch (saveError) {
          console.warn('[ContentGenerator] 통계 파일 저장 실패:', (saveError as Error).message);
        }

        // ✅ [v1.4.41] 원본 에러 메시지를 보존하여 throw — 사용자가 진짜 원인을 알 수 있도록
        // ✅ [2026-04-11] userSelectedProvider 사용 — 폴백으로 provider가 바뀌어도 원래 엔진명 표시
        throw new Error(`콘텐츠 생성 실패 (엔진: ${userSelectedProvider}, ${attempt + 1}회 시도): ${errMsg}`);
      }
      // 재시도 가능한 오류면 계속
      console.warn(`[시도 ${attempt + 1}/${MAX_ATTEMPTS + 1}] 같은 엔진 복구 재시도:`, errMsg);
      extraInstruction = `${buildSameEngineRecoveryInstruction(provider, errMsg)}\n${extraInstruction}`;
    }
  }

  // ✅ 모든 시도 실패
  stats.failed++;
  const successRate = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
  console.error(`[ContentGenerator] ❌ 실패! (모든 시도 실패) | 전체 성공률: ${successRate}% (${stats.success}/${stats.total})`);

  // 통계 파일 저장
  try {
    await fs.writeFile(statsFile, JSON.stringify(stats, null, 2), 'utf-8');
  } catch (saveError) {
    console.warn('[ContentGenerator] 통계 파일 저장 실패:', (saveError as Error).message);
  }

  // ✅ [v1.4.41] 의미 있는 에러 메시지 — "알 수 없음" 대신 구체적 가이드
  // ✅ [2026-04-11] userSelectedProvider 사용 — 사용자가 선택한 엔진명 정확히 표시
  const finalReason = lastFailReason || '루프가 비정상 종료됨 (개발자 콘솔 로그 확인 필요)';
  throw new Error(`콘텐츠 생성 실패 (엔진: ${userSelectedProvider}, ${MAX_ATTEMPTS + 1}회 시도 후 실패): ${finalReason}`);
  } finally {
    // ✅ [v2.7.27] Adaptive Limiter 슬롯 반환
    release();
  }
}

/**
 * 병렬 콘텐츠 생성 함수
 * 여러 소스를 동시에 처리하여 속도 향상
 * @param sources 생성할 콘텐츠 소스 배열
 * @param options 생성 옵션
 * @param maxConcurrency 최대 동시 실행 개수 (기본값: 3)
 * @returns 생성된 콘텐츠 배열
 */
export async function generateContentsInParallel(
  sources: ContentSource[],
  options: GenerateOptions = {},
  maxConcurrency: number = 3
): Promise<Array<{ source: ContentSource; content: StructuredContent | null; error?: string }>> {
  console.log(`[병렬 처리] ${sources.length}개 콘텐츠를 최대 ${maxConcurrency}개씩 동시 생성합니다...`);

  const results: Array<{ source: ContentSource; content: StructuredContent | null; error?: string }> = [];
  const queue = [...sources];
  const inProgress: Promise<void>[] = [];

  const processOne = async (source: ContentSource, index: number) => {
    try {
      console.log(`[병렬 처리] [${index + 1}/${sources.length}] 생성 시작...`);
      const content = await generateStructuredContent(source, options);
      results.push({ source, content });
      console.log(`[병렬 처리] [${index + 1}/${sources.length}] ✅ 생성 완료`);
    } catch (error) {
      console.error(`[병렬 처리] [${index + 1}/${sources.length}] ❌ 생성 실패:`, (error as Error).message);
      results.push({ source, content: null, error: (error as Error).message });
    }
  };

  let completedCount = 0;

  while (queue.length > 0 || inProgress.length > 0) {
    // 동시 실행 개수만큼 작업 시작
    while (inProgress.length < maxConcurrency && queue.length > 0) {
      const source = queue.shift()!;
      const index = sources.indexOf(source);
      const promise = processOne(source, index).then(() => {
        completedCount++;
        console.log(`[병렬 처리] 진행률: ${completedCount}/${sources.length} (${Math.round((completedCount / sources.length) * 100)}%)`);
      });
      inProgress.push(promise);
    }

    // 하나라도 완료될 때까지 대기
    if (inProgress.length > 0) {
      await Promise.race(inProgress);
      // 완료된 작업 제거
      for (let i = inProgress.length - 1; i >= 0; i--) {
        const settled = await Promise.race([
          inProgress[i].then(() => true),
          Promise.resolve(false)
        ]);
        if (settled) {
          inProgress.splice(i, 1);
        }
      }
    }
  }

  console.log(`[병렬 처리] 전체 완료: 성공 ${results.filter(r => r.content).length}개, 실패 ${results.filter(r => !r.content).length}개`);

  return results;
}
