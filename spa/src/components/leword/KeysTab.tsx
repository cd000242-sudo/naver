import { useEffect, useState } from 'react';
import { exchangeClaudeOauth } from '../../lib/keywordApi';
import { probeBridge, type BridgeStatus } from '../../lib/bridge';
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
    const [bridge, setBridge] = useState<BridgeStatus | null>(null);
    const [connecting, setConnecting] = useState(false);

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
            + `&scope=${encodeURIComponent('user:profile user:inference')}`
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
    useEffect(() => { probeBridge().then(setBridge); }, []);
    const claudeAgent = bridge?.agents?.find((agent) => agent.provider === 'claude');
    const connected = Boolean(bridge?.connected && claudeAgent?.available);

    /*
     * [연동하기]는 단순 재조회가 아니다 — 크롬 신형은 https 페이지가 127.0.0.1
     * (내 PC 의 LEWORD 앱)에 접속할 때 사용자 클릭에서 시작된 요청에만 권한
     * 팝업을 띄운다. 그래서 버튼 한 번이 권한 허용 + 접속 확인을 겸한다.
     * 앱이 브리지를 여는 데 시간이 걸릴 수 있어 몇 초에 걸쳐 재시도한다.
     */
    const connectBridge = async () => {
        setConnecting(true);
        setBridge(null);
        let status: BridgeStatus | null = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            status = await probeBridge();
            if (status?.connected) break;
            await new Promise((resolve) => { setTimeout(resolve, 2000); });
        }
        setBridge(status);
        setConnecting(false);
    };

    const update = (field: string, value: string) => {
        setKeys((previous) => ({ ...previous, [field]: value }));
        setSaved(false);
    };

    const problems = checkKeyShape(keys);

    const persist = () => {
        // 형식이 이상하면 저장하지 않는다. 자동완성으로 들어온 로그인 정보를
        // 그대로 저장하면 다음 조회에서 그게 서버로 간다.
        if (problems.length > 0) return;
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
              * AI 추론 — 연동은 하나다(사장님 지적 2026-08-20 "추론은 따로
              * 연동해야 되냐"): 위 '클로드코드 토큰'이 있으면 추론·답변 모두
              * 앱 없이 그 토큰으로 돈다. 이 패널의 앱 브리지는 토큰이 없는
              * 사용자용 대안일 뿐이다.
              */}
            <section className="lw-panel" aria-label="AI 추론 (클로드코드)">
                <div className="lw-panel-head">
                    <h2>AI 추론 (클로드코드)</h2>
                    <span className={(Boolean(keys.claudeToken) || connected) ? 'lw-key-on' : ''}>
                        {keys.claudeToken ? '✅ 토큰 연동됨 — 추론·답변 모두 앱 없이 (구독)'
                            : connecting || bridge === null ? '연결 확인 중…'
                                : connected ? '✅ 앱 연동됨 — 구독으로 무료 추론'
                                    : !bridge.connected ? '아직 연동 전'
                                        : claudeAgent?.installed ? '클로드코드 로그인 필요'
                                            : '클로드코드 설치 필요'}
                    </span>
                    {!connected && !keys.claudeToken && <a className="lw-key-issue" href="/download">앱 받기 →</a>}
                </div>
                <p className="lw-card-note" style={{ marginBottom: 12 }}>
                    <strong>버튼 한 번</strong>이면 됩니다: 클로드 로그인 확인 → 승인 → 화면에 뜨는 코드
                    한 줄 붙여넣기. 그러면 마인드맵 추론·지식인 답변이 전부 <strong>내 구독</strong>(추가
                    비용 0)으로, 앱 없이 돕니다. 만료는 자동 갱신됩니다.
                </p>

                {!keys.claudeToken && (
                    <div className="lw-claude-connect">
                        <button type="button" className="lw-mini" onClick={startClaudeConnect} disabled={oauthBusy}>
                            🔗 클로드 구독 연결 (버튼 한 번)
                        </button>
                        {oauth && (
                            <div className="lw-claude-code">
                                <input
                                    type="text"
                                    value={oauthCode}
                                    onChange={(event) => setOauthCode(event.target.value)}
                                    placeholder="승인 후 화면에 뜬 코드를 여기에 붙여넣기"
                                    aria-label="클로드 승인 코드"
                                />
                                <button type="button" className="lw-mini" onClick={finishClaudeConnect} disabled={oauthBusy || !oauthCode.trim()}>
                                    {oauthBusy ? '연결 중…' : '연결 완료'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
                {oauthNote && <p className="lw-card-note" style={{ marginBottom: 10 }}>{oauthNote}</p>}
                {connected ? (
                    <button type="button" className="lw-mini lw-mini-ghost" onClick={connectBridge} disabled={connecting}>연동 상태 다시 확인</button>
                ) : (
                    <>
                        <button type="button" className="lw-mini" onClick={connectBridge} disabled={connecting}>
                            {connecting ? '연동 중…' : '🔗 연동하기'}
                        </button>
                        {bridge !== null && !bridge.connected && !connecting && (
                            <p className="lw-card-note" style={{ marginTop: 10 }}>
                                연결이 안 되면: LEWORD 앱이 이 PC 에서 실행 중인지 확인한 뒤 다시 [연동하기]를 누르세요.
                                브라우저가 "기기 연결 허용" 팝업을 띄우면 <strong>허용</strong>을 눌러야 연결됩니다.
                            </p>
                        )}
                    </>
                )}
            </section>

            {KEY_GROUPS.map((group) => {
                const ready = isGroupReady(group, keys);
                return (
                    <section key={group.id} className="lw-panel" aria-label={group.label}>
                        <div className="lw-panel-head">
                            <h2>{group.label}</h2>
                            <span className={ready ? 'lw-key-on' : ''}>{ready ? '● 사용 중' : '미입력 — 사장님 키로 조회'}</span>
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
