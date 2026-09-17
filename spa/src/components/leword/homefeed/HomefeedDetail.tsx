import { useCallback, useEffect, useRef, useState } from 'react';
import { hfStory, type HfStoryDetail } from '../../../lib/homefeedBridge';
import { CATEGORY_LABEL, STATUS_LABEL, WINDOW_LABEL } from '../../../lib/homefeedModel.mjs';
import { failureOf } from './HomefeedParts';
import HomefeedSignalPane from './HomefeedSignalPane';
import HomefeedEditorialPane from './HomefeedEditorialPane';
import HomefeedVisual from './HomefeedVisual';
import HomefeedPublish from './HomefeedPublish';

/**
 * 스토리 상세 창 — 신호 · 판정 / 스토리 / 첫 카드 / 이미지 · 썸네일 / 제목 · 원고 / 발행.
 * 열 때 앱에서 계산본 한 건만 받는다. AI 는 각 구획의 버튼을 눌러야 돈다.
 */

type Pane = 'brief' | 'signal' | 'visual' | 'publish';

const PANES: ReadonlyArray<{ id: Pane; label: string }> = [
    { id: 'brief', label: '작성안 · 근거' },
    { id: 'signal', label: '신호 · 판정' },
    { id: 'visual', label: '이미지 · 썸네일' },
    { id: 'publish', label: '발행 기록' },
];

export default function HomefeedDetail({ storyId, imageProvider, publicOnly = false, onClose, onChanged, onSettings }: {
    storyId: string;
    imageProvider: string;
    publicOnly?: boolean;
    onClose: () => void;
    onChanged: () => void;
    onSettings: () => void;
}) {
    const [detail, setDetail] = useState<HfStoryDetail | null>(null);
    const [error, setError] = useState('');
    const [pane, setPane] = useState<Pane>('brief');
    const closeRef = useRef<HTMLButtonElement>(null);

    const load = useCallback(async () => {
        const result = await hfStory(storyId, publicOnly);
        if (result.status === 'ok') {
            setDetail(result.result);
            setError('');
        } else {
            if (publicOnly) setDetail(null);
            setError(failureOf(result, '상세를 불러오지 못했습니다') ?? '');
        }
    }, [storyId, publicOnly]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [onClose]);

    const refresh = useCallback(() => {
        void load();
        onChanged();
    }, [load, onChanged]);

    const story = detail?.story ?? null;
    const readOnly = Boolean(publicOnly || detail?.readOnly || detail?.editorial?.public);
    useEffect(() => { if (readOnly) setPane('brief'); }, [readOnly]);

    return (
        <div className="lw-plan-backdrop" role="presentation" onClick={onClose}>
            <div
                className="lw-hf-modal"
                role="dialog"
                aria-modal="true"
                aria-label={story ? `${story.keyword} 홈판 신호 상세` : '홈판 신호 상세'}
                onClick={(event) => event.stopPropagation()}
            >
                <header className="lw-hf-modal-head">
                    <div>
                        {story && (
                            <div className="lw-hf-card-head">
                                <span className={`lw-hf-chip s-${story.status.state}`}>{STATUS_LABEL[story.status.state]}</span>
                                <span className={`lw-hf-chip w-${story.window.state}`}>창 · {WINDOW_LABEL[story.window.state]}</span>
                                <span className="lw-hf-chip">{CATEGORY_LABEL[story.category] ?? story.category}</span>
                            </div>
                        )}
                        <h3>{story ? story.keyword : '불러오는 중…'}</h3>
                    </div>
                    <div className="lw-hf-filter-row"><button type="button" className="lw-hf-btn small" onClick={() => void load()}>저장된 최신 근거 읽기</button><button ref={closeRef} type="button" className="lw-plan-close" onClick={onClose} aria-label="닫기">✕</button></div>
                </header>

                <div className="lw-hf-tabs" role="tablist" aria-label="상세 구획">
                    {PANES.map((item) => (
                        <button key={item.id} type="button" role="tab" aria-selected={pane === item.id} disabled={readOnly && (item.id === 'visual' || item.id === 'publish')} onClick={() => setPane(item.id)}>{item.label}</button>
                    ))}
                </div>

                <div className="lw-hf-modal-body">
                    {error && <div className="lw-note lw-note-error"><strong>상세를 열지 못했습니다</strong><p>{error}</p></div>}
                    {!detail && !error && <div className="lw-note">앱에서 상세를 불러오는 중입니다…</div>}
                    {detail?.superseded && <div className="lw-note">새 회차가 계산돼 같은 이슈의 최신 스토리를 보여 줍니다.</div>}
                    {detail && pane === 'signal' && <HomefeedSignalPane detail={detail} />}
                    {detail && <div hidden={pane !== 'brief'}><div className="lw-hf-editorial-stack"><HomefeedEditorialPane detail={readOnly ? { ...detail, readOnly: true } : detail} onChanged={refresh} onVisual={() => setPane('visual')} /></div></div>}
                    {detail && pane === 'visual' && !readOnly && <><button type="button" className="lw-hf-btn" onClick={() => setPane('brief')}>작성안으로 돌아가 이미지 선택 저장</button><HomefeedVisual detail={detail} imageProvider={imageProvider} onChanged={refresh} onSettings={onSettings} /></>}
                    {detail && pane === 'publish' && !readOnly && <HomefeedPublish detail={detail} onChanged={refresh} />}
                </div>
            </div>
        </div>
    );
}
