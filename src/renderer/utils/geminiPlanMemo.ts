// Session-level memo for the Gemini plan modal answer.
//
// Why this exists: `ensureExternalApiCostConsent` in costAndAutoGen.ts asks
// the user "free or paid?" once, then writes the answer to disk via IPC
// saveConfig. Subsequent calls read it back via IPC getConfig and skip the
// modal. That round-trip is fragile under load:
//
//   1. getConfig has a 10s timeout. During continuous publishing, many
//      concurrent IPC calls (image gen, log streaming, status pings) can
//      starve the bridge → getConfig times out → caller treats config as `{}`
//      → modal re-appears even though plan was saved long ago.
//   2. saveConfig and getConfig do not share a lock. A getConfig fired while
//      saveConfig is mid-write may read pre-write state.
//   3. The user's saveConfig may itself fail silently (e.g. file lock). The
//      old logic has no in-memory fallback, so the modal keeps re-appearing.
//
// Fix: cache the user's explicit answer in module memory + localStorage. Once
// the user has clicked 유료/무료 in this session (or any prior session that
// reached localStorage), never ask again — even if IPC config is stuck.
//
// This is purely a *defensive* layer. The disk config remains the source of
// truth for the actual generator (`nanoBananaProGenerator`), which reads it
// directly from main-process loadConfig. The memo only suppresses the *modal*.

const LS_KEY = 'geminiPlanType_session_v1';

type PlanType = 'free' | 'paid';

let _memo: PlanType | null = null;

function isPlan(v: unknown): v is PlanType {
    return v === 'free' || v === 'paid';
}

export function rememberPlan(type: PlanType): void {
    if (!isPlan(type)) return;
    _memo = type;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(LS_KEY, type);
        }
    } catch {
        // localStorage unavailable (private mode, electron preload edge case) —
        // module memory still holds the answer for this session.
    }
}

export function recallPlan(): PlanType | null {
    if (_memo) return _memo;
    try {
        if (typeof localStorage !== 'undefined') {
            const v = localStorage.getItem(LS_KEY);
            if (isPlan(v)) {
                _memo = v;
                return v;
            }
        }
    } catch {
        // ignore — caller will fall through to IPC config check
    }
    return null;
}

export function clearPlanMemo(): void {
    _memo = null;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(LS_KEY);
        }
    } catch {
        // ignore
    }
}

// For tests only — resets module memory without touching localStorage.
export function __resetMemoForTest(): void {
    _memo = null;
}
