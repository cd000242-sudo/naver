import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthField from '../components/auth/AuthField';
import AuthShell from '../components/auth/AuthShell';
import PhoneCodeFields from '../components/auth/PhoneCodeFields';
import { sendSignupCode } from '../lib/communityAccount';
import { signupCommunity } from '../lib/communityAuth';
import { PHONE_PROMISE } from '../lib/phoneAuthModel.mjs';
import { afterAuthPath, loginPath, safeNextPath, validateSignupWithPhone } from '../lib/siteAuthModel.mjs';
import { useCodeSender } from '../lib/useCodeSender';
import { useSiteSession } from '../lib/useSiteSession';

const EMPTY_FORM = { userId: '', password: '', passwordConfirm: '', nickname: '', phone: '', code: '' };

/** /signup — community membership. A verified phone number is required (one number, one account). */
function SignupPage() {
    const [params] = useSearchParams();
    const next = safeNextPath(params.get('next') || '');
    const navigate = useNavigate();
    const site = useSiteSession();
    const [form, setForm] = useState(EMPTY_FORM);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const sender = useCodeSender(sendSignupCode, form.phone);
    const update = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
    const set = (key: 'phone' | 'code') => (value: string) => setForm((previous) => ({ ...previous, [key]: value }));

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
        const problem = validateSignupWithPhone(form);
        if (problem) { setError(problem); return; }
        setBusy(true);
        setError('');
        const result = await signupCommunity(form);
        setBusy(false);
        if (result.ok) {
            setForm((previous) => ({ ...previous, password: '', passwordConfirm: '', code: '' }));
            navigate(afterAuthPath(next), { replace: true });
            return;
        }
        // A used-up or timed-out code cannot be retried: ask for a fresh one (after the wait, when the server locked the number).
        if (result.kind === 'expired') { sender.reset(); set('code')(''); }
        if (result.kind === 'wait') { sender.hold(result.retryAfterSec ?? 0); set('code')(''); }
        setError(result.message);
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
                <PhoneCodeFields phone={form.phone} code={form.code} onPhone={set('phone')} onCode={set('code')} sender={sender}
                    hint={PHONE_PROMISE} links={[{ kind: 'taken', to: loginPath(next), label: '로그인하러 가기' }]} />
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
