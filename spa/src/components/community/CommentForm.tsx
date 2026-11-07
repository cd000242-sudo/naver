import { useState, type FormEvent } from 'react';
import { COMMENT_MAX, validateCommentDraft } from '../../lib/communityModel.mjs';

type Props = {
    placeholder: string;
    submitLabel: string;
    /** Sends the text; resolves to an error sentence, or '' when it worked. */
    onSubmit: (body: string) => Promise<string>;
    onCancel?: () => void;
};

/** A comment or reply box. The text is cleared only when the server accepted it. */
function CommentForm({ placeholder, submitLabel, onSubmit, onCancel }: Props) {
    const [body, setBody] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        const problem = validateCommentDraft(body);
        if (problem) { setError(problem); return; }
        setBusy(true);
        setError('');
        const failure = await onSubmit(body.trim());
        setBusy(false);
        if (failure) setError(failure);
        else setBody('');
    };

    return (
        <form className="cm-cform" onSubmit={(event) => { void submit(event); }} noValidate>
            <label className="lp-sr" htmlFor={`cm-cbody-${submitLabel}`}>{placeholder}</label>
            <textarea id={`cm-cbody-${submitLabel}`} className="lp-textarea cm-cbody" value={body} maxLength={COMMENT_MAX}
                placeholder={placeholder} onChange={(event) => setBody(event.target.value)} />
            {error ? <p className="lp-error" role="alert">{error}</p> : null}
            <div className="cm-cform-actions">
                {onCancel ? <button type="button" className="lp-btn lp-btn-line lp-btn-sm" onClick={onCancel}>취소</button> : null}
                <button type="submit" className="lp-btn lp-btn-dark lp-btn-sm" disabled={busy}>{busy ? '올리는 중…' : submitLabel}</button>
            </div>
        </form>
    );
}

export default CommentForm;
