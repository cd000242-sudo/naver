import { useEffect, useState } from 'react';
import {
    hfBrief, hfDraft, hfSelectEditorial, hfShareEditorial, type EditorialBrief, type EditorialSelection, type EditorialView, type HfStoryDetail,
} from '../../../lib/homefeedBridge';
import { EDITORIAL_STATE_LABEL, editorialDraftBlock, editorialDraftMatches, editorialSelectionMatches, editorialShareNotice, formatTime } from '../../../lib/homefeedModel.mjs';
import { EvidenceItem, ProviderSelect, copyToClipboard, failureOf } from './HomefeedParts';

type Form = Pick<EditorialSelection, 'angleId' | 'title' | 'card' | 'imageId'>;

function initialForm(brief: EditorialBrief, selection: EditorialSelection | null): Form {
    if (selection?.briefRevision === brief.revision) return { angleId: selection.angleId, title: selection.title, card: { ...selection.card }, imageId: selection.imageId };
    const angle = brief.angles.find((item) => item.id === brief.recommendedAngleId) ?? brief.angles[0];
    return { angleId: angle?.id ?? '', title: angle?.suggestedTitle ?? '', card: { line1: angle?.firstCard.line1 ?? '', line2: angle?.firstCard.line2 ?? '' }, imageId: null };
}

function EditorialEditor({ detail, view, provider, onSaved, onChanged, onVisual, onBusyChange }: {
    detail: HfStoryDetail; view: EditorialView; provider: string;
    onSaved: (view: EditorialView) => void; onChanged: () => void; onVisual: () => void; onBusyChange: (busy: boolean) => void;
}) {
    const brief = view.brief!;
    const [form, setForm] = useState<Form>(() => initialForm(brief, view.selection));
    const [busy, setBusy] = useState<'' | 'save' | 'draft'>('');
    useEffect(() => { onBusyChange(Boolean(busy)); return () => onBusyChange(false); }, [busy, onBusyChange]);
    const [error, setError] = useState('');
    const [draft, setDraft] = useState(detail.assets.drafts[0] ?? null);
    const draftIsCurrent = editorialDraftMatches(view, draft, form);
    const saved = editorialSelectionMatches(view.selection, form);
    const blocked = editorialDraftBlock(view) ?? (!saved ? '수정한 내용이 아직 저장되지 않았습니다. 먼저 이 내용을 저장하세요.' : null);
    const canSave = view.state === 'ready' && brief.readiness === 'ready' && brief.review?.passed && brief.evidenceRevision === view.evidenceRevision;
    const selectedAngle = brief.angles.find((angle) => angle.id === form.angleId);
    const sections = brief.sections.filter((section) => selectedAngle?.sectionIds.includes(section.id));

    const save = async () => {
        setBusy('save'); setError('');
        const result = await hfSelectEditorial({ id: detail.story.id, briefRevision: brief.revision, evidenceRevision: view.evidenceRevision,
            expectedRevision: view.selection?.revision ?? 0, ...form });
        setBusy('');
        if (result.status !== 'ok') { setError(`${failureOf(result, '선택 저장 실패') ?? ''} 최신 저장 상태를 다시 읽습니다. 수정한 내용은 유지되므로 확인 후 다시 저장하세요.`); onChanged(); return; }
        const stored = result.result.selection;
        setForm({ angleId: stored.angleId, title: stored.title, card: { ...stored.card }, imageId: stored.imageId });
        onSaved(result.result.editorial); onChanged();
    };

    const makeDraft = async () => {
        if (blocked || !view.selection) return;
        setBusy('draft'); setError('');
        const result = await hfDraft(detail.story.id, provider, brief.revision, view.selection.revision);
        setBusy('');
        if (result.status !== 'ok') { setError(failureOf(result, '원고 만들기 실패') ?? ''); onChanged(); return; }
        setDraft(result.result.draft); onChanged();
    };

    return <>
        <section className="lw-hf-section">
            <h4>내가 쓸 관점</h4>
            <p className="hint">관점을 고르면 본문에서 답할 질문과 제목 · 첫 카드가 함께 바뀝니다.</p>
            <div className="lw-hf-editorial-angles" role="group" aria-label="작성 관점 선택">
                {brief.angles.map((angle) => <button type="button" key={angle.id} className={`lw-hf-angle${form.angleId === angle.id ? ' selected' : ''}`}
                    aria-pressed={form.angleId === angle.id} disabled={Boolean(busy)} onClick={() => setForm({ ...form, angleId: angle.id, title: angle.suggestedTitle, card: { ...angle.firstCard } })}>
                    <strong>{angle.label}{angle.id === brief.recommendedAngleId ? ' · 추천' : ''}</strong>
                    <span>{angle.readerQuestion}</span><small>다르게 쓸 지점 · {angle.difference}</small>
                </button>)}
            </div>
            <ol className="lw-hf-outline">
                {sections.map((section) => <li key={section.id}><strong>{section.question}</strong><p>{section.answer}</p><small>근거 · {section.factIds.join(', ')}</small></li>)}
            </ol>
            <div className="lw-hf-form lw-hf-editorial-form">
                <div className="lw-hf-field"><label htmlFor="hf-editorial-title">내 제목</label><input id="hf-editorial-title" value={form.title} maxLength={80} disabled={Boolean(busy)} onChange={(event) => setForm({ ...form, title: event.target.value })} /></div>
                <div className="lw-hf-grid2">
                    <div className="lw-hf-field"><label htmlFor="hf-editorial-card1">첫 카드 · 첫 줄</label><input id="hf-editorial-card1" value={form.card.line1} maxLength={80} disabled={Boolean(busy)} onChange={(event) => setForm({ ...form, card: { ...form.card, line1: event.target.value } })} /></div>
                    <div className="lw-hf-field"><label htmlFor="hf-editorial-card2">첫 카드 · 둘째 줄</label><input id="hf-editorial-card2" value={form.card.line2} maxLength={80} disabled={Boolean(busy)} onChange={(event) => setForm({ ...form, card: { ...form.card, line2: event.target.value } })} /></div>
                </div>
                <div className="lw-hf-field"><label htmlFor="hf-editorial-image">함께 쓸 이미지</label>
                    <select id="hf-editorial-image" value={form.imageId ?? ''} disabled={Boolean(busy)} onChange={(event) => setForm({ ...form, imageId: event.target.value || null })}>
                        <option value="">이미지는 나중에 준비</option>
                        {brief.sources.filter((source) => source.imageUrl).map((source) => <option key={source.id} value={source.id}>기사 사진 · {source.title} (권리 확인 필요)</option>)}
                        {detail.assets.images.map((image) => <option key={image.id} value={image.id}>AI 생성 이미지 · {formatTime(image.createdAt)}</option>)}
                    </select>
                    {form.imageId && brief.sources.find((source) => source.id === form.imageId)?.imageUrl && <img className="lw-hf-editorial-preview" src={brief.sources.find((source) => source.id === form.imageId)!.imageUrl!} alt="선택한 기사 이미지 후보" referrerPolicy="no-referrer" />}
                    <small>기사 사진은 출처와 이용 조건을 확인한 뒤 사용하세요.</small>
                </div>
            </div>
            <div className="lw-hf-filter-row">
                <button type="button" className="lw-hf-btn primary" disabled={Boolean(busy) || !canSave || !form.title.trim() || !form.card.line1.trim() || !selectedAngle} onClick={save}>{busy === 'save' ? '저장 중…' : saved ? '저장한 선택' : '이 내용 저장'}</button>
                <button type="button" className="lw-hf-btn" disabled={Boolean(busy)} onClick={onVisual}>이미지 준비</button>
                <span className="hint">{saved ? '제목 · 카드 · 이미지 선택이 앱에 저장되었습니다.' : '수정한 내용은 저장 후 원고에 반영됩니다.'}</span>
            </div>
        </section>
        <section className="lw-hf-section">
            <h4>저장한 선택으로 원고 만들기</h4>
            {blocked && <p className="hint">{blocked}</p>}
            <button type="button" className="lw-hf-btn primary" disabled={Boolean(busy) || Boolean(blocked)} onClick={makeDraft}>{busy === 'draft' ? '근거와 선택으로 원고를 쓰는 중…' : '이 작성안으로 원고 만들기'}</button>
            {error && <p className="lw-hf-error" role="alert">{error}</p>}
            {draft && <div className="lw-hf-draft"><p className="hint">{formatTime(draft.createdAt)}에 만든 원고 · {draftIsCurrent ? '현재 저장한 선택으로 작성' : '이전 선택으로 만든 원고 · 현재 내용으로 다시 만들어 주세요'}</p>
                {draft.problems.length > 0 && <p className="lw-hf-error">추가 검토 · {draft.problems.join(' · ')}</p>}
                <textarea readOnly value={draft.text} aria-label="작성안으로 만든 원고" /><button type="button" className="lw-hf-btn" onClick={() => copyToClipboard(draft.text)}>원고 복사</button>
            </div>}
        </section>
    </>;
}

export default function HomefeedEditorialPane({ detail, onChanged, onVisual }: { detail: HfStoryDetail; onChanged: () => void; onVisual: () => void }) {
    const [view, setView] = useState(detail.editorial);
    const [provider, setProvider] = useState('');
    const [busy, setBusy] = useState(false);
    const [editorBusy, setEditorBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    useEffect(() => { setView(detail.editorial); }, [detail.editorial]);
    const readOnly = Boolean(detail.readOnly || view?.public);
    const brief = view?.brief;
    const prepare = async () => {
        if (readOnly) return;
        setBusy(true); setError('');
        const result = await hfBrief(detail.story.id, provider, Boolean(brief), view?.evidenceRevision);
        setBusy(false);
        if (result.status !== 'ok') { setError(failureOf(result, '작성안 준비 실패') ?? ''); onChanged(); return; }
        setView(result.result.editorial); onChanged();
    };
    const share = async () => {
        if (readOnly || !brief) return;
        setBusy(true); setError(''); setNotice('');
        const result = await hfShareEditorial(detail.story.id, brief.revision, !view?.shared);
        setBusy(false);
        if (result.status !== 'ok') { setError(failureOf(result, '공개본 설정 실패') ?? ''); onChanged(); return; }
        setView(result.result.editorial);
        setNotice(editorialShareNotice(result.result));
        onChanged();
    };
    return <>
        <section className="lw-hf-section">
            <div className="lw-hf-filter-row"><h4>무슨 이야기인가</h4><span className="lw-hf-chip">{EDITORIAL_STATE_LABEL[view?.state ?? 'unprepared']}</span></div>
            {brief ? <><p className="lw-hf-editorial-summary">{brief.summary}</p><p><b>누구에게 · </b>{brief.audience}</p><p><b>지금 다룰 이유 · </b>{brief.whyNow}</p><p className="hint">사건 요약 근거 {brief.summaryFactIds.join(', ')} · 시점 근거 {brief.whyNowFactIds.join(', ')}</p></>
                : <><p className="hint">기사 제목 · 아직 검토된 작성안이 아닙니다.</p><p className="lw-hf-editorial-summary">{view?.sourceTitle || detail.story.evidence[0]?.title || detail.story.keyword}</p></>}
            {readOnly ? <p className="lw-note">공개 근거를 읽는 중입니다. 내 작성안과 원고는 PC의 LEWORD 앱을 연결한 뒤 만들 수 있습니다.</p>
                : <div className="lw-hf-filter-row"><ProviderSelect value={provider} onChange={setProvider} disabled={busy || editorBusy} /><button type="button" className="lw-hf-btn primary" disabled={busy || editorBusy} onClick={prepare}>{busy ? '요청을 처리하는 중…' : brief ? '새 근거로 작성안 다시 준비' : '근거 읽고 작성안 준비'}</button></div>}
            {(error || view?.error) && <p className="lw-hf-error" role="alert">{error || view?.error}</p>}
            {notice && <p className="hint" role="status">{notice}</p>}
            {view?.state === 'stale' && <p className="lw-hf-error">근거가 바뀌었습니다. 아래는 이전 작성안이므로 새로 준비한 뒤 선택하세요.</p>}
            {brief && !readOnly && <div className="lw-hf-filter-row"><button type="button" className="lw-hf-btn" disabled={busy || editorBusy || (!view?.shared && view?.state !== 'ready')} onClick={share}>{view?.shared ? '공개본에서 작성안 제외' : '사이트 공개본에 작성안 포함'}</button><span className="hint">작성안과 근거만 포함합니다. 내 선택과 원고는 공개하지 않습니다. PC 파일을 갱신하며 사이트 배포는 별도입니다.</span></div>}
        </section>
        {brief && <>
            <section className="lw-hf-section"><h4>본문에서 설명할 사실과 출처</h4>
                <div className="lw-hf-facts">{brief.facts.map((fact) => <article key={fact.id}><strong>{fact.id} · {fact.text}</strong>
                    {fact.supports.map((support, index) => { const source = brief.sources.find((item) => item.id === support.sourceId); return <div key={`${support.sourceId}-${index}`}><blockquote>{support.excerpt}</blockquote>{source && <a href={source.url} target="_blank" rel="noopener noreferrer">{source.press ?? '원문'} · {source.title}</a>}<small>{source?.level === 'body' ? '본문에서 확인' : source?.level === 'description' ? '기사 설명에서 확인' : '제목만 확인'}</small></div>; })}
                </article>)}</div>
            </section>
            <section className="lw-hf-section"><h4>추가로 확인할 것</h4>{brief.unresolved.length > 0 ? <ul>{brief.unresolved.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="hint">작성안에서 별도로 남긴 확인 항목은 없습니다.</p>}
                {brief.problems.length > 0 && <p className="lw-hf-error">근거 검사 · {brief.problems.join(' · ')}</p>}
                {!brief.review?.passed && <p className="lw-hf-error">검토 미통과 · {brief.review?.issues?.join(' · ') || '근거 검토를 완료한 작성안이 필요합니다.'}</p>}
            </section>
            {readOnly && <section className="lw-hf-section"><h4>공개한 작성 관점</h4>
                {brief.angles.map((angle) => <article key={angle.id} className="lw-hf-editorial-pitch"><strong>{angle.label}{angle.id === brief.recommendedAngleId ? ' · 추천' : ''}</strong><p>독자 질문 · {angle.readerQuestion}</p><p>다르게 쓸 지점 · {angle.difference}</p>
                    <ol className="lw-hf-outline">{brief.sections.filter((section) => angle.sectionIds.includes(section.id)).map((section) => <li key={section.id}><strong>{section.question}</strong><p>{section.answer}</p><small>근거 · {section.factIds.join(', ')}</small></li>)}</ol>
                </article>)}
            </section>}
        </>}
        {brief && view && !readOnly && <fieldset disabled={busy} className="lw-hf-editorial-stack lw-hf-editorial-fieldset"><EditorialEditor key={brief.revision} detail={detail} view={view} provider={provider} onSaved={setView} onChanged={onChanged} onVisual={onVisual} onBusyChange={setEditorBusy} /></fieldset>}
        <section className="lw-hf-section"><h4>기사 원문 {detail.story.evidence.length}건</h4><ul className="lw-hf-evidence">{detail.story.evidence.map((evidence) => <EvidenceItem key={evidence.url} evidence={evidence} />)}</ul></section>
    </>;
}
