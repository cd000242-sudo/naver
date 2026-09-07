/**
 * 클로드 구독 토큰의 **정책 차단** 판정.
 *
 * 무슨 일이 있었나(2026-09-07 실측): 앤트로픽이 구독 OAuth 토큰(`sk-ant-oat01-…`)의
 * 서드파티 사용을 막았다. 이제 그 토큰은 클로드코드와 claude.ai 안에서만 쓸 수 있고,
 * 사이트 서버가 Messages API 를 직접 부르면 거절한다:
 *   "Request not allowed"
 *   "This credential is only authorized for use with Claude Code…"
 *   "OAuth authentication is currently not supported"
 *
 * 이건 **토큰이 죽은 것도, 할당량도, 플랜 문제도 아니다.** 다시 연결해도 같고
 * 플랜을 올려도 같다. 그래서 재연결을 권하면 안 되고(무한루프), 대신 **앱 경유**로
 * 넘어가야 한다 — 앱은 이 PC 의 클로드코드를 부르는 것이라 정책상 정상이다.
 *
 * 사장님 실측 2026-09-07: "앱 켜고 사용 중인데 안 되잖아" — 앱이 켜져 있어도
 * 사이트가 저장된 토큰을 먼저 쓰려다 실패하면 거기서 멈추고 앱까지 안 갔다.
 * 그래서 한 번 차단을 만나면 여기 적어 두고, 다음부터는 토큰 왕복을 건너뛴다.
 */

const BLOCKED_KEY = 'leaderspro.keyword.claudePolicyBlocked.v1';

/** 앤트로픽이 "이 자격으로는 안 된다"고 말한 것인가. 토큰 만료·할당량과는 다르다. */
export function isClaudePolicyBlocked(message?: string | null): boolean {
    const text = String(message || '');
    if (!text) return false;
    return /request not allowed/i.test(text)
        || /only authorized for use with claude code/i.test(text)
        || /oauth authentication is currently not supported/i.test(text)
        || /not supported for.*oauth/i.test(text)
        /*
         * 본문 없이 상태 코드만 온 경우 — 워커가 `클로드 응답 403` 꼴로 내려보낸다.
         * 403 은 "자격은 진짜인데 이 용도로는 안 된다"이므로 정책 차단으로 본다.
         * 401(만료·폐기)은 여기 넣지 않는다 — 그건 재연결이 답이라 처리가 다르다.
         */
        || /(?:응답|status|http)\s*403\b/i.test(text);
}

/**
 * 차단을 만났다고 적어 둔다. 저장이 막힌 브라우저면 조용히 넘어간다 —
 * 그때는 매번 한 번씩 헛걸음하지만 앱 폴백이 있어 결과는 같다.
 */
export function markClaudePolicyBlocked(): void {
    try {
        localStorage.setItem(BLOCKED_KEY, new Date().toISOString());
    } catch {
        /* 저장 못 해도 흐름은 그대로 */
    }
}

/** 이미 차단으로 확인된 적이 있는가. 있으면 사이트 토큰 경로를 건너뛴다. */
export function claudePolicyBlocked(): boolean {
    try {
        return Boolean(localStorage.getItem(BLOCKED_KEY));
    } catch {
        return false;
    }
}

/** 정책이 풀리거나 사용자가 새로 연결할 때 표식을 지운다. */
export function clearClaudePolicyBlocked(): void {
    try {
        localStorage.removeItem(BLOCKED_KEY);
    } catch {
        /* 지우지 못해도 판정만 보수적으로 남을 뿐이다 */
    }
}

/** 화면에 그대로 쓸 안내. 재연결을 권하지 않는다 — 다시 연결해도 같기 때문이다. */
export const CLAUDE_POLICY_NOTE = '앤트로픽이 구독 토큰의 외부 사용을 막았습니다 — 다시 연결해도 같습니다. LEWORD 앱을 켜 두면 앱이 이 PC 의 클로드코드로 대신 돌려 줍니다(추가 비용 없음). 앱 없이 쓰시려면 [내 API 키] 탭에서 Gemini 무료 키를 넣으세요.';

/**
 * 사이트 서버가 **지금 실제로 쓸 수 있는** 생성 자격이 있는가.
 *
 * 사장님 지시(2026-09-07): "실패가 안 되어야지". 폴백이 있어도 못 쓰는 자격을 먼저
 * 던지면 한 번은 반드시 실패한다 — 그 실패가 화면에 뜬다. 그러니 **시도 자체를
 * 하지 않는다.**
 *
 * 클로드 구독 토큰은 세지 않는다. 저장돼 있어도 앤트로픽이 서버 호출을 거절하므로
 * "있는 자격"이 아니다. Gemini·OpenAI·xAI 키는 각사 API 키라 서버가 그대로 쓴다.
 */
export function siteCanGenerate(keys: Record<string, unknown> | null | undefined): boolean {
    const k = keys || {};
    const has = (name: string) => String(k[name] || '').trim().length > 0;
    return has('geminiKey') || has('openaiKey') || has('xaiKey');
}
