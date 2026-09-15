import { useState } from 'react';
import { hfPublish, type HfStoryDetail } from '../../../lib/homefeedBridge';
import { STATUS_LABEL, WINDOW_LABEL } from '../../../lib/homefeedModel.mjs';
import { failureOf } from './HomefeedParts';

/**
 * 발행 기록 — 글을 올린 뒤 주소 · 시각을 적으면 발행 때의 창 · 상태 · 제목 유형 · 이미지 전략을 함께 남긴다.
 * 성과 숫자는 블로그 통계에서 사용자가 옮겨 적는다 — 앱은 로그인 통계를 읽지 않는다.
 */

function localInputValue(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function HomefeedPublish({ detail, onChanged }: { detail: HfStoryDetail; onChanged: () => void }) {
    const { story } = detail;
    const [postUrl, setPostUrl] = useState('');
    const [publishedAt, setPublishedAt] = useState(() => localInputValue(new Date()));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState('');
    const validUrl = /^https:\/\/\S+$/.test(postUrl.trim());

    const submit = async () => {
        const at = new Date(publishedAt);
        if (Number.isNaN(at.getTime())) {
            setError('발행 시각을 확인해 주세요.');
            return;
        }
        setBusy(true);
        setError('');
        setDone('');
        const result = await hfPublish(story.id, postUrl.trim(), at.toISOString(), detail.assets.selection?.titleId ?? '');
        setBusy(false);
        if (result.status !== 'ok') {
            setError(failureOf(result, '발행 기록 실패') ?? '');
            return;
        }
        setDone('발행 기록을 남겼습니다 — [성과학습]에서 30분 · 2시간 · 6시간 · 24시간 뒤 숫자를 적으세요.');
        onChanged();
    };

    return (
        <section className="lw-hf-section">
            <h4>발행 기록</h4>
            <p className="hint">
                지금 이 스토리는 창 {WINDOW_LABEL[story.window.state]} · {STATUS_LABEL[story.status.state]} 입니다. 기록에는 이 판정과 고른 제목 유형 · 이미지 전략 · 썸네일 유형이 함께 남습니다.
                성과 숫자는 블로그 통계에서 직접 옮겨 적습니다(앱이 로그인 통계를 읽지 않습니다).
            </p>
            <div className="lw-hf-form">
                <div className="lw-hf-field">
                    <label htmlFor="hf-post-url">발행한 글 주소</label>
                    <input
                        id="hf-post-url"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        placeholder="https://blog.naver.com/..."
                        value={postUrl}
                        onChange={(event) => setPostUrl(event.target.value.slice(0, 500))}
                    />
                </div>
                <div className="lw-hf-field">
                    <label htmlFor="hf-published-at">발행 시각</label>
                    <input id="hf-published-at" type="datetime-local" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} />
                </div>
            </div>
            <div className="lw-hf-filter-row">
                <button type="button" className="lw-hf-btn primary" disabled={busy || !validUrl} onClick={submit}>발행 기록 저장</button>
                {!validUrl && postUrl && <span className="hint">https 로 시작하는 주소를 넣어 주세요.</span>}
            </div>
            {error && <p className="lw-hf-error">{error}</p>}
            {done && <p className="lw-hf-busy">{done}</p>}
        </section>
    );
}
