import type { HfStorySummary } from '../../../lib/homefeedBridge';
import {
    CATEGORY_LABEL, SOURCE_LABEL, STATUS_LABEL, UNMEASURED, WINDOW_LABEL, editorialCardModel,
    formatAge, formatPresence, formatRankDelta, formatSaturation, formatSigned, formatVelocity, reasonLabel,
} from '../../../lib/homefeedModel.mjs';
import { Metric } from './HomefeedParts';

/** 사건과 제안을 먼저 읽고, 필요하면 수집 신호를 펼친다. 목록 렌더링은 저장 데이터만 쓴다. */
export default function HomefeedCard({ story, onOpen }: { story: HfStorySummary; onOpen: () => void }) {
    const s = story.signals;
    const card = editorialCardModel(story.editorial, story.delta?.evidence.title || story.keyword);
    const rank = s.rankNow !== null ? `${SOURCE_LABEL[s.rankSource ?? ''] ?? s.rankSource} ${s.rankNow}위 · 30분 ${formatRankDelta(s.rankDelta30m)}` : '실시간 순위 미측정';
    return <article className={`lw-hf-card is-${story.status.state}`}>
        <div className="lw-hf-card-head">
            <span className={`lw-hf-chip ${story.editorial?.state === 'ready' ? 'good' : ''}`}>{card.stateLabel}</span>
            <span className="lw-hf-chip">{CATEGORY_LABEL[story.category] ?? story.category}</span>
            <span className="lw-hf-rank">{story.keyword}</span>
        </div>
        {card.sourceOnly && <p className="lw-hf-eyebrow">기사 제목 · 작성안 준비 전</p>}
        <h3 className="lw-hf-keyword">{card.headline}</h3>
        {card.angle ? <div className="lw-hf-editorial-pitch"><p><b>추천 관점</b>{card.angle}</p><p><b>독자 질문</b>{card.question}</p>{card.audience && <p><b>이 글의 독자</b>{card.audience}</p>}</div>
            : <p className="lw-hf-editorial-pending">기사 근거를 읽으면 추천 관점과 본문에서 답할 질문을 준비합니다.</p>}
        <details className="lw-hf-fold">
            <summary>수집 신호 · {STATUS_LABEL[story.status.state]} · 창 {WINDOW_LABEL[story.window.state]}</summary>
            <p className="hint">{formatAge(s.ageMinutes, s.firstSeenCensored)} · {rank}</p>
            <p className="hint">규칙 사유 · {story.status.reasons.map(reasonLabel).join(' · ')}</p>
            <div className="lw-hf-metrics">
                <Metric label="원천 확산" value={s.sourceCountNow === null ? UNMEASURED : `${s.sourceCountNow}곳`} note={`30분 ${formatSigned(s.sourceDelta30m, '곳')}`} />
                <Metric label="블로그 글 증가(30분)" value={formatSigned(s.docDelta30m, '건')} note={formatVelocity(s.docVelocity30m)} />
                <Metric label="증가 가속" value={formatSigned(s.docAcceleration, '건')} note="0~30분 증가 − 30~60분 증가" />
                <Metric label="같은 제목 포화" value={formatSaturation(s.sampleN, s.cloneN)} note={`매체 ${s.pressCountNow}곳`} />
                <Metric label="지속" value={formatPresence(s.presence60m)} note={`최신부터 연속 ${s.persistenceStreak}회`} />
                <Metric label="이미지 후보" value={`${s.visualCandidateCount}개`} note="기사 대표이미지 · 권리 확인 필요" />
            </div>
            {story.risks.length > 0 && <p className="hint">{story.risks.map(reasonLabel).join(' · ')}</p>}
        </details>
        <div className="lw-hf-card-foot"><span className="lw-hf-progress">{story.editorial?.selection ? '내 작성 방향 저장됨' : card.sourceOnly ? '기사 근거부터 확인하세요' : '관점과 근거를 읽고 결정하세요'}</span><button type="button" className="lw-hf-btn primary" onClick={onOpen}>{story.editorial?.public ? '공개 근거 읽기' : '작성안 · 근거 읽기'}</button></div>
    </article>;
}
