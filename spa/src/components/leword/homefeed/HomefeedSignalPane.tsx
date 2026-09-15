import type { HfStoryDetail } from '../../../lib/homefeedBridge';
import {
    SOURCE_LABEL, STATUS_LABEL, UNMEASURED, WINDOW_LABEL,
    formatAge, formatCount, formatPresence, formatRankDelta, formatSaturation, formatSigned, formatTime, formatVelocity, reasonLabel,
} from '../../../lib/homefeedModel.mjs';
import { EvidenceItem, Metric } from './HomefeedParts';

/** 상세 · 신호와 판정 — 창/상태 사유, 실측 신호, 수집 이력, 근거 기사. */

function cloneTrend(now: number | null, before: number | null): string {
    if (now === null || before === null) return '30분 전 비교 미측정';
    if (now > before) return '30분 전보다 비슷한 제목 비율이 높아짐';
    if (now < before) return '30분 전보다 낮아짐';
    return '30분 전과 같음';
}

export default function HomefeedSignalPane({ detail }: { detail: HfStoryDetail }) {
    const { story, timeline } = detail;
    const s = story.signals;

    return (
        <>
            <section className="lw-hf-section">
                <h4>판정</h4>
                <div className="lw-hf-grid2">
                    <div>
                        <p><b>창 · {WINDOW_LABEL[story.window.state]}</b></p>
                        <ul className="lw-hf-checks">
                            {story.window.reasons.map((reason) => <li key={reason}><b aria-hidden="true">·</b><span>{reasonLabel(reason)}</span></li>)}
                        </ul>
                    </div>
                    <div>
                        <p><b>상태 · {STATUS_LABEL[story.status.state]}</b></p>
                        <ul className="lw-hf-checks">
                            {story.status.reasons.map((reason) => <li key={reason}><b aria-hidden="true">·</b><span>{reasonLabel(reason)}</span></li>)}
                        </ul>
                    </div>
                </div>
                <p className="hint">판정은 실측과 규칙으로만 합니다. 임계값은 보정 전 가설값이며 관리자 설정에서 고칩니다. 확률 · 점수가 아닙니다.</p>
                {story.risks.length > 0 && <p className="hint">주의 · {story.risks.map(reasonLabel).join(' · ')}</p>}
            </section>

            <section className="lw-hf-section">
                <h4>신호 실측</h4>
                <div className="lw-hf-metrics">
                    <Metric label="처음 본 시각" value={formatAge(s.ageMinutes, s.firstSeenCensored)} note={s.firstSeenAt ? formatTime(s.firstSeenAt) : undefined} />
                    <Metric
                        label="실시간 순위"
                        value={s.rankNow === null ? UNMEASURED : `${s.rankNow}위`}
                        note={`${SOURCE_LABEL[s.rankSource ?? ''] ?? '원천 없음'} · 30분 ${formatRankDelta(s.rankDelta30m)} · 60분 ${formatRankDelta(s.rankDelta60m)}`}
                    />
                    <Metric
                        label="원천 확산"
                        value={s.sourceCountNow === null ? UNMEASURED : `${s.sourceCountNow}곳`}
                        note={s.sourceNames.map((name) => SOURCE_LABEL[name] ?? name).join(' · ') || '실시간 목록에 없음'}
                    />
                    <Metric label="뉴스 검색 결과" value={formatCount(s.newsTotalNow, '건')} note={`30분 ${formatSigned(s.newsDelta30m, '건')}`} />
                    <Metric
                        label="블로그 문서수"
                        value={formatCount(s.blogDocNow, '건')}
                        note={`10분 ${formatSigned(s.docDelta10m)} · 30분 ${formatSigned(s.docDelta30m)} · 60분 ${formatSigned(s.docDelta60m)}`}
                    />
                    <Metric label="증가 속도" value={formatVelocity(s.docVelocity30m)} note={`가속 ${formatSigned(s.docAcceleration, '건')}`} />
                    <Metric label="같은 제목 포화" value={formatSaturation(s.sampleN, s.cloneN)} note={cloneTrend(s.cloneRatio, s.cloneRatioPrev30m)} />
                    <Metric label="지속" value={formatPresence(s.presence60m)} note={`최신부터 연속 ${s.persistenceStreak}회`} />
                    <Metric label="매체 · 이미지 후보" value={`매체 ${s.pressCountNow}곳`} note={`이미지 후보 ${s.visualCandidateCount}개`} />
                </div>
            </section>

            <section className="lw-hf-section">
                <h4>수집 이력(최근 7시간)</h4>
                <div className="lw-hf-table-wrap">
                    <table className="lw-hf-table">
                        <thead>
                            <tr><th>시각</th><th>실시간 목록</th><th>Signal.bz 순위</th><th>원천 수</th><th>뉴스 결과</th><th>블로그 문서</th><th>표본</th></tr>
                        </thead>
                        <tbody>
                            {[...timeline].reverse().map((point) => (
                                <tr key={point.capturedAt}>
                                    <td>{formatTime(point.capturedAt)}</td>
                                    {point.present ? (
                                        <>
                                            <td>있음</td>
                                            <td>{point.rank === null ? '목록 밖' : `${point.rank}위`}</td>
                                            <td>{formatCount(point.sourceCount, '곳')}</td>
                                            <td>{formatCount(point.newsTotal)}</td>
                                            <td>{formatCount(point.blogDocCount)}</td>
                                            <td>{formatCount(point.sampleN, '건')}</td>
                                        </>
                                    ) : (
                                        <td className="muted" colSpan={6}>그 회차 상위 목록에 없음(값을 재지 않음)</td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="hint">앱이 꺼져 있던 구간은 기록이 없습니다. 이 구간을 걸친 증가량은 미측정으로 남습니다.</p>
            </section>

            {story.boardWhy && (
                <section className="lw-hf-section">
                    <h4>사이트 이슈 보드의 '왜 뜨나'</h4>
                    <p>{story.boardWhy}</p>
                    <p className="hint">하루 3회 회차가 헤드라인으로 검증한 문장입니다.</p>
                </section>
            )}

            <section className="lw-hf-section">
                <h4>근거 기사 {story.evidence.length}건</h4>
                <ul className="lw-hf-evidence">
                    {story.evidence.map((item) => (
                        <EvidenceItem key={item.url} evidence={item}>
                            <span className="lw-hf-chip">{item.origin === 'site-issue-board' ? '이슈 보드' : '뉴스 검색'}</span>
                        </EvidenceItem>
                    ))}
                </ul>
            </section>
        </>
    );
}
