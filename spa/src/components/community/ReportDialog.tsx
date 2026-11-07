import { useEffect, useState, type FormEvent } from 'react';

type Props = {
    reasons: ReadonlyArray<{ key: string; label: string }>;
    busy: boolean;
    error: string;
    onSubmit: (input: { reason: string; detail: string }) => void;
    onClose: () => void;
};

const DETAIL_MAX = 200;

/** Report a post or comment: pick a reason, add an optional note. Esc or [취소] closes it. */
function ReportDialog({ reasons, busy, error, onSubmit, onClose }: Props) {
    const [reason, setReason] = useState('');
    const [detail, setDetail] = useState('');
    const [problem, setProblem] = useState('');

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (!reason) { setProblem('신고 사유를 골라 주세요.'); return; }
        setProblem('');
        onSubmit({ reason, detail: detail.trim() });
    };

    return (
        <div className="cm-modal">
            <div role="dialog" aria-modal="true" aria-labelledby="cm-report-title" className="lp-box cm-dialog">
                <h2 id="cm-report-title">신고하기</h2>
                <form onSubmit={submit} noValidate>
                    <fieldset className="cm-reasons">
                        <legend className="lp-sr">신고 사유</legend>
                        {reasons.map((entry) => (
                            <label key={entry.key} className="cm-reason">
                                <input type="radio" name="reason" value={entry.key} checked={reason === entry.key} onChange={() => setReason(entry.key)} />
                                <span>{entry.label}</span>
                            </label>
                        ))}
                    </fieldset>
                    <label className="lp-field">
                        <span>자세한 내용 (선택)</span>
                        <textarea className="lp-textarea cm-rdetail" maxLength={DETAIL_MAX} value={detail} onChange={(event) => setDetail(event.target.value)} />
                        <small>{detail.length}/{DETAIL_MAX}자</small>
                    </label>
                    {problem || error ? <p className="lp-error" role="alert">{problem || error}</p> : null}
                    <div className="cm-dialog-actions">
                        <button type="button" className="lp-btn lp-btn-line" onClick={onClose}>취소</button>
                        <button type="submit" className="lp-btn lp-btn-dark" disabled={busy}>신고하기</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default ReportDialog;
