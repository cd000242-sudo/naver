import { Link } from 'react-router-dom';
import type { PostItem } from '../../lib/communityData';
import { boardLabel, formatPostDate, type BoardConfig } from '../../lib/communityModel.mjs';
import { useAvatars } from '../../lib/useAvatars';
import Avatar from './Avatar';
import { GradeBadge, NoticeBadge, StatusBadge } from './Badges';

type Props = { post: PostItem; boards: readonly BoardConfig[]; back: string; now?: number };

/**
 * What the list already told us about a post (title, author, date, summary), drawn while the full text is read.
 * No buttons: like, report and edit wait for the real post, so nothing can be done on stale numbers.
 */
function PostPreview({ post, boards, back, now = Date.now() }: Props) {
    const photos = useAvatars([post.avatarKey]);
    return (
        <div className="cm-detail">
            <Link className="cm-back" to={back}>← 목록으로</Link>
            <article className="lp-box cm-post" aria-busy="true">
                <header className="cm-post-head">
                    <div className="cm-post-meta">
                        {post.notice ? <NoticeBadge kind={post.noticeBadge} /> : null}
                        <span className="cm-board-tag">{boardLabel(post.board, boards)}</span>
                        <StatusBadge board={post.board} status={post.status} />
                    </div>
                    <h1 className="cm-post-title">{post.title}</h1>
                    <div className="cm-post-by">
                        <Avatar name={post.nickname} src={photos[post.avatarKey]} size={36} />
                        <GradeBadge grade={post.grade} isOperator={post.isOperator} />
                        <b className="cm-nick">{post.nickname}</b>
                        <time>{formatPostDate(post.createdAt, now)}</time>
                    </div>
                </header>
                {post.excerpt ? <p className="cm-preview-excerpt">{post.excerpt}</p> : null}
                <div className="cm-body-wait" role="status" aria-live="polite">
                    <span className="cm-skel-msg">본문을 불러오는 중이에요</span>
                    <i className="cm-skel-bar" aria-hidden="true" />
                    <i className="cm-skel-bar is-short" aria-hidden="true" />
                </div>
            </article>
        </div>
    );
}

export default PostPreview;
