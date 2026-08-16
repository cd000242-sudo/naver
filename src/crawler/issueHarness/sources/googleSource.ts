// src/crawler/issueHarness/sources/googleSource.ts
// Google image search adapter — thin wrapper over the existing Puppeteer
// scraper (googleImageSearch.ts). Each call launches its own browser
// session, so the harness limits how often this adapter runs.

import type { IssueCandidateImage, IssueSourceAdapter } from '../types.js';

const LOG = '[IssueSource:google]';

export const googleSource: IssueSourceAdapter = {
  name: 'google',
  async search(query: string, maxImages: number): Promise<IssueCandidateImage[]> {
    if (!query || !query.trim()) return [];
    try {
      const { searchGoogleImages } = await import('../../googleImageSearch.js');
      const results = await searchGoogleImages(query.trim(), maxImages);
      console.log(`${LOG} "${query}" → ${results.length}개`);
      return results.map((r) => ({
        url: r.url,
        thumbnailUrl: r.thumbnailUrl,
        sourceName: 'google',
        query,
      }));
    } catch (error) {
      console.warn(`${LOG} 실패: ${(error as Error).message}`);
      return [];
    }
  },
};
