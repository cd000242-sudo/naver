import type { ReactNode } from 'react';
import type { CommentItem } from '../../lib/communityData';
import { formatPostDate } from '../../lib/communityModel.mjs';
import { GradeBadge } from './Badges';

type Props = {
    comments: CommentItem[];
    /** Id of the comment whose reply form is open ('' = none). */
    replyingTo: string;
    onReply: (id: string) => void;
    onLike: (comment: CommentItem) => void;
    onDelete: (comment: CommentItem) => void;
    onReport: (comment: CommentItem) => void;
    renderReplyForm: (parent: CommentItem) => ReactNode;
    now?: number;
};

type RowProps = Omit<Props, 'comments'> & { comment: CommentItem; reply: boolean; now: number };

function CommentRow({ comment, reply, replyingTo, onReply, onLike, onDelete, onReport, renderReplyForm, now }: RowProps) {
    return (
        <li className={`cm-comment${reply ? ' is-reply' : ''}`}>
            {comment.gone ? (
                <p className="cm-gone">삭제된 댓글입니다</p>
            ) : (
                <>
                    <div className="cm-c-head">
                        <GradeBadge grade={comment.grade} isOperator={comment.isOperator} />
                        <b className="cm-nick">{comment.nickname}</b>
                        <time>{formatPostDate(comment.createdAt, now)}</time>
                    </div>
                    <p className="cm-c-body">{comment.body}</p>
                    <div className="cm-c-actions">
                        {comment.mine
                            ? <span className="cm-like cm-like-static"><b>{comment.likes}</b> 좋아요</span>
                            : <button type="button" className="cm-like" aria-pressed={comment.liked} onClick={() => onLike(comment)}><b>{comment.likes}</b> 좋아요</button>}
                        {reply ? null : <button type="button" className="cm-act" onClick={() => onReply(comment.id)}>답글</button>}
                        {comment.mine
                            ? <button type="button" className="cm-act" onClick={() => onDelete(comment)}>삭제</button>
                            : <button type="button" className="cm-act" onClick={() => onReport(comment)}>신고</button>}
                    </div>
                </>
            )}
            {!reply && replyingTo === comment.id && !comment.gone ? renderReplyForm(comment) : null}
            {comment.replies.length > 0 ? (
                <ul className="cm-replies">
                    {comment.replies.map((child) => (
                        <CommentRow key={child.id} comment={child} reply replyingTo={replyingTo} onReply={onReply} onLike={onLike}
                            onDelete={onDelete} onReport={onReport} renderReplyForm={renderReplyForm} now={now} />
                    ))}
                </ul>
            ) : null}
        </li>
    );
}

/** Comments with one level of replies. A removed comment that still has replies stays as a short placeholder. */
function CommentTree({ comments, now = Date.now(), ...rest }: Props) {
    return (
        <ul className="cm-comments">
            {comments.map((comment) => <CommentRow key={comment.id} comment={comment} reply={false} now={now} {...rest} />)}
        </ul>
    );
}

export default CommentTree;
