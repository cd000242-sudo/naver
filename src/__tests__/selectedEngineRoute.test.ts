import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

import { resolveSelectedEngineRoute } from '../main/ipc/paraphraseAnalysisHandlers';

/** [2026-09-03 사장님] "보정기가 선택한 API 키나 에이전트로 돌도록 해야죠 — 왜 OpenAI로 하드코딩" */
describe('보조 호출 경로 — 사용자가 고른 엔진 그대로', () => {
  const allKeys = { openaiApiKey: 'o', geminiApiKey: 'g', claudeApiKey: 'c', perplexityApiKey: 'p', geminiModel: 'gemini-3.5-flash', perplexityModel: 'sonar-pro' };

  it('고른 엔진의 키를 쓴다 — 다른 벤더 키가 있어도 건너가지 않는다', () => {
    expect(resolveSelectedEngineRoute('openai', allKeys)?.engine).toBe('gpt-4.1-mini');
    expect(resolveSelectedEngineRoute('gemini', allKeys)?.engine).toBe('gemini-3.5-flash');
    expect(resolveSelectedEngineRoute('claude', allKeys)?.engine).toBe('claude-haiku-4-5-20251001');
    expect(resolveSelectedEngineRoute('perplexity', allKeys)?.engine).toBe('sonar-pro');
    expect(resolveSelectedEngineRoute('gemini', { openaiApiKey: 'o' })).toBeNull();
    expect(resolveSelectedEngineRoute('openai', { geminiApiKey: 'g', claudeApiKey: 'c' })).toBeNull();
  });

  it('에이전트 엔진은 그 구독 CLI 로', () => {
    expect(resolveSelectedEngineRoute('agent-claude', {})?.engine).toBe('claude(구독)');
    expect(resolveSelectedEngineRoute('agent-codex', {})?.engine).toBe('codex(구독)');
    expect(resolveSelectedEngineRoute('agent-gemini', {})?.engine).toBe('gemini(구독)');
  });

  it('모르는 엔진·빈 값은 null — 호출 측이 건너뛴다', () => {
    expect(resolveSelectedEngineRoute('', allKeys)).toBeNull();
    expect(resolveSelectedEngineRoute('whatever', allKeys)).toBeNull();
  });
});

/**
 * [2026-09-04 라이브] 에이전트 모드에서 설계도가 매번 45초에 잘렸다. 라우트 라벨이 'claude(구독)' 이라
 * 'agent-' 로 시작하지 않는데 호출부가 라벨로 구독 여부를 재고 있었다. 플래그로 판별한다.
 */
describe('구독 라우트 표시', () => {
  it('에이전트 3종만 subscription=true, API 키 라우트는 아니다', () => {
    for (const g of ['agent-codex', 'agent-claude', 'agent-gemini']) {
      expect(resolveSelectedEngineRoute(g, {})?.subscription).toBe(true);
    }
    expect(resolveSelectedEngineRoute('openai', { openaiApiKey: 'o' })?.subscription).toBeUndefined();
    expect(resolveSelectedEngineRoute('gemini', { geminiApiKey: 'g' })?.subscription).toBeUndefined();
  });
});
