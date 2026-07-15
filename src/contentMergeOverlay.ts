/**
 * [Phase 3-21/v2.10.167] contentGenerator god file decomposition — SEO+homefeed merge overlay.
 *
 * Hybrid 모드 결과 병합 — SEO 본문 + 홈피드 상단 레이어. 제목 후보 2.0:8.0 가중치로 재채점.
 *
 * 의존:
 *   - StructuredContent, ContentSource type
 *   - getPrimaryKeywordFromSource (contentKeywordHelpers)
 *   - computeSeoTitleCriticalIssues, computeHomefeedTitleCriticalIssues (contentTitleValidators)
 *   - applyHomefeedNarrativeHookBlock (contentBodyHooks)
 *   - finalizeStructuredContent (contentGenerator export)
 */

import type { StructuredContent, ContentSource } from './contentGenerator';
import { finalizeStructuredContent } from './contentGenerator';
import { getPrimaryKeywordFromSource } from './contentKeywordHelpers';
import {
  computeSeoTitleCriticalIssues,
  computeHomefeedTitleCriticalIssues,
} from './contentTitleValidators';
import { applyHomefeedNarrativeHookBlock } from './contentBodyHooks';

export function mergeSeoWithHomefeedOverlay(seo: StructuredContent, homefeed: StructuredContent, source: ContentSource): StructuredContent {
  const merged: StructuredContent = {
    ...seo,
    introduction: homefeed.introduction || seo.introduction,
  };

  const primaryKeyword = getPrimaryKeywordFromSource(source);
  const candidates = new Map<string, { seo: number; home: number; reason: string }>();

  const upsert = (text: string, reason: string) => {
    const t = String(text || '').trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (!candidates.has(key)) {
      candidates.set(key, { seo: 0, home: 0, reason });
    }
  };

  (seo.titleCandidates || []).forEach((c) => upsert(c.text, c.reasoning || 'seo'));
  (homefeed.titleCandidates || []).forEach((c) => upsert(c.text, c.reasoning || 'homefeed'));

  const scored = Array.from(candidates.entries()).map(([key, v]) => {
    const realText =
      (seo.titleCandidates || []).find(c => c.text.toLowerCase() === key)?.text ||
      (homefeed.titleCandidates || []).find(c => c.text.toLowerCase() === key)?.text ||
      key;

    const seoIssues = computeSeoTitleCriticalIssues(realText, primaryKeyword);
    const homeIssues = computeHomefeedTitleCriticalIssues(realText, primaryKeyword);

    let kwBonus = 0;
    if (primaryKeyword) {
      const normalized = realText.replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '').toLowerCase();
      const kwN = primaryKeyword.replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '').toLowerCase();
      if (kwN && normalized.includes(kwN)) kwBonus = 8;
      if (kwN && normalized.startsWith(kwN)) kwBonus = 12;
    }

    const seoScore = Math.max(0, 100 - (seoIssues.length * 25)) + kwBonus;
    const homeScore = Math.max(0, 100 - (homeIssues.length * 30));
    const finalScore = Math.round(seoScore * 0.2 + homeScore * 0.8);

    return {
      text: realText,
      finalScore,
      seoScore,
      homeScore,
      reasoning: `${v.reason}`,
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  if (scored.length > 0) {
    merged.selectedTitle = scored[0].text;
    merged.titleCandidates = scored.slice(0, 6).map((s) => ({
      text: s.text,
      score: s.finalScore,
      reasoning: `seo=${s.seoScore},home=${s.homeScore}`,
    }));
    merged.titleAlternatives = merged.titleCandidates.map(c => c.text);
  }

  if (!merged.quality) {
    merged.quality = {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 0,
      originalityScore: 0,
      readabilityScore: 0,
      warnings: [],
    };
  }
  merged.quality.warnings = [
    ...(merged.quality.warnings || []),
    'HybridOverlay: SEO 본문 + 홈판 상단 레이어 적용',
  ];

  // ✅ 하이브리드 결과물은 홈피드 상단 전략을 기본 적용(요청 모드가 seo여도)
  const forcedHomefeedSource: ContentSource = { ...source, contentMode: 'homefeed' };
  applyHomefeedNarrativeHookBlock(merged, forcedHomefeedSource);
  return finalizeStructuredContent(merged, source);
}
