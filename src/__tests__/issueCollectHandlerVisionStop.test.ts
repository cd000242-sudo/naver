/**
 * 이미지 탭 "AI 자동수집": when the picture check cannot run (usage limit / login), the IPC handler answers with a
 * failure and the reason — never a success with 0 photos. Network-free: electron, config, license and the harness are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(), collect: vi.fn() }));
// vitest.config aliases `electron` to ./mocks/electron, so both specifiers are mocked (same as the other IPC tests).
const electronMock = vi.hoisted(() => ({
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => { mocks.handlers.set(channel, fn); } },
}));

vi.mock('electron', () => electronMock);
vi.mock('./mocks/electron', () => electronMock);
vi.mock('../configManager.js', () => ({ loadConfig: async () => ({}), applyConfigToEnv: () => {} }));
vi.mock('../main/utils/authUtils.js', () => ({ ensureLicenseValid: async () => true, enforceFreeTier: async () => ({ allowed: true }) }));
vi.mock('../main/ipc/paraphraseAnalysisHandlers.js', () => ({ resolveSelectedEngineRoute: () => null }));
vi.mock('../crawler/issueHarness/harness.js', () => ({ collectIssueImages: mocks.collect }));

const { registerIssueCollectHandlers } = await import('../main/ipc/issueCollectHandlers.js');
const { VisionEngineUnavailableError, buildVisionEngineUnavailableMessage } = await import('../crawler/issueHarness/visionEngineError.js');

const claudeRoute = { vendor: 'agent-claude', label: 'Claude 구독' } as const;
const payload = { title: '김연아 은퇴', headings: [{ title: '은퇴 기자회견 그 후' }] };

async function invoke() {
  const handler = mocks.handlers.get('issue:collectImages')!;
  const send = vi.fn();
  const result = await handler({ sender: { send } }, payload) as { success: boolean; message?: string; images?: unknown; candidates?: unknown };
  return { result, send };
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.collect.mockReset();
  registerIssueCollectHandlers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('issue:collectImages — 검사 엔진 사용 불가', () => {
  it('성공 0장이 아니라 실패 + 사장님 문구로 돌려준다', async () => {
    const message = buildVisionEngineUnavailableMessage(claudeRoute, 'rate_limit');
    mocks.collect.mockRejectedValue(new VisionEngineUnavailableError('rate_limit', claudeRoute, message));
    const { result } = await invoke();
    expect(result.success).toBe(false);
    expect(result.message).toBe('Claude 구독 사용 한도가 소진돼 사진 검사를 못 했어요. 한도가 풀린 뒤 다시 하거나, 글 엔진을 Codex 구독으로 바꾸면 바로 검사할 수 있어요.');
    expect(result.images).toEqual({});
    expect(result.candidates).toEqual({});
    // A known, explained stop is not a crash: no error-level stack dump.
    expect(console.error).not.toHaveBeenCalled();
  });

  it('다른 오류는 예전처럼 오류 로그를 남기고 그 메시지로 실패한다', async () => {
    mocks.collect.mockRejectedValue(new Error('boom'));
    const { result } = await invoke();
    expect(result).toMatchObject({ success: false, message: 'boom' });
    expect(console.error).toHaveBeenCalled();
  });
});
