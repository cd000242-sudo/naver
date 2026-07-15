import type { StructuredContent } from '../contentGenerator.js';

const BUSINESS_RAW_TEXT_MAX_CHARS = 50_000;
const BUSINESS_FIELD_MAX_CHARS = 4_000;
const BUSINESS_EXTRA_MAX_CHARS = 20_000;

const BUSINESS_INFO_STRING_KEYS = Object.freeze([
  'name',
  'phone',
  'kakao',
  'address',
  'hours',
  'region',
] as const);

const PHONE_PATTERN = /(?:0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}|01\d[- ]?\d{3,4}[- ]?\d{4}|1[5-9]\d{2}[- ]?\d{4})/gu;
const BUSINESS_STAT_PATTERN = /\d[\d,]*(?:\.\d+)?\s*(?:건|개월|개|명|년|평|만원|원|시간|일|회|%|퍼센트|점)/gu;
const BANNED_ADVERTISING_PATTERNS = Object.freeze([
  { label: '100% guarantee', pattern: /100\s*%\s*보장/gu },
  { label: '100% satisfaction', pattern: /100\s*%\s*만족/gu },
  { label: 'lowest price', pattern: /최저가/gu },
  { label: 'industry number one', pattern: /업계\s*1위/gu },
  { label: 'domestic number one', pattern: /국내\s*1위/gu },
  { label: 'best', pattern: /최고의/gu },
] as const);

const CTA_KEYWORDS = Object.freeze(['문의', '견적', '상담', '연락', '예약', '안내', '신청']);
const SUSPICIOUS_NATIONWIDE_REGIONS = Object.freeze([
  '강남',
  '송파',
  '서초',
  '잠실',
  '명동',
  '홍대',
  '이태원',
]);

export interface ContentQualityV3BusinessInfoInput {
  readonly name?: unknown;
  readonly phone?: unknown;
  readonly kakao?: unknown;
  readonly address?: unknown;
  readonly hours?: unknown;
  readonly region?: unknown;
  readonly serviceArea?: unknown;
  readonly extra?: unknown;
}

export interface ContentQualityV3BusinessEvidenceInput {
  readonly rawText?: unknown;
  readonly businessInfo?: unknown;
}

export interface ContentQualityV3BusinessInfoSnapshot {
  readonly name?: string;
  readonly phone?: string;
  readonly kakao?: string;
  readonly address?: string;
  readonly hours?: string;
  readonly region?: string;
  readonly serviceArea?: 'nationwide' | 'regional';
  readonly extra?: string;
}

export interface ContentQualityV3BusinessEvidenceSnapshot {
  readonly rawText?: string;
  readonly businessInfo?: ContentQualityV3BusinessInfoSnapshot;
}

export interface ContentQualityV3BusinessValidation {
  readonly hasCritical: boolean;
  readonly violations: readonly string[];
  readonly warnings: readonly string[];
}

function ownDataValue(record: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) return undefined;
  if (!('value' in descriptor)) throw new TypeError('business evidence accessors are not allowed');
  return descriptor.value;
}

function boundedString(value: unknown, maxChars: number): string | undefined {
  return typeof value === 'string' ? value.slice(0, maxChars) : undefined;
}

export function snapshotContentQualityV3BusinessEvidence(
  source: ContentQualityV3BusinessEvidenceInput,
): ContentQualityV3BusinessEvidenceSnapshot {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('business evidence must be an object');
  }

  const rawText = boundedString(
    ownDataValue(source, 'rawText'),
    BUSINESS_RAW_TEXT_MAX_CHARS,
  );
  const rawBusinessInfo = ownDataValue(source, 'businessInfo');
  if (rawBusinessInfo === undefined || rawBusinessInfo === null) {
    return Object.freeze({ rawText });
  }
  if (typeof rawBusinessInfo !== 'object' || Array.isArray(rawBusinessInfo)) {
    throw new TypeError('businessInfo must be an object');
  }

  const businessInfo: Record<string, string | undefined> = {};
  for (const key of BUSINESS_INFO_STRING_KEYS) {
    businessInfo[key] = boundedString(
      ownDataValue(rawBusinessInfo, key),
      BUSINESS_FIELD_MAX_CHARS,
    );
  }
  businessInfo.extra = boundedString(
    ownDataValue(rawBusinessInfo, 'extra'),
    BUSINESS_EXTRA_MAX_CHARS,
  );
  const rawServiceArea = ownDataValue(rawBusinessInfo, 'serviceArea');
  const serviceArea = rawServiceArea === 'nationwide' || rawServiceArea === 'regional'
    ? rawServiceArea
    : undefined;

  return Object.freeze({
    rawText,
    businessInfo: Object.freeze({ ...businessInfo, serviceArea }),
  });
}

function countLiteral(text: string, value: string): number {
  if (!value) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= text.length - value.length) {
    const index = text.indexOf(value, offset);
    if (index < 0) break;
    count += 1;
    offset = index + value.length;
  }
  return count;
}

function normalizedPhone(value: string): string {
  return value.replace(/[- ]/gu, '');
}

function collectBusinessText(content: Readonly<StructuredContent>): string {
  const headings = Array.isArray(content.headings)
    ? content.headings.map(heading => `${heading?.title ?? ''} ${heading?.content ?? ''}`)
    : [];
  return [content.selectedTitle ?? '', content.bodyPlain ?? '', ...headings].join(' ');
}

function validateBusinessInfo(
  allText: string,
  evidence: ContentQualityV3BusinessEvidenceSnapshot,
  violations: string[],
  warnings: string[],
): void {
  const info = evidence.businessInfo;
  if (!info) return;

  if (info.name) {
    const nameCount = countLiteral(allText, info.name);
    if (nameCount === 0) violations.push(`Missing supplied business name: ${info.name}`);
    else if (nameCount < 2) warnings.push(`Business name appears only ${nameCount} time`);
    else if (nameCount > 8) warnings.push(`Business name appears ${nameCount} times`);
  }

  if (info.phone) {
    if (!allText.includes(info.phone)) {
      violations.push(`Missing supplied business phone: ${info.phone}`);
    }
    const expectedPhone = normalizedPhone(info.phone);
    for (const found of allText.match(PHONE_PATTERN) ?? []) {
      if (normalizedPhone(found) !== expectedPhone) {
        violations.push(`Unsupported business phone: ${found}`);
      }
    }
  }

  if (info.kakao && !allText.includes(info.kakao)) {
    warnings.push('Supplied Kakao contact is missing');
  }
  if (info.address) {
    const addressPrefix = info.address.split(/\s+/u).find(Boolean);
    if (addressPrefix && !allText.includes(addressPrefix)) {
      warnings.push('Supplied business address is missing');
    }
  }

  if (info.serviceArea === 'regional' && info.region) {
    const firstRegion = info.region.split(/[,/\s]+/u).find(Boolean);
    if (firstRegion && !allText.includes(firstRegion)) {
      violations.push(`Missing supplied service region: ${firstRegion}`);
    }
  }
  if (info.serviceArea === 'nationwide') {
    const unsupportedRegions = SUSPICIOUS_NATIONWIDE_REGIONS.filter(region => (
      allText.includes(region)
    ));
    if (unsupportedRegions.length > 0) {
      warnings.push(`Unsupported regional targeting: ${unsupportedRegions.join(', ')}`);
    }
  }

  const trustedBusinessText = [
    evidence.rawText,
    info.name,
    info.phone,
    info.kakao,
    info.address,
    info.hours,
    info.region,
    info.extra,
  ].filter((value): value is string => typeof value === 'string').join(' ');
  const unsupportedStats = [...new Set(allText.match(BUSINESS_STAT_PATTERN) ?? [])]
    .filter(stat => !trustedBusinessText.includes(stat.trim()))
    .slice(0, 5);
  if (unsupportedStats.length > 0) {
    warnings.push(`Unsupported business statistics: ${unsupportedStats.join(', ')}`);
  }
}

export function validateContentQualityV3BusinessContent(
  content: Readonly<StructuredContent>,
  source: ContentQualityV3BusinessEvidenceInput,
): ContentQualityV3BusinessValidation {
  const evidence = snapshotContentQualityV3BusinessEvidence(source);
  const violations: string[] = [];
  const warnings: string[] = [];
  const allText = collectBusinessText(content);
  validateBusinessInfo(allText, evidence, violations, warnings);

  const headingCount = Array.isArray(content.headings) ? content.headings.length : 0;
  if (headingCount < 5) violations.push(`Business content requires 5 headings; found ${headingCount}`);
  else if (headingCount > 7) warnings.push(`Business content has ${headingCount} headings`);

  if (headingCount > 0) {
    const lastHeading = String(content.headings[headingCount - 1]?.title ?? '');
    if (!CTA_KEYWORDS.some(keyword => lastHeading.includes(keyword))) {
      warnings.push(`Final business heading lacks a contact CTA: ${lastHeading}`);
    }
  }

  for (const { label, pattern } of BANNED_ADVERTISING_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(allText)) violations.push(`Prohibited advertising claim: ${label}`);
  }

  return Object.freeze({
    hasCritical: violations.length > 0,
    violations: Object.freeze(violations),
    warnings: Object.freeze(warnings),
  });
}

function cloneCandidate(content: Readonly<StructuredContent>): StructuredContent {
  try {
    return structuredClone(content);
  } catch {
    throw new Error('[CONTENT_SAFETY_BLOCKED] invalid business candidate');
  }
}

export function enforceContentQualityV3BusinessGuard(
  content: Readonly<StructuredContent>,
  source: ContentQualityV3BusinessEvidenceInput,
): StructuredContent {
  const candidate = cloneCandidate(content);
  let validation: ContentQualityV3BusinessValidation;
  try {
    validation = validateContentQualityV3BusinessContent(candidate, source);
  } catch {
    throw new Error('[CONTENT_SAFETY_BLOCKED] invalid business evidence');
  }
  if (validation.hasCritical) {
    throw new Error(`[CONTENT_SAFETY_BLOCKED] ${validation.violations.join(' / ')}`);
  }

  const validatorWarnings = [...validation.violations, ...validation.warnings]
    .map(message => `BusinessValidator: ${message}`);
  const existingWarnings = Array.isArray(candidate.quality?.warnings)
    ? candidate.quality.warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];
  candidate.quality = {
    ...candidate.quality,
    warnings: [...new Set([...existingWarnings, ...validatorWarnings])],
  };
  return candidate;
}
