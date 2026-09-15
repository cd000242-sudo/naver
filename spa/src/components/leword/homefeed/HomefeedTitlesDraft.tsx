import { useState } from 'react';
import { hfDraft, hfSelect, hfTitles, type HfStoryDetail, type HfTitleCandidate } from '../../../lib/homefeedBridge';
import { DRAFT_PROBLEM_LABEL, TRIGGER_LABEL, VERDICT_LABEL, formatTime, reasonLabel } from '../../../lib/homefeedModel.mjs';
import { ProviderSelect, copyToClipboard, failureOf } from './HomefeedParts';

/**
 * 제목 · 원고 — 누를 때만 내 구독 에이전트로 만든다(사장님 결정: 이 탭만 원고 본문까지).
 * 제목은 12개를 만들어 앱이 교리로 검사하고 STOP 상위 3개를 보여 준다. 과장(OVER) 제목은 고를 수 없다.
 */

export default function HomefeedTitlesDraft({ detail, onChanged }: { detail: HfStoryDetail; onChanged: () => void }) {
    const { story, assets } = detail;
    const titles = assets.titles;
    const selection = assets.selection;
    const [provider, setProvider] = useState('');
    const [busy, setBusy] = useState<'' | 'titles' | 'select' | 'draft'>('');
    const [error, setError] = useState('');

    const byId = new Map((titles?.candidates ?? []).map((candidate) => [candidate.id, candidate]));
    const tops = (titles?.top ?? []).map((id) => byId.get(id)).filter((candidate): candidate is HfTitleCandidate => Boolean(candidate));
    const others = (titles?.candidates ?? []).filter((candidate) => !(titles?.top ?? []).includes(candidate.id));
    const chosenTitle = selection ? byId.get(selection.titleId) ?? null : tops[0] ?? null;
    const latestDraft = assets.drafts[0] ?? null;

    const makeTitles = async (force: boolean) => {
        setBusy('titles');
        setError('');
        const result = await hfTitles(story.id, provider, force);
        setBusy('');
        if (result.status === 'ok') onChanged();
        else setError(failureOf(result, '제목 만들기 실패') ?? '');
    };

    const select = async (titleId: string, pairId: string) => {
        setBusy('select');
        setError('');
        const result = await hfSelect(story.id, titleId, pairId);
        setBusy('');
        if (result.status === 'ok') onChanged();
        else setError(failureOf(result, '제목 고르기 실패') ?? '');
    };

    const makeDraft = async () => {
        setBusy('draft');
        setError('');
        const result = await hfDraft(story.id, provider);
        setBusy('');
        if (result.status === 'ok') onChanged();
        else setError(failureOf(result, '원고 만들기 실패') ?? '');
    };

    return (
        <>
            <section className="lw-hf-section">
                <h4>제목 만들기</h4>
                <p className="hint">
                    내 구독 에이전트가 근거 기사 재료로 12개를 만들고, 앱이 교리(기준어 · 쉼표 끊기 금지 · 답 숨김 · 상투구 · 기사에 없는 숫자 · 과장어 · 기사 제목 옮기기)로 검사해
                    멈추게 하는 제목(STOP) 상위 3개를 보여 줍니다. 제목과 썸네일 문구는 같은 말을 되풀이하지 않게 짝지어 둡니다.
                </p>
                <div className="lw-hf-filter-row">
                    <ProviderSelect value={provider} onChange={setProvider} disabled={Boolean(busy)} />
                    <button type="button" className="lw-hf-btn primary" disabled={Boolean(busy)} onClick={() => makeTitles(Boolean(titles))}>
                        {titles ? '제목 다시 만들기' : '제목 만들기'}
                    </button>
                    {busy === 'titles' && <span className="lw-hf-busy">제목 12개를 만들고 검사하는 중…</span>}
                </div>
                {error && <p className="lw-hf-error">{error}</p>}
                {titles && (
                    <>
                        <p className="hint">{titles.provider} · {formatTime(titles.createdAt)}{titles.stale ? ' · 근거 기사가 바뀌었습니다 — 다시 만들면 새 근거로 만듭니다' : ''}</p>
                        {tops.length === 0 && <p>STOP 제목이 없습니다. 다시 만들거나 아래 후보에서 고르세요.</p>}
                        <div className="lw-hf-titles">
                            {tops.map((candidate) => {
                                const pair = titles.pairs.find((row) => row.titleId === candidate.id);
                                const isChosen = selection?.titleId === candidate.id;
                                return (
                                    <div key={candidate.id} className={`lw-hf-title${isChosen ? ' chosen' : ''}`}>
                                        <strong>{candidate.title}</strong>
                                        <div className="lw-hf-title-meta">
                                            <span className={`lw-hf-chip v-${candidate.verdict}`}>{VERDICT_LABEL[candidate.verdict]}</span>
                                            {candidate.triggerType && <span className="lw-hf-chip">{TRIGGER_LABEL[candidate.triggerType] ?? candidate.triggerType}</span>}
                                            <span>첫 걸림 “{candidate.firstHook}” · 두 번째 “{candidate.secondHook || '—'}”</span>
                                            <span>기사 제목과 겹침 {candidate.overlapWithSample === null ? '미측정' : candidate.overlapWithSample}</span>
                                        </div>
                                        {pair && <p className="hint">썸네일 문구 · {pair.thumbnailCopy.join(' / ') || '문구 없이 장면만'} — {pair.why}</p>}
                                        <div className="lw-hf-filter-row">
                                            <button type="button" className="lw-hf-btn small primary" disabled={Boolean(busy)} onClick={() => select(candidate.id, pair?.id ?? '')}>
                                                {isChosen ? '고른 제목' : '이 제목 · 조합 고르기'}
                                            </button>
                                            <button type="button" className="lw-hf-btn small" onClick={() => copyToClipboard(candidate.title)}>제목 복사</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {others.length > 0 && (
                            <details className="lw-hf-fold">
                                <summary>나머지 후보 {others.length}개 — 밋밋함 · 과장 사유 보기</summary>
                                <div className="lw-hf-titles">
                                    {others.map((candidate) => (
                                        <div key={candidate.id} className={`lw-hf-title${selection?.titleId === candidate.id ? ' chosen' : ''}`}>
                                            <strong>{candidate.title}</strong>
                                            <div className="lw-hf-title-meta">
                                                <span className={`lw-hf-chip v-${candidate.verdict}`}>{VERDICT_LABEL[candidate.verdict]}</span>
                                                <span>{candidate.reasons.map(reasonLabel).join(' · ') || '사유 없음'}</span>
                                            </div>
                                            {candidate.verdict !== 'OVER' && (
                                                <div className="lw-hf-filter-row">
                                                    <button type="button" className="lw-hf-btn small" disabled={Boolean(busy)} onClick={() => select(candidate.id, '')}>그래도 이 제목 고르기</button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </details>
                        )}
                    </>
                )}
            </section>

            <section className="lw-hf-section">
                <h4>원고 만들기</h4>
                <p className="hint">
                    {chosenTitle ? `“${chosenTitle.title}”` : '고른 제목'}으로 네이버 블로그 대화체 원고를 만듭니다. 첫 줄 최종 제목 · ## 소제목만 · 해시태그 5~10개 · 이미지 배치 가이드를
                    앱이 검사하고, 어기면 사유를 붙여 한 번 다시 씁니다. 근거 기사에 없는 사실은 쓰지 않게 재료만 넘깁니다.
                </p>
                <div className="lw-hf-filter-row">
                    <button type="button" className="lw-hf-btn primary" disabled={Boolean(busy) || !titles} onClick={makeDraft}>원고 만들기</button>
                    {!titles && <span className="hint">먼저 제목을 만드세요.</span>}
                    {busy === 'draft' && <span className="lw-hf-busy">원고를 쓰고 검사하는 중… 몇 분 걸릴 수 있습니다</span>}
                </div>
                {latestDraft && (
                    <div className="lw-hf-draft">
                        <p className="hint">{latestDraft.provider} · {formatTime(latestDraft.createdAt)}{latestDraft.retried ? ' · 검사에 걸려 한 번 다시 씀' : ''}</p>
                        {latestDraft.problems.length > 0 && (
                            <p className="lw-hf-error">남은 문제 · {latestDraft.problems.map((problem) => DRAFT_PROBLEM_LABEL[problem] ?? problem).join(' · ')}</p>
                        )}
                        <textarea readOnly value={latestDraft.text} aria-label="원고" />
                        <div className="lw-hf-filter-row">
                            <button type="button" className="lw-hf-btn small primary" onClick={() => copyToClipboard(latestDraft.text)}>원고 복사</button>
                        </div>
                    </div>
                )}
                {assets.drafts.length > 1 && (
                    <details className="lw-hf-fold">
                        <summary>이전 원고 {assets.drafts.length - 1}개</summary>
                        {assets.drafts.slice(1).map((draft) => (
                            <div key={draft.id} className="lw-hf-draft">
                                <p className="hint">{draft.provider} · {formatTime(draft.createdAt)}</p>
                                <textarea readOnly value={draft.text} aria-label="이전 원고" />
                            </div>
                        ))}
                    </details>
                )}
            </section>
        </>
    );
}
