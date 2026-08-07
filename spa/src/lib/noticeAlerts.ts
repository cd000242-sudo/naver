import type { HomeNotice } from './siteOps';

/**
 * 공지 "새 글" 감지와 모달 노출 억제 규칙.
 *
 * - 읽음 판정은 공지 id + 날짜로 만든 서명을 localStorage 에 쌓아 비교한다.
 *   (제목만 고치는 수정 공지는 새 글로 안 치고, 날짜가 바뀌면 새 글로 친다.)
 * - "오늘은 띄우지 않기"는 KST 당일 23:59:59 까지만 유효하다. 브라우저 시간대가
 *   달라도 한국 기준 자정에 풀리도록 UTC 로 환산해 저장한다.
 */

const SEEN_KEY = 'leaderspro:home-notice:seen-v1';
const SUPPRESS_KEY = 'leaderspro:home-notice:suppress-until-v1';
const SEEN_MAX = 60;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function safeLocalStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

/** 공지 한 건의 식별 서명. 같은 공지의 재노출을 막는 키가 된다. */
export function noticeSignature(notice: HomeNotice): string {
    const id = String(notice.id || '').trim();
    const date = String(notice.date || '').trim();
    const title = String(notice.title || '').trim().slice(0, 40);
    return `${id || title}|${date}`;
}

export function readSeenSignatures(): Set<string> {
    const store = safeLocalStorage();
    if (!store) return new Set();
    try {
        const raw = store.getItem(SEEN_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed.map((v) => String(v)) : []);
    } catch {
        return new Set();
    }
}

/** 안 읽은 공지만 추린다. 최신순 입력을 그대로 유지한다. */
export function unseenNotices(notices: readonly HomeNotice[]): HomeNotice[] {
    if (!Array.isArray(notices) || notices.length === 0) return [];
    const seen = readSeenSignatures();
    return notices.filter((notice) => notice && !seen.has(noticeSignature(notice)));
}

export function unseenCount(notices: readonly HomeNotice[]): number {
    return unseenNotices(notices).length;
}

/** 읽음 처리. 오래된 서명은 잘라내 localStorage 가 무한히 커지지 않게 한다. */
export function markNoticesSeen(notices: readonly HomeNotice[]): void {
    const store = safeLocalStorage();
    if (!store || !Array.isArray(notices) || notices.length === 0) return;
    const seen = readSeenSignatures();
    for (const notice of notices) {
        if (notice) seen.add(noticeSignature(notice));
    }
    try {
        store.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_MAX)));
    } catch {
        // 저장 실패는 배지 표기만 영향을 준다. 화면을 막지 않는다.
    }
}

/** KST 기준 당일 23:59:59 를 UTC 밀리초로 환산한다. */
export function kstEndOfDayMs(now: Date = new Date()): number {
    const kstNow = now.getTime() + KST_OFFSET_MS;
    const kstMidnight = Math.floor(kstNow / DAY_MS) * DAY_MS;
    return kstMidnight + DAY_MS - 1000 - KST_OFFSET_MS;
}

export function suppressNoticeModalToday(now: Date = new Date()): void {
    const store = safeLocalStorage();
    if (!store) return;
    try {
        store.setItem(SUPPRESS_KEY, String(kstEndOfDayMs(now)));
    } catch {
        // 저장 실패 시엔 다음 방문에 다시 뜬다. 안전한 방향이다.
    }
}

export function isNoticeModalSuppressed(now: Date = new Date()): boolean {
    const store = safeLocalStorage();
    if (!store) return false;
    try {
        const raw = store.getItem(SUPPRESS_KEY);
        if (!raw) return false;
        const until = Number(raw);
        if (!Number.isFinite(until)) return false;
        if (now.getTime() > until) {
            store.removeItem(SUPPRESS_KEY);
            return false;
        }
        return true;
    } catch {
        return false;
    }
}
