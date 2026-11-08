import { Link } from 'react-router-dom';
import type { PostItem } from '../../lib/communityData';
import { boardList, communityPath, type BoardConfig } from '../../lib/communityModel.mjs';
import { placeTopGrid, rankBadge, type TopLayout } from '../../lib/communityTopGrid.mjs';
import { useTopLayout } from '../../lib/useTopLayout';
import TopCard from './TopCard';
import './community-top.css';

type Props = {
    /** This week's top posts, best first (up to ten). */
    posts: PostItem[];
    /** The board of the current view; the links keep it so "back" returns here. */
    boardId: string;
    boards?: readonly BoardConfig[];
    /** Forces a grid (tests, captures); by default it follows the screen width. */
    layout?: TopLayout;
};

/**
 * "인기글" at the top of the community home (forum contract 1115 section B): rank 1 is a big card, ranks 2-5 cards
 * around it, ranks 6-10 a numbered list. On a phone the cards are full width, then two by two. Where each post goes is
 * decided by placeTopGrid; this only draws it. Server text is drawn as text.
 */
function TopGrid({ posts, boardId, boards = boardList(null), layout }: Props) {
    const detected = useTopLayout();
    const mode = layout ?? detected;
    const grid = placeTopGrid(posts, mode);
    return (
        <section className={`lp-box cm-top is-${mode}`} aria-labelledby="cm-top-title">
            <div className="cm-top-head">
                <h2 id="cm-top-title">인기글</h2>
                <span>이번 주 순위</span>
            </div>
            {grid.cards.length === 0 ? (
                <p className="cm-empty-sm">아직 이번 주 인기글이 없어요.</p>
            ) : (
                <>
                    <div className="cm-top-grid" style={{ gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))` }}>
                        {grid.cards.map((cell) => <TopCard key={cell.item.id} cell={cell} boardId={boardId} boards={boards} />)}
                    </div>
                    {grid.list.length > 0 ? (
                        <ol className="cm-top-list" start={6}>
                            {grid.list.map(({ item, rank }) => (
                                <li key={item.id}>
                                    <Link className="cm-top-row" data-rank={rank} to={communityPath({ board: boardId, post: item.id })}>
                                        <b className={`cm-top-rank is-${rankBadge(rank)}`} aria-label={`${rank}위`}>{rank}</b>
                                        <span className="t">{item.title}</span>
                                        <em aria-label={`좋아요 ${item.likes}`}>♥ {item.likes}</em>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    ) : null}
                </>
            )}
        </section>
    );
}

export default TopGrid;
