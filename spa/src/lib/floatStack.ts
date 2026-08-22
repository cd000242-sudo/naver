/**
 * 우하단 떠 있는 것들의 접힘 상태 — 문의 버튼과 음악 플레이어가 같이 쓴다.
 *
 * 예전엔 FloatStack 만 접혔다. 음악 버튼은 별도 컴포넌트라 혼자 남아 있었다
 * (사장님 지적 2026-08-20 "음악 재생 버튼은 같이 안 접히네?").
 * 접힘은 "우하단을 치워 달라"는 뜻이지 "문의 버튼만 치워 달라"가 아니다.
 *
 * 상태는 이 브라우저에 남는다 — 페이지를 옮길 때마다 다시 펴지면 접은 의미가 없다.
 *
 * 기본을 **접힘**으로 바꿨다(사장님 확정 2026-08-22). 펼침이 기본이던 동안
 * 이 스택이 화면 우측에 붙어 내용을 덮었고, 실제로 [연동] 버튼의 클릭까지
 * 먹고 있었다(실측: 제미나이·그록은 두 버튼 다, 코덱스는 [사용]이 안 눌렸다).
 * 버튼이 보이는데 눌러도 아무 일이 없으니 "연동이 안 된다"로만 보인다.
 * 필요한 사람은 펴는 버튼 한 번이면 되고, 편 상태는 그대로 기억된다.
 *
 * 키를 v2 로 올린다 — v1 에 '1'(펼침)이 남아 있으면 기본값을 바꿔도
 * 기존 방문자에겐 그대로 펼쳐진다.
 */
const OPEN_KEY = 'leaderspro.floatStack.open.v2';

export function loadFloatOpen(): boolean {
    try {
        return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
        return false;
    }
}

export function saveFloatOpen(open: boolean): void {
    try {
        localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
        // 저장이 안 돼도 이번 화면은 동작해야 한다.
    }
}
