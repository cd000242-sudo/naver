/**
 * 이미지 탭 "AI 자동수집" + photoCheckMode: the owner picks how the photos are checked, the handler hands the collector
 * that route, and a stopped check answers with a structured failure the screen can branch on.
 * Network-free: electron, config, license and the harness are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(), collect: vi.fn(), planGenerators: [] as string[] }));
const electronMock = vi.hoisted(() => ({
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => { mocks.handlers.set(channel, fn); } },
}));

vi.mock('electron', () => electronMock);
vi.mock('./mocks/electron', () => electronMock);
// The selected text engine is Claude, so "selected" resolves to the Claude subscription route.
vi.mock('../configManager.js', () => ({ loadConfig: async () => ({ primaryGeminiTextModel: 'agent-claude' }), applyConfigToEnv: () => {} }));
vi.mock('../main/utils/authUtils.js', () => ({ ensureLicenseValid: async () => true, enforceFreeTier: async () => ({ allowed: true }) }));
vi.mock('../main/ipc/paraphraseAnalysisHandlers.js', () => ({
  resolveSelectedEngineRoute: (generator: string) => { mocks.planGenerators.push(generator); return null; },
}));
vi.mock('../main/services/issueCollectSources.js', () => ({ buildIssueCollectSources: async () => ({}) }));
vi.mock('../crawler/issueHarness/harness.js', () => ({ collectIssueImages: mocks.collect }));

const { registerIssueCollectHandlers } = await import('../main/ipc/issueCollectHandlers.js');
const { VisionEngineUnavailableError, buildVisionEngineUnavailableMessage } = await import('../crawler/issueHarness/visionEngineError.js');

const basePayload = { title: '김연아 은퇴', headings: [{ title: '은퇴 기자회견 그 후' }] };
const emptyResult = { images: {}, candidates: {}, stats: { totalCandidates: 0, afterFilter: 0, perSource: {} } };

async function invoke(extra: Record<string, unknown> = {}) {
  const handler = mocks.handlers.get('issue:collectImages')!;
  const result = await handler({ sender: { send: vi.fn() } }, { ...basePayload, ...extra }) as Record<string, unknown>;
  const options = mocks.collect.mock.calls[0]?.[1] as { visionRoute: { vendor: string } | null } | undefined;
  return { result, visionRoute: options?.visionRoute };
}
const logged = () => (console.log as unknown as ReturnType<typeof vi.fn>).mock.calls.map(call => String(call[0])).join('\n');

beforeEach(() => {
  mocks.handlers.clear();
  mocks.collect.mockReset();
  mocks.planGenerators.length = 0;
  mocks.collect.mockResolvedValue(emptyResult);
  registerIssueCollectHandlers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('issue:collectImages — photoCheckMode', () => {
  // The search plan is made by the same engine as the check: re-running with Codex while Claude is over its limit
  // must not leave the plan on Claude (it would fail and drop to the rough heuristic queries).
  it('다른 구독을 고르면 검색어 플랜도 그 구독으로 간다', async () => {
    await invoke({ photoCheckMode: 'agent-codex' });
    expect(mocks.planGenerators.at(-1)).toBe('agent-codex');
  });

  it('값이 없거나 무료 판정이면 검색어 플랜은 글 엔진 그대로다', async () => {
    await invoke();
    expect(mocks.planGenerators.at(-1)).toBe('agent-claude');
    await invoke({ photoCheckMode: 'caption' });
    expect(mocks.planGenerators.at(-1)).toBe('agent-claude');
  });

  it('값이 없으면 지금처럼 글 엔진(Claude 구독)을 따른다', async () => {
    const { visionRoute } = await invoke();
    expect(visionRoute?.vendor).toBe('agent-claude');
  });

  it("'caption' 이면 수집기에 검사 경로 null 을 주고 무료 판정 안내를 남긴다", async () => {
    const { result, visionRoute } = await invoke({ photoCheckMode: 'caption' });
    expect(result.success).toBe(true);
    expect(visionRoute).toBeNull();
    expect(logged()).toContain('무료 판정(사진 설명 글 기준)으로 진행합니다');
  });

  it("'agent-codex' 면 글 엔진이 Claude 여도 Codex 구독 경로를 준다", async () => {
    const { visionRoute } = await invoke({ photoCheckMode: 'agent-codex' });
    expect(visionRoute?.vendor).toBe('agent-codex');
  });

  it("'agent-claude' 면 Claude 구독 경로를 준다", async () => {
    const { visionRoute } = await invoke({ photoCheckMode: 'agent-claude' });
    expect(visionRoute?.vendor).toBe('agent-claude');
  });

  it('알 수 없는 값은 수집을 시작하지 않고 실패로 돌려준다', async () => {
    const { result } = await invoke({ photoCheckMode: 'gemini' });
    expect(result.success).toBe(false);
    expect(mocks.collect).not.toHaveBeenCalled();
  });
});

describe('issue:collectImages — 검사 엔진 사용 불가 응답 모양', () => {
  it('code 와 visionUnavailable 이 실린다', async () => {
    const route = { vendor: 'agent-codex', label: 'Codex 구독' } as const;
    const message = buildVisionEngineUnavailableMessage(route, 'login');
    mocks.collect.mockRejectedValue(new VisionEngineUnavailableError('login', route, message));
    const { result } = await invoke();
    expect(result).toEqual({
      success: false, message, code: 'VISION_ENGINE_UNAVAILABLE',
      visionUnavailable: { reason: 'login', vendor: 'agent-codex' }, images: {}, candidates: {},
    });
  });

  it('다른 오류에는 code 가 붙지 않는다', async () => {
    mocks.collect.mockRejectedValue(new Error('boom'));
    const { result } = await invoke();
    expect(result).toEqual({ success: false, message: 'boom', images: {}, candidates: {} });
  });
});
