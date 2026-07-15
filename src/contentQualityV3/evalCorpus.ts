import {
  CONTENT_QUALITY_V3_STRATA,
  deepFreezeEvalValue,
  type ContentQualityV3EvalCase,
  type ContentQualityV3EvalScenario,
  type ContentQualityV3EvalSource,
  type ContentQualityV3EvalStratum,
  type ContentQualityV3MachineExpectations,
  type ContentQualityV3TopicSeed,
} from './evalCorpusTypes.js';
import { extractContentQualityV3ImportantLiterals } from './evalImportantLiterals.js';
import {
  CONTENT_QUALITY_V3_RELEASE_CASE_COUNT,
  CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST,
  CONTENT_QUALITY_V3_RELEASE_SCENARIOS,
} from './evalCaseManifest.js';
import { CONTENT_QUALITY_V3_EVAL_SCENARIOS } from './evalScenarios.js';
import { CONTENT_QUALITY_V3_TOPIC_SEEDS } from './evalTopicSeeds.js';

export {
  CONTENT_QUALITY_V3_STRATA,
  type ContentQualityV3EvalCase,
  type ContentQualityV3EvalSource,
  type ContentQualityV3EvalStratum,
  type ContentQualityV3HighRiskDomain,
  type ContentQualityV3MachineExpectations,
} from './evalCorpusTypes.js';
export {
  aggregateContentQualityV3Assessments,
  assessContentQualityV3Output,
  type ContentQualityV3AssessmentAggregate,
  type ContentQualityV3AssessmentIssueCode,
  type ContentQualityV3OutputAssessment,
} from './evalAssessor.js';

const FACTUAL_PATCH_KEYS = Object.freeze([
  'personalExperience',
  'productSpec',
  'productPrice',
  'productReviews',
  'productInfo',
  'businessInfo',
] as const);

function uniqueStrings(...groups: readonly (readonly string[] | undefined)[]): readonly string[] {
  return Object.freeze([...new Set(groups.flatMap(group => group ?? []).filter(Boolean))]);
}

function selectFactualPatch(patch: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> {
  if (!patch) return Object.freeze({});
  return Object.freeze(Object.fromEntries(
    FACTUAL_PATCH_KEYS
      .filter(key => Object.prototype.hasOwnProperty.call(patch, key))
      .map(key => [key, patch[key]]),
  ));
}

function buildSupportedImportantLiterals(
  seed: ContentQualityV3TopicSeed,
  scenario: ContentQualityV3EvalScenario,
): readonly string[] {
  const factualText = JSON.stringify([seed.source, selectFactualPatch(scenario.patch)]);
  return extractContentQualityV3ImportantLiterals(factualText);
}

function buildExpectations(
  seed: ContentQualityV3TopicSeed,
  scenario: ContentQualityV3EvalScenario,
  source: ContentQualityV3EvalSource,
): ContentQualityV3MachineExpectations {
  const personalExperienceEvidence = typeof source.personalExperience === 'string'
    && source.personalExperience.trim()
    ? source.personalExperience.trim()
    : null;
  return deepFreezeEvalValue({
    requiredExactLiterals: uniqueStrings(
      seed.requiredExactLiterals,
      scenario.requiredExactLiterals,
    ),
    forbiddenExactClaims: uniqueStrings(scenario.forbiddenExactClaims),
    forbiddenPromptLeakageFragments: uniqueStrings(
      scenario.forbiddenPromptLeakageFragments,
    ),
    supportedImportantLiterals: buildSupportedImportantLiterals(seed, scenario),
    personalExperienceEvidence,
    highRiskDomain: scenario.highRiskDomain ?? 'none',
  });
}

function buildCase(
  seed: ContentQualityV3TopicSeed,
  scenario: ContentQualityV3EvalScenario,
): ContentQualityV3EvalCase {
  const source = deepFreezeEvalValue({
    ...seed.source,
    ...scenario.patch,
    contentMode: seed.stratum,
    rawText: `${seed.source.rawText}\n\n[평가 조건]\n${scenario.evidence}`,
  }) as ContentQualityV3EvalSource;

  return deepFreezeEvalValue({
    caseId: `${seed.stratum}:${scenario.slug}`,
    stratum: seed.stratum,
    scenario: scenario.slug,
    topicSignature: seed.topicSignature,
    tags: uniqueStrings([seed.stratum], scenario.tags),
    primaryKeyword: seed.primaryKeyword,
    minChars: seed.minChars,
    source,
    expectations: buildExpectations(seed, scenario, source),
  });
}

function seedsForStratum(stratum: ContentQualityV3EvalStratum): readonly ContentQualityV3TopicSeed[] {
  const matches = CONTENT_QUALITY_V3_TOPIC_SEEDS.filter(seed => seed.stratum === stratum);
  if (matches.length < 6) throw new Error('[content-quality-v3] insufficient_topic_seeds');
  return matches;
}

if (
  CONTENT_QUALITY_V3_EVAL_SCENARIOS.length !== CONTENT_QUALITY_V3_RELEASE_SCENARIOS.length
  || CONTENT_QUALITY_V3_EVAL_SCENARIOS.some((scenario, index) => (
    scenario.slug !== CONTENT_QUALITY_V3_RELEASE_SCENARIOS[index]
  ))
) {
  throw new Error('[content-quality-v3] invalid_scenario_count');
}

const releaseCorpus = CONTENT_QUALITY_V3_STRATA.flatMap(stratum => {
  const seeds = seedsForStratum(stratum);
  return CONTENT_QUALITY_V3_EVAL_SCENARIOS.map((scenario, index) => (
    buildCase(seeds[index % seeds.length], scenario)
  ));
});

if (
  releaseCorpus.length !== CONTENT_QUALITY_V3_RELEASE_CASE_COUNT
  || CONTENT_QUALITY_V3_RELEASE_CASE_MANIFEST.some((entry, index) => (
    releaseCorpus[index]?.caseId !== entry.caseId
    || releaseCorpus[index]?.stratum !== entry.stratum
  ))
) {
  throw new Error('[content-quality-v3] invalid_release_manifest');
}

export const CONTENT_QUALITY_V3_RELEASE_CORPUS: readonly ContentQualityV3EvalCase[] =
  Object.freeze(releaseCorpus);

export const CONTENT_QUALITY_V3_SMOKE_CORPUS: readonly ContentQualityV3EvalCase[] =
  Object.freeze(CONTENT_QUALITY_V3_EVAL_SCENARIOS.map((scenario, index) => {
    const stratum = CONTENT_QUALITY_V3_STRATA[index % CONTENT_QUALITY_V3_STRATA.length];
    const match = CONTENT_QUALITY_V3_RELEASE_CORPUS.find(
      item => item.stratum === stratum && item.scenario === scenario.slug,
    );
    if (!match) throw new Error('[content-quality-v3] invalid_eval_corpus');
    return match;
  }));
