import { useId } from 'react';
import { Link } from 'react-router-dom';
import type { CodeSender } from '../../lib/useCodeSender';
import { formatPhoneInput, normalizeCode, sendButtonLabel } from '../../lib/phoneAuthModel.mjs';
import AuthField from './AuthField';

type Props = {
    phone: string;
    code: string;
    onPhone: (value: string) => void;
    onCode: (value: string) => void;
    sender: CodeSender;
    /** Short line under the number box. */
    hint?: string;
    /** Buttons offered under the sender's sentence for one kind of failure (number already used -> login, license -> 본인인증). */
    links?: ReadonlyArray<{ kind: string; to: string; label: string }>;
    phoneLabel?: string;
    disabled?: boolean;
};

/**
 * Phone number + [인증번호 받기] (with the resend countdown) + the 6-digit code box.
 * The same block serves sign-up, "verify my number" on /me and password recovery.
 */
function PhoneCodeFields({ phone, code, onPhone, onCode, sender, hint, links = [], phoneLabel = '휴대폰 번호', disabled = false }: Props) {
    const id = useId();
    const waiting = sender.waitSec > 0;
    const message = sender.message;
    const link = message ? links.find((entry) => entry.kind === message.kind) : undefined;
    return (
        <div className="au-phone">
            <div className="lp-field">
                <label htmlFor={`${id}-phone`}>{phoneLabel}</label>
                <div className="au-phone-row">
                    <input id={`${id}-phone`} className="lp-input" type="tel" name="phone" inputMode="numeric" autoComplete="tel"
                        placeholder="010-1234-5678" maxLength={13} disabled={disabled} value={phone}
                        onChange={(event) => onPhone(formatPhoneInput(event.target.value))} />
                    <button type="button" className="lp-btn lp-btn-line au-send" disabled={disabled || sender.busy || waiting}
                        onClick={() => { void sender.request(); }}>
                        {sendButtonLabel({ sent: sender.sent, waitSec: sender.waitSec, busy: sender.busy })}
                    </button>
                </div>
                {hint ? <small>{hint}</small> : null}
            </div>
            {message ? (
                <p className={message.tone === 'ok' ? 'lp-note' : 'lp-error'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>
            ) : null}
            {link ? <Link className="lp-btn lp-btn-line lp-btn-full" to={link.to}>{link.label}</Link> : null}
            <AuthField label="인증번호" hint="문자로 받은 6자리" type="text" name="authCode" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} placeholder="6자리 숫자" disabled={disabled} value={code} onChange={(event) => onCode(normalizeCode(event.target.value))} />
        </div>
    );
}

export default PhoneCodeFields;
