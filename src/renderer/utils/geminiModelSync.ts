/**
 * ✅ [2026-01-25 모듈화] Gemini 모델 동기화 모듈
 * - renderer.ts에서 분리됨
 * - 통합 설정과 세부 설정 간 Gemini 모델 선택 동기화
 */

/**
 * Gemini 모델 선택 동기화 초기화
 * unified-gemini-model과 settings-gemini-model 셀렉트박스 간 동기화
 */
export function initGeminiModelSync(): void {
    if ((window as any).__geminiModelSyncInitialized) return;
    (window as any).__geminiModelSyncInitialized = true;

    const unifiedSel = document.getElementById('unified-gemini-model') as HTMLSelectElement | null;
    const settingsSel = document.getElementById('settings-gemini-model') as HTMLSelectElement | null;
    if (!unifiedSel && !settingsSel) return;

    let applying = false;
    const applyValue = (value: string) => {
        if (applying) return;
        applying = true;
        try {
            // ✅ [2026-02-27] Gemini 2.5 Flash를 기본값으로 설정
            const v = String(value || '').trim() || 'gemini-2.5-flash';
            if (unifiedSel && unifiedSel.value !== v) unifiedSel.value = v;
            if (settingsSel && settingsSel.value !== v) settingsSel.value = v;
        } finally {
            applying = false;
        }
    };

    (async () => {
        try {
            const cfg = await window.api.getConfig();
            applyValue((cfg as any)?.geminiModel || 'gemini-2.5-flash');
        } catch {
            applyValue('gemini-2.5-flash');
        }
    })();

    const persist = async (value: string) => {
        try {
            const cfg = await window.api.getConfig();
            await window.api.saveConfig({
                ...(cfg || {}),
                geminiModel: String(value || '').trim() || 'gemini-2.5-flash',
            });
        } catch (err) {
            console.error('[GeminiModelSync] saveConfig failed:', err);
        }
    };

    unifiedSel?.addEventListener('change', async () => {
        const v = String(unifiedSel.value || '').trim() || 'gemini-2.5-flash';
        applyValue(v);
        await persist(v);
    });

    settingsSel?.addEventListener('change', async () => {
        const v = String(settingsSel.value || '').trim() || 'gemini-2.5-flash';
        applyValue(v);
        await persist(v);
    });
}

console.log('[GeminiModelSync] 📦 모듈 로드됨!');
