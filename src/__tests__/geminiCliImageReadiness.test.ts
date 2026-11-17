import { describe, expect, it, vi } from 'vitest';
import { assertGeminiCliImageReady, GEMINI_CLI_IMAGE_CONNECT_MESSAGE } from '../image/geminiCli/geminiCliImageReadiness.js';
import { GEMINI_CLI_IMAGE_ENGINE, GEMINI_CLI_IMAGE_ENGINE_LABEL, isGeminiCliImageEngine } from '../runtime/geminiCliImagePolicy.js';
import { AGENT_IMAGE_PROFILES, AGENT_TIER_PROFILES, resolveAgentImageProfile } from '../agentCli/agentModelDefaults.js';
import { AgentCliError, type AgentCliStatus } from '../agentCli/types.js';

describe('Gemini 구독 이미지 - 엔진 이름과 모델', () => {
  it('엔진 값과 라벨이 정해져 있다', () => {
    expect(GEMINI_CLI_IMAGE_ENGINE).toBe('gemini-cli-image');
    expect(GEMINI_CLI_IMAGE_ENGINE_LABEL).toBe('Gemini 구독 이미지 (Gemini CLI · 별도 비용 없음)');
    expect(isGeminiCliImageEngine(' gemini-cli-image ')).toBe(true);
    expect(isGeminiCliImageEngine('codex-image')).toBe(false);
    expect(isGeminiCliImageEngine(undefined)).toBe(false);
  });

  it('이미지 프로필: gemini 는 모델 이름에 강도가 들어 있어 effort 가 없다', () => {
    expect(AGENT_IMAGE_PROFILES.gemini).toEqual({ model: 'gemini-3.8-flash-low' });
    expect('effort' in AGENT_IMAGE_PROFILES.gemini).toBe(false);
    expect(resolveAgentImageProfile('gemini')).toEqual({ model: 'gemini-3.8-flash-low' });
    expect(resolveAgentImageProfile('gemini', ' gemini-3.8-flash-high ')).toEqual({ model: 'gemini-3.8-flash-high' });
    expect(resolveAgentImageProfile('gemini', null)).toEqual({ model: 'gemini-3.8-flash-low' });
  });

  it('codex 이미지 프로필과 gemini 글 생성 기본값은 그대로다', () => {
    expect(AGENT_IMAGE_PROFILES.codex).toEqual({ model: 'gpt-6-luna', effort: 'low' });
    expect(resolveAgentImageProfile('codex', ' gpt-x ')).toEqual({ model: 'gpt-x', effort: 'low' });
    expect(AGENT_TIER_PROFILES.gemini.main.model).toBe('gemini-3.8-flash-medium');
    expect(AGENT_TIER_PROFILES.gemini.light.model).toBe('gemini-3.8-flash-low');
  });
});

describe('실행 전 준비 확인 (Gemini 구독 이미지)', () => {
  const status = (patch: Partial<AgentCliStatus>): AgentCliStatus => ({ provider: 'gemini', installed: true, loggedIn: true, available: true, ...patch });
  const check = (patch: Partial<AgentCliStatus>) => assertGeminiCliImageReady(async () => status(patch));

  it('연결 안내 문구가 정해져 있다', () => {
    expect(GEMINI_CLI_IMAGE_CONNECT_MESSAGE).toBe('Gemini 구독 이미지는 Gemini CLI 연결이 필요합니다 — 설정에서 [연결하기]');
  });

  it('gemini 를 새로 확인(forceRefresh)하고, 준비됐으면 통과한다', async () => {
    const detect = vi.fn(async () => status({}));
    await expect(assertGeminiCliImageReady(detect)).resolves.toBeUndefined();
    expect(detect).toHaveBeenCalledWith('gemini', { forceRefresh: true });
  });

  it('미설치 · 미로그인 · 버전 낮음은 [연결하기] 안내로 실행 전에 막는다', async () => {
    const cases = [
      { patch: { installed: false, loggedIn: false, available: false }, code: 'not_installed' },
      { patch: { loggedIn: false, available: false }, code: 'not_logged_in' },
      { patch: { available: false, errorCode: 'update_required' as const, detail: 'agy 1.0 은 낮습니다' }, code: 'update_required' },
    ];
    for (const { patch, code } of cases) {
      const error = await check(patch).catch((e) => e) as AgentCliError;
      expect(error).toBeInstanceOf(AgentCliError);
      expect(error.provider).toBe('gemini');
      expect(error.code).toBe(code);
      expect(error.message).toContain(GEMINI_CLI_IMAGE_CONNECT_MESSAGE);
    }
  });

  it('한도 초과: 리셋 시각을 알면 안내하고, 모르면 일반 문구 — 둘 다 엔진을 바꾸지 않았다고 알린다', async () => {
    const dated = await check({ available: false, errorCode: 'rate_limited', detail: 'try again at Nov 4th, 2026 3:42 PM.' }).catch((e) => e) as AgentCliError;
    expect(dated.code).toBe('rate_limited');
    expect(dated.message).toContain('11월 4일 15시 42분');
    expect(dated.message).toContain('다른 이미지 엔진으로 바꾸지 않았습니다');
    const plain = await check({ available: false, errorCode: 'rate_limited', detail: 'quota exhausted' }).catch((e) => e) as AgentCliError;
    expect(plain.message).toContain('구독 한도가 소진되었습니다');
    expect(plain.message).toContain('다른 이미지 엔진으로 바꾸지 않았습니다');
  });

  it('상태 확인 시간 초과는 로그아웃으로 몰지 않고 그대로 알린다', async () => {
    const error = await check({ installed: false, loggedIn: false, available: false, errorCode: 'timeout' }).catch((e) => e) as AgentCliError;
    expect(error.code).toBe('timeout');
    expect(error.message).not.toContain('[연결하기]');
  });

  it('그 밖의 사용 불가 상태는 코드와 상세를 그대로 돌려준다', async () => {
    const error = await check({ available: false, errorCode: 'model_unavailable', detail: '모델 없음' }).catch((e) => e) as AgentCliError;
    expect(error.code).toBe('model_unavailable');
    expect(error.message).toContain('모델 없음');
  });
});
