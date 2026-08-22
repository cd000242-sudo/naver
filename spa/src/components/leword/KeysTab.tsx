import { useCallback, useEffect, useState } from 'react';
import { checkClaudeToken, exchangeClaudeOauth, fetchClaudeUsage, type ClaudeUsage } from '../../lib/keywordApi';
import { bridgeAgentLogin, bridgeClaudeCredentials, probeBridge, type BridgeStatus } from '../../lib/bridge';
import {
    KEY_GROUPS,
    checkKeyShape,
    clearUserKeys,
    isGroupReady,
    loadUserKeys,
    saveUserKeys,
    type UserKeys,
} from '../../lib/userKeys';
import { TabIntro } from './LewordShared';

/*
 * 앤트로픽은 두 개의 창으로 한도를 센다 — 5시간, 그리고 7일.
 * 둘 중 하나만 차도 막히므로 둘 다 보여 준다.
 */
const USAGE_WINDOWS = [
    { key: 'fiveHour' as const, label: '5시간' },
    { key: 'sevenDay' as const, label: '7일' },
];
/** 색은 상태 신호다 — 여유 / 조심 / 곧 막힘. */
const usageColor = (percent: number) => (percent >= 90 ? '#ff6b81' : percent >= 70 ? '#f5c518' : '#7c5cff');
/** 리셋 시각은 사장님 시계(KST)로 적는다. 오늘이면 시각만, 아니면 날짜까지. */
const resetText = (iso: string | null) => {
    if (!iso) return '';
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    const sameDay = at.toDateString() === new Date().toDateString();
    const time = at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
    return sameDay ? `${time} 리셋` : `${at.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} ${time} 리셋`;
};

/**
 * 앱 폴백 체인 — 앱 브리지의 kinAnswer 체인 순서(claude→codex→gemini→grok)와
 * 같아야 한다. 화면 순서가 실제 실행 순서와 갈라지면 안내가 거짓말이 된다.
 */
/**
 * 엔진 목록 — 전부 **구독**으로 쓴다. API 키 칸은 없앴다(사장님 확정
 * 2026-08-20 "API 는 비용이 추가된다니까").
 *
 * 클로드만 사이트에서 토큰을 뽑을 수 있다 — 앤트로픽이 `claude setup-token`
 * 이라는 이식 가능한 구독 토큰 발급 수단을 공식 제공하기 때문이다. 코덱스·
 * 제미나이·그록은 같은 수단이 없어서(로그인이 그 PC 안에서만 끝난다) 앱이
 * 다리를 놓는다 — 이 경우에도 비용은 구독 그대로, 추가 과금 0 이다.
 */
const AGENT_CHAIN = [
    {
        id: 'claude', label: '클로드코드',
        sub: '클로드 구독 · 사이트에서 버튼 한 번(앱 불필요)',
        webConnect: true,
    },
    {
        id: 'codex', label: '코덱스 · 챗지피티 구독',
        sub: '앱에서 [연동] → 챗지피티 로그인 → 그 구독으로 실행(추가 비용 0)',
        webConnect: false,
    },
    {
        id: 'gemini', label: '제미나이 CLI · 구글 구독',
        sub: '앱에서 [연동] → 구글 로그인 → 그 구독으로 실행(추가 비용 0)',
        webConnect: false,
    },
    {
        id: 'grok', label: '그록 · xAI 구독',
        sub: '앱에서 [연동] → xAI 로그인 → 그 구독으로 실행(추가 비용 0)',
        webConnect: false,
    },
] as const;

/**
 * 내 API 키.
 *
 * 사장님 키로만 돌리면 남이 긁어가는 만큼 사장님 쿼터가 탄다. 자기 키를 넣은
 * 사람은 자기 쿼터를 쓰므로 조회 제한이 없다 — 이게 이 화면의 존재 이유다.
 *
 * 키는 이 브라우저에만 저장한다. 조회할 때만 요청 본문(POST)에 실어 보내고
 * 서버는 요청이 끝나면 버린다. 그 사실을 화면에도 적어 둔다 — 남의 API 키를
 * 넣으라고 하면서 어디로 가는지 안 알려주는 건 못 할 짓이다.
 */
function KeysTab() {
    const [keys, setKeys] = useState<UserKeys>(() => loadUserKeys());
    const [saved, setSaved] = useState(false);
    const [revealed, setRevealed] = useState<Record<string, boolean>>({});
    /*
     * AI 추론은 API 키가 아니라 **클로드코드 연동**이다(사장님 지시 2026-08-17).
     * 이 페이지가 사용자 PC 의 LEWORD 앱 브리지에 접속해 그 사람의 클로드코드
     * 구독으로 돈다 — 키도, 추가 비용도 없다. null = 아직 확인 중.
     */

    /*
     * 구독 연결(버튼 한 번) — 클로드코드와 같은 공개 OAuth(PKCE). 승인 화면이
     * 코드를 보여 주면 그 한 줄만 붙여넣는다(우리 도메인은 리다이렉트 허용목록에
     * 없어 이게 물리적 최소다). refresh 토큰까지 저장돼 만료는 자동 갱신된다.
     */
    const [oauth, setOauth] = useState<{ verifier: string } | null>(null);
    const [oauthCode, setOauthCode] = useState('');
    const [oauthBusy, setOauthBusy] = useState(false);
    const [oauthNote, setOauthNote] = useState('');

    const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    /*
     * [연동] — 앱이 켜져 있으면 **승인 창 없이 한 번에** 끝난다.
     *
     * 사장님 지시 2026-08-22: "앱만 켜놓고 연동시키고 나서 사이트도 같이
     * 연동시키면 끝나는 거 아니야?" — 맞다. 클로드 CLI 는 로그인 자격을
     * sk-ant 토큰으로 들고 있어 사이트 서버가 그대로 쓸 수 있다. 앱에서 이미
     * 로그인해 둔 것을 건네받으면 브라우저 승인 절차가 통째로 필요 없다.
     * 앱이 꺼져 있거나 클로드 로그인 전이면 예전처럼 승인 창으로 간다.
     */
    const startClaudeConnect = async () => {
        setOauthNote('앱에 물어보는 중…');
        const fromApp = await bridgeClaudeCredentials();
        if (fromApp.status === 'ok') {
            const next = {
                ...keys,
                claudeToken: fromApp.token,
                claudeRefresh: fromApp.refresh,
                claudeExpiresAt: fromApp.expiresAt ? String(fromApp.expiresAt) : '',
                aiProvider: keys.aiProvider || 'claude',
            };
            setKeys(next);
            saveUserKeys(next);
            setOauth(null);
            const planText = fromApp.subscriptionType ? ` (${fromApp.subscriptionType} 구독)` : '';
            setOauthNote(`✅ 앱에서 바로 연동했습니다${planText} — 이제 앱을 꺼도 사이트에서 전부 돕니다.`);
            return;
        }
        if (fromApp.status === 'not-logged-in') {
            setOauthNote('앱은 켜져 있는데 클로드 로그인이 없습니다 — 앱에서 클로드 로그인을 먼저 하시거나, 아래 승인 절차로 연결하세요.');
        } else if (fromApp.status === 'outdated') {
            setOauthNote('앱이 구버전이라 자동 연동이 안 됩니다 — 앱을 업데이트하시거나 아래 승인 절차로 연결하세요.');
        } else {
            setOauthNote('앱이 꺼져 있어 승인 절차로 연결합니다 (앱을 켜면 버튼 한 번으로 끝납니다).');
        }

        const raw = new Uint8Array(32);
        crypto.getRandomValues(raw);
        const verifier = base64url(raw);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
        const stateRaw = new Uint8Array(24);
        crypto.getRandomValues(stateRaw);
        setOauth({ verifier });
        setOauthCode('');
        setOauthNote('');
        const url = 'https://claude.ai/oauth/authorize?code=true'
            + '&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e'
            + '&response_type=code'
            + `&redirect_uri=${encodeURIComponent('https://platform.claude.com/oauth/code/callback')}`
            // 범위를 줄이면 토큰은 나오는데 추론이 거부된다(무한루프 실사고 2026-08-20).
            + `&scope=${encodeURIComponent('user:profile user:inference user:sessions:claude_code user:mcp_servers')}`
            + `&code_challenge=${base64url(digest)}`
            + '&code_challenge_method=S256'
            + `&state=${base64url(stateRaw)}`;
        window.open(url, '_blank', 'noreferrer');
    };

    const finishClaudeConnect = async () => {
        if (!oauth || !oauthCode.trim() || oauthBusy) return;
        setOauthBusy(true);
        setOauthNote('');
        const result = await exchangeClaudeOauth(oauthCode.trim(), oauth.verifier);
        setOauthBusy(false);
        if (!result.ok || !result.data?.accessToken) {
            setOauthNote(`연결 실패: ${result.message || result.error || '코드를 다시 확인해 주세요'}`);
            return;
        }
        const next = {
            ...keys,
            claudeToken: result.data.accessToken,
            claudeRefresh: result.data.refreshToken || '',
            claudeExpiresAt: String(result.data.expiresAt || ''),
        };
        setKeys(next);
        saveUserKeys(next);
        setOauth(null);
        setOauthNote('✅ 연결됐습니다 — 추론·답변이 전부 구독으로, 앱 없이 돕니다. 만료는 자동 갱신됩니다.');
    };
    /*
     * 폴백 체인 상태(사장님 지시 2026-08-20 "코덱스·제미나이 CLI·그록 연동
     * 상태를 봐야 폴백에 걸릴 거 아냐") — 앱 브리지가 네 CLI 를 실제로 찔러
     * 본 결과를 그대로 보여 준다. 지어낸 상태는 없다.
     *
     * 자동 조회는 크롬의 사설망 접근(PNA) 정책에 막힐 수 있어(https 페이지 →
     * 127.0.0.1 은 사용자 클릭에서 시작된 요청에만 권한 팝업이 뜬다) 버튼도
     * 함께 둔다. 버튼 경로는 앱이 브리지를 여는 시간까지 몇 초 재시도한다.
     */
    const [bridge, setBridge] = useState<BridgeStatus | 'probing' | null>(null);
    useEffect(() => { probeBridge().then(setBridge); }, []);
    const refreshAgents = async () => {
        setBridge('probing');
        let status: BridgeStatus | null = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            status = await probeBridge();
            if (status?.connected) break;
            await new Promise((resolve) => { setTimeout(resolve, 2000); });
        }
        setBridge(status);
    };
    /*
     * "앱이 켜져 있나"는 connected 로 판단한다.
     * probeBridge 는 **실패해도** { connected: false } 객체를 돌려주므로
     * 객체가 있는지만 보면 앱이 꺼져 있어도 항상 참이 된다(잠복 결함).
     * 순서 안내가 이 값으로 "✅ 앱이 켜져 있습니다"를 찍기 시작하면서 드러났다.
     */
    const bridgeReady = Boolean(bridge && bridge.connected);
    const agentOf = (provider: string) => (bridgeReady ? (bridge.agents || []).find((agent) => agent.provider === provider) : undefined);

    /** 지금 쓰기로 고른 엔진. 안 골랐으면 연동된 것 중 클로드 우선으로 본다. */
    const activeProvider = String(keys.aiProvider || '') || (keys.claudeToken ? 'claude' : '');

    /*
     * 순서 안내가 "지금 어디까지 했는지"를 짚으려면 세 가지 사실이 필요하다.
     * 전부 실측이다 — 앱이 실제로 응답했는지, 그 엔진이 실제로 쓸 수 있는지,
     * 토큰이 실제로 저장돼 있는지.
     */
    const readyAgentLabels = AGENT_CHAIN
        .filter((item) => agentOf(item.id)?.available)
        .map((item) => item.label);
    const anyAgentReady = readyAgentLabels.length > 0;
    const claudeAgentReady = Boolean(agentOf('claude')?.available);
    const hasClaudeToken = Boolean(String(keys.claudeToken || '').trim());

    /** 제공자별 로그인 시작 — 앱이 그 PC 에서 로그인 창을 띄운다. */
    const [loginBusy, setLoginBusy] = useState('');
    const [loginNote, setLoginNote] = useState('');
    /**
     * CLI 구독 로그인. `switchAccount` 면 기존 계정을 먼저 지운다.
     *
     * 그냥 다시 누르면 CLI 가 "이미 로그인돼 있습니다" 로 끝난다 — 플랜이 다른
     * 계정으로 갈아탈 수가 없었다(사장님 실측 2026-08-20).
     */
    const startAgentLogin = async (provider: 'claude' | 'codex' | 'gemini' | 'grok', label: string, switchAccount = false) => {
        if (switchAccount && !window.confirm(`${label}의 지금 계정 연결을 끊고 다른 계정으로 로그인합니다. 계속할까요?`)) return;
        setLoginBusy(provider);
        setLoginNote(switchAccount ? `${label}: 기존 계정 연결을 끊는 중…` : '');
        const result = await bridgeAgentLogin(provider, switchAccount);
        setLoginBusy('');
        if (!result) {
            setLoginNote(`${label} 로그인을 시작하지 못했습니다 — LEWORD 앱을 켠 뒤 다시 눌러 주세요(이 로그인은 내 PC 에서만 됩니다).`);
            return;
        }
        if (result.state === 'installing') setLoginNote(`${label}: 설치 중입니다(1~2분) — 끝나면 로그인 창이 열립니다. [상태 확인]으로 지켜보세요.`);
        else if (result.state === 'already') setLoginNote(`${label}: 이미 로그인돼 있습니다.`);
        else if (result.state === 'done') setLoginNote(`${label}: 로그인 완료.`);
        else if (result.state === 'failed') setLoginNote(`${label} 로그인 실패: ${result.message || ''}`);
        else setLoginNote(`${label}: 브라우저가 열렸습니다 — 승인한 뒤 [상태 확인]을 눌러 주세요.`);
        await refreshAgents();
    };

    const update = (field: string, value: string) => {
        setKeys((previous) => ({ ...previous, [field]: value }));
        setSaved(false);
    };

    /*
     * 구독 플랜과 남은 사용량 — 토큰이 있으면 자동으로 한 번 잰다.
     * 확인용 요청이 4토큰짜리라 부담이 없다. 값은 전부 앤트로픽이 준 것이다.
     */
    const [usage, setUsage] = useState<{ state: 'idle' | 'loading' | 'done' | 'error'; data?: ClaudeUsage; message?: string }>({ state: 'idle' });
    const loadUsage = useCallback(async () => {
        const token = String(loadUserKeys().claudeToken || '').trim();
        if (!token) { setUsage({ state: 'idle' }); return; }
        setUsage({ state: 'loading' });
        const result = await fetchClaudeUsage(token);
        if (result.ok && result.data) setUsage({ state: 'done', data: result.data });
        else setUsage({ state: 'error', message: result.message || result.error || '사용량을 못 읽었습니다.' });
    }, []);
    useEffect(() => { void loadUsage(); }, [loadUsage]);

    const problems = checkKeyShape(keys);

    const persist = async () => {
        // 형식이 이상하면 저장하지 않는다. 자동완성으로 들어온 로그인 정보를
        // 그대로 저장하면 다음 조회에서 그게 서버로 간다.
        if (problems.length > 0) return;
        /*
         * 클로드 토큰은 저장 전에 **실제로 되는지** 확인한다(사장님 실사고
         * 2026-08-20: 안 되는 값을 저장 → 생성 실패 → 자동 삭제 → 무한루프).
         * 승인 코드를 토큰 칸에 넣는 흔한 실수도 여기서 잡아 준다.
         */
        const token = String(keys.claudeToken || '').trim();
        if (token && token !== String(loadUserKeys().claudeToken || '')) {
            if (!/^sk-ant-/.test(token)) {
                setOauthNote('이건 토큰이 아니라 승인 코드로 보입니다 — 위 [클로드 구독 연결] 버튼을 누른 뒤 나오는 칸에 넣어 주세요.');
                return;
            }
            setOauthBusy(true);
            const checked = await checkClaudeToken(token);
            setOauthBusy(false);
            if (!checked.ok) {
                setOauthNote(`이 토큰으로는 생성이 안 됩니다: ${checked.message || checked.error} — [클로드 구독 연결] 버튼으로 새로 연결해 주세요.`);
                return;
            }
            setOauthNote('✅ 토큰 확인됨 — 저장했습니다.');
            window.setTimeout(() => { void loadUsage(); }, 0);
        }
        saveUserKeys(keys);
        setKeys(loadUserKeys());
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2600);
    };

    const removeAll = () => {
        clearUserKeys();
        setKeys({});
        setSaved(false);
    };

    return (
        <>
            <TabIntro
                title="내 API 키"
                desc="자기 키를 넣으면 자기 쿼터로 조회하므로 무료 횟수 제한이 없습니다. 넣지 않아도 무료 조회는 그대로 됩니다."
                source="키는 이 브라우저에만 저장 · 조회할 때만 전송 · 서버 보관 없음"
            />

            <div className="lw-note lw-note-plain">
                <strong>키가 어디로 가는지</strong>
                입력한 키는 <strong>이 브라우저의 저장소</strong>에만 남습니다. 조회를 누를 때만 요청 본문에 담겨
                서버로 가고(주소창·기록에 남지 않도록 POST로 보냅니다), 서버는 조회가 끝나면 버립니다.
                시트·로그·설정 어디에도 저장하지 않습니다. 브라우저를 바꾸면 다시 입력해야 합니다.
            </div>

            {/*
              * AI 연동 — 하나다(사장님 확정 2026-08-20). 구독 연결 버튼이 전부고,
              * 옛 '연동하기'(앱 브리지) 버튼은 뺐다("이제 필요 없지 않아?") —
              * 앱 브리지는 화면 뒤 폴백으로만 남는다.
              */}
            <section className="lw-panel" aria-label="AI 연동">
                <div className="lw-panel-head">
                    <h2>AI 연동 — 쓸 엔진을 골라 연동하세요</h2>
                    <span className={activeProvider ? 'lw-key-on' : ''}>
                        {activeProvider
                            ? `● ${AGENT_CHAIN.find((item) => item.id === activeProvider)?.label} 사용 중`
                            : '아직 고르지 않음'}
                    </span>
                </div>
                <p className="lw-card-note" style={{ marginBottom: 12 }}>
                    <strong>전부 구독으로 씁니다 — API 키(사용량 과금)는 쓰지 않습니다.</strong> 이미 내고 있는
                    구독 하나만 연동하면 지식인 답변·마인드맵 추론·글 진단이 그 엔진으로 돕니다.
                </p>

                {/*
                  * 연동 순서(사장님 지적 2026-08-22 "사용자가 문제없이 완벽히
                  * 연동시키려면 순서가 어떻게 되는 건데?"). 어디에도 안 적혀 있어서
                  * 화면이 "연동됨"이라고만 하고 무엇을 더 해야 하는지 말하지 않았다.
                  */}
                {/*
                  * 단계마다 "지금 여기"를 짚어 준다(사장님 확정 2026-08-22:
                  * "다운로드 먼저 유도 → 앱에서 연동 → 다 되면 사이트에서 연동").
                  * 앱이 잡히는지에 따라 끝난 단계는 ✅, 지금 할 단계는 강조한다 —
                  * 순서만 적어 두면 자기가 어디까지 했는지 여전히 모른다.
                  */}
                <ol className="lw-connect-steps">
                    <li className={bridgeReady ? 'done' : 'now'}>
                        <b>LEWORD 앱을 켭니다.</b>{' '}
                        {bridgeReady
                            ? <span className="lw-step-ok">✅ 앱이 켜져 있습니다</span>
                            : (
                                <>
                                    앱이 CLI 설치·로그인을 대신 해 주고, 사이트 연동까지 버튼 한 번으로 끝냅니다.{' '}
                                    <a className="lw-step-cta" href="/download">⬇ LEWORD 받기</a>
                                    <em>클로드만 쓰실 거면 앱 없이 아래 [연동]으로도 됩니다 — 대신 승인 창을 한 번 거칩니다.</em>
                                </>
                            )}
                    </li>
                    <li className={bridgeReady && !anyAgentReady ? 'now' : (anyAgentReady ? 'done' : '')}>
                        <b>앱에서 쓸 엔진에 로그인합니다.</b>{' '}
                        {anyAgentReady
                            ? <span className="lw-step-ok">✅ {readyAgentLabels.join(' · ')} 로그인됨</span>
                            : '앱을 켜고 이 화면의 [연동]을 누르면 그 CLI 를 설치하고 로그인 창을 열어 줍니다. 구독 로그인이 그 PC 안에서만 끝나는 방식이라 웹에서는 못 엽니다.'}
                        <em>구독이 있어야 합니다 — 클로드 Max/Pro · 챗지피티 Plus/Pro · 구글 · SuperGrok. 무료 계정은 CLI 로그인이 막힙니다.</em>
                    </li>
                    <li className={hasClaudeToken ? 'done' : (claudeAgentReady ? 'now' : '')}>
                        <b>아래 클로드 줄에서 [연동].</b>{' '}
                        {hasClaudeToken
                            ? <span className="lw-step-ok">✅ 사이트까지 연동됐습니다 — 앱을 꺼도 돕니다</span>
                            : '앱이 들고 있는 클로드 자격을 사이트로 넘깁니다. 이 한 번이면 앱을 꺼도 사이트가 전부 돕니다.'}
                    </li>
                    <li className={activeProvider ? 'done' : ''}>
                        <b>쓸 엔진에서 [사용].</b>{' '}
                        {activeProvider
                            ? <span className="lw-step-ok">✅ {AGENT_CHAIN.find((item) => item.id === activeProvider)?.label} 사용 중</span>
                            : '고른 엔진 하나로만 돕니다. 몰래 다른 엔진으로 갈아타지 않습니다.'}
                    </li>
                </ol>
                <p className="lw-card-note" style={{ marginBottom: 12 }}>
                    3번이 <b>클로드만</b> 되는 이유: 클로드 CLI 는 자격을 토큰으로 들고 있어 사이트 서버가 그대로 씁니다.
                    코덱스·제미나이·그록은 각 서비스의 로그인 세션이라 서버가 쓸 토큰으로 바꿀 방법이 없습니다 —
                    그 셋은 <b>앱을 켜 두면</b> 앱이 대신 돌려 줍니다.
                </p>

                <div className="lw-engines-list">
                    {AGENT_CHAIN.map((item) => {
                        const agent = agentOf(item.id);
                        const hasToken = item.id === 'claude' && Boolean(String(keys.claudeToken || '').trim());
                        const linked = hasToken || Boolean(agent?.available);
                        /*
                         * 상태를 셋으로 가른다(사장님 지적 2026-08-22:
                         * "연동됐다면서 왜 구독토큰 필드가 초기화되니? 연동됨이랑 모순인데").
                         *
                         * 모순이 아니라 표현이 뭉개져 있었다. "연동됨(구독)"과
                         * "연동됨(앱·구독)"은 **되는 범위가 다른 상태**인데 둘 다
                         * "✅ 연동됨"으로 시작해 같아 보였다:
                         *   토큰 있음 → 사이트 서버가 직접 쓴다. 앱을 꺼도 된다.
                         *              토큰 칸이 채워지고 플랜·사용량도 이 토큰으로 잰다.
                         *   앱만 연동 → 이 PC 의 CLI 로그인이다. 서버는 못 쓴다.
                         *              그래서 토큰 칸은 비어 있는 게 맞다. 앱을 켜 둬야 한다.
                         * 클로드는 앱에서 사이트로 넘길 수 있으니 그렇게 하라고 말해 준다.
                         */
                        const state = hasToken ? '✅ 사이트까지 연동 — 앱 없이 됩니다'
                            : agent?.available
                                ? (item.id === 'claude'
                                    ? '⚠️ 앱에만 연동 — [연동]을 누르면 사이트도 끝'
                                    : '✅ 앱에 연동 — 앱을 켜 두면 됩니다')
                                : agent?.installed ? '앱: 로그인 필요'
                                    : item.webConnect ? '미연동' : '앱에서 연동';
                        const active = activeProvider === item.id;
                        return (
                            <div key={item.id} className={`lw-engine-row${active ? ' on' : ''}`}>
                                <div className="lw-engine-name">
                                    <b>{item.label}</b>
                                    <small>{item.sub}</small>
                                </div>
                                {/* 클로드가 앱에만 연동된 상태는 초록이 아니라 노랑이다 — 할 일이 남았다. */}
                                <span className={`lw-engine-state${linked ? (item.id === 'claude' && !hasToken ? ' half' : ' ok') : ''}`}>{state}</span>
                                <div className="lw-engine-actions">
                                    {item.id === 'claude' ? (
                                        keys.claudeToken ? (
                                            <button
                                                type="button"
                                                className="lw-mini lw-mini-ghost"
                                                onClick={() => {
                                                    const next = { ...keys, claudeToken: '', claudeRefresh: '', claudeExpiresAt: '' };
                                                    setKeys(next);
                                                    saveUserKeys(next);
                                                    setUsage({ state: 'idle' });
                                                    setOauthNote('연결을 끊었습니다 — [연동]을 눌러 다른 계정으로 로그인하세요.');
                                                }}
                                            >계정 바꾸기</button>
                                        ) : (
                                            <button type="button" className="lw-mini" onClick={startClaudeConnect} disabled={oauthBusy}>연동</button>
                                        )
                                    ) : (
                                        <button
                                            type="button"
                                            className="lw-mini"
                                            onClick={() => startAgentLogin(item.id, item.label, linked)}
                                            disabled={Boolean(loginBusy)}
                                        >{loginBusy === item.id ? '여는 중…' : linked ? '계정 바꾸기' : '연동'}</button>
                                    )}
                                    <button
                                        type="button"
                                        className={`lw-mini${active ? '' : ' lw-mini-ghost'}`}
                                        onClick={() => {
                                            const next = { ...keys, aiProvider: item.id };
                                            setKeys(next);
                                            saveUserKeys(next);
                                            setLoginNote(`${item.label}(으)로 사용합니다 — 답변·추론·진단이 이 엔진으로 돕니다.`);
                                        }}
                                    >{active ? '사용 중' : '사용'}</button>
                                </div>
                                {/*
                                  * 클로드만 토큰 칸이 있다 — 버튼이 자동으로 채우고, 다른 PC 에서
                                  * 받은 토큰을 손으로 옮겨 넣을 수도 있다. 나머지 셋은 이식 가능한
                                  * 구독 토큰이 존재하지 않아 칸 자체를 두지 않는다(빈 칸을 두면
                                  * 넣을 게 있는 줄 알고 API 키를 넣게 된다 — 그건 과금이다).
                                  */}
                                {/*
                                  * 사용량 줄(사장님 2026-08-20 "연동된 에이전트 전부 사용량
                                  * 보이게, 할당량 없으면 없음이라고"). 코덱스·제미나이·그록은
                                  * 사용량을 내주는 API 가 없다(실측) — 지어내지 않고 '제공
                                  * 안 함'이라 적는다. 코덱스는 플랜(구독 등급)만 사실로 있다.
                                  */}
                                {item.id !== 'claude' && linked && (
                                    <p className="lw-engine-usage">
                                        {agent?.plan ? <b>{agent.plan.toUpperCase()} 구독</b> : '구독 확인됨'}
                                        {' · '}사용량: 이 서비스는 제공하지 않습니다
                                    </p>
                                )}
                                {item.id === 'claude' && hasToken && (
                                    <div className="lw-usage">
                                        <div className="lw-usage-head">
                                            <span className="lw-usage-plan">{usage.data?.plan || '플랜 확인 중'}</span>
                                            {usage.data?.email && <span className="lw-usage-who">{usage.data.email}</span>}
                                            <button type="button" onClick={() => { void loadUsage(); }} disabled={usage.state === 'loading'}>
                                                {usage.state === 'loading' ? '재는 중…' : '다시 재기'}
                                            </button>
                                        </div>
                                        {usage.state === 'error' && <p className="lw-usage-err">{usage.message}</p>}
                                        {usage.data && USAGE_WINDOWS.map((window) => {
                                            const value = usage.data?.[window.key];
                                            if (!value || value.percent === null) return null;
                                            return (
                                                <div className="lw-usage-row" key={window.key}>
                                                    <span className="lw-usage-label">{window.label}</span>
                                                    <span className="lw-usage-bar">
                                                        <i style={{ transform: `scaleX(${Math.min(100, value.percent) / 100})`, background: usageColor(value.percent) }} />
                                                    </span>
                                                    <span className="lw-usage-pct">{value.percent}%</span>
                                                    <span className="lw-usage-reset">{resetText(value.resetAt)}</span>
                                                </div>
                                            );
                                        })}
                                        {/*
                                          * 한도 경고 — 기준은 제일 낮은 플랜이다(사장님 2026-08-20:
                                          * "내가 Max 20x 쓰는 게 특이 케이스고 보통은 제일 낮은 플랜").
                                          * Pro 는 5시간 창이 금방 찬다. 막히고 나서 당황하지 않게
                                          * 미리 알리고, 그때 할 일(다른 엔진으로 전환)까지 적는다.
                                          */}
                                        {usage.data && (() => {
                                            const hit = USAGE_WINDOWS
                                                .map((window) => ({ window, value: usage.data?.[window.key] }))
                                                .find(({ value }) => value && (value.status === 'rejected' || (value.percent !== null && value.percent >= 85)));
                                            if (!hit || !hit.value) return null;
                                            const blocked = hit.value.status === 'rejected';
                                            return (
                                                <p className={`lw-usage-warn${blocked ? ' hard' : ''}`}>
                                                    {blocked
                                                        ? `${hit.window.label} 한도가 찼습니다 — ${resetText(hit.value.resetAt) || '잠시 뒤'}까지 클로드로는 생성이 안 됩니다.`
                                                        : `${hit.window.label} 한도의 ${hit.value.percent}% 를 썼습니다 — ${resetText(hit.value.resetAt) || '곧'} 까지 아껴 쓰세요.`}
                                                    {' '}위 목록에서 다른 엔진의 <b>[사용]</b>을 누르면 그 구독으로 계속할 수 있습니다.
                                                </p>
                                            );
                                        })()}
                                        <p className="lw-usage-foot">앤트로픽이 알려 준 값입니다 — 남은 양이 아니라 <b>쓴 양</b>입니다.</p>
                                    </div>
                                )}
                                {item.id === 'claude' && (
                                    <div className="lw-engine-key">
                                        <label>
                                            구독 토큰 (버튼이 자동 저장 · 손입력도 가능)
                                            <input
                                                type="password"
                                                value={String(keys.claudeToken || '')}
                                                onChange={(event) => update('claudeToken', event.target.value)}
                                                placeholder="sk-ant-oat..."
                                                autoComplete="new-password"
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/*
                  * 클로드 승인 코드 입력 — [연동]을 누른 뒤에만 나타난다.
                  * 코드 칸과 토큰 칸을 헷갈려 무한루프가 났던 실사고(2026-08-20)
                  * 재발 방지로 단계를 번호로 적는다.
                  */}
                {oauth && !keys.claudeToken && (
                    <div className="lw-claude-steps">
                        <p><b>① 새 탭</b>에서 승인을 누르세요. <b>② 그 화면에 뜬 코드</b>를 아래 칸에 붙여넣고 [연결 완료].</p>
                        <div className="lw-claude-code">
                            <input
                                type="text"
                                value={oauthCode}
                                onChange={(event) => setOauthCode(event.target.value)}
                                placeholder="여기에 승인 코드 붙여넣기"
                                aria-label="클로드 승인 코드"
                                autoFocus
                            />
                            <button type="button" className="lw-mini" onClick={finishClaudeConnect} disabled={oauthBusy || !oauthCode.trim()}>
                                {oauthBusy ? '연결 중…' : '연결 완료'}
                            </button>
                        </div>
                    </div>
                )}
                {oauthNote && <p className="lw-card-note" style={{ marginTop: 10, marginBottom: 0 }}>{oauthNote}</p>}

                <div className="lw-agents-head" style={{ marginTop: 12 }}>
                    <b>코덱스·제미나이·그록 상태는 앱이 실제로 확인한 값입니다</b>
                    <button type="button" className="lw-mini lw-mini-ghost" onClick={refreshAgents} disabled={bridge === 'probing'}>
                        {bridge === 'probing' ? '확인 중…' : '상태 확인'}
                    </button>
                </div>
                {loginNote && <p className="lw-card-note" style={{ margin: '8px 0 0' }}>{loginNote}</p>}
            </section>

            {KEY_GROUPS.map((group) => {
                const ready = isGroupReady(group, keys);
                return (
                    <section key={group.id} className="lw-panel" aria-label={group.label}>
                        <div className="lw-panel-head">
                            <h2>{group.label}</h2>
                            <span className={ready ? 'lw-key-on' : ''}>
                                {ready ? '● 사용 중' : '미입력 — 사장님 키로 조회'}
                            </span>
                            <a className="lw-key-issue" href={group.issueUrl} target="_blank" rel="noreferrer">발급받기 →</a>
                        </div>
                        <p className="lw-card-note" style={{ marginBottom: 12 }}>{group.desc}</p>
                        <div className="lw-key-fields">
                            {group.fields.map((field) => {
                                /*
                                 * 기본은 가린다. 예전엔 액세스 라이선스·고객 ID 를 '비밀 아님'으로
                                 * 두고 화면에 그대로 띄웠는데, 그것도 남이 보면 안 되는 값이다.
                                 * 지금은 sub_id 같은 꼬리표만 열어 둔다.
                                 */
                                const showing = Boolean(revealed[field.key]) || !field.secret;
                                return (
                                    <label key={field.key} className="lw-key-field">
                                        <span>{field.label}</span>
                                        <div>
                                            <input
                                                type={showing ? 'text' : 'password'}
                                                value={keys[field.key] || ''}
                                                onChange={(event) => update(field.key, event.target.value)}
                                                placeholder={field.placeholder}
                                                /*
                                                 * 브라우저 비밀번호 관리자 차단.
                                                 * `off` 는 크롬이 무시한다 — 비밀 칸에는 `new-password`
                                                 * 를 줘야 저장된 로그인을 안 채운다. name 도 로그인처럼
                                                 * 보이지 않게 바꾸고, 외부 관리자용 표시도 함께 단다.
                                                 */
                                                name={`lw-nofill-${field.key}`}
                                                autoComplete={field.secret ? 'new-password' : 'off'}
                                                data-lpignore="true"
                                                data-1p-ignore=""
                                                data-form-type="other"
                                                spellCheck={false}
                                            />
                                            {field.secret && (
                                                <button
                                                    type="button"
                                                    className="lw-mini lw-mini-ghost"
                                                    onClick={() => setRevealed((p) => ({ ...p, [field.key]: !p[field.key] }))}
                                                >{showing ? '가리기' : '보기'}</button>
                                            )}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </section>
                );
            })}

            {problems.length > 0 && (
                <div className="lw-note lw-note-error" role="alert">
                    <strong>이 값은 네이버 키가 아닌 것 같습니다 — 저장하지 않았습니다</strong>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                        {problems.map((problem) => (
                            <li key={problem.field}>{problem.label}: {problem.reason}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="lw-key-actions">
                <button type="button" className="lw-key-save" onClick={persist} disabled={problems.length > 0}>
                    {saved ? '✓ 저장됨' : '저장'}
                </button>
                <button type="button" className="lw-mini lw-mini-ghost" onClick={removeAll}>전부 지우기</button>
            </div>
        </>
    );
}

export default KeysTab;
