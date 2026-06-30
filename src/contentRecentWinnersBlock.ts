import {
  extractRecentWinners,
  formatWinnersForPrompt,
} from './learning/recentWinnersExtractor.js';
import { isFeatureEnabled } from './services/featureFlagConfig.js';
import { buildExposureWinnersBlock } from './content/exposureWinnersBlock.js';

interface RecentWinnersBlockSource {
  __previousTitleMap?: Record<string, string>;
  contentMode?: string;
}

/**
 * Computes the RECENT_WINNERS few-shot block injected into buildFullPrompt.
 *
 * Two sources, combined:
 *  - Exposure winners (SPEC-HOMEFEED-EMPATHY-2026 Pillar 3): this user's titles
 *    that actually reached top-10 exposure for the mode — the live compounding
 *    signal, sourced from real publish + exposure-poll history.
 *  - View winners (legacy): dormant until a legitimate view-metrics source
 *    feeds postMetricsStore; returns empty today, kept for forward-compat.
 */
export function buildRecentWinnersBlock(source: unknown): string {
  if (!isFeatureEnabled('feedback_loop')) return '';

  const src = source as RecentWinnersBlockSource | null;
  const exposureBlock = buildExposureWinnersBlock(src?.contentMode || '');

  let viewBlock = '';
  try {
    const previousMap: Record<string, string> = src?.__previousTitleMap || {};
    const resolver = (postId: string) => {
      const title = previousMap[postId];
      if (!title) return null;
      return { title, intro: '' };
    };
    const winners = extractRecentWinners(resolver);
    viewBlock = formatWinnersForPrompt(winners);
  } catch (err) {
    console.error('[RecentWinners] 추출 실패, 빈 블록 사용:', err);
  }

  return [exposureBlock, viewBlock].filter(Boolean).join('\n\n');
}
