import { useState } from 'react';
import { boardApi } from '../../lib/communityApi';
import type { CommentItem } from '../../lib/communityData';
import { countComments } from '../../lib/communityModel.mjs';
import type { CommunityProfile } from '../../lib/communitySession';
import CommentForm from './CommentForm';
import CommentTree from './CommentTree';

type Props = {
    postId: string;
    comments: CommentItem[];
    profile: CommunityProfile;
    /** Replace the comment list shown (like counts change locally). */
    onComments: (next: CommentItem[]) => void;
    /** Read the post and its comments again from the server. */
    onReload: () => Promise<void>;
    onReport: (targetType: 'post' | 'comment', targetId: string) => void;
};

function patchComment(list: CommentItem[], id: string, change: Partial<CommentItem>): CommentItem[] {
    return list.map((comment) => ({
        ...(comment.id === id ? { ...comment, ...change } : comment),
        replies: patchComment(comment.replies, id, change),
    }));
}

/** Comments under a post: the list, the box for a new comment, and the reply box under the comment being answered. */
function CommentSection({ postId, comments, profile, onComments, onReload, onReport }: Props) {
    const [replyingTo, setReplyingTo] = useState('');
    const [notice, setNotice] = useState('');
    const canWrite = Boolean(profile.nickname) && !profile.needsNickname;

    const send = async (body: string, parentId?: string): Promise<string> => {
        const result = await boardApi.writeComment(postId, body, parentId);
        if (!result.ok) return result.message;
        setReplyingTo('');
        await onReload();
        return '';
    };

    const like = async (comment: CommentItem) => {
        setNotice('');
        const result = await boardApi.like('comment', comment.id);
        if (result.ok) onComments(patchComment(comments, comment.id, { liked: result.liked === true, likes: Number(result.likes) || 0 }));
        else setNotice(result.message);
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
            {comments.length === 0 ? <p className="cm-empty-sm">첫 댓글을 남겨 보세요.</p> : (
                <CommentTree
                    comments={comments}
                    replyingTo={replyingTo}
                    onReply={(id) => setReplyingTo((current) => (current === id ? '' : id))}
                    onLike={(comment) => { void like(comment); }}
                    onDelete={(comment) => { void remove(comment); }}
                    onReport={(comment) => onReport('comment', comment.id)}
                    renderReplyForm={(parent) => (
                        <CommentForm placeholder={`${parent.nickname} 님에게 답글`} submitLabel="답글 올리기"
                            onSubmit={(body) => send(body, parent.id)} onCancel={() => setReplyingTo('')} />
                    )}
                />
            )}
            {canWrite
                ? <CommentForm placeholder="댓글을 남겨 보세요" submitLabel="댓글 올리기" onSubmit={(body) => send(body)} />
                : <p className="lp-note">닉네임을 정하면 댓글을 쓸 수 있어요. 화면 위쪽에서 닉네임을 정해 주세요.</p>}
        </section>
    );
}

export default CommentSection;
