import { Link } from 'react-router-dom';
import { loginPath, signupPath } from '../../lib/siteAuthModel.mjs';

/** Side column of a guest, in place of "my activity": the login and the sign-up, coming back to this screen. */
function GuestSideCard({ next }: { next: string }) {
    return (
        <section className="lp-box cm-me cm-guest-card" aria-labelledby="cm-guest-title">
            <h2 id="cm-guest-title">로그인하고 함께해요</h2>
            <p>글쓰기·댓글·좋아요는 로그인 뒤에 돼요.</p>
            <div className="cm-guest-actions">
                <Link className="lp-btn lp-btn-dark" to={loginPath(next)}>로그인</Link>
                <Link className="lp-btn lp-btn-line" to={signupPath(next)}>회원가입</Link>
            </div>
        </section>
    );
}

export default GuestSideCard;
