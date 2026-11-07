import { Link } from 'react-router-dom';
import type { PostItem } from '../../lib/communityData';
import { communityPath } from '../../lib/communityModel.mjs';

/** This week's most-liked posts across every board: a ranked two-column list. */
function WeeklyTop({ posts, boardId }: { posts: PostItem[]; boardId: string }) {
    return (
        <section className="lp-box cm-best" aria-labelledby="cm-best-title">
            <div className="cm-best-head">
                <h2 id="cm-best-title">이번 주 인기글</h2>
                <span>좋아요 많은 순</span>
            </div>
            {posts.length === 0 ? (
                <p className="cm-empty-sm">아직 이번 주 인기글이 없어요.</p>
            ) : (
                <ol className="cm-best-list">
                    {posts.map((post, index) => (
                        <li key={post.id}>
                            <Link to={communityPath({ board: boardId, post: post.id })}>
                                <span className={index < 3 ? 'cm-rank cm-rank-top' : 'cm-rank'}>{index + 1}</span>
                                <span className="t">{post.title}</span>
                                <em>{post.likes}</em>
                            </Link>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

export default WeeklyTop;
