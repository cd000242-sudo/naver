import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { shouldRunLegacyPostDraftLlm } from '../contentGenerator';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string): string => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Content Quality V3 production wiring', () => {
  const generator = read('contentGenerator.ts');
  const main = read('main.ts');
  const samplingPolicy = read('contentGeminiSamplingPolicy.ts');
  const requestContract = read('contentQualityV3/geminiRequestContract.ts');
  const currentEvidenceBindings = read('contentQualityV3/currentEvidenceBindings.ts');

  it('keeps the legacy implementation internal and routes the public API through the pure facade', () => {
    expect(generator).toMatch(/async function generateStructuredContentInternal\(/);
    expect(generator).toMatch(/export async function generateStructuredContent\(/);
    expect(generator).toMatch(/return runContentPipeline(?:<[^>]+>)?\(\{/);
    expect(generator).toMatch(/legacy:\s*\(legacySource, legacyOptions\)\s*=>\s*generateStructuredContentInternal\(\s*legacySource,\s*legacyOptions,\s*'legacy'/s);
    expect(generator).toMatch(/v3:\s*\(v3Source, v3Options\)\s*=>\s*generateStructuredContentInternal\(\s*v3Source,\s*v3Options,\s*'v3'/s);
    expect(generator).toMatch(/validate:\s*validatePublishableContent/);
  });

  it('uses only the source-reviewed release activation and ignores request routing fields', () => {
    expect(generator).toMatch(/const activation = resolveProductionContentQualityV3Activation\(\s*source\.contentMode,\s*options\.provider,\s*\)/);
    expect(generator).toMatch(/requestedMode:\s*activation\.requestedMode/);
    expect(generator).toMatch(/contentMode:\s*source\.contentMode/);
    expect(generator).toMatch(/v3Allowlist:\s*activation\.v3Allowlist/);
    expect(generator).not.toMatch(/requestedMode:\s*options\.contentPipelineMode/);
    expect(generator).not.toMatch(/v3Allowlist:\s*options\.v3Allowlist/);
    expect(generator).not.toMatch(/process\.env\.CONTENT_PIPELINE_MODE/);
    expect(main).not.toContain('contentPipelineMode');
    expect(main).not.toContain('v3Allowlist');
    expect(main).toMatch(/generateStructuredContentWithProductPolicy\(source, \{ provider, minChars, signal: genSignal \} as any\)/);
  });

  it('selects the compact prompt only inside the v3 driver and preserves the legacy builder branch', () => {
    expect(generator).toMatch(/promptVariant\s*===\s*'v3'/);
    expect(generator).toMatch(/buildContentQualityV3Prompt\(createContentQualityV3InitialPromptOptions\(\{/);
    expect(generator).toMatch(/:\s*buildModeBasedPrompt\(source, mode, metrics, adjustedMinChars\)/);
    expect(generator).not.toMatch(/buildContentQualityV3Prompt\(\{[\s\S]{0,400}runtimeInstruction:\s*extraInstruction/);
    expect(generator).not.toMatch(/buildContentQualityV3Prompt\(\{[\s\S]{0,400}\bmetrics,/);
    expect(currentEvidenceBindings).toMatch(/buildContentQualityV3Prompt\(options\)/);
    expect(currentEvidenceBindings).toMatch(/createContentQualityV3InitialPromptOptions\(\{/);
    expect(currentEvidenceBindings).not.toMatch(/primaryKeyword:\s*evalCase\.primaryKeyword/);
  });

  it('uses one shared pure builder for the complete strict Gemini request envelope', () => {
    expect(generator).toMatch(/createContentQualityV3GeminiRequestEnvelope\(prompt\)/);
    expect(generator).toMatch(/executionPolicy:\s*isV3Prompt\s*\?\s*CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY\s*:\s*undefined/);
    expect(requestContract).toMatch(/splitPromptByMarker\(prompt\)/);
    expect(requestContract).toMatch(/buildGeminiGenerationConfig\(\{/);
    expect(requestContract).toMatch(/schema:\s*CONTENT_QUALITY_V3_OUTPUT_SCHEMA/);
    expect(requestContract).toMatch(/useGrounding:\s*false/);
    expect(requestContract).toMatch(/CONTENT_QUALITY_V3_GEMINI_MODEL/);
    expect(requestContract).toMatch(/safetySettings/);
    expect(generator).toMatch(/generateWithAgent\(\s*\{[\s\S]{0,240}\bschema,[\s\S]{0,240}\},\s*agentProductPolicyContext,\s*\)/);
    expect(generator).toMatch(/responseMimeType:\s*'application\/json'/);
    expect(samplingPolicy).toMatch(/responseSchema:\s*options\.schema/);
    expect(generator).toMatch(/supportsContentQualityV3NativeSchema\(provider\)/);
  });

  it('pins only explicit v3 Gemini generation to Flash-Lite ahead of saved UI selection', () => {
    expect(requestContract).toMatch(/model:\s*CONTENT_QUALITY_V3_GEMINI_MODEL/);
    expect(generator).toMatch(/strictRequestEnvelope\?\.model\s*\?\?/);
    expect(generator).toMatch(/const geminiModelConfig = effectiveModelOverride\s*\?\s*\{ \.\.\.config, primaryGeminiTextModel: effectiveModelOverride \}\s*:\s*config/);
  });

  it('never combines the v3 schema with Gemini search tools while preserving legacy grounding', () => {
    expect(generator).toMatch(/const primaryDraftGrounding =\s*resolveContentQualityV3GeminiGroundingOverride\(promptVariant\)\s*\?\? smartGrounding/);
    expect(generator).toMatch(/callGemini\(systemPrompt, temperature, adjustedMinChars, \{\s*useGrounding: primaryDraftGrounding,\s*signal,\s*executionPolicy:/);
    expect(generator).toMatch(/const requestConfig:\s*any\s*=\s*strictRequestEnvelope\s*\?\s*createContentQualityV3GeminiSdkRequest\(strictRequestEnvelope\)/);
    expect(generator).toMatch(/if \(useGrounding\) \{\s*requestConfig\.tools = \[\{ googleSearch: \{\} \}\];\s*\}/);
  });

  it('keeps live metrics and supplemental category guidance on the exact legacy path', () => {
    expect(generator).toMatch(/if \(!isV3Prompt\) \{\s*\/\/[^\n]*[\s\S]{0,260}source\.images/);
    expect(generator).toMatch(/if \(!isV3Prompt\) \{\s*try \{[\s\S]{0,500}trendAnalyzer\.getSearchVolume/);
    expect(generator).toMatch(/if \(isShoppingConnectMode\) \{[\s\S]{0,300}detectProductCategory/);
  });

  it('enforces the branded V3 single-call policy at every retry and cache boundary', () => {
    expect(requestContract).toMatch(/maxTopLevelRetries:\s*0/);
    expect(requestContract).toMatch(/maxNetworkRetries:\s*0/);
    expect(requestContract).toMatch(/maxProviderCalls:\s*1/);
    expect(generator).toMatch(/const MAX_ATTEMPTS = isV3Prompt\s*\? CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY\.maxTopLevelRetries/);
    expect(generator).toMatch(/const GEMINI_MAX_RETRIES = isV3Prompt\s*\? CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY\.maxNetworkRetries/);
    expect(generator).toMatch(/const strictSingleCall =\s*options\.executionPolicy === CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY/);
    expect(generator).toMatch(/const cacheEnabled = !strictSingleCall && cacheEligibility\.enabled/);
    expect(generator).toMatch(/const resultCacheAllowed = !strictSingleCall && minChars < 1000/);
    expect(generator).toMatch(/const perModelMaxRetries = strictSingleCall \? 1 : 3/);
    expect(generator).toMatch(/const MAX_PROMPT_AUGMENTATIONS = strictSingleCall \? 0 : 2/);
    expect(generator).toMatch(/if \(strictSingleCall\) throw error;/);
  });

  it('does not wrap the compact v3 contract in the legacy agentic envelope', () => {
    expect(generator).toMatch(/agenticEnvelope\?:\s*boolean/);
    expect(generator).toMatch(/agenticEnvelope:\s*!isV3Prompt/);
    expect(generator).toMatch(/agenticEnvelope\s*!==\s*false/);
  });

  it('keeps legacy prompt augmentations out of the compact v3 path', () => {
    expect(generator).toMatch(/if \(!isV3Prompt\) \{[\s\S]*costPolicy\.qualityDirective[\s\S]*buildAdaptiveLearningDirective[\s\S]*buildUrlModeDirective[\s\S]*buildPersonaCard[\s\S]*\}/);
  });

  it('fails closed when deciding whether post-draft legacy model calls may run', () => {
    expect(shouldRunLegacyPostDraftLlm('legacy')).toBe(true);
    expect(shouldRunLegacyPostDraftLlm('v3')).toBe(false);
    expect(shouldRunLegacyPostDraftLlm(undefined as never)).toBe(false);
    expect(shouldRunLegacyPostDraftLlm('V3' as never)).toBe(false);
  });

  it('keeps every post-draft non-schema model call behind the legacy-only policy', () => {
    expect(generator).toMatch(/const allowLegacyPostDraftLlm\s*=\s*shouldRunLegacyPostDraftLlm\(promptVariant\)/);

    expect(generator).toMatch(/if \(allowLegacyPostDraftLlm && !_useKwTitle && \(mode === 'seo' \|\| mode === 'mate'\)\)/);
    expect(generator).toMatch(/if \(allowLegacyPostDraftLlm && !_useKwTitle && mode === 'homefeed'\)/);
    expect(generator).toMatch(/if \(allowLegacyPostDraftLlm && introIssues\.length > 0[\s\S]{0,160}generateHomefeedIntroOnlyPatch/);
    expect(generator).toMatch(/if \(\s*allowLegacyPostDraftLlm\s*&& isSemanticDistinctnessJudgeEnabled\(\)[\s\S]{0,1200}judgeSectionDistinctness/);
    expect(generator).toMatch(/if \(allowLegacyPostDraftLlm && !_useKwTitle && \(isShoppingConnectMode \|\| mode === 'affiliate'\)\)/);

    expect(generator).toMatch(/if \(allowLegacyPostDraftLlm\) \{\s*try \{[\s\S]{0,500}factCheckAndRewrite/);
    expect(generator).toMatch(/if \(allowLegacyPostDraftLlm && isSelfCritiqueEnabled/);
    expect(generator).toMatch(/const useLlmRubric = allowLegacyPostDraftLlm\s*&& isLlmRubricEnabled/);
    expect(generator).toMatch(/if \(\s*allowPaidPostGenerationRepair\s*&&\s*allowLegacyPostDraftLlm\s*&&\s*_gateResult[\s\S]{0,900}selfCritiqueAndRewrite/);

    expect(generator).toMatch(/if \(\s*allowPaidPostGenerationRepair\s*&&\s*_gateResult\s*&& \(_gateResult\.decision === 'regenerate' \|\| _quality90Assessment\?\.miss\)/);
    expect(generator).toMatch(/if \(\s*allowPaidPostGenerationRepair\s*&&\s*_quality90Assessment\?\.miss\s*&& !_quality90FollowupRetryUsed\s*&& attempt < MAX_ATTEMPTS/);
    expect(generator).toMatch(/if \(allowPaidPostGenerationRepair && _quality90Assessment\?\.miss && attempt < MAX_ATTEMPTS\)/);
  });

  it('keeps every semantic deterministic post-draft mutator behind the exact legacy policy', () => {
    expect(generator).toMatch(/if \(shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'optimize-headings-for-mode'\)\) \{\s*optimizeHeadingsForMode\(parsed, source\);\s*\}/);
    expect(generator).toMatch(/if \(\s*shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'apply-heading-keyword-patch'\)[\s\S]{0,2000}applyHeadingKeywordPatch\(parsed\.headings as any, primaryKw, \{ maxPatches: 2 \}\)/);
    expect(generator).toMatch(/if \(\s*shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'enforce-sub-keyword-coverage'\)[\s\S]{0,1200}enforceSubKeywordCoverage\(parsed, _subKws, \{ maxKeywords: 3 \}\)/);
    expect(generator).toMatch(/const optimized = shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'optimize-for-viral'\)\s*\? optimizeForViral\(parsed, source\)\s*:\s*parsed;/);
    expect(generator).toMatch(/if \(\s*shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'filter-exaggerated-content'\)[\s\S]{0,180}filterExaggeratedContent\(optimized\.bodyPlain\)/);
    expect(generator).toMatch(/if \(\s*shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'humanize-content'\)[\s\S]{0,180}humanizeContent\(optimized\.bodyPlain, humanizeIntensity, false, source\.toneStyle\)/);
    expect(generator).toMatch(/if \(\s*shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'humanize-html-content'\)[\s\S]{0,180}humanizeHtmlContent\(optimized\.bodyHtml, humanizeIntensity\)/);
    expect(generator).toMatch(/if \(\s*shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'optimize-content-for-naver'\)[\s\S]{0,260}optimizeContentForNaver\(\s*optimized\.bodyPlain,\s*source\.toneStyle,\s*false,\s*\{ skipDictInjection \},\s*\)/);
    expect(generator).toMatch(/if \(\s*shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'optimize-html-for-naver'\)[\s\S]{0,180}optimizeHtmlForNaver\(optimized\.bodyHtml\)/);

    for (const callName of [
      'optimizeHeadingsForMode',
      'applyHeadingKeywordPatch',
      'enforceSubKeywordCoverage',
      'optimizeForViral',
      'filterExaggeratedContent',
      'humanizeContent',
      'humanizeHtmlContent',
      'optimizeContentForNaver',
      'optimizeHtmlForNaver',
    ]) {
      expect(generator.match(new RegExp(`\\b${callName}\\(`, 'g')) ?? []).toHaveLength(1);
    }
  });

  it('carries the exact variant through finalization and gates remaining semantic finalizers', () => {
    expect(generator).toMatch(/export function finalizeStructuredContent\(\s*content: StructuredContent,\s*source: ContentSource,\s*promptVariant: ContentPromptVariant = 'legacy',\s*\)/);
    expect(generator.match(/return finalizeStructuredContent\(optimized, source, promptVariant\);/g) ?? []).toHaveLength(3);

    expect(generator).toMatch(/if \(shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'truncate-heading-titles'\)\) \{\s*finalContent = truncateHeadingTitles\(finalContent, 60\);\s*\}/);
    expect(generator).toMatch(/const allowLegacyOrdinalHeadingMarkerFix =\s*shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'apply-ordinal-heading-marker-fix'\)/);
    expect(generator.match(/if \(allowLegacyOrdinalHeadingMarkerFix\) \{[\s\S]{0,120}applyOrdinalHeadingMarkerFix\(finalContent\)/g) ?? []).toHaveLength(3);
    expect(generator.match(/shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'apply-keyword-prefix-to-structured-content'\)/g) ?? []).toHaveLength(2);
    expect(generator.match(/\bapplyKeywordPrefixToStructuredContent\(finalContent,/g) ?? []).toHaveLength(2);
    expect(generator).toMatch(/try \{\s*if \(shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'cleanup-title-tokens'\)\) \{[\s\S]{0,300}sanitizeTitleSpecialChars\(finalContent\.selectedTitle\)/);
    expect(generator).toMatch(/if \(shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'repair-title-after-quality-gate'\)\) \{[\s\S]{0,400}removeDuplicatePhrasesFromTitle\(/);

    expect(generator).toMatch(/finalContent = applyManualTitleOverride\(finalContent, manualTitleOverride\)/);
    expect(generator).toMatch(/finalContent = applyKeywordAsTitleLock\(finalContent as any, kwTitle\)/);
    expect(generator).toMatch(/applyHomefeedNarrativeHookBlock\(finalContent, source\)/);
    expect(generator).toMatch(/applySeoQualityHookBlock\(finalContent, source\)/);
  });

  it('validates the exact v3 draft without legacy synthesis or heading rewrites', () => {
    expect(generator).toMatch(/if \(isV3Prompt\) \{\s*const v3TitleContract = resolveContentQualityV3TitleContract\(source\);[\s\S]{0,300}finalizeContentQualityV3Draft\(parsed/);
    const v3ReturnRegion = generator.match(
      /const v3Decision = decideContentQualityV3Finalization\(\s*v3Finalization,\s*\{[\s\S]*?\n\s*lastFailReason = `\[content-quality-v3\]/,
    )?.[0];
    expect(v3ReturnRegion).toBeDefined();
    expect(v3ReturnRegion).toMatch(/if \(v3Decision\.action === 'return'\) \{/);
    expect(v3ReturnRegion).toMatch(/source\.contentMode === 'business'[\s\S]*?enforceContentQualityV3BusinessGuard\(v3Decision\.content, source\)/);
    expect(v3ReturnRegion).toMatch(/evaluateContentQualityV3AffiliateGuard\(\{[\s\S]*?content: v3Decision\.content,/);
    expect(v3ReturnRegion).toMatch(/if \(v3GuardDecision\.action === 'retry-authenticity'\) \{[\s\S]*?continue;\s*\}/);
    expect(v3ReturnRegion).toMatch(/if \(v3GuardDecision\.action === 'retry-shopping-quality'\) \{[\s\S]*?continue;\s*\}/);
    expect(v3ReturnRegion).toMatch(/if \(v3GuardDecision\.action === 'fail'\) \{\s*throw new Error\(v3GuardDecision\.message\);\s*\}/);
    expect(v3ReturnRegion).toMatch(/return registerContentQualityV3GeneratedContent\(\s*materializeContentQualityV3ForLegacyConsumers\(v3GuardDecision\.content\),\s*\{ source, minimumBodyChars: validationMinChars \},\s*\);/);
    expect(generator).toMatch(/buildContentQualityV3FinalizationRetryInstruction\([\s\S]{0,220}continue;/);
    expect(generator).toContain('[content-quality-v3] ${v3Decision.issueCode}');

    expect(generator).toMatch(/if \(shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'recover-loose-structured-content-fields'\)\) \{[\s\S]{0,220}recoverLooseStructuredContentFields\(parsed\)/);
    expect(generator).toMatch(/if \(\s*shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'recover-missing-body-plain'\)[\s\S]{0,120}!parsed\.bodyPlain/);
    expect(generator).toMatch(/shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'remove-duplicate-headings'\)[\s\S]{0,160}parsed\.bodyPlain = removeDuplicateHeadings\(parsed\.bodyPlain, parsed\.headings\)/);
    expect(generator).toMatch(/shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'remove-repeated-full-content'\)[\s\S]{0,160}parsed\.bodyPlain = removeRepeatedFullContent\(parsed\.bodyPlain, parsed\.headings\)/);
    expect(generator.match(/\bremoveDuplicateHeadings\(parsed\.bodyPlain, parsed\.headings\)/g) ?? []).toHaveLength(1);
    expect(generator.match(/\bremoveRepeatedFullContent\(parsed\.bodyPlain, parsed\.headings\)/g) ?? []).toHaveLength(1);
    expect(generator.indexOf('removeDuplicateHeadings(parsed.bodyPlain, parsed.headings)')).toBeLessThan(
      generator.indexOf('removeRepeatedFullContent(parsed.bodyPlain, parsed.headings)'),
    );
    expect(generator).toMatch(/if \(shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'validate-structured-content'\)\) \{\s*validateStructuredContent\(parsed, source\);\s*\}/);
    expect(generator).toMatch(/if \(shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'strip-selected-title-prefix-from-headings'\)\) \{\s*stripSelectedTitlePrefixFromHeadings\(parsed\);\s*\}/);
    expect(generator).toMatch(/if \(shouldRunLegacySemanticPostDraftMutation\(promptVariant, 'strip-leading-subject-hook-from-headings'\)\) \{[\s\S]{0,800}stripLeadingSubjectHookFromHeadings\(parsed, _personCentricHeadings\)/);

    expect(generator.match(/\brecoverLooseStructuredContentFields\(parsed\)/g) ?? []).toHaveLength(1);
    expect(generator.match(/\bvalidateStructuredContent\(parsed, source\)/g) ?? []).toHaveLength(1);
    expect(generator.match(/\bstripSelectedTitlePrefixFromHeadings\(parsed\)/g) ?? []).toHaveLength(1);
    expect(generator.match(/\bstripLeadingSubjectHookFromHeadings\(parsed, _personCentricHeadings\)/g) ?? []).toHaveLength(1);
  });

  it('retains audited mode validators because they only sanitize or append deterministic quality telemetry', () => {
    expect(generator).toMatch(/validateSeoContent\(parsed, source\)/);
    expect(generator).toMatch(/validateHomefeedContent\(parsed, source\)/);
    expect(generator).toMatch(/validateBusinessContent\(parsed, source\)/);
  });

  it('retains nonsemantic cleanup, validators, metrics, and hard retry gates for v3', () => {
    expect(generator).toMatch(/validateStructuredContent\(parsed, source\)/);
    expect(generator).toMatch(/sanitizeContentHtmlTags\(parsed\)/);
    expect(generator).toMatch(/sanitizeContentFakeSources\(parsed\)/);
    expect(generator).toMatch(/optimized\.bodyPlain = cleanEscapeSequences\(optimized\.bodyPlain\)/);
    expect(generator).toMatch(/optimized\.bodyPlain = stripCitationTokens\(optimized\.bodyPlain\)/);
    expect(generator).toMatch(/const riskAnalysis = analyzeAiDetectionRisk\(optimized\.bodyPlain \|\| ''\)/);
    expect(generator).toMatch(/const deterministicFallback = \(\) => analyzeNaverScore\(optimized\.bodyPlain \|\| ''\)/);
    expect(generator).toMatch(/checkSourceFidelity\(/);
    expect(generator).toMatch(/checkHallucination\(/);
    expect(generator).toMatch(/if \(\s*allowPaidPostGenerationRepair\s*&&\s*_gateResult\s*&& \(_gateResult\.decision === 'regenerate' \|\| _quality90Assessment\?\.miss\)/);
  });

  it('keeps production shadow dormant until side effects and comparison telemetry are isolated', () => {
    expect(generator).not.toMatch(/shadowQueue:\s*contentQualityV3ShadowQueue/);
    expect(generator).not.toMatch(/const\s+contentQualityV3ShadowQueue\s*=\s*createShadowQueue/);
  });
});
