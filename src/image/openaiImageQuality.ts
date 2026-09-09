/**
 * OpenAI 이미지 품질 파라미터 정규화.
 *
 * gpt-image-2.5(flare/sunburst, 2026-09)부터 quality 가 5단계(low/medium/high/xhigh/max)다.
 * 구 모델(gpt-image-1/1.5/2)에 xhigh/max 를 보내면 400 이라 high 로 내려 보낸다.
 * 'auto' 는 OpenAI 가 내부적으로 비싼 단계를 고르는 일이 있어(v2.7.36 실사고) 그대로 통과시키되
 * 비용 추적은 medium 으로 정규화한다 (generator 쪽 규칙 유지).
 */

export const OPENAI_IMAGE_QUALITIES_LEGACY = ['low', 'medium', 'high', 'auto'] as const;
export const OPENAI_IMAGE_QUALITIES_V25 = ['low', 'medium', 'high', 'xhigh', 'max', 'auto'] as const;

export type OpenAIImageQuality = (typeof OPENAI_IMAGE_QUALITIES_V25)[number];

/** gpt-image-2.5 계열(5단계 품질) 여부 */
export function isOpenAIImageModelV25(model: string | undefined | null): boolean {
    return String(model || '').trim().startsWith('gpt-image-2.5');
}

/**
 * 사용자 설정 품질을 모델이 받아주는 값으로 정규화.
 * - 미지정/미지원 값 → 'medium'
 * - 구 모델 + xhigh/max → 'high' (요청 실패 대신 가장 가까운 단계)
 */
export function resolveOpenAIImageQuality(model: string | undefined | null, userQuality: unknown): OpenAIImageQuality {
    const q = typeof userQuality === 'string' ? userQuality.trim() : '';
    if (isOpenAIImageModelV25(model)) {
        return (OPENAI_IMAGE_QUALITIES_V25 as readonly string[]).includes(q) ? (q as OpenAIImageQuality) : 'medium';
    }
    if (q === 'xhigh' || q === 'max') return 'high';
    return (OPENAI_IMAGE_QUALITIES_LEGACY as readonly string[]).includes(q) ? (q as OpenAIImageQuality) : 'medium';
}
