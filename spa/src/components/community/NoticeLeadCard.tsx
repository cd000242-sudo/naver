import { Link } from 'react-router-dom';
import type { PostItem } from '../../lib/communityData';
import { communityPath, formatPostDate, type SortKey } from '../../lib/communityModel.mjs';
import { pickRowThumb } from '../../lib/communityThumb.mjs';
import { useNoticeLeadBody, type NoticeBody } from '../../lib/useNoticeLeadBody';
import Avatar from './Avatar';
import { GradeBadge, NoticeBadge } from './Badges';
import PostThumb from './PostThumb';
import RichBody from './RichBody';
import './community-notice-lead.css';

type Props = {
    post: PostItem;
    /** The board of the view; the link keeps it (and the sort) so "back" returns here. */
    boardId: string;
    sort: SortKey;
    now: number;
    avatars: Record<string, string>;
};

/**
 * The top post of 공지사항 drawn open: badge, the whole title, author and date, then the body. Until `detail` (the body
 * of the post read) is there the excerpt stands in; nothing is ever cut. [글 보기] opens the post with its comments.
 */
export function NoticeLeadView({ post, boardId, sort, now, avatars, detail }: Props & { detail: NoticeBody | null }) {
    const thumb = pickRowThumb(post);
    const rich = detail?.format === 'rich';
    const excerpt = (post.excerpt || '').trim();
    return (
        <li className="cm-nlead">
            <div className="cm-nlead-head">
                {post.notice ? <span className="cm-nlead-flags"><NoticeBadge kind={post.noticeBadge} /></span> : null}
                <h3 className="cm-nlead-title">{post.title}</h3>
                <div className="cm-nlead-meta">
                    <span className="cm-nlead-author">
                        <Avatar name={post.nickname} src={avatars[post.avatarKey]} size={28} />
                        <GradeBadge grade={post.grade} isOperator={post.isOperator} />
                        <span className="cm-nick">{post.nickname}</span>
                    </span>
                    <span className="cm-nlead-stat">{formatPostDate(post.createdAt, now)}</span>
                </div>
            </div>
            {thumb.has && !rich ? (
                <span className="cm-nlead-media" aria-hidden="true">
                    <PostThumb postId={post.id} thumbId={thumb.id} thumbUrl={thumb.url} />
                </span>
            ) : null}
            {detail
                ? rich ? <RichBody postId={post.id} body={detail.body} /> : <div className="cm-body">{detail.body}</div>
                : excerpt ? <p className="cm-nlead-excerpt">{excerpt}</p> : null}
            <Link className="lp-btn lp-btn-line lp-btn-sm cm-nlead-go" to={communityPath({ board: boardId, sort, post: post.id })}>글 보기</Link>
        </li>
    );
}

/** The open card with its body read once per post id; the list is drawn first and never waits. */
function NoticeLeadCard(props: Props) {
    const detail = useNoticeLeadBody(props.post.id);
    return <NoticeLeadView {...props} detail={detail} />;
}

export default NoticeLeadCard;
