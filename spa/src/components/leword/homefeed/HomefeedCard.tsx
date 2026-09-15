import type { HfStorySummary } from '../../../lib/homefeedBridge';
import {
    CATEGORY_LABEL, READINESS_LABEL, SOURCE_LABEL, STATUS_LABEL, STRATEGY_LABEL, TENSION_LABEL, UNMEASURED, WINDOW_LABEL,
    formatAge, formatPresence, formatRankDelta, formatSaturation, formatSigned, formatVelocity, reasonLabel,
} from '../../../lib/homefeedModel.mjs';
import { Metric } from './HomefeedParts';

/** 스토리 카드 한 장 — 판정 · 새 사실 · 실측 신호 · 근거 요약. 목록은 저장된 계산본만 그린다(AI 호출 없음). */

function progressText(progress: HfStorySummary['progress']): string {
    const parts = [
        progress.titles ? '제목 후보 있음' : '',
        progress.selected ? '제목 고름' : '',
        progress.drafts > 0 ? `원고 ${progress.drafts}` : '',
        progress.images > 0 ? `AI 이미지 ${progress.images}` : '',
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : '아직 만든 것 없음';
}

export default function HomefeedCard({ story, onOpen }: { story: HfStorySummary; onOpen: () => void }) {
    const s = story.signals;
    const rank = s.rankNow !== null
        ? `${SOURCE_LABEL[s.rankSource ?? ''] ?? s.rankSource} ${s.rankNow}위 · 30분 ${formatRankDelta(s.rankDelta30m)}`
        : '실시간 순위 미측정';
    const risks = story.risks.filter((risk) => risk !== 'AGE_CENSORED');

    return (
        <article className={`lw-hf-card is-${story.status.state}`}>
            <div className="lw-hf-card-head">
                <span className={`lw-hf-chip s-${story.status.state}`}>{STATUS_LABEL[story.status.state]}</span>
                <span className={`lw-hf-chip w-${story.window.state}`}>창 · {WINDOW_LABEL[story.window.state]}</span>
                <span className="lw-hf-chip">{CATEGORY_LABEL[story.category] ?? story.category}</span>
                <span className="lw-hf-chip">{formatAge(s.ageMinutes, s.firstSeenCensored)}</span>
                <span className="lw-hf-rank">{rank}</span>
            </div>

            <h3 className="lw-hf-keyword">
                {story.keyword}
                {story.anchor.text && story.anchor.text !== story.keyword && <small>기준어 {story.anchor.text}</small>}
            </h3>

            <p className="lw-hf-delta">
                {story.delta
                    ? <>새 사실 <b>{story.delta.text}</b><span className="src">{story.delta.evidence.press ?? '매체 미상'}</span></>
                    : <>새 사실 — {reasonLabel(story.deltaReason ?? 'NO_FRESH_DELTA')}</>}
            </p>
            <p className="lw-hf-delta"><span className="src">판정 사유 · {story.status.reasons.slice(0, 3).map(reasonLabel).join(' · ')}</span></p>

            <div className="lw-hf-metrics">
                <Metric label="원천 확산" value={s.sourceCountNow === null ? UNMEASURED : `${s.sourceCountNow}곳`} note={`30분 ${formatSigned(s.sourceDelta30m, '곳')}`} />
                <Metric label="블로그 글 증가(30분)" value={formatSigned(s.docDelta30m, '건')} note={formatVelocity(s.docVelocity30m)} />
                <Metric label="증가 가속" value={formatSigned(s.docAcceleration, '건')} note="0~30분 증가 − 30~60분 증가" />
                <Metric label="같은 제목 포화" value={formatSaturation(s.sampleN, s.cloneN)} note={`매체 ${s.pressCountNow}곳`} />
                <Metric label="지속" value={formatPresence(s.presence60m)} note={`최신부터 연속 ${s.persistenceStreak}회`} />
                <Metric label="이미지 후보" value={`${s.visualCandidateCount}개`} note="기사 대표이미지 · 권리 확인 필요" />
            </div>

            <div className="lw-hf-tags">
                {story.tensions.slice(0, 3).map((tension) => (
                    <span key={`${tension.type}-${tension.matched}`} className="lw-hf-chip">{TENSION_LABEL[tension.type] ?? tension.type} · {tension.matched}</span>
                ))}
                <span className={`lw-hf-chip${story.funGap.length > 0 ? ' good' : ''}`}>재미 근거 {story.funGap.length}</span>
                <span className="lw-hf-chip">다른 각도 {story.alternativeAngles.length}</span>
                <span className="lw-hf-chip">정보층 {story.payoffCount}</span>
                <span className={`lw-hf-chip ${story.noSearchPassed ? 'good' : 'bad'}`}>검색 없이 이해 {story.noSearchPassed ? '통과' : '미통과'}</span>
                <span className="lw-hf-chip">{STRATEGY_LABEL[story.visualStrategy] ?? story.visualStrategy}</span>
                <span className={`lw-hf-chip ${story.thumbnail.readiness === 'READY' ? 'good' : 'warn'}`}>{READINESS_LABEL[story.thumbnail.readiness] ?? story.thumbnail.readiness}</span>
                {risks.map((risk) => <span key={risk} className="lw-hf-chip warn">{reasonLabel(risk)}</span>)}
            </div>

            <div className="lw-hf-card-foot">
                <span className="lw-hf-progress">{progressText(story.progress)}</span>
                <button type="button" className="lw-hf-btn primary" onClick={onOpen}>자세히 · 첫 카드 · 제목</button>
            </div>
        </article>
    );
}
