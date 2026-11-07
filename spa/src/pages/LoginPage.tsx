import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthField from '../components/auth/AuthField';
import AuthShell from '../components/auth/AuthShell';
import { loginCommunity } from '../lib/communityAuth';
import { afterAuthPath, safeNextPath, signupPath, validateLogin } from '../lib/siteAuthModel.mjs';
import { useSiteSession } from '../lib/useSiteSession';

const KAKAO_HELP_URL = 'https://open.kakao.com/o/sPcaslwh';

/** /login — the one login window of the site (community and LEWORD share it). */
function LoginPage() {
    const [params] = useSearchParams();
    const next = safeNextPath(params.get('next') || '');
    const navigate = useNavigate();
    const site = useSiteSession();
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const previous = document.title;
        document.title = '로그인 — Leaders Pro';
        return () => { document.title = previous; };
    }, []);

    // Already logged in (or just did): go where the person was heading.
    useEffect(() => {
        if (site.community) navigate(afterAuthPath(next), { replace: true });
    }, [site.community, next, navigate]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        const problem = validateLogin({ userId, password });
        if (problem) { setError(problem); return; }
        setBusy(true);
        setError('');
        const result = await loginCommunity(userId, password);
        setBusy(false);
        if (result.ok) {
            setPassword('');
            navigate(afterAuthPath(next), { replace: true });
        } else {
            setError(result.message);
        }
    };

    return (
        <AuthShell title="로그인" sub="LEWORD 아이디가 있다면 그대로 쓰세요. 한 번 로그인하면 커뮤니티와 LEWORD 가 같이 열려요.">
            <form className="au-form" onSubmit={(event) => { void submit(event); }} noValidate>
                <AuthField label="아이디" type="text" name="userId" autoComplete="username" autoCapitalize="none" spellCheck={false}
                    value={userId} onChange={(event) => setUserId(event.target.value)} />
                <AuthField label="비밀번호" type="password" name="password" autoComplete="current-password"
                    value={password} onChange={(event) => setPassword(event.target.value)} />
                {error ? <p className="lp-error" role="alert">{error}</p> : null}
                <button type="submit" className="lp-btn lp-btn-dark lp-btn-full" disabled={busy}>{busy ? '로그인하는 중…' : '로그인'}</button>
            </form>
            <div className="au-links">
                <Link to={signupPath(next)}>처음이에요 · 회원가입</Link>
            </div>
            <p className="au-help">비밀번호를 잊으셨나요? <a href={KAKAO_HELP_URL} target="_blank" rel="noopener noreferrer">카카오톡으로 문의</a>해 주세요.</p>
        </AuthShell>
    );
}

export default LoginPage;
