import { useState } from 'react';
import { commentModeration, describeModerationFailure } from '../../lib/accountModel.mjs';
import type { CommentItem } from '../../lib/communityData';
import { moderationApi } from '../../lib/communityModeration';
import type { CommunityProfile } from '../../lib/communitySession';

type Props = {
    comment: CommentItem;
    profile: CommunityProfile;
    /** The server accepted a hide / show / delete: read the comments again. */
    onDone: () => void | Promise<void>;
};

/** Moderator buttons under one comment: hide / show and delete. Drawn only for an owner; the server decides. */
function CommentAdminBar({ comment, profile, onDone }: Props) {
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

    const remove = () => {
        if (!window.confirm('이 댓글을 지울까요?')) return;
        void run(() => moderationApi.remove('comment', comment.id));
    };

    return (
        <div className="cm-admin-inline" role="group" aria-label="댓글 관리자 도구">
            <button type="button" className="cm-act" disabled={busy}
                onClick={() => { void run(() => moderationApi.hide('comment', comment.id, !comment.hidden)); }}>{plan.hideLabel}</button>
            {plan.remove ? <button type="button" className="cm-act cm-act-danger" disabled={busy} onClick={remove}>삭제</button> : null}
            {message ? <span className="lp-error cm-admin-msg" role="alert">{message}</span> : null}
        </div>
    );
}

export default CommentAdminBar;
