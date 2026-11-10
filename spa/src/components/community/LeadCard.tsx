import { Link } from 'react-router-dom';
import type { PostItem } from '../../lib/communityData';
import { communityPath, formatPostDate, type SortKey } from '../../lib/communityModel.mjs';
import { pickRowThumb } from '../../lib/communityThumb.mjs';
import Avatar from './Avatar';
import { GradeBadge, NoticeBadge } from './Badges';
import PostThumb from './PostThumb';
import RowMenu from './RowMenu';
import './community-lead.css';

type Props = {
    post: PostItem;
    /** The board of the view; the link keeps it (and the sort) so "back" returns here. */
    boardId: string;
    sort: SortKey;
    now: number;
    /** The viewer is an owner: a hidden post and open reports are marked. */
    moderator: boolean;
    avatars: Record<string, string>;
    onReport?: (post: PostItem) => void;
    reportMode?: (post: PostItem) => 'hidden' | 'login' | 'report';
};

/**
 * The first post of 최근 소식 as one big card: the picture (a post without one is a text-only card), the title, the
 * summary when the server sent one, and the author and numbers. The title is the card's only link; its ::after covers
 * the whole card, so the card is clickable while the row menu (a button) stays a sibling, never inside the link.
 */
function LeadCard({ post, boardId, sort, now, moderator, avatars, onReport, reportMode }: Props) {
    const thumb = pickRowThumb(post);
    const flagged = post.notice || (moderator && (post.hidden || post.openReports > 0));
    return (
        <li className={`cm-lead${thumb.has ? '' : ' is-plain'}`}>
            {thumb.has ? (
                <span className="cm-lead-media" aria-hidden="true">
                    <PostThumb postId={post.id} thumbId={thumb.id} thumbUrl={thumb.url} />
                </span>
            ) : null}
            <div className="cm-lead-body">
                {flagged ? (
                    <span className="cm-lead-flags">
                        {post.notice ? <NoticeBadge kind={post.noticeBadge} /> : null}
                        {moderator && post.hidden ? <span className="lp-state lp-state-wait">숨김</span> : null}
                        {moderator && post.openReports > 0 ? <span className="lp-state lp-state-report">신고 {post.openReports}</span> : null}
                    </span>
                ) : null}
                <h3 className="cm-lead-title">
                    <Link className="cm-lead-link" to={communityPath({ board: boardId, sort, post: post.id })}><span className="cm-lead-t">{post.title}</span></Link>
                </h3>
                {post.excerpt ? <p className="cm-lead-excerpt">{post.excerpt}</p> : null}
                <div className="cm-lead-meta">
                    <span className="cm-lead-author">
                        <Avatar name={post.nickname} src={avatars[post.avatarKey]} size={28} />
                        <GradeBadge grade={post.grade} isOperator={post.isOperator} />
                        <span className="cm-nick">{post.nickname}</span>
                    </span>
                    <span className="cm-lead-stat">{formatPostDate(post.createdAt, now)}</span>
                    {post.notice ? null : <span className="cm-lead-stat">조회 {post.views}</span>}
                    <span className="cm-lead-stat">좋아요 {post.likes}</span>
                    <span className="cm-lead-stat">댓글 {post.comments}</span>
                    {onReport && reportMode && reportMode(post) !== 'hidden' ? <span className="cm-lead-more"><RowMenu post={post} onReport={onReport} /></span> : null}
                </div>
            </div>
        </li>
    );
}

export default LeadCard;
