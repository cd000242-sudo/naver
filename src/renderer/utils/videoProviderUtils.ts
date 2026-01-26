/**
 * ✅ [2026-01-25 모듈화] Video Provider Utilities
 * - renderer.ts에서 분리됨
 * - 영상 제공자 선택, Veo 유틸리티
 */

export type VideoProvider = 'veo' | 'kenburns';

export function getCurrentVideoProvider(): VideoProvider {
    try {
        const sel = document.getElementById('video-provider-select') as HTMLSelectElement | null;
        const v = String(sel?.value || '').trim().toLowerCase();
        if (v === 'kenburns') return 'kenburns';
        if (v === 'veo') return 'veo';
    } catch {
        // ignore
    }
    try {
        const raw = String(window.localStorage?.getItem('videoProvider') || '').trim().toLowerCase();
        if (raw === 'kenburns') return 'kenburns';
        if (raw === 'veo') return 'veo';
    } catch {
        // ignore
    }
    return 'veo';
}

export function setCurrentVideoProvider(provider: VideoProvider): void {
    try {
        window.localStorage?.setItem('videoProvider', provider);
    } catch {
        // ignore
    }
    try {
        const sel = document.getElementById('video-provider-select') as HTMLSelectElement | null;
        if (sel) sel.value = provider;
    } catch {
        // ignore
    }
}

export function isVeoQuotaExceededMessage(message: string): boolean {
    const s = String(message || '').toLowerCase();
    if (!s) return false;
    if (s.includes('exceeded your current quota')) return true;
    if (s.includes('quota') && s.includes('billing')) return true;
    if (s.includes('ai.dev/usage')) return true;
    return false;
}

export function buildVeoQuotaUserMessage(lockMinutes?: number): string {
    if (lockMinutes && lockMinutes > 0) {
        return `Gemini/Veo 사용량 한도(쿼터) 초과로 영상 생성이 제한됩니다. (${lockMinutes}분 후 재시도)`;
    }
    return 'Gemini/Veo 사용량 한도(쿼터) 초과로 영상 생성이 거절되었습니다. 결제/쿼터를 확인 후 다시 시도하세요.';
}

export function isImageStylePromptForVeo(rawPrompt: string): boolean {
    const s = String(rawPrompt || '').toLowerCase().trim();
    if (!s) return false;
    const imageKeywords = [
        'photograph',
        'photorealistic',
        'photo realistic',
        'professional photography',
        'dslr',
        'camera',
        'lens',
        'bokeh',
        'depth of field',
        '4k',
        '8k',
        'resolution',
        'studio lighting',
        'hdr',
        'octane render',
        'unreal engine',
    ];
    if (imageKeywords.some((k) => s.includes(k))) return true;
    const commaCount = (s.match(/,/g) || []).length;
    const wordCount = s.split(/\s+/).filter(Boolean).length;
    if (commaCount >= 3 && wordCount <= 30) return true;
    return false;
}

export function extractEnglishishProductName(text: string): string {
    const s = String(text || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    const matches = s.match(/[A-Za-z][A-Za-z0-9][A-Za-z0-9 \-+._]{2,}/g);
    if (!matches || matches.length === 0) return '';
    const sorted = [...matches].map((m) => m.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
    return sorted[0] || '';
}

// 전역 노출 (하위 호환성)
(window as any).getCurrentVideoProvider = getCurrentVideoProvider;
(window as any).setCurrentVideoProvider = setCurrentVideoProvider;
(window as any).isVeoQuotaExceededMessage = isVeoQuotaExceededMessage;
(window as any).buildVeoQuotaUserMessage = buildVeoQuotaUserMessage;
(window as any).isImageStylePromptForVeo = isImageStylePromptForVeo;
(window as any).extractEnglishishProductName = extractEnglishishProductName;

console.log('[VideoProviderUtils] 📦 모듈 로드됨!');
