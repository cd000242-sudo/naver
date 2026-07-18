import fs from 'fs/promises';
import path from 'path';
import type {
  ContentPolicyConfig,
  ExposureStatus,
  IntentType,
} from './types';

interface JsYamlModule {
  load(source: string): unknown;
}

const yaml = require('js-yaml') as JsYamlModule;

export interface LoadContentPolicyOptions {
  policyPath?: string;
}

async function resolveDefaultPolicyPath(): Promise<string> {
  const candidates = [
    process.env.CONTENT_POLICY_PATH,
    path.join(process.cwd(), 'config', 'content_policy.yaml'),
    path.join(__dirname, '..', 'config', 'content_policy.yaml'),
    path.join(__dirname, '..', '..', 'config', 'content_policy.yaml'),
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.trim()));
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      // Try the next supported development/packaged location.
    }
  }
  throw new Error(`CONTENT_POLICY_NOT_FOUND:${candidates.map((candidate) => path.resolve(candidate)).join('|')}`);
}

type UnknownRecord = Record<string, unknown>;

function fail(location: string, expected: string): never {
  throw new Error(`INVALID_CONTENT_POLICY: ${location} must be ${expected}`);
}

function readRecord(value: unknown, location: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(location, 'an object');
  }
  return value as UnknownRecord;
}

function readSection(parent: UnknownRecord, key: string, location = key): UnknownRecord {
  return readRecord(parent[key], location);
}

function readString(parent: UnknownRecord, key: string, location: string): string {
  const value = parent[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fail(`${location}.${key}`, 'a non-empty string');
  }
  return value.trim();
}

function readBoolean(parent: UnknownRecord, key: string, location: string): boolean {
  const value = parent[key];
  if (typeof value !== 'boolean') return fail(`${location}.${key}`, 'a boolean');
  return value;
}

function readNumber(
  parent: UnknownRecord,
  key: string,
  location: string,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const value = parent[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(`${location}.${key}`, 'a finite number');
  }
  if (options.integer && !Number.isInteger(value)) {
    return fail(`${location}.${key}`, 'an integer');
  }
  if (options.min !== undefined && value < options.min) {
    return fail(`${location}.${key}`, `at least ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    return fail(`${location}.${key}`, `at most ${options.max}`);
  }
  return value;
}

function readStringArray(
  parent: UnknownRecord,
  key: string,
  location: string,
  options: { allowEmpty?: boolean } = {},
): string[] {
  const value = parent[key];
  if (!Array.isArray(value) || (!options.allowEmpty && value.length === 0)) {
    return fail(`${location}.${key}`, 'a non-empty string array');
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      return fail(`${location}.${key}[${index}]`, 'a non-empty string');
    }
    return entry.trim();
  });
}

function readEnum<T extends string>(
  parent: UnknownRecord,
  key: string,
  location: string,
  allowed: readonly T[],
): T {
  const value = readString(parent, key, location);
  if (!allowed.includes(value as T)) {
    return fail(`${location}.${key}`, `one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function readEnumArray<T extends string>(
  parent: UnknownRecord,
  key: string,
  location: string,
  allowed: readonly T[],
): T[] {
  return readStringArray(parent, key, location).map((value, index) => {
    if (!allowed.includes(value as T)) {
      return fail(`${location}.${key}[${index}]`, `one of ${allowed.join(', ')}`);
    }
    return value as T;
  });
}

function assertOrderedRange(min: number, max: number, location: string): void {
  if (min > max) fail(location, 'an ordered minimum/maximum range');
}

const INTENT_TYPES: readonly IntentType[] = [
  'informational',
  'local',
  'transactional',
  'comparison',
  'urgent',
  'aftercare',
];

const EXPOSURE_STATUSES: readonly ExposureStatus[] = [
  'PENDING_INDEX',
  'INDEXED',
  'MISSING_SUSPECT',
  'MISSING_CONFIRMED',
  'CHECK_ERROR',
];

function readInputs(root: UnknownRecord): ContentPolicyConfig['inputs'] {
  const section = readSection(root, 'inputs');
  return {
    required: readStringArray(section, 'required', 'inputs'),
    recommended: readStringArray(section, 'recommended', 'inputs', { allowEmpty: true }),
  };
}

function readIntent(root: UnknownRecord): ContentPolicyConfig['intent'] {
  const section = readSection(root, 'intent');
  return {
    min_score: readNumber(section, 'min_score', 'intent', { min: 0, max: 100 }),
    answer_within_body_ratio: readNumber(section, 'answer_within_body_ratio', 'intent', { min: 0, max: 1 }),
    allowed_types: readEnumArray(section, 'allowed_types', 'intent', INTENT_TYPES),
    fatal_mismatch: readBoolean(section, 'fatal_mismatch', 'intent'),
  };
}

function readContent(root: UnknownRecord): ContentPolicyConfig['content'] {
  const section = readSection(root, 'content');
  const headingsMin = readNumber(section, 'headings_min', 'content', { min: 1, integer: true });
  const headingsMax = readNumber(section, 'headings_max', 'content', { min: 1, integer: true });
  const faqMin = readNumber(section, 'faq_min', 'content', { min: 0, integer: true });
  const faqMax = readNumber(section, 'faq_max', 'content', { min: 0, integer: true });
  assertOrderedRange(headingsMin, headingsMax, 'content heading limits');
  assertOrderedRange(faqMin, faqMax, 'content FAQ limits');
  return {
    headings_min: headingsMin,
    headings_max: headingsMax,
    faq_min: faqMin,
    faq_max: faqMax,
    cta_max_count: readNumber(section, 'cta_max_count', 'content', { min: 0, integer: true }),
    fixed_keyword_density: readBoolean(section, 'fixed_keyword_density', 'content'),
    primary_keyword_in_title_max: readNumber(
      section,
      'primary_keyword_in_title_max',
      'content',
      { min: 0, integer: true },
    ),
    prohibit_keyword_stuffing: readBoolean(section, 'prohibit_keyword_stuffing', 'content'),
    prohibit_fabricated_firsthand_experience: readBoolean(
      section,
      'prohibit_fabricated_firsthand_experience',
      'content',
    ),
    prohibit_unsupported_prices_and_results: readBoolean(
      section,
      'prohibit_unsupported_prices_and_results',
      'content',
    ),
  };
}

function readRotation(root: UnknownRecord): ContentPolicyConfig['rotation'] {
  const section = readSection(root, 'rotation');
  return {
    exclude_recent_structure_count: readNumber(
      section,
      'exclude_recent_structure_count',
      'rotation',
      { min: 0, integer: true },
    ),
    topic_angles: readStringArray(section, 'topic_angles', 'rotation'),
  };
}

function readSimilarity(root: UnknownRecord): ContentPolicyConfig['similarity'] {
  const section = readSection(root, 'similarity');
  const compareMin = readNumber(section, 'compare_recent_posts_min', 'similarity', { min: 1, integer: true });
  const compareRecommended = readNumber(
    section,
    'compare_recent_posts_recommended',
    'similarity',
    { min: 1, integer: true },
  );
  assertOrderedRange(compareMin, compareRecommended, 'similarity recent-post limits');
  return {
    compare_recent_posts_min: compareMin,
    compare_recent_posts_recommended: compareRecommended,
    title_token_jaccard_max: readNumber(section, 'title_token_jaccard_max', 'similarity', { min: 0, max: 1 }),
    intro_char_ngram_cosine_max: readNumber(section, 'intro_char_ngram_cosine_max', 'similarity', { min: 0, max: 1 }),
    exact_sentence_reuse_ratio_max: readNumber(section, 'exact_sentence_reuse_ratio_max', 'similarity', { min: 0, max: 1 }),
    body_embedding_cosine_max: readNumber(section, 'body_embedding_cosine_max', 'similarity', { min: 0, max: 1 }),
    heading_overlap_max: readNumber(section, 'heading_overlap_max', 'similarity', { min: 0, max: 1 }),
    repeated_opening_window: readNumber(section, 'repeated_opening_window', 'similarity', { min: 1, integer: true }),
    repeated_opening_max_occurrences: readNumber(
      section,
      'repeated_opening_max_occurrences',
      'similarity',
      { min: 0, integer: true },
    ),
    rewrite_limit: readNumber(section, 'rewrite_limit', 'similarity', { min: 0, integer: true }),
    whitelist_fields: readStringArray(section, 'whitelist_fields', 'similarity', { allowEmpty: true }),
  };
}

function readQualityGate(root: UnknownRecord): ContentPolicyConfig['quality_gate'] {
  const section = readSection(root, 'quality_gate');
  const weights = readSection(section, 'weights', 'quality_gate.weights');
  return {
    pass_score: readNumber(section, 'pass_score', 'quality_gate', { min: 0, max: 100 }),
    weights: {
      intent_match: readNumber(weights, 'intent_match', 'quality_gate.weights', { min: 0 }),
      reader_value: readNumber(weights, 'reader_value', 'quality_gate.weights', { min: 0 }),
      originality: readNumber(weights, 'originality', 'quality_gate.weights', { min: 0 }),
      first_party_information: readNumber(weights, 'first_party_information', 'quality_gate.weights', { min: 0 }),
      readability_and_accuracy: readNumber(weights, 'readability_and_accuracy', 'quality_gate.weights', { min: 0 }),
      anti_spam_safety: readNumber(weights, 'anti_spam_safety', 'quality_gate.weights', { min: 0 }),
    },
    fatal_errors: readStringArray(section, 'fatal_errors', 'quality_gate'),
  };
}

function readPublication(root: UnknownRecord): ContentPolicyConfig['publication'] {
  const section = readSection(root, 'publication');
  return {
    require_decision: readEnum(section, 'require_decision', 'publication', ['PASS'] as const),
    min_interval_minutes_env: readString(section, 'min_interval_minutes_env', 'publication'),
    daily_cap_env: readString(section, 'daily_cap_env', 'publication'),
    prevent_consecutive_same_template: readBoolean(section, 'prevent_consecutive_same_template', 'publication'),
    prevent_consecutive_same_structure: readBoolean(section, 'prevent_consecutive_same_structure', 'publication'),
    prevent_consecutive_same_angle: readBoolean(section, 'prevent_consecutive_same_angle', 'publication'),
    disallow_when_paused: readBoolean(section, 'disallow_when_paused', 'publication'),
  };
}

function readMonitoring(root: UnknownRecord): ContentPolicyConfig['monitoring'] {
  const section = readSection(root, 'monitoring');
  return {
    allowed_statuses: readEnumArray(section, 'allowed_statuses', 'monitoring', EXPOSURE_STATUSES),
    minimum_cross_checks: readNumber(section, 'minimum_cross_checks', 'monitoring', { min: 1, integer: true }),
    single_third_party_result_is_not_final: readBoolean(
      section,
      'single_third_party_result_is_not_final',
      'monitoring',
    ),
    on_first_confirmed_missing: readEnum(
      section,
      'on_first_confirmed_missing',
      'monitoring',
      ['ADVISORY_SAME_TEMPLATE'] as const,
    ),
    on_two_consecutive_confirmed_missing: readEnum(
      section,
      'on_two_consecutive_confirmed_missing',
      'monitoring',
      ['ADVISORY_ALL'] as const,
    ),
    auto_delete_on_missing: readBoolean(section, 'auto_delete_on_missing', 'monitoring'),
    auto_republish_on_missing: readBoolean(section, 'auto_republish_on_missing', 'monitoring'),
    require_root_cause_analysis: readBoolean(section, 'require_root_cause_analysis', 'monitoring'),
    require_manual_test_before_resume: readBoolean(section, 'require_manual_test_before_resume', 'monitoring'),
  };
}

export function validateContentPolicyConfig(value: unknown): ContentPolicyConfig {
  const root = readRecord(value, 'content policy');
  const logging = readSection(root, 'logging');
  return {
    version: readNumber(root, 'version', 'content policy', { min: 1, integer: true }),
    policy_name: readString(root, 'policy_name', 'content policy'),
    inputs: readInputs(root),
    intent: readIntent(root),
    content: readContent(root),
    rotation: readRotation(root),
    similarity: readSimilarity(root),
    quality_gate: readQualityGate(root),
    publication: readPublication(root),
    monitoring: readMonitoring(root),
    logging: { required_fields: readStringArray(logging, 'required_fields', 'logging') },
  };
}

export async function loadContentPolicy(
  options: LoadContentPolicyOptions = {},
): Promise<ContentPolicyConfig> {
  const policyPath = options.policyPath
    ? path.resolve(options.policyPath)
    : await resolveDefaultPolicyPath();
  const source = await fs.readFile(policyPath, 'utf8');

  let parsed: unknown;
  try {
    parsed = yaml.load(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`INVALID_CONTENT_POLICY_YAML: ${message}`);
  }

  return validateContentPolicyConfig(parsed);
}
