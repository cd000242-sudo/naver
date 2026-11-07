import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthField from '../components/auth/AuthField';
import AuthShell from '../components/auth/AuthShell';
import { signupCommunity } from '../lib/communityAuth';
import { afterAuthPath, loginPath, safeNextPath, validateSignup } from '../lib/siteAuthModel.mjs';
import { useSiteSession } from '../lib/useSiteSession';

/** /signup — community membership. No license needed; LEWORD and the other products need one. */
function SignupPage() {
    const [params] = useSearchParams();
    const next = safeNextPath(params.get('next') || '');
    const navigate = useNavigate();
    const site = useSiteSession();
    const [form, setForm] = useState({ userId: '', password: '', passwordConfirm: '', nickname: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const update = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((previous) => ({ ...previous, [key]: event.target.value }));

    useEffect(() => {
        const previous = document.title;
        document.title = '회원가입 — Leaders Pro';
        return () => { document.title = previous; };
    }, []);

    useEffect(() => {
        if (site.community) navigate(afterAuthPath(next), { replace: true });
    }, [site.community, next, navigate]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        const problem = validateSignup(form);
        if (problem) { setError(problem); return; }
        setBusy(true);
        setError('');
        const result = await signupCommunity({ userId: form.userId, password: form.password, nickname: form.nickname });
        setBusy(false);
        if (result.ok) {
            setForm((previous) => ({ ...previous, password: '', passwordConfirm: '' }));
            navigate(afterAuthPath(next), { replace: true });
        } else {
            setError(result.message);
        }
    };

    return (
        <AuthShell title="회원가입" sub="가입하면 커뮤니티를 쓸 수 있어요. LEWORD 등 제품은 이용권이 있어야 해요.">
            <form className="au-form" onSubmit={(event) => { void submit(event); }} noValidate>
                <AuthField label="아이디" hint="글자·숫자와 _ . @ + - 만, 2자 이상" type="text" name="userId" autoComplete="username"
                    autoCapitalize="none" spellCheck={false} value={form.userId} onChange={update('userId')} />
                <AuthField label="비밀번호" hint="6자 이상" type="password" name="password" autoComplete="new-password"
                    value={form.password} onChange={update('password')} />
                <AuthField label="비밀번호 다시 입력" type="password" name="passwordConfirm" autoComplete="new-password"
                    value={form.passwordConfirm} onChange={update('passwordConfirm')} />
                <AuthField label="닉네임" hint="글과 댓글에 보여요. 2~12자" type="text" name="nickname" autoComplete="nickname"
                    value={form.nickname} onChange={update('nickname')} />
                {error ? <p className="lp-error" role="alert">{error}</p> : null}
                <button type="submit" className="lp-btn lp-btn-dark lp-btn-full" disabled={busy}>{busy ? '가입하는 중…' : '가입하고 시작하기'}</button>
            </form>
            <div className="au-links">
                <Link to={loginPath(next)}>이미 아이디가 있어요 · 로그인</Link>
            </div>
        </AuthShell>
    );
}

export default SignupPage;
