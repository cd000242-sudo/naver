import { useCallback, useEffect, useState } from 'react';
import type { SendCodeOutcome } from './communityAccount';
import { normalizePhone, remainingSeconds, sentMessage, waitSeconds } from './phoneAuthModel.mjs';

export type SenderMessage = { tone: 'ok' | 'error'; text: string; kind: string };

export type CodeSender = {
    busy: boolean;
    /** A code was sent to the number now in the box. */
    sent: boolean;
    /** Seconds before the button works again, for the number now in the box. */
    waitSec: number;
    message: SenderMessage | null;
    request: () => Promise<SendCodeOutcome>;
    /** Forget the sent state (the code expired or was used) so the button reads "인증번호 받기" again. */
    reset: () => void;
    /** Keep the button closed for `seconds` (the server locked this number after too many wrong codes). */
    hold: (seconds: number) => void;
};

type Sent = { phone: string; until: number; sent: boolean };

export type SenderOptions = {
    /** Replaces the "text sent" line (password recovery cannot promise a text went out for an unknown id). */
    sentText?: string;
};

/**
 * Drives the "인증번호 받기" button: one request at a time, the resend wait as a countdown, and the sentence to
 * show. The wait belongs to the number it was started for — typing another number frees the button, the server's
 * own limit (TOO_MANY) still applies. Nothing here is stored; a reload starts clean.
 */
export function useCodeSender(send: (phone: string) => Promise<SendCodeOutcome>, phone: string, options: SenderOptions = {}): CodeSender {
    const digits = normalizePhone(phone);
    const [busy, setBusy] = useState(false);
    const [state, setState] = useState<Sent | null>(null);
    const [message, setMessage] = useState<SenderMessage | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const current = state && state.phone === digits ? state : null;
    const waitSec = current ? remainingSeconds(current.until, now) : 0;

    useEffect(() => {
        if (waitSec <= 0) return undefined;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [waitSec > 0]); // eslint-disable-line react-hooks/exhaustive-deps

    // A sentence about another number no longer applies.
    useEffect(() => { setMessage(null); }, [digits]);

    const request = useCallback(async (): Promise<SendCodeOutcome> => {
        setBusy(true);
        setMessage(null);
        const result = await send(phone);
        const at = Date.now();
        setNow(at);
        setBusy(false);
        if (result.ok) {
            setState({ phone: digits, until: at + waitSeconds(result.resendAfterSec) * 1000, sent: true });
            setMessage({ tone: 'ok', text: options.sentText ?? sentMessage(result.expiresInSec), kind: 'sent' });
        } else {
            if (result.kind === 'wait') setState((previous) => ({ phone: digits, until: at + result.retryAfterSec * 1000, sent: previous?.phone === digits && previous.sent }));
            setMessage({ tone: 'error', text: result.message, kind: result.kind });
        }
        return result;
    }, [send, phone, digits, options.sentText]);

    const reset = useCallback(() => { setState(null); setMessage(null); }, []);
    const hold = useCallback((seconds: number) => {
        const at = Date.now();
        setNow(at);
        setState({ phone: digits, until: at + waitSeconds(seconds) * 1000, sent: false });
    }, [digits]);

    return { busy, sent: Boolean(current?.sent), waitSec, message, request, reset, hold };
}
