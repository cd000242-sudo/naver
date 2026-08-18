// src/crawler/issueHarness/sources/naverApiSource.ts
// Naver image search adapter for the issue harness.
// Credentials, endpoint, headers and failover all come from the single gateway
// (src/naver) — this file only shapes the results. Key rotation across
// separately registered apps is preserved via rotateOnQuota.

import { callNaverSearch, resolveAllNaverCredentials } from '../../../naver/index.js';
import type { IssueCandidateImage, IssueSourceAdapter } from '../types.js';

const LOG = '[IssueSource:naver]';

interface NaverImageItem {
  link?: string;
  thumbnail?: string;
  sizewidth?: string;
  sizeheight?: string;
}

function makeNaverAdapter(name: string, sort: 'sim' | 'date'): IssueSourceAdapter {
  return {
    name,
    async search(query: string, maxImages: number): Promise<IssueCandidateImage[]> {
      if (!query || !query.trim()) return [];
      const trimmed = query.trim();
      const credentials = resolveAllNaverCredentials();
      if (credentials.length === 0) {
        console.warn(`${LOG} API 키 없음 — 네이버 소스 건너뜀`);
        return [];
      }

      const result = await callNaverSearch<{ items?: NaverImageItem[] }>(
        'image',
        { query: trimmed, display: Math.min(maxImages, 100), sort, filter: 'large' },
        { credentials, maxAttempts: Math.max(2, credentials.length), rotateOnQuota: true },
      );

      if (!result.ok) {
        console.warn(`${LOG} 실패 (${result.status}): ${result.error ?? '알 수 없는 오류'}`);
        return [];
      }

      const images = (result.data?.items || [])
        .filter((it) => it.link && /^https?:\/\//i.test(it.link))
        .map((it) => ({
          url: it.link as string,
          thumbnailUrl: it.thumbnail,
          sourceName: 'naver',
          query: trimmed,
          width: parseInt(it.sizewidth || '0', 10) || undefined,
          height: parseInt(it.sizeheight || '0', 10) || undefined,
        }));
      console.log(`${LOG} "${query}" (${sort}) → ${images.length}개 (${result.label})`);
      return images;
    },
  };
}

/** Relevance-sorted (default) — best hit rate for the Korean base query. */
export const naverApiSource: IssueSourceAdapter = makeNaverAdapter('naver', 'sim');
/** Date-sorted variant — fresh photos for issue/fandom queries. */
export const naverApiDateSource: IssueSourceAdapter = makeNaverAdapter('naver-date', 'date');
