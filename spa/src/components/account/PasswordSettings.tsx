import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { resetPasswordPath, validatePasswordChange } from '../../lib/accountModel.mjs';
import { changeMyPassword } from '../../lib/communityAccount';
import AuthField from '../auth/AuthField';

const BLANK = { current: '', next: '', confirm: '' };

/** The server says this is a license account: its password lives on the login screen's license tab. */
export function LicensePasswordNotice() {
    return (
        <div className="au-form" role="status">
            <p className="lp-note">이용권 계정은 로그인 화면의 [비밀번호 변경]에서 바꿔요.</p>
            <Link className="lp-btn lp-btn-dark lp-btn-full" to={resetPasswordPath('license')}>비밀번호 변경 화면으로</Link>
        </div>
    );
}

/** Community members change the password here. Nothing typed is kept after the call. */
function PasswordSettings() {
    const [form, setForm] = useState(BLANK);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [license, setLicense] = useState(false);
    const input = (key: keyof typeof form) => (event: { target: { value: string } }) => {
        setDone(false);
        setForm((previous) => ({ ...previous, [key]: event.target.value }));
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        const problem = validatePasswordChange(form);
        if (problem) { setError(problem); return; }
        setBusy(true);
        setError('');
        const result = await changeMyPassword({ currentPassword: form.current, newPassword: form.next });
        setBusy(false);
        setForm(BLANK);
        if (result.ok) { setDone(true); return; }
        if (result.license) { setLicense(true); return; }
        setError(result.message);
    };

    if (license) return <LicensePasswordNotice />;

    return (
        <form className="au-form" onSubmit={(event) => { void submit(event); }} noValidate>
            <AuthField label="지금 비밀번호" type="password" name="currentPassword" autoComplete="current-password"
                value={form.current} onChange={input('current')} />
            <AuthField label="새 비밀번호" hint="6자 이상" type="password" name="newPassword" autoComplete="new-password"
                value={form.next} onChange={input('next')} />
            <AuthField label="새 비밀번호 다시 입력" type="password" name="newPasswordConfirm" autoComplete="new-password"
                value={form.confirm} onChange={input('confirm')} />
            {error ? <p className="lp-error" role="alert">{error}</p> : null}
            {done ? <p className="lp-ok" role="status">비밀번호를 바꿨어요.</p> : null}
            <button type="submit" className="lp-btn lp-btn-dark lp-btn-full" disabled={busy}>{busy ? '바꾸는 중…' : '비밀번호 바꾸기'}</button>
        </form>
    );
}

export default PasswordSettings;
