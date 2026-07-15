import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const generator = fs.readFileSync(path.resolve(__dirname, '..', 'contentGenerator.ts'), 'utf8');

describe('Content Quality V3 early-return wiring', () => {
  it('returns the pure V3 finalizer result before every legacy post-draft stage', () => {
    const v3Branch = generator.indexOf('const v3Finalization = finalizeContentQualityV3Draft(');
    const earlyReturn = generator.indexOf(
      'return registerContentQualityV3GeneratedContent(',
      v3Branch,
    );
    expect(v3Branch).toBeGreaterThan(-1);
    expect(earlyReturn).toBeGreaterThan(v3Branch);
    expect(generator.slice(v3Branch, earlyReturn)).toContain(
      'enforceContentQualityV3BusinessGuard(v3Decision.content, source)',
    );

    for (const legacyStage of [
      'cleanEscapeSequences(parsed.bodyPlain)',
      'validateHeadingOrder(parsed.headings',
      'sanitizeContentHtmlTags(parsed)',
      'sanitizeContentFakeSources(parsed)',
      'validateSeoContent(parsed, source)',
      'validateHomefeedContent(parsed, source)',
      'validateBusinessContent(parsed, source)',
      'applyKeywordAsTitleLock(parsed as any',
      'const optimized =',
      'await probeUnifiedSerp(',
      "await import('./analytics/serpHistory.js')",
      'return finalizeStructuredContent(optimized, source, promptVariant)',
    ]) {
      expect(generator.indexOf(legacyStage, earlyReturn)).toBeGreaterThan(earlyReturn);
    }
  });

  it('uses a bounded stable-code title retry and never rewrites the V3 title', () => {
    expect(generator).toMatch(/decideContentQualityV3Finalization\([\s\S]{0,500}titleContractRetriesUsed/);
    expect(generator).toMatch(/buildContentQualityV3FinalizationRetryInstruction\([\s\S]{0,250}continue;/);
    expect(generator).toMatch(/\[content-quality-v3\] \$\{v3Decision\.issueCode\}/);

    const v3Branch = generator.indexOf('const v3Finalization = finalizeContentQualityV3Draft(');
    const earlyReturn = generator.indexOf(
      'return registerContentQualityV3GeneratedContent(',
      v3Branch,
    );
    expect(generator.slice(v3Branch, earlyReturn)).toContain('evaluateContentQualityV3AffiliateGuard(');
    expect(generator.slice(v3Branch, earlyReturn)).not.toContain('applyManualTitleOverride');
    expect(generator.slice(v3Branch, earlyReturn)).not.toContain('applyKeywordAsTitleLock');
    expect(generator).toMatch(/return registerContentQualityV3GeneratedContent\(\s*materializeContentQualityV3ForLegacyConsumers\(v3GuardDecision\.content\),\s*\{ source, minimumBodyChars: validationMinChars \},\s*\);/);
  });

  it('routes exact V3 through the strict request envelope and leaves legacy sampling isolated', () => {
    expect(generator).toMatch(/executionPolicy:\s*isV3Prompt\s*\?\s*CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY/);
    expect(generator).toMatch(/strictRequestEnvelope\s*=\s*strictSingleCall\s*\?\s*createContentQualityV3GeminiRequestEnvelope\(prompt\)/);
    expect(generator).toMatch(/const\s+requestConfig:\s*any\s*=\s*strictRequestEnvelope\s*\?\s*createContentQualityV3GeminiSdkRequest\(strictRequestEnvelope\)/);
    expect(generator).toMatch(/generationConfig:\s*buildGeminiGenerationConfig\(\{/);
    expect(generator).toMatch(/resolveGeminiEmptyResponseRetryTemperature\(\s*activeTemperature,\s*options\.useModelDefaultSampling === true/);
  });
});
