/**
 * [Phase 1-2/v2.10.135] Broken image path registry — ERR_FILE_NOT_FOUND 영구 차단.
 *
 * 배경: 글 목록의 썸네일이 삭제된 파일 경로를 참조하면 매 렌더링 시 ERR_FILE_NOT_FOUND 발생.
 *   v2.10.132 scheduleCleanup이 localStorage를 직접 수정해서 81ms LongTask 회귀 → v2.10.133 revert.
 *   이번엔 localStorage 글 데이터는 *건드리지 않고*, 별도 registry에 "한 번 실패한 경로"만 기록.
 *
 * 동작:
 *   1. 첫 렌더링: <img> 시도 → ERR_FILE_NOT_FOUND → onerror 핸들러가 markBrokenImage 호출
 *   2. 두 번째 렌더링부터: isBrokenImage 체크 → true면 <img> 자체를 렌더 안 함 → placeholder만 표시
 *   3. 결과: 같은 경로에 대한 ERR_FILE_NOT_FOUND가 *최대 1회만* 발생
 *
 * localStorage 키: naver_broken_image_paths (Set으로 직렬화)
 * 캐시 한도: 5000개 경로 (오래된 것부터 제거)
 */

const BROKEN_IMG_KEY = 'naver_broken_image_paths';
const MAX_ENTRIES = 5000;

let _cache: Set<string> | null = null;
let _persistTimer: number | null = null;

function _load(): Set<string> {
    if (_cache) return _cache;
    try {
        const raw = localStorage.getItem(BROKEN_IMG_KEY);
        if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
                _cache = new Set(arr);
                return _cache;
            }
        }
    } catch {
        // ignore — corrupted storage
    }
    _cache = new Set();
    return _cache;
}

function _schedulePersist(): void {
    // debounce: 1초 안에 여러 markBrokenImage 호출되어도 1회만 저장
    if (_persistTimer !== null) return;
    _persistTimer = window.setTimeout(() => {
        _persistTimer = null;
        try {
            const cache = _load();
            // 한도 초과 시 오래된 항목 제거 (Set은 insertion order 보존)
            if (cache.size > MAX_ENTRIES) {
                const arr = Array.from(cache).slice(-MAX_ENTRIES);
                _cache = new Set(arr);
            }
            localStorage.setItem(BROKEN_IMG_KEY, JSON.stringify(Array.from(_load())));
        } catch {
            // ignore — quota or other storage error
        }
    }, 1000);
}

export function isBrokenImage(path: string): boolean {
    if (!path) return false;
    return _load().has(path);
}

export function markBrokenImage(path: string): void {
    if (!path) return;
    const cache = _load();
    if (cache.has(path)) return; // 이미 기록됨, persist 스킵
    cache.add(path);
    _schedulePersist();
}

export function clearBrokenImageRegistry(): void {
    _cache = new Set();
    try {
        localStorage.removeItem(BROKEN_IMG_KEY);
    } catch {
        // ignore
    }
}

// window 노출 — inline onerror="window.markBrokenImage('...')" 호출용
if (typeof window !== 'undefined') {
    (window as any).markBrokenImage = markBrokenImage;
    (window as any).isBrokenImage = isBrokenImage;
    (window as any).clearBrokenImageRegistry = clearBrokenImageRegistry;
}
