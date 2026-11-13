import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthField from '../components/auth/AuthField';
import AuthShell from '../components/auth/AuthShell';
import PasswordRecovery from '../components/auth/PasswordRecovery';
import { PhoneVerifyPanel } from '../components/leword/LewordAuth';
import { resetTabFrom } from '../lib/accountModel.mjs';
import { loginCommunity } from '../lib/communityAuth';
import { afterAuthPath, safeNextPath, signupPath, validateLogin } from '../lib/siteAuthModel.mjs';
import { useSiteSession } from '../lib/useSiteSession';
import { ShellIcon } from '../components/ShellIcons';

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
    // /login?view=reset | phone open a recovery screen directly (also for a logged-in license member sent here from /me).
    const [view, setView] = useState<'login' | 'phone' | 'pwreset'>(params.get('view') === 'reset' ? 'pwreset' : params.get('view') === 'phone' ? 'phone' : 'login');
    const leaveRecovery = () => (site.community ? navigate('/me') : setView('login'));

    useEffect(() => {
        const previous = document.title;
        document.title = '로그인 — Leaders Pro';
        return () => { document.title = previous; };
    }, []);

    // Already logged in (or just did): go where the person was heading. The recovery screens stay open.
    useEffect(() => {
        if (site.community && view === 'login') navigate(afterAuthPath(next), { replace: true });
    }, [site.community, view, next, navigate]);

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

    if (view === 'phone') {
        return (
            <AuthShell title="본인인증" sub="휴대폰 번호를 등록해 두면 비밀번호를 혼자 바꿀 수 있어요.">
                <div className="au-reset"><PhoneVerifyPanel defaultUserId={userId || site.community?.userId || ''} onBack={leaveRecovery} /></div>
            </AuthShell>
        );
    }
    if (view === 'pwreset') {
        return (
            <AuthShell title="비밀번호 변경" sub="본인인증한 휴대폰으로 확인한 뒤 새 비밀번호를 정해요.">
                <PasswordRecovery defaultUserId={userId || site.community?.userId || ''} initialTab={resetTabFrom(params.get('tab'))}
                    onBack={leaveRecovery} />
            </AuthShell>
        );
    }

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
            <div className="au-recover">
                <button type="button" className="lp-btn lp-btn-line lp-btn-full" onClick={() => { setView('pwreset'); setError(''); }}><ShellIcon name="key" size={18} />비밀번호 변경</button>
                <button type="button" className="lp-btn lp-btn-line lp-btn-full" onClick={() => { setView('phone'); setError(''); }}><ShellIcon name="phone" size={18} />본인인증</button>
            </div>
            <p className="au-help">비밀번호 변경은 휴대폰 인증을 한 계정만 돼요. 안 되면 <a href={KAKAO_HELP_URL} target="_blank" rel="noopener noreferrer">카카오톡으로 문의</a>해 주세요.</p>
        </AuthShell>
    );
}

export default LoginPage;
