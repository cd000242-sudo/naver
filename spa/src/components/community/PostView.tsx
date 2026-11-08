import type { PostItem } from '../../lib/communityData';
import { boardLabel, formatPostDate, type BoardConfig } from '../../lib/communityModel.mjs';
import { PROMO_PLATFORMS, promoPlatformOf } from '../../lib/communityPlatform.mjs';
import { reportAction } from '../../lib/communityReport.mjs';
import { useAvatars } from '../../lib/useAvatars';
import Avatar from './Avatar';
import { GradeBadge, NoticeBadge, QnaChip, StatusBadge } from './Badges';
import RichBody from './RichBody';

type Props = {
    post: PostItem;
    boards: readonly BoardConfig[];
    busy?: boolean;
    onLike: () => void;
    onReport: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onVisit: () => void;
    /** What [신고] does for this reader (see reportAction); without it a post of someone else can be reported. */
    reportMode?: 'hidden' | 'login' | 'report';
    now?: number;
};

/** One post: title, author, numbers, body (plain text, line breaks kept), and what the reader can do with it. */
function PostView({ post, boards, busy = false, onLike, onReport, onEdit, onDelete, onVisit, reportMode, now = Date.now() }: Props) {
    const promo = post.board === 'promo';
    const mode = reportMode ?? reportAction(post, {});
    const photos = useAvatars([post.avatarKey]);
    return (
        <article className="lp-box cm-post">
            <header className="cm-post-head">
                <div className="cm-post-meta">
                    {post.notice ? <NoticeBadge kind={post.noticeBadge} /> : null}
                    <span className="cm-board-tag">{boardLabel(post.board, boards)}</span>
                    {post.board === 'qna' ? <QnaChip post={post} /> : <StatusBadge board={post.board} status={post.status} />}
                </div>
                <h1 className="cm-post-title">{post.title}</h1>
                <div className="cm-post-by">
                    <Avatar name={post.nickname} src={photos[post.avatarKey]} size={36} />
                    <GradeBadge grade={post.grade} isOperator={post.isOperator} />
                    <b className="cm-nick">{post.nickname}</b>
                    <time>{formatPostDate(post.createdAt, now)}</time>
                    {post.notice ? null : <span>조회 {post.views}</span>}
                </div>
            </header>
            {promo ? (
                <div className="cm-promo">
                    <span className="cm-promo-plat">{PROMO_PLATFORMS.find((entry) => entry.key === promoPlatformOf(post))?.label}</span>
                    {post.url ? <code className="cm-promo-url">{post.url}</code> : null}
                    <button type="button" className="cm-visit" onClick={onVisit} disabled={!post.url}><b>{post.visits}</b>들르기</button>
                    <span className="cm-promo-given">이 사람이 들른 글 {post.given}</span>
                </div>
            ) : null}
            {post.format === 'rich' ? <RichBody postId={post.id} body={post.body} /> : <div className="cm-body">{post.body}</div>}
            <footer className="cm-post-actions">
                {(post.mine && !post.notice) || !post.likable
                    ? <span className="cm-like cm-like-static"><b>{post.likes}</b> 좋아요</span>
                    : <button type="button" className="cm-like" aria-pressed={post.liked} disabled={busy} onClick={onLike}><b>{post.likes}</b> 좋아요</button>}
                {post.notice ? null : post.mine ? (
                    <>
                        <button type="button" className="cm-act" onClick={onEdit}>수정</button>
                        <button type="button" className="cm-act" onClick={onDelete} disabled={busy}>삭제</button>
                    </>
                ) : mode === 'hidden' ? null : <button type="button" className="cm-act" onClick={onReport}>신고</button>}
            </footer>
        </article>
    );
}

export default PostView;
