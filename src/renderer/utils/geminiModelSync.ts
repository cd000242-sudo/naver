/**
 * ✅ [2026-01-25 모듈화] Gemini 모델 동기화 모듈
 * - renderer.ts에서 분리됨
 * - 통합 설정과 세부 설정 간 Gemini 모델 선택 동기화
 */

/**
 * Gemini 모델 선택 동기화 초기화
 * unified-gemini-model과 gemini-model-select 셀렉트박스 간 동기화
 */
export function initGeminiModelSync(): void {
    if ((window as any).__geminiModelSyncInitialized) return;
    (window as any).__geminiModelSyncInitialized = true;

    const unifiedSel = document.getElementById('unified-gemini-model') as HTMLSelectElement | null;
    const settingsSel = document.getElementById('gemini-model-select') as HTMLSelectElement | null;
    if (!unifiedSel && !settingsSel) return;

    let applying = false;
    const applyValue = (value: string) => {
        if (applying) return;
        applying = true;
        try {
            // ✅ Gemini 3 Flash를 기본값으로 원복
            const v = String(value || '').trim() || 'gemini-3-flash-preview';
            if (unifiedSel && unifiedSel.value !== v) unifiedSel.value = v;
            if (settingsSel && settingsSel.value !== v) settingsSel.value = v;
        } finally {
            applying = false;
        }
    };

    (async () => {
        try {
            const cfg = await window.api.getConfig();
            applyValue((cfg as any)?.geminiModel || 'gemini-3-flash-preview');
        } catch {
            applyValue('gemini-3-flash-preview');
        }
    })();

    const persist = async (value: string) => {
        try {
            const cfg = await window.api.getConfig();
            await window.api.saveConfig({
                ...(cfg || {}),
                geminiModel: String(value || '').trim() || 'gemini-3-flash-preview',
            });
        } catch (err) {
            console.error('[GeminiModelSync] saveConfig failed:', err);
        }
    };

    unifiedSel?.addEventListener('change', async () => {
        const v = String(unifiedSel.value || '').trim() || 'gemini-3-flash-preview';
        applyValue(v);
        await persist(v);
    });

    settingsSel?.addEventListener('change', async () => {
        const v = String(settingsSel.value || '').trim() || 'gemini-3-flash-preview';
        applyValue(v);
        await persist(v);
    });
}

console.log('[GeminiModelSync] 📦 모듈 로드됨!');
