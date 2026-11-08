import { useMemo, useRef, useState } from 'react';
import { boardApi } from '../../lib/communityApi';
import type { CommentItem } from '../../lib/communityData';
import { canModerate } from '../../lib/accountModel.mjs';
import { createLikeToggle } from '../../lib/communityLikeSync';
import { countComments } from '../../lib/communityModel.mjs';
import { acceptedFirst } from '../../lib/communityQna.mjs';
import { authorOf, discardComment, retryComment, sendComment, type CommentPort } from '../../lib/communityOutbox';
import type { CommunityProfile } from '../../lib/communitySession';
import AcceptButton, { type AcceptControls } from './AcceptButton';
import CommentAdminBar from './CommentAdminBar';
import CommentForm from './CommentForm';
import { useAvatars } from '../../lib/useAvatars';
import CommentTree from './CommentTree';

type Props = {
    postId: string;
    comments: CommentItem[];
    profile: CommunityProfile;
    /** Change the comment list shown (a like, a comment being sent, a moderator click). */
    onComments: CommentPort['update'];
    /** Read the post and its comments again from the server. */
    onReload: () => Promise<void>;
    onReport: (targetType: 'post' | 'comment', targetId: string) => void;
    /** The server closes comments for some posts (notices); a missing value means open. */
    commentable?: boolean;
    /** 질문하기: set only for the asker of the question — the accept buttons under the comments. */
    qna?: AcceptControls;
};

function patchComment(list: CommentItem[], id: string, change: Partial<CommentItem>): CommentItem[] {
    return list.map((comment) => ({
        ...(comment.id === id ? { ...comment, ...change } : comment),
        replies: patchComment(comment.replies, id, change),
    }));
}

/**
 * Comments under a post: the list, the box for a new comment, and the reply box under the comment being answered.
 * A new comment is in the list the moment it is sent (marked "sending"); a like changes at once; both are
 * confirmed or put right in the background.
 */
function CommentSection({ postId, comments, profile, onComments, onReload, onReport, commentable = true, qna }: Props) {
    const [replyingTo, setReplyingTo] = useState('');
    // Photos fill in after the comments are drawn (first letters first).
    const avatars = useAvatars(comments.flatMap((comment) => [comment.avatarKey, ...comment.replies.map((reply) => reply.avatarKey)]));
    const [notice, setNotice] = useState('');
    const canWrite = Boolean(profile.nickname) && !profile.needsNickname;
    const likes = useRef(new Map<string, ReturnType<typeof createLikeToggle>>());
    const port = useMemo<CommentPort>(() => ({ update: onComments, reload: () => { void onReload(); } }), [onComments, onReload]);
    // 질문하기: the accepted answer is the first thing under the question.
    const ordered = useMemo(() => acceptedFirst(comments), [comments]);

    const send = (body: string, parentId?: string): Promise<string> => {
        setReplyingTo('');
        return sendComment(port, { postId, body, parentId, author: authorOf(profile) });
    };

    const like = (comment: CommentItem) => {
        setNotice('');
        let toggle = likes.current.get(comment.id);
        if (!toggle) {
            toggle = createLikeToggle({
                send: () => boardApi.like('comment', comment.id),
                apply: (state) => onComments((list) => patchComment(list, comment.id, state)),
                fail: setNotice,
            });
            likes.current.set(comment.id, toggle);
        }
        toggle.toggle({ liked: comment.liked, likes: comment.likes });
    };

    const remove = async (comment: CommentItem) => {
        if (!window.confirm('이 댓글을 지울까요?')) return;
        setNotice('');
        const result = await boardApi.deleteComment(comment.id);
        if (result.ok) await onReload();
        else setNotice(result.message);
    };

    return (
        <section className="lp-box cm-cmts" aria-labelledby="cm-cmts-title">
            <h2 id="cm-cmts-title">댓글 {countComments(comments)}</h2>
            {notice ? <p className="lp-error" role="alert">{notice}</p> : null}
            {comments.length === 0 ? (commentable ? <p className="cm-empty-sm">첫 댓글을 남겨 보세요.</p> : null) : (
                <CommentTree
                    comments={ordered}
                    avatars={avatars}
                    replyingTo={replyingTo}
                    onReply={(id) => setReplyingTo((current) => (current === id ? '' : id))}
                    onLike={like}
                    onDelete={(comment) => { void remove(comment); }}
                    onReport={(comment) => onReport('comment', comment.id)}
                    onRetry={(comment) => { void retryComment(port, postId, comment); }}
                    onDiscard={(comment) => onComments((list) => discardComment(list, comment.id))}
                    renderAccept={qna ? (comment) => <AcceptButton comment={comment} controls={qna} /> : undefined}
                    renderAdmin={canModerate(profile) ? (comment) => (
                        <CommentAdminBar comment={comment} profile={profile} onDone={onReload}
                            onPatch={(change) => onComments((list) => patchComment(list, comment.id, change))} />
                    ) : undefined}
                    renderReplyForm={(parent) => (
                        <CommentForm placeholder={`${parent.nickname} 님에게 답글`} submitLabel="답글 올리기"
                            onSubmit={(body) => send(body, parent.id)} onCancel={() => setReplyingTo('')} />
                    )}
                />
            )}
            {!commentable
                ? <p className="lp-note">이 글은 댓글을 받지 않아요.</p>
                : canWrite
                ? <CommentForm placeholder="댓글을 남겨 보세요" submitLabel="댓글 올리기" onSubmit={(body) => send(body)} />
                : <p className="lp-note">닉네임을 정하면 댓글을 쓸 수 있어요. 화면 위쪽에서 닉네임을 정해 주세요.</p>}
        </section>
    );
}

export default CommentSection;
