import { Link } from 'react-router-dom';
import { loginPath, signupPath } from '../../lib/siteAuthModel.mjs';
import '../../styles/light-page.css';
import './auth.css';

type Props = {
    area: 'community' | 'leword';
    /** Where to come back to after logging in (same-site path). */
    next: string;
    /** The visitor has only an old LEWORD login, which does not open the community. */
    legacy?: boolean;
    /** Extra line from the server (e.g. "your login expired"). Drawn as text. */
    message?: string;
};

const COPY = {
    community: '커뮤니티는 로그인한 분만 볼 수 있어요. 글쓰기·댓글·좋아요도 로그인 뒤에 돼요.',
    communityLegacy: '지금 로그인은 LEWORD 전용이라 커뮤니티가 아직 안 열려요. 한 번 더 로그인하면 둘 다 열려요.',
    leword: 'LEWORD 는 로그인한 분만 쓸 수 있어요. 한 번 로그인하면 커뮤니티와 LEWORD 가 같이 열려요.',
};

/** "Log in first" screen shown in place of a protected page. */
function LoginRequired({ area, next, legacy = false, message = '' }: Props) {
    const lead = area === 'leword' ? COPY.leword : legacy ? COPY.communityLegacy : COPY.community;
    return (
        <div className="lp">
            <div className="lp-wrap au-main">
                <section className="lp-box au-gate" aria-labelledby="login-required-title">
                    <div className="au-gate-icon" aria-hidden="true">{area === 'leword' ? 'L' : '●'}</div>
                    <h1 id="login-required-title">로그인이 필요해요</h1>
                    <p className="au-sub">{lead}</p>
                    {message ? <p className="lp-note" role="status">{message}</p> : null}
                    <div className="au-actions">
                        <Link className="lp-btn lp-btn-dark lp-btn-full" to={loginPath(next)}>로그인</Link>
                        <Link className="lp-btn lp-btn-line lp-btn-full" to={signupPath(next)}>회원가입</Link>
                    </div>
                    {area === 'leword' ? (
                        <p className="au-help">가입하면 커뮤니티를 쓸 수 있어요. LEWORD 는 이용권이 있어야 해요.</p>
                    ) : null}
                </section>
            </div>
        </div>
    );
}

export default LoginRequired;
