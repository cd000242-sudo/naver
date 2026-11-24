import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

// Three new boards (2026-11-25): 가입인사 (greeting), 등업신청 (levelup) and the locked 시크릿 클래스 (secret).
// The secret board is decided on the server: only the owner and members with an 올인원 licence of a year or more
// (or a lifetime one) get its posts; everybody else never receives a title, a body or an author of it.
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
  'communityWeeklyLimit_', 'communityWeeklyRanked_', 'communityWeeklyTop_', 'communityIsOperatorUser_', 'communityResolveTarget_',
  'communityLevelOf_', 'communityLevelBoardGate_', 'communityAssociateFreeGate_', 'communityLevelUpNeed_', 'communityLevelUpMessage_',
  'handleCommunityLevelUp', 'communitySecretFromRows_', 'communitySecretAccess_', 'communitySecretOk_',
  'normalizeLicenseTypeForDuration', 'getLicenseDurationDays', 'isUnlimitedLicense', 'communityRawText_',
  'handleCommunityPosts', 'handleCommunityWeeklyTop', 'handleCommunityFeed', 'handleCommunityPost', 'handleCommunityPostImage',
  'handleCommunityPostWrite', 'handleCommunityCommentWrite'];
const VARS = ['COMMUNITY_BOARD_ORDER_', 'COMMUNITY_BOARDS_', 'COMMUNITY_SORTS_', 'COMMUNITY_OPERATOR_ID_', 'COMMUNITY_NOTICE_PREFIX_',
  'COMMUNITY_WEEKLY_LIMIT_MAX_', 'COMMUNITY_THUMB_ID_', 'COMMUNITY_QNA_BOARD_', 'COMMUNITY_GUEST_BOARDS_',
  'COMMUNITY_LEVEL_REQUIRED_MESSAGE_', 'COMMUNITY_SECRET_BOARD_', 'COMMUNITY_SECRET_MIN_DAYS_', 'COMMUNITY_GREETING_BOARDS_',
  'COMMUNITY_IMAGE_ID_PATTERN_', 'COMMUNITY_SECRET_CACHE_SEC_', 'COMMUNITY_COMMENT_MAX_'];

const NOW = '2026-11-24T03:00:00.000Z';
const post = (postId: string, board: string, userId: string, extra: Record<string, unknown> = {}) => ({
  postId, board, userId, nickname: userId === 'owner1' ? '운영자' : '회원', title: `제목 ${postId}`, body: `본문 ${postId}`,
  createdAt: NOW, updatedAt: '', views: 5, hidden: false, deleted: false, pinned: false, status: '', __row: 2, ...extra,
});
const SECRET = post('p_sec1', 'secret', 'vip1', { nickname: '비밀회원', title: '비밀제목', body: '비밀본문' });

const S1_HEADERS = ['code', 'platform', 'type', 'used', 'userId', 'customDays', 'expiresAt', 'revoked'];
const S1_ROWS = [
  ['A1', 'ALL', 'CUSTOM', true, 'vip1', 365, '2099-01-01T00:00:00Z', ''],
  ['A2', 'ALL', 'LIFE', 'TRUE', 'life1', -1, '', ''],
  ['A3', 'ALL', 'CUSTOM', true, 'short1', 180, '2099-01-01T00:00:00Z', ''],
  ['A4', 'NAVER', 'CUSTOM', true, 'naver1', 365, '2099-01-01T00:00:00Z', ''],
  ['A5', 'ALL', 'CUSTOM', true, 'old1', 365, '2020-01-01T00:00:00Z', ''],
  ['A6', 'ALL', 'LIFE', true, 'rev1', -1, '', true],
  ['A7', 'ALL', 'CUSTOM', false, 'unused1', 365, '2099-01-01T00:00:00Z', ''],
];

type Opts = { members?: Array<Record<string, unknown>>; posts?: Array<Record<string, unknown>>; comments?: Array<Record<string, unknown>> };

function server(opts: Opts = {}) {
  const log = { appended: [] as Array<{ key: string; row: Record<string, unknown> }>, updated: [] as Array<Record<string, unknown>> };
  const members = opts.members || ['owner1', 'm1', 'vip1', 'life1'].map((userId) => ({ userId, nickname: userId === 'vip1' ? '비밀회원' : userId }));
  const parts: Record<string, unknown> = {
    members,
    posts: opts.posts || [post('p_news1', 'news', 'owner1'), post('p_free1', 'free', 'm1'), SECRET],
    promo: [], comments: opts.comments || [{ commentId: 'c1', postId: 'p_sec1', userId: 'owner1', body: '비밀피드백', createdAt: NOW }],
    likes: [{ targetType: 'post', targetId: 'p_sec1', userId: 'life1' }],
  };
  const stubs = {
    Date, Number, String, Boolean, Object, Array, Math, JSON, parseInt, isNaN,
    jsonReply_: (body: unknown) => body,
    communityFindSession_: (token: string) => (token ? { userId: token, authSource: 'community', expiresAt: '2099-01-01T00:00:00Z', __row: 2 } : null),
    communityRoleFor_: (userId: string) => (userId === 'owner1' ? 'owner' : 'community'),
    communityParts_: (names: string[]) => Object.fromEntries(names.map((n) => [n, parts[n]])),
    communityFindMember_: (list: Array<{ userId: string }>, id: string) => list.find((m) => m.userId === id) || null,
    communityScoreMap_: () => ({}), communityAcceptedOf_: () => ({}),
    communityNoticePosts_: () => [],
    communityAuthorView_: (userId: string, nick: string) => ({ nickname: nick, grade: { key: 'sprout', label: '새싹' }, isOperator: userId === 'owner1', avatarKey: null }),
    communityWeeklySince_: () => '2000-01-01T00:00:00.000Z',
    communityBoardsConfig_: () => ({ boards: [], sorts: [], grades: [], scoreRules: {}, reportReasons: [], limits: {} }),
    communityActorProfile_: (a: { userId: string }) => ({ userId: a.userId }),
    communityTopLogSync_: () => undefined,
    communityHydratePost_: (p: unknown) => p,
    communityRead_: (key: string) => ({ rows: parts[key] }),
    communityCommentTree_: (postId: string) => (parts.comments as Array<{ postId: string; body: string }>).filter((c) => c.postId === postId),
    communityBumpViews_: (p: { views: number }) => p.views + 1,
    communityRichPlain_: () => ({ text: '', imageIds: [] }),
    communityAvatarKey_: () => null,
    communityCacheGet_: () => 'jpeg-data',
    communityImageRead_: () => 'jpeg-data',
    isOwnerUserId_: (userId: string) => userId === 'owner1',
    normalizeAdminToken_: (t: string) => t, getAdminToken: () => 'admin-secret',
    communitySheet1Rows_: () => ({ headers: S1_HEADERS, rows: S1_ROWS }),
    findColumnIndex: (headers: string[], name: string) => headers.indexOf(name) + 1,
    normalizePlatform: (p: string) => (['ALL', '올인원'].includes(String(p).trim().toUpperCase()) ? 'ALL' : String(p).trim().toUpperCase()),
    communityWithLock_: (fn: () => unknown) => fn(),
    communityCheckWriteGap_: () => null,
    communityCheckText_: (v: string) => ({ ok: true, text: String(v) }),
    normalizeIssueRequestId_: () => '',
    communityNewId_: () => 'p_lv1',
    communityAppend_: (key: string, row: Record<string, unknown>) => { log.appended.push({ key, row }); },
    communityUpdate_: (_key: string, _row: number, patch: Record<string, unknown>) => { log.updated.push(patch); },
    CacheService: { getScriptCache: () => ({ put() {}, get: () => null, remove() {} }) },
  };
  const context = vm.createContext({ ...stubs });
  for (const name of VARS) vm.runInContext(varSource(name), context);
  for (const name of REAL) vm.runInContext(functionSource(name), context);
  Object.assign(context, stubs);   // stubs win over any real function of the same name
  const call = (handler: string, data: Record<string, unknown>) => vm.runInContext(`${handler}(input)`, Object.assign(context, { input: data }));
  const run = (code: string) => vm.runInContext(code, context);
  return { call, run, log };
}

const leak = (answer: unknown) => /비밀/.test(JSON.stringify(answer));

describe('board order', () => {
  it('lists the ten boards in the agreed order, the secret one locked', () => {
    const { run } = server();
    expect(run('COMMUNITY_BOARD_ORDER_')).toEqual(['notice', 'news', 'greeting', 'levelup', 'qna', 'request', 'inquiry', 'free', 'promo', 'secret']);
    expect(run('COMMUNITY_BOARD_ORDER_.every(function (id) { return !!COMMUNITY_BOARDS_[id]; })')).toBe(true);
    expect(run('COMMUNITY_BOARDS_.greeting.label')).toBe('가입인사');
    expect(run('COMMUNITY_BOARDS_.levelup.label')).toBe('등업신청');
    expect(run('COMMUNITY_BOARDS_.secret.label')).toBe('시크릿 클래스');
    expect(run('COMMUNITY_BOARDS_.secret.locked')).toBe(true);
  });
});

describe('secret class access (licence rows)', () => {
  const access = (userId: string, role = 'community') => server().run(`communitySecretAccess_(${JSON.stringify(userId)}, ${JSON.stringify(role)})`);
  it('lets in a year of 올인원, a lifetime licence and the owner', () => {
    expect(access('vip1')).toEqual({ allowed: true, lifetime: false });
    expect(access('life1')).toEqual({ allowed: true, lifetime: true });
    expect(access('owner1', 'owner').allowed).toBe(true);
    expect(access('__operator__', 'admin').allowed).toBe(true);
  });
  it('keeps out under a year, another product, an expired, revoked or unused licence and nobody', () => {
    for (const id of ['short1', 'naver1', 'old1', 'rev1', 'unused1', 'm1', '']) expect(access(id), id).toEqual({ allowed: false, lifetime: false });
  });
});

describe('secret posts never reach someone outside', () => {
  it('a guest gets nothing of them', () => {
    const { call } = server();
    const feed = call('handleCommunityFeed', { board: 'all' });
    expect(feed.ok).toBe(true);
    expect(leak(feed)).toBe(false);
    expect(call('handleCommunityFeed', { board: 'secret' }).code).toBe('LOGIN_REQUIRED');
    const detail = call('handleCommunityPost', { id: 'p_sec1' });
    expect(detail.ok).toBe(false);
    expect(leak(detail)).toBe(false);
    expect(leak(call('handleCommunityWeeklyTop', {}))).toBe(false);
  });

  it('a member without the licence gets an empty secret board and no post, comment or target', () => {
    const { call, run } = server();
    for (const board of ['all', 'secret']) {
      const feed = call('handleCommunityFeed', { communityToken: 'm1', board });
      expect(feed.ok, board).toBe(true);
      expect(leak(feed), board).toBe(false);
    }
    expect(leak(call('handleCommunityPosts', { communityToken: 'm1', board: 'secret' }))).toBe(false);
    expect(leak(call('handleCommunityWeeklyTop', { communityToken: 'm1' }))).toBe(false);
    const detail = call('handleCommunityPost', { communityToken: 'm1', id: 'p_sec1' });
    expect(detail.code).toBe('POST_NOT_FOUND');
    expect(leak(detail)).toBe(false);
    expect(call('handleCommunityCommentWrite', { communityToken: 'm1', postId: 'p_sec1', body: '안녕' }).code).toBe('POST_NOT_FOUND');
    expect(run(`communityResolveTarget_(communityContext_({ userId: 'm1', role: 'community' }, { slim: true }), 'post', 'p_sec1', false).ok`)).toBe(false);
    expect(call('handleCommunityPostWrite', { communityToken: 'm1', board: 'secret', title: 't', body: 'b' }).code).toBe('SECRET_ONLY');
  });

  it('a short licence is kept out as well', () => {
    const { call } = server({ members: [{ userId: 'short1', nickname: 'short1' }] });
    expect(call('handleCommunityPost', { communityToken: 'short1', id: 'p_sec1' }).code).toBe('POST_NOT_FOUND');
  });

  it('members of the class see the posts and the comments', () => {
    const { call } = server();
    for (const token of ['vip1', 'life1', 'owner1']) {
      const feed = call('handleCommunityFeed', { communityToken: token, board: 'secret' });
      expect(feed.posts.map((p: { id: string }) => p.id), token).toEqual(['p_sec1']);
      const detail = call('handleCommunityPost', { communityToken: token, id: 'p_sec1' });
      expect(detail.ok, token).toBe(true);
      expect(detail.post.title).toBe('비밀제목');
    }
  });

  it('keeps secret posts out of the weekly ranking even for its members', () => {
    const { call } = server();
    expect(leak(call('handleCommunityWeeklyTop', { communityToken: 'vip1' }))).toBe(false);
  });

  it('never serves a picture of a secret post', () => {
    const { call } = server();
    expect(call('handleCommunityPostImage', { postId: 'p_sec1', imageId: 'img_1' }).ok).toBe(false);
  });
});

describe('greeting and level-up', () => {
  const associate = { userId: 'a1', nickname: '새내기', level: 'associate', __row: 3 };
  it('an associate writes in 가입인사 and 자유게시판 only', () => {
    const { run } = server();
    const gate = (board: string) => run(`communityLevelBoardGate_({ level: 'associate' }, { id: ${JSON.stringify(board)} })`);
    expect(gate('greeting')).toBe(null);
    expect(gate('free')).toBe(null);
    for (const board of ['qna', 'promo', 'secret', 'levelup']) expect(gate(board).code, board).toBe('LEVEL_REQUIRED');
  });

  it('one greeting in either board uses the associate slot', () => {
    const { run } = server({ members: [associate], posts: [post('p_f1', 'free', 'a1')], comments: [] });
    expect(run(`communityAssociateFreeGate_({ userId: 'a1', level: 'associate' }, { id: 'greeting' }, communityContext_({ userId: 'a1' }, { slim: true })).code`)).toBe('LEVEL_REQUIRED');
  });

  it('a greeting in 가입인사 + a comment levels up and leaves a one-line notice on 등업신청', () => {
    const { call, log } = server({ members: [associate], posts: [post('p_g1', 'greeting', 'a1')], comments: [{ commentId: 'c9', postId: 'p_g1', userId: 'a1' }] });
    const answer = call('handleCommunityLevelUp', { communityToken: 'a1' });
    expect(answer).toMatchObject({ ok: true, level: 'member' });
    expect(log.updated).toContainEqual({ level: 'member' });
    const notice = log.appended.find((a) => a.key === 'posts');
    expect(notice?.row).toMatchObject({ board: 'levelup', title: '새내기님이 새싹이 되었습니다', userId: '' });
  });

  it('an older greeting in 자유게시판 still counts', () => {
    const { call } = server({ members: [associate], posts: [post('p_f1', 'free', 'a1')], comments: [{ commentId: 'c9', postId: 'p_f1', userId: 'a1' }] });
    expect(call('handleCommunityLevelUp', { communityToken: 'a1' }).ok).toBe(true);
  });

  it('a post elsewhere does not count, and the answer says what is missing', () => {
    const { call, log } = server({ members: [associate], posts: [post('p_q1', 'qna', 'a1')], comments: [{ commentId: 'c9', postId: 'p_q1', userId: 'a1' }] });
    const answer = call('handleCommunityLevelUp', { communityToken: 'a1' });
    expect(answer.code).toBe('LEVEL_UP_NOT_READY');
    expect(answer.need).toEqual({ post: true, comment: false });
    expect(answer.message).toMatch(/가입인사/);
    expect(log.appended).toEqual([]);
  });

  it('nobody writes on 등업신청 by hand', () => {
    const { call } = server();
    expect(call('handleCommunityPostWrite', { communityToken: 'm1', board: 'levelup', title: 't', body: 'b' }).code).toBe('BOARD_READ_ONLY');
  });
});
