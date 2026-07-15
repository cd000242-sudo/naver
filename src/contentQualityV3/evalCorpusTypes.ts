export const CONTENT_QUALITY_V3_STRATA = Object.freeze([
  'seo',
  'homefeed',
  'affiliate',
  'business',
  'mate',
] as const);

export type ContentQualityV3EvalStratum = typeof CONTENT_QUALITY_V3_STRATA[number];
export type ContentQualityV3HighRiskDomain = 'none' | 'medical' | 'legal' | 'financial';

export interface ContentQualityV3EvalSource {
  readonly rawText: string;
  readonly contentMode: ContentQualityV3EvalStratum;
  readonly title?: string;
  readonly manualTitleOverride?: unknown;
  readonly useKeywordAsTitle?: boolean;
  readonly keywordForTitle?: string;
  readonly metadata?: Readonly<{ keywords?: unknown }>;
  readonly keywords?: unknown;
  readonly sourceType?: string;
  readonly categoryHint?: string;
  readonly toneStyle?: string;
  readonly targetAge?: string;
  readonly customPrompt?: string;
  readonly personalExperience?: string;
  readonly productSpec?: string;
  readonly productPrice?: string;
  readonly productReviews?: readonly string[];
  readonly productInfo?: Readonly<Record<string, unknown>>;
  readonly businessInfo?: Readonly<Record<string, unknown>>;
}

export interface ContentQualityV3MachineExpectations {
  readonly requiredExactLiterals: readonly string[];
  readonly forbiddenExactClaims: readonly string[];
  readonly forbiddenPromptLeakageFragments: readonly string[];
  readonly supportedImportantLiterals: readonly string[];
  readonly personalExperienceEvidence: string | null;
  readonly highRiskDomain: ContentQualityV3HighRiskDomain;
}

export interface ContentQualityV3EvalCase {
  readonly caseId: string;
  readonly stratum: ContentQualityV3EvalStratum;
  readonly scenario: string;
  readonly topicSignature: string;
  readonly tags: readonly string[];
  readonly primaryKeyword: string;
  readonly minChars: number;
  readonly source: ContentQualityV3EvalSource;
  readonly expectations: ContentQualityV3MachineExpectations;
}

export interface ContentQualityV3EvalScenario {
  readonly slug: string;
  readonly evidence: string;
  readonly tags: readonly string[];
  readonly patch?: Readonly<Record<string, unknown>>;
  readonly requiredExactLiterals?: readonly string[];
  readonly forbiddenExactClaims?: readonly string[];
  readonly forbiddenPromptLeakageFragments?: readonly string[];
  readonly highRiskDomain?: Exclude<ContentQualityV3HighRiskDomain, 'none'>;
}

export interface ContentQualityV3TopicSeed {
  readonly stratum: ContentQualityV3EvalStratum;
  readonly topicSignature: string;
  readonly primaryKeyword: string;
  readonly minChars: number;
  readonly requiredExactLiterals: readonly string[];
  readonly source: Readonly<Record<string, unknown> & { readonly rawText: string }>;
}

export function deepFreezeEvalValue<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeEvalValue(child);
  }
  return Object.freeze(value);
}
