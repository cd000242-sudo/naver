// src/crawler/issueHarness/candidateFetcher.ts
// Downloads a candidate image and computes the cheap validation signals the
// funnel needs: real resolution (Sharp metadata) and a 64-bit perceptual
// dHash for duplicate detection. One download serves every funnel stage.

import sharp from 'sharp';
import type { IssueCandidateImage } from './types.js';

const LOG = '[IssueFetcher]';
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 6 * 1024 * 1024;
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const ISSUE_MIN_WIDTH = 400;
export const ISSUE_MIN_HEIGHT = 300;

export interface FetchedCandidate {
  candidate: IssueCandidateImage;
  buffer: Buffer;
  width: number;
  height: number;
  dhash: bigint;
  /** Vision 게이트가 채우는 랭킹 신호 — 주체 단독 사진이면 true (콜라주보다 우선). */
  soloSubject?: boolean;
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': DESKTOP_UA },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const lenHeader = res.headers.get('content-length');
    if (lenHeader && Number(lenHeader) > MAX_BYTES) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength > MAX_BYTES || arr.byteLength < 1024) return null;
    return Buffer.from(arr);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 64-bit difference hash (9x8 grayscale, row-wise gradient). */
export function computeDhashFromRaw(raw: Buffer | Uint8Array): bigint {
  let hash = 0n;
  let bit = 0n;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = raw[row * 9 + col];
      const right = raw[row * 9 + col + 1];
      if (left > right) hash |= 1n << bit;
      bit++;
    }
  }
  return hash;
}

/** Hamming distance between two 64-bit hashes. */
export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/**
 * Download + validate one candidate.
 * Returns null when the image is unreachable, too small, or unparsable.
 * Falls back to thumbnailUrl when the main url fails (e.g. YouTube maxres 404).
 */
export async function fetchAndValidateCandidate(
  candidate: IssueCandidateImage,
): Promise<FetchedCandidate | null> {
  const urls = [candidate.url, candidate.thumbnailUrl].filter(
    (u): u is string => !!u && /^https?:\/\//i.test(u),
  );
  for (const url of urls) {
    const buffer = await fetchBuffer(url);
    if (!buffer) continue;
    try {
      const meta = await sharp(buffer).metadata();
      const width = meta.width || 0;
      const height = meta.height || 0;
      if (width < ISSUE_MIN_WIDTH || height < ISSUE_MIN_HEIGHT) {
        console.log(`${LOG} ⏭️ 저해상도 제외 ${width}x${height}: ${url.slice(0, 70)}`);
        return null;
      }
      const raw = await sharp(buffer).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
      return {
        candidate: url === candidate.url ? candidate : { ...candidate, url },
        buffer,
        width,
        height,
        dhash: computeDhashFromRaw(raw),
      };
    } catch (error) {
      console.warn(`${LOG} ⚠️ 디코딩 실패: ${(error as Error).message}`);
      return null;
    }
  }
  return null;
}

/** Resize + JPEG-encode a fetched image for a cheap Vision API payload. */
export async function toVisionJpegBase64(buffer: Buffer): Promise<string> {
  const resized = await sharp(buffer)
    .resize({ width: 512, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  return resized.toString('base64');
}
