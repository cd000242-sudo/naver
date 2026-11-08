import { Link } from 'react-router-dom';
import type { PostItem } from '../../lib/communityData';
import { boardLabel, communityPath, type BoardConfig } from '../../lib/communityModel.mjs';
import { pickRowThumb } from '../../lib/communityThumb.mjs';
import { boardTone, rankBadge, type TopCell } from '../../lib/communityTopGrid.mjs';
import PostThumb from './PostThumb';

type Props = { cell: TopCell<PostItem>; boardId: string; boards: readonly BoardConfig[] };

/** One of the five big cards: a picture (or a board-coloured tile with the title), the rank, the title and the numbers. */
function TopCard({ cell, boardId, boards }: Props) {
    const { item: post, rank, zone, col, row, colSpan, rowSpan } = cell;
    const thumb = pickRowThumb(post);
    const classes = ['cm-top-card', zone === 'hero' ? 'is-hero' : '', rowSpan > 1 ? 'is-tall' : '', colSpan > 2 ? 'is-wide' : ''].filter(Boolean).join(' ');
    return (
        <Link
            className={classes}
            data-rank={rank}
            to={communityPath({ board: boardId, post: post.id })}
            style={{ gridColumn: `${col} / span ${colSpan}`, gridRow: `${row} / span ${rowSpan}` }}
        >
            <span className="cm-top-media">
                {thumb.has
                    ? <PostThumb postId={post.id} thumbId={thumb.id} thumbUrl={thumb.url} />
                    : <span className={`cm-top-tile is-tone-${boardTone(post.board)}`}><span className="cm-top-title">{post.title}</span></span>}
                <b className={`cm-top-rank is-${rankBadge(rank)}`} aria-label={`${rank}위`}>{rank}</b>
            </span>
            <span className="cm-top-body">
                {thumb.has ? <span className="cm-top-title">{post.title}</span> : null}
                <span className="cm-top-meta">
                    <span className="cm-top-board">{boardLabel(post.board, boards)}</span>
                    <span className="cm-top-stat" aria-label={`좋아요 ${post.likes}`}>♥ {post.likes}</span>
                    <span className="cm-top-stat" aria-label={`댓글 ${post.comments}`}>💬 {post.comments}</span>
                </span>
            </span>
        </Link>
    );
}

export default TopCard;
