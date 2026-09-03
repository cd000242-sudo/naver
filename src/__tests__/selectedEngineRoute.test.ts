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
