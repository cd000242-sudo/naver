import { useState } from 'react';
import { boardApi } from '../../lib/communityApi';
import { refreshCommunityProfile } from '../../lib/communityAuth';
import { describeLevelUpFailure, isAssociate, levelUpFromNeed, levelUpReady, levelUpSteps } from '../../lib/communityLevel.mjs';
import { loadCommunitySession, saveCommunitySession, type CommunityProfile } from '../../lib/communitySession';

type Props = {
    profile: CommunityProfile;
    /** Why the reader is looking at this (e.g. why writing is closed); one short sentence. */
    hint?: string;
    /** Level-up went through: the page reads its lists again. */
    onDone?: () => void;
    onClose?: () => void;
};

/** 준회원 → 새싹: the two conditions with their marks and the [등업 신청] button. Draws nothing for a member. */
function LevelUpCard({ profile, hint, onDone, onClose }: Props) {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [leveled, setLeveled] = useState(false);
    if (!isAssociate(profile) && !leveled) return null;

    const apply = async () => {
        if (busy) return;
        setBusy(true);
        setMessage('');
        const result = await boardApi.levelUp();
        if (result.ok) {
            setLeveled(true);
            setMessage('새싹이 되었어요. 이제 어느 게시판에든 글을 쓸 수 있어요.');
            await refreshCommunityProfile();
            onDone?.();
        } else {
            // The server says what is still missing: keep the checklist in step with it.
            const flags = levelUpFromNeed(result.need);
            const session = loadCommunitySession();
            if (flags && session) saveCommunitySession({ ...session, levelUp: flags });
            setMessage(describeLevelUpFailure(result));
        }
        setBusy(false);
    };

    if (leveled) {
        return <section className="lp-box cm-level" aria-live="polite"><p className="cm-level-ok" role="status">{message}</p></section>;
    }
    const ready = levelUpReady(profile);
    return (
        <section className="lp-box cm-level" aria-labelledby="cm-level-title">
            <h2 id="cm-level-title">준회원이에요</h2>
            {hint ? <p className="cm-level-hint">{hint}</p> : null}
            <ul className="cm-level-steps">
                {levelUpSteps(profile).map((step) => (
                    <li key={step.key} className={step.done ? 'is-done' : undefined}>
                        <b aria-hidden="true">{step.done ? '✓' : '✗'}</b>
                        <span>{step.label}</span>
                        <span className="lp-sr">{step.done ? ' 했어요' : ' 아직이에요'}</span>
                    </li>
                ))}
            </ul>
            <div className="cm-level-actions">
                <button type="button" className={`lp-btn ${ready ? 'lp-btn-dark' : 'lp-btn-line'}`} disabled={busy} onClick={() => { void apply(); }}>
                    {busy ? '신청하는 중…' : '등업 신청'}
                </button>
                {onClose ? <button type="button" className="lp-btn lp-btn-line" onClick={onClose}>닫기</button> : null}
            </div>
            {message ? <p className="cm-level-msg" role="status">{message}</p> : null}
        </section>
    );
}

export default LevelUpCard;
