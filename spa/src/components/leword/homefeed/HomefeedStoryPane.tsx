import { useState } from 'react';
import { hfReview, type HfStoryDetail } from '../../../lib/homefeedBridge';
import {
    ANGLE_CONFIDENCE_LABEL, CATEGORY_LABEL, CHECK_LABEL, FUN_GAP_LABEL, TENSION_LABEL, formatTime, reasonLabel,
} from '../../../lib/homefeedModel.mjs';
import { CheckList, EvidenceItem, ProviderSelect, failureOf } from './HomefeedParts';

/** 상세 · 스토리 — 기준어 · 새 사실 · 긴장 · 재미 근거 · 각도 · 풀 이야기 · 카드만 보고 이해되나 · AI 보강(근거 번호 필수). */

const LAYER_KIND = { number: '숫자', quote: '인용', event: '사건' } as const;

export default function HomefeedStoryPane({ detail, onChanged }: { detail: HfStoryDetail; onChanged: () => void }) {
    const { story } = detail;
    const review = detail.assets.review;
    const [provider, setProvider] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const runReview = async () => {
        setBusy(true);
        setError('');
        const result = await hfReview(story.id, provider, Boolean(review));
        setBusy(false);
        if (result.status === 'ok') onChanged();
        else setError(failureOf(result, 'AI 보강 실패') ?? '');
    };

    return (
        <>
            <section className="lw-hf-section">
                <h4>기준어 · 새로 나온 사실</h4>
                <p>기준어 <b>{story.anchor.text}</b> · {CATEGORY_LABEL[story.anchor.category] ?? story.anchor.category}</p>
                {story.delta ? (
                    <>
                        <p>새 사실 <b>{story.delta.text}</b> <span className="hint">({formatTime(story.delta.comparedWith)} 회차 표본과 비교)</span></p>
                        <ul className="lw-hf-evidence"><EvidenceItem evidence={story.delta.evidence} /></ul>
                    </>
                ) : (
                    <p>{reasonLabel(story.deltaReason ?? 'NO_FRESH_DELTA')}</p>
                )}
            </section>

            <section className="lw-hf-section">
                <h4>긴장</h4>
                {story.tensions.length === 0 ? (
                    <p className="hint">기사 제목에서 긴장 말을 찾지 못했습니다.</p>
                ) : (
                    <ul className="lw-hf-evidence">
                        {story.tensions.map((tension) => (
                            <EvidenceItem key={`${tension.type}-${tension.matched}`} evidence={tension.evidence}>
                                <span className="lw-hf-chip">{TENSION_LABEL[tension.type] ?? tension.type} · {tension.matched}</span>
                            </EvidenceItem>
                        ))}
                    </ul>
                )}
            </section>

            <section className="lw-hf-section">
                <h4>재미 근거(FUN GAP)</h4>
                {story.funGap.length === 0 ? (
                    <p className="hint">근거가 있는 재미 요소가 없습니다 — 근거 없는 재미는 만들지 않습니다.</p>
                ) : (
                    <ul className="lw-hf-evidence">
                        {story.funGap.map((reason) => (
                            <EvidenceItem key={reason.flag} evidence={reason.evidence}>
                                <span className="lw-hf-chip good">{FUN_GAP_LABEL[reason.flag] ?? reason.flag}</span>
                                <span>{reason.note}</span>
                            </EvidenceItem>
                        ))}
                    </ul>
                )}
            </section>

            <section className="lw-hf-section">
                <h4>각도</h4>
                {story.dominantAngle && <p>가장 많이 쓰인 각도 <b>{story.dominantAngle.label}</b></p>}
                {story.alternativeAngles.length === 0 ? (
                    <p className="hint">표본 안에 다른 각도의 기사가 없습니다.</p>
                ) : (
                    <ul className="lw-hf-evidence">
                        {story.alternativeAngles.map((angle) => angle.evidence[0] && (
                            <EvidenceItem key={angle.label} evidence={angle.evidence[0]}>
                                <span className="lw-hf-chip">다른 각도 · {angle.label}</span>
                            </EvidenceItem>
                        ))}
                    </ul>
                )}
                <p className="hint">근거 폭 · {ANGLE_CONFIDENCE_LABEL[story.angleConfidence]}</p>
            </section>

            <section className="lw-hf-section">
                <h4>본문에서 풀 이야기 {story.payoffLayers.length}개</h4>
                {story.payoffLayers.length === 0 ? (
                    <p className="hint">숫자 · 인용 · 사건 말이 표본에 없습니다 — 글이 한 줄로 끝날 수 있습니다.</p>
                ) : (
                    <ul className="lw-hf-evidence">
                        {story.payoffLayers.map((layer) => (
                            <EvidenceItem key={`${layer.kind}-${layer.value}`} evidence={layer.evidence}>
                                <span className="lw-hf-chip">{LAYER_KIND[layer.kind]} · {layer.value}</span>
                            </EvidenceItem>
                        ))}
                    </ul>
                )}
            </section>

            <section className="lw-hf-section">
                <h4>카드만 보고 이해되나 · 한 줄로 전할 수 있나</h4>
                <CheckList checks={story.noSearch.checks} labels={CHECK_LABEL} />
                <p className="hint">홈판은 검색해서 들어오는 자리가 아니라 지나가다 보는 자리입니다. 앞의 세 가지 중 하나라도 ✕면 지금 쓰기에는 이릅니다.</p>
                <p>한 줄 요약 {story.tellability.passed ? <b>{story.tellability.sentence}</b> : `— ${reasonLabel(story.tellability.reason)}`}</p>
            </section>

            <section className="lw-hf-section">
                <h4>AI 보강(근거 번호 필수)</h4>
                <p className="hint">누를 때만 내 구독 에이전트가 근거 기사 제목을 다시 읽어 긴장 · 재미 근거를 분류합니다. 근거 번호가 없는 항목은 앱이 버리고, 규칙 판정(창 · 상태)은 바꾸지 않습니다.</p>
                <div className="lw-hf-filter-row">
                    <ProviderSelect value={provider} onChange={setProvider} disabled={busy} />
                    <button type="button" className="lw-hf-btn" disabled={busy} onClick={runReview}>{review ? 'AI 보강 다시' : 'AI 보강'}</button>
                    {busy && <span className="lw-hf-busy">AI 가 기사 제목을 읽는 중…</span>}
                </div>
                {error && <p className="lw-hf-error">{error}</p>}
                {review && (
                    <>
                        <p className="hint">{review.provider} · {formatTime(review.createdAt)}{review.stale ? ' · 근거 기사가 바뀌어 옛 결과입니다' : ''}</p>
                        <ul className="lw-hf-evidence">
                            {review.tensions.map((row) => story.evidence[row.evidenceIndex] && (
                                <EvidenceItem key={`t-${row.type}-${row.evidenceIndex}`} evidence={story.evidence[row.evidenceIndex]}>
                                    <span className="lw-hf-chip ai">AI · {TENSION_LABEL[row.type] ?? row.type}</span>
                                    <span>{row.note}</span>
                                </EvidenceItem>
                            ))}
                            {review.funGap.map((row) => story.evidence[row.evidenceIndex] && (
                                <EvidenceItem key={`f-${row.flag}-${row.evidenceIndex}`} evidence={story.evidence[row.evidenceIndex]}>
                                    <span className="lw-hf-chip ai">AI · {FUN_GAP_LABEL[row.flag] ?? row.flag}</span>
                                    <span>{row.note}</span>
                                </EvidenceItem>
                            ))}
                        </ul>
                        {review.risks.length > 0 && <p className="hint">AI 가 본 위험 · {review.risks.join(' · ')}</p>}
                    </>
                )}
            </section>
        </>
    );
}
