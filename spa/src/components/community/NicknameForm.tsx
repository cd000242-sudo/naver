import { useState, type FormEvent } from 'react';
import { setCommunityNickname } from '../../lib/communityAuth';
import { validateNickname } from '../../lib/siteAuthModel.mjs';

type Props = {
    /** Called once the server accepted the nickname (the stored profile is already updated). */
    onDone: () => void;
    initial?: string;
    submitLabel?: string;
};

/** Asks for the nickname that writing and commenting need. */
function NicknameForm({ onDone, initial = '', submitLabel = '닉네임 정하기' }: Props) {
    const [nickname, setNickname] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        const problem = validateNickname(nickname);
        if (problem) { setError(problem); return; }
        setBusy(true);
        setError('');
        const result = await setCommunityNickname(nickname);
        setBusy(false);
        if (result.ok) onDone();
        else setError(result.message);
    };

    return (
        <form className="cm-nick-form" onSubmit={(event) => { void submit(event); }} noValidate>
            <label className="lp-field">
                <span>닉네임</span>
                <input className="lp-input" type="text" name="nickname" autoComplete="nickname" value={nickname}
                    onChange={(event) => setNickname(event.target.value)} />
                <small>글과 댓글에 보여요. 2~12자 · 글자·숫자와 _ . - 만 쓸 수 있어요.</small>
            </label>
            {error ? <p className="lp-error" role="alert">{error}</p> : null}
            <button type="submit" className="lp-btn lp-btn-dark" disabled={busy}>{busy ? '저장하는 중…' : submitLabel}</button>
        </form>
    );
}

export default NicknameForm;
