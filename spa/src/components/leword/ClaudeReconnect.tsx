import { useEffect, useState } from 'react';
import { exchangeClaudeOauth } from '../../lib/keywordApi';
import { loadUserKeys, saveUserKeys } from '../../lib/userKeys';

/**
 * 클로드 재연동 창 — 토큰이 죽는 순간 어디서든 뜬다.
 *
 * 사장님 요구(2026-08-20): "만료되면 알아서 로그인창 띄우고, 로그인하고 나면
 * 알아서 인식해서 바로 작동되게." 서버가 토큰 사망(claudeTokenDead)을 알리면
 * keywordApi 가 이벤트를 쏘고, 이 창이 그 자리에서 열린다 — 내 API 키 탭을
 * 찾아갈 필요가 없다.
 *
 * 완전 무클릭은 불가능하다: 승인 창은 브라우저 팝업 정책상 **사람의 클릭**으로만
 * 열 수 있고, 승인 코드는 Anthropic 이 자기 페이지에 표시한다(redirect 주소가
 * Claude Code 고정이라 우리 도메인으로 못 받는다). 그래서 최소 동선으로 줄였다:
 * [승인 창 열기] 한 번 → 코드 붙여넣기 → 끝. 저장되면 하던 버튼만 다시 누르면 된다.
 */

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function ClaudeReconnect() {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [verifier, setVerifier] = useState('');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');
    const [done, setDone] = useState(false);

    useEffect(() => {
        const onDead = (event: Event) => {
            const detail = (event as CustomEvent<{ message?: string }>).detail;
            setReason(detail?.message || '');
            setDone(false);
            setCode('');
            setNote('');
            setOpen(true);
        };
        window.addEventListener('leword:claude-dead', onDead);
        return () => window.removeEventListener('leword:claude-dead', onDead);
    }, []);

    if (!open) return null;

    const startConsent = async () => {
        const raw = new Uint8Array(32);
        crypto.getRandomValues(raw);
        const nextVerifier = base64url(raw);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nextVerifier)));
        const stateRaw = new Uint8Array(24);
        crypto.getRandomValues(stateRaw);
        setVerifier(nextVerifier);
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

    const finish = async () => {
        if (!verifier || !code.trim() || busy) return;
        setBusy(true);
        setNote('');
        const result = await exchangeClaudeOauth(code.trim(), verifier);
        setBusy(false);
        if (!result.ok || !result.data?.accessToken) {
            setNote(`연결 실패: ${result.message || result.error || '코드를 다시 확인해 주세요'}`);
            return;
        }
        saveUserKeys({
            ...loadUserKeys(),
            claudeToken: result.data.accessToken,
            claudeRefresh: result.data.refreshToken || '',
            claudeExpiresAt: String(result.data.expiresAt || ''),
        });
        setDone(true);
    };

    return (
        <div className="lw-reconnect-back" role="dialog" aria-modal="true" aria-label="클로드 다시 연동">
            <div className="lw-reconnect">
                {done ? (
                    <>
                        <h3>✅ 다시 연결됐습니다</h3>
                        <p>방금 누르셨던 버튼을 한 번 더 누르면 그대로 이어집니다. 이제 만료는 자동 갱신됩니다.</p>
                        <button type="button" className="lw-reconnect-cta" onClick={() => setOpen(false)}>닫기</button>
                    </>
                ) : (
                    <>
                        <h3>클로드 연동이 풀렸습니다</h3>
                        <p>
                            토큰이 취소되거나 만료됐습니다. 두 단계면 다시 붙습니다 — 계정 로그인이 돼 있으면 30초 거리입니다.
                            {reason && <em className="lw-reconnect-why">서버 응답: {reason.slice(0, 90)}</em>}
                        </p>
                        <ol>
                            <li>
                                <button type="button" className="lw-reconnect-cta" onClick={startConsent}>
                                    1. 승인 창 열기
                                </button>
                            </li>
                            <li>
                                <span>2. 승인 후 나오는 코드를 붙여넣기</span>
                                <input
                                    value={code}
                                    onChange={(event) => setCode(event.target.value)}
                                    placeholder="승인 화면의 코드"
                                    autoComplete="off"
                                    spellCheck={false}
                                />
                            </li>
                        </ol>
                        {note && <p className="lw-reconnect-err">{note}</p>}
                        <div className="lw-reconnect-row">
                            <button type="button" className="lw-reconnect-cta" onClick={finish} disabled={busy || !verifier || !code.trim()}>
                                {busy ? '연결 중…' : '연결하기'}
                            </button>
                            <button type="button" className="lw-reconnect-ghost" onClick={() => setOpen(false)}>나중에</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default ClaudeReconnect;
