// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCommunityIncomeProofs,
  fetchHomeNotices,
  GAS_URL,
  LEWORD_API_BASE,
} from '../../spa/src/lib/siteOps';

function jsonResponse(payload: unknown, ok = true) {
  return { ok, json: vi.fn(async () => payload) } as unknown as Response;
}

function textResponse(payload: unknown, ok = true) {
  const text = JSON.stringify(payload);
  return {
    ok,
    headers: new Headers({ 'content-length': String(new TextEncoder().encode(text).byteLength) }),
    body: null,
    text: vi.fn(async () => text),
  } as unknown as Response;
}

/**
 * Cache key used by siteOps (siteOps.ts: HOME_NOTICE_CACHE_KEY). Mirrored here so the outage
 * tests can seed a legacy cache. Must stay in sync — a wrong key makes the seeded cache
 * invisible and the promotion test passes without exercising anything.
 */
const HOME_NOTICE_CACHE_KEY = 'leaderspro.homeNotices.cache.v2';

type NoticeRoute = 'secure' | 'snapshot' | 'legacy';

/**
 * Route a fetch mock by URL instead of by call order.
 *
 * The outage path is a 3-step fallback (cache -> snapshot -> GAS), so a sequential
 * mockResolvedValueOnce chain silently passes when a step is skipped: the queue simply runs
 * out and later fetches resolve to undefined. That is exactly how the previous version of the
 * outage test kept "passing" after 58cf6224 added the GAS step. Routing by URL makes both the
 * order and the target explicit.
 */
function routedFetch(handlers: Record<NoticeRoute, () => Response>) {
  const calls: NoticeRoute[] = [];
  const classify = (url: string): NoticeRoute => {
    if (url.startsWith(GAS_URL)) return 'legacy';
    if (url.startsWith(LEWORD_API_BASE)) return 'secure';
    return 'snapshot';
  };
  const fetchMock = vi.fn(async (input: unknown) => {
    const route = classify(String(input));
    calls.push(route);
    return handlers[route]();
  });
  return {
    fetchMock,
    order: () => calls.slice(),
    count: (route: NoticeRoute) => calls.filter((entry) => entry === route).length,
  };
}

describe('secure home notices', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('prefers the secure persisted snapshot and converts markup to plain text', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      notices: {
        revision: 2,
        notices: [{
          id: 'notice-1',
          badge: 'important',
          date: '2026.07.16',
          title: '<b>무료 체험</b>',
          preview: '<img src=x onerror=alert(1)>하루 3회',
          body: '<p>첫 문단</p><script>alert(1)</script><p>둘째 문단</p>',
        }],
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const notices = await fetchHomeNotices(3);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${LEWORD_API_BASE}/v1/public/home-notices`);
    expect(notices[0]?.title).toBe('무료 체험');
    expect(notices[0]?.summary).toBe('하루 3회');
    expect(notices[0]?.body).not.toContain('<');
    expect(notices[0]?.body).toContain('첫 문단');
    expect(notices[0]?.body).toContain('둘째 문단');
  });

  it('uses legacy read-only notices only before the secure snapshot is initialized', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, notices: null }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        notices: [{ id: 'legacy-1', badge: 'tip', date: '2026.07.01', title: '기존 공지', preview: '이전 데이터', body: '이전 본문' }],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const notices = await fetchHomeNotices(3);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(notices.map((notice) => notice.title)).toEqual(['기존 공지']);
  });

  it('treats an initialized empty secure snapshot as authoritative', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      ok: true,
      notices: { revision: 3, notices: [] },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHomeNotices(3)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never promotes a cached legacy notice to the secure slot during an outage', async () => {
    // 원래 이 파일이 지키던 보안 계약. 관리자가 secure 쪽에서 내리거나 고친 공지가
    // 레거시 캐시를 통해 되살아나면 안 된다 — 캐시는 source 가 일치할 때만 읽힌다.
    const routes = routedFetch({
      secure: () => { throw new Error('secure API unavailable'); },
      snapshot: () => jsonResponse({ items: [] }),
      legacy: () => jsonResponse({ success: true, notices: [] }),
    });
    vi.stubGlobal('fetch', routes.fetchMock);

    // 레거시로 채워진 캐시를 심어둔다.
    localStorage.setItem(HOME_NOTICE_CACHE_KEY, JSON.stringify({
      source: 'legacy',
      notices: [{ id: 'legacy-1', badge: 'tip', date: '2026.07.01', title: '기존 공지', summary: '이전 데이터', body: '이전 본문' }],
    }));

    // 캐시에 '기존 공지'가 들어 있는데도 비어서 나와야 한다. 승격됐다면 스냅샷·GAS 를
    // 부르지 않고 바로 '기존 공지'를 반환했을 것이다.
    const notices = await fetchHomeNotices(3);
    expect(notices).toEqual([]);
    expect(routes.count('snapshot')).toBe(1);
    expect(routes.count('legacy')).toBe(1);
    // 시드가 실제로 읽히는 키인지 확인 — 키가 어긋나면 이 테스트는 아무것도 검증하지 않는다.
    expect(localStorage.getItem(HOME_NOTICE_CACHE_KEY)).toContain('기존 공지');
  });

  it('falls back cache -> snapshot -> GAS during a secure API outage', async () => {
    // [2026-08-07 58cf6224] 서버 다운 시 스냅샷도 404(서버 미러)이고 캐시는 재방문자에게만
    // 있어서, 첫 방문자는 공지 0건 + N배지 0 이었다. 서버와 독립적으로 살아있는 GAS 를
    // 폴백 마지막 단계로 넣었다. 이 테스트가 그 순서를 계약으로 고정한다.
    const routes = routedFetch({
      secure: () => { throw new Error('secure API unavailable'); },
      snapshot: () => jsonResponse({ items: [] }),
      legacy: () => jsonResponse({
        success: true,
        notices: [{ id: 'legacy-1', badge: 'tip', date: '2026.07.01', title: '기존 공지', preview: '이전 데이터', body: '이전 본문' }],
      }),
    });
    vi.stubGlobal('fetch', routes.fetchMock);

    await expect(fetchHomeNotices(3)).resolves.toEqual([
      expect.objectContaining({ title: '기존 공지' }),
    ]);
    expect(routes.order()).toEqual(['secure', 'snapshot', 'legacy']);
  });

  it('stops at the snapshot when it has notices (does not reach GAS)', async () => {
    const routes = routedFetch({
      secure: () => { throw new Error('secure API unavailable'); },
      snapshot: () => jsonResponse({
        items: [{ id: 'snap-1', badge: 'tip', date: '2026.08.01', title: '스냅샷 공지', preview: '미러', body: '본문' }],
      }),
      legacy: () => jsonResponse({ success: true, notices: [] }),
    });
    vi.stubGlobal('fetch', routes.fetchMock);

    await expect(fetchHomeNotices(3)).resolves.toEqual([
      expect.objectContaining({ title: '스냅샷 공지' }),
    ]);
    expect(routes.count('legacy')).toBe(0);
  });

  it('renders nothing rather than throwing when every source is down', async () => {
    const routes = routedFetch({
      secure: () => { throw new Error('down'); },
      snapshot: () => { throw new Error('down'); },
      legacy: () => { throw new Error('down'); },
    });
    vi.stubGlobal('fetch', routes.fetchMock);

    await expect(fetchHomeNotices(3)).resolves.toEqual([]);
    expect(routes.order()).toEqual(['secure', 'snapshot', 'legacy']);
  });

  it('loads only approved home income proofs and removes private or unsafe fields', async () => {
    const fetchMock = vi.fn(async () => textResponse({
      success: true,
      income: [
        {
          id: 'income-1',
          status: 'approved',
          amount: '<b>100만원</b> test@example.com',
          author: '<img src=x>홍길동',
          date: '2026-07-17 010-1234-5678',
          desc: '<script>alert(1)</script> 연락처 test@example.com 010-1234-5678',
          tags: [' 자동화 ', '<b>실사용</b>'],
          media: 'https://tracker.example/pixel.png',
          mediaName: 'private@example.com.png',
          email: 'private@example.com',
          phone: '010-9999-9999',
        },
        { id: 'income-hidden', status: 'pending', amount: '비공개', desc: '노출 금지' },
        { id: 'income-unknown', approved: 'pending', amount: '검토 중', desc: '노출 금지' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCommunityIncomeProofs(3, { view: 'home' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${GAS_URL}?action=income-list&view=home&limit=3`);
    expect(result.source).toBe('live');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ author: '홍길동' });
    expect(result.items[0]?.id).toMatch(/^income-[a-z0-9]+$/);
    expect(result.items[0]?.id).not.toBe('income-1');
    expect(result.items[0]?.amount).toContain('100만원');
    expect(result.items[0]?.amount).not.toContain('test@example.com');
    expect(result.items[0]?.date).not.toContain('010-1234-5678');
    expect(result.items[0]?.desc).not.toContain('<');
    expect(result.items[0]?.desc).not.toContain('test@example.com');
    expect(result.items[0]?.desc).not.toContain('010-1234-5678');
    expect(result.items[0]?.media).toBeUndefined();
    expect(result.items[0]?.mediaName).toBeUndefined();
    expect(result.items[0]).not.toHaveProperty('email');
    expect(result.items[0]).not.toHaveProperty('phone');
  });

  it('does not expose built-in seeded income claims as public proof', async () => {
    const fetchMock = vi.fn(async () => textResponse({
      success: true,
      income: [
        {
          id: 'I-seed-3',
          amount: '월 200만원+',
          author: '에이전시 대표 M님',
          date: '2026.03',
          desc: '마케팅 에이전시 운영. 클라이언트 블로그 12개를 Leaders Pro로 통합 관리.',
        },
        {
          id: 'real-proof-1',
          status: 'approved',
          amount: '방문횟수 9,177 돌파',
          author: '운영자',
          desc: '실제 캡처 인증',
          media: '/images/proof-user/fast/KakaoTalk_20260305_004700252_07-fast.jpg',
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCommunityIncomeProofs(3, { view: 'home' })).resolves.toMatchObject({
      source: 'live',
      items: [
        {
          amount: '방문횟수 9,177 돌파',
          media: '/images/proof-user/fast/KakaoTalk_20260305_004700252_07-fast.jpg',
        },
      ],
    });
  });

  it('keeps the wider community fallback separate from the three-item home cache', async () => {
    const communityRows = Array.from({ length: 5 }, (_, index) => ({
      id: `community-${index + 1}`,
      amount: `${index + 1}만원`,
      author: '승인 사용자',
      desc: '실제 인증',
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(textResponse({ success: true, income: communityRows }))
      .mockResolvedValueOnce(textResponse({ success: true, income: communityRows.slice(0, 3) }))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCommunityIncomeProofs(80, { view: 'community' })).resolves.toMatchObject({
      source: 'live',
      items: communityRows.map(({ amount, author, desc }) => ({ amount, author, desc })),
    });
    await expect(fetchCommunityIncomeProofs(3, { view: 'home' })).resolves.toMatchObject({
      source: 'live',
      items: communityRows.slice(0, 3).map(({ amount, author, desc }) => ({ amount, author, desc })),
    });
    await expect(fetchCommunityIncomeProofs(80, { view: 'community' })).resolves.toMatchObject({
      source: 'cache',
      items: communityRows.map(({ amount, author, desc }) => ({ amount, author, desc })),
    });
  });

  it('rejects oversized community responses before parsing them into memory', async () => {
    const response = {
      ok: true,
      headers: new Headers({ 'content-length': String(33 * 1024 * 1024) }),
      body: null,
      text: vi.fn(async () => '{"success":true,"income":[]}'),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn(async () => response));

    await expect(fetchCommunityIncomeProofs(80, { view: 'community' })).resolves.toEqual({
      source: 'unavailable',
      items: [],
    });
    expect(response.text).not.toHaveBeenCalled();
  });

  it('uses a short public-field-only income cache when the network is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(textResponse({
        success: true,
        income: [{ id: 'income-1', amount: '42만원', author: '사용자', desc: '실제 인증' }],
      }))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCommunityIncomeProofs(3, { view: 'home' })).resolves.toMatchObject({
      source: 'live',
      items: [{ amount: '42만원' }],
    });
    await expect(fetchCommunityIncomeProofs(3, { view: 'home' })).resolves.toMatchObject({
      source: 'cache',
      items: [{ amount: '42만원' }],
    });
    const stored = localStorage.getItem('leaderspro.communityIncome.cache.v1') || '';
    expect(stored).not.toContain('proofMedia');
    expect(stored).not.toContain('email');
    expect(stored).not.toContain('phone');
  });

  it('renders home notice bodies as text and keeps notice writes off the legacy public token', () => {
    const home = readFileSync(join(process.cwd(), 'spa', 'src', 'components', 'HomeOperationsBoard.tsx'), 'utf8');
    const community = readFileSync(join(process.cwd(), 'spa', 'src', 'pages', 'CommunityPage.tsx'), 'utf8');
    const admin = readFileSync(join(process.cwd(), 'admin', 'index.html'), 'utf8');
    const noticeBlock = admin.slice(admin.indexOf('// ===== PHASE 6-B: NOTICES ====='), admin.indexOf('// ===== PHASE 6-C v2:'));
    const loginBlock = admin.slice(admin.indexOf('async function handleLogin'), admin.indexOf('function handleLogout'));

    expect(home).not.toContain('dangerouslySetInnerHTML');
    expect(home).toContain('white-space: pre-line');
    expect(home).toContain('hidden={!open}');
    expect(community).not.toContain('function NoticesPanel(');
    expect(noticeBlock).toContain("lewordApiUrl('/v1/admin/home-notices')");
    expect(noticeBlock).toContain("Authorization: 'Bearer ' + session.accessToken");
    expect(noticeBlock).not.toContain('adminToken');
    expect(noticeBlock).not.toContain("onclick=\"editNoticeById('");
    expect(noticeBlock).not.toContain("onclick=\"deleteNotice('");
    expect(noticeBlock).toContain('data-notice-action="edit"');
    expect(noticeBlock).toContain("if (homeNoticeEditorState.saving) throw new Error");
    expect(noticeBlock).toContain('if (homeNoticeEditorState.saving) {');
    expect(noticeBlock).toContain('loadGeneration !== homeNoticeLoadGeneration');
    expect(noticeBlock).toContain('#home-notice-editor-form input');
    expect(loginBlock).toContain('const serverSession = await requestLewordAdminSession(id, pw, { silent: true });');
    expect(loginBlock).toContain("document.getElementById('login-pw').value = ''");
    expect(loginBlock).toContain('apiIdInput.value = id');
    expect(loginBlock).toContain('homeOpsApiIdInput.value = id');
    expect(loginBlock).toContain('사이트 로그인 완료 · 서버 저장 권한 자동 연결됨');
    expect(admin).toContain('관리자 페이지 로그인 아이디/비밀번호로 서버 저장권한을 자동 연결합니다.');
    expect(admin).toContain('관리자 로그인 한 번으로 공지·키워드 저장 권한까지 자동 연결됩니다.');
    expect(admin).not.toContain('사이트 로그인은 화면 접근용입니다.');
    expect(admin).not.toContain('사이트 로그인 계정이 아니라 LEWORD API 서버 관리자 계정');
  });
});
