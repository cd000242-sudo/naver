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
      'enforceContentQualityV3BusinessGuard(v3Content, source)',
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

  it('uses advisory finalization without a paid V3 retry and never rewrites the V3 title', () => {
    expect(generator).toMatch(/if \(v3Finalization\.ok\) \{[\s\S]{0,180}v3Content = v3Finalization\.content/);
    expect(generator).toMatch(/v3Finalization\.issueCode\.startsWith\('structured_output_'\)/);
    expect(generator).not.toContain('decideContentQualityV3Finalization(');
    expect(generator).not.toContain('buildContentQualityV3FinalizationRetryInstruction(');

    const v3Branch = generator.indexOf('const v3Finalization = finalizeContentQualityV3Draft(');
    const earlyReturn = generator.indexOf(
      'return registerContentQualityV3GeneratedContent(',
      v3Branch,
    );
    expect(generator.slice(v3Branch, earlyReturn)).toContain('evaluateContentQualityV3AffiliateGuard(');
    expect(generator.slice(v3Branch, earlyReturn)).not.toContain('applyManualTitleOverride');
    expect(generator.slice(v3Branch, earlyReturn)).not.toContain('applyKeywordAsTitleLock');
    expect(generator).toMatch(/return registerContentQualityV3GeneratedContent\(\s*materializeContentQualityV3ForLegacyConsumers\(v3Content\),\s*\{[\s\S]{0,320}safetyMode:\s*'advisory'[\s\S]{0,320}advisoryIssues:\s*v3AdvisoryIssues[\s\S]{0,80}\},\s*\);/);
  });

  it('routes exact V3 through the strict request envelope and leaves legacy sampling isolated', () => {
    expect(generator).toMatch(/executionPolicy:\s*isV3Prompt\s*\?\s*CONTENT_QUALITY_V3_STRICT_SINGLE_CALL_POLICY/);
    expect(generator).toMatch(/strictRequestEnvelope\s*=\s*strictSingleCall\s*\?\s*createContentQualityV3GeminiRequestEnvelope\(prompt\)/);
    expect(generator).toMatch(/const\s+requestConfig:\s*any\s*=\s*strictRequestEnvelope\s*\?\s*createContentQualityV3GeminiSdkRequest\(strictRequestEnvelope\)/);
    expect(generator).toMatch(/generationConfig:\s*buildGeminiGenerationConfig\(\{/);
    expect(generator).toMatch(/resolveGeminiEmptyResponseRetryTemperature\(\s*activeTemperature,\s*options\.useModelDefaultSampling === true/);
  });
});
