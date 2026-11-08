import { COMMUNITY_CODES } from './communityContract.mjs';

/**
 * 질문하기 (forum contract 1116, Site): the state of a question, who may accept an answer, the accepted-first order
 * and the optimistic change when an answer is accepted. Pure code — the server decides, these only shape the screen.
 */

export const QNA_BOARD = 'qna';
export const QNA_OPEN = '답변 대기';
export const QNA_SOLVED = '해결됨';

/** Said on an empty 질문하기 board. */
export const QNA_EMPTY_TEXT = '궁금한 걸 물어보세요. 답을 채택하면 답한 분께 점수가 갑니다.';

export const isQnaPost = (post) => Boolean(post) && post.board === QNA_BOARD;

const OPEN_STATE = Object.freeze({ key: 'open', label: QNA_OPEN, tone: 'wait' });
const SOLVED_STATE = Object.freeze({ key: 'solved', label: QNA_SOLVED, tone: 'done' });

/**
 * The chip of a question: solved when its status word says so, the list flagged it `solved`, or the detail carries an
 * accepted comment id; otherwise it is waiting for an answer. null for a post of any other board.
 */
export function qnaState(post) {
    if (!isQnaPost(post)) return null;
    const solved = post.status === QNA_SOLVED || post.solved === true || Boolean(post.acceptedCommentId);
    return solved ? SOLVED_STATE : OPEN_STATE;
}

/**
 * What the asker may do with one comment: 'accept', 'cancel' (it is the accepted one) or '' (nothing).
 * Only a live top-level comment written by someone else can be accepted; a reply, a removed or hidden comment,
 * a comment still being sent and the asker's own comment cannot (the server refuses those too).
 */
export function acceptAction(asker, comment) {
    if (!asker || !comment) return '';
    if (comment.accepted === true) return 'cancel';
    if (comment.parentId || comment.gone || comment.hidden || comment.mine || comment.delivery) return '';
    return 'accept';
}

/** The comments with the accepted top-level one in front; the rest keep their order. The input is not changed. */
export function acceptedFirst(comments) {
    const list = Array.isArray(comments) ? comments : [];
    const accepted = list.find((comment) => comment.accepted === true);
    return accepted ? [accepted, ...list.filter((comment) => comment !== accepted)] : [...list];
}

/** The accepted comment's id: the post's own field, else the comment flagged accepted, else ''. */
export function acceptedIdOf(post, comments) {
    if (post?.acceptedCommentId) return post.acceptedCommentId;
    return (Array.isArray(comments) ? comments : []).find((comment) => comment.accepted === true)?.id ?? '';
}

/** The comment list with exactly the top-level comment `commentId` marked accepted; '' marks none. */
export function markAccepted(comments, commentId) {
    return (Array.isArray(comments) ? comments : []).map((comment) => ({ ...comment, accepted: commentId !== '' && comment.id === commentId }));
}

/** The question after an accept (`commentId`) or an un-accept (''): 해결됨 with the id, or back to 답변 대기. */
export function acceptedPost(post, commentId) {
    return { ...post, status: commentId ? QNA_SOLVED : QNA_OPEN, solved: Boolean(commentId), acceptedCommentId: commentId };
}

/** Used only when the server's refusal carries no sentence of its own. */
const FALLBACKS = Object.freeze({
    [COMMUNITY_CODES.ACCEPT_NOT_ALLOWED]: '질문한 분만, 다른 분이 쓴 답변을 채택할 수 있어요.',
    [COMMUNITY_CODES.COMMENT_NOT_FOUND]: '그 댓글을 찾을 수 없어요. 새로 불러온 뒤 다시 해 주세요.',
});

/** One sentence for a refused accept: the server's own sentence as it is (contract 1116), else a short one by code. */
export function describeAcceptFailure(result) {
    if (typeof result?.message === 'string' && result.message) return result.message;
    return FALLBACKS[result?.code] ?? '처리하지 못했어요. 잠시 뒤 다시 해 주세요.';
}
