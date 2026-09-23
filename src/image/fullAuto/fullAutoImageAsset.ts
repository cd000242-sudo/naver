/**
 * NAVER FULL AUTO — what kind of asset an image is, for the result preview badges and slot records.
 *
 * Mirrors the rights vocabulary of image/director/realAssetResolver (real photos the user supplied
 * or consented to vs. AI vs. information graphics vs. web search) but only labels — it never decides
 * whether a photo may be composed.
 *
 * Pure; inlined into the renderer bundle, so names carry a fullAuto prefix.
 */

export type FullAutoAssetKind = 'real-pair' | 'real' | 'user' | 'infographic' | 'naver' | 'ai';

export const FULL_AUTO_ASSET_LABELS: Readonly<Record<FullAutoAssetKind, string>> = Object.freeze({
  'real-pair': '실제사진 2장 합성',
  real: '실제사진',
  user: '내 이미지',
  infographic: '정보형',
  naver: '네이버 이미지',
  ai: 'AI 생성',
});

export interface FullAutoAssetImageLike {
  readonly assetKind?: unknown;
  readonly provider?: unknown;
  readonly source?: unknown;
  readonly isCollected?: unknown;
}

const FULL_AUTO_INFOGRAPHIC = /table|comparison|infographic|chart|cta-banner/u;
const FULL_AUTO_USER_PROVIDER = /^(?:local|local-folder|user|manual|narrative|saved)$/u;

export function classifyFullAutoImageAsset(image: FullAutoAssetImageLike | null | undefined): FullAutoAssetKind {
  if (!image) return 'ai';
  const declared = String(image.assetKind ?? '').trim();
  if (declared === 'real-pair' || declared === 'real' || declared === 'user' || declared === 'infographic' || declared === 'naver' || declared === 'ai') {
    return declared;
  }
  const provider = String(image.provider ?? '').trim().toLowerCase();
  const source = String(image.source ?? '').trim().toLowerCase();
  if (FULL_AUTO_INFOGRAPHIC.test(provider) || FULL_AUTO_INFOGRAPHIC.test(source)) return 'infographic';
  if (provider === 'naver' || source === 'naver' || source.startsWith('naver-')) return 'naver';
  if (FULL_AUTO_USER_PROVIDER.test(provider)) return 'user';
  if (provider.startsWith('collected-image') || image.isCollected === true) return 'real';
  return 'ai';
}

export function fullAutoAssetLabel(image: FullAutoAssetImageLike | null | undefined): string {
  return FULL_AUTO_ASSET_LABELS[classifyFullAutoImageAsset(image)];
}
