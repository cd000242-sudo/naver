import { afterEach, describe, expect, it, vi } from 'vitest';
const loginFlow = vi.hoisted(() => vi.fn());
vi.mock('../renderer/utils/agentLoginCodePrompt', () => ({ runAgentLoginWithCodeFallback: loginFlow }));
vi.mock('../renderer/utils/uiManagers', () => ({ toastManager: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock('../renderer/utils/geminiPlanMemo', () => ({ rememberPlan: vi.fn() }));
vi.mock('../runtime/modelRegistry', () => ({ normalizeGeminiTextModelId: (value: string) => value }));
import { refreshAgentStatusBadges } from '../renderer/modules/priceInfoModal.js';

const READY = { installed: true, loggedIn: true, available: true };
const NOT_INSTALLED = { installed: false, loggedIn: false, available: false };
const NEEDS_LOGIN = { installed: true, loggedIn: false, available: false };

function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; }
function fakeElement(elements: Map<string, any>): any {
  const el: any = { id: '', textContent: '', disabled: false, onclick: null, style: { display: '', color: '' }, setAttribute() {} };
  el.insertAdjacentElement = (_position: string, child: any) => { elements.set(child.id, child); return child; };
  return el;
}
/** Status calls in order: badge (not installed) -> connect 1/4 (not installed) -> after install (needs login) -> ready. */
function fixture() {
  const elements = new Map<string, any>();
  for (const name of ['status', 'actions', 'install-btn', 'login-btn', 'switch-btn']) elements.set('agent-codex-' + name, fakeElement(elements));
  const installing = deferred(), loggingIn = deferred(), removed = vi.fn(); let progress!: (value: any) => void;
  const api = {
    agentStatus: vi.fn()
      .mockResolvedValueOnce({ success: true, status: NOT_INSTALLED })
      .mockResolvedValueOnce({ success: true, status: NOT_INSTALLED })
      .mockResolvedValueOnce({ success: true, status: NEEDS_LOGIN })
      .mockResolvedValue({ success: true, status: READY }),
    agentInstall: vi.fn(() => installing.promise), agentLogin: vi.fn(),
    agentGenerate: vi.fn(async (payload: { prompt: string }) => ({ success: true, text: payload.prompt.match(/BLN-[A-Za-z0-9]{6}/)?.[0] ?? '' })),
    onAgentInstallProgress: vi.fn((listener: any) => { progress = listener; return removed; }),
  };
  vi.stubGlobal('window', { api });
  vi.stubGlobal('document', { getElementById: (id: string) => elements.get(id) || null, createElement: () => fakeElement(elements) });
  loginFlow.mockImplementation(() => loggingIn.promise);
  return { api, installing, loggingIn, removed, q: (name: string) => elements.get('agent-codex-' + name), progress: (value: any) => progress(value) };
}
const click = { preventDefault() {}, stopPropagation() {} };
afterEach(() => { vi.unstubAllGlobals(); loginFlow.mockReset(); });

describe('one-click connect: install progress lifetime', () => {
  it('shows only its provider in the connect log and detaches before OAuth so late messages cannot replace login', async () => {
    const f = fixture(); await refreshAgentStatusBadges({ providers: ['codex'], forceRefresh: true });
    expect(f.q('install-btn').textContent).toBe('⚡ 연결하기 (설치 → 로그인 → 확인)');
    const pending = f.q('install-btn').onclick(click);
    await vi.waitFor(() => expect(f.api.agentInstall).toHaveBeenCalledWith('codex'));
    const statusText = f.q('status').textContent; const log = () => f.q('connect-log');
    expect(log().textContent).toBe('[2/4 설치] 공식 npm 패키지를 설치합니다…');
    f.progress({ provider: 'claude', phase: 'installing', message: '다른 공급자' }); expect(log().textContent).not.toContain('다른 공급자');
    f.progress({ provider: 'codex', phase: 'installing', message: '공식 파일 검증 중' }); expect(log().textContent).toBe('[2/4 설치] 공식 파일 검증 중');
    f.installing.resolve({ success: true }); await vi.waitFor(() => expect(loginFlow).toHaveBeenCalledOnce());
    expect(f.removed).toHaveBeenCalledOnce(); const loginText = log().textContent;
    f.progress({ provider: 'codex', phase: 'complete', message: '늦은 설치 이벤트' }); expect(log().textContent).toBe(loginText);
    expect(f.q('status').textContent).toBe(statusText); // progress never writes into the status line
    f.loggingIn.resolve({ success: true, status: READY }); await pending;
    expect(f.removed).toHaveBeenCalledOnce();
    expect(f.api.agentGenerate).toHaveBeenCalledOnce();
    expect(log().textContent).toMatch(/^✅ 연결 완료 — 실제 답 확인됨 \(\d+초\)$/);
  });
  it('always removes the install listener after a failed install and keeps the reason in the log', async () => {
    const f = fixture(); await refreshAgentStatusBadges({ providers: ['codex'], forceRefresh: true });
    const pending = f.q('install-btn').onclick(click);
    await vi.waitFor(() => expect(f.api.agentInstall).toHaveBeenCalled());
    f.installing.resolve({ success: false, message: 'offline' }); await pending;
    expect(f.removed).toHaveBeenCalledOnce(); expect(loginFlow).not.toHaveBeenCalled(); expect(f.api.agentGenerate).not.toHaveBeenCalled();
    const final = f.q('connect-log').textContent; expect(final).toBe('❌ [2/4 설치]에서 멈춤: offline');
    f.progress({ provider: 'codex', phase: 'complete', message: 'late' }); expect(f.q('connect-log').textContent).toBe(final);
  });
});
