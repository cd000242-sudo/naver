// src/automation/profileLanguagePolicy.ts
// [2026-10-11] Korean Windows Chrome seeds a new profile with these accept languages. The app writes the profile's
//   Preferences before Chrome's first launch, so Chrome treated it as an existing profile and seeded "en-US,en" instead:
//   the publish window spoke a different language than the user's own Chrome (measured: navigator.languages and the
//   Accept-Language header differed). Seed the Korean default whenever Korean is missing.
export const KOREAN_ACCEPT_LANGUAGES = 'ko-KR,ko,en-US,en';

const hasKorean = (value: unknown): boolean => /(^|,)ko(-KR)?(,|$)/i.test(String(value ?? ''));

/** Returns a new prefs object with the Korean language list when it was missing; `changed` says whether it was. */
export function withKoreanAcceptLanguages<T extends { intl?: Record<string, unknown> }>(prefs: T): { prefs: T; changed: boolean } {
  if (hasKorean(prefs?.intl?.accept_languages)) return { prefs, changed: false };
  return {
    prefs: { ...prefs, intl: { ...(prefs?.intl ?? {}), accept_languages: KOREAN_ACCEPT_LANGUAGES, selected_languages: KOREAN_ACCEPT_LANGUAGES } },
    changed: true,
  };
}
