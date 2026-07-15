import {
  CONTENT_QUALITY_V3_STRATA,
  type ContentQualityV3EvalStratum,
} from './evalCorpusTypes.js';

export const CONTENT_QUALITY_V3_RELEASE_CASES_PER_STRATUM = 24 as const;
export const CONTENT_QUALITY_V3_RELEASE_CASE_COUNT =
  CONTENT_QUALITY_V3_STRATA.length * CONTENT_QUALITY_V3_RELEASE_CASES_PER_STRATUM;

export const CONTENT_QUALITY_V3_RELEASE_SCENARIOS = Object.freeze([
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

export interface ContentQualityV3ReleaseCaseManifestEntry {
  readonly caseId: string;
  readonly stratum: ContentQualityV3EvalStratum;
}

export const CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST:
readonly ContentQualityV3ReleaseCaseManifestEntry[] = Object.freeze(
  CONTENT_QUALITY_V3_STRATA.flatMap(stratum => (
    CONTENT_QUALITY_V3_RELEASE_SCENARIOS.map(scenario => Object.freeze({
      caseId: `${stratum}:${scenario}`,
      stratum,
    }))
  )),
);
