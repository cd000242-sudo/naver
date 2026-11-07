import { useState, type FormEvent } from 'react';
import { registerLicenseCode } from '../../lib/communityAuth';
import { REGISTER_NOTICE_PARTS } from '../../lib/siteAuthModel.mjs';
import AuthField from './AuthField';

type Props = {
    /** Called after the code was registered. `lewordOpen` is the server's answer for LEWORD with the same login. */
    onRegistered: (lewordOpen: boolean) => void;
};

/**
 * License-code registration for the logged-in account. The site accepts all-in-one and LEWORD codes only;
 * the notice above the field says so, and a code of another product is answered with that product's app name.
 * The password is asked again because the server binds the code with it; it is sent once and never kept.
 */
function LicenseRegister({ onRegistered }: Props) {
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (!code.trim()) { setError('이용권 코드를 입력해 주세요.'); return; }
        if (!password) { setError('비밀번호를 입력해 주세요.'); return; }
        setBusy(true);
        setError('');
        const result = await registerLicenseCode(code, password);
        setBusy(false);
        if (result.ok) {
            setPassword('');
            onRegistered(result.lewordOpen);
        } else {
            setError(result.message);
        }
    };

    return (
        <form className="au-register" onSubmit={(event) => { void submit(event); }} noValidate>
            <h2>라이선스 코드 등록</h2>
            <p className="lp-note">
                {REGISTER_NOTICE_PARTS.map((part, index) => (part.bold
                    ? <strong key={index}>{part.text}</strong>
                    : <span key={index}>{part.text}</span>))}
            </p>
            <AuthField
                label="이용권 코드"
                type="text"
                name="licenseCode"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="받은 코드를 붙여 넣어 주세요"
            />
            <AuthField
                label="내 비밀번호"
                hint="로그인할 때 쓰는 비밀번호예요. 코드를 이 계정에 묶는 데 한 번만 써요."
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
            />
            {error ? <p className="lp-error" role="alert">{error}</p> : null}
            <button type="submit" className="lp-btn lp-btn-dark lp-btn-full" disabled={busy}>{busy ? '등록하는 중…' : '코드 등록하기'}</button>
        </form>
    );
}

export default LicenseRegister;
