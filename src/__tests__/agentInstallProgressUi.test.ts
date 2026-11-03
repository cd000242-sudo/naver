import { afterEach, describe, expect, it, vi } from 'vitest';
const loginFlow = vi.hoisted(() => vi.fn());
vi.mock('../renderer/utils/agentLoginCodePrompt', () => ({ runAgentLoginWithCodeFallback: loginFlow }));
vi.mock('../renderer/utils/uiManagers', () => ({ toastManager: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock('../renderer/utils/geminiPlanMemo', () => ({ rememberPlan: vi.fn() }));
vi.mock('../runtime/modelRegistry', () => ({ normalizeGeminiTextModelId: (value: string) => value }));
import { refreshAgentStatusBadges } from '../renderer/modules/priceInfoModal.js';
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; }
function fixture() {
  const elements = new Map<string, any>();
  for (const name of ['status', 'actions', 'install-btn', 'login-btn', 'switch-btn']) elements.set('agent-codex-' + name, { textContent: '', disabled: false, onclick: null, style: { display: '', color: '' } });
  const installing = deferred(), loggingIn = deferred(), removed = vi.fn(); let progress!: (value: any) => void;
  const api = { agentStatus: vi.fn().mockResolvedValueOnce({ success: true, status: { installed: false, loggedIn: false, available: false } }).mockResolvedValueOnce({ success: true, status: { installed: true, loggedIn: false, available: false } }).mockResolvedValue({ success: true, status: { installed: true, loggedIn: true, available: true } }),
    agentInstall: vi.fn(() => installing.promise), agentLogin: vi.fn(), onAgentInstallProgress: vi.fn((listener: any) => { progress = listener; return removed; }) };
  vi.stubGlobal('window', { api }); vi.stubGlobal('document', { getElementById: (id: string) => elements.get(id) || null });
  loginFlow.mockImplementation(() => loggingIn.promise);
  return { api, installing, loggingIn, removed, q: (name: string) => elements.get('agent-codex-' + name), progress: (value: any) => progress(value) };
}
afterEach(() => { vi.unstubAllGlobals(); loginFlow.mockReset(); });
describe('one-click install progress lifetime', () => {
  it('shows only its provider and detaches before OAuth so late messages cannot replace login', async () => {
    const f = fixture(); await refreshAgentStatusBadges({ providers: ['codex'], forceRefresh: true });
    const pending = f.q('install-btn').onclick({ preventDefault() {}, stopPropagation() {} });
    expect(f.q('install-btn').textContent).not.toContain('최대 2분'); expect(f.q('status').textContent).not.toContain('npm 전역');
    f.progress({ provider: 'claude', phase: 'installing', message: '다른 공급자' }); expect(f.q('status').textContent).not.toContain('다른 공급자');
    f.progress({ provider: 'codex', phase: 'installing', message: '공식 파일 검증 중' }); expect(f.q('status').textContent).toBe('공식 파일 검증 중');
    f.installing.resolve({ success: true }); await vi.waitFor(() => expect(loginFlow).toHaveBeenCalledOnce());
    expect(f.removed).toHaveBeenCalledOnce(); const loginText = f.q('status').textContent;
    f.progress({ provider: 'codex', phase: 'complete', message: '늦은 설치 이벤트' }); expect(f.q('status').textContent).toBe(loginText);
    f.loggingIn.resolve({ success: true, status: { available: true } }); await pending;
    expect(f.removed).toHaveBeenCalledOnce();
  });
  it('always removes the install listener after a failed install', async () => {
    const f = fixture(); await refreshAgentStatusBadges({ providers: ['codex'], forceRefresh: true });
    const pending = f.q('install-btn').onclick({ preventDefault() {}, stopPropagation() {} });
    f.installing.resolve({ success: false, message: 'offline' }); await pending;
    expect(f.removed).toHaveBeenCalledOnce(); expect(loginFlow).not.toHaveBeenCalled();
    const final = f.q('status').textContent; f.progress({ provider: 'codex', phase: 'complete', message: 'late' }); expect(f.q('status').textContent).toBe(final);
  });
});
