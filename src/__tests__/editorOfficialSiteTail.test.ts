import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertTailLinkCardBlock } from '../automation/editorTailActions.js';
import {
  OFFICIAL_SITE_HOOKS,
  insertOfficialSiteTailBlock,
  pickOfficialSiteHook,
  shouldSearchOfficialSiteTail,
} from '../automation/editorOfficialSiteTail.js';

vi.mock('../automation/editorTailActions.js', () => ({
  insertTailLinkCardBlock: vi.fn(async () => ({ cardReady: true })),
}));

describe('editor official-site tail policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('skips official-site search when title and hashtags do not match an action topic', async () => {
    const finder = vi.fn();
    const result = await insertOfficialSiteTailBlock({
      self: { log: vi.fn() },
      page: {} as any,
      title: '비 오는 날 산책하고 느낀 점',
      hashtags: ['#일상'],
      bodyText: 'ordinary body',
      findRelevantOfficialSite: finder,
    });

    expect(result).toEqual({ attempted: false, inserted: false, cardReady: false });
    expect(finder).not.toHaveBeenCalled();
    expect(insertTailLinkCardBlock).not.toHaveBeenCalled();
  });

  it('searches and inserts an official-site link card for action topics', async () => {
    const self = { log: vi.fn() };
    const finder = vi.fn(async () => ({
      success: true,
      siteName: '지원금 공식 사이트',
      url: 'https://example.go.kr/support',
    }));
    const longBody = `${'body '.repeat(130)}tail`;

    const result = await insertOfficialSiteTailBlock({
      self,
      page: { kind: 'page' } as any,
      title: '지원금 신청 방법',
      hashtags: [],
      bodyText: longBody,
      findRelevantOfficialSite: finder,
      random: () => 0,
    });

    expect(result).toEqual({ attempted: true, inserted: true, cardReady: true });
    expect(finder).toHaveBeenCalledWith(
      '지원금 신청 방법',
      undefined,
      longBody.substring(0, 500)
    );
    expect(insertTailLinkCardBlock).toHaveBeenCalledWith({
      self,
      page: { kind: 'page' },
      label: OFFICIAL_SITE_HOOKS[0],
      url: 'https://example.go.kr/support',
    });
  });

  it('handles official-site search misses without inserting a card', async () => {
    const finder = vi.fn(async () => ({ success: false }));

    const result = await insertOfficialSiteTailBlock({
      self: { log: vi.fn() },
      page: {} as any,
      title: '카페 예약 방법',
      hashtags: [],
      bodyText: 'body',
      findRelevantOfficialSite: finder,
    });

    expect(result).toEqual({ attempted: true, inserted: false, cardReady: false });
    expect(insertTailLinkCardBlock).not.toHaveBeenCalled();
  });
});
