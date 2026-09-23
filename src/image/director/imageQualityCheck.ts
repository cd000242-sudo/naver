/**
 * SPEC-NAVER-IMAGE-2026 — IMAGE QUALITY CHECK (NAVER IMAGE PIPELINE V1 §15).
 *
 * Deterministic, metadata-only: no model call is added by default (V1 §15). Pixel-level questions
 * (garbled Hangul, AI look) belong to the optional vision judge in high-quality mode.
 */
import type { SectionVisualRole } from './sectionRolePlanner.js';
import { THUMBNAIL_TEXT_MAX_CHARS, isFullTitleCopy } from './thumbnailText.js';

export type QualityVerdict = 'GOOD' | 'FAIL';

export interface ThumbnailPlanFacts {
  readonly title: string;
  /** Text baked into or overlaid on the cover; null when none. */
  readonly text: string | null;
  readonly width: number;
  readonly height: number;
  /** Real-photo-first topic (entertainment, broadcast, sports, cars, products, travel, events…). */
  readonly realAssetPriority: boolean;
  /** A composable real photo existed for this post. */
  readonly realAssetAvailable: boolean;
  readonly usedRealAsset: boolean;
  /** The cover shows an AI-made person standing in for a real, named person. */
  readonly aiDepictsRealPerson: boolean;
}

export interface QualityReport {
  readonly verdict: QualityVerdict;
  readonly reasons: readonly string[];
}

export function checkThumbnailPlan(facts: ThumbnailPlanFacts): QualityReport {
  const reasons: string[] = [];
  if (facts.width !== 800 || facts.height !== 800) reasons.push(`크기 ${facts.width}x${facts.height} — NAVER 기본 800x800 아님`);
  if (facts.text) {
    if (isFullTitleCopy(facts.text, facts.title)) reasons.push('제목 전체를 썸네일에 복사');
    else if (facts.text.replace(/\s/gu, '').length > THUMBNAIL_TEXT_MAX_CHARS * 2) reasons.push('썸네일 문구가 너무 김');
  }
  if (facts.realAssetPriority && facts.realAssetAvailable && !facts.usedRealAsset) {
    reasons.push('실제 이미지가 있는데 AI부터 사용');
  }
  if (facts.aiDepictsRealPerson) reasons.push('실존 인물 자리에 닮지 않은 AI 인물');
  return { verdict: reasons.length === 0 ? 'GOOD' : 'FAIL', reasons };
}

/** Section set: no adjacent repeats, and no repeats while an unused role was still available. */
export function checkSectionPlan(roles: readonly SectionVisualRole[]): QualityReport {
  const reasons: string[] = [];
  for (let i = 1; i < roles.length; i++) {
    if (roles[i] === roles[i - 1]) reasons.push(`${i}·${i + 1}번 소제목 이미지 역할이 같음(${roles[i]})`);
  }
  const distinct = new Set(roles).size;
  if (roles.length <= 5 && distinct < roles.length) reasons.push('다섯 장 이하인데 같은 역할이 반복됨');
  return { verdict: reasons.length === 0 ? 'GOOD' : 'FAIL', reasons };
}
