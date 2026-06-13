import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_SITE_HOOKS,
  pickOfficialSiteHook,
  shouldSearchOfficialSiteTail,
} from '../automation/editorOfficialSiteTail.js';

describe('editor official-site tail policy', () => {
  it('detects official-site-worthy topics from title and hashtags', () => {
    expect(shouldSearchOfficialSiteTail({
      title: '지원금 신청 방법과 발급 기준 정리',
      hashtags: [],
    })).toBe(true);

    expect(shouldSearchOfficialSiteTail({
      title: '오늘 먹은 간단한 집밥 기록',
      hashtags: ['#카페'],
    })).toBe(true);
  });

  it('does not search official sites for ordinary diary-style posts', () => {
    expect(shouldSearchOfficialSiteTail({
      title: '비 오는 날 산책하고 느낀 점',
      hashtags: ['#일상', '#기록'],
    })).toBe(false);
  });

  it('picks a stable official-site hook using an injectable random source', () => {
    expect(pickOfficialSiteHook(() => 0)).toBe(OFFICIAL_SITE_HOOKS[0]);
    expect(pickOfficialSiteHook(() => 0.99)).toBe(OFFICIAL_SITE_HOOKS[OFFICIAL_SITE_HOOKS.length - 1]);
  });
});
