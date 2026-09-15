import { useCallback, useEffect, useState } from 'react';
import { HF_CHECKPOINTS, hfCalibration, hfPerformance, type HfCalibration, type HfCheckpoint } from '../../../lib/homefeedBridge';
import {
    DIMENSION_LABEL, STATUS_LABEL, WINDOW_LABEL, calibrationText, dimensionValueLabel, formatTime,
} from '../../../lib/homefeedModel.mjs';
import { failureOf } from './HomefeedParts';

/**
 * 성과학습 — 발행 글의 T+30분 · 2시간 · 6시간 · 24시간 실측을 적고, 패턴별 보정 표를 본다.
 * 표본 5건 전엔 수치를 숨기고, 20건 전엔 비율을 내지 않는다. 표를 보고 가설값을 고치는 것은 사장님이다(자동 변경 없음).
 */

const CHECKPOINT_LABEL: Record<HfCheckpoint, string> = { '30m': '30분', '2h': '2시간', '6h': '6시간', '24h': '24시간' };

type Form = {
    postId: string;
    checkpoint: HfCheckpoint;
    totalViews: string;
    searchViews: string;
    recommendViews: string;
    feedSeen: '' | 'yes' | 'no';
    referrerNote: string;
};

const EMPTY_FORM: Form = { postId: '', checkpoint: '30m', totalViews: '', searchViews: '', recommendViews: '', feedSeen: '', referrerNote: '' };

/** 빈칸 = 모름(null). 숫자가 아니면 invalid — 0 으로 채우지 않는다. */
function parseCount(text: string): number | null | 'invalid' {
    const trimmed = text.trim().replace(/,/g, '');
    if (!trimmed) return null;
    return /^\d{1,10}$/.test(trimmed) ? Number(trimmed) : 'invalid';
}

export default function HomefeedLearning() {
    const [data, setData] = useState<HfCalibration | null>(null);
    const [error, setError] = useState('');
    const [form, setForm] = useState<Form>(EMPTY_FORM);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        const result = await hfCalibration();
        if (result.status === 'ok') {
            setData(result.result);
            setError('');
            setForm((previous) => (previous.postId || result.result.posts.length === 0 ? previous : { ...previous, postId: result.result.posts[0].id }));
        } else {
            setError(failureOf(result, '성과학습을 불러오지 못했습니다') ?? '');
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const save = async () => {
        const counts = { totalViews: parseCount(form.totalViews), searchViews: parseCount(form.searchViews), recommendViews: parseCount(form.recommendViews) };
        if (Object.values(counts).includes('invalid')) {
            setNotice('조회수는 0 이상의 숫자로 적어 주세요(모르면 비워 두세요).');
            return;
        }
        setBusy(true);
        setNotice('');
        const result = await hfPerformance({
            postId: form.postId,
            checkpoint: form.checkpoint,
            totalViews: counts.totalViews as number | null,
            searchViews: counts.searchViews as number | null,
            recommendViews: counts.recommendViews as number | null,
            feedSeen: form.feedSeen === '' ? null : form.feedSeen === 'yes',
            referrerNote: form.referrerNote.trim().slice(0, 200),
        });
        setBusy(false);
        if (result.status !== 'ok') {
            setNotice(failureOf(result, '성과 저장 실패') ?? '');
            return;
        }
        setNotice('저장했습니다.');
        setForm({ ...EMPTY_FORM, postId: form.postId });
        await load();
    };

    if (error) return <div className="lw-note lw-note-error"><strong>성과학습을 열지 못했습니다</strong><p>{error}</p></div>;
    if (!data) return <div className="lw-note">성과 기록을 불러오는 중입니다…</div>;

    return (
        <>
            <section className="lw-hf-section">
                <h4>성과 입력</h4>
                {data.posts.length === 0 ? (
                    <p className="hint">아직 발행 기록이 없습니다. 스토리 상세의 [발행 · 성과]에서 글 주소를 남기면 여기서 숫자를 적을 수 있습니다.</p>
                ) : (
                    <>
                        <div className="lw-hf-form">
                            <div className="lw-hf-field">
                                <label htmlFor="hf-perf-post">발행 글</label>
                                <select id="hf-perf-post" value={form.postId} onChange={(event) => setForm({ ...form, postId: event.target.value })}>
                                    {data.posts.map((post) => <option key={post.id} value={post.id}>{post.keyword} · {formatTime(post.publishedAt)}</option>)}
                                </select>
                            </div>
                            <div className="lw-hf-field">
                                <label htmlFor="hf-perf-checkpoint">체크포인트</label>
                                <select id="hf-perf-checkpoint" value={form.checkpoint} onChange={(event) => setForm({ ...form, checkpoint: event.target.value as HfCheckpoint })}>
                                    {HF_CHECKPOINTS.map((checkpoint) => <option key={checkpoint} value={checkpoint}>발행 후 {CHECKPOINT_LABEL[checkpoint]}</option>)}
                                </select>
                            </div>
                            <div className="lw-hf-field">
                                <label htmlFor="hf-perf-total">전체 조회</label>
                                <input id="hf-perf-total" inputMode="numeric" autoComplete="off" value={form.totalViews} onChange={(event) => setForm({ ...form, totalViews: event.target.value })} />
                            </div>
                            <div className="lw-hf-field">
                                <label htmlFor="hf-perf-search">검색 유입</label>
                                <input id="hf-perf-search" inputMode="numeric" autoComplete="off" value={form.searchViews} onChange={(event) => setForm({ ...form, searchViews: event.target.value })} />
                            </div>
                            <div className="lw-hf-field">
                                <label htmlFor="hf-perf-recommend">추천(홈판) 유입</label>
                                <input id="hf-perf-recommend" inputMode="numeric" autoComplete="off" value={form.recommendViews} onChange={(event) => setForm({ ...form, recommendViews: event.target.value })} />
                            </div>
                            <div className="lw-hf-field">
                                <label htmlFor="hf-perf-feed">피드에서 직접 확인</label>
                                <select id="hf-perf-feed" value={form.feedSeen} onChange={(event) => setForm({ ...form, feedSeen: event.target.value as Form['feedSeen'] })}>
                                    <option value="">모름</option>
                                    <option value="yes">봤음</option>
                                    <option value="no">못 봤음</option>
                                </select>
                            </div>
                            <div className="lw-hf-field">
                                <label htmlFor="hf-perf-referrer">유입 경로 메모</label>
                                <input id="hf-perf-referrer" autoComplete="off" maxLength={200} value={form.referrerNote} onChange={(event) => setForm({ ...form, referrerNote: event.target.value })} />
                                <small>빈칸은 '모름'으로 저장됩니다 — 0 으로 채우지 않습니다.</small>
                            </div>
                        </div>
                        <div className="lw-hf-filter-row">
                            <button type="button" className="lw-hf-btn primary" disabled={busy || !form.postId} onClick={save}>성과 저장</button>
                            {notice && <span className={notice === '저장했습니다.' ? 'lw-hf-busy' : 'lw-hf-error'}>{notice}</span>}
                        </div>
                    </>
                )}
            </section>

            {data.posts.length > 0 && (
                <section className="lw-hf-section">
                    <h4>발행 글 {data.posts.length}편</h4>
                    <div className="lw-hf-table-wrap">
                        <table className="lw-hf-table">
                            <thead>
                                <tr><th>글</th><th>발행</th><th>발행 때 판정</th>{HF_CHECKPOINTS.map((checkpoint) => <th key={checkpoint}>{CHECKPOINT_LABEL[checkpoint]} 추천 / 전체</th>)}</tr>
                            </thead>
                            <tbody>
                                {data.posts.map((post) => (
                                    <tr key={post.id}>
                                        <td><a href={post.postUrl} target="_blank" rel="noopener noreferrer">{post.title || post.keyword}</a></td>
                                        <td>{formatTime(post.publishedAt)}</td>
                                        <td>{WINDOW_LABEL[post.atPublish.window] ?? post.atPublish.window} · {STATUS_LABEL[post.atPublish.status] ?? post.atPublish.status}</td>
                                        {HF_CHECKPOINTS.map((checkpoint) => {
                                            const entry = post.checkpoints[checkpoint];
                                            return (
                                                <td key={checkpoint} className={entry ? '' : 'muted'}>
                                                    {entry ? `${entry.recommendViews ?? '모름'} / ${entry.totalViews ?? '모름'}` : '미기록'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <section className="lw-hf-section">
                <h4>패턴별 보정 표</h4>
                <p className="hint">
                    24시간 기록이 있는 글 {data.summary.measured24h}편 기준입니다. 표본 {data.summary.thresholds.sampleShortN}건 전엔 수치를 숨기고,
                    {' '}{data.summary.thresholds.successRateMinN}건 전엔 비율을 내지 않습니다. 이 표를 보고 관리자 설정의 가설값을 직접 고치세요 — 자동으로 바꾸지 않습니다.
                </p>
                {data.summary.groups.length === 0 ? (
                    <p className="hint">아직 24시간 기록이 없습니다.</p>
                ) : (
                    <div className="lw-hf-table-wrap">
                        <table className="lw-hf-table">
                            <thead><tr><th>기준</th><th>값</th><th>요약</th></tr></thead>
                            <tbody>
                                {data.summary.groups.map((group) => (
                                    <tr key={`${group.dimension}-${group.value}`}>
                                        <td>{DIMENSION_LABEL[group.dimension] ?? group.dimension}</td>
                                        <td>{dimensionValueLabel(group.dimension, group.value)}</td>
                                        <td>{calibrationText(group)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}
