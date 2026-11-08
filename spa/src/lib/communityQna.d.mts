export type QnaState = Readonly<{ key: 'open' | 'solved'; label: string; tone: 'wait' | 'done' }>;
type QnaPostLike = { board?: string; status?: string; solved?: boolean; acceptedCommentId?: string } | null | undefined;
type QnaCommentLike = { id: string; parentId?: string; mine?: boolean; gone?: boolean; hidden?: boolean; accepted?: boolean; delivery?: string };

export const QNA_BOARD: 'qna';
export const QNA_OPEN: string;
export const QNA_SOLVED: string;
export const QNA_EMPTY_TEXT: string;

export function isQnaPost(post: unknown): boolean;
export function qnaState(post: QnaPostLike): QnaState | null;
export function acceptAction(asker: boolean, comment: QnaCommentLike | null | undefined): 'accept' | 'cancel' | '';
export function acceptedFirst<T extends { accepted?: boolean }>(comments: readonly T[] | null | undefined): T[];
export function acceptedIdOf(post: QnaPostLike, comments: readonly { id: string; accepted?: boolean }[] | null | undefined): string;
export function markAccepted<T extends { id: string }>(comments: readonly T[] | null | undefined, commentId: string): Array<T & { accepted: boolean }>;
export function acceptedPost<T extends object>(post: T, commentId: string): T & { status: string; solved: boolean; acceptedCommentId: string };
export function describeAcceptFailure(result: { code?: unknown; message?: unknown } | null | undefined): string;
