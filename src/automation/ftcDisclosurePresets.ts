export const FTC_DISCLOSURE_PRESETS = Object.freeze({
  affiliate: '[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.',
  experience: '이 포스팅은 업체로부터 제품을 무상으로 제공받아 솔직하게 작성한 후기입니다.',
  sponsored: '이 포스팅은 소정의 원고료를 지급받아 작성한 광고입니다.',
  collab: '이 포스팅은 해당 업체의 협찬을 받아 작성하였습니다.',
} as const);

/**
 * Publisher-owned affiliate fallback. This copy is inserted separately from
 * model output and must remain byte-for-byte stable unless the user edits it.
 */
export const DEFAULT_AFFILIATE_FTC_DISCLOSURE =
  '[광고] 이 글에는 제휴 링크가 포함될 수 있습니다.' as const;

export type FtcDisclosurePresetId = keyof typeof FTC_DISCLOSURE_PRESETS;
export type FtcDisclosureTemplateId = FtcDisclosurePresetId | 'affiliate-default';

/**
 * Classifies only byte-exact, closed FTC templates. User-authored variants,
 * including whitespace-only changes, intentionally remain custom text.
 */
export function getFtcDisclosureTemplateId(
  text: unknown,
): FtcDisclosureTemplateId | undefined {
  if (typeof text !== 'string') return undefined;
  if (text === DEFAULT_AFFILIATE_FTC_DISCLOSURE) return 'affiliate-default';
  for (const presetId of Object.keys(FTC_DISCLOSURE_PRESETS) as FtcDisclosurePresetId[]) {
    if (text === FTC_DISCLOSURE_PRESETS[presetId]) return presetId;
  }
  return undefined;
}
