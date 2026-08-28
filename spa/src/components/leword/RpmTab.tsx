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
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    bridgeAdsenseLogin, bridgeAdsensePageRpm, bridgeAdsenseRpm, bridgeAdsenseStatus,
    type AdsenseStatus, type DailyRpm, type RpmReport, type RpmRow,
} from '../../lib/bridge';
import { TabIntro } from './LewordShared';

/*
 * 기간. **오늘**이 기본이다(사장님 지시 2026-08-28: "글을 올렸다면 그 글의
 * RPM 을 실시간으로 알 수 있잖아").
 *
 * 처음엔 어제까지로 잘라 뒀는데, 그러면 오늘 올린 글은 아예 안 나온다 —
 * 정작 쓰려는 경우가 그것이다.
 *
 * 오늘 값도 구글이 실제로 잰 것이다. 다만 15~30분마다 갱신되고 아직 움직인다
 * (지연 집계가 있어 날짜 사이에서 값이 옮겨 다닌다). 그 사실을 화면에 적는다.
 */
const PERIODS = [
    { days: 1, today: true, label: '오늘' },
    { days: 7, today: false, label: '7일' },
    { days: 28, today: false, label: '28일' },
    { days: 90, today: false, label: '90일' },
];

export default function RpmTab({ onRadar }: { onRadar?: (pageUrl: string) => void }) {
    const [status, setStatus] = useState<AdsenseStatus | 'probing' | null>('probing');
    /* 기본은 오늘 — 방금 쓴 글을 보는 것이 이 탭의 주 용도다. */
    const [days, setDays] = useState(1);
    const [today, setToday] = useState(true);
    const [report, setReport] = useState<RpmReport | null>(null);
    const [loading, setLoading] = useState(false);
    const [note, setNote] = useState('');
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [loginBusy, setLoginBusy] = useState(false);
    /** 글 하나만 보기 — 표에서 그 주소를 찾아 낸다. 다시 부르지 않는다. */
    const [oneUrl, setOneUrl] = useState('');
    /*
     * 자동 갱신(사장님 지시 2026-08-28: "이 탭에서 실시간으로 RPM 값을 보게끔
     * 하려는 게 목적"). 글 올리고 지켜보는 판이라 손으로 다시 누르게 두면 안 된다.
     * 애드센스가 15~30분마다 갱신하므로 10분이면 놓치는 것이 없다.
     */
    const [auto, setAuto] = useState(true);
    const [lastAt, setLastAt] = useState('');
    /*
     * 고른 글의 **날짜별 추이**(사장님 지시 2026-08-28). 이 탭의 결론은
     * "이 글에 외부유입을 넣을까 말까"다 — 누적 수익이 아니라 추이가 그 답을 준다.
     * 시작점이 낮으면 접고, 높게 시작하면 붓고, 나중에 올랐으면 언제부터인지 본다.
     */
    const [trend, setTrend] = useState<{ url: string; rows: DailyRpm[]; currency: string } | null>(null);
    const [trendBusy, setTrendBusy] = useState('');

    const openTrend = async (pageUrl: string) => {
        setTrendBusy(pageUrl);
        const result = await bridgeAdsensePageRpm(pageUrl, 30, 'USD');
        setTrendBusy('');
        if (result.status === 'ok') { setTrend({ url: pageUrl, rows: result.rows, currency: result.currency }); return; }
        setNote(result.message);
    };

    const linked = typeof status === 'object' && status !== null && status.connected;

    const probe = async () => {
        setStatus('probing');
        setStatus(await bridgeAdsenseStatus());
    };
    useEffect(() => { void probe(); }, []);

    const run = async () => {
        if (loading) return;
        setLoading(true);
        setNote('');
        const result = await bridgeAdsenseRpm(days, 'USD', today);
        setLoading(false);
        if (result.status === 'ok') {
            setReport(result.report);
            setLastAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
            return;
        }
        setNote(result.status === 'offline'
            ? 'LEWORD 앱이 꺼져 있습니다 — 앱을 켠 뒤 다시 눌러 주세요(애드센스 연결은 앱에만 있습니다).'
            : result.status === 'outdated'
                ? 'LEWORD 앱이 이 기능이 실리기 전 버전입니다 — 앱을 최신으로 올려 주세요.'
                : result.status === 'error' ? result.message : '재지 못했습니다.');
    };

    /*
     * 오늘을 보고 있을 때만 자동으로 다시 잰다 — 지난 기간 값은 변하지 않는다.
     *
     * 의존성 배열은 **반드시 있어야 한다**: 없으면 렌더마다 타이머가 새로 걸려
     * 10분이 영영 오지 않는다(첫 판에서 그렇게 짰다가 잡았다).
     * run 은 렌더마다 새로 만들어지므로 배열에 넣지 않고 ref 로 최신 것을 부른다.
     */
    const runRef = useRef(run);
    runRef.current = run;
    useEffect(() => {
        if (!auto || !today || !linked) return undefined;
        const timer = window.setInterval(() => { void runRef.current(); }, 10 * 60 * 1000);
        return () => window.clearInterval(timer);
    }, [auto, today, linked, days]);

    /*
     * 콘솔에서 내려받은 client_secret_….json 을 그대로 읽는다.
     * 데스크톱 앱은 installed, 웹 앱은 web 키에 들어 있다 — 웹 앱이면
     * 127.0.0.1 리다이렉트가 등록돼 있지 않아 로그인이 막히므로 그때 말해 준다.
     */
    const [credNote, setCredNote] = useState('');
    const readCredentialsFile = async (file?: File) => {
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            const desktop = parsed?.installed;
            const web = parsed?.web;
            const picked = desktop || web;
            if (!picked?.client_id || !picked?.client_secret) {
                setCredNote('이 파일에는 Client ID/Secret 이 없습니다 — 콘솔에서 받은 client_secret_….json 이 맞는지 확인해 주세요.');
                return;
            }
            setClientId(String(picked.client_id));
            setClientSecret(String(picked.client_secret));
            setCredNote(desktop
                ? '읽었습니다 — [구글 로그인]을 눌러 주세요.'
                : '읽었습니다. 다만 이건 **웹 애플리케이션** 클라이언트라 로그인이 막힐 수 있습니다 — 막히면 콘솔에서 유형을 데스크톱 앱으로 하나 더 만들어 주세요.');
        } catch {
            setCredNote('JSON 을 읽지 못했습니다 — 콘솔에서 받은 파일을 그대로 넣어 주세요.');
        }
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
        /*
         * 표본이 적으면 RPM 이 크게 흔들린다 — 이걸 안 짚으면 **손해가 난다**
         * (사장님 2026-08-28: 트래픽을 끌기 전에 그 글이 돈이 되는지 봐야 한다).
         * 방문자 3명에 클릭 하나면 RPM 이 수십 달러로 찍힌다. 그 값을 믿고
         * 트래픽을 부으면 평균으로 돌아오면서 그대로 손해다.
         * 값을 감추지는 않는다 — 못 믿을 값이라는 사실을 함께 낸다.
         */
        const ratio = row.rpm / summary.avgRpm;
        /*
         * 비율은 **언제나 낸다**(사장님 지적 2026-08-28: "트래픽이 하나만 생겨도
         * 그 글의 RPM 값을 알 수 있는데?"). 맞다 — 뷰가 하나여도 값은 존재한다.
         * 앞서는 뷰 100 미만이면 비율을 통째로 감췄는데, 그러면 이제 막 시작한
         * 사람에게는 이 탭이 아무 말도 안 해 준다.
         *
         * 대신 **몇 뷰짜리 값인지**를 붙인다. 뷰 셋에 클릭 하나면 RPM 이 수십
         * 달러로 찍히고, 그 값만 믿고 트래픽을 부으면 평균으로 돌아오면서 손해다.
         * 판단은 사장님이 한다 — 우리는 값과 그 값의 무게를 같이 낸다.
         */
        const thin = row.pageViews < 100 ? ` · ${count(row.pageViews)}뷰뿐` : '';
        if (ratio >= 1.2) return { cls: thin ? 'na' : 'hot', text: `${ratio.toFixed(1)}배 · 트래픽 끌면 됨${thin}` };
        if (ratio >= 0.8) return { cls: thin ? 'na' : 'ok', text: `평균 수준${thin}` };
        return { cls: thin ? 'na' : 'low', text: `${ratio.toFixed(2)}배 · 사람은 오는데 돈이 안 됨${thin}` };
    };

    const rows = useMemo(() => {
        if (!report) return [];
        const wanted = oneUrl.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
        if (!wanted) return report.rows;
        return report.rows.filter((row) => row.pageUrl.toLowerCase().includes(wanted));
    }, [report, oneUrl]);

    return (
        <>
            <TabIntro
                title="글 RPM 확인"
                desc="애드센스가 준 글 주소별 수익과 페이지뷰로 RPM 을 냅니다(수익 ÷ 페이지뷰 × 1000). 여기 숫자는 전부 실제로 발생한 돈이며, 예상 수익은 표시하지 않습니다. 금액은 달러로 받습니다."
                source="구글 애드센스 실적(글 주소별) · 오늘 값은 15~30분마다 갱신됩니다"
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
                                블로그스팟·유튜브에 쓰시던 것과 같은 프로젝트면 그대로 됩니다.
                                <br />이 값은 이 PC 의 앱(127.0.0.1)으로만 갑니다. 사이트 서버로 나가지 않습니다.
                            </div>
                            {/*
                              * 콘솔에서 자동으로 끌어올 수는 없다(사장님 질문 2026-08-28
                              * "버튼 만들어 줘야 되지 않니"): 표준 OAuth 클라이언트를 만드는
                              * API 가 아예 없다. 자격증명을 받으려면 이미 자격증명이 있어야 하는
                              * 순환이라 구글이 콘솔에서만 만들게 해 뒀다(gcloud 의 oauth-clients 는
                              * IAP·워크포스 전용이라 데스크톱 앱에는 못 쓴다).
                              *
                              * 대신 손으로 옮겨 적는 일은 없앤다 — 콘솔이 주는 JSON 파일을
                              * 그대로 넣으면 여기서 읽는다. 그리고 갈 곳을 버튼으로 연다.
                              */}
                            <div className="lw-rpm-steps">
                                <a className="lw-mini" href="https://console.cloud.google.com/apis/library/adsense.googleapis.com" target="_blank" rel="noreferrer">
                                    ① AdSense API 켜기
                                </a>
                                <a className="lw-mini" href="https://console.cloud.google.com/apis/credentials/oauthclient" target="_blank" rel="noreferrer">
                                    ② 데스크톱 앱 클라이언트 만들기
                                </a>
                                <label className="lw-mini">
                                    ③ 받은 JSON 넣기
                                    <input
                                        type="file" accept="application/json,.json" style={{ display: 'none' }}
                                        onChange={(event) => { void readCredentialsFile(event.target.files?.[0]); }}
                                    />
                                </label>
                            </div>
                            {credNote && <div className="lw-note lw-note-plain">{credNote}</div>}
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
                <span>기간 동안 수익이 난 글을 전부 가져옵니다 · 방금 쓴 글을 보려면 [오늘]로 두세요</span>
            </div>
            <form className="lw-search" onSubmit={(event) => { event.preventDefault(); void run(); }}>
                <div className="lw-segment">
                    {PERIODS.map((period) => (
                        <button
                            key={period.days} type="button"
                            className={days === period.days && today === period.today ? 'on' : ''}
                            onClick={() => { setDays(period.days); setToday(period.today); }}
                        >{period.label}</button>
                    ))}
                </div>
                <button type="submit" disabled={loading || !linked}>
                    {loading ? '재는 중…' : 'RPM 재기'}
                </button>
                {today && (
                    <label className="lw-rpm-auto">
                        <input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} />
                        10분마다 자동 갱신
                        {lastAt && <b>{lastAt} 기준</b>}
                    </label>
                )}
            </form>
            {note && <div className={`lw-note${report ? '' : ' lw-note-err'}`}>{note}</div>}
            {/*
              * 오늘 값의 성격을 그대로 밝힌다. 애드센스 수익은 월말 정산 전까지
              * 전부 '추정' 표기이고(어제 값도 그렇다), 오늘 값은 거기에 더해
              * 아직 움직인다. 구글이 실제로 잰 값이지 우리가 만든 값은 아니다.
              */}
            {today && (
                <div className="lw-note lw-note-plain">
                    오늘 값은 <b>15~30분마다 갱신되며 아직 움직입니다</b> — 늦게 잡히는 노출·클릭이 있어 하루가 끝나야 자리를 잡습니다.
                    방금 올린 글이면 페이지뷰가 쌓일 때까지 RPM 이 크게 흔들립니다. 애드센스 수익은 월말 정산 전까지 전부 추정 표기입니다.
                </div>
            )}

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
                                    <th scope="col" aria-label="추이·외부유입" />
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
                                            <td>
                                                <button
                                                    type="button" className="lw-mini"
                                                    onClick={() => { void openTrend(row.pageUrl); }}
                                                    disabled={trendBusy === row.pageUrl}
                                                >{trendBusy === row.pageUrl ? '여는 중…' : '추이'}</button>
                                                {/* 이 탭의 결론 — 이 글에 사람을 데려올지 말지. 바로 레이더로 넘긴다. */}
                                                {onRadar && (
                                                    <button
                                                        type="button" className="lw-mini lw-mini-ghost"
                                                        onClick={() => onRadar(`https://${row.pageUrl.replace(/^https?:\/\//, '')}`)}
                                                    >외부유입</button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {rows.length === 0 && (
                                    <tr><td colSpan={6}>그 주소로 수익이 잡힌 글이 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {trend && (
                        <section className="lw-panel" style={{ marginTop: 14 }}>
                            <div className="lw-panel-head">
                                <h2>날짜별 RPM</h2>
                                <span>
                                    {trend.url} · 최근 30일
                                    {' — '}시작점이 낮으면 접고, 높게 시작하면 트래픽을 부으면 됩니다.
                                    나중에 오른 날이 있으면 그날부터 무엇이 달라졌는지 보십시오.
                                </span>
                            </div>
                            <div className="lw-audit-table lw-rpm-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th scope="col">날짜</th>
                                            <th scope="col">RPM</th>
                                            <th scope="col">수익</th>
                                            <th scope="col">페이지뷰</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {trend.rows.map((day) => (
                                            <tr key={day.date}>
                                                <td>{day.date}</td>
                                                <td>{day.rpm == null ? '—' : money(day.rpm, trend.currency)}</td>
                                                <td>{money(day.earnings, trend.currency)}</td>
                                                <td>{count(day.pageViews)}</td>
                                            </tr>
                                        ))}
                                        {trend.rows.length === 0 && (
                                            <tr><td colSpan={4}>이 글로 잡힌 날이 없습니다 — 아직 방문자가 없거나 광고가 안 떴습니다.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <button type="button" className="lw-mini" style={{ marginTop: 10 }} onClick={() => setTrend(null)}>닫기</button>
                        </section>
                    )}

                    <div className="lw-note lw-note-plain">
                        <b>트래픽을 끌기 전에 RPM 부터 보십시오.</b> 같은 1,000명을 데려와도 RPM $12 짜리 글은 $12 를 내고,
                        $0.50 짜리 글은 $0.50 을 냅니다 — 24배 차이입니다. 사람을 모으는 품은 똑같이 듭니다.
                        방문자가 하나만 생겨도 그 글은 여기 뜹니다. 다만 <b>뷰가 적을수록 값이 크게 흔들립니다</b> —
                        방문자 셋에 클릭 하나면 RPM 이 수십 달러로 찍힙니다. 그래서 뷰 100 미만이면 몇 뷰짜리인지 함께 적습니다.
                        <br />네이버 블로그 글은 여기 나오지 않습니다 — 애드센스를 붙일 수 없는 곳이라 값 자체가 없습니다.
                        <br />남의 글 RPM 은 잴 수 없습니다: 수익도 페이지뷰도 계정 주인만 볼 수 있습니다.
                    </div>
                </>
            )}
        </>
    );
}
