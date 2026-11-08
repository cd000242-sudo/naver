import { useState } from 'react';
import { describeModerationFailure, postModeration } from '../../lib/accountModel.mjs';
import { describeAvatarRemoveFailure } from '../../lib/accountModel.mjs';
import type { ApiFailure } from '../../lib/communityApi';
import type { PostItem } from '../../lib/communityData';
import { moderationApi } from '../../lib/communityModeration';
import { runOptimistic } from '../../lib/communityOptimistic';
import type { BoardConfig } from '../../lib/communityModel.mjs';
import type { CommunityProfile } from '../../lib/communitySession';

type Props = {
    post: PostItem;
    boards: readonly BoardConfig[];
    profile: CommunityProfile;
    /** The server accepted a change: update the post on screen. */
    onChanged: (change: Partial<PostItem>) => void;
    /** The post was deleted. */
    onRemoved: () => void;
    /** A change was confirmed by the server (the list behind the post can be read again). */
    onSaved?: () => void;
};

/**
 * Moderator tools under a post: hide / show, pin, delete, and the answer state of inquiries and requests.
 * Drawn only for an owner; every click goes to the server, which decides — its refusal sentence is shown as it is.
 * A notice (nt_) can only be pinned here; the rest is edited in the home-operations admin.
 */
function PostAdminBar({ post, boards, profile, onChanged, onRemoved, onSaved }: Props) {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [note, setNote] = useState('');
    const plan = postModeration(post, profile, boards);
    if (!plan) return null;

    /** Takes the author's photo down; the server answers who may. */
    const removePhoto = async () => {
        if (busy || !post.avatarKey) return;
        setBusy(true);
        setMessage('');
        const result = await moderationApi.removeAvatar({ targetKey: post.avatarKey });
        setBusy(false);
        if (result.ok) setNote('작성자 사진을 지웠어요.'); else setMessage(describeAvatarRemoveFailure(result as ApiFailure));
    };

    /** The change is drawn first; a refusal draws it back and shows the server's sentence. */
    const run = async (call: () => Promise<{ ok: boolean; message?: string }>, apply: () => void, revert: () => void) => {
        if (busy) return;
        setBusy(true);
        setMessage('');
        const failure = await runOptimistic({ apply, revert, call, describe: (result) => describeModerationFailure(result as ApiFailure) });
        setBusy(false);
        if (failure) setMessage(failure); else onSaved?.();
    };

    const remove = async () => {
        if (busy || !window.confirm('이 글을 지울까요? 지운 글은 되돌릴 수 없어요.')) return;
        setBusy(true);
        setMessage('');
        const result = await moderationApi.remove('post', post.id);
        setBusy(false);
        if (result.ok) onRemoved(); else setMessage(describeModerationFailure(result as ApiFailure));
    };

    return (
        <div className="cm-admin" role="group" aria-label="관리자 도구">
            <p className="cm-admin-title">관리자{post.hidden ? <span className="lp-state lp-state-wait">숨겨진 글이에요</span> : null}</p>
            {plan.statusChoices.length > 0 ? (
                <div className="cm-seg" role="group" aria-label="상태">
                    {plan.statusChoices.map((status) => (
                        <button key={status} type="button" className="cm-seg-btn" disabled={busy} aria-pressed={post.status === status}
                            onClick={() => {
                                if (post.status !== status) void run(() => moderationApi.setStatus(post.id, status), () => onChanged({ status }), () => onChanged({ status: post.status }));
                            }}>{status}</button>
                    ))}
                </div>
            ) : null}
            {plan.hide || plan.pin || plan.remove ? (
            <div className="cm-admin-row">
                {plan.hide ? (
                    <button type="button" className="cm-act" disabled={busy}
                        onClick={() => {
                            void run(() => moderationApi.hide('post', post.id, !post.hidden), () => onChanged({ hidden: !post.hidden }), () => onChanged({ hidden: post.hidden }));
                        }}>{plan.hideLabel}</button>
                ) : null}
                {plan.pin ? (
                    <button type="button" className="cm-act" disabled={busy}
                        onClick={() => {
                            void run(() => moderationApi.pin(post.id, !post.pinned), () => onChanged({ pinned: !post.pinned }), () => onChanged({ pinned: post.pinned }));
                        }}>{plan.pinLabel}</button>
                ) : null}
                {plan.remove ? <button type="button" className="cm-act cm-act-danger" disabled={busy} onClick={() => { void remove(); }}>삭제</button> : null}
            </div>
            ) : null}
            {post.avatarKey && !post.notice ? (
                <div className="cm-admin-row">
                    <button type="button" className="cm-act" disabled={busy} onClick={() => { void removePhoto(); }}>작성자 사진 지우기</button>
                </div>
            ) : null}
            {note ? <p className="cm-admin-hint" role="status">{note}</p> : null}
            {plan.noticeHint ? <p className="cm-admin-hint">{plan.noticeHint}</p> : null}
            {post.openReports > 0 ? <p className="cm-admin-hint">들어온 신고 {post.openReports}건</p> : null}
            {message ? <p className="lp-error" role="alert">{message}</p> : null}
        </div>
    );
}

export default PostAdminBar;
