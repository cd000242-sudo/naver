import { useEffect, useState } from 'react';
import { checkClaudeToken, exchangeClaudeOauth } from '../../lib/keywordApi';
import { bridgeAgentLogin, probeBridge, type BridgeStatus } from '../../lib/bridge';
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

    const startClaudeConnect = async () => {
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
    const bridgeReady = typeof bridge === 'object' && bridge !== null;
    const agentOf = (provider: string) => (bridgeReady ? (bridge.agents || []).find((agent) => agent.provider === provider) : undefined);

    /** 지금 쓰기로 고른 엔진. 안 골랐으면 연동된 것 중 클로드 우선으로 본다. */
    const activeProvider = String(keys.aiProvider || '') || (keys.claudeToken ? 'claude' : '');

    /** 제공자별 로그인 시작 — 앱이 그 PC 에서 로그인 창을 띄운다. */
    const [loginBusy, setLoginBusy] = useState('');
    const [loginNote, setLoginNote] = useState('');
    const startAgentLogin = async (provider: 'claude' | 'codex' | 'gemini' | 'grok', label: string) => {
        setLoginBusy(provider);
        setLoginNote('');
        const result = await bridgeAgentLogin(provider);
        setLoginBusy('');
        if (!result) {
            setLoginNote(`${label} 로그인을 시작하지 못했습니다 — LEWORD 앱을 켠 뒤 다시 눌러 주세요(이 로그인은 내 PC 에서만 됩니다).`);
            return;
        }
        if (result.state === 'already') setLoginNote(`${label}: 이미 로그인돼 있습니다.`);
        else if (result.state === 'done') setLoginNote(`${label}: 로그인 완료.`);
        else if (result.state === 'failed') setLoginNote(`${label} 로그인 실패: ${result.message || ''}`);
        else setLoginNote(`${label}: 브라우저가 열렸습니다 — 승인한 뒤 [상태 확인]을 눌러 주세요.`);
        await refreshAgents();
    };

    const update = (field: string, value: string) => {
        setKeys((previous) => ({ ...previous, [field]: value }));
        setSaved(false);
    };

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
                    클로드는 사이트에서 바로, 나머지 셋은 LEWORD 앱이 그 CLI 로그인을 열어 줍니다
                    (구독 로그인이 그 PC 안에서만 끝나는 방식이라 웹으로는 토큰을 뽑을 수 없습니다).
                </p>

                <div className="lw-engines-list">
                    {AGENT_CHAIN.map((item) => {
                        const agent = agentOf(item.id);
                        const hasToken = item.id === 'claude' && Boolean(String(keys.claudeToken || '').trim());
                        const linked = hasToken || Boolean(agent?.available);
                        const state = hasToken ? '✅ 연동됨(구독)'
                            : agent?.available ? '✅ 연동됨(앱 · 구독)'
                                : agent?.installed ? '앱: 로그인 필요'
                                    : item.webConnect ? '미연동' : '앱에서 연동';
                        const active = activeProvider === item.id;
                        return (
                            <div key={item.id} className={`lw-engine-row${active ? ' on' : ''}`}>
                                <div className="lw-engine-name">
                                    <b>{item.label}</b>
                                    <small>{item.sub}</small>
                                </div>
                                <span className={`lw-engine-state${linked ? ' ok' : ''}`}>{state}</span>
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
                                                    setOauthNote('클로드 연동을 해제했습니다.');
                                                }}
                                            >해제</button>
                                        ) : (
                                            <button type="button" className="lw-mini" onClick={startClaudeConnect} disabled={oauthBusy}>연동</button>
                                        )
                                    ) : (
                                        <button
                                            type="button"
                                            className="lw-mini"
                                            onClick={() => startAgentLogin(item.id, item.label)}
                                            disabled={Boolean(loginBusy)}
                                        >{loginBusy === item.id ? '여는 중…' : linked ? '다시 로그인' : '연동'}</button>
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
