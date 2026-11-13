import { useId, useState, type FormEvent } from 'react';
import { decryptLink, ProtectedLinkError, type ProtectedLinkPayload } from '../../lib/protectedLink.mjs';
import { light, lightRadius, type as typeScale } from '../../styles/tokens';

type Props = {
    badge: string;
    title: string;
    desc: string;
    /** Ciphertext only — the real link never exists in plaintext in the bundle. */
    payload: ProtectedLinkPayload;
};

const MESSAGES: Record<string, string> = {
    EMPTY_PASSWORD: '비밀번호를 입력해 주세요',
    WRONG_PASSWORD: '비밀번호가 맞지 않습니다',
    UNSUPPORTED: '이 브라우저에서는 열 수 없습니다. 다른 브라우저로 열어 주세요',
};
const GENERIC_ERROR = '지금은 열 수 없습니다. 잠시 뒤 다시 시도해 주세요';

/** Hub tile that opens a link in a new tab only after the visitor's password decrypts it in the browser. */
export default function ProtectedLinkTile({ badge, title, desc, payload }: Props) {
    const inputId = useId();
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [openedUrl, setOpenedUrl] = useState('');

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        setOpenedUrl('');
        try {
            const url = await decryptLink(payload, password);
            setPassword('');
            setOpenedUrl(url);
            const opened = window.open(url, '_blank');
            if (opened) opened.opener = null;
        } catch (caught) {
            setError(caught instanceof ProtectedLinkError ? (MESSAGES[caught.code] ?? GENERIC_ERROR) : GENERIC_ERROR);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="hub-tile hub-tile-locked fade-in">
            <div className="hub-tile-top">
                <span className="hub-badge">{badge}</span>
            </div>
            <h3>{title}</h3>
            <p>{desc}</p>
            <form className="hub-lock-form" onSubmit={handleSubmit}>
                <label className="hub-lock-label" htmlFor={inputId}>비밀번호</label>
                <div className="hub-lock-row">
                    <input
                        id={inputId}
                        className="hub-lock-input"
                        type="password"
                        autoComplete="off"
                        placeholder="비밀번호"
                        value={password}
                        disabled={busy}
                        aria-invalid={error ? true : undefined}
                        onChange={(event) => setPassword(event.target.value)}
                    />
                    <button className="hub-lock-btn" type="submit" disabled={busy}>
                        {busy ? '확인 중…' : '열기 →'}
                    </button>
                </div>
                <p className="hub-lock-error" role="alert">{error}</p>
                {openedUrl && (
                    <p className="hub-lock-ok" role="status">
                        열렸습니다. 새 창이 안 보이면{' '}
                        <a href={openedUrl} target="_blank" rel="noopener noreferrer">여기를 눌러주세요</a>
                    </p>
                )}
            </form>
            <style>{`
                /* Light theme. The page sheet (ChatbotsPage) is printed after this one, so rules that
                   must beat .hub-tile there carry one more class. */
                .hub-tile.hub-tile-locked { cursor: default; }
                .hub-tile.hub-tile-locked:hover { border-color: ${light.line}; }
                .hub-lock-form { width: 100%; margin-top: 8px; }
                .hub-lock-label {
                    position: absolute; width: 1px; height: 1px; overflow: hidden;
                    clip: rect(0 0 0 0); white-space: nowrap;
                }
                .hub-lock-row { display: flex; gap: 8px; flex-wrap: wrap; }
                .hub-lock-input {
                    flex: 1 1 180px; min-width: 0; min-height: 48px; padding: 12px 16px;
                    border-radius: ${lightRadius.control}px; border: 1px solid ${light.lineStrong};
                    background: ${light.surface}; color: ${light.text}; font: inherit; font-size: ${typeScale.body}px;
                }
                .hub-lock-input::placeholder { color: ${light.textMuted}; }
                .hub-lock-input:focus-visible { outline: 2px solid ${light.accent}; outline-offset: 2px; }
                .hub-lock-btn {
                    min-height: 48px; padding: 12px 24px; border-radius: ${lightRadius.control}px; cursor: pointer;
                    border: 1px solid ${light.btn}; background: ${light.btn}; color: ${light.onBtn};
                    font: inherit; font-weight: 600; font-size: ${typeScale.body}px;
                }
                .hub-lock-btn:disabled { opacity: 0.6; cursor: wait; }
                .hub-tile .hub-lock-error { margin: 8px 0 0; min-height: 1.4em; color: ${light.negative}; font-weight: 500; }
                .hub-tile .hub-lock-ok { margin: 4px 0 0; color: ${light.positive}; font-weight: 500; }
                .hub-lock-ok a { color: ${light.accentInk}; text-decoration: underline; }
            `}</style>
        </div>
    );
}
