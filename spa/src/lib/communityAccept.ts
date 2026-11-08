import { boardApi, type ApiFailure, type ApiResult } from './communityApi';
import { runOptimistic } from './communityOptimistic';
import { describeAcceptFailure } from './communityQna.mjs';

/** What the accept flow needs from the screen. */
export type AcceptView = {
    /** Draw the question as having `acceptedId` as its answer ('' = no answer). */
    show: (acceptedId: string) => void;
    /** The sentence for a refusal ('' clears the last one). */
    notify: (message: string) => void;
    /** The server said yes. */
    done: () => void;
};

export type AcceptCall = (postId: string, commentId: string) => Promise<ApiResult>;

/**
 * 질문하기: take `commentId` as the answer of `postId` (or take the answer back with ''). The screen changes first
 * (`show`), the server is asked after, and a refusal draws the old answer (`previous`) back with the server's sentence.
 * When the server answers with the accepted comment id (`acceptedCommentId`), the screen follows that id.
 * Resolves to '' when it went through, or to the sentence shown.
 */
export async function acceptAnswerFlow(
    postId: string, commentId: string, previous: string, view: AcceptView, call: AcceptCall = boardApi.acceptAnswer,
): Promise<string> {
    view.notify('');
    let settled = commentId;
    const failure = await runOptimistic({
        apply: () => view.show(commentId),
        revert: () => view.show(previous),
        call: async () => {
            const result = await call(postId, commentId);
            if (result.ok && typeof result.acceptedCommentId === 'string') settled = result.acceptedCommentId;
            return result;
        },
        describe: (result) => describeAcceptFailure(result as ApiFailure),
    });
    if (failure) { view.notify(failure); return failure; }
    if (settled !== commentId) view.show(settled);
    view.done();
    return '';
}
