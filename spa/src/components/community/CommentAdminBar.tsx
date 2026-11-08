import { useState } from 'react';
import { commentModeration, describeModerationFailure } from '../../lib/accountModel.mjs';
import type { CommentItem } from '../../lib/communityData';
import { moderationApi } from '../../lib/communityModeration';
import { runOptimistic } from '../../lib/communityOptimistic';
import type { CommunityProfile } from '../../lib/communitySession';

type Props = {
    comment: CommentItem;
    profile: CommunityProfile;
    /** The server accepted a hide / show / delete: read the comments again. */
    onDone: () => void | Promise<void>;
    /** Draws a change on this comment at once (hiding it); put back if the server refuses. */
    onPatch?: (change: Partial<CommentItem>) => void;
};

/** Moderator buttons under one comment: hide / show and delete. Drawn only for an owner; the server decides. */
function CommentAdminBar({ comment, profile, onDone, onPatch }: Props) {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const plan = commentModeration(comment, profile);
    if (!plan) return null;

    const run = async (call: () => Promise<{ ok: boolean; message?: string }>) => {
        if (busy) return;
        setBusy(true);
        setMessage('');
        const result = await call();
        if (result.ok) await onDone(); else setMessage(describeModerationFailure(result as { message: string }));
        setBusy(false);
    };

    /** Hiding is drawn first (the comment turns into the "숨긴 댓글" placeholder); showing again needs the text back, so it waits. */
    const toggleHide = async () => {
        if (!onPatch || comment.hidden) { void run(() => moderationApi.hide('comment', comment.id, !comment.hidden)); return; }
        if (busy) return;
        const before = {
            hidden: comment.hidden, gone: comment.gone, body: comment.body, hiddenBody: comment.hiddenBody,
            nickname: comment.nickname, grade: comment.grade, isOperator: comment.isOperator,
        };
        setBusy(true);
        setMessage('');
        const failure = await runOptimistic({
            apply: () => onPatch({ hidden: true, gone: true, hiddenBody: comment.body, body: '', nickname: '', grade: null, isOperator: false }),
            revert: () => onPatch(before),
            call: () => moderationApi.hide('comment', comment.id, true),
            describe: (result) => describeModerationFailure(result as { message: string }),
        });
        setBusy(false);
        if (failure) setMessage(failure);
    };

    const remove = () => {
        if (!window.confirm('이 댓글을 지울까요?')) return;
        void run(() => moderationApi.remove('comment', comment.id));
    };

    return (
        <div className="cm-admin-inline" role="group" aria-label="댓글 관리자 도구">
            <button type="button" className="cm-act" disabled={busy}
                onClick={() => { void toggleHide(); }}>{plan.hideLabel}</button>
            {plan.remove ? <button type="button" className="cm-act cm-act-danger" disabled={busy} onClick={remove}>삭제</button> : null}
            {message ? <span className="lp-error cm-admin-msg" role="alert">{message}</span> : null}
        </div>
    );
}

export default CommentAdminBar;
