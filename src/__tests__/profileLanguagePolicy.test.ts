// [2026-10-11] 앱 크롬 프로필의 언어가 en-US 로 심겨 사장님 크롬(ko-KR,ko,en-US,en)과 달랐다 — 한국어가 없으면 한국어 기본값을 심는다.
import { describe, expect, it } from 'vitest';
import { KOREAN_ACCEPT_LANGUAGES, withKoreanAcceptLanguages } from '../automation/profileLanguagePolicy';

describe('withKoreanAcceptLanguages', () => {
  it('새 프로필(설정 없음)에는 한국어 크롬 기본 목록을 심는다', () => {
    const result = withKoreanAcceptLanguages({} as { intl?: Record<string, unknown> });
    expect(result.changed).toBe(true);
    expect(result.prefs.intl).toEqual({ accept_languages: KOREAN_ACCEPT_LANGUAGES, selected_languages: KOREAN_ACCEPT_LANGUAGES });
  });

  it('크롬이 en-US 로 심어 둔 기존 프로필은 한국어 목록으로 바꾼다(다른 설정은 그대로)', () => {
    const before = { intl: { accept_languages: 'en-US,en', selected_languages: 'en-US,en', other: 1 }, profile: { name: 'x' } };
    const result = withKoreanAcceptLanguages(before);
    expect(result.changed).toBe(true);
    expect(result.prefs.intl).toEqual({ accept_languages: KOREAN_ACCEPT_LANGUAGES, selected_languages: KOREAN_ACCEPT_LANGUAGES, other: 1 });
    expect(result.prefs.profile).toEqual({ name: 'x' });
    expect(before.intl.accept_languages).toBe('en-US,en'); // 입력 객체는 바꾸지 않는다
  });

  it('이미 한국어가 있으면 손대지 않는다(사용자가 고른 순서 보존)', () => {
    for (const value of ['ko-KR,ko,en-US,en', 'ko,en', 'en-US,ko-KR']) {
      const result = withKoreanAcceptLanguages({ intl: { accept_languages: value } });
      expect(result.changed).toBe(false);
      expect(result.prefs.intl?.accept_languages).toBe(value);
    }
  });
});
