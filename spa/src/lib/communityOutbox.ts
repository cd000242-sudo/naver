/**
 * Comments that appear the moment "올리기" is pressed. The new comment joins the list as "sending", the server's
 * answer makes it the real comment, and a failure leaves it in place with the reason and a resend. The resend
 * keeps the same request id, so a comment the server already stored is not posted twice.
 */
import { boardApi, newRequestId, type ApiResult } from './communityApi';
import { normalizeComment, type AuthorGrade, type CommentItem } from './communityData';

export type Author = { nickname: string; grade: AuthorGrade | null; isOperator: boolean; avatarKey?: string };

/** Who a just-written comment or post is shown as (the reader). */
export function authorOf(profile: { nickname: string; role: string; grade: { key: string; label: string }; avatarKey?: string }): Author {
    return {
        nickname: profile.nickname, grade: profile.grade?.label ? { key: profile.grade.key, label: profile.grade.label } : null,
        isOperator: profile.role === 'owner', avatarKey: profile.avatarKey ?? '',
    };
}

export type CommentPort = {
    /** Changes the comment list on screen. */
    update: (change: (list: CommentItem[]) => CommentItem[]) => void;
    /** Called when the server confirmed but did not send the stored comment back: read the list again. */
    reload?: () => void;
};

export type CommentWrite = (postId: string, body: string, parentId: string | undefined, requestId: string) => Promise<ApiResult>;

const defaultWrite: CommentWrite = (postId, body, parentId, requestId) => boardApi.writeComment(postId, body, parentId, requestId);

const PENDING_PREFIX = 'pending_';
export const pendingId = (requestId: string): string => `${PENDING_PREFIX}${requestId}`;
export const requestIdOf = (id: string): string => (id.startsWith(PENDING_PREFIX) ? id.slice(PENDING_PREFIX.length) : id);
export const isUnsent = (comment: CommentItem): boolean => comment.delivery === 'sending' || comment.delivery === 'failed';

function mapTree(list: CommentItem[], change: (comment: CommentItem) => CommentItem | null): CommentItem[] {
    return list.flatMap((comment) => {
        const next = change(comment);
        return next ? [{ ...next, replies: mapTree(next.replies, change) }] : [];
    });
}

/** Puts a comment at the end of the list, or at the end of its parent's replies. */
export function addComment(list: CommentItem[], comment: CommentItem): CommentItem[] {
    if (comment.parentId && list.some((entry) => entry.id === comment.parentId)) {
        return list.map((entry) => (entry.id === comment.parentId ? { ...entry, replies: [...entry.replies, comment] } : entry));
    }
    return [...list, comment];
}

/** Replaces one comment (null removes it). */
export function replaceComment(list: CommentItem[], id: string, next: CommentItem | null): CommentItem[] {
    return mapTree(list, (comment) => (comment.id === id ? next : comment));
}

export const discardComment = (list: CommentItem[], id: string): CommentItem[] => replaceComment(list, id, null);

/** A failed comment with the same text under the same parent is the one being sent again: it must not stay as a twin. */
function dropFailedTwin(list: CommentItem[], body: string, parentId: string): CommentItem[] {
    return mapTree(list, (comment) => (comment.delivery === 'failed' && comment.body === body && comment.parentId === parentId ? null : comment));
}

function collectUnsent(list: CommentItem[]): CommentItem[] {
    return list.flatMap((comment) => [...(isUnsent(comment) ? [{ ...comment, replies: [] }] : []), ...collectUnsent(comment.replies)]);
}

/** A comment list read from the server, with the reader's unsent comments kept in it. */
export function mergeServerComments(fromServer: CommentItem[], current: CommentItem[]): CommentItem[] {
    return collectUnsent(current).reduce(addComment, fromServer);
}

/** The text to show in the box after a send: back only when sending failed and the box is still empty. */
export function restoreDraft(current: string, sent: string, failure: string): string {
    return failure && !current.trim() ? sent : current;
}

function pendingComment(input: { postId: string; body: string; parentId?: string; requestId: string; author: Author }): CommentItem {
    return {
        id: pendingId(input.requestId), postId: input.postId, parentId: input.parentId ?? '',
        nickname: input.author.nickname, avatarKey: input.author.avatarKey ?? '', grade: input.author.grade, isOperator: input.author.isOperator,
        body: input.body, createdAt: new Date().toISOString(), likes: 0, liked: false, mine: true,
        gone: false, hidden: false, hiddenBody: '', accepted: false, replies: [], delivery: 'sending',
    };
}

async function deliver(port: CommentPort, item: CommentItem, postId: string, write: CommentWrite): Promise<string> {
    let result: ApiResult;
    try {
        result = await write(postId, item.body, item.parentId || undefined, requestIdOf(item.id));
    } catch {
        result = { ok: false, code: 'NETWORK', message: '연결에 실패했어요. 인터넷을 확인해 주세요.' };
    }
    if (result.ok) {
        const stored = normalizeComment((result as { comment?: unknown }).comment);
        const { delivery: _sending, failure: _none, ...settled } = item;
        void _sending; void _none;
        port.update((list) => replaceComment(list, item.id, stored ? { ...stored, mine: true } : settled));
        if (!stored) port.reload?.();
        return '';
    }
    port.update((list) => replaceComment(list, item.id, { ...item, delivery: 'failed', failure: result.message }));
    return result.message;
}

/** Adds the comment to the list at once and sends it. Resolves to '' when stored, or to the reason it was not. */
export function sendComment(
    port: CommentPort,
    input: { postId: string; body: string; parentId?: string; author: Author; requestId?: string },
    write: CommentWrite = defaultWrite,
): Promise<string> {
    const item = pendingComment({ ...input, requestId: input.requestId ?? newRequestId() });
    port.update((list) => addComment(dropFailedTwin(list, item.body, item.parentId), item));
    return deliver(port, item, input.postId, write);
}

/** "다시 보내기" on a failed comment: back to sending, same request id. */
export function retryComment(port: CommentPort, postId: string, failed: CommentItem, write: CommentWrite = defaultWrite): Promise<string> {
    const { failure: _reason, ...rest } = failed;
    void _reason;
    const item: CommentItem = { ...rest, delivery: 'sending' };
    port.update((list) => replaceComment(list, failed.id, item));
    return deliver(port, item, postId, write);
}
