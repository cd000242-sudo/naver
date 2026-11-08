import type { ReactNode } from 'react';
import type { CommentItem } from '../../lib/communityData';
import { formatPostDate } from '../../lib/communityModel.mjs';
import Avatar from './Avatar';
import { GradeBadge } from './Badges';

type Props = {
    comments: CommentItem[];
    /** Id of the comment whose reply form is open ('' = none). */
    replyingTo: string;
    onReply: (id: string) => void;
    onLike: (comment: CommentItem) => void;
    onDelete: (comment: CommentItem) => void;
    onReport: (comment: CommentItem) => void;
    /** A comment that failed to send: send it again / throw it away. */
    onRetry?: (comment: CommentItem) => void;
    onDiscard?: (comment: CommentItem) => void;
    renderReplyForm: (parent: CommentItem) => ReactNode;
    /** Moderator buttons for one comment; set only for an owner, so a member's page has none of it. */
    renderAdmin?: (comment: CommentItem) => ReactNode;
    /** Photos by avatar key, as far as they are known; a comment without one gets its first letter. */
    avatars?: Record<string, string>;
    now?: number;
};

type RowProps = Omit<Props, 'comments'> & { comment: CommentItem; reply: boolean; now: number };

function CommentRow({ comment, reply, replyingTo, onReply, onLike, onDelete, onReport, onRetry, onDiscard, renderReplyForm, renderAdmin, avatars = {}, now }: RowProps) {
    return (
        <li className={`cm-comment${reply ? ' is-reply' : ''}${comment.delivery ? ` is-${comment.delivery}` : ''}`}>
            {comment.delivery ? (
                <>
                    <div className="cm-c-head">
                        <GradeBadge grade={comment.grade} isOperator={comment.isOperator} />
                        <b className="cm-nick">{comment.nickname}</b>
                        <time>{comment.delivery === 'sending' ? '보내는 중' : '보내지 못했어요'}</time>
                    </div>
                    <p className="cm-c-body">{comment.body}</p>
                    {comment.delivery === 'failed' ? (
                        <div className="cm-c-fail" role="alert">
                            {comment.failure ? <span>{comment.failure}</span> : null}
                            <button type="button" className="cm-act" onClick={() => onRetry?.(comment)}>다시 보내기</button>
                            <button type="button" className="cm-act" onClick={() => onDiscard?.(comment)}>지우기</button>
                        </div>
                    ) : null}
                </>
            ) : comment.gone ? (
                renderAdmin && comment.hidden ? (
                    <>
                        <p className="cm-gone">숨긴 댓글입니다</p>
                        {comment.hiddenBody ? <p className="cm-c-body cm-c-dim">{comment.hiddenBody}</p> : null}
                    </>
                ) : <p className="cm-gone">삭제된 댓글입니다</p>
            ) : (
                <>
                    <div className="cm-c-head">
                        <Avatar name={comment.nickname} src={avatars[comment.avatarKey]} size={28} />
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
            {renderAdmin && !comment.delivery ? renderAdmin(comment) : null}
            {!reply && replyingTo === comment.id && !comment.gone && !comment.delivery ? renderReplyForm(comment) : null}
            {comment.replies.length > 0 ? (
                <ul className="cm-replies">
                    {comment.replies.map((child) => (
                        <CommentRow key={child.id} comment={child} reply replyingTo={replyingTo} onReply={onReply} onLike={onLike}
                            onDelete={onDelete} onReport={onReport} onRetry={onRetry} onDiscard={onDiscard} renderReplyForm={renderReplyForm} renderAdmin={renderAdmin} avatars={avatars} now={now} />
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
