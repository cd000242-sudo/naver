/**
 * Community board model: the five boards, sorts, status badges, write permissions, grades, paging, dates and
 * draft checks. Pure data and functions so node:test can pin them without a browser or a server.
 * The server is the authority; these values only decide what the screen offers.
 */

export const BOARD_ORDER = Object.freeze(['request', 'inquiry', 'free', 'news', 'promo']);

const board = (id, label, writeRole, dailyLimit, statuses, defaultStatus, note) =>
    Object.freeze({ id, label, writeRole, dailyLimit, statuses: Object.freeze(statuses), defaultStatus, note });

/** Built-in board config, used until (and if) the server answers `community-boards`. */
const BUILT_IN = Object.freeze({
    request: board('request', '요청사항', 'member', 5, ['검토 중', '반영됨'], '검토 중', '바라는 기능을 적어 주세요. 반영하면 상태가 바뀝니다.'),
    inquiry: board('inquiry', '문의', 'member', 5, ['대기', '답변 완료'], '대기', '궁금한 점을 남기면 운영자가 답해 드려요.'),
    free: board('free', '자유게시판', 'member', 5, [], '', '묻고 나누는 이야기를 편하게 적어 주세요.'),
    news: board('news', '최근 소식', 'operator', 0, [], '', '운영자가 올리는 업데이트와 안내입니다.'),
    promo: board('promo', '내 글 홍보', 'member', 3, [], '', '내 글을 올리고 남의 글에 들르면 점수가 쌓여요.'),
});

/** Built-in boards merged with the server's config; never adds a board, never changes the order. */
export function boardList(serverConfig) {
    const fromServer = new Map((Array.isArray(serverConfig?.boards) ? serverConfig.boards : []).map((entry) => [String(entry?.id), entry]));
    return BOARD_ORDER.map((id) => {
        const base = BUILT_IN[id];
        const remote = fromServer.get(id);
        if (!remote) return base;
        return Object.freeze({
            ...base,
            label: typeof remote.label === 'string' && remote.label ? remote.label : base.label,
            writeRole: remote.writeRole === 'operator' || remote.writeRole === 'member' ? remote.writeRole : base.writeRole,
            dailyLimit: Number.isFinite(remote.dailyLimit) ? remote.dailyLimit : base.dailyLimit,
            statuses: Array.isArray(remote.statuses) ? Object.freeze(remote.statuses.map(String)) : base.statuses,
            defaultStatus: typeof remote.defaultStatus === 'string' ? remote.defaultStatus : base.defaultStatus,
        });
    });
}

export function boardLabel(id, boards = boardList(null)) {
    return boards.find((entry) => entry.id === id)?.label || String(id || '');
}

export const SORTS = Object.freeze([
    Object.freeze({ key: 'latest', label: '최신순' }),
    Object.freeze({ key: 'popular', label: '인기순' }),
    Object.freeze({ key: 'comments', label: '댓글많은순' }),
]);

export function normalizeSort(value) {
    return SORTS.some((sort) => sort.key === value) ? value : 'latest';
}

const STATUS_TONES = Object.freeze({
    inquiry: { '대기': 'wait', '답변 완료': 'done' },
    request: { '검토 중': 'review', '반영됨': 'done' },
});

/** Badge for the boards that track a status (inquiry, request); null for the rest or an empty status. */
export function statusBadge(boardId, status) {
    const label = String(status || '').trim();
    const tones = STATUS_TONES[boardId];
    if (!tones || !label) return null;
    return { tone: tones[label] || 'review', label };
}

/** Operator-only boards need `canWriteNews`; every other board needs just a login. */
export function canWriteBoard(target, profile) {
    if (!profile || !target) return false;
    if (target.writeRole === 'operator') return profile.canWriteNews === true || profile.role === 'owner';
    return true;
}

export const writableBoards = (boards, profile) => boards.filter((entry) => canWriteBoard(entry, profile));

export const GRADE_GUIDE = Object.freeze([
    Object.freeze({ key: 'sprout', label: '새싹', range: '0~99점' }),
    Object.freeze({ key: 'leaf', label: '잎새', range: '100~499점' }),
    Object.freeze({ key: 'fruit', label: '열매', range: '500~1,499점' }),
    Object.freeze({ key: 'tree', label: '나무', range: '1,500점~' }),
]);

export const SCORE_RULES = '글 10점 · 댓글 2점 · 들르기 1점';

/** Progress bar numbers for the "my activity" card. */
export function gradeProgress(profile) {
    const grade = profile?.grade;
    const score = Number(profile?.score) || 0;
    if (!grade) return { percent: 0, remain: 0, nextLabel: null, text: '' };
    if (grade.nextAt === null || grade.nextAt === undefined) {
        return { percent: 100, remain: 0, nextLabel: null, text: '가장 높은 등급이에요' };
    }
    const span = Math.max(1, grade.nextAt - (grade.min || 0));
    const done = Math.min(span, Math.max(0, score - (grade.min || 0)));
    const remain = Math.max(0, grade.nextAt - score);
    return {
        percent: Math.round((done / span) * 100),
        remain,
        nextLabel: grade.nextLabel || null,
        text: `${grade.nextLabel || '다음 등급'}까지 ${remain}점`,
    };
}

/** Window of at most `span` page numbers around the current page. */
export function pageNumbers(page, totalPages, span = 5) {
    const total = Math.max(0, Math.floor(totalPages) || 0);
    if (total === 0) return [];
    const size = Math.min(span, total);
    const start = Math.min(Math.max(1, page - Math.floor(size / 2)), total - size + 1);
    return Array.from({ length: size }, (_, index) => start + index);
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const two = (value) => String(value).padStart(2, '0');

/** "방금" / "35분 전" / "3시간 전" within a day, then "11.07" (the year is added for another year). Korea time. */
export function formatPostDate(iso, now = Date.now()) {
    const at = new Date(iso).getTime();
    if (!iso || !Number.isFinite(at)) return '';
    const minutes = Math.floor((now - at) / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
    const posted = new Date(at + KST_OFFSET_MS);
    const current = new Date(now + KST_OFFSET_MS);
    const monthDay = `${two(posted.getUTCMonth() + 1)}.${two(posted.getUTCDate())}`;
    return posted.getUTCFullYear() === current.getUTCFullYear() ? monthDay : `${two(posted.getUTCFullYear() % 100)}.${monthDay}`;
}

export function countComments(tree) {
    return (Array.isArray(tree) ? tree : []).reduce((sum, comment) => sum + 1 + countComments(comment?.replies), 0);
}

export const TITLE_MAX = 100;
export const BODY_MAX = 5000;
export const COMMENT_MAX = 1000;
const PROMO_TITLE_MAX = 160;
const PROMO_SUMMARY_MAX = 300;

/** Pre-flight check of a new post (the server checks again). Returns a message, or '' when fine. */
export function validatePostDraft({ boards = boardList(null), board: boardId, title, body, url }) {
    const target = boards.find((entry) => entry.id === boardId);
    if (!target) return '게시판을 골라 주세요.';
    const promo = target.id === 'promo';
    const cleanTitle = String(title || '').trim();
    const cleanBody = String(body || '').trim();
    if (promo && !/^https?:\/\/\S+$/i.test(String(url || '').trim())) return '글 주소(http:// 또는 https://)를 정확히 넣어 주세요.';
    if (!cleanTitle) return promo ? '주소를 넣어 제목을 먼저 읽어 주세요.' : '제목을 입력해 주세요.';
    if (!cleanBody) return promo ? '한 줄 소개를 적어 주세요.' : '내용을 입력해 주세요.';
    const titleMax = promo ? PROMO_TITLE_MAX : TITLE_MAX;
    const bodyMax = promo ? PROMO_SUMMARY_MAX : BODY_MAX;
    if (cleanTitle.length > titleMax) return `제목은 ${titleMax.toLocaleString('en-US')}자 이하로 적어 주세요.`;
    if (cleanBody.length > bodyMax) return `${promo ? '소개는' : '내용은'} ${bodyMax.toLocaleString('en-US')}자 이하로 적어 주세요.`;
    return '';
}

export function validateCommentDraft(text) {
    const clean = String(text || '').trim();
    if (!clean) return '댓글 내용을 입력해 주세요.';
    if (clean.length > COMMENT_MAX) return `댓글은 ${COMMENT_MAX.toLocaleString('en-US')}자 이하로 적어 주세요.`;
    return '';
}

const PLATFORM_LABELS = Object.freeze({
    naver: '네이버', tistory: '티스토리', blogspot: '블로그스팟', brunch: '브런치', etc: '기타',
});

export const platformLabel = (key) => PLATFORM_LABELS[key] || '기타';

/** "All boards" is a screen of its own: the server lists one board at a time. */
export const ALL_BOARD = 'all';

export const REPORT_REASONS = Object.freeze([
    Object.freeze({ key: 'spam', label: '스팸·도배' }),
    Object.freeze({ key: 'abuse', label: '욕설·비방' }),
    Object.freeze({ key: 'ad', label: '광고·홍보' }),
    Object.freeze({ key: 'adult', label: '음란·불쾌' }),
    Object.freeze({ key: 'illegal', label: '불법·사칭' }),
    Object.freeze({ key: 'other', label: '기타' }),
]);

/** The six known reasons, with the server's wording when it sends one; the server cannot add a reason. */
export function reportReasons(serverConfig) {
    const remote = new Map((Array.isArray(serverConfig?.reportReasons) ? serverConfig.reportReasons : []).map((entry) => [String(entry?.key), entry]));
    return REPORT_REASONS.map((reason) => {
        const label = remote.get(reason.key)?.label;
        return typeof label === 'string' && label ? Object.freeze({ key: reason.key, label }) : reason;
    });
}

const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const PAGE_CAP = 1000;

/** Address of a community screen; defaults (all boards, latest, page 1) are left out. */
export function communityPath({ board, sort, page, post, write } = {}) {
    const query = new URLSearchParams();
    if (board && board !== ALL_BOARD && BOARD_ORDER.includes(board)) query.set('board', board);
    if (sort && sort !== 'latest' && SORTS.some((entry) => entry.key === sort)) query.set('sort', sort);
    if (page && page > 1) query.set('page', String(Math.floor(page)));
    if (post && POST_ID_PATTERN.test(post)) query.set('post', post);
    if (write) query.set('write', '1');
    const text = query.toString();
    return text ? `/community?${text}` : '/community';
}

/** The screen state an address asks for; every value is checked, so a made-up address cannot do anything odd. */
export function parseCommunityQuery(search) {
    const query = new URLSearchParams(search);
    const board = query.get('board');
    const page = Number.parseInt(query.get('page') || '', 10);
    const post = query.get('post') || '';
    return {
        board: BOARD_ORDER.includes(board) ? board : ALL_BOARD,
        sort: normalizeSort(query.get('sort')),
        page: Number.isFinite(page) && page > 1 ? Math.min(page, PAGE_CAP) : 1,
        post: POST_ID_PATTERN.test(post) ? post : '',
        write: query.get('write') === '1',
    };
}

const newestFirst = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

function comparatorFor(sort) {
    if (sort === 'popular') return (a, b) => (b.likes - a.likes) || (b.views - a.views) || newestFirst(a, b);
    if (sort === 'comments') return (a, b) => (b.comments - a.comments) || newestFirst(a, b);
    return newestFirst;
}

/**
 * The all-boards list from one reply per board (`{ posts, pinned, total }`, page 1, newest/most-liked 20 each).
 * Pinned rows come first (page 1 only), the rest follow the chosen sort and are cut into pages locally. Pages
 * reach as far as what was loaded; a board that failed (null) is skipped.
 */
export function mergeBoardPages(replies, { sort = 'latest', page = 1, pageSize = 20 } = {}) {
    const usable = (Array.isArray(replies) ? replies : []).filter(Boolean);
    const all = usable.flatMap((reply) => reply.posts || []).sort(comparatorFor(sort));
    const start = (Math.max(1, page) - 1) * pageSize;
    return {
        pinned: page === 1 ? usable.flatMap((reply) => reply.pinned || []).sort(newestFirst) : [],
        posts: all.slice(start, start + pageSize),
        total: usable.reduce((sum, reply) => sum + (Number(reply.total) || 0), 0),
        totalPages: Math.ceil(all.length / pageSize),
    };
}

const VISIT_REASONS = Object.freeze({
    ALREADY_VISITED_TODAY: '오늘 이미 들른 글이에요. 점수는 글마다 하루 한 번만 쌓여요.',
    OWN_POST: '내 글은 점수에 들어가지 않아요.',
    SESSION_INVALID: '로그인이 풀려서 점수가 쌓이지 않았어요. 다시 로그인해 주세요.',
});

/** One short sentence for the answer to a promo visit (the server adds scored / scoreReason to post-visit). */
export function describeVisit(result) {
    if (!result || result.ok !== true) return { tone: 'info', text: String(result?.message || '들르기를 기록하지 못했어요.') };
    if (result.scored === true) return { tone: 'ok', text: '들렀어요. 점수 1점이 쌓였어요.' };
    if (!result.scoreReason) return { tone: 'ok', text: '들렀어요.' };
    return { tone: 'info', text: VISIT_REASONS[result.scoreReason] || '들렀어요. 이번에는 점수가 쌓이지 않았어요.' };
}
