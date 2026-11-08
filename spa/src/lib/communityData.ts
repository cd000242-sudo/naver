/**
 * Board data as the screen uses it. Everything the server sends is coerced here — strings stay strings,
 * numbers stay numbers, addresses must be http(s) — so a component can draw a value without checking it,
 * and an unexpected shape can never crash a page or become a script link.
 */
import { isNoticeId, noticeBadgeLabel } from './accountModel.mjs';

export type AuthorGrade = { key: string; label: string };

export type PostItem = {
    id: string;
    board: string;
    title: string;
    excerpt: string;
    /** Only present on the detail reply. */
    body: string;
    nickname: string;
    grade: AuthorGrade | null;
    isOperator: boolean;
    createdAt: string;
    updatedAt: string;
    views: number;
    likes: number;
    comments: number;
    pinned: boolean;
    status: string;
    mine: boolean;
    liked: boolean;
    /** Moderator view: hidden by the operator, and how many open reports the post has. The server sends these to operators only. */
    hidden: boolean;
    openReports: number;
    /** Came from the home-operations notice list (id starts with nt_). */
    notice: boolean;
    /** Notice category: important / update / event / tip, or ''. */
    noticeBadge: string;
    /** The server may close comments or likes for a post (notices); a missing field means allowed. */
    commentable: boolean;
    likable: boolean;
    /** Promo board only. */
    url: string;
    platform: string;
    visits: number;
    given: number;
    /** Set only on a row the reader just wrote and the server has not confirmed: sending, or failed (with `failure`). */
    delivery?: 'sending' | 'failed';
    failure?: string;
};

export type CommentItem = {
    id: string;
    postId: string;
    parentId: string;
    nickname: string;
    grade: AuthorGrade | null;
    isOperator: boolean;
    body: string;
    createdAt: string;
    likes: number;
    liked: boolean;
    mine: boolean;
    /** Removed by the author or hidden by the operator: shown as an empty placeholder when replies remain. */
    gone: boolean;
    /** Hidden by the operator (not deleted). */
    hidden: boolean;
    /** The text of a hidden comment, kept apart from `body` so only the moderator view draws it. */
    hiddenBody: string;
    replies: CommentItem[];
    /** Set only on a comment the reader just wrote and the server has not confirmed: sending, or failed (with `failure`). */
    delivery?: 'sending' | 'failed';
    failure?: string;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const count = (value: unknown): number => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
};
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {});

/** Only http(s) addresses survive; anything else (javascript:, data:, relative) becomes ''. */
export function safeHttpUrl(value: unknown): string {
    const raw = text(value).trim();
    if (!raw || raw.length > 2048) return '';
    try {
        const parsed = new URL(raw);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
    } catch {
        return '';
    }
}

function toGrade(value: unknown): AuthorGrade | null {
    const source = record(value);
    const label = text(source.label);
    return label ? { key: text(source.key), label } : null;
}

export function normalizePost(raw: unknown): PostItem | null {
    const source = record(raw);
    const id = text(source.id).trim();
    if (!id) return null;
    const notice = isNoticeId(id) || source.notice === true;
    const badge = text(source.badge);
    return {
        id,
        board: text(source.board),
        title: text(source.title),
        excerpt: text(source.excerpt),
        body: text(source.body),
        nickname: text(source.nickname),
        grade: toGrade(source.grade),
        isOperator: source.isOperator === true,
        createdAt: text(source.createdAt) || (notice ? text(source.noticeDate) : ''),
        updatedAt: text(source.updatedAt),
        views: count(source.views),
        likes: count(source.likes),
        comments: count(source.comments),
        pinned: source.pinned === true,
        status: text(source.status),
        mine: source.mine === true,
        liked: source.liked === true,
        hidden: source.hidden === true,
        openReports: count(source.openReports),
        notice,
        noticeBadge: notice && noticeBadgeLabel(badge) ? badge : '',
        commentable: source.commentable !== false,
        likable: source.likable !== false,
        url: safeHttpUrl(source.url),
        platform: text(source.platform),
        visits: count(source.visits),
        given: count(source.given),
    };
}

export function normalizePosts(raw: unknown): PostItem[] {
    return (Array.isArray(raw) ? raw : []).map(normalizePost).filter((post): post is PostItem => post !== null);
}

/** One comment with its replies; replies of replies are not kept (the server allows one level). */
export function normalizeComment(raw: unknown, depth = 0): CommentItem | null {
    const source = record(raw);
    const id = text(source.id).trim();
    if (!id) return null;
    const gone = source.deleted === true || source.hidden === true;
    const replies = depth === 0 && Array.isArray(source.replies)
        ? source.replies.map((reply) => normalizeComment(reply, 1)).filter((reply): reply is CommentItem => reply !== null)
        : [];
    return {
        id,
        postId: text(source.postId),
        parentId: text(source.parentId),
        nickname: gone ? '' : text(source.nickname),
        grade: gone ? null : toGrade(source.grade),
        isOperator: !gone && source.isOperator === true,
        body: gone ? '' : text(source.body),
        createdAt: text(source.createdAt),
        likes: count(source.likes),
        liked: source.liked === true,
        mine: source.mine === true,
        gone,
        hidden: source.hidden === true && source.deleted !== true,
        hiddenBody: source.hidden === true && source.deleted !== true ? text(source.body) : '',
        replies,
    };
}

export function normalizeComments(raw: unknown): CommentItem[] {
    return (Array.isArray(raw) ? raw : []).map((entry) => normalizeComment(entry)).filter((comment): comment is CommentItem => comment !== null);
}
