import type { StructuredContent } from '../contentGenerator.js';
import { extractContentQualityV3ImportantLiterals } from './evalImportantLiterals.js';

const RAW_TEXT_MAX_CHARS = 80_000;
const PERSONAL_EXPERIENCE_MAX_CHARS = 12_000;
const PRODUCT_SPEC_MAX_CHARS = 20_000;
const PRODUCT_PRICE_MAX_CHARS = 300;
const PRODUCT_REVIEW_MAX_ITEMS = 5;
const PRODUCT_REVIEW_MAX_CHARS = 2_000;

export type ContentQualityV3FactualRiskDomain = 'medical' | 'legal' | 'financial';

export type ContentQualityV3FactualSafetyIssueCode =
  | 'prompt_leakage'
  | 'fake_first_person'
  | 'unsupported_important_number'
  | 'high_risk_guarantee';

export const CONTENT_QUALITY_V3_FACTUAL_SAFETY_ISSUE_ORDER = Object.freeze([
  'prompt_leakage',
  'fake_first_person',
  'unsupported_important_number',
  'high_risk_guarantee',
] as const satisfies readonly ContentQualityV3FactualSafetyIssueCode[]);

export interface ContentQualityV3FactualEvidenceInput {
  readonly rawText?: unknown;
  readonly sourceType?: unknown;
  readonly title?: unknown;
  readonly categoryHint?: unknown;
  readonly articleType?: unknown;
  readonly personalExperience?: unknown;
  readonly productSpec?: unknown;
  readonly productPrice?: unknown;
  readonly productReviews?: unknown;
  readonly productInfo?: unknown;
  readonly businessInfo?: unknown;
}

export interface ContentQualityV3FactualEvidenceOverrides {
  readonly supportedImportantLiterals?: readonly string[];
  readonly personalExperienceEvidence?: string | null;
  readonly highRiskDomain?: ContentQualityV3FactualRiskDomain | 'none';
  readonly forbiddenPromptLeakageFragments?: readonly string[];
}

export interface ContentQualityV3FactualEvidenceSnapshot {
  readonly supportedImportantLiterals: readonly string[];
  readonly personalExperienceEvidence: string | null;
  readonly highRiskDomains: readonly ContentQualityV3FactualRiskDomain[];
  readonly forbiddenPromptLeakageFragments: readonly string[];
}

export interface ContentQualityV3FactualSafetyResult {
  readonly ok: boolean;
  readonly issueCodes: readonly ContentQualityV3FactualSafetyIssueCode[];
  readonly promptLeakageCount: number;
  readonly fakeFirstPersonCount: number;
  readonly unsupportedImportantNumberCount: number;
  readonly highRiskGuaranteeCount: number;
}

const GLOBAL_PROMPT_LEAKAGE_FRAGMENTS = Object.freeze([
  '[ROLE]',
  '[INSTRUCTION_PRIORITY]',
  '[TRUST_BOUNDARIES]',
  '[SOURCE_TRUTH]',
  '[WRITING_METHOD]',
  '[BEHAVIORAL_EXAMPLES]',
  '[QUALITY_FLOOR]',
  '시스템 프롬프트',
  'system prompt',
  '이전 지시를 무시',
  '내부 규칙',
  'source_data_json',
  'user_brief_json',
  'trusted_runtime_constraints_json',
  'OUTPUT_CONTRACT',
  '<system>',
]);

const EXPLICIT_FIRST_PARTY_PATTERN = /(?:저는|제가|저도|나는|내가|저희\s*(?:가족|아이|어머니|아버지)?|우리\s+(?:가족|아이|아들|딸|어머니|아버지)|(?:제|내)\s*(?:경험|돈)(?:으로는|으로|상)?)/g;
const IMPLICIT_FIRST_PARTY_PATTERNS = Object.freeze([
  /내돈내산/g,
  /(?:써|사용해?|먹어|마셔|방문해?|가|체험해?|구매해?|이용해?|착용해?|복용해?)\s*(?:보(?:니|니까|니깐)|봤(?:는데|더니|습니다|어요)?|보았(?:는데|더니|습니다|어요)?|보았습니다|본\s*(?:결과|후|바로는)|해\s*보았습니다)/g,
  /(?:써|사용해?|먹어|마셔|방문해?|체험해?|구매해?|이용해?|착용해?|복용해?)\s*왔(?:습니다|어요|는데|더니)/g,
  /(?:다녀왔|겪어봤|받아봤)(?:어요|습니다|는데|더니)?/g,
  /직접\s+(?:써|사용|먹|마시|방문|체험|구매|이용|착용|복용)[^.!?\n]{0,24}(?:결과|후|느꼈|확인했|좋았|불편했)/g,
  /(?:직접|실제로|몸소)\s+[^.!?\n]{0,20}?(?:(?:사용|방문|체험|구매|이용|착용|복용)했|(?:써|먹어|마셔|가|입어|신어)봤|썼|먹었|마셨|갔|입었|신었)(?:습니다|어요|는데|더니)/g,
]);
const ATTRIBUTED_ACTOR_PATTERN = /(?:구매자|사용자|고객|후기\s*작성자|리뷰\s*작성자)/;
const ATTRIBUTION_PREFIX_PATTERN = /(?:후기|리뷰|의견|따르면|의하면)/;
const ATTRIBUTION_SUFFIX_REPORTING_PATTERN = /(?:라고|다고|다는)[^.!?\n]{0,40}(?:남겼|말했|전했|언급했|밝혔|평가했|평가했습니다)/;
const JOINT_SUBJECT_PREFIX_PATTERN = /(?:와|과|그리고|및)\s*$/;
const SELF_AFTER_REVIEW_PATTERN = /(?:후기|리뷰)[^.!?\n]{0,16}(?:보고|읽고|참고(?:해|하여)?)[^.!?\n]{0,32}(?:저는|제가|나는|내가|직접|내돈내산)/;
const EXPERIENCE_DURATION_SOURCE = String.raw`(?:하루|이틀|사흘|나흘|일주일|한\s*달|두\s*달|세\s*달|몇\s*(?:일|주|달|개월|년)|수\s*(?:일|주|달|개월|년)|\d[\d,]*(?:\.\d+)?\s*(?:일|주|달|개월|년))`;
const EXPERIENCE_DURATION_PATTERN = new RegExp(
  `${EXPERIENCE_DURATION_SOURCE}(?:\\s*(?:간|동안))?`,
  'g',
);
const TRAILING_EXPERIENCE_DURATION_PATTERN = new RegExp(
  `${EXPERIENCE_DURATION_SOURCE}(?:\\s*(?:간|동안))?\\s*$`,
);
const ATTRIBUTED_SUBJECT_PREFIX_PATTERN = new RegExp(
  String.raw`(?:구매자|사용자|고객|후기\s*작성자|리뷰\s*작성자)(?:은|는|이|가)\s*(?:${EXPERIENCE_DURATION_SOURCE})?(?:\s*(?:간|동안))?\s*$`,
);

interface ExperienceScopeRule {
  readonly id: string;
  readonly pattern: RegExp;
}

type ExperiencePolarity = 'positive' | 'negative';

interface ExperiencePolarityRule {
  readonly id: string;
  readonly positivePattern: RegExp;
  readonly negativePattern: RegExp;
}

const EXPERIENCE_SCOPE_RULES: readonly ExperienceScopeRule[] = Object.freeze([
  { id: 'use', pattern: /(?:사용|써|쓰|착용|이용)/ },
  { id: 'consume', pattern: /(?:먹|마시|복용)/ },
  { id: 'visit', pattern: /(?:방문|가보|다녀오)/ },
  { id: 'purchase', pattern: /(?:구매|주문|내돈내산)/ },
  { id: 'consult', pattern: /(?:상담|진료|수리|시술)/ },
  { id: 'family-general', pattern: /(?:가족|부모|자녀)/ },
  { id: 'family-child', pattern: /(?:아이|아들|딸)/ },
  { id: 'family-mother', pattern: /(?:어머니|엄마)/ },
  { id: 'family-father', pattern: /(?:아버지|아빠)/ },
  { id: 'family-spouse', pattern: /(?:남편|아내|배우자)/ },
  { id: 'satisfaction', pattern: /만족/ },
  { id: 'positive', pattern: /(?:좋았|좋습니다|좋더|좋아)/ },
  { id: 'effect', pattern: /(?:효과|개선|나아졌|회복)/ },
  { id: 'comfort', pattern: /(?:편했|편하|편리)/ },
  { id: 'kindness', pattern: /친절/ },
  { id: 'recommendation', pattern: /추천/ },
  { id: 'inconvenience', pattern: /불편/ },
  { id: 'problem', pattern: /(?:문제|고장|실패)/ },
  { id: 'taste', pattern: /(?:맛있|담백|달았|썼다)/ },
  { id: 'opinion', pattern: /(?:느꼈|생각했|판단했)/ },
  { id: 'duration', pattern: /(?:하루|이틀|사흘|나흘|일주일|개월|달|주간|년간)/ },
  { id: 'long-duration', pattern: /(?:오래|장기간|수년|꾸준히|매일|항상|여러\s*번)/ },
]);

// Bounded Korean polarity lexicon for source-backed first-person claims.
// A candidate may paraphrase the evidence, but it may not reverse an explicit
// positive/negative outcome within the same semantic dimension.
const EXPERIENCE_POLARITY_RULES: readonly ExperiencePolarityRule[] = Object.freeze([
  {
    id: 'kindness',
    positivePattern: /친절/u,
    negativePattern: /(?:불친절|친절(?:하)?지(?:는)?\s*(?:않|못)|(?:안|못)\s*친절)/u,
  },
  {
    id: 'satisfaction',
    positivePattern: /만족/u,
    negativePattern: /(?:불만족|만족(?:하)?지(?:는)?\s*(?:않|못)|(?:안|못)\s*만족)/u,
  },
  {
    id: 'comfort',
    positivePattern: /(?:편했|편하|편리)/u,
    negativePattern: /(?:불편|(?:편(?:하)?|편리(?:하)?)지(?:는)?\s*(?:않|못)|(?:안|못)\s*(?:편하|편리))/u,
  },
  {
    id: 'recommendation',
    positivePattern: /추천/u,
    negativePattern: /(?:비추천|추천(?:하)?지(?:는)?\s*(?:않|못)|(?:안|못)\s*추천)/u,
  },
  {
    id: 'quality',
    positivePattern: /(?:좋았|좋습니다|좋다|좋은|좋음|좋아)/u,
    negativePattern: /(?:좋(?:지|지는)\s*(?:않|못)|(?:안|못)\s*좋|나빴|나쁘|별로였|별로다)/u,
  },
  {
    id: 'effect',
    positivePattern: /(?:효과|개선|회복|나아졌)/u,
    negativePattern: /(?:효과(?:가|는|도)?\s*없|효과(?:적)?이지(?:는)?\s*(?:않|못)|개선(?:되)?지(?:는)?\s*(?:않|못)|회복(?:되)?지(?:는)?\s*(?:않|못)|악화)/u,
  },
  {
    id: 'taste',
    positivePattern: /(?:맛있|담백|달았)/u,
    negativePattern: /(?:맛(?:이|은|도)?\s*없|맛없|(?:맛있|담백(?:하)?|달)지(?:는)?\s*(?:않|못)|짜(?:다|었)|싱거|역했)/u,
  },
  {
    id: 'problem',
    positivePattern: /(?:문제(?:가|는|도)?\s*없|고장(?:이|은|도)?\s*없|실패(?:하)?지(?:는)?\s*않|정상)/u,
    negativePattern: /(?:(?:문제(?:가|는|도)?\s*없|고장(?:이|은|도)?\s*없|정상(?:적)?(?:이)?)지(?:는)?\s*(?:않|못)|문제(?:가|는)?\s*(?:있|생겼)|고장(?!\s*(?:이|은|도)?\s*없)|실패(?!\s*(?:하)?지(?:는)?\s*않))/u,
  },
]);
const EXPERIENCE_TOKEN_PATTERN = /[가-힣A-Za-z]+/g;
const SAFE_EXPERIENCE_TOKENS = new Set([
  '저', '제', '나', '우리', '저희', '직접', '보니', '본', '결과', '후',
  '한', '두', '세', '몇', '수', '가지', '기록', '범위', '설명', '근거', '안',
  '내용', '말', '왔', '실제', '실제로', '몸소',
]);

const DOMAIN_INFERENCE_PATTERNS: Readonly<Record<ContentQualityV3FactualRiskDomain, RegExp>> =
  Object.freeze({
    medical: /(?:의료|병원|의사|한의원|약국|진료|치료|질환|질병|증상|수술|시술|복용|의약품|부작용|완치)/,
    legal: /(?:법률|법무|변호사|소송|승소|패소|위법|합법|법원|형사|민사|고소|고발|계약\s*분쟁)/,
    financial: /(?:금융|투자|주식|코인|가상자산|펀드|원금|수익률|배당|대출|이자|손실|재테크)/,
  });

const HIGH_RISK_PATTERNS: Readonly<Record<ContentQualityV3FactualRiskDomain, readonly RegExp[]>> =
  Object.freeze({
    medical: Object.freeze([
      /완치(?:를)?\s*보장/g,
      /치료(?:를|가)?[^.!?\n]{0,20}보장/g,
      /(?:효과|개선|회복)(?:를|을|이|가)?[^.!?\n]{0,20}보장/g,
      /완치(?:됩니다|된다|될\s*수\s*밖에)/g,
      /반드시\s*(?:완치|회복|개선)/g,
      /반드시\s*낫/g,
      /부작용(?:이)?\s*없/g,
    ]),
    legal: Object.freeze([
      /승소(?:를)?\s*보장/g,
      /(?:무죄|불기소|기소유예|합의금|배상)(?:를|을|이|가)?[^.!?\n]{0,20}보장/g,
      /무조건\s*승소/g,
      /(?:틀림없이|반드시|무조건)\s*(?:승소|이깁|이긴)/g,
      /확실히\s*위법/g,
      /패소할\s*수\s*없/g,
    ]),
    financial: Object.freeze([
      /(?:원금|수익(?:률)?)[^.!?\n]{0,40}보장/g,
      /\d[\d,]*(?:\.\d+)?\s*(?:%|퍼센트)[^.!?\n]{0,20}보장/g,
      /무조건\s*수익/g,
      /손실(?:이)?\s*없/g,
    ]),
  });

function ownDataValue(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) throw new TypeError('factual evidence accessors are not allowed');
  return descriptor.value;
}

function boundedString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  return normalized ? normalized.slice(0, maxChars) : undefined;
}

function boundedRawText(value: unknown): string | undefined {
  const normalized = boundedString(value, Number.MAX_SAFE_INTEGER);
  if (!normalized || normalized.length <= RAW_TEXT_MAX_CHARS) return normalized;
  const headChars = Math.floor(RAW_TEXT_MAX_CHARS * 0.75);
  return `${normalized.slice(0, headChars)}\n${normalized.slice(-(RAW_TEXT_MAX_CHARS - headChars))}`;
}

function boundedStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const values: string[] = [];
  const itemCount = Math.min(value.length, PRODUCT_REVIEW_MAX_ITEMS);
  for (let index = 0; index < itemCount; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor) continue;
    if (!('value' in descriptor)) throw new TypeError('factual evidence accessors are not allowed');
    const item = boundedString(descriptor.value, PRODUCT_REVIEW_MAX_CHARS);
    if (item && !values.includes(item)) values.push(item);
  }
  return Object.freeze(values);
}

function collectFlatRecordEvidence(value: unknown, maxEntries = 20): readonly string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze([]);
  const fragments: string[] = [];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors).slice(0, maxEntries)) {
    if (!descriptor.enumerable) continue;
    if (!('value' in descriptor)) throw new TypeError('factual evidence accessors are not allowed');
    const cleanKey = boundedString(key, 80);
    const cleanValue = boundedString(descriptor.value, 500);
    if (cleanKey && cleanValue) fragments.push(`${cleanKey} ${cleanValue}`);
    else if (cleanKey && typeof descriptor.value === 'number' && Number.isFinite(descriptor.value)) {
      fragments.push(`${cleanKey} ${descriptor.value}`);
    }
  }
  return Object.freeze(fragments);
}

function collectProductInfoEvidence(value: unknown): readonly string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze([]);
  const fragments: string[] = [];
  for (const [key, maxChars] of [['name', 300], ['brand', 200], ['category', 160]] as const) {
    const item = boundedString(ownDataValue(value, key), maxChars);
    if (item) fragments.push(item);
  }
  const price = ownDataValue(value, 'price');
  if (typeof price === 'number' && Number.isFinite(price) && price >= 0) {
    fragments.push(`${price}원`, `KRW ${price}`);
  }
  fragments.push(...collectFlatRecordEvidence(ownDataValue(value, 'specs')));
  return Object.freeze(fragments);
}

function collectBusinessInfoEvidence(value: unknown): readonly string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze([]);
  const fragments: string[] = [];
  for (const [key, maxChars] of [
    ['name', 300],
    ['phone', 200],
    ['kakao', 300],
    ['address', 500],
    ['hours', 500],
    ['region', 300],
    ['serviceArea', 40],
    ['extra', 3_000],
  ] as const) {
    const item = boundedString(ownDataValue(value, key), maxChars);
    if (item) fragments.push(item);
  }
  return Object.freeze(fragments);
}

function inferHighRiskDomains(text: string): readonly ContentQualityV3FactualRiskDomain[] {
  return Object.freeze((Object.keys(DOMAIN_INFERENCE_PATTERNS) as ContentQualityV3FactualRiskDomain[])
    .filter(domain => DOMAIN_INFERENCE_PATTERNS[domain].test(text)));
}

function cleanExplicitFragments(value: readonly string[] | undefined): readonly string[] {
  if (!value) return Object.freeze([]);
  return Object.freeze([...new Set(value
    .map(item => boundedString(item, 500))
    .filter((item): item is string => Boolean(item)))].slice(0, 50));
}

export function snapshotContentQualityV3FactualEvidence(
  source: ContentQualityV3FactualEvidenceInput,
  overrides: ContentQualityV3FactualEvidenceOverrides = {},
): ContentQualityV3FactualEvidenceSnapshot {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('factual evidence must be an object');
  }

  const rawText = boundedRawText(ownDataValue(source, 'rawText'));
  const title = boundedString(ownDataValue(source, 'title'), 500);
  const personalExperience = boundedString(
    ownDataValue(source, 'personalExperience'),
    PERSONAL_EXPERIENCE_MAX_CHARS,
  );
  const productSpec = boundedString(ownDataValue(source, 'productSpec'), PRODUCT_SPEC_MAX_CHARS);
  const productPrice = boundedString(ownDataValue(source, 'productPrice'), PRODUCT_PRICE_MAX_CHARS);
  const productReviews = boundedStringArray(ownDataValue(source, 'productReviews'));
  const productInfo = collectProductInfoEvidence(ownDataValue(source, 'productInfo'));
  const businessInfo = collectBusinessInfoEvidence(ownDataValue(source, 'businessInfo'));
  const factualFragments = [
    rawText,
    title,
    personalExperience,
    productSpec,
    productPrice,
    ...productReviews,
    ...productInfo,
    ...businessInfo,
  ].filter((item): item is string => Boolean(item));
  const domainFragments = [
    ...factualFragments,
    boundedString(ownDataValue(source, 'sourceType'), 80),
    boundedString(ownDataValue(source, 'categoryHint'), 160),
    boundedString(ownDataValue(source, 'articleType'), 80),
  ].filter((item): item is string => Boolean(item));

  const supportedImportantLiterals = overrides.supportedImportantLiterals
    ? cleanExplicitFragments(overrides.supportedImportantLiterals)
    : extractContentQualityV3ImportantLiterals(factualFragments.join('\n'));
  const personalExperienceEvidence = overrides.personalExperienceEvidence !== undefined
    ? boundedString(overrides.personalExperienceEvidence, PERSONAL_EXPERIENCE_MAX_CHARS) ?? null
    : personalExperience ?? null;
  const highRiskDomains = overrides.highRiskDomain !== undefined
    ? Object.freeze(overrides.highRiskDomain === 'none' ? [] : [overrides.highRiskDomain])
    : inferHighRiskDomains(domainFragments.join('\n'));

  return Object.freeze({
    supportedImportantLiterals: Object.freeze([...supportedImportantLiterals]),
    personalExperienceEvidence,
    highRiskDomains,
    forbiddenPromptLeakageFragments: cleanExplicitFragments(
      overrides.forbiddenPromptLeakageFragments,
    ),
  });
}

function countDistinctFragments(text: string, fragments: readonly string[]): number {
  const normalize = (value: string): string => value
    .toLocaleLowerCase('ko-KR')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '');
  const haystack = normalize(text);
  const compactHaystack = haystack.replace(/\s+/gu, '');
  return new Set(fragments
    .map(fragment => normalize(fragment.trim()))
    .filter(fragment => (
      fragment
      && (
        haystack.includes(fragment)
        || compactHaystack.includes(fragment.replace(/\s+/gu, ''))
      )
    ))).size;
}

function splitInspectionSegments(text: string): readonly string[] {
  const humanVisibleText = text
    .replace(/<(?:br\s*\/?|\/(?:p|div|li|h[1-6]))\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'");
  return Object.freeze([...new Set(humanVisibleText
    .split(/(?:[.!?]+\s*|\n+)/)
    .map(segment => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean))]);
}

function isClearlyAttributedExperience(segment: string, firstPartyIndex: number): boolean {
  const actorIndex = segment.search(ATTRIBUTED_ACTOR_PATTERN);
  const attributionPrefix = actorIndex < 0 ? '' : segment.slice(actorIndex, firstPartyIndex);
  const claimAndReportingSuffix = segment.slice(firstPartyIndex);
  return actorIndex >= 0
    && actorIndex <= firstPartyIndex
    && firstPartyIndex - actorIndex <= 48
    && !JOINT_SUBJECT_PREFIX_PATTERN.test(attributionPrefix)
    && (
      ATTRIBUTED_SUBJECT_PREFIX_PATTERN.test(attributionPrefix)
      || ATTRIBUTION_PREFIX_PATTERN.test(attributionPrefix)
      || ATTRIBUTION_SUFFIX_REPORTING_PATTERN.test(claimAndReportingSuffix)
    )
    && !SELF_AFTER_REVIEW_PATTERN.test(segment);
}

function countFirstPartyMarkers(segment: string): number {
  const explicit = segment.match(EXPLICIT_FIRST_PARTY_PATTERN)?.length ?? 0;
  return IMPLICIT_FIRST_PARTY_PATTERNS.reduce(
    (total, pattern) => total + (segment.match(pattern)?.length ?? 0),
    explicit,
  );
}

function firstPartyMarkerIndex(segment: string): number {
  const indexes = [
    segment.search(EXPLICIT_FIRST_PARTY_PATTERN),
    ...IMPLICIT_FIRST_PARTY_PATTERNS.map(pattern => segment.search(pattern)),
  ].filter(index => index >= 0);
  return indexes.length === 0 ? -1 : Math.min(...indexes);
}

function extractExperienceScopeIds(text: string): ReadonlySet<string> {
  return new Set(EXPERIENCE_SCOPE_RULES
    .filter(rule => rule.pattern.test(text))
    .map(rule => rule.id));
}

function replaceAllPattern(text: string, pattern: RegExp): string {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return text.replace(new RegExp(pattern.source, flags), ' ');
}

function normalizeExperiencePolarityText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '')
    .replace(/([가-힣])\s+(하|되|이)\s*(?=지(?:는|도|만)?\s*(?:않|못))/gu, '$1$2')
    .replace(/([가-힣])\s*(하|되|이)?진(?=\s*(?:않|못))/gu, '$1$2지는')
    .replace(/지\s*(?:는|도|만)\s*(?=(?:않|못))/gu, '지는 ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function extractExperiencePolarityBindings(
  text: string,
): ReadonlyMap<string, ReadonlySet<ExperiencePolarity>> {
  const normalizedText = normalizeExperiencePolarityText(text);
  const bindings = new Map<string, ReadonlySet<ExperiencePolarity>>();
  for (const rule of EXPERIENCE_POLARITY_RULES) {
    const states = new Set<ExperiencePolarity>();
    const hasNegative = rule.negativePattern.test(normalizedText);
    const withoutNegativePhrases = hasNegative
      ? replaceAllPattern(normalizedText, rule.negativePattern)
      : normalizedText;
    if (hasNegative) states.add('negative');
    if (rule.positivePattern.test(withoutNegativePhrases)) states.add('positive');
    if (states.size > 0) bindings.set(rule.id, states);
  }
  return bindings;
}

function hasCompatibleExperiencePolarity(claim: string, evidence: string): boolean {
  const claimBindings = extractExperiencePolarityBindings(claim);
  if (claimBindings.size === 0) return true;
  const evidenceBindings = extractExperiencePolarityBindings(evidence);
  for (const [dimension, claimStates] of claimBindings) {
    const evidenceStates = evidenceBindings.get(dimension);
    if (!evidenceStates) return false;
    if ([...claimStates].some(state => !evidenceStates.has(state))) return false;
  }
  return true;
}

function normalizeExperienceDuration(value: string): string {
  return value.replace(/[\s,]/g, '').replace(/(?:동안|간)$/u, '');
}

function extractExperienceDurations(text: string): ReadonlySet<string> {
  return new Set((text.match(EXPERIENCE_DURATION_PATTERN) ?? []).map(normalizeExperienceDuration));
}

function extractTrailingExperienceDuration(segment: string, markerIndex: number): string {
  return segment.slice(0, markerIndex)
    .match(TRAILING_EXPERIENCE_DURATION_PATTERN)?.[0].trim() ?? '';
}

function normalizeExperienceToken(token: string): string {
  return token.toLocaleLowerCase('ko-KR')
    .replace(/(?:하였습니다|했습니다|되었습니다|이었습니다|었습니다|았습니다|했으며|였으며|합니다|됩니다|입니다|하며|했다|였다|한다|된다|습니다|고|며|한|할)$/u, '')
    .replace(/(?:으로|에서|에게|까지|부터|처럼|보다|은|는|이|가|을|를|의|도|만|와|과)$/u, '');
}

function extractExperienceTokens(text: string): readonly string[] {
  return Object.freeze((text.match(EXPERIENCE_TOKEN_PATTERN) ?? [])
    .map(normalizeExperienceToken)
    .filter(token => token.length > 0));
}

function sharesEvidenceStem(token: string, evidenceTokens: ReadonlySet<string>): boolean {
  if (evidenceTokens.has(token)) return true;
  if (token.length < 2) return false;
  return [...evidenceTokens].some(evidenceToken => (
    evidenceToken.length >= 2 && evidenceToken.slice(0, 2) === token.slice(0, 2)
  ));
}

function isSafeOrScopedExperienceToken(
  token: string,
  rawClaim: string,
  evidenceTokens: ReadonlySet<string>,
): boolean {
  if (SAFE_EXPERIENCE_TOKENS.has(token) || sharesEvidenceStem(token, evidenceTokens)) return true;
  return EXPERIENCE_SCOPE_RULES.some(rule => rule.pattern.test(token) && rule.pattern.test(rawClaim));
}

function hasOnlySupportedExperienceVocabulary(claim: string, evidence: string): boolean {
  const evidenceTokens = new Set(extractExperienceTokens(evidence));
  return extractExperienceTokens(claim).every(token => (
    isSafeOrScopedExperienceToken(token, claim, evidenceTokens)
  ));
}

function isClaimSupportedByPersonalExperience(claim: string, evidence: string | null): boolean {
  if (!evidence) return false;
  const supportedLiterals = new Set(extractContentQualityV3ImportantLiterals(evidence));
  const claimLiterals = extractContentQualityV3ImportantLiterals(claim);
  if (claimLiterals.some(literal => !supportedLiterals.has(literal))) return false;

  const supportedDurations = extractExperienceDurations(evidence);
  const claimDurations = extractExperienceDurations(claim);
  if ([...claimDurations].some(duration => !supportedDurations.has(duration))) return false;

  const evidenceScope = extractExperienceScopeIds(evidence);
  const claimScope = extractExperienceScopeIds(claim);
  if ([...claimScope].some(scope => !evidenceScope.has(scope))) return false;
  if (!hasCompatibleExperiencePolarity(claim, evidence)) return false;
  if (!hasOnlySupportedExperienceVocabulary(claim, evidence)) return false;

  return claimLiterals.some(literal => supportedLiterals.has(literal))
    || [...claimScope].some(scope => evidenceScope.has(scope));
}

function countFakeFirstPartyClaims(text: string, evidence: string | null): number {
  return splitInspectionSegments(text).reduce((total, segment) => {
    const markerIndex = firstPartyMarkerIndex(segment);
    if (markerIndex < 0) return total;
    const claim = segment.slice(markerIndex);
    const trailingDuration = extractTrailingExperienceDuration(segment, markerIndex);
    const scopedClaim = trailingDuration ? `${trailingDuration} ${claim}` : claim;
    const markerCount = countFirstPartyMarkers(claim);
    if (markerCount === 0 || isClearlyAttributedExperience(segment, markerIndex)) return total;
    return isClaimSupportedByPersonalExperience(scopedClaim, evidence)
      ? total
      : total + markerCount;
  }, 0);
}

function collectPublishableText(content: Readonly<StructuredContent>): string {
  const headings = content.headings.flatMap(heading => [
    heading.title,
    heading.content ?? '',
    heading.summary,
  ]);
  return [
    content.selectedTitle,
    content.bodyPlain,
    content.bodyHtml,
    ...headings,
    ...content.hashtags,
  ].filter(Boolean).join('\n');
}

function collectInspectionText(content: Readonly<StructuredContent>): string {
  const publishableText = collectPublishableText(content);
  const titleCandidates = content.titleCandidates.flatMap(candidate => [
    candidate.text,
    candidate.reasoning,
  ]);
  const images = content.images.flatMap(item => [
    item.heading,
    item.prompt,
    item.alt,
    item.caption,
  ]);
  const viralHooks = content.viralHooks
    ? [
      ...content.viralHooks.commentTriggers.map(item => item.text),
      content.viralHooks.shareTrigger.quote,
      content.viralHooks.shareTrigger.prompt,
      content.viralHooks.bookmarkValue.reason,
      content.viralHooks.bookmarkValue.seriesPromise,
    ]
    : [];
  const trafficStrategy = content.trafficStrategy
    ? [content.trafficStrategy.shareableQuote, content.trafficStrategy.retentionHook]
    : [];
  const postPublishActions = content.postPublishActions
    ? [
      ...content.postPublishActions.selfComments,
      content.postPublishActions.shareMessage,
      content.postPublishActions.notificationMessage,
    ]
    : [];

  return [
    publishableText,
    ...content.titleAlternatives,
    ...titleCandidates,
    ...images,
    content.content ?? '',
    content.introduction ?? '',
    content.conclusion ?? '',
    content.metadata.keywordStrategy,
    content.cta?.text ?? '',
    ...viralHooks,
    ...trafficStrategy,
    ...postPublishActions,
  ].filter(Boolean).join('\n');
}

function countPatternMatches(text: string, patterns: readonly RegExp[]): number {
  return patterns.reduce((total, pattern) => total + (text.match(pattern)?.length ?? 0), 0);
}

export function evaluateContentQualityV3FactualSafety(
  content: Readonly<StructuredContent>,
  evidence: ContentQualityV3FactualEvidenceSnapshot,
): ContentQualityV3FactualSafetyResult {
  const inspectionText = collectInspectionText(content);
  const promptLeakageCount = countDistinctFragments(inspectionText, [
    ...GLOBAL_PROMPT_LEAKAGE_FRAGMENTS,
    ...evidence.forbiddenPromptLeakageFragments,
  ]);
  const fakeFirstPersonCount = countFakeFirstPartyClaims(
    inspectionText,
    evidence.personalExperienceEvidence,
  );
  const supportedImportantLiterals = new Set(evidence.supportedImportantLiterals);
  const unsupportedImportantNumberCount = extractContentQualityV3ImportantLiterals(inspectionText)
    .filter(literal => !supportedImportantLiterals.has(literal)).length;
  const highRiskDomains = new Set<ContentQualityV3FactualRiskDomain>([
    ...evidence.highRiskDomains,
    ...inferHighRiskDomains(inspectionText),
  ]);
  const highRiskGuaranteeCount = [...highRiskDomains].reduce(
    (total, domain) => total + countPatternMatches(inspectionText, HIGH_RISK_PATTERNS[domain]),
    0,
  );
  const activeIssues = new Set<ContentQualityV3FactualSafetyIssueCode>();
  if (promptLeakageCount > 0) activeIssues.add('prompt_leakage');
  if (fakeFirstPersonCount > 0) activeIssues.add('fake_first_person');
  if (unsupportedImportantNumberCount > 0) activeIssues.add('unsupported_important_number');
  if (highRiskGuaranteeCount > 0) activeIssues.add('high_risk_guarantee');
  const issueCodes = CONTENT_QUALITY_V3_FACTUAL_SAFETY_ISSUE_ORDER
    .filter(issueCode => activeIssues.has(issueCode));

  return Object.freeze({
    ok: issueCodes.length === 0,
    issueCodes: Object.freeze(issueCodes),
    promptLeakageCount,
    fakeFirstPersonCount,
    unsupportedImportantNumberCount,
    highRiskGuaranteeCount,
  });
}
