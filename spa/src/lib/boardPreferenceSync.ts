export type BoardProvider = 'claude' | 'codex' | 'gemini' | 'grok';
export type PreferenceSyncState = { status: 'idle' | 'syncing' | 'synced' | 'offline' | 'outdated' | 'error'; provider: BoardProvider | null };
type PreferenceResponse = { status: 'ok'; result: { provider: string | null } } | { status: 'offline' | 'outdated' | 'error' };
export function boardProvider(value: unknown): BoardProvider | null {
    return typeof value === 'string' && ['claude', 'codex', 'gemini', 'grok'].includes(value) ? value as BoardProvider : null;
}
/** Only explicit browser choices are sent. Serialize changes so an older request cannot win. */
export function createBoardPreferenceSync(deps: {
    readProvider: () => unknown;
    transport: { get: () => Promise<PreferenceResponse>; set: (provider: BoardProvider) => Promise<PreferenceResponse> };
    publish: (state: PreferenceSyncState) => void;
}) {
    let running: Promise<void> | null = null;
    let requested = false;
    async function drain() {
        do {
            requested = false;
            let provider: BoardProvider | null = null;
            try {
                provider = boardProvider(deps.readProvider());
                if (!provider) { deps.publish({ status: 'idle', provider: null }); continue; }
                deps.publish({ status: 'syncing', provider });
                const current = await deps.transport.get();
                if (boardProvider(deps.readProvider()) !== provider) { requested = true; continue; }
                const response = current.status !== 'ok' || current.result.provider === provider
                    ? current : await deps.transport.set(provider);
                if (boardProvider(deps.readProvider()) !== provider) { requested = true; continue; }
                if (response.status === 'ok' && response.result.provider === provider) {
                    deps.publish({ status: 'synced', provider });
                } else {
                    deps.publish({ status: response.status === 'ok' ? 'error' : response.status, provider });
                }
            } catch {
                deps.publish({ status: 'error', provider });
            }
        } while (requested);
    }
    return function sync(): Promise<void> {
        requested = true;
        if (!running) running = drain().finally(() => { running = null; });
        return running;
    };
}
