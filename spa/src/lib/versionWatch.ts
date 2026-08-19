/**
 * 새 배포 자동 감지 — 캐시에 물린 옛 화면이 스스로 갈아탄다.
 *
 * 2026-08-18 실측: 카드 재편·수익 판정까지 배포됐는데 사장님 폰에는 옛
 * 화면이 그대로였다("아까랑 달라진 게 없다니까?"). 원인은 서버가 아니라
 * 모바일 브라우저가 물고 있던 index.html 캐시 — 이 사이트는 하루에도 몇
 * 번씩 배포되는데, 사용자가 강력 새로고침을 알 리 없다.
 *
 * 동작: index.html 을 no-store 로 받아 번들 해시를 지금 로드된 것과
 * 비교한다. 다르면 **탭이 다시 보이는 순간** 한 번 새로고침한다 —
 * 사용 중인 화면을 갑자기 갈아치우지 않는다. 무한 루프는 세션당 1회
 * 가드로 막는다. 어떤 실패도 화면을 건드리지 않는다(감시는 덤이다).
 */

const CHECK_INTERVAL_MS = 15 * 60_000;
const RELOADED_FLAG = 'lw-version-reloaded';

function currentBundle(): string {
    const script = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]');
    const match = script?.src.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/);
    return match?.[1] || '';
}

async function latestBundle(): Promise<string> {
    const response = await fetch('/index.html', { cache: 'no-store' });
    if (!response.ok) return '';
    const html = await response.text();
    return html.match(/assets\/(index-[A-Za-z0-9_-]+\.js)/)?.[1] || '';
}

export function startVersionWatch(): void {
    const loaded = currentBundle();
    if (!loaded) return;

    let stale = false;

    const check = async () => {
        if (stale) return;
        try {
            const latest = await latestBundle();
            if (latest && latest !== loaded) stale = true;
        } catch { /* 오프라인 등 — 다음 기회에 */ }
    };

    const reloadIfStale = () => {
        if (!stale) return;
        if (sessionStorage.getItem(RELOADED_FLAG) === loaded) return; // 루프 가드
        sessionStorage.setItem(RELOADED_FLAG, loaded);
        window.location.reload();
    };

    window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // 돌아온 순간이 갈아타기 가장 자연스러운 순간이다.
            void check().then(reloadIfStale);
        }
    });
}
