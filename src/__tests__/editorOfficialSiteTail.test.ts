import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertTailLinkCardBlock } from '../automation/editorTailActions.js';
import {
  OFFICIAL_SITE_HOOKS,
  insertOfficialSiteTailBlock,
  normalizeOfficialSiteUrl,
  pickOfficialSiteHook,
  shouldSearchOfficialSiteTail,
  verifyOfficialSiteUrlAvailable,
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
      url: 'https://example.go.kr/support#지원금',
    }));
    const fetchOfficialSite = vi.fn(async () => new Response('<html>정상 서비스 안내</html>', { status: 200 }));
    const longBody = `${'body '.repeat(130)}tail`;

    const result = await insertOfficialSiteTailBlock({
      self,
      page: { kind: 'page' } as any,
      title: '지원금 신청 방법',
      hashtags: [],
      bodyText: longBody,
      findRelevantOfficialSite: finder,
      fetchOfficialSite,
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

  it('normalizes official URLs before card insertion so hashtags cannot attach to the link', () => {
    expect(normalizeOfficialSiteUrl('https://www.gov.kr/portal/service/serviceInfo/134000000156#지원금세대원'))
      .toBe('https://www.gov.kr/portal/service/serviceInfo/134000000156');
    expect(normalizeOfficialSiteUrl('https://www.gov.kr/portal/service/serviceInfo/134000000156 #지원금'))
      .toBe('');
  });

  it('skips unavailable official-site pages instead of linking users to a service-not-found page', async () => {
    const self = { log: vi.fn() };
    const finder = vi.fn(async () => ({
      success: true,
      siteName: '정부24',
      url: 'https://www.gov.kr/portal/service/serviceInfo/134000000156',
    }));
    const fetchOfficialSite = vi.fn(async () => new Response('<html>서비스를 찾을 수 없습니다</html>', { status: 200 }));

    const result = await insertOfficialSiteTailBlock({
      self,
      page: { kind: 'page' } as any,
      title: '지원금 신청 방법',
      hashtags: ['#지원금'],
      bodyText: 'body',
      findRelevantOfficialSite: finder,
      fetchOfficialSite,
    });

    expect(result).toEqual({ attempted: true, inserted: false, cardReady: false });
    expect(insertTailLinkCardBlock).not.toHaveBeenCalled();
    expect(self.log).toHaveBeenCalledWith(expect.stringContaining('서비스 없음/오류 페이지'));
  });

  it('treats gov serviceInfo pages as unavailable when they cannot be verified', async () => {
    await expect(verifyOfficialSiteUrlAvailable({
      url: 'https://www.gov.kr/portal/service/serviceInfo/134000000156',
      fetchOfficialSite: vi.fn(async () => { throw new Error('network blocked'); }) as any,
    })).resolves.toMatchObject({ ok: false });
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
