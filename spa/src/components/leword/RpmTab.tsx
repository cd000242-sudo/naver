/**
 * 글 RPM 확인(사장님 지시 2026-08-28) — 애드센스 **실측** 수익·페이지뷰로 낸다.
 *
 * ## 여기 숫자는 전부 실제로 발생한 돈이다
 * RPM = 수익 ÷ 페이지뷰 × 1000. 나눗셈 하나뿐이고, 두 값 다 애드센스가 준 것이다.
 * 점수·확률·예상 수익 같은 지어낸 값은 없다.
 *
 * ## 남의 글은 낼 수 없다(사장님 질문 2026-08-28 "내 글이 아니더라도?")
 * 수익도 페이지뷰도 계정 주인만 볼 수 있다. 남의 글 RPM 을 보여 주는 것은 전부
 * 추정이다(CPC × 짐작 CTR). 그건 실측이 아니므로 여기서는 하지 않는다.
 *
 * ## 왜 앱이 필요한가
 * 애드센스 토큰은 앱에만 둔다 — 수익 자료라 브라우저에 자격증명을 둘 이유가 없다.
 * 사이트는 계산된 숫자만 받는다.
 */
import { useEffect, useMemo, useState } from 'react';
import {
    bridgeAdsenseLogin, bridgeAdsenseRpm, bridgeAdsenseStatus,
    type AdsenseStatus, type RpmReport, type RpmRow,
} from '../../lib/bridge';
import { TabIntro } from './LewordShared';

/** 기간 — 애드센스가 확정한 값만 쓰므로 끝은 언제나 어제다. */
const PERIODS = [
    { days: 7, label: '7일' },
    { days: 28, label: '28일' },
    { days: 90, label: '90일' },
];

export default function RpmTab() {
    const [status, setStatus] = useState<AdsenseStatus | 'probing' | null>('probing');
    const [days, setDays] = useState(28);
    const [report, setReport] = useState<RpmReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [note, setNote] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [loginBusy, setLoginBusy] = useState(false);
    /** 글 하나만 보기 — 표에서 그 주소를 찾아 낸다. 다시 부르지 않는다. */
    const [oneUrl, setOneUrl] = useState('');

    const probe = async () => {
        setStatus('probing');
        setStatus(await bridgeAdsenseStatus());
    };
    useEffect(() => { void probe(); }, []);

    const run = async () => {
        if (loading) return;
        setLoading(true);
        setNote('');
        const result = await bridgeAdsenseRpm(days, 'USD');
        setLoading(false);
        if (result.status === 'ok') { setReport(result.report); return; }
        setNote(result.status === 'offline'
            ? 'LEWORD 앱이 꺼져 있습니다 — 앱을 켠 뒤 다시 눌러 주세요(애드센스 연결은 앱에만 있습니다).'
            : result.status === 'outdated'
                ? 'LEWORD 앱이 이 기능이 실리기 전 버전입니다 — 앱을 최신으로 올려 주세요.'
                : result.status === 'error' ? result.message : '재지 못했습니다.');
    };

    const login = async () => {
        setLoginBusy(true);
        setNote('구글 로그인 창을 이 PC 에서 엽니다 — 승인하면 돌아옵니다.');
        const result = await bridgeAdsenseLogin(clientId.trim(), clientSecret.trim());
        setLoginBusy(false);
        setNote(result.ok ? '연결됐습니다 — [RPM 재기]를 눌러 주세요.' : result.reason);
        if (result.ok) { setClientSecret(''); void probe(); }
    };

    /* 통화 기호는 계정이 준 코드를 따른다 — 우리가 환산하지 않는다. */
    const money = (value: number, currency: string) => new Intl.NumberFormat('ko-KR', {
        style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2,
    }).format(value);
    const count = (value: number) => value.toLocaleString('ko-KR');

    /** 합계와 평균 — 전부 표에 있는 값의 산술이다. */
    const summary = useMemo(() => {
        if (!report) return null;
        const earnings = report.rows.reduce((sum, row) => sum + row.earnings, 0);
        const views = report.rows.reduce((sum, row) => sum + row.pageViews, 0);
        return {
            earnings, views,
            avgRpm: views > 0 ? (earnings / views) * 1000 : null,
            earning: report.rows.filter((row) => row.earnings > 0).length,
        };
    }, [report]);

    /*
     * 판단은 **내 평균과의 비교**다 — 밖에서 가져온 기준이 아니라 내 글끼리 견준다.
     * 평균을 못 내면(페이지뷰 0) 배지도 달지 않는다. 모르는 것을 판정하지 않는다.
     */
    const verdict = (row: RpmRow) => {
        if (row.pageViews === 0) return { cls: 'na', text: '못 잼 · 페이지뷰 0' };
        if (row.rpm == null || !summary?.avgRpm) return { cls: 'na', text: '견줄 평균 없음' };
        const ratio = row.rpm / summary.avgRpm;
        if (ratio >= 1.2) return { cls: 'hot', text: `${ratio.toFixed(1)}배 · 트래픽 끌면 됨` };
        if (ratio >= 0.8) return { cls: 'ok', text: '평균 수준' };
        return { cls: 'low', text: `${ratio.toFixed(2)}배 · 사람은 오는데 돈이 안 됨` };
    };

    const rows = useMemo(() => {
        if (!report) return [];
        const wanted = oneUrl.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
        if (!wanted) return report.rows;
        return report.rows.filter((row) => row.pageUrl.toLowerCase().includes(wanted));
    }, [report, oneUrl]);

    const linked = typeof status === 'object' && status !== null && status.connected;

    return (
        <>
            <TabIntro
                title="글 RPM 확인"
                desc="애드센스가 준 글 주소별 수익과 페이지뷰로 RPM 을 냅니다(수익 ÷ 페이지뷰 × 1000). 여기 숫자는 전부 실제로 발생한 돈이며, 예상 수익은 표시하지 않습니다. 금액은 달러로 받습니다."
                source="구글 애드센스 실적(글 주소별) · 확정된 어제까지"
            />

            {/* 연결 상태 — 무엇이 없어서 못 쓰는지까지 말한다. */}
            {status === 'probing' && <div className="lw-note lw-note-plain">앱 연결 확인 중…</div>}
            {status === null && (
                <div className="lw-note lw-note-err">
                    LEWORD 앱을 못 찾았습니다 — 앱을 켠 뒤 <button type="button" className="lw-mini" onClick={() => { void probe(); }}>다시 확인</button>
                    <br />애드센스 연결은 앱에만 둡니다. 수익 자료라 브라우저에 자격증명을 두지 않습니다.
                </div>
            )}

            {typeof status === 'object' && status !== null && !status.connected && (
                <section className="lw-panel" style={{ marginTop: 14 }}>
                    <div className="lw-panel-head">
                        <h2>구글 로그인</h2>
                        <span>
                            읽기 전용 권한(adsense.readonly) 하나만 받습니다 — 계정이 바뀌지 않습니다.
                            로그인 창은 이 PC 에서 열리고, 토큰은 앱에만 저장됩니다.
                        </span>
                    </div>
                    {status.need === 'credentials' && (
                        <>
                            <div className="lw-note lw-note-plain">
                                구글 클라우드 콘솔의 <b>데스크톱 앱</b> Client ID/Secret 이 필요합니다.
                                블로그스팟·유튜브에 쓰시던 것과 같은 프로젝트면 그대로 됩니다 — 대신 그 프로젝트에서
                                <b> AdSense Management API 를 켜 두셔야</b> 합니다.
                                <br />이 값은 이 PC 의 앱(127.0.0.1)으로만 갑니다. 사이트 서버로 나가지 않습니다.
                            </div>
                            <div className="lw-search lw-search-two" style={{ marginTop: 10 }}>
                                <input
                                    type="text" value={clientId} onChange={(event) => setClientId(event.target.value)}
                                    placeholder="Client ID (xxxxx.apps.googleusercontent.com)" aria-label="Client ID"
                                    autoComplete="off"
                                />
                                <input
                                    type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)}
                                    placeholder="Client Secret" aria-label="Client Secret"
                                    autoComplete="new-password"
                                />
                            </div>
                        </>
                    )}
                    <button
                        type="button" className="lw-mini" style={{ marginTop: 10 }}
                        onClick={() => { void login(); }}
                        disabled={loginBusy || (status.need === 'credentials' && (!clientId.trim() || !clientSecret.trim()))}
                    >{loginBusy ? '로그인 창을 여는 중…' : '구글 로그인'}</button>
                </section>
            )}

            <div className="lw-panel-head" style={{ marginTop: 22 }}>
                <h2>내 글 전체 — RPM 높은 순</h2>
                <span>기간 동안 수익이 난 글을 전부 가져옵니다 · 끝은 언제나 어제입니다(오늘 값은 애드센스가 아직 확정하지 않습니다)</span>
            </div>
            <form className="lw-search" onSubmit={(event) => { event.preventDefault(); void run(); }}>
                <div className="lw-segment">
                    {PERIODS.map((period) => (
                        <button
                            key={period.days} type="button"
                            className={days === period.days ? 'on' : ''}
                            onClick={() => setDays(period.days)}
                        >{period.label}</button>
                    ))}
                </div>
                <button type="submit" disabled={loading || !linked}>
                    {loading ? '재는 중…' : 'RPM 재기'}
                </button>
            </form>
            {note && <div className={`lw-note${report ? '' : ' lw-note-err'}`}>{note}</div>}

            {report && summary && (
                <>
                    <div className="lw-tabrank-grid" style={{ marginTop: 14 }}>
                        <div className="lw-tabrank-card">
                            <span>기간 수익</span>
                            <b>{money(summary.earnings, report.currency)}</b>
                            <em>{report.startDate} ~ {report.endDate}</em>
                        </div>
                        <div className="lw-tabrank-card">
                            <span>페이지뷰</span><b>{count(summary.views)}</b><em>애드센스 집계</em>
                        </div>
                        <div className="lw-tabrank-card">
                            <span>평균 RPM</span>
                            <b>{summary.avgRpm == null ? '—' : money(summary.avgRpm, report.currency)}</b>
                            <em>수익 ÷ 페이지뷰 × 1000</em>
                        </div>
                        <div className="lw-tabrank-card">
                            <span>수익 난 글</span><b>{count(summary.earning)}</b><em>{report.account}</em>
                        </div>
                    </div>

                    <form className="lw-search" style={{ marginTop: 14 }} onSubmit={(event) => event.preventDefault()}>
                        <input
                            type="search" value={oneUrl} onChange={(event) => setOneUrl(event.target.value)}
                            placeholder="글 하나만 보기 — 주소 일부를 넣으면 그 글만 남습니다"
                            aria-label="글 주소로 거르기"
                        />
                    </form>

                    <div className="lw-audit-table lw-rpm-table">
                        <table>
                            <thead>
                                <tr>
                                    <th scope="col">글</th>
                                    <th scope="col">RPM</th>
                                    <th scope="col">수익</th>
                                    <th scope="col">페이지뷰</th>
                                    <th scope="col">내 평균 대비</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => {
                                    const mark = verdict(row);
                                    return (
                                        <tr key={row.pageUrl}>
                                            <td>
                                                <a href={`https://${row.pageUrl.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer">
                                                    {row.pageUrl}
                                                </a>
                                            </td>
                                            {/* 페이지뷰 0 이면 RPM 을 0 으로 적지 않는다 — 모르는 것과 0원은 다르다. */}
                                            <td>{row.rpm == null ? '—' : money(row.rpm, report.currency)}</td>
                                            <td>{money(row.earnings, report.currency)}</td>
                                            <td>{count(row.pageViews)}</td>
                                            <td><em className={`lw-rpm-${mark.cls}`}>{mark.text}</em></td>
                                        </tr>
                                    );
                                })}
                                {rows.length === 0 && (
                                    <tr><td colSpan={5}>그 주소로 수익이 잡힌 글이 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="lw-note lw-note-plain">
                        네이버 블로그 글은 여기 나오지 않습니다 — 애드센스를 붙일 수 없는 곳이라 값 자체가 없습니다.
                        <br />남의 글 RPM 은 잴 수 없습니다: 수익도 페이지뷰도 계정 주인만 볼 수 있습니다.
                    </div>
                </>
            )}
        </>
    );
}
