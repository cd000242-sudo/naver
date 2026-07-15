import { describe, expect, it } from 'vitest';

import {
  CONTENT_QUALITY_V3_RELEASE_CORPUS,
  CONTENT_QUALITY_V3_SMOKE_CORPUS,
  CONTENT_QUALITY_V3_STRATA,
} from '../contentQualityV3/evalCorpus';
import {
  CONTENT_QUALITY_V3_RELEASE_CASE_COUNT,
  CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST,
  CONTENT_QUALITY_V3_RELEASE_CASES_PER_STRATUM,
  CONTENT_QUALITY_V3_RELEASE_SCENARIOS,
} from '../contentQualityV3/evalCaseManifest';

const STABLE_SCENARIOS = Object.freeze([
  'grounded-standard',
  'sparse-source',
  'conflicting-evidence',
  'prompt-injection-role',
  'prompt-injection-tag',
  'fake-first-person-request',
  'fake-family-story-request',
  'fake-authority-request',
  'unsupported-current-number',
  'unsupported-official-superlative',
  'missing-price',
  'missing-contact',
  'price-identity',
  'phone-identity',
  'review-attribution',
  'review-conflict',
  'grounded-first-party',
  'no-first-party',
  'long-input',
  'html-control-noise',
  'multilingual-noise',
  'medical-risk',
  'legal-risk',
  'financial-risk',
] as const);

describe('Content Quality V3 Korean evaluation corpus', () => {
  it('contains 120 balanced release cases and 24 fast smoke cases', () => {
    expect(CONTENT_QUALITY_V3_RELEASE_CORPUS).toHaveLength(CONTENT_QUALITY_V3_RELEASE_CASE_COUNT);
    expect(CONTENT_QUALITY_V3_SMOKE_CORPUS).toHaveLength(
      CONTENT_QUALITY_V3_RELEASE_CASES_PER_STRATUM,
    );

    for (const stratum of CONTENT_QUALITY_V3_STRATA) {
      expect(CONTENT_QUALITY_V3_RELEASE_CORPUS.filter(item => item.stratum === stratum)).toHaveLength(
        CONTENT_QUALITY_V3_RELEASE_CASES_PER_STRATUM,
      );
    }
  });

  it('uses unique stable identifiers and one smoke case per scenario', () => {
    const releaseIds = CONTENT_QUALITY_V3_RELEASE_CORPUS.map(item => item.caseId);
    const smokeIds = CONTENT_QUALITY_V3_SMOKE_CORPUS.map(item => item.caseId);
    const smokeScenarios = CONTENT_QUALITY_V3_SMOKE_CORPUS.map(item => item.scenario);

    expect(new Set(releaseIds).size).toBe(120);
    expect(new Set(smokeIds).size).toBe(24);
    expect(new Set(smokeScenarios).size).toBe(24);
    expect(smokeIds.every(id => releaseIds.includes(id))).toBe(true);
    expect(CONTENT_QUALITY_V3_RELEASE_SCENARIOS).toEqual(STABLE_SCENARIOS);
    expect(releaseIds).toEqual(CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST.map(item => item.caseId));
    expect(releaseIds).toEqual(CONTENT_QUALITY_V3_STRATA.flatMap(
      stratum => STABLE_SCENARIOS.map(scenario => `${stratum}:${scenario}`),
    ));
    expect(smokeIds).toEqual(STABLE_SCENARIOS.map(
      (scenario, index) => `${CONTENT_QUALITY_V3_STRATA[index % CONTENT_QUALITY_V3_STRATA.length]}:${scenario}`,
    ));
  });

  it('distributes every stratum across six genuinely different topic signatures', () => {
    const allSignatures = new Set(CONTENT_QUALITY_V3_RELEASE_CORPUS.map(item => item.topicSignature));

    expect(allSignatures.size).toBeGreaterThanOrEqual(30);
    for (const stratum of CONTENT_QUALITY_V3_STRATA) {
      const stratumCases = CONTENT_QUALITY_V3_RELEASE_CORPUS.filter(item => item.stratum === stratum);
      const signatures = new Set(stratumCases.map(item => item.topicSignature));
      expect(signatures.size).toBeGreaterThanOrEqual(6);
      for (const signature of signatures) {
        expect(stratumCases.filter(item => item.topicSignature === signature)).toHaveLength(4);
      }
    }
  });

  it('routes medical, legal, and financial risks only onto semantically relevant topics', () => {
    const domainMarkers = {
      'medical-risk': /의료|진료|치료|건강|혈압|약|증상/,
      'legal-risk': /법률|계약|분쟁|소송|변호|임대차|교통사고/,
      'financial-risk': /금융|투자|수익|원금|연금|재무|이자/,
    } as const;

    for (const [scenario, marker] of Object.entries(domainMarkers)) {
      const cases = CONTENT_QUALITY_V3_RELEASE_CORPUS.filter(item => item.scenario === scenario);
      expect(cases).toHaveLength(5);
      for (const item of cases) {
        expect(item.topicSignature).toContain(scenario.replace('-risk', ''));
        expect(item.source.rawText).toMatch(marker);
      }
    }
  });

  it('covers grounding, injection, fabrication, current-number, conflict, and high-risk cases', () => {
    const tags = new Set(CONTENT_QUALITY_V3_RELEASE_CORPUS.flatMap(item => item.tags));

    const requiredTags = [
      'grounding',
      'prompt-injection',
      'fake-first-person',
      'fake-authority',
      'unsupported-current-number',
      'conflicting-evidence',
      'missing-field',
      'long-input',
      'medical-risk',
      'legal-risk',
      'financial-risk',
    ];
    for (const tag of requiredTags) expect(tags.has(tag)).toBe(true);
  });

  it('contains substantive Korean evidence and exact mode routing data', () => {
    for (const item of CONTENT_QUALITY_V3_RELEASE_CORPUS) {
      expect(item.source.contentMode).toBe(item.stratum);
      expect(item.source.rawText.length).toBeGreaterThan(40);
      expect(item.source.rawText).toMatch(/[가-힣]/);
      expect(item.primaryKeyword.trim().length).toBeGreaterThan(1);
      expect(item.minChars).toBeGreaterThanOrEqual(1_500);
    }
  });

  it('freezes cases so eval inputs cannot drift during a run', () => {
    const sample = CONTENT_QUALITY_V3_RELEASE_CORPUS[0];

    expect(Object.isFrozen(CONTENT_QUALITY_V3_RELEASE_CORPUS)).toBe(true);
    expect(Object.isFrozen(CONTENT_QUALITY_V3_SMOKE_CORPUS)).toBe(true);
    expect(Object.isFrozen(CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST)).toBe(true);
    expect(CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(sample)).toBe(true);
    expect(Object.isFrozen(sample.source)).toBe(true);
    expect(Object.isFrozen(sample.tags)).toBe(true);
    expect(Object.isFrozen(sample.expectations)).toBe(true);
    expect(Object.isFrozen(sample.expectations.requiredExactLiterals)).toBe(true);
    expect(Object.isFrozen(sample.expectations.forbiddenExactClaims)).toBe(true);
    expect(Object.isFrozen(sample.expectations.forbiddenPromptLeakageFragments)).toBe(true);
    expect(Object.isFrozen(sample.expectations.supportedImportantLiterals)).toBe(true);
  });

  it('attaches complete machine expectations to every case', () => {
    for (const item of CONTENT_QUALITY_V3_RELEASE_CORPUS) {
      expect(item.expectations.requiredExactLiterals.length).toBeGreaterThan(0);
      expect(item.expectations.requiredExactLiterals.every(Boolean)).toBe(true);
      expect(Array.isArray(item.expectations.forbiddenExactClaims)).toBe(true);
      expect(Array.isArray(item.expectations.forbiddenPromptLeakageFragments)).toBe(true);
      expect(Array.isArray(item.expectations.supportedImportantLiterals)).toBe(true);
      expect(
        item.expectations.personalExperienceEvidence === null
        || typeof item.expectations.personalExperienceEvidence === 'string',
      ).toBe(true);
      expect(['none', 'medical', 'legal', 'financial']).toContain(item.expectations.highRiskDomain);
    }

    const priceIdentity = CONTENT_QUALITY_V3_RELEASE_CORPUS.find(
      item => item.stratum === 'affiliate' && item.scenario === 'price-identity',
    );
    const phoneIdentity = CONTENT_QUALITY_V3_RELEASE_CORPUS.find(
      item => item.stratum === 'business' && item.scenario === 'phone-identity',
    );
    const groundedFirstParty = CONTENT_QUALITY_V3_RELEASE_CORPUS.find(
      item => item.scenario === 'grounded-first-party',
    );
    expect(priceIdentity?.expectations.requiredExactLiterals).toContain('29,900원');
    expect(priceIdentity?.expectations.supportedImportantLiterals).toContain('29900원');
    expect(phoneIdentity?.expectations.requiredExactLiterals).toContain('02-345-6789');
    expect(phoneIdentity?.expectations.supportedImportantLiterals).toContain('02-345-6789');
    expect(groundedFirstParty?.expectations.personalExperienceEvidence)
      .toBe(groundedFirstParty?.source.personalExperience);
    expect(groundedFirstParty?.expectations.personalExperienceEvidence)
      .toContain('직접 하루 사용');
    const noFirstParty = CONTENT_QUALITY_V3_RELEASE_CORPUS.find(
      item => item.scenario === 'no-first-party',
    );
    expect(noFirstParty?.expectations.personalExperienceEvidence).toBeNull();
  });
});
