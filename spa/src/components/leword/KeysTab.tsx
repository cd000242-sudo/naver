import { useCallback, useEffect, useState } from 'react';
import {
    BRIDGE_OFFLINE_NOTE,
    BRIDGE_OUTDATED_NOTE,
    bridgeAgentLogin,
    bridgeAgentUsage,
    bridgeApiKeys,
    probeBridge,
    type BridgeAgentUsage,
    type BridgeStatus,
} from '../../lib/bridge';
import { enableKeySync, keySyncInfo, pullUserKeys, pushUserKeysDetailed } from '../../lib/keySync';
import { loadSession, login } from '../../lib/lewordAuth';
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
 * 사용량은 이 PC 의 LEWORD 앱이 센 호출 수다(사장님 결정 2026-09-16) — 서비스 공식 한도(%)가 아니다.
 * 줄 이름은 엔진 목록의 긴 이름 대신 짧게 쓴다.
 */
const USAGE_LABEL: Record<string, string> = { claude: '클로드', codex: '코덱스', gemini: '제미나이', grok: '그록' };
/** 5시간 창이 새로 시작할 때까지 — 앱이 준 시각에서 지금을 뺀 산술이다. 지났거나 없으면 적지 않는다. */
const resetInText = (iso: string | null) => {
    if (!iso) return '';
    const at = new Date(iso).getTime();
    if (Number.isNaN(at)) return '';
    const minutes = Math.ceil((at - Date.now()) / 60000);
    if (minutes <= 0) return '';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    const left = hours > 0 ? `${hours}시간${rest > 0 ? ` ${rest}분` : ''}` : `${rest}분`;
    return `5시간 창 새로 시작까지 ${left}`;
};

/**
 * 앱 폴백 체인 — 앱 브리지의 kinAnswer 체인 순서(claude→codex→gemini→grok)와
 * 같아야 한다. 화면 순서가 실제 실행 순서와 갈라지면 안내가 거짓말이 된다.
 */
/**
 * 엔진 목록 — 전부 **구독**으로 쓴다. API 키 칸은 없앴다(사장님 확정
 * 2026-08-20 "API 는 비용이 추가된다니까").
 *
 * 네 엔진 모두 이 PC 의 LEWORD 앱이 로그인을 띄우고 그 구독으로 실행한다(사장님 결정
 * 2026-09-16 "브리지 전용으로 정리"). 사이트는 구독 토큰을 받지도 발급받지도 않는다 —
 * 비용은 구독 그대로, 추가 과금 0 이다.
 */
const AGENT_CHAIN = [
    {
        id: 'claude', label: '클로드코드',
        sub: '앱에서 [연동] → 클로드 로그인 → 그 구독으로 실행(추가 비용 0)',
    },
    {
        id: 'codex', label: '코덱스 · 챗지피티 구독',
        sub: '앱에서 [연동] → 챗지피티 로그인 → 그 구독으로 실행(추가 비용 0)',
    },
    {
        id: 'gemini', label: '제미나이 CLI · 구글 구독',
        sub: '앱에서 [연동] → 구글 로그인 → 그 구독으로 실행(추가 비용 0)',
    },
    {
        id: 'grok', label: '그록 · xAI 구독',
        sub: '앱에서 [연동] → xAI 로그인 → 그 구독으로 실행(추가 비용 0)',
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

    /* 계정 동기화 · 앱 키 가져오기 */
    const [syncInfo, setSyncInfo] = useState(() => keySyncInfo());
    const [syncPassword, setSyncPassword] = useState('');
    const [syncBusy, setSyncBusy] = useState(false);
    const [syncNote, setSyncNote] = useState('');
    const enableSync = async () => {
        const session = loadSession();
        if (!session) { setSyncNote('먼저 로그인해 주세요.'); return; }
        setSyncBusy(true);
        try {
            /*
             * 임의 문자열은 받지 않는다(사장님 2026-09-10 "비밀번호도 그대로 써야 맞지 않겠니, 악용하면 어쩌려고").
             * 서버 로그인으로 비밀번호가 맞는지 먼저 확인하고, 맞을 때만 그 비밀번호로 동기화 키를 만든다.
             */
            const verified = await login(session.userId, syncPassword);
            if (!verified.ok) { setSyncNote('로그인 비밀번호가 아닙니다 — 이 계정의 로그인 비밀번호를 넣어 주세요.'); return; }
            const outcome = await enableKeySync(session.userId, syncPassword);
            setSyncPassword('');
            setSyncRekey(false);
            setSyncInfo(keySyncInfo());
            setKeys(loadUserKeys());
            setSyncNote(outcome === 'pulled' ? '✅ 동기화 켜짐 — 다른 기기의 키를 가져와 채웠습니다.'
                : outcome === 'pushed' ? '✅ 동기화 켜짐 — 이 브라우저의 키를 올렸습니다. 다른 기기는 로그인하면(또는 [다른 기기 키 가져오기]) 내려옵니다.'
                    : outcome === 'wrong-password' ? '동기화는 켰지만 다른 기기가 올린 키를 이 비밀번호로 풀지 못했습니다 — 두 기기에서 같은 비밀번호로 켜야 합니다.'
                        : outcome === 'nothing' ? '✅ 동기화 켜짐 — 아직 다른 기기에서 올린 키가 없고 이 기기에도 키가 없습니다. 키가 있는 기기에서 먼저 켜 주세요.'
                            : '이 브라우저는 동기화를 지원하지 않습니다(WebCrypto 없음).');
        } finally { setSyncBusy(false); }
    };
    const pullNow = async () => {
        setSyncBusy(true);
        try {
            // 최대 1분까지 3초마다 다시 본다 — 화면에 경과를 보여 주고, 오면 바로 끝난다.
            setSyncNote('다른 기기가 올린 키를 받는 중…');
            const r = await pullUserKeys({ waitMs: 60_000, onWait: (ms) => setSyncNote(`다른 기기가 올린 키를 받는 중… ${Math.round(ms / 1000)}초 (서버 반영을 기다리는 중, 최대 1분)`) });
            setKeys(loadUserKeys());
            const when = r.savedAt ? new Date(r.savedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            setSyncNote(r.status === 'merged' ? `✅ 가져왔습니다 — 빈 칸 ${r.filled}개를 채웠습니다${when ? ` (다른 기기 업로드 ${when})` : ''}.`
                : r.status === 'wrong-password' ? `다른 기기가 올린 키는 있는데(${when}) 이 기기의 동기화 비밀번호가 달라 풀지 못했습니다. 로그아웃 후 다시 로그인하거나, 두 기기에서 같은 비밀번호로 [동기화 켜기]를 다시 하세요.`
                    : r.status === 'none' ? '다른 기기에서 올린 키가 아직 없습니다. 키가 들어 있는 기기(PC)의 내 API 키에서 [동기화 켜기] 또는 [지금 올리기]를 누른 뒤, 1분쯤 지나 다시 눌러 주세요.'
                        : '가져오지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
        } finally { setSyncBusy(false); }
    };
    const pushNow = async () => {
        setSyncBusy(true);
        try {
            const r = await pushUserKeysDetailed();
            setSyncNote(!r.ok ? '올리지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
                : r.count === 0 ? '이 브라우저에 저장된 키가 없어 올릴 게 없습니다 — 아래 칸에 키를 넣고 저장부터 해 주세요.'
                    : `✅ 키 ${r.count}개를 올렸습니다 (동기화 ID ${r.slotId}) — 다른 기기의 동기화 ID 가 같아야 내려옵니다.`);
        } finally { setSyncBusy(false); }
    };
    /* 켜져 있어도 비밀번호를 다시 넣어 주소를 다시 맞춘다 — 두 기기의 동기화 ID 가 다를 때의 해법. */
    const [syncRekey, setSyncRekey] = useState(false);
    const importFromApp = async () => {
        setSyncBusy(true);
        try {
            const r = await bridgeApiKeys();
            if (r.status !== 'ok') { setSyncNote(r.status === 'outdated' ? BRIDGE_OUTDATED_NOTE : '이 PC 에서 LEWORD 앱을 켠 뒤 다시 눌러 주세요 — 키는 같은 PC 의 앱에서만 가져옵니다.'); return; }
            const next: UserKeys = { ...keys };
            let added = 0;
            for (const [field, value] of Object.entries(r.keys)) {
                if (!next[field as keyof UserKeys] && value) { next[field as keyof UserKeys] = value; added += 1; }
            }
            setKeys(next);
            saveUserKeys(next); // 저장 이벤트 → 동기화가 켜져 있으면 다른 기기로도 간다
            setSyncNote(added > 0 ? `✅ 앱에서 키 ${added}개를 가져와 저장했습니다${syncInfo.enabled ? ' — 다른 기기로도 올라갑니다' : ''}.` : '앱의 키가 이미 전부 들어 있습니다.');
        } finally { setSyncBusy(false); }
    };
    const refreshAgents = async () => {
        setBridge('probing');
        let status: BridgeStatus | null = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
            status = await probeBridge();
            if (status?.connected) break;
            await new Promise((resolve) => { setTimeout(resolve, 2000); });
        }
        setBridge(status);
        // 사용량도 같은 버튼으로 다시 센다 — 앱을 막 켰으면 이제야 셀 수 있다.
        void loadUsage();
    };
    /*
     * "앱이 켜져 있나"는 connected 로 판단한다.
     * probeBridge 는 **실패해도** { connected: false } 객체를 돌려주므로
     * 객체가 있는지만 보면 앱이 꺼져 있어도 항상 참이 된다(잠복 결함).
     * 순서 안내가 이 값으로 "✅ 앱이 켜져 있습니다"를 찍기 시작하면서 드러났다.
     */
    const bridgeReady = typeof bridge === 'object' && bridge !== null && bridge.connected === true;
    const agentOf = (provider: string) => (bridgeReady ? (bridge.agents || []).find((agent) => agent.provider === provider) : undefined);

    /** 지금 쓰기로 고른 엔진. 안 골랐으면 비어 있고, 앱이 연동된 순서대로 고른다. */
    const activeProvider = String(keys.aiProvider || '');

    /*
     * 순서 안내가 "지금 어디까지 했는지"를 짚으려면 두 가지 사실이 필요하다.
     * 전부 실측이다 — 앱이 실제로 응답했는지, 그 엔진이 실제로 쓸 수 있는지.
     */
    const readyAgentLabels = AGENT_CHAIN
        .filter((item) => agentOf(item.id)?.available)
        .map((item) => item.label);
    const anyAgentReady = readyAgentLabels.length > 0;
    const claudeAgentReady = Boolean(agentOf('claude')?.available);

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
        const called = await bridgeAgentLogin(provider, switchAccount);
        setLoginBusy('');
        if (called.status !== 'ok') {
            // 이 로그인은 내 PC 의 앱만 띄울 수 있다 — 꺼짐·구버전을 가려서 말한다.
            setLoginNote(called.status === 'offline'
                ? `${label} 로그인을 시작하지 못했습니다 — 이 PC 에서 LEWORD 앱을 켠 뒤 다시 눌러 주세요(이 로그인은 내 PC 에서만 됩니다).`
                : called.status === 'outdated'
                    ? BRIDGE_OUTDATED_NOTE
                    : `${label} 로그인을 시작하지 못했습니다: ${called.message}`);
            return;
        }
        const result = called.result;
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
     * 엔진 사용량 — 이 PC 의 LEWORD 앱이 센 호출 수(사장님 결정 2026-09-16 "앱이 센 사용량으로 교체").
     * 서비스 공식 한도(%)가 아니다. 사이트는 구독 토큰이 없어 한도를 물을 수 없고, 사실로 있는 것은
     * 앱이 엔진을 부른 횟수뿐이다. 앱이 꺼져 있으면 세지 못했다고 그대로 말한다.
     */
    const [usage, setUsage] = useState<{
        state: 'idle' | 'loading' | 'done' | 'offline' | 'outdated' | 'error';
        rows?: BridgeAgentUsage[];
        at?: Date;
        message?: string;
    }>({ state: 'idle' });
    const loadUsage = useCallback(async () => {
        setUsage({ state: 'loading' });
        const called = await bridgeAgentUsage();
        if (called.status === 'ok') setUsage({ state: 'done', rows: called.result.usage, at: new Date() });
        else if (called.status === 'error') setUsage({ state: 'error', message: called.message });
        else setUsage({ state: called.status });
    }, []);
    useEffect(() => { void loadUsage(); }, [loadUsage]);

    const problems = checkKeyShape(keys);

    const persist = async () => {
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
                시트·로그·설정 어디에도 저장하지 않습니다. 다른 기기에는 아래 <strong>계정 동기화</strong>로 옮깁니다.
            </div>

            {/*
              * 계정 동기화 + 앱 키 가져오기 (사장님 2026-09-09 "모바일로 들어가면 PC 에서 넣은 키를 못 불러오네",
              * "앱에서든 사이트에서든 하나처럼"). 로그인 비밀번호로 잠근 암호문만 서버에 두고, 앱 키는 같은 기기 앱에서 받는다.
              */}
            <section className="lw-panel" aria-label="계정 동기화">
                <div className="lw-panel-head">
                    <h2>계정 동기화 · 앱 키 가져오기</h2>
                    <span>{syncInfo.enabled ? `켜짐 — ${syncInfo.userId} 계정 · 동기화 ID ${syncInfo.slotId} · 두 기기의 ID 가 같아야 서로 받습니다` : '꺼짐 — 로그인 비밀번호를 넣어 켜세요(로그인할 때는 자동으로 켜집니다). 키를 넣은 기기(보통 PC)에서 먼저'}</span>
                </div>
                <div className="lw-keys-sync">
                    {(!syncInfo.enabled || syncRekey) && (
                        <form className="lw-keys-sync-form" onSubmit={(e) => { e.preventDefault(); void enableSync(); }}>
                            <input
                                type="password"
                                autoComplete="current-password"
                                placeholder="이 계정의 로그인 비밀번호 (서버에서 확인한 뒤 동기화 키를 만듭니다 · 저장하지 않습니다)"
                                value={syncPassword}
                                onChange={(e) => setSyncPassword(e.target.value)}
                            />
                            <button type="submit" className="lw-mini" disabled={syncBusy || !syncPassword}>{syncInfo.enabled ? '이 비밀번호로 다시 맞추기' : '동기화 켜기'}</button>
                        </form>
                    )}
                    <div className="lw-keys-sync-actions">
                        {syncInfo.enabled && <button type="button" className="lw-mini" disabled={syncBusy} onClick={() => void pullNow()}>다른 기기 키 가져오기</button>}
                        {syncInfo.enabled && <button type="button" className="lw-mini" disabled={syncBusy} onClick={() => void pushNow()}>지금 올리기</button>}
                        {syncInfo.enabled && !syncRekey && <button type="button" className="lw-mini" disabled={syncBusy} onClick={() => setSyncRekey(true)}>비밀번호 다시 넣기</button>}
                        {/* 앱 브리지는 같은 PC 에서만 된다 — 폰에는 이 버튼이 없어야 한다(사장님 2026-09-09 "폰에 앱이 깔려야 된다는 말을 하는데"). */}
                        {bridgeReady && <button type="button" className="lw-mini" disabled={syncBusy} onClick={() => void importFromApp()}>이 PC 의 LEWORD 앱에서 키 가져오기</button>}
                    </div>
                    {syncNote && <p className="lw-note lw-note-plain" role="status">{syncNote}</p>}
                </div>
            </section>

            {/*
              * AI 연동 — 앱 브리지 전용(사장님 결정 2026-09-16 "브리지 전용으로 정리").
              * 사이트는 구독 토큰을 받지도 발급받지도 않는다. 엔진 로그인은 이 PC 의 앱이 띄우고,
              * 사이트의 AI 는 전부 그 앱을 거쳐 내 구독으로 돈다.
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
                                    앱이 CLI 설치·로그인을 대신 해 주고, 생성도 이 PC 의 구독으로 대신 돌려 줍니다.{' '}
                                    <a className="lw-step-cta" href="/download">⬇ LEWORD 받기</a>
                                    <em>사이트의 AI(답변·글감·마인드맵·글 진단·레이더)는 앱을 거쳐서만 돕니다 — 앱이 꺼져 있으면 AI 부분만 멈추고, 검색량·문서수 같은 실측은 그대로 됩니다.</em>
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
                    {/*
                      * 3번 단계는 뺐다(2026-09-07). "앱이 들고 있는 클로드 자격을 사이트로
                      * 넘긴다"가 앤트로픽 정책으로 더는 성립하지 않는다 — 넘겨도 사이트
                      * 서버가 쓰면 거절당한다. 남겨 두면 사장님이 그 단계를 계속 밟게 된다.
                      */}
                    <li className={activeProvider ? 'done' : ''}>
                        <b>쓸 엔진에서 [사용].</b>{' '}
                        {activeProvider
                            ? <span className="lw-step-ok">✅ {AGENT_CHAIN.find((item) => item.id === activeProvider)?.label} 사용 중</span>
                            : '고른 엔진 하나로만 돕니다. 몰래 다른 엔진으로 갈아타지 않습니다.'}
                    </li>
                </ol>
                <p className="lw-card-note" style={{ marginBottom: 12 }}>
                    <b>AI 는 앱을 통해서만 씁니다.</b> 사이트는 구독 토큰을 받지도 보관하지도 않습니다 —
                    클로드·코덱스·제미나이·그록 모두 <b>앱을 켜 두면</b> 앱이 이 PC 의 구독으로 대신 돌려 줍니다(추가 비용 없음).
                    앱이 꺼져 있으면 AI 부분만 멈추고 그 자리에서 알려 드립니다.
                </p>

                <div className="lw-engines-list">
                    {AGENT_CHAIN.map((item) => {
                        const agent = agentOf(item.id);
                        const linked = Boolean(agent?.available);
                        /*
                         * 상태는 앱이 실제로 확인한 값 그대로다(사장님 결정 2026-09-16 "브리지 전용").
                         * 사이트가 들고 있는 구독 자격이 없으니 "사이트에서 된다"는 상태도 없다 — 네 엔진 모두
                         * 앱에 로그인돼 있고 앱이 켜져 있어야 돈다.
                         */
                        const state = agent?.available
                            ? '✅ 앱에 연동 — 앱을 켜 두면 됩니다'
                            : agent?.installed ? '앱: 로그인 필요' : '앱에서 연동';
                        const active = activeProvider === item.id;
                        return (
                            <div key={item.id} className={`lw-engine-row${active ? ' on' : ''}`}>
                                <div className="lw-engine-name">
                                    <b>{item.label}</b>
                                    <small>{item.sub}</small>
                                </div>
                                <span className={`lw-engine-state${linked ? ' ok' : ''}`}>{state}</span>
                                <div className="lw-engine-actions">
                                    <button
                                        type="button"
                                        className="lw-mini"
                                        onClick={() => startAgentLogin(item.id, item.label, linked)}
                                        disabled={Boolean(loginBusy)}
                                    >{loginBusy === item.id ? '여는 중…' : linked ? '계정 바꾸기' : '연동'}</button>
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
                                  * 플랜 줄 — 구독 등급은 사실이 있는 엔진만 적는다(지금은 코덱스뿐). 사용량은 아래
                                  * '앱이 센 사용량' 칸이 엔진별로 모아 보여 준다(사장님 결정 2026-09-16).
                                  */}
                                {linked && (
                                    <p className="lw-engine-usage">
                                        {agent?.plan ? <b>{agent.plan.toUpperCase()} 구독</b> : '구독 확인됨'}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/*
                  * 앱이 센 사용량(사장님 결정 2026-09-16 "클로드 사용량 칸을 앱이 센 사용량으로 교체").
                  * 예전 칸은 사이트가 들고 있던 클로드 토큰으로 서비스 한도(5시간·7일 %)를 물었다.
                  * 이제 사이트에는 토큰이 없다 — 사실로 있는 것은 이 PC 의 앱이 엔진을 부른 횟수뿐이라
                  * 그것만 적는다. 한도 대비 %·남은 양 같은 추정은 만들지 않는다.
                  */}
                <div className="lw-usage">
                    <div className="lw-usage-head">
                        <span className="lw-usage-plan">
                            {usage.state === 'loading' ? <span className="lw-usage-spin" aria-label="세는 중" /> : null}
                            앱이 센 사용량
                        </span>
                        {usage.state === 'done' && usage.at && (
                            <span className="lw-usage-who">
                                {usage.at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })} 기준
                            </span>
                        )}
                        <button type="button" onClick={() => { void loadUsage(); }} disabled={usage.state === 'loading'}>
                            {usage.state === 'loading' ? '세는 중…' : '다시 세기'}
                        </button>
                    </div>
                    {usage.state === 'offline' && <p className="lw-usage-err">{BRIDGE_OFFLINE_NOTE}</p>}
                    {usage.state === 'outdated' && <p className="lw-usage-err">{BRIDGE_OUTDATED_NOTE}</p>}
                    {usage.state === 'error' && <p className="lw-usage-err">사용량을 세지 못했습니다: {usage.message}</p>}
                    {usage.state === 'done' && (usage.rows || []).map((row) => (
                        <div className="lw-usage-row" key={row.provider}>
                            <span className="lw-usage-label">{USAGE_LABEL[row.provider] || row.provider}</span>
                            <span style={{ flex: 1, minWidth: 0, color: 'rgba(235,242,250,.82)' }}>
                                최근 5시간 <b>{row.window5h}회</b> · 24시간 <b>{row.day}회</b> (5시간 중 실패 {row.failed5h}회)
                            </span>
                            <span className="lw-usage-reset">{resetInText(row.resetAt)}</span>
                        </div>
                    ))}
                    <p className="lw-usage-foot">
                        서비스 공식 한도가 아니라 <b>이 PC 의 LEWORD 앱이 센 호출 수</b>입니다 — 다른 기기나 앱 밖에서 쓴 양은 들어 있지 않습니다.
                    </p>
                </div>

                <div className="lw-agents-head" style={{ marginTop: 12 }}>
                    <b>엔진 상태와 사용량은 앱이 실제로 확인하고 센 값입니다</b>
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
