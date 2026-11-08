/**
 * Likes that answer at once. Pressing the heart changes the heart and the number on screen in the same moment;
 * the server is told in the background. Quick repeated presses never overlap: one request is out at a time,
 * and when it comes back the screen is brought to the LAST state the reader chose (one more toggle if needed).
 * A refusal puts the heart back to what the server last confirmed and reports one short sentence.
 */
import type { ApiResult } from './communityApi';

export type LikeState = { liked: boolean; likes: number };

/** The state after one press (the count never goes below zero). */
export const flipLike = (state: LikeState): LikeState => (state.liked
    ? { liked: false, likes: Math.max(0, state.likes - 1) }
    : { liked: true, likes: state.likes + 1 });

type Options = {
    /** Asks the server to toggle the like (the server's like action is a toggle). */
    send: () => Promise<ApiResult>;
    /** Draws a state on screen. */
    apply: (state: LikeState) => void;
    /** Reports a refusal in words. */
    fail: (message: string) => void;
};

export function createLikeToggle(options: Options): { toggle: (current: LikeState) => void; settled: () => Promise<void> } {
    let running: Promise<void> | null = null;
    let wanted: LikeState = { liked: false, likes: 0 };
    let confirmed: LikeState = { liked: false, likes: 0 };

    const run = async (): Promise<void> => {
        for (;;) {
            const result = await options.send();
            if (!result.ok) {
                wanted = confirmed;
                options.apply(confirmed);
                options.fail(result.message);
                return;
            }
            confirmed = { liked: result.liked === true, likes: Number(result.likes) || 0 };
            if (wanted.liked === confirmed.liked) {
                wanted = confirmed;
                options.apply(confirmed);
                return;
            }
            // The reader pressed again while the request was out: the server is one toggle behind.
            wanted = flipLike(confirmed);
            options.apply(wanted);
        }
    };

    return {
        toggle(current) {
            if (running) {
                wanted = flipLike(wanted);
                options.apply(wanted);
                return;
            }
            confirmed = current;
            wanted = flipLike(current);
            options.apply(wanted);
            running = run().finally(() => { running = null; });
        },
        settled: () => running ?? Promise.resolve(),
    };
}
