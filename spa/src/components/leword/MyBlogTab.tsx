/**
 * 내 블로그(2026-09-30) — 사장님 "내 블로그를 주면 알고리즘이 어디에 특화되어있나 파악도가능할까?".
 *
 * ## 이 화면이 보여 주는 것은 전부 앱이 잰 값이다
 * - 네이버 로그인 상태: 앱 안 로그인 창(persist 파티션)의 쿠키가 있는가. 비밀번호는 앱도 사이트도 보지 않는다.
 * - 오늘 잡힌 어드바이저 창구 수: 글별 홈판·추천 유입을 읽으려면 로그인해야 보이는 크리에이터 어드바이저가
 *   부르는 JSON 창구를 앱이 기록한다(0단계 실측). 공개 창구엔 그 값이 없다.
 * - 내 블로그 카드: 글 수·방문자·이긴 자리 — 앱의 '내 블로그 보기'가 잰 기록 그대로.
 *
 * ## 여기서 안 하는 것
 * 측정 시작. 분 단위 작업이고 진행 상황을 앱 화면으로 보내는 구조라, 재는 건 앱에서 누르게 안내한다.
 * 점수·확률·예상값은 없다 — 안 잰 칸은 안 잰 것으로 적는다.
 */
import { useCallback, useEffect, useState } from 'react';
import { bridgeFailureNote, type BridgeFailure } from '../../lib/bridge';
import { myBlogClass, myBlogOpenLogin, myBlogSession, type MyBlogRecord, type MyBlogSession } from '../../lib/myBlogBridge';
import { TabIntro } from './LewordShared';

const KO = (value: number | null | undefined): string => Number(value || 0).toLocaleString('ko-KR');

/** '2026-09-30T05:12:00' → '9월 30일 05:12'. 잰 시각을 화면에 그대로 적는다. */
function stamp(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const two = (value: number) => String(value).padStart(2, '0');
    return `${date.getMonth() + 1}월 ${date.getDate()}일 ${two(date.getHours())}:${two(date.getMinutes())}`;
}

type SessionState = { kind: 'probing' } | { kind: 'ok'; session: MyBlogSession } | { kind: 'fail'; failure: BridgeFailure };
type RecordState = { kind: 'probing' } | { kind: 'ok'; record: MyBlogRecord | null } | { kind: 'fail'; failure: BridgeFailure };

export default function MyBlogTab() {
    const [session, setSession] = useState<SessionState>({ kind: 'probing' });
    const [record, setRecord] = useState<RecordState>({ kind: 'probing' });
    const [opening, setOpening] = useState(false);
    const [openNote, setOpenNote] = useState('');

    const refresh = useCallback(async () => {
        const [sessionResult, classResult] = await Promise.all([myBlogSession(), myBlogClass()]);
        setSession(sessionResult.status === 'ok' ? { kind: 'ok', session: sessionResult.result } : { kind: 'fail', failure: sessionResult });
        setRecord(classResult.status === 'ok' ? { kind: 'ok', record: classResult.result.record } : { kind: 'fail', failure: classResult });
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    async function openLogin() {
        setOpening(true);
        setOpenNote('');
        const result = await myBlogOpenLogin();
        setOpening(false);
        if (result.status !== 'ok') { setOpenNote(bridgeFailureNote(result, '로그인 창을 열지 못했습니다')); return; }
        setOpenNote('이 PC 에 네이버 로그인 창이 열렸습니다. 로그인 뒤 어드바이저 화면을 한 번 둘러보고 [다시 확인]을 눌러 주세요.');
    }

    const rec = record.kind === 'ok' ? record.record : null;
    const won = (rec?.wonRows || [])
        .filter((row) => typeof row.blogRank === 'number' && row.blogRank <= 10)
        .sort((a, b) => (a.blogRank as number) - (b.blogRank as number))
        .slice(0, 20);

    return (
        <div className="lw-tab lw-myblog">
            <TabIntro
                title="내 블로그"
                desc="내 블로그가 어디에 특화돼 있는지 — 앱이 실제로 읽고 잰 값만 보입니다. 네이버 로그인은 이 PC 의 앱 창에서 직접 하고, 비밀번호는 앱도 사이트도 보지 않습니다."
                source="LEWORD 앱(127.0.0.1) · 네이버 블로그 공개 목록 · 크리에이터 어드바이저(로그인 시)"
            />

            <section className="lw-panel">
                <div className="lw-panel-head">
                    <h2>네이버 로그인</h2>
                    <span>글별 홈판·추천 유입은 로그인해야 보이는 크리에이터 어드바이저에만 있습니다. 앱이 그 창구를 기록해 다음 단계(특화도 표)의 재료로 씁니다.</span>
                </div>
                {session.kind === 'probing' && <div className="lw-note lw-note-plain">앱 연결 확인 중…</div>}
                {session.kind === 'fail' && (
                    <div className="lw-note lw-note-err">
                        {bridgeFailureNote(session.failure, '로그인 상태를 읽지 못했습니다')}
                        {' '}
                        <button type="button" className="lw-mini" onClick={() => { void refresh(); }}>다시 확인</button>
                    </div>
                )}
                {session.kind === 'ok' && (
                    <>
                        <div className="lw-tabrank-grid">
                            <div className={`lw-tabrank-card${session.session.loggedIn ? ' on' : ''}`}>
                                <span>네이버 로그인</span>
                                <b>{session.session.loggedIn ? '되어 있어요' : '안 되어 있어요'}</b>
                                <em>{session.session.windowOpen ? '앱에 로그인 창 열림' : '앱 로그인 창 닫힘'}</em>
                            </div>
                            <div className={`lw-tabrank-card${session.session.endpointCount > 0 ? ' on' : ''}`}>
                                <span>오늘 잡힌 어드바이저 창구</span>
                                <b>{KO(session.session.endpointCount)}종</b>
                                <em>요청 {KO(session.session.capturedToday)}건 · 앱이 기록</em>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                            <button type="button" className="lw-mini" onClick={() => { void openLogin(); }} disabled={opening}>
                                {opening ? '여는 중…' : session.session.loggedIn ? '어드바이저 창 열기' : '네이버 로그인 창 열기'}
                            </button>
                            <button type="button" className="lw-mini lw-mini-ghost" onClick={() => { void refresh(); }}>다시 확인</button>
                        </div>
                        {openNote && <div className="lw-note lw-note-plain" style={{ marginTop: 10 }}>{openNote}</div>}
                    </>
                )}
            </section>

            <section className="lw-panel" style={{ marginTop: 14 }}>
                <div className="lw-panel-head">
                    <h2>내 블로그 카드</h2>
                    <span>{rec ? `앱이 ${stamp(rec.measuredAt)}에 잰 값 · blog.naver.com/${rec.blogId}` : '앱의 [내 블로그 보기]가 잰 기록을 그대로 보입니다.'}</span>
                </div>
                {record.kind === 'probing' && <div className="lw-note lw-note-plain">앱 연결 확인 중…</div>}
                {record.kind === 'fail' && (
                    <div className="lw-note lw-note-err">{bridgeFailureNote(record.failure, '내 블로그 기록을 읽지 못했습니다')}</div>
                )}
                {record.kind === 'ok' && !rec && (
                    <div className="lw-note lw-note-plain">
                        아직 잰 기록이 없습니다. 재는 데 몇 분이 걸려서 이 PC 의 LEWORD 앱 → 자리 실측기 → [내 블로그 보기]에서 한 번 재 주세요. 그 뒤 여기서 [다시 확인]을 누르면 같은 기록이 보입니다.
                    </div>
                )}
                {rec && (
                    <>
                        {rec.card.headline && <p style={{ margin: '0 0 8px', color: '#fff', fontWeight: 900, fontSize: 16 }}>{rec.card.headline}</p>}
                        {rec.card.lines.map((line, index) => (
                            <div key={`line-${index}`} title={line.evidence} style={{ margin: '3px 0', color: '#e2e8f0', cursor: 'help' }}>{line.text}</div>
                        ))}
                        {rec.card.notices.length > 0 && (
                            <div className="lw-note lw-note-plain" style={{ marginTop: 10 }}>
                                {rec.card.notices.map((line, index) => <div key={`notice-${index}`} title={line.evidence}>{line.text}</div>)}
                            </div>
                        )}

                        {rec.band && (
                            <div style={{ marginTop: 12, fontSize: 12.5, color: '#cbd5e1' }}>
                                순위를 잰 검색어 {KO(rec.band.measuredCount)}개 중 첫 페이지 <b style={{ color: '#e2e8f0' }}>{KO(rec.band.wonCount)}개</b> · 11~30위 {KO(rec.band.nearCount)}개
                                {rec.band.wonCount + rec.band.nearCount > 0 && (
                                    <> · 30위 안에 붙어 본 검색량 {KO(rec.band.volumeMin)}~{KO(rec.band.volumeMax)}</>
                                )}
                            </div>
                        )}
                        {rec.rankSummary && !rec.band && (
                            <div style={{ marginTop: 12, fontSize: 12.5, color: '#cbd5e1' }}>
                                검색어 {KO(rec.rankSummary.candidates)}개를 뽑았고 사람들이 실제로 치는 말은 {KO(rec.rankSummary.withVolume)}개, 순위를 잰 건 {KO(rec.rankSummary.ranked)}개였어요.
                            </div>
                        )}

                        {rec.topicProfile && rec.topicProfile.words.length > 0 && (
                            <div style={{ marginTop: 14 }}>
                                <div style={{ fontSize: 12.5, color: '#94a3b8', fontWeight: 700 }}>
                                    제목에 많이 쓴 낱말 — 글 {KO(rec.topicProfile.analyzed)}개 제목에서 센 것
                                    {rec.topicProfile.declaredTopic ? ` · 네이버 설정 주제 ${rec.topicProfile.declaredTopic}` : ''}
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                                    {rec.topicProfile.words.slice(0, 15).map((word) => (
                                        <span
                                            key={word.word}
                                            title={`글 ${KO(word.posts)}개 제목에 등장`}
                                            style={{ padding: '3px 9px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', fontSize: 12.5, color: '#e2e8f0' }}
                                        >
                                            {word.word} <em style={{ fontStyle: 'normal', opacity: .7 }}>{KO(word.posts)}</em>
                                        </span>
                                    ))}
                                </div>
                                {rec.topicProfile.recentWords.length > 0 && (
                                    <div style={{ marginTop: 8, fontSize: 12.5, color: '#94a3b8' }}>
                                        최근 90일 글에서는: {rec.topicProfile.recentWords.slice(0, 8).map((word) => `${word.word}(${KO(word.posts)})`).join(' · ')}
                                    </div>
                                )}
                            </div>
                        )}

                        {won.length > 0 && (
                            <div className="lw-table-scroll" style={{ marginTop: 14 }}>
                                <table className="lw-table">
                                    <thead>
                                        <tr><th>첫 페이지에 든 검색어</th><th>블로그탭 순위</th><th>월 검색량</th><th>문서수</th></tr>
                                    </thead>
                                    <tbody>
                                        {won.map((row) => (
                                            <tr key={row.keyword}>
                                                <td>{row.postUrl ? <a href={row.postUrl} target="_blank" rel="noreferrer">{row.keyword}</a> : row.keyword}</td>
                                                <td>{row.blogRank}위</td>
                                                <td>{row.searchVolume == null ? '안 잼' : KO(row.searchVolume)}</td>
                                                <td>{row.documentCount == null ? '안 잼' : KO(row.documentCount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="lw-note lw-note-plain" style={{ marginTop: 12 }}>
                            다시 재는 건 앱에서 — LEWORD 앱 → 자리 실측기 → [내 블로그 보기]. 홈판·추천 유입별 특화도 표는 어드바이저 창구 실측이 끝나면 이 자리에 붙습니다.
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
