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
    return p === 'nano-banana-2' || p === 'nano-banana-pro' || p === 'prodia' || p === 'stability' || p === 'falai' || p === 'leonardoai' || p === 'openai-image' || p === 'dall-e-3';
}

/**
 * 프로바이더의 한글 라벨 반환
 */
export function getCostRiskProviderLabel(provider: string): string {
    const p = String(provider || '').trim();
    if (p === 'pollinations') return 'Pollinations';
    if (p === 'nano-banana-2') return '나노바나나2 (₩97/장)';
    if (p === 'nano-banana-pro') return '나노바나나프로 (~₩500/장)';
    if (p === 'falai') return 'Fal.ai';
    if (p === 'prodia') return 'Prodia AI';
    if (p === 'stability') return 'Stability AI';
    if (p === 'leonardoai') return 'Leonardo AI';
    if (p === 'openai-image') return 'OpenAI 덕트테이프 (gpt-image-2)';
    if (p === 'dall-e-3') return 'DALL-E 3 (OpenAI)';
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

// 전역 노출 (기존 코드와의 호환성)
(window as any).isCostRiskImageProvider = isCostRiskImageProvider;
(window as any).getCostRiskProviderLabel = getCostRiskProviderLabel;
(window as any).getTodayKey = getTodayKey;

console.log('[ImageCostUtils] 📦 모듈 로드됨!');
