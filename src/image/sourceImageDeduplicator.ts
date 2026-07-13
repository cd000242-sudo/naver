import axios from 'axios';
import { commitHashes, probeDuplicate } from './imageHashUtils.js';
import {
  buildReferenceImageIdentity,
  deduplicateReferenceImages,
  extractReferenceImageUrl,
  type ReferenceImageCandidate,
} from './referenceImagePolicy.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 40;
const resultCache = new Map<string, { expiresAt: number; result: SourceImageDedupResult<ReferenceImageCandidate> }>();

export interface SourceImageDedupOptions {
  load?: (url: string) => Promise<Buffer | null>;
  maxCandidates?: number;
  similarityThreshold?: number;
}

export interface SourceImageDedupResult<T> {
  images: T[];
  removedCount: number;
}

async function loadRemoteImage(url: string): Promise<Buffer | null> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 12000,
      maxContentLength: 15 * 1024 * 1024,
      headers: {
        Referer: 'https://shopping.naver.com/',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const buffer = Buffer.from(response.data);
    return buffer.length >= 512 ? buffer : null;
  } catch {
    return null;
  }
}

export async function deduplicateSourceImagesByContent<T extends ReferenceImageCandidate>(
  images: readonly T[] | null | undefined,
  options: SourceImageDedupOptions = {},
): Promise<SourceImageDedupResult<T>> {
  const structurallyUnique = deduplicateReferenceImages(images);
  const cacheKey = options.load
    ? ''
    : structurallyUnique.map(buildReferenceImageIdentity).filter(Boolean).join('|');
  const cached = cacheKey ? resultCache.get(cacheKey) : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return {
      images: [...cached.result.images] as T[],
      removedCount: cached.result.removedCount,
    };
  }
  const load = options.load || loadRemoteImage;
  const maxCandidates = Math.max(1, options.maxCandidates ?? 12);
  const usedSha256 = new Set<string>();
  const usedAHashes: bigint[] = [];
  const accepted: T[] = [];
  let removedCount = (images?.length || 0) - structurallyUnique.length;

  for (let index = 0; index < structurallyUnique.length; index += 1) {
    const candidate = structurallyUnique[index];
    if (index >= maxCandidates) {
      accepted.push(candidate);
      continue;
    }

    const url = extractReferenceImageUrl(candidate);
    const buffer = url ? await load(url) : null;
    if (!buffer) {
      accepted.push(candidate);
      continue;
    }

    const probe = await probeDuplicate(
      buffer,
      usedSha256,
      usedAHashes,
      options.similarityThreshold ?? 6,
    );
    if (probe.isDuplicate || probe.isSimilar) {
      removedCount += 1;
      continue;
    }

    commitHashes(probe, usedSha256, usedAHashes);
    accepted.push(candidate);
  }

  const result = { images: accepted, removedCount };
  if (cacheKey) {
    if (resultCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = resultCache.keys().next().value;
      if (oldestKey) resultCache.delete(oldestKey);
    }
    resultCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      result: result as SourceImageDedupResult<ReferenceImageCandidate>,
    });
  }
  return result;
}
