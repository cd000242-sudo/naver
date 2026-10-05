import { bridgeCall, type BridgeCallResult } from './bridge';

/**
 * LEWORD 비서(2026-10-01) — 이 PC 앱 브리지로 사용자 본인 구독 AI 에 묻는다(운영자 키 없음).
 * 대화와 화면 자료만 보낸다. 규칙 · 설명서는 앱이 붙인다(임의 프롬프트 통로가 아니다).
 */
export interface AssistantTurn { role: 'user' | 'assistant'; content: string }
export interface AssistantReply { answer: string; escalate: boolean; provider: string; tools?: string[] }

/** 앱 쪽 상한과 같다 — 넘치면 앱이 자르지만 보내기 전에 줄여 둔다. */
const MAX_TURNS = 10;
const MAX_FACTS = 3000;

export async function askAssistant(turns: AssistantTurn[], page: string, facts: string): Promise<BridgeCallResult<AssistantReply>> {
    return bridgeCall<AssistantReply>('/v1/bridge/my-blog/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns: turns.slice(-MAX_TURNS), page, facts: facts.slice(0, MAX_FACTS) }),
    // 2026-10-06: 비서가 앱에서 검색량 · 자리를 재며 답한다(앱 상한 240초) — 그보다 조금 길게 기다린다.
    }, 250_000);
}

/** 운영자 1:1 문의(카카오톡) — 사이트 오른쪽 아래 버튼과 같은 주소. */
export const OPERATOR_INQUIRY_URL = 'https://open.kakao.com/o/sPcaslwh';
