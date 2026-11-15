/**
 * 2026-11-13 live run: the Claude 5-hour limit made every vision call fail with `rate_limited`. The gate treated each
 * failure as "this batch is rejected" and kept calling 19 more times, then the screen said "no matching photo".
 * The truth was "the check could not run". A limit / login problem now stops the whole collection and says so.
 * Network-free: the judge, the fetcher and the sources are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentCliError } from '../agentCli/types.js';

const mocks = vi.hoisted(() => ({ judge: vi.fn() }));

vi.mock('../crawler/issueHarness/visionJudges.js', () => ({ judgeImagesWithRoute: mocks.judge }));
vi.mock('../crawler/issueHarness/candidateFetcher.js', async (importActual) => ({
  ...(await importActual<typeof import('../crawler/issueHarness/candidateFetcher.js')>()),
  toVisionJpegBase64: async () => 'AA',
}));

const { runVisionGate, createVisionBudget } = await import('../crawler/issueHarness/visionGate.js');
const errors = await import('../crawler/issueHarness/visionEngineError.js');
const { generateCollectedPhotos } = await import('../main/services/collectPhotosEngine.js');
const { buildImageCollectConsent } = await import('../runtime/collectPhotosPolicy.js');
const { isMappableImageTransportError } = await import('../image/imageErrorMessages.js');

const claudeRoute = { vendor: 'agent-claude', model: 'agent-claude', apiKey: '', label: 'Claude 구독', free: true, fellBack: false } as const;
const codexRoute = { vendor: 'agent-codex', model: 'agent-codex', apiKey: '', label: 'Codex 구독', free: true, fellBack: false } as const;
const openaiRoute = { vendor: 'openai', model: 'gpt-4.1-mini', apiKey: 'k', label: 'openai · gpt-4.1-mini', free: false, fellBack: false } as const;
const ctx = { mainSubject: '김연아', heading: '은퇴 기자회견 그 후' };

const items = (count: number) => Array.from({ length: count }, (_, i) => ({
  candidate: { url: `https://img.example.com/${i}.jpg`, sourceName: 'naver', query: 'q' },
  buffer: Buffer.alloc(0), width: 800, height: 600, dhash: BigInt(i),
}));
const allClean = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ index: i + 1, relevant: true, isPhoto: true, clean: true })));
const agentError = (code: ConstructorParameters<typeof AgentCliError>[0]) =>
  new AgentCliError(code, 'claude', `Claude 생성 실패 (원인 코드: ${code})`, "You've hit your limit · resets 12am (Asia/Seoul)");

const CLAUDE_LIMIT_MESSAGE = 'Claude 구독 사용 한도가 소진돼 사진 검사를 못 했어요. 한도가 풀린 뒤 다시 하거나, 글 엔진을 Codex 구독으로 바꾸면 바로 검사할 수 있어요.';

beforeEach(() => { mocks.judge.mockReset(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'log').mockImplementation(() => {}); });

describe('runVisionGate: 한도·로그인 문제는 첫 실패에서 멈춘다', () => {
  it('(a)(b) 구독 한도 소진이면 호출이 1번에서 멈추고 전용 오류가 올라온다 (24장 = 3묶음)', async () => {
    mocks.judge.mockRejectedValue(agentError('rate_limited'));
    const run = runVisionGate(items(24) as never, claudeRoute, createVisionBudget(120), ctx);
    await expect(run).rejects.toBeInstanceOf(errors.VisionEngineUnavailableError);
    expect(mocks.judge).toHaveBeenCalledTimes(1);
    const error = await run.catch((e) => e) as InstanceType<typeof errors.VisionEngineUnavailableError>;
    expect(error.reason).toBe('rate_limit');
    expect(error.engineLabel).toBe('Claude 구독');
    expect(error.message).toBe(CLAUDE_LIMIT_MESSAGE);
  });

  it('(a) 로그인이 풀린 경우도 첫 실패에서 멈춘다', async () => {
    mocks.judge.mockRejectedValue(agentError('not_logged_in'));
    const error = await runVisionGate(items(24) as never, claudeRoute, createVisionBudget(120), ctx).catch((e) => e);
    expect(error).toBeInstanceOf(errors.VisionEngineUnavailableError);
    expect(error.reason).toBe('login');
    expect(mocks.judge).toHaveBeenCalledTimes(1);
  });

  it('(a) 앞 묶음은 통과했어도 뒤 묶음에서 한도가 나면 거기서 멈춘다', async () => {
    mocks.judge.mockResolvedValueOnce(allClean(8)).mockRejectedValue(agentError('rate_limited'));
    await expect(runVisionGate(items(24) as never, claudeRoute, createVisionBudget(120), ctx))
      .rejects.toBeInstanceOf(errors.VisionEngineUnavailableError);
    expect(mocks.judge).toHaveBeenCalledTimes(2);
  });

  it('(c) 일반 오류(시간 초과·네트워크)는 지금처럼 그 묶음만 탈락하고 다음 묶음으로 간다', async () => {
    mocks.judge
      .mockRejectedValueOnce(agentError('timeout'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(allClean(8));
    const survivors = await runVisionGate(items(24) as never, claudeRoute, createVisionBudget(120), ctx);
    expect(mocks.judge).toHaveBeenCalledTimes(3);
    expect(survivors).toHaveLength(8);
  });

  it('(c) 과부하(529)·빈 응답 같은 일시 오류 코드는 멈춤 대상이 아니다', async () => {
    for (const code of ['server_overloaded', 'empty_output', 'bad_json', 'nonzero_exit'] as const) {
      expect(errors.classifyVisionEngineFailure(agentError(code), claudeRoute)).toBeNull();
    }
  });
});

describe('classifyVisionEngineFailure', () => {
  it('구독 엔진: rate_limited → 한도, not_logged_in·subscription_inactive → 로그인', () => {
    expect(errors.classifyVisionEngineFailure(agentError('rate_limited'), codexRoute)?.reason).toBe('rate_limit');
    expect(errors.classifyVisionEngineFailure(agentError('not_logged_in'), codexRoute)?.reason).toBe('login');
    expect(errors.classifyVisionEngineFailure(agentError('subscription_inactive'), codexRoute)?.reason).toBe('login');
  });

  it('API 엔진: 키 거절(401/403)과 한도 소진 문구만 멈춤 대상, 보통의 429·서버 오류는 아니다', () => {
    const cls = (msg: string) => errors.classifyVisionEngineFailure(new Error(msg), openaiRoute)?.reason ?? null;
    expect(cls('OpenAI vision 401: {"error":{"code":"invalid_api_key"}}')).toBe('login');
    expect(cls('Claude vision 403: forbidden')).toBe('login');
    expect(cls('[GoogleGenerativeAI Error]: [400 Bad Request] API key not valid. Please pass a valid API key.')).toBe('login');
    expect(cls('OpenAI vision 429: {"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}')).toBe('rate_limit');
    expect(cls('Claude vision 400: Your credit balance is too low to access the Anthropic API')).toBe('rate_limit');
    expect(cls('OpenAI vision 429: Rate limit reached for requests per min (RPM)')).toBeNull();
    expect(cls('OpenAI vision 500: server error')).toBeNull();
    expect(cls('This operation was aborted')).toBeNull();
  });

  it('구독 엔진인데 일반 Error 면 멈춤 대상이 아니다', () => {
    expect(errors.classifyVisionEngineFailure(new Error('spawn EPERM'), claudeRoute)).toBeNull();
  });
});

describe('(d) 사용자 문구는 엔진별로 맞게 나온다', () => {
  const msg = errors.buildVisionEngineUnavailableMessage;
  it('Claude 구독 한도 소진 — 사장님이 정한 문구 그대로', () => {
    expect(msg(claudeRoute, 'rate_limit')).toBe(CLAUDE_LIMIT_MESSAGE);
  });
  it('Codex 구독 한도 소진 — Claude 와 Codex 를 서로 바꾼다', () => {
    expect(msg(codexRoute, 'rate_limit')).toBe('Codex 구독 사용 한도가 소진돼 사진 검사를 못 했어요. 한도가 풀린 뒤 다시 하거나, 글 엔진을 Claude 구독으로 바꾸면 바로 검사할 수 있어요.');
  });
  it('로그인 문제 — "사용 한도가 소진돼" 자리에 "로그인이 풀려"', () => {
    expect(msg(claudeRoute, 'login')).toMatch(/^Claude 구독 로그인이 풀려 사진 검사를 못 했어요\./);
    expect(msg(claudeRoute, 'login')).toContain('글 엔진을 Codex 구독으로 바꾸면 바로 검사할 수 있어요.');
    expect(msg(codexRoute, 'login')).toMatch(/^Codex 구독 로그인이 풀려 사진 검사를 못 했어요\./);
    expect(msg(codexRoute, 'login')).toContain('글 엔진을 Claude 구독으로 바꾸면');
  });
  it('API 엔진 — 엔진 라벨을 넣고 다른 엔진을 권하지 않으며 설정 확인을 안내한다', () => {
    const limit = msg(openaiRoute, 'rate_limit');
    const login = msg(openaiRoute, 'login');
    for (const text of [limit, login]) {
      expect(text).toContain('openai · gpt-4.1-mini');
      expect(text).toContain('설정에서 엔진을 확인해 주세요.');
      expect(text).not.toMatch(/Codex|Claude 구독|바꾸면/);
    }
    expect(limit).toContain('사용 한도가 소진돼');
  });
  it('main.ts 의 이미지 오류 변환기가 이 문구를 가로채 다른 말로 바꾸지 않는다', () => {
    // automation:generateImages catch → isMappableImageTransportError(error, raw) ? 변환 : raw 그대로.
    for (const route of [claudeRoute, codexRoute, openaiRoute]) {
      for (const reason of ['rate_limit', 'login'] as const) {
        const text = msg(route, reason);
        expect(isMappableImageTransportError(new errors.VisionEngineUnavailableError(reason, route, text), text)).toBe(false);
      }
    }
  });
});

describe('관련 사진 찾기: 검사를 못 한 것을 "비워 둠"으로 숨기지 않는다', () => {
  const good = buildImageCollectConsent(new Date('2026-11-03T00:00:00Z'));
  const options = { provider: 'collect-photos', postTitle: '글 제목', items: [
    { heading: '썸네일 제목', prompt: 'p', isThumbnail: true }, { heading: '첫째 소제목', prompt: 'p1' }, { heading: '둘째 소제목', prompt: 'p2' },
  ] } as never;

  it('수집기에서 전용 오류가 올라오면 실패로 끝내고 진행 로그에 같은 문구를 남긴다 (빈 칸 로그 없음)', async () => {
    const log = vi.fn();
    const failure = new errors.VisionEngineUnavailableError('rate_limit', claudeRoute, CLAUDE_LIMIT_MESSAGE);
    const runtime = { loadConsent: async () => good, buildDeps: () => ({}) as never, collect: vi.fn(async () => { throw failure; }), readPreview: async () => '', log };
    await expect(generateCollectedPhotos(options, undefined, runtime)).rejects.toThrow(CLAUDE_LIMIT_MESSAGE);
    const logged = log.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain(CLAUDE_LIMIT_MESSAGE);
    expect(logged).not.toMatch(/칸은 맞는 사진을 못 찾아 비워 둠/);
    expect(logged).not.toMatch(/칸 채움/);
  });

  it('다른 오류는 그대로 올라가고(문구 가로채지 않음), 사진이 아예 없을 때만 빈 칸 로그가 나온다', async () => {
    const log = vi.fn();
    const base = { loadConsent: async () => good, buildDeps: () => ({}) as never, readPreview: async () => '', log };
    await expect(generateCollectedPhotos(options, undefined, { ...base, collect: async () => { throw new Error('boom'); } })).rejects.toThrow('boom');
    await generateCollectedPhotos(options, undefined, { ...base, collect: async () => [] });
    expect(log.mock.calls.map((call) => String(call[0])).join('\n')).toMatch(/3칸 중 0칸 채움/);
  });
});
