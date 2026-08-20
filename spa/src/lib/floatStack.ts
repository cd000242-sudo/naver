/**
 * 우하단 떠 있는 것들의 접힘 상태 — 문의 버튼과 음악 플레이어가 같이 쓴다.
 *
 * 예전엔 FloatStack 만 접혔다. 음악 버튼은 별도 컴포넌트라 혼자 남아 있었다
 * (사장님 지적 2026-08-20 "음악 재생 버튼은 같이 안 접히네?").
 * 접힘은 "우하단을 치워 달라"는 뜻이지 "문의 버튼만 치워 달라"가 아니다.
 *
 * 기본은 펼침이고, 상태는 이 브라우저에 남는다 — 페이지를 옮길 때마다 다시
 * 펴지면 접은 의미가 없다.
 */
const OPEN_KEY = 'leaderspro.floatStack.open.v1';

export function loadFloatOpen(): boolean {
    try {
        return localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
        return true;
    }
}

export function saveFloatOpen(open: boolean): void {
    try {
        localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
        // 저장이 안 돼도 이번 화면은 동작해야 한다.
    }
}
