import type { PromptMode } from './promptLoader.js';

export type HumanizeIntensity = 'light' | 'medium' | 'strong';

/** Evidence-sensitive modes keep generated meaning and only apply cleanup transforms. */
export function resolveHumanizeIntensity(mode?: PromptMode): HumanizeIntensity {
  if (mode === 'seo' || mode === 'homefeed' || mode === 'mate') return 'light';
  return 'strong';
}
