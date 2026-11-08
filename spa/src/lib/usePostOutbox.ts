import { useCallback, useMemo, useRef, useState } from 'react';
import type { PostDraft } from './communityApi';
import type { Author } from './communityOutbox';
import {
    deliverPost, discardOutbox, newOutboxEntry, outboxRequestId, pruneOutbox,
    type OutboxEntry, type OutboxPort,
} from './communityPostOutbox';

/**
 * The reader's own new posts, kept above the server's list while they are sent: "sending" at once, the real post
 * once the server answers, "failed" with a resend. `onSettled` runs when the server stored a post (read the list).
 */
export function usePostOutbox(onSettled: () => void) {
    const [entries, setEntries] = useState<OutboxEntry[]>([]);
    const latest = useRef({ entries, onSettled });
    latest.current = { entries, onSettled };
    const port = useMemo<OutboxPort>(() => ({ update: (change) => setEntries(change), settled: () => latest.current.onSettled() }), []);

    const send = useCallback((draft: PostDraft, author: Author) => {
        const entry = newOutboxEntry(draft, author);
        setEntries((list) => [entry, ...list]);
        void deliverPost(port, entry);
    }, [port]);

    const retry = useCallback((postId: string) => {
        const entry = latest.current.entries.find((item) => item.requestId === outboxRequestId(postId));
        if (entry && entry.state === 'failed') void deliverPost(port, entry);
    }, [port]);

    const discard = useCallback((postId: string) => setEntries((list) => discardOutbox(list, outboxRequestId(postId))), []);

    /** Drop the posts the fresh list already contains. */
    const prune = useCallback((serverIds: ReadonlySet<string>) => {
        setEntries((list) => { const next = pruneOutbox(list, serverIds); return next.length === list.length ? list : next; });
    }, []);

    return { entries, send, retry, discard, prune };
}
