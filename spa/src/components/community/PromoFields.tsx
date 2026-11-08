import { useState } from 'react';
import type { PostItem } from '../../lib/communityData';
import { PROMO_PLATFORMS, normalizePlatform, promoPlatformOf, suggestPlatform, validatePromoUrl } from '../../lib/communityPlatform.mjs';
import { readPromoTitle } from '../../lib/promoTitle';

type Fields = { title: string; summary: string };

/** State of the promo part of the form: the address, the platform and the title read from the address. */
export function usePromoDraft(editing: PostItem | undefined, defaultPlatform: string | undefined) {
    const [url, setUrl] = useState(editing?.url ?? '');
    const [platform, setPlatform] = useState(editing ? promoPlatformOf(editing) : normalizePlatform(defaultPlatform));
    const [chosen, setChosen] = useState(Boolean(editing));
    const [readNote, setReadNote] = useState('');
    const [reading, setReading] = useState(false);

    const changeUrl = (value: string) => {
        setUrl(value);
        setReadNote('');
        // While the writer has not picked a platform by hand, the address picks it.
        const guess = chosen ? '' : suggestPlatform(value);
        if (guess) setPlatform(guess);
    };
    const choose = (key: string) => { setPlatform(normalizePlatform(key)); setChosen(true); setReadNote(''); };

    /** Reads the real title of the address; returns what to put in the title / intro boxes. */
    const read = async (current: { summary: string }): Promise<Partial<Fields> | null> => {
        if (editing || reading || !url.trim()) return null;
        const mismatch = validatePromoUrl(url, platform);
        if (mismatch) { setReadNote(mismatch); return { title: '' }; }
        setReading(true);
        setReadNote('글을 여는 중…');
        const result = await readPromoTitle(url);
        setReading(false);
        if (!result.ok) { setReadNote(result.message); return { title: '' }; }
        setReadNote('제목을 읽어 왔어요.');
        return { title: result.title, ...(!current.summary.trim() && result.description ? { summary: result.description.slice(0, 200) } : {}) };
    };
    return { url, platform, readNote, reading, changeUrl, choose, read };
}

type Props = {
    draft: ReturnType<typeof usePromoDraft>;
    editing: boolean;
    title: string;
    summary: string;
    onSummary: (value: string) => void;
    onBlurUrl: () => void;
};

/** Promo post fields: platform (two big choices), address, the title read from it, a one-line intro. */
function PromoFields({ draft, editing, title, summary, onSummary, onBlurUrl }: Props) {
    const current = PROMO_PLATFORMS.find((entry) => entry.key === draft.platform) ?? PROMO_PLATFORMS[0];
    return (
        <>
            <fieldset className="cm-platforms" disabled={editing}>
                <legend>어느 블로그 글인가요?</legend>
                {PROMO_PLATFORMS.map((entry) => (
                    <label key={entry.key} className={`cm-platform${entry.key === draft.platform ? ' on' : ''}`}>
                        <input type="radio" name="platform" value={entry.key} checked={entry.key === draft.platform} onChange={() => draft.choose(entry.key)} />
                        <span>{entry.label}</span>
                    </label>
                ))}
            </fieldset>
            <label className="lp-field">
                <span>글 주소</span>
                <input className="lp-input" type="url" inputMode="url" name="url" value={draft.url} readOnly={editing}
                    placeholder={current.example} onChange={(event) => draft.changeUrl(event.target.value)} onBlur={onBlurUrl} />
                {draft.readNote ? <small role="status">{draft.readNote}</small> : null}
            </label>
            <label className="lp-field">
                <span>제목</span>
                <input className="lp-input" type="text" name="title" value={title} readOnly
                    placeholder={draft.reading ? '읽는 중…' : '주소를 넣으면 자동으로 읽어 와요'} />
                <small>글에서 읽어 온 제목이에요. 실제 글과 달라지면 들른 사람이 돌아가요.</small>
            </label>
            <label className="lp-field">
                <span>한 줄 소개</span>
                <textarea className="lp-textarea cm-short" name="summary" value={summary} maxLength={300}
                    placeholder="이 글에서 무엇을 알 수 있는지 한두 문장으로" onChange={(event) => onSummary(event.target.value)} />
                <small>‘좋은 글입니다’보다 무엇이 적혀 있는지 적어 주세요. 그래야 들러요.</small>
            </label>
        </>
    );
}

export default PromoFields;
