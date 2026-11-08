import { Link } from 'react-router-dom';
import type { PostItem } from '../../lib/communityData';
import {
    SORTS, boardLabel, communityPath, formatPostDate, pageNumbers,
    type BoardConfig, type SortKey,
} from '../../lib/communityModel.mjs';
import { GradeBadge, NoticeBadge, StatusBadge } from './Badges';

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
    /** Nothing to draw yet (first visit): grey bars instead of rows. */
    loading?: boolean;
    /** A fresh read is under way while rows are drawn: a small sign, the rows stay. */
    refreshing?: boolean;
    /** The reader's own posts that are being sent (or failed), drawn above the server's rows. */
    local?: PostItem[];
    onRetryLocal?: (post: PostItem) => void;
    onDiscardLocal?: (post: PostItem) => void;
    error?: string;
    now?: number;
    /** The viewer is an owner: hidden posts and posts with open reports are marked. */
    moderator?: boolean;
    onVisit: (post: PostItem) => void;
    onRetry?: () => void;
};

type RowProps = {
    post: PostItem; pinned: boolean; boardId: string; boards: readonly BoardConfig[]; sort: SortKey; now: number; moderator: boolean;
    onVisit: (post: PostItem) => void; onRetryLocal?: (post: PostItem) => void; onDiscardLocal?: (post: PostItem) => void;
};

/** The right-hand cell of a post the reader is sending: its state, and the resend when it failed. */
function LocalState({ post, onRetryLocal, onDiscardLocal }: Pick<RowProps, 'post' | 'onRetryLocal' | 'onDiscardLocal'>) {
    if (post.delivery === 'sending') return <span className="cm-sending" role="status">보내는 중</span>;
    return (
        <span className="cm-resend">
            <button type="button" className="cm-act" onClick={() => onRetryLocal?.(post)}>다시 보내기</button>
            <button type="button" className="cm-act" onClick={() => onDiscardLocal?.(post)}>지우기</button>
        </span>
    );
}

function PostRow({ post, pinned, boardId, boards, sort, now, moderator, onVisit, onRetryLocal, onDiscardLocal }: RowProps) {
    return (
        <li className={`cm-row${pinned ? ' is-pin' : ''}${post.delivery ? ` is-${post.delivery}` : ''}`}>
            <span className="cm-row-board">
                {pinned ? <span className="cm-pin">{boardLabel(post.board, boards)}</span> : boardLabel(post.board, boards)}
            </span>
            <span className="cm-row-title">
                {post.notice ? <NoticeBadge kind={post.noticeBadge} /> : null}
                {moderator && post.hidden ? <span className="lp-state lp-state-wait">숨김</span> : null}
                {moderator && post.openReports > 0 ? <span className="lp-state lp-state-report">신고 {post.openReports}</span> : null}
                {post.delivery
                    ? <span className="cm-title"><span className="t">{post.title}</span></span>
                    : <Link className="cm-title" to={communityPath({ board: boardId, sort, post: post.id })}><span className="t">{post.title}</span></Link>}
                {post.comments > 0 ? <em className="cm-cmt">[{post.comments}]</em> : null}
                {post.delivery === 'failed' && post.failure ? <span className="cm-row-fail" role="alert">{post.failure}</span> : null}
            </span>
            <span className="cm-row-author">
                <GradeBadge grade={post.grade} isOperator={post.isOperator} />
                <span className="cm-nick">{post.nickname}</span>
            </span>
            <span className="cm-row-time">{formatPostDate(post.createdAt, now)}</span>
            <span className="cm-row-num cm-views">{post.notice ? null : <><i>조회 </i>{post.views}</>}</span>
            <span className="cm-row-num"><i>좋아요 </i>{post.likes}</span>
            <span className="cm-row-end">
                {post.delivery
                    ? <LocalState post={post} onRetryLocal={onRetryLocal} onDiscardLocal={onDiscardLocal} />
                    : post.board === 'promo'
                    ? <button type="button" className="cm-visit" onClick={() => onVisit(post)}><b>{post.visits}</b>들르기</button>
                    : <StatusBadge board={post.board} status={post.status} />}
            </span>
        </li>
    );
}

/** The board table: sorts, rows (pinned first), pager. Sorting and paging are links, so back/forward work. */
function Skeleton() {
    return (
        <div className="cm-skel" role="status" aria-live="polite" aria-busy="true">
            <p className="cm-skel-msg">불러오는 중이에요</p>
            <ul className="cm-skel-rows" aria-hidden="true">
                {Array.from({ length: 7 }, (_, index) => <li key={index} className="cm-skel-row"><i className="cm-skel-bar" /><i className="cm-skel-bar is-short" /></li>)}
            </ul>
        </div>
    );
}

function PostList({ title, note, boardId, boards, pinned, posts, total, page, totalPages, sort, loading, refreshing = false, local = [], onRetryLocal, onDiscardLocal, error, now = Date.now(), moderator = false, onVisit, onRetry }: Props) {
    const empty = !loading && !error && local.length === 0 && pinned.length === 0 && posts.length === 0;
    const rowProps = { boardId, boards, sort, now, moderator, onVisit };
    return (
        <section className="lp-box cm-board" aria-labelledby="cm-board-title">
            <div className="cm-board-head">
                <h2 id="cm-board-title">{title}</h2>
                <span className="cm-count">{total}개</span>
                <span className={`cm-refresh${refreshing ? ' on' : ''}`} role="status" aria-live="polite">{refreshing ? '새로 불러오는 중' : <span aria-hidden="true">새로 불러오는 중</span>}</span>
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
            {loading ? <Skeleton /> : null}
            {error ? (
                <div className="cm-empty" role="alert">
                    <p>{error}</p>
                    {onRetry ? <button type="button" className="lp-btn lp-btn-line lp-btn-sm" onClick={onRetry}>다시 불러오기</button> : null}
                </div>
            ) : null}
            {empty ? <p className="cm-empty">아직 올라온 글이 없어요. 첫 글을 남겨 보세요.</p> : null}
            <ul className="cm-rows" aria-busy={refreshing || undefined}>
                {local.map((post) => <PostRow key={`local-${post.id}`} post={post} pinned={false} {...rowProps} onRetryLocal={onRetryLocal} onDiscardLocal={onDiscardLocal} />)}
                {pinned.map((post) => <PostRow key={`pin-${post.id}`} post={post} pinned {...rowProps} />)}
                {posts.map((post) => <PostRow key={post.id} post={post} pinned={false} {...rowProps} />)}
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
