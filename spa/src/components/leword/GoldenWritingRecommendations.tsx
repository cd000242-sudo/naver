import { useState } from 'react';
import type { PreemptionRow } from './PreemptionCard';
import { assessGoldenEditorial, canReadGoldenWriting, selectGoldenWriting, selectGoldenResearch } from '../../lib/goldenEditorialModel.mjs';
import LicenseGate from './LicenseGate';

type Props = { sourceNote?: string; rows: PreemptionRow[]; currentRows: PreemptionRow[]; freeNames: string[]; unlocked: boolean; now: number; onUnlock: () => void; onAnalyze: (keyword: string) => void };
const date = (iso: string | null | undefined) => { const time = Date.parse(iso || ''); return Number.isFinite(time) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(time) : '확인일 없음'; };
const count = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR') : '미측정';

export default function GoldenWritingRecommendations({ rows, currentRows, freeNames, unlocked, now, onUnlock, onAnalyze, sourceNote }: Props) {
    const [preferred, setPreferred] = useState('경제·지원금');
    const categories = [...new Set(currentRows.map(row => row.topic).filter(Boolean))];
    const combined = [...currentRows, ...rows];
    const recommendations = selectGoldenWriting(combined, now);
    const recommended = new Set(recommendations.map(item => item.row.keyword));
    const candidates = selectGoldenResearch(currentRows.filter(row => !recommended.has(row.keyword)), preferred);
    const lockedRecommendations = recommendations.filter(item => !canReadGoldenWriting(item.row, unlocked, freeNames)).length;
    const lockedCandidates = candidates.filter(row => !canReadGoldenWriting(row, unlocked, freeNames)).length;
    const lockedCount = lockedRecommendations + lockedCandidates;
    return <details aria-labelledby="golden-writing-title" style={{ padding: 20, margin: '0 0 20px', border: '1px solid var(--lw-line)', borderRadius: 18, background: 'var(--lw-surface)', color: 'var(--lw-text)' }}>
        <summary style={{ cursor: 'pointer', lineHeight: 1.8 }}>
            <strong id="golden-writing-title">★ 오늘의 작성 후보</strong>{' '}
            <span style={{ color: 'var(--lw-accent-ink)', marginLeft: 8 }}>별표 추천 {recommendations.length}개</span>{' '}
            <span style={{ color: 'var(--lw-text-secondary)', marginLeft: 8 }}>최신 조사 {candidates.length}개</span>
            <span style={{ color: 'var(--lw-text-secondary)', marginLeft: 12, fontSize: 13 }}>후보 보기</span>
        </summary>
        <p style={{ color: 'var(--lw-text-secondary)', lineHeight: 1.7, margin: '8px 0 20px' }}>최근 검색 수요·출처·독자 질문·제목이 함께 준비된 후보만 추천합니다. 별표는 작성 준비 기준이며 수익이나 노출을 보장하지 않습니다.</p>
        {sourceNote && <p style={{ color: 'var(--lw-text-secondary)', fontSize: 13 }}>{sourceNote}</p>}
        {recommendations.length === 0 && <div style={{ padding: 16, borderRadius: 14, background: 'var(--lw-surface)', border: '1px solid var(--lw-line)', lineHeight: 1.7 }}><strong>지금은 별표 추천 기준을 모두 충족한 글감이 없습니다.</strong><div style={{ color: 'var(--lw-text-secondary)' }}>최신 조사 후보와 아래 탐색 목록에서 재료를 살펴보세요. 출처나 작성 방향이 부족한 글감에 별표를 붙여 채우지 않습니다.</div></div>}
        <div style={{ display: 'grid', gap: 16 }}>
            {recommendations.filter(item => canReadGoldenWriting(item.row, unlocked, freeNames)).map(({ row, title, sources }) => {

                return <article key={row.keyword} style={{ padding: 'clamp(16px, 3vw, 20px)', borderRadius: 14, border: '1px solid var(--lw-line)', background: 'var(--lw-surface)', overflowWrap: 'anywhere' }}>
                    <div style={{ color: 'var(--lw-accent-ink)', fontSize: 13 }}>★ 작성 추천 · {row.topic} · {row.brief?.timing === 'NOW' ? '지금 확인할 주제' : row.brief?.timing === 'NEXT' ? '미리 준비할 주제' : '상시 질문'}</div>
                    <h3 style={{ margin: '8px 0', fontSize: 22 }}>{row.keyword}</h3>
                    <p style={{ color: 'var(--lw-text-secondary)', fontSize: 13 }}>월 검색량 {count(row.searchVolume)} · 문서량 {count(row.documentCount)} · 검색결과 확인 {date(row.measuredAt)}</p>
                    <dl style={{ display: 'grid', gap: 8, margin: '16px 0', lineHeight: 1.65 }}>
                        {[['독자 질문', row.brief?.primaryIntent], ['왜 쓸까', row.brief?.value], ['검색용 제목 후보', title], ['작성 방향', row.brief?.angle], ['다르게 설명할 내용', row.brief?.differentiation], ['경험·표현 주의', row.brief?.experience]].map(([label, text]) => text && <div key={label}><dt style={{ color: 'var(--lw-text-secondary)', fontSize: 13 }}>{label}</dt><dd style={{ margin: '3px 0 0' }}>{text}</dd></div>)}
                    </dl>
                    <div style={{ borderTop: '1px solid var(--lw-line)', paddingTop: 12 }}><strong style={{ fontSize: 13 }}>확인할 출처</strong>{sources.map((source, index) => <div key={`${source.link}-${index}`} style={{ marginTop: 8 }}><a href={source.link} target="_blank" rel="noreferrer" style={{ color: 'var(--lw-accent-ink)' }}>{source.title}</a><span style={{ fontSize: 13, color: 'var(--lw-text-secondary)' }}> · {date(source.publishedAt)}</span></div>)}</div>
                    <button type="button" className="lw-more-btn" onClick={() => onAnalyze(row.keyword)}>키워드 상세 확인</button>
                </article>;
            })}
        </div>
        {lockedRecommendations > 0 && <p style={{ padding: 16, borderRadius: 14, background: 'var(--lw-surface)' }}>★ 작성 추천 {lockedRecommendations}개는 라이선스 등록 후 확인할 수 있습니다.</p>}
        {currentRows.length > 0 && <label style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>조사 후보의 우선 분야 <select value={preferred} onChange={event => setPreferred(event.target.value)} style={{ color: 'var(--lw-text)', background: 'var(--lw-surface)', border: '1px solid var(--lw-line)', padding: '8px 16px', borderRadius: 10 }}><option value="경제·지원금">경제·지원금 (기본)</option>{categories.filter(topic => topic !== '경제·지원금').map(topic => <option key={topic} value={topic}>{topic}</option>)}</select><span style={{ fontSize: 13, color: 'var(--lw-text-secondary)' }}>선택 분야를 약 70% 우선 배치 · 후보가 있는 만큼 표시</span></label>}
        {candidates.length > 0 && <div style={{ marginTop: 24 }}><h3 style={{ fontSize: 17, marginBottom: 8 }}>최신 조사 후보 · {candidates.length}개</h3><p style={{ color: 'var(--lw-text-secondary)', fontSize: 13 }}>오늘의 글감에서 가져온 후보입니다. 추가 확인 항목을 해결하기 전에는 작성 추천으로 표시하지 않습니다.</p>
            <div style={{ display: 'grid', gap: 12 }}>{candidates.filter(row => canReadGoldenWriting(row, unlocked, freeNames)).map(row => {

                const assessment = assessGoldenEditorial(row, now);
                const dates = row as PreemptionRow & { searchVolumeMeasuredAt?: string | null; documentCountMeasuredAt?: string | null }; 
                return <details key={row.keyword} style={{ border: '1px solid var(--lw-line)', borderRadius: 14, padding: '16px 16px', background: 'var(--lw-surface)', overflowWrap: 'anywhere' }}><summary style={{ cursor: 'pointer', lineHeight: 1.7 }}><strong>{row.keyword}</strong><span style={{ color: 'var(--lw-text-secondary)', fontSize: 13 }}> · {row.topic} · 월 검색량 {count(row.searchVolume)}</span></summary><div style={{ lineHeight: 1.75, marginTop: 12 }}><dl style={{ display: 'grid', gap: 12, margin: '12px 0' }}>{[['독자 질문', row.brief?.primaryIntent], ['무슨 일이 있었나', row.brief?.value], ['작성 방향', row.brief?.angle], ['검색용 제목 후보', assessment.title || '제목 검토 중 · 근거와 주제 일치를 확인해야 합니다.']].map(([label, text]) => text && <div key={label}><dt style={{ color: 'var(--lw-text-secondary)', fontSize: 13 }}>{label}</dt><dd style={{ margin: '3px 0 0' }}>{text}</dd></div>)}</dl><p style={{ color: 'var(--lw-text-secondary)', fontSize: 13 }}>월 검색량 {count(row.searchVolume)} · 확인 {date(dates.searchVolumeMeasuredAt)}<br />문서량 {count(row.documentCount)} · 확인 {date(dates.documentCountMeasuredAt)}<br />검색결과 경쟁 확인 {date(row.measuredAt)}</p><p style={{ color: 'var(--lw-accent-ink)' }}>추가 확인: {assessment.reasons.join(' · ')}</p>{assessment.sources.map((source, index) => <div key={`${source.link}-${index}`}><a href={source.link} target="_blank" rel="noreferrer" style={{ color: 'var(--lw-accent-ink)' }}>{source.title}</a> <span style={{ color: 'var(--lw-text-secondary)', fontSize: 13 }}>· {date(source.publishedAt)}</span></div>)}<button type="button" className="lw-more-btn" onClick={() => onAnalyze(row.keyword)}>검색 수요·경쟁 확인</button></div></details>;
            })}</div>
            {lockedCandidates > 0 && <p style={{ padding: 16, borderRadius: 14, background: 'var(--lw-surface)' }}>최신 조사 후보 {lockedCandidates}개는 라이선스 등록 후 확인할 수 있습니다.</p>}
        </div>}
        {lockedCount > 0 && <LicenseGate onUnlock={onUnlock} remaining={lockedCount} />}
    </details>;
}
