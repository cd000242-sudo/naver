// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHomeNotices, LEWORD_API_BASE } from '../../spa/src/lib/siteOps';

function jsonResponse(payload: unknown, ok = true) {
  return { ok, json: vi.fn(async () => payload) } as unknown as Response;
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

  it('never resurrects legacy notices during a secure API outage', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, notices: null }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        notices: [{ id: 'legacy-1', badge: 'tip', date: '2026.07.01', title: '기존 공지', preview: '이전 데이터', body: '이전 본문' }],
      }))
      .mockRejectedValueOnce(new Error('secure API unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHomeNotices(3)).resolves.toHaveLength(1);
    await expect(fetchHomeNotices(3)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('renders community notice bodies as text and keeps notice writes off the legacy public token', () => {
    const community = readFileSync(join(process.cwd(), 'spa', 'src', 'pages', 'CommunityPage.tsx'), 'utf8');
    const admin = readFileSync(join(process.cwd(), 'admin', 'index.html'), 'utf8');
    const noticeBlock = admin.slice(admin.indexOf('// ===== PHASE 6-B: NOTICES ====='), admin.indexOf('// ===== PHASE 6-C v2:'));
    const loginBlock = admin.slice(admin.indexOf('async function handleLogin'), admin.indexOf('function handleLogout'));

    expect(community).not.toContain('dangerouslySetInnerHTML={{ __html: notice.body }}');
    expect(community).toContain("whiteSpace: 'pre-line'");
    expect(community).not.toContain('FALLBACK_NOTICES');
    expect(community).not.toContain('maxHeight: open ? 700 : 0');
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
    expect(loginBlock).not.toContain('requestLewordAdminSession(id, pw');
    expect(admin).toContain('사이트 로그인은 화면 접근용입니다.');
  });
});
