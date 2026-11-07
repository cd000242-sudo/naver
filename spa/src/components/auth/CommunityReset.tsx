import { useCallback, useState, type FormEvent } from 'react';
import { confirmReset, sendResetCode } from '../../lib/communityAccount';
import { validateResetConfirm, validateResetRequest } from '../../lib/accountModel.mjs';
import { useCodeSender } from '../../lib/useCodeSender';
import AuthField from './AuthField';
import PhoneCodeFields from './PhoneCodeFields';

type Props = {
    defaultUserId: string;
    onBack: () => void;
    /** The server says this id belongs to a license account: open the other tab. */
    onLicense: () => void;
};

const BLANK = { userId: '', phone: '', code: '', next: '', confirm: '' };
/** The server answers the same for an id that does not exist, so the site never says a text "was" sent. */
const SENT_TEXT = '번호가 맞으면 문자가 가요. 받은 인증번호 6자리를 넣어 주세요.';

/** Forgot-password for community members: id + phone, a text message code, and the new password. One short form. */
function CommunityReset({ defaultUserId, onBack, onLicense }: Props) {
    const [form, setForm] = useState({ ...BLANK, userId: defaultUserId });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [license, setLicense] = useState(false);
    const [done, setDone] = useState(false);
    const send = useCallback((phone: string) => sendResetCode({ userId: form.userId, phone }), [form.userId]);
    const sender = useCodeSender(send, form.phone, { sentText: SENT_TEXT });
    const set = (key: keyof typeof form) => (value: string) => setForm((previous) => ({ ...previous, [key]: value }));
    const input = (key: keyof typeof form) => (event: { target: { value: string } }) => set(key)(event.target.value);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        const problem = validateResetRequest(form) || validateResetConfirm(form);
        if (problem) { setError(problem); return; }
        setBusy(true);
        setError('');
        setLicense(false);
        const result = await confirmReset({ userId: form.userId, phone: form.phone, code: form.code, newPassword: form.next });
        setBusy(false);
        if (result.ok) { setForm({ ...BLANK, userId: form.userId }); setDone(true); return; }
        // A timed-out code cannot be retried: ask for a fresh one.
        if (result.kind === 'expired') { sender.reset(); set('code')(''); }
        if (result.kind === 'wait') { sender.hold(result.retryAfterSec); set('code')(''); }
        setLicense(result.license);
        setError(result.message);
    };

    if (done) {
        return (
            <div className="au-form" role="status">
                <p className="lp-note">비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.</p>
                <button type="button" className="lp-btn lp-btn-dark lp-btn-full" onClick={onBack}>로그인하러 가기</button>
            </div>
        );
    }

    return (
        <form className="au-form" onSubmit={(event) => { void submit(event); }} noValidate>
            <AuthField label="아이디" type="text" name="userId" autoComplete="username" autoCapitalize="none" spellCheck={false}
                value={form.userId} onChange={input('userId')} />
            <PhoneCodeFields phone={form.phone} code={form.code} onPhone={set('phone')} onCode={set('code')} sender={sender}
                phoneLabel="가입할 때 인증한 휴대폰 번호" hint="문자가 안 오면 아이디와 번호를 다시 확인해 주세요." />
            <AuthField label="새 비밀번호" hint="6자 이상" type="password" name="newPassword" autoComplete="new-password"
                value={form.next} onChange={input('next')} />
            <AuthField label="새 비밀번호 다시 입력" type="password" name="newPasswordConfirm" autoComplete="new-password"
                value={form.confirm} onChange={input('confirm')} />
            {error ? <p className="lp-error" role="alert">{error}</p> : null}
            {license ? <button type="button" className="lp-btn lp-btn-line lp-btn-full" onClick={onLicense}>이용권 계정에서 바꾸기</button> : null}
            <button type="submit" className="lp-btn lp-btn-dark lp-btn-full" disabled={busy}>{busy ? '바꾸는 중…' : '비밀번호 바꾸기'}</button>
            <button type="button" className="lp-btn lp-btn-line lp-btn-full" onClick={onBack}>← 돌아가기</button>
        </form>
    );
}

export default CommunityReset;
