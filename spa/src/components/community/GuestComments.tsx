import { Link } from 'react-router-dom';
import { loginPath } from '../../lib/siteAuthModel.mjs';

type Props = {
    /** false = comments are closed on this post (a notice, for one): nothing is drawn, as for a member. */
    commentable: boolean;
    /** Where the login comes back to (this post). */
    next: string;
};

/** The comment place of a post for a guest: comments are for members, so one line and the login button. */
function GuestComments({ commentable, next }: Props) {
    if (!commentable) return null;
    return (
        <section className="lp-box cm-cmts cm-guest-cmts" aria-label="댓글">
            <p>로그인하면 댓글을 볼 수 있어요</p>
            <Link className="lp-btn lp-btn-dark" to={loginPath(next)}>로그인</Link>
        </section>
    );
}

export default GuestComments;
