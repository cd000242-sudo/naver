import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

// Guest (no login) reading of the community, server side: only the operator boards (notice, news) are open to a
// visitor without a token; everything else stays LOGIN_REQUIRED. The real handlers run against fixture sheets.
const source = readFileSync(resolve(__dirname, '../../../admin-panel/google-apps-script-code.gs'), 'utf8');
const functionSource = (name: string) => {
  const found = source.match(new RegExp(`\\nfunction ${name}\\([^]*?\\n\\}`))?.[0];
  if (!found) throw new Error(`missing function ${name}`);
  return found;
};
const varSource = (name: string) => {
  const found = source.match(new RegExp(`\\nvar ${name} = [^]*?;\\r?\\n`))?.[0];
  if (!found) throw new Error(`missing var ${name}`);
  return found;
};

const REAL = ['communityFail_', 'communityOk_', 'communityBool_', 'communityNum_', 'communityIso_', 'communityMs_',
  'communitySessionLive_', 'communityActor_', 'communityReader_', 'communityGuestBoard_', 'communityGuestItem_', 'communityItemFor_',
  'communityBoard_', 'communityContext_', 'communityPostFromRow_', 'communityPostsOf_', 'communityPostVisible_',
  'communityFindPostById_', 'communityPostItem_', 'communityExcerpt_', 'communityThumbIdOf_', 'communityByNewest_',
  'communitySortPosts_', 'communityPageParams_', 'communityPlatformFilter_', 'communityPromoFilter_',
  'communityWeeklyLimit_', 'communityWeeklyRanked_', 'communityWeeklyTop_', 'communityIsOperatorUser_',
  'handleCommunityPosts', 'handleCommunityWeeklyTop', 'handleCommunityFeed', 'handleCommunityPost', 'handleCommunityAvatars',
  'handleCommunityPostWrite', 'handleCommunityCommentWrite', 'handleCommunityLike', 'handleCommunityReport'];
const VARS = ['COMMUNITY_BOARD_ORDER_', 'COMMUNITY_BOARDS_', 'COMMUNITY_SORTS_', 'COMMUNITY_OPERATOR_ID_', 'COMMUNITY_NOTICE_PREFIX_',
  'COMMUNITY_WEEKLY_LIMIT_MAX_', 'COMMUNITY_THUMB_ID_', 'COMMUNITY_QNA_BOARD_', 'COMMUNITY_AVATAR_KEYS_MAX_', 'COMMUNITY_GUEST_BOARDS_'];

const NOW = '2026-11-24T03:00:00.000Z';
const post = (postId: string, board: string, userId: string, extra: Record<string, unknown> = {}) => ({
  postId, board, userId, nickname: userId === 'owner1' ? '운영자' : '회원1', title: `제목 ${postId}`, body: `본문 ${postId}`,
  createdAt: NOW, updatedAt: '', views: 5, hidden: false, deleted: false, pinned: false, status: '', __row: 2, ...extra,
});
const notice = { id: 'nt_1', board: 'notice', promo: false, notice: true, key: 'notices', row: 2, userId: '__operator__', nickname: '운영자',
  title: '공지', body: '공지 본문', createdAt: NOW, updatedAt: '', views: 0, hidden: false, hiddenReason: '', pinned: false, deleted: false,
  status: '', requestId: '', badge: 'update', noticeDate: '' };

function server() {
  const counters = { views: 0, commentReads: 0, topLog: 0 };
  const parts = {
    members: [{ userId: 'owner1', nickname: '운영자', source: 'licensed', avatarVersion: 'v1' }, { userId: 'm1', nickname: '회원1', source: 'community', avatarVersion: 'v2' }],
    posts: [post('p_news1', 'news', 'owner1'), post('p_free1', 'free', 'm1'), post('p_qna1', 'qna', 'm1'),
      post('p_newsHidden', 'news', 'owner1', { hidden: true })],
    promo: [], comments: [{ commentId: 'c1', postId: 'p_news1', userId: 'm1', body: '회원 댓글', createdAt: NOW }],
    likes: [{ targetType: 'post', targetId: 'p_news1', userId: 'm1' }, { targetType: 'post', targetId: 'p_free1', userId: 'm1' }],
  };
  const stubs = {
    Date, Number, String, Boolean, Object, Array, Math, JSON, parseInt, isNaN,
    jsonReply_: (body: unknown) => body,
    communityFindSession_: (token: string) => token === 'good' ? { userId: 'm1', authSource: 'community', expiresAt: '2099-01-01T00:00:00Z', __row: 2 } : null,
    communityRoleFor_: (userId: string) => userId === 'owner1' ? 'owner' : 'community',
    communityParts_: (names: string[]) => Object.fromEntries(names.map((n) => [n, (parts as Record<string, unknown>)[n]])),
    communityFindMember_: (members: Array<{ userId: string }>, id: string) => members.find((m) => m.userId === id) || null,
    communityLevelOf_: () => 'member',
    communityScoreMap_: () => ({}), communityAcceptedOf_: () => ({}),
    communityNoticePosts_: () => [notice],
    communityAuthorView_: (userId: string, nick: string) => ({ nickname: nick, grade: { key: 'forest', label: '숲' }, isOperator: userId === 'owner1' || userId === '__operator__', avatarKey: userId === 'owner1' ? 'a'.repeat(20) : 'b'.repeat(20) }),
    communityWeeklySince_: () => '2000-01-01T00:00:00.000Z',
    communityBoardsConfig_: () => ({ boards: [], sorts: [], grades: [], scoreRules: {}, reportReasons: [], limits: {} }),
    communityActorProfile_: (a: { userId: string }) => ({ userId: a.userId, score: 10 }),
    communityTopLogSync_: () => { counters.topLog++; },
    communityHydratePost_: (p: unknown) => p,
    communityRead_: (key: string) => { if (key === 'comments') counters.commentReads++; return { rows: (parts as Record<string, unknown>)[key] }; },
    communityCommentTree_: (postId: string) => parts.comments.filter((c) => c.postId === postId).map((c) => ({ id: c.commentId, body: c.body })),
    communityBumpViews_: (p: { views: number }) => { counters.views++; return p.views + 1; },
    communityRichPlain_: () => ({ text: '', imageIds: [] }),
    communityAvatarKey_: (userId: string) => (userId === 'owner1' ? 'a' : 'b').repeat(20),
    communityCacheGet_: (key: string) => `data:${key}`,
    isOwnerUserId_: (userId: string) => userId === 'owner1',
    normalizeAdminToken_: (t: string) => t, getAdminToken: () => 'admin-secret',
    CacheService: { getScriptCache: () => ({ put() {}, get: () => null }) },
  };
  const context = vm.createContext({ ...stubs });
  for (const name of VARS) vm.runInContext(varSource(name), context);
  for (const name of REAL) vm.runInContext(functionSource(name), context);
  Object.assign(context, stubs);   // stubs win over any real function of the same name
  const call = (handler: string, data: Record<string, unknown>) => vm.runInContext(`${handler}(input)`, Object.assign(context, { input: data }));
  return { call, counters };
}

const MEMBER_ONLY_FIELDS = ['grade', 'hidden', 'hiddenReason', 'openReports', 'userId', 'acceptedCommentId', 'requestId', 'url', 'visits', 'given'];
const expectGuestSafe = (items: Array<Record<string, unknown>>) => {
  for (const item of items) {
    expect(item.mine).toBe(false);
    expect(item.liked).toBe(false);
    for (const field of MEMBER_ONLY_FIELDS) expect(item, `${item.id} carries ${field}`).not.toHaveProperty(field);
    expect(['notice', 'news']).toContain(item.board);
  }
};

describe('guest reads: notice and news only', () => {
  it('feed "all" without a token lists only notice/news posts, no profile, guest-safe items, no top-log write', () => {
    const api = server();
    const out = api.call('handleCommunityFeed', { board: 'all' });
    expect(out.ok).toBe(true);
    expect(out.profile).toBeNull();
    const all = [...out.pinned, ...out.posts];
    expect(all.map((p: { id: string }) => p.id).sort()).toEqual(['nt_1', 'p_news1']);
    expectGuestSafe(all);
    expectGuestSafe(out.weeklyTop);
    expect(out.weeklyTop.map((p: { id: string }) => p.id)).not.toContain('p_free1');
    expect(api.counters.topLog).toBe(0);
  });
  it('feed / posts of notice and news without a token succeed', () => {
    const api = server();
    for (const board of ['notice', 'news']) {
      for (const handler of ['handleCommunityFeed', 'handleCommunityPosts']) {
        const out = api.call(handler, { board });
        expect(out.ok, `${handler} ${board}`).toBe(true);
        expectGuestSafe([...out.pinned, ...out.posts]);
      }
    }
  });
  it.each(['free', 'qna', 'request', 'inquiry', 'promo'])('board %s without a token is LOGIN_REQUIRED', (board) => {
    const api = server();
    for (const handler of ['handleCommunityFeed', 'handleCommunityPosts', 'handleCommunityWeeklyTop']) {
      expect(api.call(handler, { board }).code, handler).toBe('LOGIN_REQUIRED');
    }
  });
  it('weekly top without a token only ranks notice/news posts', () => {
    const out = server().call('handleCommunityWeeklyTop', {});
    expect(out.ok).toBe(true);
    expectGuestSafe(out.posts);
  });
  it('post detail of a news post / notice without a token: body shown, no comments, views not counted', () => {
    const api = server();
    const news = api.call('handleCommunityPost', { id: 'p_news1' });
    expect(news.ok).toBe(true);
    expect(news.post.body).toBe('본문 p_news1');
    expect(news.comments).toEqual([]);
    expectGuestSafe([news.post]);
    expect(api.call('handleCommunityPost', { id: 'nt_1' }).ok).toBe(true);
    expect(api.counters.views).toBe(0);
    expect(api.counters.commentReads).toBe(0);
  });
  it('post detail of a member board without a token is LOGIN_REQUIRED; a hidden news post is not found', () => {
    const api = server();
    expect(api.call('handleCommunityPost', { id: 'p_free1' }).code).toBe('LOGIN_REQUIRED');
    expect(api.call('handleCommunityPost', { id: 'p_qna1' }).code).toBe('LOGIN_REQUIRED');
    expect(api.call('handleCommunityPost', { id: 'p_newsHidden' }).code).toBe('POST_NOT_FOUND');
  });
  it('avatars without a token: only the operator picture', () => {
    const out = server().call('handleCommunityAvatars', { keys: ['a'.repeat(20), 'b'.repeat(20)] });
    expect(out.ok).toBe(true);
    expect(Object.keys(out.avatars)).toEqual(['a'.repeat(20)]);
  });
  it.each(['handleCommunityPostWrite', 'handleCommunityCommentWrite', 'handleCommunityLike', 'handleCommunityReport'])('%s without a token stays LOGIN_REQUIRED', (handler) => {
    expect(server().call(handler, { board: 'news', postId: 'p_news1', targetType: 'post', targetId: 'p_news1', title: 't', body: 'b' }).code).toBe('LOGIN_REQUIRED');
  });
  it('an expired token never falls back to guest reading', () => {
    const api = server();
    for (const handler of ['handleCommunityFeed', 'handleCommunityPosts', 'handleCommunityPost', 'handleCommunityWeeklyTop', 'handleCommunityAvatars']) {
      expect(api.call(handler, { communityToken: 'expired', board: 'news', id: 'p_news1', keys: [] }).code, handler).toBe('SESSION_INVALID');
    }
  });
});

describe('member reads stay as they were', () => {
  it('a member sees every board, mine/liked, grades, comments, and the view counts', () => {
    const api = server();
    const feed = api.call('handleCommunityFeed', { communityToken: 'good', board: 'all' });
    expect(feed.profile).toEqual({ userId: 'm1', score: 10 });
    const ids = [...feed.pinned, ...feed.posts].map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['p_free1', 'p_qna1', 'p_news1', 'nt_1']));
    const free = feed.posts.find((p: { id: string }) => p.id === 'p_free1');
    expect([free.mine, free.liked, free.grade.key]).toEqual([true, true, 'forest']);
    expect(api.counters.topLog).toBe(1);
    const detail = api.call('handleCommunityPost', { communityToken: 'good', id: 'p_free1' });
    expect(detail.ok).toBe(true);
    expect(api.counters.views).toBe(1);
    expect(api.call('handleCommunityPost', { communityToken: 'good', id: 'p_news1' }).comments).toEqual([{ id: 'c1', body: '회원 댓글' }]);
    expect(Object.keys(api.call('handleCommunityAvatars', { communityToken: 'good', keys: ['a'.repeat(20), 'b'.repeat(20)] }).avatars)).toHaveLength(2);
  });
});
