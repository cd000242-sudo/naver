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
