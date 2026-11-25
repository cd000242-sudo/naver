/**
 * The two KakaoTalk group rooms behind the floating "단톡방 바로가기" button (2026-11-25).
 * The addresses are written here and nowhere else.
 */
export type ChatRoom = { key: string; label: string; href: string };

export const CHAT_ROOMS: readonly ChatRoom[] = Object.freeze([
    { key: 'room-1', label: '단톡방 1번', href: 'https://open.kakao.com/o/gQ1jRBwh' },
    { key: 'room-2', label: '단톡방 2번', href: 'https://open.kakao.com/o/gajymeSi' },
]);

/**
 * Which row gets the focus after `key` is pressed inside the room box: arrows wrap around, Home/End jump to the
 * ends, any other key returns null (left to the browser, e.g. Tab).
 */
export function roomMenuTarget(index: number, key: string, count: number): number | null {
    if (count <= 0) return null;
    switch (key) {
        case 'ArrowDown': return (index + 1) % count;
        case 'ArrowUp': return (index - 1 + count) % count;
        case 'Home': return 0;
        case 'End': return count - 1;
        default: return null;
    }
}
