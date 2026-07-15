export const FTC_DISCLOSURE_PRESETS = Object.freeze({
  affiliate: '이 포스팅은 제휴마케팅이 포함된 광고로 일정 커미션을 지급 받을 수 있습니다.',
  experience: '이 포스팅은 업체로부터 제품을 무상으로 제공받아 솔직하게 작성한 후기입니다.',
  sponsored: '이 포스팅은 소정의 원고료를 지급받아 작성된 광고입니다.',
  collab: '이 포스팅은 해당 업체의 협찬을 받아 작성되었습니다.',
} as const);

export const DEFAULT_AFFILIATE_FTC_DISCLOSURE =
  '이 포스팅은 쇼핑커넥트/제휴마케팅 활동의 일환으로, 링크를 통한 구매 시 작성자에게 일정 수수료가 지급될 수 있습니다.' as const;

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
