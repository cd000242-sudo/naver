import { useRef, useState, type FormEvent } from 'react';
import { restoreDraft } from '../../lib/communityOutbox';
import { COMMENT_MAX, validateCommentDraft } from '../../lib/communityModel.mjs';

type Props = {
    placeholder: string;
    submitLabel: string;
    /** Puts the comment on screen and sends it; resolves to the reason it was not stored, or '' when it was. */
    onSubmit: (body: string) => Promise<string>;
    onCancel?: () => void;
};

/** A comment or reply box. The box is emptied the moment it is sent; the text comes back only if sending failed. */
function CommentForm({ placeholder, submitLabel, onSubmit, onCancel }: Props) {
    const [body, setBody] = useState('');
    const [error, setError] = useState('');
    const inFlight = useRef(0);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        // The second click of a double click finds the box already empty: nothing to say about it.
        if (inFlight.current > 0 && !body.trim()) return;
        const problem = validateCommentDraft(body);
        if (problem) { setError(problem); return; }
        const text = body.trim();
        setBody('');
        setError('');
        inFlight.current += 1;
        const failure = await onSubmit(text);
        inFlight.current -= 1;
        if (failure) {
            setError(failure);
            setBody((current) => restoreDraft(current, text, failure));
        }
    };

    return (
        <form className="cm-cform" onSubmit={(event) => { void submit(event); }} noValidate>
            <label className="lp-sr" htmlFor={`cm-cbody-${submitLabel}`}>{placeholder}</label>
            <textarea id={`cm-cbody-${submitLabel}`} className="lp-textarea cm-cbody" value={body} maxLength={COMMENT_MAX}
                placeholder={placeholder} onChange={(event) => setBody(event.target.value)} />
            {error ? <p className="lp-error" role="alert">{error}</p> : null}
            <div className="cm-cform-actions">
                {onCancel ? <button type="button" className="lp-btn lp-btn-line lp-btn-sm" onClick={onCancel}>취소</button> : null}
                <button type="submit" className="lp-btn lp-btn-dark lp-btn-sm">{submitLabel}</button>
            </div>
        </form>
    );
}

export default CommentForm;
