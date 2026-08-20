import { useState } from 'react';
import {
    login, registerWithLicense,
    type LewordSession,
} from '../../lib/lewordAuth';

/**
 * 로그인 · 계정 만들기 · 기간 만료 뒤 재인증 — 화면 하나에서 모드만 바뀐다.
 *
 * 라이선스 코드가 계정의 뿌리다(사장님 사양 2026-08-20): 원하는 아이디·비밀번호를
 * 정하고 코드를 함께 넣으면 계정이 생기고, 앱에서 이미 등록한 사람은 그때 만든
 * 아이디·비밀번호가 그대로 통한다. 기간이 끝나면 로그인 자체가 막히고, 새 코드를
 * 인증해야 같은 계정이 다시 열린다.
 *
 * 이메일은 인증하지 않는다 — 라이선스 코드가 이미 "돈 낸 사람"을 증명한다.
 * 비밀번호를 잊었을 때 되찾을 통로로만 받아 둔다.
 */

type Mode = 'login' | 'join' | 'renew';

const MODE_COPY: Record<Mode, { title: string; sub: string; cta: string }> = {
    login: { title: '로그인', sub: '라이선스 코드와 함께 등록한 아이디로 들어옵니다.', cta: '로그인' },
    join: { title: '계정 만들기', sub: '라이선스 코드 하나에 계정 하나가 붙습니다.', cta: '코드 확인하고 계정 만들기' },
    renew: { title: '라이선스 다시 인증', sub: '아이디는 그대로 두고 새 코드만 넣으면 됩니다.', cta: '코드 인증하고 다시 시작' },
};

function LewordAuth({ onDone, onCancel }: { onDone: (session: LewordSession) => void; onCancel?: () => void }) {
    const [mode, setMode] = useState<Mode>('login');
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [licenseCode, setLicenseCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [expiredAt, setExpiredAt] = useState('');

    const copy = MODE_COPY[mode];

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setError('');
        const id = userId.trim();
        if (!id || !password) {
            setError('아이디와 비밀번호를 입력해 주세요.');
            return;
        }
        if (mode !== 'login' && !licenseCode.trim()) {
            setError('라이선스 코드를 입력해 주세요.');
            return;
        }
        setBusy(true);
        const result = mode === 'login'
            ? await login(id, password)
            : await registerWithLicense(id, password, licenseCode, email);
        setBusy(false);

        if (result.ok) {
            onDone(result.session);
            return;
        }
        /*
         * 기간이 끝난 경우만 화면을 바꾼다 — 아이디·비밀번호는 맞았다는 뜻이라
         * 다시 입력하게 하면 안 된다. 코드 칸만 새로 내민다.
         */
        if (result.code === 'LICENSE_EXPIRED') {
            setMode('renew');
            setExpiredAt(result.expiresAt ? new Date(result.expiresAt).toLocaleDateString('ko-KR') : '');
            setError('');
            return;
        }
        setError(result.message);
    };

    return (
        <div className="lw-auth">
            <div className="lw-auth-brand">
                <span className="lw-auth-logo" aria-hidden="true">L</span>
                <b>LEWORD</b>
                <span>키워드마스터</span>
            </div>

            <h3>{copy.title}</h3>
            <p className="lw-auth-sub">{copy.sub}</p>

            {mode === 'renew' && (
                <div className="lw-auth-msg bad">
                    <span aria-hidden="true">⚠</span>
                    <span>
                        <b>이용 기간이 {expiredAt ? `${expiredAt}에 ` : ''}끝났습니다.</b><br />
                        새 라이선스 코드를 넣으면 이 계정 그대로 다시 열립니다.
                    </span>
                </div>
            )}
            {error && <div className="lw-auth-msg bad"><span aria-hidden="true">⚠</span><span>{error}</span></div>}

            <form onSubmit={submit}>
                <label className="lw-auth-field">
                    아이디
                    <input
                        value={userId}
                        onChange={(event) => setUserId(event.target.value)}
                        autoComplete="username"
                        placeholder="영문·숫자 4자 이상"
                    />
                </label>

                <label className="lw-auth-field">
                    비밀번호
                    <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        placeholder={mode === 'login' ? '' : '8자 이상'}
                    />
                </label>

                {mode === 'join' && (
                    <label className="lw-auth-field">
                        이메일 <em>비밀번호를 잊었을 때만 씁니다</em>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            placeholder="you@example.com"
                        />
                    </label>
                )}

                {mode !== 'login' && (
                    <label className="lw-auth-field">
                        {mode === 'renew' ? '새 라이선스 코드' : '라이선스 코드'}
                        <input
                            className="mono"
                            value={licenseCode}
                            onChange={(event) => setLicenseCode(event.target.value)}
                            autoComplete="off"
                            placeholder="구매하실 때 받으신 코드"
                        />
                    </label>
                )}

                <button type="submit" className={`lw-auth-cta${mode === 'login' ? '' : ' gold'}`} disabled={busy}>
                    {busy ? '확인 중…' : copy.cta}
                </button>
            </form>

            <p className="lw-auth-switch">
                {mode === 'login' ? (
                    <>아직 계정이 없나요? <button type="button" onClick={() => { setMode('join'); setError(''); }}>라이선스 코드로 계정 만들기</button></>
                ) : (
                    <>이미 계정이 있나요? <button type="button" onClick={() => { setMode('login'); setError(''); }}>로그인</button></>
                )}
            </p>
            {onCancel && (
                <p className="lw-auth-switch">
                    <button type="button" onClick={onCancel}>먼저 둘러보기</button>
                </p>
            )}
        </div>
    );
}

export default LewordAuth;
