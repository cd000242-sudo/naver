import { NOTICE_BOARD, NOTICE_ID_PREFIX } from './communityContract.mjs';
import { GRADE_TABLE, OWNER_GRADE_TEXT, SCORE_RULES } from './communityGrades.mjs';
import { isAssociate } from './communityLevel.mjs';
import { normalizePlatform, validatePromoUrl } from './communityPlatform.mjs';
import { QNA_BOARD, QNA_OPEN, QNA_SOLVED } from './communityQna.mjs';

export { SCORE_RULES };
export { REPORT_REASONS, reportReasons } from './communityReport.mjs';
/** One grade table for the whole site (see communityGrades.mjs). */
export const GRADE_GUIDE = GRADE_TABLE;

/**
 * Community board model: the six boards, sorts, status badges, write permissions, grades, paging, dates and
 * draft checks. Pure data and functions so node:test can pin them without a browser or a server.
 * The server is the authority; these values only decide what the screen offers.
 */

export const BOARD_ORDER = Object.freeze([NOTICE_BOARD, 'news', QNA_BOARD, 'request', 'inquiry', 'free', 'promo']);

/** Said when someone tries to write on 공지사항: notices are written in the admin home, never here. */
export const NOTICE_WRITE_HINT = '공지는 어드민 홈 운영에서 써요.';

const board = (id, label, writeRole, dailyLimit, statuses, defaultStatus, note) =>
    Object.freeze({ id, label, writeRole, dailyLimit, statuses: Object.freeze(statuses), defaultStatus, note });

/** Built-in board config, used until (and if) the server answers `community-boards`. */
const BUILT_IN = Object.freeze({
    notice: board('notice', '공지사항', 'admin', 0, [], '', '서비스 공지와 업데이트 안내예요.'),
    news: board('news', '최근 소식', 'operator', 0, [], '', '리더남이 전하는 AI 소식'),
    qna: board(QNA_BOARD, '질문하기', 'member', 5, [QNA_OPEN, QNA_SOLVED], QNA_OPEN, '막힌 건 편하게 물어보세요. 도움 된 답은 채택해 주세요.'),
    request: board('request', '요청사항', 'member', 5, ['검토 중', '반영됨'], '검토 중', '바라는 기능을 적어 주세요. 반영하면 상태가 바뀝니다.'),
    inquiry: board('inquiry', '버그 및 오류 신고', 'member', 5, ['대기', '답변 완료'], '대기', '앱이 안 되거나 오류가 나면 알려 주세요.'),
    free: board('free', '자유게시판', 'member', 5, [], '', '묻고 나누는 이야기를 편하게 적어 주세요.'),
    promo: board('promo', '내 글 홍보', 'member', 3, [], '', '내 글을 올리고 남의 글에 들르면 점수가 쌓여요.'),
});

/** Built-in boards merged with the server's config; never adds a board, never changes the order or the names (the screen's names win). */
export function boardList(serverConfig) {
    const fromServer = new Map((Array.isArray(serverConfig?.boards) ? serverConfig.boards : []).map((entry) => [String(entry?.id), entry]));
    return BOARD_ORDER.map((id) => {
        const base = BUILT_IN[id];
        const remote = fromServer.get(id);
        if (!remote) return base;
        return Object.freeze({
            ...base,
            writeRole: ['operator', 'member', 'admin'].includes(remote.writeRole) ? remote.writeRole : base.writeRole,
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
    qna: { [QNA_OPEN]: 'wait', [QNA_SOLVED]: 'done' },
});

/** Badge for the boards that track a status (inquiry, request, qna); null for the rest or an empty status. */
export function statusBadge(boardId, status) {
    const label = String(status || '').trim();
    const tones = STATUS_TONES[boardId];
    if (!tones || !label) return null;
    return { tone: tones[label] || 'review', label };
}

/** A post that came from the admin-home notice list: its id starts with nt_ or the server flagged it. */
export const isNoticePost = (post) => Boolean(post) && (post.notice === true || String(post.id || '').startsWith(NOTICE_ID_PREFIX));

/** Splits rows into the notices and the rest, each in its original order. */
export function splitNoticePosts(posts) {
    const list = Array.isArray(posts) ? posts : [];
    return { notice: list.filter(isNoticePost), rest: list.filter((post) => !isNoticePost(post)) };
}

/** Why the reader cannot write on this board, in one sentence; '' when the board is not 공지사항. */
export function writeBlockedHint(boardId, profile) {
    if (boardId !== NOTICE_BOARD) return '';
    return profile?.role === 'owner' || profile?.canWriteNews === true ? NOTICE_WRITE_HINT : '공지사항에는 글을 쓸 수 없어요. 다른 게시판을 골라 주세요.';
}

/** The 글쓰기 button belongs to boards a person can write on; 공지사항 (writeRole `admin`) has none. */
export function showWriteButton(boardId, boards) {
    if (boardId === NOTICE_BOARD) return false;
    return boards.find((entry) => entry.id === boardId)?.writeRole !== 'admin';
}

/** Operator-only boards need `canWriteNews`; every other board needs just a login. 공지사항 (`admin`) is closed to everyone. */
export function canWriteBoard(target, profile) {
    if (!profile || !target) return false;
    if (target.id === NOTICE_BOARD || target.writeRole === 'admin') return false;
    // An associate (준회원) writes on 자유게시판 only; the counting of "one post" is in associateWriteState.
    if (isAssociate(profile) && target.id !== 'free') return false;
    if (target.writeRole === 'operator') return profile.canWriteNews === true || profile.role === 'owner';
    return true;
}

export const writableBoards = (boards, profile) => boards.filter((entry) => canWriteBoard(entry, profile));

/** Progress bar numbers for the "my activity" card. */
export function gradeProgress(profile) {
    // The owner is always 숲, the top grade, whatever an older server said.
    if (profile?.role === 'owner') return { percent: 100, remain: 0, nextLabel: null, text: OWNER_GRADE_TEXT };
    // An associate has no score bar: the next step is the application, not points.
    if (isAssociate(profile)) return { percent: 0, remain: 0, nextLabel: '새싹', text: '등업하면 새싹이 돼요' };
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
export function validatePostDraft({ boards = boardList(null), board: boardId, title, body, url, platform }) {
    const target = boards.find((entry) => entry.id === boardId);
    if (!target) return '게시판을 골라 주세요.';
    if (target.id === NOTICE_BOARD) return NOTICE_WRITE_HINT;
    const promo = target.id === 'promo';
    const cleanTitle = String(title || '').trim();
    const cleanBody = String(body || '').trim();
    if (promo && !/^https?:\/\/\S+$/i.test(String(url || '').trim())) return '글 주소(http:// 또는 https://)를 정확히 넣어 주세요.';
    // The platform the writer chose decides which address fits (contract 1114 §2); without one the draft is checked as before.
    if (promo && platform) { const mismatch = validatePromoUrl(url, platform); if (mismatch) return mismatch; }
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
    naver: '네이버', google: '구글', tistory: '티스토리', blogspot: '블로그스팟', brunch: '브런치', etc: '기타',
});

export const platformLabel = (key) => PLATFORM_LABELS[key] || '기타';

/** "All boards" is a screen of its own: the server lists one board at a time. */
export const ALL_BOARD = 'all';

const POST_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const PAGE_CAP = 1000;

/** Address of a community screen; defaults (all boards, latest, page 1) are left out. */
export function communityPath({ board, platform, sort, page, post, write } = {}) {
    const query = new URLSearchParams();
    if (board && board !== ALL_BOARD && BOARD_ORDER.includes(board)) query.set('board', board);
    // Only the promo board has a platform, and naver is the default screen, so only google is written out.
    if (board === 'promo' && platform === 'google') query.set('platform', 'google');
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
        platform: board === 'promo' ? normalizePlatform(query.get('platform')) : normalizePlatform(),
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
