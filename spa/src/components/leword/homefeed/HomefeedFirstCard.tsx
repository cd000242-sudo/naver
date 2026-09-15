import { useState } from 'react';
import type { HfCardVariant, HfStoryDetail } from '../../../lib/homefeedBridge';
import { CHECK_LABEL, STRATEGY_LABEL } from '../../../lib/homefeedModel.mjs';
import { CheckList } from './HomefeedParts';

/**
 * 첫 카드 미리보기 — 중립 피드 카드 3안(실제 이미지형 · 숫자/문구형 · 미니멀형).
 * 특정 서비스 화면을 흉내 내지 않는다. 문구는 근거 기사에 있는 말 조각이고, 제목 문장은 [제목 · 원고]에서 만든다.
 * 기사 사진은 권리 확인 전 후보라 미리보기에서도 그렇게 표시한다.
 */

const CHOICE_KEY = 'leaderspro.homefeed.cardChoice.v1';

function readChoice(issueKey: string): string {
    try {
        const saved = JSON.parse(localStorage.getItem(CHOICE_KEY) || '{}') as Record<string, unknown>;
        const value = saved[issueKey];
        return value === 'A' || value === 'B' || value === 'C' ? value : 'A';
    } catch {
        return 'A';
    }
}

function writeChoice(issueKey: string, id: string): void {
    try {
        const saved = JSON.parse(localStorage.getItem(CHOICE_KEY) || '{}') as Record<string, string>;
        localStorage.setItem(CHOICE_KEY, JSON.stringify({ ...saved, [issueKey]: id }));
    } catch {
        /* 기억하지 못해도 화면은 된다 */
    }
}

export default function HomefeedFirstCard({ detail, onGo }: { detail: HfStoryDetail; onGo: (pane: 'visual' | 'write') => void }) {
    const { story } = detail;
    const realImages = story.realImages.filter((item) => item.imageUrl);
    const [chosen, setChosen] = useState(() => readChoice(story.issueKey));
    const [imageIndex, setImageIndex] = useState(0);
    const [edits, setEdits] = useState<Record<string, { line1: string; line2: string }>>({});
    const [editing, setEditing] = useState('');

    const choose = (id: string) => {
        setChosen(id);
        writeChoice(story.issueKey, id);
    };
    const textOf = (variant: HfCardVariant) => edits[variant.id] ?? { line1: variant.line1, line2: variant.line2 ?? '' };
    const setLine = (variant: HfCardVariant, field: 'line1' | 'line2', value: string) => {
        setEdits((previous) => ({ ...previous, [variant.id]: { ...textOf(variant), [field]: value.slice(0, 16) } }));
    };

    return (
        <>
            <section className="lw-hf-section">
                <h4>첫 카드 미리보기 · {STRATEGY_LABEL[story.firstCard.imageStrategy] ?? story.firstCard.imageStrategy}</h4>
                <p className="hint">
                    특정 서비스 화면을 흉내 내지 않은 중립 카드입니다. 문구는 근거 기사에 실제로 있는 말 조각이고, 제목 문장은 [제목 · 원고]에서 만듭니다.
                    자르기 안내 — {story.firstCard.cropGuidance}
                </p>
                <div className="lw-hf-feedcards">
                    {story.firstCard.variants.map((variant) => {
                        const text = textOf(variant);
                        const real = variant.image.kind === 'real' && realImages.length > 0 ? realImages[imageIndex % realImages.length] : null;
                        return (
                            <div key={variant.id} className={`lw-hf-feedcard${chosen === variant.id ? ' chosen' : ''}`}>
                                <div className="lw-hf-feedcard-media">
                                    {real?.imageUrl ? (
                                        <img src={real.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className={`lw-hf-ph${variant.image.kind === 'ai' ? ' ai' : ''}`}>
                                            {variant.image.kind === 'ai' ? 'AI 생성 이미지 자리' : '실제 사진 필요'}
                                        </div>
                                    )}
                                    {variant.image.kind === 'ai' && <span className="lw-hf-ai-label">AI 생성 이미지 자리</span>}
                                    <div className="lw-hf-feedcard-text">
                                        <b>{text.line1}</b>
                                        {text.line2 && <span>{text.line2}</span>}
                                    </div>
                                </div>
                                <div className="lw-hf-feedcard-meta">
                                    <span>{variant.id}안 · {variant.label}</span>
                                    <span>{real ? `${real.sourceName ?? '매체 미상'} 기사 사진 · 권리 확인 필요` : variant.image.kind === 'ai' ? 'AI 이미지로 만들 장면' : '사진 없음'}</span>
                                </div>
                                {editing === variant.id && (
                                    <div className="lw-hf-form">
                                        <div className="lw-hf-field">
                                            <label htmlFor={`hf-card-${variant.id}-1`}>첫 줄</label>
                                            <input id={`hf-card-${variant.id}-1`} value={text.line1} maxLength={16} onChange={(event) => setLine(variant, 'line1', event.target.value)} />
                                        </div>
                                        <div className="lw-hf-field">
                                            <label htmlFor={`hf-card-${variant.id}-2`}>둘째 줄</label>
                                            <input id={`hf-card-${variant.id}-2`} value={text.line2} maxLength={16} onChange={(event) => setLine(variant, 'line2', event.target.value)} />
                                            <small>근거에 없는 사실을 넣지 마세요.</small>
                                        </div>
                                    </div>
                                )}
                                <div className="lw-hf-card-foot">
                                    <button type="button" className="lw-hf-btn small primary" onClick={() => choose(variant.id)}>
                                        {chosen === variant.id ? '이 카드 사용 중' : '이 카드 사용'}
                                    </button>
                                    <button type="button" className="lw-hf-btn small" disabled={realImages.length < 2 || variant.image.kind !== 'real'} onClick={() => setImageIndex((index) => index + 1)}>
                                        다른 이미지
                                    </button>
                                    <button type="button" className="lw-hf-btn small" onClick={() => setEditing(editing === variant.id ? '' : variant.id)}>
                                        {editing === variant.id ? '문구 닫기' : '문구 변경'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="lw-hf-card-foot">
                    <button type="button" className="lw-hf-btn" onClick={() => onGo('visual')}>AI 이미지 생성</button>
                    <button type="button" className="lw-hf-btn primary" onClick={() => onGo('write')}>원고로 진행</button>
                </div>
            </section>

            <section className="lw-hf-section">
                <h4>카드 검사</h4>
                <CheckList checks={story.firstCard.checks} labels={CHECK_LABEL} />
                <p className="hint">{story.firstCard.possible ? '카드로 만들 수 있습니다.' : '걸림 말 또는 이미지가 없어 아직 카드로 만들기 어렵습니다.'} {story.firstCard.reason}</p>
            </section>
        </>
    );
}
