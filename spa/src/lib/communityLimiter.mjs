/**
 * Two small helpers for the thumbnails of a list: a queue that lets only a few loads run at the same time, and a store
 * that keeps the most recently used results. No browser, no network.
 */

/** A queue: `run(task)` starts the task when fewer than `max` are running, otherwise it waits in order. */
export function createLimiter(max = 4) {
    const limit = Math.max(1, Math.floor(Number(max)) || 1);
    const waiting = [];
    let active = 0;

    const next = () => {
        while (active < limit && waiting.length > 0) {
            const job = waiting.shift();
            active += 1;
            let started;
            try {
                started = Promise.resolve(job.task());
            } catch (error) {
                started = Promise.reject(error);
            }
            started.then(job.resolve, job.reject).finally(() => { active -= 1; next(); });
        }
    };

    return {
        run: (task) => new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); next(); }),
        active: () => active,
        waiting: () => waiting.length,
    };
}

/** A store of at most `max` entries; reading or writing an entry makes it the freshest, the stalest one goes first. */
export function createLru(max = 100) {
    const limit = Math.max(1, Math.floor(Number(max)) || 1);
    const entries = new Map();
    return {
        has: (key) => entries.has(key),
        get(key) {
            if (!entries.has(key)) return undefined;
            const value = entries.get(key);
            entries.delete(key);
            entries.set(key, value);
            return value;
        },
        set(key, value) {
            entries.delete(key);
            entries.set(key, value);
            if (entries.size > limit) entries.delete(entries.keys().next().value);
        },
        delete: (key) => entries.delete(key),
        keys: () => [...entries.keys()],
        clear: () => entries.clear(),
        size: () => entries.size,
    };
}
