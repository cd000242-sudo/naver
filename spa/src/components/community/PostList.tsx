import { Link } from 'react-router-dom';
import type { PostItem } from '../../lib/communityData';
import {
    SORTS, boardLabel, communityPath, formatPostDate, pageNumbers,
    type BoardConfig, type SortKey,
} from '../../lib/communityModel.mjs';
import { GradeBadge, StatusBadge } from './Badges';

type Props = {
    title: string;
    note?: string;
    /** The board of this view: 'all' or a board id. Links keep it so "back" returns here. */
    boardId: string;
    boards: readonly BoardConfig[];
    pinned: PostItem[];
    posts: PostItem[];
    total: number;
    page: number;
    totalPages: number;
    sort: SortKey;
    loading?: boolean;
    error?: string;
    now?: number;
    onVisit: (post: PostItem) => void;
    onRetry?: () => void;
};

type RowProps = { post: PostItem; pinned: boolean; boardId: string; boards: readonly BoardConfig[]; sort: SortKey; now: number; onVisit: (post: PostItem) => void };

function PostRow({ post, pinned, boardId, boards, sort, now, onVisit }: RowProps) {
    return (
        <li className={`cm-row${pinned ? ' is-pin' : ''}`}>
            <span className="cm-row-board">
                {pinned ? <span className="cm-pin">{boardLabel(post.board, boards)}</span> : boardLabel(post.board, boards)}
            </span>
            <span className="cm-row-title">
                <Link className="cm-title" to={communityPath({ board: boardId, sort, post: post.id })}><span className="t">{post.title}</span></Link>
                {post.comments > 0 ? <em className="cm-cmt">[{post.comments}]</em> : null}
            </span>
            <span className="cm-row-author">
                <GradeBadge grade={post.grade} isOperator={post.isOperator} />
                <span className="cm-nick">{post.nickname}</span>
            </span>
            <span className="cm-row-time">{formatPostDate(post.createdAt, now)}</span>
            <span className="cm-row-num cm-views"><i>조회 </i>{post.views}</span>
            <span className="cm-row-num"><i>좋아요 </i>{post.likes}</span>
            <span className="cm-row-end">
                {post.board === 'promo'
                    ? <button type="button" className="cm-visit" onClick={() => onVisit(post)}><b>{post.visits}</b>들르기</button>
                    : <StatusBadge board={post.board} status={post.status} />}
            </span>
        </li>
    );
}

/** The board table: sorts, rows (pinned first), pager. Sorting and paging are links, so back/forward work. */
function PostList({ title, note, boardId, boards, pinned, posts, total, page, totalPages, sort, loading, error, now = Date.now(), onVisit, onRetry }: Props) {
    const empty = !loading && !error && pinned.length === 0 && posts.length === 0;
    return (
        <section className="lp-box cm-board" aria-labelledby="cm-board-title">
            <div className="cm-board-head">
                <h2 id="cm-board-title">{title}</h2>
                <span className="cm-count">{total}개</span>
                <nav className="cm-sorts" aria-label="정렬">
                    {SORTS.map((entry) => (
                        <Link
                            key={entry.key}
                            className={`cm-sort${entry.key === sort ? ' on' : ''}`}
                            to={communityPath({ board: boardId, sort: entry.key })}
                            aria-current={entry.key === sort ? 'true' : undefined}
                        >{entry.label}</Link>
                    ))}
                </nav>
            </div>
            {note ? <p className="cm-note">{note}</p> : null}
            <div className="cm-thead" aria-hidden="true">
                <span>게시판</span><span>제목</span><span>글쓴이</span><span>작성일</span><span className="cm-views">조회</span><span>좋아요</span><span />
            </div>
            {loading ? <p className="cm-empty" role="status">불러오는 중입니다…</p> : null}
            {error ? (
                <div className="cm-empty" role="alert">
                    <p>{error}</p>
                    {onRetry ? <button type="button" className="lp-btn lp-btn-line lp-btn-sm" onClick={onRetry}>다시 불러오기</button> : null}
                </div>
            ) : null}
            {empty ? <p className="cm-empty">아직 올라온 글이 없어요. 첫 글을 남겨 보세요.</p> : null}
            <ul className="cm-rows">
                {pinned.map((post) => <PostRow key={`pin-${post.id}`} post={post} pinned boardId={boardId} boards={boards} sort={sort} now={now} onVisit={onVisit} />)}
                {posts.map((post) => <PostRow key={post.id} post={post} pinned={false} boardId={boardId} boards={boards} sort={sort} now={now} onVisit={onVisit} />)}
            </ul>
            {totalPages > 1 ? (
                <nav className="cm-pager" aria-label="쪽 이동">
                    {pageNumbers(page, totalPages).map((number) => (
                        <Link
                            key={number}
                            className={`cm-pg${number === page ? ' on' : ''}`}
                            to={communityPath({ board: boardId, sort, page: number })}
                            aria-label={`${number}쪽`}
                            aria-current={number === page ? 'page' : undefined}
                        >{number}</Link>
                    ))}
                </nav>
            ) : null}
        </section>
    );
}

export default PostList;
