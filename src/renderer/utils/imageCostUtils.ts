/**
 * ✅ [2026-01-25 모듈화] 이미지 비용/동의 유틸리티
 * - renderer.ts에서 분리됨
 * - 이미지 프로바이더 비용 관련 함수들
 */

/**
 * 비용 발생 위험이 있는 이미지 프로바이더인지 확인
 */
export function isCostRiskImageProvider(provider: string): boolean {
    const p = String(provider || '').trim();
    // ✅ [v2.10.335] 나노바나나 3종 모두 비용 발생 — nano-banana(plain) 누락 시 동의 모달 미출현 회귀
    return p === 'nano-banana' || p === 'nano-banana-2' || p === 'nano-banana-pro' || p === 'prodia' || p === 'stability' || p === 'falai' || p === 'leonardoai' || p === 'openai-image' || p === 'dall-e-3';
}

/**
 * 프로바이더의 한글 라벨 반환
 */
export function getCostRiskProviderLabel(provider: string): string {
    const p = String(provider || '').trim();
    if (p === 'pollinations') return 'Pollinations';
    if (p === 'nano-banana') return '나노바나나 (Gemini 2.5 Flash Image, ₩54/장)';
    if (p === 'nano-banana-2') return '나노바나나2 (Gemini 3.1 Flash Image, ₩97/장)';
    if (p === 'nano-banana-pro') return '나노바나나 프로 (Gemini 3 Pro Image, ₩185/장)';
    if (p === 'falai') return 'Fal.ai';
    if (p === 'prodia') return 'Prodia AI';
    if (p === 'stability') return 'Stability AI';
    if (p === 'leonardoai') return 'Leonardo AI';
    if (p === 'openai-image') return 'OpenAI 덕트테이프 (gpt-image-1.5 / 2 / 2.5)';
    if (p === 'dall-e-3') return 'OpenAI GPT 이미지 시리즈 (레거시 설정)';
    return p || 'AI 이미지';
}

/**
 * 오늘 날짜 키 반환 (YYYY-MM-DD)
 */
export function getTodayKey(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * OpenAI 이미지 모델·품질 조합의 장당 단가 (USD). 1024x1024 기준 공식 단가표.
 * apiUsageTracker.ts의 OPENAI_IMAGE_PRICING과 동일 값 — 렌더러는 main 모듈을
 * import할 수 없으므로 표시용 사본을 둔다 (가격 변경 시 두 곳 동시 갱신 필요).
 */
const OPENAI_IMAGE_PRICE_USD: Record<string, Record<string, number>> = {
    'gpt-image-1.5': { low: 0.009, medium: 0.034, high: 0.133 },
    'gpt-image-2': { low: 0.006, medium: 0.053, high: 0.211 },
    // gpt-image-2.5 (2026-09): 5단계. 라벨 의미가 바뀌어 2.5 high ≈ 구 gpt-image-2 medium, 2.5 max ≈ 구 high.
    'gpt-image-2.5-flare': { low: 0.0059, medium: 0.0132, high: 0.0527, xhigh: 0.0937, max: 0.2107 },
    'gpt-image-2.5-sunburst': { low: 0.0059, medium: 0.0132, high: 0.0527, xhigh: 0.0937, max: 0.2107 },
};

/** OpenAI 이미지 모델이 5단계 품질(xhigh/max)을 지원하는지 — gpt-image-2.5 계열만 */
export function isOpenAIImageModelFiveTier(model: string): boolean {
    return String(model || '').startsWith('gpt-image-2.5');
}

/** 모델이 지원하는 품질 목록 (UI 옵션 활성/비활성 판단용) */
export function getOpenAIImageQualities(model: string): string[] {
    return isOpenAIImageModelFiveTier(model)
        ? ['low', 'medium', 'high', 'xhigh', 'max']
        : ['low', 'medium', 'high'];
}

/** OpenAI 이미지 한 장당 예상 비용(원). 모델/품질 미지정 시 저비용 기본으로 폴백. */
export function getOpenAIImageCostKRW(model: string, quality: string, usdToKrwRate: number = 1400): number {
    const tier = OPENAI_IMAGE_PRICE_USD[model] || OPENAI_IMAGE_PRICE_USD['gpt-image-1.5'];
    // xhigh/max 는 2.5 전용 — 구 모델에 들어오면 high 로 취급 (생성기와 동일 규칙)
    const usd = tier[quality] ?? (quality === 'xhigh' || quality === 'max' ? tier.high : tier.medium);
    const rate = (typeof usdToKrwRate === 'number' && usdToKrwRate > 0) ? usdToKrwRate : 1400;
    return Math.round(usd * rate);
}

/**
 * "한 장당 약 ₩56원 (gpt-image-1.5 / Medium)" 형태의 표시 문자열.
 * imageCount > 1이면 "× N장 = ₩XXX" 총액을 덧붙인다.
 */
export function formatOpenAIImageCostLabel(
    model: string,
    quality: string,
    usdToKrwRate: number = 1400,
    imageCount: number = 1,
): string {
    const per = getOpenAIImageCostKRW(model, quality, usdToKrwRate);
    const qLabel = quality.charAt(0).toUpperCase() + quality.slice(1);
    const base = `한 장당 약 ₩${per.toLocaleString('ko-KR')}원 (${model} / ${qLabel})`;
    if (imageCount > 1) {
        const total = per * imageCount;
        return `${base} · ₩${per.toLocaleString('ko-KR')} × ${imageCount}장 = ₩${total.toLocaleString('ko-KR')}`;
    }
    return base;
}

// 전역 노출 (기존 코드와의 호환성)
(window as any).isCostRiskImageProvider = isCostRiskImageProvider;
(window as any).getCostRiskProviderLabel = getCostRiskProviderLabel;
(window as any).getTodayKey = getTodayKey;
(window as any).getOpenAIImageCostKRW = getOpenAIImageCostKRW;
(window as any).formatOpenAIImageCostLabel = formatOpenAIImageCostLabel;
(window as any).isOpenAIImageModelFiveTier = isOpenAIImageModelFiveTier;
(window as any).getOpenAIImageQualities = getOpenAIImageQualities;

console.log('[ImageCostUtils] 📦 모듈 로드됨!');
