import { useState } from 'react';
import {
    confirmPasswordReset, confirmPhoneVerify,
    login, registerWithLicense,
    requestPasswordResetCode, requestPhoneVerifyCode,
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

/** 로그인 폼 · 본인인증 · 비밀번호 변경 — 한 창에서 화면만 바뀐다. */
type View = 'auth' | 'phone' | 'pwreset';

function LewordAuth({ onDone, onCancel }: { onDone: (session: LewordSession) => void; onCancel?: () => void }) {
    const [mode, setMode] = useState<Mode>('login');
    const [view, setView] = useState<View>('auth');
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [licenseCode, setLicenseCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [expiredAt, setExpiredAt] = useState('');

    const copy = MODE_COPY[mode];

    if (view === 'phone') {
        return <PhoneVerifyPanel defaultUserId={userId} onBack={() => setView('auth')} />;
    }
    if (view === 'pwreset') {
        return <PasswordResetPanel defaultUserId={userId} onBack={() => setView('auth')} />;
    }

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

            {/*
              본인인증·비밀번호 변경 — 데스크톱 로그인창과 같은 자리에 상시로 둔다
              (사장님 2026-09-06 "이 친구도 본인인증·비밀번호 변경 버튼 구현").
              본인인증은 번호를 처음 등록하는 것이고, 비밀번호 변경은 그 번호로 온
              문자로 본인을 확인한다 — 그래서 본인인증이 먼저다.
            */}
            <div className="lw-auth-tools">
                <button type="button" onClick={() => { setView('phone'); setError(''); }}>📱 본인인증</button>
                <button type="button" onClick={() => { setView('pwreset'); setError(''); }}>🔑 비밀번호 변경</button>
            </div>

            {onCancel && (
                <p className="lw-auth-switch">
                    <button type="button" onClick={onCancel}>먼저 둘러보기</button>
                </p>
            )}
        </div>
    );
}

/** 화면 머리(로고+제목) — 세 화면이 같이 쓴다. */
function AuthBrand({ title, sub }: { title: string; sub: string }) {
    return (
        <>
            <div className="lw-auth-brand">
                <span className="lw-auth-logo" aria-hidden="true">L</span>
                <b>LEWORD</b>
                <span>키워드마스터</span>
            </div>
            <h3>{title}</h3>
            <p className="lw-auth-sub">{sub}</p>
        </>
    );
}

/**
 * 휴대폰 본인인증 — 아이디·비밀번호로 본인을 증명하고 번호를 등록한다.
 * 웹은 로그인 세션을 만들지 않으므로(데스크톱 앱이 튕긴다) 비밀번호로 확인한다.
 */
function PhoneVerifyPanel({ defaultUserId, onBack }: { defaultUserId: string; onBack: () => void }) {
    const [userId, setUserId] = useState(defaultUserId);
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [done, setDone] = useState(false);

    const sendCode = async () => {
        if (busy) return;
        setMsg(null);
        if (!userId.trim() || !password) { setMsg({ text: '아이디와 비밀번호를 입력해 주세요.', ok: false }); return; }
        if (!/^01[0-9]{8,9}$/.test(phone.replace(/[-\s]/g, ''))) { setMsg({ text: '올바른 전화번호를 입력하세요. (예: 01012345678)', ok: false }); return; }
        setBusy(true);
        const result = await requestPhoneVerifyCode(userId.trim(), password, phone.replace(/[-\s]/g, ''));
        setBusy(false);
        if (!result.ok) { setMsg({ text: result.message || '인증번호 발송에 실패했습니다.', ok: false }); return; }
        setSent(true);
        setMsg({ text: '📩 인증번호를 보냈습니다 — 문자로 받은 6자리를 입력하세요.', ok: true });
    };
    const confirm = async () => {
        if (busy) return;
        setMsg(null);
        if (!/^\d{6}$/.test(code.trim())) { setMsg({ text: '문자로 받은 인증번호 6자리를 입력하세요.', ok: false }); return; }
        setBusy(true);
        const result = await confirmPhoneVerify(userId.trim(), password, phone.replace(/[-\s]/g, ''), code.trim());
        setBusy(false);
        if (!result.ok) { setMsg({ text: result.message || '본인인증에 실패했습니다.', ok: false }); return; }
        setDone(true);
        setMsg({ text: '✅ 본인인증이 완료되었습니다. 이제 이 번호로 비밀번호를 변경할 수 있습니다.', ok: true });
    };

    return (
        <div className="lw-auth">
            <AuthBrand title="휴대폰 본인인증" sub="아이디·비밀번호로 본인을 확인한 뒤 번호를 등록합니다. 한 번만 하면 됩니다." />
            {msg && <div className={`lw-auth-msg ${msg.ok ? 'good' : 'bad'}`}><span aria-hidden="true">{msg.ok ? '✓' : '⚠'}</span><span>{msg.text}</span></div>}
            {!done && (
                <div className="lw-auth-formish">
                    <label className="lw-auth-field">아이디
                        <input value={userId} onChange={(e) => setUserId(e.target.value)} autoComplete="username" placeholder="영문·숫자 4자 이상" />
                    </label>
                    <label className="lw-auth-field">비밀번호
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                    </label>
                    <label className="lw-auth-field">전화번호
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="numeric" placeholder="01012345678" />
                    </label>
                    <button type="button" className="lw-auth-cta" onClick={sendCode} disabled={busy}>
                        {busy && !sent ? '보내는 중…' : sent ? '📩 인증번호 다시 받기' : '📩 인증번호 받기'}
                    </button>
                    {sent && (
                        <>
                            <label className="lw-auth-field">문자로 받은 인증번호
                                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="6자리" />
                            </label>
                            <button type="button" className="lw-auth-cta gold" onClick={confirm} disabled={busy}>
                                {busy ? '확인 중…' : '✅ 본인인증 완료'}
                            </button>
                        </>
                    )}
                </div>
            )}
            <p className="lw-auth-switch"><button type="button" onClick={onBack}>← 로그인으로 돌아가기</button></p>
        </div>
    );
}

/** 비밀번호 변경 — 본인인증한 번호로 문자를 보내 확인한 뒤 새 비밀번호를 정한다. */
function PasswordResetPanel({ defaultUserId, onBack }: { defaultUserId: string; onBack: () => void }) {
    const [userId, setUserId] = useState(defaultUserId);
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [sent, setSent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [done, setDone] = useState(false);

    const sendCode = async () => {
        if (busy) return;
        setMsg(null);
        if (!userId.trim()) { setMsg({ text: '아이디를 입력해 주세요.', ok: false }); return; }
        if (!/^01[0-9]{8,9}$/.test(phone.replace(/[-\s]/g, ''))) { setMsg({ text: '본인인증한 전화번호를 입력하세요.', ok: false }); return; }
        setBusy(true);
        const result = await requestPasswordResetCode(userId.trim(), phone.replace(/[-\s]/g, ''));
        setBusy(false);
        if (!result.ok) { setMsg({ text: result.message || '인증번호 발송에 실패했습니다.', ok: false }); return; }
        setSent(true);
        setMsg({ text: '📩 인증번호를 보냈습니다 — 문자로 받은 6자리와 새 비밀번호를 입력하세요.', ok: true });
    };
    const confirm = async () => {
        if (busy) return;
        setMsg(null);
        if (!/^\d{6}$/.test(code.trim())) { setMsg({ text: '문자로 받은 인증번호 6자리를 입력하세요.', ok: false }); return; }
        if (newPassword.length < 4) { setMsg({ text: '새 비밀번호는 4자 이상이어야 합니다.', ok: false }); return; }
        setBusy(true);
        const result = await confirmPasswordReset(userId.trim(), phone.replace(/[-\s]/g, ''), code.trim(), newPassword);
        setBusy(false);
        if (!result.ok) { setMsg({ text: result.message || '비밀번호 변경에 실패했습니다.', ok: false }); return; }
        setDone(true);
        setMsg({ text: '✅ 비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.', ok: true });
    };

    return (
        <div className="lw-auth">
            <AuthBrand title="비밀번호 변경" sub="본인인증한 번호로 문자를 보내 드립니다. 확인 후 새 비밀번호를 정하세요." />
            {msg && <div className={`lw-auth-msg ${msg.ok ? 'good' : 'bad'}`}><span aria-hidden="true">{msg.ok ? '✓' : '⚠'}</span><span>{msg.text}</span></div>}
            {!done && (
                <div className="lw-auth-formish">
                    <label className="lw-auth-field">아이디
                        <input value={userId} onChange={(e) => setUserId(e.target.value)} autoComplete="username" />
                    </label>
                    <label className="lw-auth-field">본인인증한 전화번호
                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="numeric" placeholder="01012345678" />
                    </label>
                    <button type="button" className="lw-auth-cta" onClick={sendCode} disabled={busy}>
                        {busy && !sent ? '보내는 중…' : sent ? '📩 인증번호 다시 받기' : '📩 인증번호 받기'}
                    </button>
                    {sent && (
                        <>
                            <label className="lw-auth-field">문자로 받은 인증번호
                                <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="6자리" />
                            </label>
                            <label className="lw-auth-field">새 비밀번호
                                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="4자 이상" />
                            </label>
                            <button type="button" className="lw-auth-cta gold" onClick={confirm} disabled={busy}>
                                {busy ? '변경 중…' : '✅ 비밀번호 변경'}
                            </button>
                        </>
                    )}
                </div>
            )}
            <p className="lw-auth-switch"><button type="button" onClick={onBack}>← 로그인으로 돌아가기</button></p>
        </div>
    );
}

export default LewordAuth;
