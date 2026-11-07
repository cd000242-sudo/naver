import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PHONE_PANEL_PATH } from '../../lib/accountModel.mjs';
import { confirmVerifyPhone, sendVerifyCode, type ProfileDetail } from '../../lib/communityAccount';
import { PHONE_PROMISE, validateAuthCode, validatePhone } from '../../lib/phoneAuthModel.mjs';
import { useCodeSender } from '../../lib/useCodeSender';
import PhoneCodeFields from '../auth/PhoneCodeFields';

type Props = {
    onVerified: (detail: ProfileDetail) => void;
    onCancel: () => void;
    /** The server says the number was verified already: read the profile again. */
    onAlready?: () => void;
};

/** License and owner accounts verify their phone on the login screen's own panel. */
const LINKS = [{ kind: 'license', to: PHONE_PANEL_PATH, label: '본인인증 화면으로' }] as const;

/** An existing member without a verified number: number, text-message code, done. */
function PhoneVerifyForm({ onVerified, onCancel, onAlready }: Props) {
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [kind, setKind] = useState('');
    const sender = useCodeSender(sendVerifyCode, phone);
    const senderKind = sender.message?.kind;

    useEffect(() => { if (senderKind === 'already') onAlready?.(); }, [senderKind, onAlready]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        const problem = validatePhone(phone) || validateAuthCode(code);
        if (problem) { setError(problem); return; }
        setBusy(true);
        setError('');
        setKind('');
        const result = await confirmVerifyPhone(phone, code);
        setBusy(false);
        if (result.ok) { setCode(''); onVerified(result.detail); return; }
        if (result.kind === 'already') { onAlready?.(); return; }
        if (result.kind === 'expired') { sender.reset(); setCode(''); }
        // Five wrong codes lock the number for a while: the button waits too.
        if (result.kind === 'wait') { sender.hold(result.retryAfterSec); setCode(''); }
        setKind(result.kind);
        setError(result.message);
    };

    return (
        <form className="au-form me-verify" onSubmit={(event) => { void submit(event); }} noValidate>
            <PhoneCodeFields phone={phone} code={code} onPhone={setPhone} onCode={setCode} sender={sender} hint={PHONE_PROMISE} links={LINKS} />
            {error ? <p className="lp-error" role="alert">{error}</p> : null}
            {kind === 'license' ? <Link className="lp-btn lp-btn-line lp-btn-full" to={PHONE_PANEL_PATH}>본인인증 화면으로</Link> : null}
            <div className="me-actions">
                <button type="submit" className="lp-btn lp-btn-dark" disabled={busy}>{busy ? '확인하는 중…' : '인증하기'}</button>
                <button type="button" className="lp-btn lp-btn-line" onClick={onCancel}>닫기</button>
            </div>
        </form>
    );
}

export default PhoneVerifyForm;
