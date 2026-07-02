import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertTailLinkCardBlock } from '../automation/editorTailActions.js';
import {
  OFFICIAL_SITE_HOOKS,
  insertOfficialSiteTailBlock,
  isErrorPageUrl,
  normalizeOfficialSiteUrl,
  pickOfficialSiteHook,
  shouldSearchOfficialSiteTail,
  verifyOfficialSiteUrlAvailable,
} from '../automation/editorOfficialSiteTail.js';

/**
 * Build a fetch Response whose `url` reflects the FINAL url after redirect follow.
 * `new Response()` defaults url to '' — bokjiro's 200→/error/error.html case can only
 * be reproduced by overriding it.
 */
function responseWithFinalUrl(body: string, finalUrl: string, status = 200): Response {
  const resp = new Response(body, { status });
  Object.defineProperty(resp, 'url', { value: finalUrl, configurable: true });
  return resp;
}

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

  it('rejects a URL that 200-redirects to an error page (bokjiro.go.kr/ssis-crms 사례)', async () => {
    // 실측: /ssis-crms 요청 → 200 + 최종 URL /error/error.html, 본문엔 에러 '문구'가 없음.
    await expect(verifyOfficialSiteUrlAvailable({
      url: 'https://www.bokjiro.go.kr/ssis-crms',
      fetchOfficialSite: vi.fn(async () => responseWithFinalUrl(
        '<html><head><title>Document</title></head><body>ERROR</body></html>',
        'https://www.bokjiro.go.kr/error/error.html',
      )) as any,
    })).resolves.toMatchObject({ ok: false });
  });

  it('does not insert an official-site card when the site redirects to an error page', async () => {
    const self = { log: vi.fn() };
    const finder = vi.fn(async () => ({
      success: true,
      siteName: '복지로',
      url: 'https://www.bokjiro.go.kr/ssis-crms',
    }));
    const fetchOfficialSite = vi.fn(async () => responseWithFinalUrl(
      '<html><head><title>Document</title></head><body>ERROR</body></html>',
      'https://www.bokjiro.go.kr/error/error.html',
    ));

    const result = await insertOfficialSiteTailBlock({
      self,
      page: { kind: 'page' } as any,
      title: '에너지바우처 신청 방법',
      hashtags: ['#지원금'],
      bodyText: 'body',
      findRelevantOfficialSite: finder,
      fetchOfficialSite: fetchOfficialSite as any,
    });

    expect(result).toEqual({ attempted: true, inserted: false, cardReady: false });
    expect(insertTailLinkCardBlock).not.toHaveBeenCalled();
  });

  it('isErrorPageUrl flags error redirect targets but passes real portal paths', () => {
    expect(isErrorPageUrl('https://www.bokjiro.go.kr/error/error.html')).toBe(true);
    expect(isErrorPageUrl('https://example.go.kr/404')).toBe(true);
    expect(isErrorPageUrl('https://example.com/pages/error.jsp')).toBe(true);
    // 정상 경로는 통과 — '500-series' 처럼 숫자가 세그먼트 일부인 경우 오탐 금지
    expect(isErrorPageUrl('https://www.bokjiro.go.kr/ssis-tbu/')).toBe(false);
    expect(isErrorPageUrl('https://shop.example.com/500-series/detail')).toBe(false);
    expect(isErrorPageUrl('https://www.gov.kr/portal/service/serviceInfo/134000000156')).toBe(false);
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
