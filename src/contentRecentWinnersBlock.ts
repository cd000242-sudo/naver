import {
  extractRecentWinners,
  formatWinnersForPrompt,
} from './learning/recentWinnersExtractor.js';
import { isFeatureEnabled } from './services/featureFlagConfig.js';

interface RecentWinnersBlockSource {
  __previousTitleMap?: Record<string, string>;
}

/**
 * Computes the RECENT_WINNERS few-shot block injected into buildFullPrompt.
 */
export function buildRecentWinnersBlock(source: unknown): string {
  if (!isFeatureEnabled('feedback_loop')) return '';

  try {
    const previousMap: Record<string, string> = (source as RecentWinnersBlockSource | null)?.__previousTitleMap || {};
    const resolver = (postId: string) => {
      const title = previousMap[postId];
      if (!title) return null;
      return { title, intro: '' };
    };
    const winners = extractRecentWinners(resolver);
    return formatWinnersForPrompt(winners);
  } catch (err) {
    console.error('[RecentWinners] 추출 실패, 빈 블록 사용:', err);
    return '';
  }
}
