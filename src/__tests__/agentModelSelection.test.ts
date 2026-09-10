/**
 * [2026-09-10 사장님] "에이전트 고르고 나서 에이전트 속 에이전트 모델은 왜 안 뜨니.
 * 아스트라 페이블 이런 거 있잖아."
 *
 * 배선이 절반만 있었다. 세 러너 모두 모델 플래그를 받을 준비가 돼 있는데
 * (codex `-m`, claude `--model`, agy `--model`) **채우는 곳이 없었다.**
 * contentGenerator 의 callAgent 가 model 을 아예 넘기지 않아, 각 CLI 기본 모델로만 돌았다.
 * 그래서 UI 에도 고를 것이 없고 배지에도 뜰 값이 없었다.
 *
 * 설계: 모델 이름을 앱이 지어내지 않는다. CLI 가 아는 이름을 그대로 넘긴다 —
 * 벤더가 모델을 갈아치울 때마다 앱을 고치는 구조를 만들지 않는다(하드코딩 모델 금지 원칙).
 * 비워 두면 종전대로 CLI 기본 모델이다(회귀 없음).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolveAgentModel, AGENT_MODEL_CONFIG_KEYS } from '../runtime/agentModelPolicy';

describe('resolveAgentModel — 고른 에이전트의 모델을 찾아준다', () => {
  const cfg = {
    agentCodexModel: 'gpt-5.6',
    agentClaudeModel: 'claude-fable-5',
    agentGeminiModel: 'gemini-3.6-pro',
  };

  it('에이전트마다 제 모델을 돌려준다', () => {
    expect(resolveAgentModel('agent-codex', cfg)).toBe('gpt-5.6');
    expect(resolveAgentModel('agent-claude', cfg)).toBe('claude-fable-5');
    expect(resolveAgentModel('agent-gemini', cfg)).toBe('gemini-3.6-pro');
  });

  it('비어 있으면 undefined — CLI 기본 모델로 간다 (회귀 없음)', () => {
    expect(resolveAgentModel('agent-claude', {})).toBeUndefined();
    expect(resolveAgentModel('agent-claude', { agentClaudeModel: '   ' })).toBeUndefined();
  });

  it('앞뒤 공백은 떼어낸다 — 붙여넣기로 섞인 공백이 CLI 인자를 깨뜨린다', () => {
    expect(resolveAgentModel('agent-claude', { agentClaudeModel: '  claude-fable-5 ' })).toBe('claude-fable-5');
  });

  it('에이전트가 아니면 undefined', () => {
    expect(resolveAgentModel('gemini' as never, cfg)).toBeUndefined();
  });

  it('설정 키 3개가 정의돼 있다 — 저장 허용 목록과 UI 가 같은 이름을 써야 한다', () => {
    expect(AGENT_MODEL_CONFIG_KEYS).toEqual(['agentCodexModel', 'agentClaudeModel', 'agentGeminiModel']);
  });

  it('CLI 인자를 깨뜨릴 값은 받지 않는다 — 모델 이름에 공백·따옴표는 없다', () => {
    expect(resolveAgentModel('agent-claude', { agentClaudeModel: 'a b' })).toBeUndefined();
    expect(resolveAgentModel('agent-claude', { agentClaudeModel: '--dangerous' })).toBeUndefined();
    expect(resolveAgentModel('agent-claude', { agentClaudeModel: 'claude-fable-5' })).toBe('claude-fable-5');
  });
});

describe('배선 핀 — 설정에서 CLI 까지 관통한다', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const live = (p: string, needle: string): number => read(p)
    .split(String.fromCharCode(10))
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .filter((l) => l.includes(needle))
    .length;

  it('callAgent 가 모델을 CLI 로 넘긴다 (예전에는 아무도 안 넘겼다)', () => {
    expect(live('../contentGenerator.ts', 'resolveAgentModel(provider')).toBeGreaterThan(0);
    expect(live('../contentGenerator.ts', 'model: agentModel,')).toBeGreaterThan(0);
  });

  it('설정 저장 허용 목록에 3개 키가 있다 — 빠지면 저장이 조용히 버려진다', () => {
    const cfg = read('../configManager.ts');
    for (const key of ['agentCodexModel', 'agentClaudeModel', 'agentGeminiModel']) {
      expect(cfg).toContain(`'${key}'`);
      expect(cfg).toContain(`${key}?: string;`);
    }
  });

  it('화면에 입력칸 3개가 있다', () => {
    const html = read('../../public/index.html');
    for (const id of ['agent-codex-model', 'agent-claude-model', 'agent-gemini-model']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('저장·복원 양쪽이 배선돼 있다 — 저장만 되고 안 채워지면 "또 지워졌다" 가 된다', () => {
    const modal = read('../renderer/modules/priceInfoModal.ts');
    expect(modal).toContain('agentCodexModel: agentCodexModelValue');
    expect(modal).toMatch(/\['agent-codex-model',\s*'agentCodexModel'\]/);
  });

  it('배찌가 어떤 모델로 도는지 보여준다', () => {
    expect(read('../renderer/modules/agentQuotaBadge.ts')).toMatch(/모델 CLI 기본/);
  });
});

/*
 * [2026-09-10 사장님] "코덱스는 5.6 sol 아스트라 등등 있고 클로드코드도 페이블 오푸스5
 * 소넷이 있고 안티그래비티도 3.8플래쉬 이런 식으로 모델이 있잖아. 얘네들도 환경설정에서
 * 선택이 가능하게 해줘야지."
 *
 * 목록은 **전부 CLI 에서 실측했다**(2026-09-10). 지어낸 이름을 넣으면 CLI 가 거부한다.
 *   claude --help  → "an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet')"
 *   agy models     → gemini-3.8-flash-high … 그대로
 *   codex          → ~/.codex/config.toml 의 model = "gpt-6-astra"
 */
describe('AGENT_MODEL_PRESETS — CLI 실측 목록', () => {
  it('코덱스에 아스트라와 5.6 계열이 있다', async () => {
    const { AGENT_MODEL_PRESETS } = await import('../runtime/agentModelPolicy');
    const values = AGENT_MODEL_PRESETS['agent-codex'].map((m) => m.value);
    expect(values).toContain('gpt-6-astra');
    expect(values).toContain('gpt-5.6-sol');
  });

  it('클로드에 페이블·오푸스·소넷 별칭이 있다', async () => {
    const { AGENT_MODEL_PRESETS } = await import('../runtime/agentModelPolicy');
    const values = AGENT_MODEL_PRESETS['agent-claude'].map((m) => m.value);
    expect(values).toEqual(expect.arrayContaining(['fable', 'opus', 'sonnet']));
  });

  it('안티그래비티에 3.8 플래시가 있다', async () => {
    const { AGENT_MODEL_PRESETS } = await import('../runtime/agentModelPolicy');
    const values = AGENT_MODEL_PRESETS['agent-gemini'].map((m) => m.value);
    expect(values).toContain('gemini-3.8-flash-high');
  });

  it('모든 후보가 안전 형식을 통과한다 — 목록에 있는 값이 거부되면 안 된다', async () => {
    const { AGENT_MODEL_PRESETS, resolveAgentModel } = await import('../runtime/agentModelPolicy');
    for (const [provider, models] of Object.entries(AGENT_MODEL_PRESETS)) {
      for (const m of models) {
        const key = provider === 'agent-codex' ? 'agentCodexModel'
          : provider === 'agent-claude' ? 'agentClaudeModel' : 'agentGeminiModel';
        expect(resolveAgentModel(provider, { [key]: m.value }), `${provider} ${m.value}`).toBe(m.value);
      }
    }
  });

  it('드롭다운·직접입력 UI 가 화면에 있다', () => {
    const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
    for (const id of ['agent-codex-model-select', 'agent-claude-model-select', 'agent-gemini-model-select']) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it('저장 정본은 여전히 입력칸 하나다 — 저장 경로를 두 갈래로 만들지 않는다', () => {
    const mod = readFileSync(new URL('../renderer/modules/agentModelSelect.ts', import.meta.url), 'utf8');
    expect(mod).toMatch(/input\.value = select\.value/);
  });
});

/*
 * [2026-09-10 심층 점검] 모델 선택을 붙이면서 **새 실패 유형**이 생겼다.
 *
 * CLI 는 모르는 모델 이름을 받으면 거부한다. 그런데 classifyExit(parse.ts:109)에는
 * 모델 관련 분류가 없어 nonzero_exit(일반 오류)로 떨어진다 — 사용자는
 * "codex가 오류를 반환했습니다" 만 보고 자기가 고른 모델 때문인지 알 수 없다.
 *
 * 원인을 아는데 안 알려주면 앱 버그로 읽힌다(크레딧 안내 때와 같은 원칙).
 */
describe('모델 때문에 실패하면 그렇다고 말한다', () => {
  it('모델을 지정한 상태의 실패 메시지에 모델 이름이 들어간다', async () => {
    const { describeAgentModelFailure } = await import('../runtime/agentModelPolicy');
    const msg = describeAgentModelFailure('gpt-6-astra', 'codex가 오류를 반환했습니다.');
    expect(msg).toContain('gpt-6-astra');
    expect(msg).toContain('codex가 오류를 반환했습니다.');
  });

  it('CLI 가 모델을 모른다고 하면 그 사실을 짚어 준다', async () => {
    const { describeAgentModelFailure } = await import('../runtime/agentModelPolicy');
    for (const raw of [
      'error: unknown model: gpt-9-zzz',
      'Invalid model name provided',
      'model not found',
      'unsupported model',
      '지원하지 않는 모델입니다',
    ]) {
      expect(describeAgentModelFailure('gpt-9-zzz', raw)).toMatch(/모델 이름/);
    }
  });

  it('모델을 안 골랐으면 원문 그대로 — 없는 원인을 지어내지 않는다', async () => {
    const { describeAgentModelFailure } = await import('../runtime/agentModelPolicy');
    expect(describeAgentModelFailure(undefined, '로그인이 필요합니다')).toBe('로그인이 필요합니다');
  });

  it('모델과 무관해 보이는 실패는 단정하지 않는다', async () => {
    const { describeAgentModelFailure } = await import('../runtime/agentModelPolicy');
    const msg = describeAgentModelFailure('fable', '사용량 한도에 걸렸습니다');
    expect(msg).toContain('사용량 한도에 걸렸습니다');
    expect(msg).not.toMatch(/모델 이름이 틀렸/);
  });

  it('callAgent 가 이 안내를 쓴다', () => {
    const code = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8')
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    expect(code.filter((l) => l.includes('describeAgentModelFailure')).length).toBeGreaterThan(0);
  });
});
