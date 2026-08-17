/**
 * answerEngine.ts — 도우미 답변을 "사용자가 고른 엔진"으로 낸다.
 *
 * [2026-08-18 사용자 지적] "제미나이를 왜 쓰니, 돈 들잖아."
 * 기존 도우미는 Gemini API 키로만 답해서, 이미 Claude/ChatGPT 구독을 쓰는 사용자도
 * 채팅할 때마다 API 요금이 나갔다. 글 생성 엔진으로 구독(에이전트 모드)을 고른
 * 사용자는 도우미 답변도 그 구독으로 처리한다 — 추가 요금 0원이고, 모델이 더 좋아
 * 답변 품질도 올라간다.
 *
 * 우선순위: 선택 엔진(구독 CLI) → Gemini API 키 → 실패 안내.
 * 자동 폴백 금지 원칙(feedback_no_fallback)에 맞춰, 구독이 실패하면 조용히 과금
 * 경로로 넘어가지 않고 실패 사유를 남긴다. Gemini 폴백은 "키가 이미 있는 경우"에만
 * 쓰며 로그로 명시한다.
 */

import { loadConfig } from '../configManager.js';
import { isAgentTextProvider } from '../runtime/modelRegistry.js';

const LOG = '[AnswerEngine]';
/** 채팅 답변은 대기 체감이 크므로 글 생성보다 짧게 끊는다. */
const AGENT_ANSWER_TIMEOUT_MS = 90_000;

export type AnswerEngineKind = 'agent-claude' | 'agent-codex' | 'agent-gemini' | 'gemini-api' | 'none';

export interface AnswerEngineSelection {
  kind: AnswerEngineKind;
  /** UI/로그 표기용 이름 */
  label: string;
}

/** 설정의 글 생성 엔진을 그대로 따른다 (별도 도우미 엔진 설정을 만들지 않는다). */
export async function resolveAnswerEngine(): Promise<AnswerEngineSelection> {
  try {
    const config = await loadConfig();
    const textEngine = String((config as any).primaryGeminiTextModel || '').trim();
    if (isAgentTextProvider(textEngine)) {
      const label = textEngine === 'agent-claude'
        ? 'Claude 구독'
        : textEngine === 'agent-codex'
          ? 'ChatGPT 구독'
          : 'Google 구독';
      return { kind: textEngine as AnswerEngineKind, label };
    }
    const hasGeminiKey = !!String((config as any).geminiApiKey || '').trim();
    return hasGeminiKey
      ? { kind: 'gemini-api', label: 'Gemini API' }
      : { kind: 'none', label: '없음' };
  } catch (error) {
    console.warn(`${LOG} 설정 로드 실패: ${(error as Error).message}`);
    return { kind: 'none', label: '없음' };
  }
}

/**
 * 구독 CLI로 답변 생성. 실패 시 null (호출자가 Gemini 폴백 여부를 결정).
 * 프롬프트는 Gemini 경로와 동일한 것을 쓴다 — 엔진만 바뀌고 근거·규칙은 같다.
 */
export async function answerWithAgentCli(
  kind: AnswerEngineKind,
  prompt: string,
): Promise<string | null> {
  try {
    if (kind === 'agent-claude') {
      const { runClaude } = await import('../agentCli/claudeRunner.js');
      return (await runClaude(prompt, { timeoutMs: AGENT_ANSWER_TIMEOUT_MS })).trim() || null;
    }
    if (kind === 'agent-codex') {
      const { runCodex } = await import('../agentCli/codexRunner.js');
      return (await runCodex(prompt, { timeoutMs: AGENT_ANSWER_TIMEOUT_MS })).trim() || null;
    }
    if (kind === 'agent-gemini') {
      const { runGemini } = await import('../agentCli/geminiRunner.js');
      return (await runGemini(prompt, { timeoutMs: AGENT_ANSWER_TIMEOUT_MS })).trim() || null;
    }
    return null;
  } catch (error) {
    console.warn(`${LOG} ${kind} 답변 실패: ${(error as Error).message}`);
    return null;
  }
}
