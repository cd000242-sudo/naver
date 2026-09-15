import { useEffect, useState } from 'react';
import { hfImage, hfImageObjectUrl, hfVisual, type HfImageRecord, type HfPromptPlan, type HfStoryDetail } from '../../../lib/homefeedBridge';
import {
    CHECK_LABEL, IMAGE_ROLE_LABEL, READINESS_LABEL, RIGHTS_LABEL, STRATEGY_LABEL, SUITABILITY_LABEL, WATERMARK_LABEL, formatTime,
} from '../../../lib/homefeedModel.mjs';
import { CheckList, ProviderSelect, copyToClipboard, failureOf } from './HomefeedParts';

/**
 * 이미지 · 썸네일 — 전략 · 실제 이미지 가이드 · AI 프롬프트(고치고 생성) · 썸네일 계획 · 만든 AI 이미지(원본 · 1:1 · 16:9 자르기).
 * 기사 사진은 권리 확인 전 후보, 워터마크는 자동으로 알 수 없다. AI 이미지는 앱이 붙인 표기를 그대로 보여 준다.
 * 생성은 앱이 코덱스 구독의 내장 이미지 도구로만 한다(유료 API 키 경로 없음).
 */

const ASPECTS = ['16:9', '1:1', '4:3', '3:4', '9:16'];

function GeneratedImage({ record }: { record: HfImageRecord }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        let created: string | null = null;
        void hfImageObjectUrl(record.id).then((objectUrl) => {
            if (!alive) {
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                return;
            }
            created = objectUrl;
            setUrl(objectUrl);
        });
        return () => {
            alive = false;
            if (created) URL.revokeObjectURL(created);
        };
    }, [record.id]);

    return (
        <div className="lw-hf-section">
            <p>
                <b>{record.label}</b>{' '}
                <span className="hint">
                    {formatTime(record.createdAt)} · 비율 {record.aspectRatio} · {record.width && record.height ? `${record.width}×${record.height}` : '크기 미측정'}
                </span>
            </p>
            {url ? (
                <div className="lw-hf-crops">
                    <div className="lw-hf-crop"><div className="lw-hf-crop-orig"><img src={url} alt={`${record.label} 원본`} /></div><span>원본</span></div>
                    <div className="lw-hf-crop"><div className="lw-hf-crop-square"><img src={url} alt="" /><span className="lw-hf-ai-label">AI 생성</span></div><span>썸네일 1:1 자르기</span></div>
                    <div className="lw-hf-crop"><div className="lw-hf-crop-wide"><img src={url} alt="" /><span className="lw-hf-ai-label">AI 생성</span></div><span>16:9 자르기</span></div>
                </div>
            ) : (
                <p className="hint">이미지를 불러오는 중이거나 앱에서 받지 못했습니다.</p>
            )}
            <details className="lw-hf-fold"><summary>쓴 프롬프트</summary><p>{record.promptEn}</p></details>
        </div>
    );
}

export default function HomefeedVisual({ detail, imageProvider, onChanged, onSettings }: {
    detail: HfStoryDetail;
    imageProvider: string;
    onChanged: () => void;
    onSettings: () => void;
}) {
    const { story } = detail;
    const prompts = detail.assets.prompts;
    const canGenerate = imageProvider === 'codex-builtin';
    const [provider, setProvider] = useState('');
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [aspects, setAspects] = useState<Record<string, string>>({});

    const refine = async () => {
        setBusy('refine');
        setError('');
        const result = await hfVisual(story.id, provider, true);
        setBusy('');
        if (result.status === 'ok') onChanged();
        else setError(failureOf(result, '프롬프트 다듬기 실패') ?? '');
    };

    const generate = async (plan: HfPromptPlan) => {
        setBusy(plan.id);
        setError('');
        setNotice('');
        const result = await hfImage(story.id, plan.id, drafts[plan.id] ?? plan.finalPromptEn, aspects[plan.id] ?? plan.aspectRatio);
        setBusy('');
        if (result.status !== 'ok') {
            setError(failureOf(result, '이미지 생성 실패') ?? '');
            return;
        }
        if (result.result.status === 'ok') {
            setNotice('이미지를 만들었습니다 — 아래 "만든 AI 이미지"에서 확인하세요.');
            onChanged();
        } else {
            setError(result.result.message);
        }
    };

    return (
        <>
            <section className="lw-hf-section">
                <h4>이미지 전략 · {STRATEGY_LABEL[story.visual.strategy] ?? story.visual.strategy}</h4>
                <p>{story.visual.reason}</p>
                <div className="lw-hf-grid2">
                    <p><b>실제 사진이 나은 이유</b><br />{story.visual.whyReal}</p>
                    <p><b>AI 이미지가 나은 이유</b><br />{story.visual.whyAi}</p>
                </div>
                {story.visual.evidenceImageRequired && <p className="hint">사실 증명이 필요한 주제입니다 — AI 이미지를 증거 사진 자리에 쓰지 마세요.</p>}
            </section>

            <section className="lw-hf-section">
                <h4>실제 이미지 가이드</h4>
                <p className="hint">기사 대표이미지(og:image) 후보입니다. 권리는 확인 전이고 워터마크는 자동으로 알 수 없습니다 — 쓰기 전에 원문에서 직접 확인하세요.</p>
                {story.realImages.length === 0 ? (
                    <p>기사 대표이미지 후보가 없습니다.</p>
                ) : (
                    <div className="lw-hf-images">
                        {story.realImages.map((item) => (
                            <div key={item.id} className="lw-hf-image">
                                <div className="lw-hf-image-media">
                                    {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="lw-hf-ph">사진 없음</div>}
                                </div>
                                <dl className="lw-hf-kv">
                                    <dt>역할</dt><dd>{IMAGE_ROLE_LABEL[item.role] ?? item.role}</dd>
                                    <dt>출처</dt><dd><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{item.sourceName ?? '매체 미상'}</a> · {item.pageLocation}</dd>
                                    <dt>권리</dt><dd>{RIGHTS_LABEL[item.rightsStatus] ?? item.rightsStatus}</dd>
                                    <dt>워터마크</dt><dd>{WATERMARK_LABEL[item.watermark]}</dd>
                                    <dt>왜 이 사진</dt><dd>{item.whyThisImage}</dd>
                                    <dt>자를 곳</dt><dd>{item.cropFocus}</dd>
                                    <dt>피할 것</dt><dd>{item.avoidCrop}</dd>
                                    <dt>모바일</dt><dd>{item.mobileReadability}</dd>
                                    <dt>썸네일</dt><dd>{SUITABILITY_LABEL[item.thumbnailSuitability.label]} — {item.thumbnailSuitability.basis}</dd>
                                </dl>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="lw-hf-section">
                <h4>AI 이미지 프롬프트{detail.assets.promptsRefinedBy ? ` · ${detail.assets.promptsRefinedBy} 가 다듬음` : ''}</h4>
                <p className="hint">
                    {canGenerate
                        ? '코덱스 구독의 내장 이미지 도구로 만듭니다(유료 API 키를 쓰지 않습니다). 만든 이미지에는 AI 생성 표기가 붙습니다. 코덱스 사용 한도에 걸리면 다시 가능한 시각을 그대로 알려 드립니다.'
                        : '이미지 생성이 꺼져 있습니다 — 프롬프트를 복사해 쓰거나 설정에서 "코덱스 구독으로 생성"을 켜세요.'}
                </p>
                <div className="lw-hf-filter-row">
                    <ProviderSelect value={provider} onChange={setProvider} disabled={Boolean(busy)} />
                    <button type="button" className="lw-hf-btn" disabled={Boolean(busy)} onClick={refine}>AI 로 프롬프트 다듬기</button>
                    {!canGenerate && <button type="button" className="lw-hf-btn" onClick={onSettings}>이미지 생성 설정</button>}
                    {busy === 'refine' && <span className="lw-hf-busy">다듬는 중…</span>}
                </div>
                {error && <p className="lw-hf-error">{error}</p>}
                {notice && <p className="lw-hf-busy">{notice}</p>}
                {prompts.map((plan) => (
                    <div key={plan.id} className="lw-hf-prompt">
                        <p><b>{plan.purpose}</b> <span className="hint">{plan.placement}{plan.realPersonSafe ? ' · 실존 인물 얼굴 없이 상징 장면' : ''}</span></p>
                        <dl className="lw-hf-kv">
                            <dt>구도</dt><dd>{plan.composition}</dd>
                            <dt>조명 · 카메라</dt><dd>{plan.lighting} · {plan.camera}</dd>
                            <dt>제외</dt><dd>{plan.negativePrompt}</dd>
                        </dl>
                        <details className="lw-hf-fold">
                            <summary>한국어 프롬프트</summary>
                            <p>{plan.finalPromptKo}</p>
                            <button type="button" className="lw-hf-btn small" onClick={() => copyToClipboard(plan.finalPromptKo)}>한국어 복사</button>
                        </details>
                        <label className="hint" htmlFor={`hf-prompt-${plan.id}`}>생성에 쓸 프롬프트(고칠 수 있음 · 1,500자까지)</label>
                        <textarea
                            id={`hf-prompt-${plan.id}`}
                            value={drafts[plan.id] ?? plan.finalPromptEn}
                            maxLength={1500}
                            onChange={(event) => setDrafts({ ...drafts, [plan.id]: event.target.value.slice(0, 1500) })}
                        />
                        <div className="lw-hf-filter-row">
                            <select className="lw-hf-select" aria-label="이미지 비율" value={aspects[plan.id] ?? plan.aspectRatio} onChange={(event) => setAspects({ ...aspects, [plan.id]: event.target.value })}>
                                {ASPECTS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                            </select>
                            <button type="button" className="lw-hf-btn small" onClick={() => copyToClipboard(drafts[plan.id] ?? plan.finalPromptEn)}>프롬프트 복사</button>
                            <button type="button" className="lw-hf-btn small primary" disabled={Boolean(busy) || !canGenerate} onClick={() => generate(plan)}>AI 이미지 생성</button>
                            {busy === plan.id && <span className="lw-hf-busy">만드는 중… 1~3분 걸릴 수 있습니다</span>}
                        </div>
                    </div>
                ))}
            </section>

            <section className="lw-hf-section">
                <h4>썸네일 계획 · {story.thumbnail.type} · {READINESS_LABEL[story.thumbnail.readiness] ?? story.thumbnail.readiness}</h4>
                <p>{story.thumbnail.goal}</p>
                <dl className="lw-hf-kv">
                    <dt>문구</dt><dd>{story.thumbnail.textOverlay.join(' / ') || '문구 없음'}</dd>
                    <dt>문구 후보</dt><dd>{story.thumbnail.copyVariants.join(' · ') || '없음'}</dd>
                    <dt>문구 위치</dt><dd>{story.thumbnail.textPosition}</dd>
                    <dt>자르기</dt><dd>{story.thumbnail.crop.position} · {story.thumbnail.crop.margin}{story.thumbnail.crop.removeBackground ? ' · 배경 걷기' : ''}</dd>
                    <dt>시선</dt><dd>{story.thumbnail.crop.gaze}</dd>
                    <dt>1초 식별</dt><dd>{story.thumbnail.crop.identifiableIn1s}</dd>
                    <dt>보는 순서</dt><dd>{story.thumbnail.visualHierarchy}</dd>
                </dl>
                {story.thumbnail.readinessReasons.length > 0 && <p className="hint">{story.thumbnail.readinessReasons.map((reason) => CHECK_LABEL[reason] ?? reason).join(' · ')}</p>}
                <CheckList checks={story.thumbnail.evaluation} labels={CHECK_LABEL} />
                <p className="hint">쓰지 말 것 · {story.thumbnail.doNotUse.join(' · ')}</p>
            </section>

            {detail.assets.images.length > 0 && (
                <section className="lw-hf-section">
                    <h4>만든 AI 이미지 {detail.assets.images.length}장</h4>
                    {detail.assets.images.map((record) => <GeneratedImage key={record.id} record={record} />)}
                </section>
            )}
        </>
    );
}
