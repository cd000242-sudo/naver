// src/crawler/issueHarness/sources/naverApiSource.ts
// Naver Open API image search adapter for the issue harness.
// Reads NAVER_CLIENT_ID/SECRET pairs from env (already synced by
// applyConfigToEnv in the IPC layer) with the same rotation convention
// as image:searchNaver, kept compact for adapter use.

import type { IssueCandidateImage, IssueSourceAdapter } from '../types.js';

const LOG = '[IssueSource:naver]';
const HEADER_SAFE = /^[\x21-\x7E]+$/;

interface KeyPair { id: string; secret: string; label: string }

function cleanEnv(v: string | undefined): string {
  const s = String(v || '').trim().replace(/^['"]|['"]$/g, '').trim();
  return s && HEADER_SAFE.test(s) ? s : '';
}

function collectKeyPairs(): KeyPair[] {
  const pairs: KeyPair[] = [];
  const bases: Array<[string, string, string]> = [
    ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER'],
    ['NAVER_DATALAB_CLIENT_ID', 'NAVER_DATALAB_CLIENT_SECRET', 'DATALAB'],
  ];
  for (const [idKey, secretKey, label] of bases) {
    const id = cleanEnv(process.env[idKey]);
    const secret = cleanEnv(process.env[secretKey]);
    if (id && secret) pairs.push({ id, secret, label: `${label}#1` });
    for (let i = 2; i <= 10; i++) {
      const id2 = cleanEnv(process.env[`${idKey}_${i}`]);
      const secret2 = cleanEnv(process.env[`${secretKey}_${i}`]);
      if (id2 && secret2) pairs.push({ id: id2, secret: secret2, label: `${label}#${i}` });
    }
  }
  return pairs;
}

async function searchOnce(
  query: string,
  maxImages: number,
  pair: KeyPair,
  sort: 'sim' | 'date' = 'sim',
): Promise<IssueCandidateImage[]> {
  const url = `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(query)}&display=${Math.min(maxImages, 100)}&sort=${sort}&filter=large`;
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': pair.id,
      'X-Naver-Client-Secret': pair.secret,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${pair.label})`);
  const data = (await res.json()) as {
    items?: Array<{ link?: string; thumbnail?: string; sizewidth?: string; sizeheight?: string }>;
  };
  return (data.items || [])
    .filter((it) => it.link && /^https?:\/\//i.test(it.link))
    .map((it) => ({
      url: it.link as string,
      thumbnailUrl: it.thumbnail,
      sourceName: 'naver',
      query,
      width: parseInt(it.sizewidth || '0', 10) || undefined,
      height: parseInt(it.sizeheight || '0', 10) || undefined,
    }));
}

function makeNaverAdapter(name: string, sort: 'sim' | 'date'): IssueSourceAdapter {
  return {
    name,
    async search(query: string, maxImages: number): Promise<IssueCandidateImage[]> {
      if (!query || !query.trim()) return [];
      const pairs = collectKeyPairs();
      if (pairs.length === 0) {
        console.warn(`${LOG} API 키 없음 — 네이버 소스 건너뜀`);
        return [];
      }
      for (const pair of pairs) {
        try {
          const results = await searchOnce(query.trim(), maxImages, pair, sort);
          console.log(`${LOG} "${query}" (${sort}) → ${results.length}개 (${pair.label})`);
          return results;
        } catch (error) {
          console.warn(`${LOG} 실패 (${pair.label}): ${(error as Error).message}`);
        }
      }
      return [];
    },
  };
}

/** Relevance-sorted (default) — best hit rate for the Korean base query. */
export const naverApiSource: IssueSourceAdapter = makeNaverAdapter('naver', 'sim');
/** Date-sorted variant — fresh photos for issue/fandom queries. */
export const naverApiDateSource: IssueSourceAdapter = makeNaverAdapter('naver-date', 'date');
