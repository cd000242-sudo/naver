/**
 * A new post that is on top of the list the moment "올리기" is pressed. The list keeps an outbox of the reader's
 * own posts: "sending" until the server answers, "sent" (the real post) until the fresh list has it, "failed" with
 * the reason and the whole draft so it can be sent again. A resend keeps the request id, so the server answers
 * with the first post instead of making a twin.
 */
import { boardApi, newRequestId, type ApiResult, type PostDraft } from './communityApi';
import { normalizePost, type PostItem } from './communityData';
import type { Author } from './communityOutbox';

export type OutboxEntry = {
    requestId: string;
    draft: PostDraft;
    post: PostItem;
    state: 'sending' | 'failed' | 'sent';
    failure: string;
};

export type OutboxPort = {
    update: (change: (list: OutboxEntry[]) => OutboxEntry[]) => void;
    /** The server stored the post: read the list (and the profile) again. */
    settled: () => void;
};

export type PostWrite = (draft: PostDraft, requestId: string) => Promise<ApiResult>;
const defaultWrite: PostWrite = (draft, requestId) => boardApi.writePost(draft, requestId);

const PENDING_PREFIX = 'pending_';
export const outboxRequestId = (postId: string): string => (postId.startsWith(PENDING_PREFIX) ? postId.slice(PENDING_PREFIX.length) : '');

/** The draft as a list row, marked "sending". */
export function newOutboxEntry(draft: PostDraft, author: Author, requestId: string = newRequestId()): OutboxEntry {
    const promo = draft.board === 'promo';
    const base = normalizePost({
        id: `${PENDING_PREFIX}${requestId}`, board: draft.board, title: draft.title, excerpt: promo ? draft.body : '',
        nickname: author.nickname, avatarKey: author.avatarKey, grade: author.grade, isOperator: author.isOperator, createdAt: new Date().toISOString(),
        mine: true, ...(promo ? { url: draft.url } : {}),
    }) as PostItem;
    return { requestId, draft, post: { ...base, delivery: 'sending' }, state: 'sending', failure: '' };
}

const patchEntry = (list: OutboxEntry[], requestId: string, next: OutboxEntry | null): OutboxEntry[] =>
    list.flatMap((entry) => (entry.requestId === requestId ? (next ? [next] : []) : [entry]));

/** Sends the draft. Resolves when the server has answered; the entry in the list shows where it stands. */
export async function deliverPost(port: OutboxPort, entry: OutboxEntry, write: PostWrite = defaultWrite): Promise<void> {
    const { failure: _reason, ...rest } = entry.post;
    void _reason;
    port.update((list) => patchEntry(list, entry.requestId, { ...entry, state: 'sending', failure: '', post: { ...rest, delivery: 'sending' } }));
    let result: ApiResult;
    try {
        result = await write(entry.draft, entry.requestId);
    } catch {
        result = { ok: false, code: 'NETWORK', message: '연결에 실패했어요. 인터넷을 확인해 주세요.' };
    }
    if (result.ok) {
        const stored = normalizePost((result as { post?: unknown }).post);
        // Without the stored post there is nothing to show in its place: the fresh list will have it.
        port.update((list) => patchEntry(list, entry.requestId, stored ? { ...entry, state: 'sent', failure: '', post: { ...stored, mine: true } } : null));
        port.settled();
        return;
    }
    port.update((list) => patchEntry(list, entry.requestId, { ...entry, state: 'failed', failure: result.message, post: { ...rest, delivery: 'failed', failure: result.message } }));
}

export const discardOutbox = (list: OutboxEntry[], requestId: string): OutboxEntry[] => patchEntry(list, requestId, null);

/** Rows to draw above the server's list: this screen's board, the first page, and not yet in the fresh list. */
export function visibleOutbox(entries: OutboxEntry[], view: { board: string; page: number }, serverIds: ReadonlySet<string>): PostItem[] {
    if (view.page !== 1) return [];
    return entries
        .filter((entry) => (view.board === 'all' || entry.post.board === view.board) && !serverIds.has(entry.post.id))
        .map((entry) => (entry.state === 'sent' ? entry.post : { ...entry.post, delivery: entry.state, failure: entry.failure }));
}

/** Entries the fresh list already contains are done with. */
export const pruneOutbox = (entries: OutboxEntry[], serverIds: ReadonlySet<string>): OutboxEntry[] =>
    entries.filter((entry) => !(entry.state === 'sent' && serverIds.has(entry.post.id)));
