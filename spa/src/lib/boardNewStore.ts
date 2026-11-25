import { latestByBoard, markOpened, mergeLatest, pickTimes } from './boardNew.mjs';

/**
 * This device's memory for the "NEW!" marks: the newest post time seen per board, and the time each board was last
 * opened. localStorage when it works; when it does not (private window, full disk) the page session still remembers in
 * memory. Nothing here asks the server — the rows come from lists the screen already received.
 */

export type BoardNewSnapshot = { latest: Record<string, number>; opened: Record<string, number> };

const LATEST_KEY = 'leaderspro:board-latest:v1';
const OPENED_KEY = 'leaderspro:board-opened:v1';

let state: BoardNewSnapshot | null = null;
const listeners = new Set<() => void>();

function area(): Storage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
}

function read(key: string): Record<string, number> {
    try {
        const raw = area()?.getItem(key);
        return raw ? pickTimes(JSON.parse(raw)) : {};
    } catch {
        return {};
    }
}

function write(key: string, value: Record<string, number>): void {
    try {
        area()?.setItem(key, JSON.stringify(value));
    } catch {
        // The mark is a convenience: when saving fails the page session keeps it in memory.
    }
}

function publish(next: BoardNewSnapshot): void {
    state = next;
    for (const listener of [...listeners]) listener();
}

/** The same object until something changes (useSyncExternalStore compares by identity). */
export function getBoardNewSnapshot(): BoardNewSnapshot {
    if (!state) state = { latest: read(LATEST_KEY), opened: read(OPENED_KEY) };
    return state;
}

export function subscribeBoardNew(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** Moves the newest-post times forward (never back). Does nothing, and wakes nobody, when nothing moved. */
export function recordBoardLatest(incoming: Record<string, number>): void {
    const current = getBoardNewSnapshot();
    const latest = mergeLatest(current.latest, incoming) as Record<string, number>;
    if (latest === current.latest) return;
    write(LATEST_KEY, latest);
    publish({ ...current, latest });
}

/** Remembers the newest post of each board among the rows of a list (any board, sort or page). */
export function recordBoardPosts(rows: ReadonlyArray<{ board: string; createdAt: string }>): void {
    recordBoardLatest(latestByBoard(rows));
}

/** The reader is looking at this board's list: its mark goes away until a later post arrives. */
export function markBoardOpened(board: string, now: number = Date.now()): void {
    const current = getBoardNewSnapshot();
    const opened = markOpened(current.opened, board, current.latest, now) as Record<string, number>;
    if (opened === current.opened) return;
    write(OPENED_KEY, opened);
    publish({ ...current, opened });
}

// Another tab of the same site changed the saved times: read them again.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key !== null && event.key !== LATEST_KEY && event.key !== OPENED_KEY) return;
        state = null;
        for (const listener of [...listeners]) listener();
    });
}
