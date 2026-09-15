import { useEffect, useRef, useState } from 'react';
import { hfSettings, type HfSettings } from '../../../lib/homefeedBridge';
import { failureOf } from './HomefeedParts';

/**
 * 관리자 설정 — 수집 · 원천 · 판정 가설값 · AI · 이미지 생성 · 보정 표본. 값은 앱이 범위로 다시 자른다(하한은 못 내린다).
 * 판정 임계값은 보정 전 가설값이다. 성과학습 표를 보고 여기서 직접 고친다.
 */

type NumberField = { group: '' | 'window' | 'story' | 'calibration'; key: string; label: string; min: number; max: number; step: number; hint?: string };

const NUMBER_FIELDS: NumberField[] = [
    { group: '', key: 'snapshotIntervalMinutes', label: '수집 간격(분)', min: 5, max: 180, step: 1, hint: '5분 아래로는 못 내립니다' },
    { group: '', key: 'issueLimit', label: '회차당 이슈 수', min: 1, max: 20, step: 1, hint: '이슈마다 뉴스 검색 · 문서수를 한 번씩 씁니다' },
    { group: '', key: 'newsSampleSize', label: '이슈당 뉴스 표본', min: 5, max: 20, step: 1 },
    { group: '', key: 'ogImagesPerIssue', label: '이슈당 대표이미지 확인', min: 0, max: 5, step: 1, hint: '기사 주소마다 한 번만 받습니다' },
    { group: '', key: 'retentionDays', label: '스냅샷 보관(일)', min: 1, max: 30, step: 1 },
    { group: '', key: 'cloneThreshold', label: '비슷한 제목 기준(어절 겹침)', min: 0.3, max: 0.9, step: 0.05 },
    { group: 'window', key: 'openingMaxAgeMinutes', label: '열리는 중 — 처음 본 뒤 최대(분)', min: 10, max: 720, step: 5 },
    { group: 'window', key: 'openMinSources', label: '열림 — 최소 원천 수', min: 1, max: 4, step: 1 },
    { group: 'window', key: 'openMaxCloneRatio', label: '열림 — 비슷한 제목 비율 상한', min: 0.1, max: 0.95, step: 0.05 },
    { group: 'window', key: 'narrowingCloneRise', label: '좁아짐 — 30분 비율 상승폭', min: 0.01, max: 0.9, step: 0.01 },
    { group: 'window', key: 'narrowingDocVelocity', label: '좁아짐 — 분당 블로그 글 증가', min: 0.1, max: 1000, step: 0.1 },
    { group: 'window', key: 'closedCloneRatio', label: '닫힘 — 비슷한 제목 비율', min: 0.2, max: 1, step: 0.05 },
    { group: 'story', key: 'payoffMin', label: '지금 쓸 만함 — 최소 정보층', min: 1, max: 6, step: 1 },
    { group: 'story', key: 'minSamplesForNow', label: '지금 쓸 만함 — 최소 기사 표본', min: 1, max: 20, step: 1 },
    { group: 'story', key: 'minPressForNow', label: '지금 쓸 만함 — 최소 매체 수', min: 1, max: 10, step: 1 },
    { group: '', key: 'thumbnailTextMaxChars', label: '썸네일 문구 줄당 최대 글자', min: 7, max: 16, step: 1 },
    { group: 'calibration', key: 'sampleShortN', label: '보정 — 수치를 보여 줄 최소 표본', min: 5, max: 50, step: 1, hint: '5 아래로 못 내립니다' },
    { group: 'calibration', key: 'successRateMinN', label: '보정 — 비율을 보여 줄 최소 표본', min: 20, max: 500, step: 1, hint: '20 아래로 못 내립니다' },
];

const SOURCE_FIELDS: Array<{ key: keyof HfSettings['sources']; label: string }> = [
    { key: 'signalBz', label: '네이버 실시간(Signal.bz)' },
    { key: 'hotLanes', label: '네이트 · 구글 · 다음 인기 목록' },
    { key: 'naverNews', label: '네이버 뉴스 검색(내 키)' },
    { key: 'naverBlog', label: '블로그 문서수(내 키)' },
    { key: 'siteBoard', label: '사이트 이슈 보드' },
    { key: 'ogImage', label: '기사 대표이미지' },
];

const AI_FIELDS: Array<{ key: keyof HfSettings['ai']; label: string }> = [
    { key: 'storyReview', label: '스토리 AI 보강' },
    { key: 'title', label: '제목 만들기' },
    { key: 'visualPrompt', label: '이미지 프롬프트 다듬기' },
    { key: 'draft', label: '원고 만들기' },
];

function numberOf(form: HfSettings, field: NumberField): number {
    const holder = (field.group ? form[field.group] : form) as unknown as Record<string, number>;
    return holder[field.key];
}

export default function HomefeedSettingsPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [form, setForm] = useState<HfSettings | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        void hfSettings().then((result) => {
            if (result.status === 'ok') setForm(result.result.settings);
            else setError(failureOf(result, '설정을 불러오지 못했습니다') ?? '');
        });
    }, []);

    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const patchTop = (key: string, value: unknown) => setForm((previous) => (previous ? ({ ...previous, [key]: value } as HfSettings) : previous));
    const patchGroup = (group: 'window' | 'story' | 'sources' | 'ai' | 'calibration', key: string, value: number | boolean) => {
        setForm((previous) => (previous ? ({ ...previous, [group]: { ...(previous[group] as unknown as Record<string, unknown>), [key]: value } } as HfSettings) : previous));
    };

    const save = async () => {
        if (!form) return;
        setBusy(true);
        setNotice('');
        const result = await hfSettings(form as unknown as Record<string, unknown>);
        setBusy(false);
        if (result.status !== 'ok') {
            setNotice(failureOf(result, '설정 저장 실패') ?? '');
            return;
        }
        const clamped = JSON.stringify({ ...result.result.settings, updatedAt: null }) !== JSON.stringify({ ...form, updatedAt: null });
        setForm(result.result.settings);
        setNotice(clamped ? '저장했습니다 — 범위 밖 값은 경계로 맞췄습니다.' : '저장했습니다.');
        onSaved();
    };

    return (
        <div className="lw-plan-backdrop" role="presentation" onClick={onClose}>
            <div className="lw-hf-modal" role="dialog" aria-modal="true" aria-label="홈판 신호 설정" onClick={(event) => event.stopPropagation()}>
                <header className="lw-hf-modal-head">
                    <div><h3>홈판 신호 설정</h3></div>
                    <button ref={closeRef} type="button" className="lw-plan-close" onClick={onClose} aria-label="닫기">✕</button>
                </header>
                <div className="lw-hf-modal-body">
                    {error && <div className="lw-note lw-note-error"><strong>설정을 열지 못했습니다</strong><p>{error}</p></div>}
                    {!form && !error && <div className="lw-note">설정을 불러오는 중입니다…</div>}
                    {form && (
                        <>
                            <section className="lw-hf-section">
                                <h4>수집</h4>
                                <label className="lw-hf-check">
                                    <input type="checkbox" checked={form.enabled} onChange={(event) => patchTop('enabled', event.target.checked)} />
                                    이 PC 앱이 켜져 있는 동안 주기적으로 수집(내 네이버 키 쿼터를 씁니다)
                                </label>
                                <div className="lw-hf-form">
                                    {NUMBER_FIELDS.filter((field) => field.group === '').map((field) => (
                                        <div key={field.key} className="lw-hf-field">
                                            <label htmlFor={`hf-set-${field.key}`}>{field.label}</label>
                                            <input
                                                id={`hf-set-${field.key}`}
                                                type="number"
                                                min={field.min}
                                                max={field.max}
                                                step={field.step}
                                                value={numberOf(form, field)}
                                                onChange={(event) => patchTop(field.key, Number(event.target.value))}
                                            />
                                            {field.hint && <small>{field.hint}</small>}
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="lw-hf-section">
                                <h4>원천</h4>
                                <div className="lw-hf-form">
                                    {SOURCE_FIELDS.map((field) => (
                                        <label key={field.key} className="lw-hf-check">
                                            <input type="checkbox" checked={form.sources[field.key]} onChange={(event) => patchGroup('sources', field.key, event.target.checked)} />
                                            {field.label}
                                        </label>
                                    ))}
                                </div>
                            </section>

                            <section className="lw-hf-section">
                                <h4>판정 가설값</h4>
                                <p className="hint">보정 전 가설값입니다. 성과학습 표를 보고 고치세요.</p>
                                <div className="lw-hf-form">
                                    {NUMBER_FIELDS.filter((field) => field.group === 'window' || field.group === 'story').map((field) => (
                                        <div key={`${field.group}-${field.key}`} className="lw-hf-field">
                                            <label htmlFor={`hf-set-${field.group}-${field.key}`}>{field.label}</label>
                                            <input
                                                id={`hf-set-${field.group}-${field.key}`}
                                                type="number"
                                                min={field.min}
                                                max={field.max}
                                                step={field.step}
                                                value={numberOf(form, field)}
                                                onChange={(event) => patchGroup(field.group as 'window' | 'story', field.key, Number(event.target.value))}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="lw-hf-section">
                                <h4>AI · 이미지</h4>
                                <div className="lw-hf-form">
                                    {AI_FIELDS.map((field) => (
                                        <label key={field.key} className="lw-hf-check">
                                            <input type="checkbox" checked={form.ai[field.key]} onChange={(event) => patchGroup('ai', field.key, event.target.checked)} />
                                            {field.label}(누를 때만 · 내 구독 에이전트)
                                        </label>
                                    ))}
                                    <div className="lw-hf-field">
                                        <label htmlFor="hf-set-image-provider">이미지 생성</label>
                                        <select id="hf-set-image-provider" value={form.imageProvider} onChange={(event) => patchTop('imageProvider', event.target.value)}>
                                            <option value="none">만들지 않음(프롬프트까지만)</option>
                                            <option value="codex-builtin">코덱스 구독으로 생성(내장 이미지 도구)</option>
                                        </select>
                                        <small>유료 API 키로 만드는 선택지는 없습니다.</small>
                                    </div>
                                    <div className="lw-hf-field">
                                        <label htmlFor="hf-set-aspect">기본 비율</label>
                                        <select id="hf-set-aspect" value={form.defaultAspectRatio} onChange={(event) => patchTop('defaultAspectRatio', event.target.value)}>
                                            {['16:9', '1:1', '4:3', '3:4', '9:16'].map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </section>

                            <section className="lw-hf-section">
                                <h4>보정 표본</h4>
                                <div className="lw-hf-form">
                                    {NUMBER_FIELDS.filter((field) => field.group === 'calibration').map((field) => (
                                        <div key={field.key} className="lw-hf-field">
                                            <label htmlFor={`hf-set-cal-${field.key}`}>{field.label}</label>
                                            <input
                                                id={`hf-set-cal-${field.key}`}
                                                type="number"
                                                min={field.min}
                                                max={field.max}
                                                step={field.step}
                                                value={numberOf(form, field)}
                                                onChange={(event) => patchGroup('calibration', field.key, Number(event.target.value))}
                                            />
                                            {field.hint && <small>{field.hint}</small>}
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <div className="lw-hf-filter-row">
                                <button type="button" className="lw-hf-btn primary" disabled={busy} onClick={save}>설정 저장</button>
                                <button type="button" className="lw-hf-btn" onClick={onClose}>닫기</button>
                                {notice && <span className={notice.startsWith('저장했습니다') ? 'lw-hf-busy' : 'lw-hf-error'}>{notice}</span>}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
