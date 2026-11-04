/**
 * Which content modes may run as an agent harmony session (2026-11-04: "every text mode", not homefeed only).
 *
 * The list is the set of PromptModes the article call (generateStructuredContent) sends to an agent CLI. Mode names are the
 * real `source.contentMode` values; 'shopping' is only an alias the agentic envelope understands, the app mode is 'affiliate'.
 *
 * Photo (image-narrative) is deliberately NOT in the list — see HARMONY_EXCLUDED_MODES.
 */
export const HARMONY_MODES = ['homefeed', 'seo', 'affiliate', 'business', 'mate', 'custom', 'traffic-hunter'] as const;
export type HarmonyMode = (typeof HARMONY_MODES)[number];

/**
 * Modes that never run as a harmony session, with the reason next to the list.
 * image-narrative (photo): vision inference runs on a vendor engine and only the writing is the agent, but that writing is
 * `narrativeBuilder/builder.ts`, which the generator branches into EARLY — before the article attempt loop where the packet is
 * extracted, verified and gates are decided. There is no collected rawText to anchor title candidates to (the material is a
 * vision result), no titleCandidates in its JSON (a single `title`), and its own prompt / JSON shape. A session there needs its
 * own wiring and its own verification contract, so photo keeps wrapAsAgenticTask(prompt, 'photo') unchanged.
 */
export const HARMONY_EXCLUDED_MODES: Readonly<Record<string, string>> = Object.freeze({
  'image-narrative': 'photo: returns early from generateStructuredContent (before the attempt loop), no rawText to anchor titles, '
    + 'no titleCandidates in the narrative JSON, writer is narrativeBuilder with its own prompt',
});

export function isHarmonyMode(mode: unknown): mode is HarmonyMode {
  return typeof mode === 'string' && (HARMONY_MODES as readonly string[]).includes(mode);
}

/** seo and affiliate carry their own criteria; every other mode shares the general family (no mode-specific block). */
export type HarmonyFamily = 'homefeed' | 'seo' | 'affiliate' | 'general';

export function harmonyFamilyOf(mode: unknown): HarmonyFamily {
  if (mode === 'homefeed') return 'homefeed';
  if (mode === 'seo') return 'seo';
  if (mode === 'affiliate') return 'affiliate';
  return 'general';
}

const LOG_LABELS: Readonly<Record<HarmonyMode, string>> = Object.freeze({
  homefeed: '홈판', seo: 'SEO', affiliate: '쇼핑', business: '업체', mate: '메이트', custom: '사용자 정의', 'traffic-hunter': '트래픽 헌터',
});

/** Korean label for the [글 생성] log line; '-' for a mode without a session. */
export function harmonyModeLabel(mode: unknown): string {
  return isHarmonyMode(mode) ? LOG_LABELS[mode] : '-';
}
