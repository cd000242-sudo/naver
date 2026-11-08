import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listMyPosts } from '../../lib/communityAccount';
import type { PostItem } from '../../lib/communityData';
import { boardLabel, boardList, communityPath, formatPostDate, pageNumbers } from '../../lib/communityModel.mjs';
import { pickRowThumb } from '../../lib/communityThumb.mjs';
import { StatusBadge } from '../community/Badges';
import PostThumb from '../community/PostThumb';

type ListProps = {
    posts: PostItem[];
    page: number;
    totalPages: number;
    total: number;
    loading: boolean;
    error: string;
    onPage: (page: number) => void;
    onRetry: () => void;
};

const BOARDS = boardList(null);

/** My posts, newest first. Each row opens the post inside the community. */
export function MyPostsList({ posts, page, totalPages, total, loading, error, onPage, onRetry }: ListProps) {
    return (
        <div className="me-posts">
            {loading ? <p className="me-empty" role="status">불러오는 중입니다…</p> : null}
            {error ? (
                <div className="me-empty" role="alert">
                    <p>{error}</p>
                    <button type="button" className="lp-btn lp-btn-line lp-btn-sm" onClick={onRetry}>다시 불러오기</button>
                </div>
            ) : null}
            {!loading && !error && posts.length === 0 ? (
                <div className="me-empty">
                    <p>아직 쓴 글이 없어요.</p>
                    <Link className="lp-btn lp-btn-line lp-btn-sm" to={communityPath({ write: true })}>글쓰기</Link>
                </div>
            ) : null}
            <ul className="me-post-list">
                {posts.map((post) => {
                    const thumb = pickRowThumb(post);
                    return (
                        <li key={post.id} className={`me-post${thumb.has ? ' has-thumb' : ''}`}>
                            <span className="me-post-head">
                                <Link className="me-post-title" to={communityPath({ board: post.board, post: post.id })}>{post.title}</Link>
                                {post.comments > 0 ? <em className="me-cmt">[{post.comments}]</em> : null}
                            </span>
                            <span className="me-post-meta">{boardLabel(post.board, BOARDS)} · {formatPostDate(post.createdAt)}</span>
                            <StatusBadge board={post.board} status={post.status} />
                            {thumb.has ? (
                                <Link className="me-post-thumb" to={communityPath({ board: post.board, post: post.id })} tabIndex={-1} aria-hidden="true">
                                    <PostThumb postId={post.id} thumbId={thumb.id} thumbUrl={thumb.url} />
                                </Link>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
            {total > 0 ? <p className="me-total">모두 {total}개</p> : null}
            {totalPages > 1 ? (
                <nav className="me-pager" aria-label="쪽 이동">
                    {pageNumbers(page, totalPages).map((number) => (
                        <button key={number} type="button" className={`me-pg${number === page ? ' on' : ''}`} aria-label={`${number}쪽`}
                            aria-current={number === page ? 'page' : undefined} onClick={() => onPage(number)}>{number}</button>
                    ))}
                </nav>
            ) : null}
        </div>
    );
}

type State = { posts: PostItem[]; totalPages: number; total: number; loading: boolean; error: string };

/** Loads one page at a time from the server (`community-my-posts`). */
function MyPosts() {
    const [page, setPage] = useState(1);
    const [reload, setReload] = useState(0);
    const [state, setState] = useState<State>({ posts: [], totalPages: 1, total: 0, loading: true, error: '' });

    useEffect(() => {
        let alive = true;
        setState((previous) => ({ ...previous, loading: true, error: '' }));
        void listMyPosts(page).then((result) => {
            if (!alive) return;
            setState(result.ok
                ? { posts: result.posts, totalPages: result.totalPages, total: result.total, loading: false, error: '' }
                : { posts: [], totalPages: 1, total: 0, loading: false, error: result.message });
        });
        return () => { alive = false; };
    }, [page, reload]);

    return <MyPostsList {...state} page={page} onPage={setPage} onRetry={() => setReload((value) => value + 1)} />;
}

export default MyPosts;
