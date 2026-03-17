/**
 * ✅ [2026-01-25 모듈화] 프롬프트 편집 모달
 * - renderer.ts에서 분리됨
 * - 영어 프롬프트 수정 모달 및 관련 유틸리티
 */

import { escapeHtml } from '../utils/htmlUtils.js';

// 전역 toastManager 참조
const toastManager = (window as any).toastManager || {
    warning: (msg: string) => console.warn(msg),
    success: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(msg),
};

// 전역 함수 참조를 위한 타입 선언
declare function generateEnglishPromptForHeadingSync(heading: string): string;
declare function getManualEnglishPromptOverrideForHeading(heading: string): string | null;
declare function setManualEnglishPromptOverrideForHeading(heading: string, prompt: string): void;
declare function clearManualEnglishPromptOverrideForHeading(heading: string): void;

/**
 * 영어 프롬프트 수정 모달 표시
 */
export async function showHeadingPromptEditModal(headingIndex: number): Promise<void> {
    try {
        const idx = Number.isFinite(headingIndex) ? headingIndex : 0;
        const headingTitle =
            (window as any)._headingTitles?.[idx] ||
            // ✅ [2026-03-16 FIX] data-heading-title 우선 사용 (배지 오염 방지)
            (document.querySelector(`.prompt-item[data-index="${idx + 1}"]`) as HTMLElement | null)?.getAttribute('data-heading-title')?.trim() ||
            (document.querySelector(`.prompt-item[data-index="${idx + 1}"] .heading-title-pure`) as HTMLElement | null)?.textContent?.trim() ||
            (document.querySelector(`.prompt-item[data-index="${idx + 1}"] .heading-title-text`) as HTMLElement | null)?.textContent?.trim() ||
            `소제목 ${idx + 1}`;
        const title = String(headingTitle || '').trim();

        const currentPrompt = (() => {
            const override = getManualEnglishPromptOverrideForHeading(title);
            if (override) return override;
            try {
                const hp = (window as any)._headingPrompts || [];
                const v = String(hp[idx] || '').trim();
                if (v) return v;
            } catch (e) {
                console.warn('[PromptEditModal] catch ignored:', e);
            }
            return generateEnglishPromptForHeadingSync(title);
        })();

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed; inset:0; z-index: 999999; background: rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center; padding: 1rem;';

        const modal = document.createElement('div');
        modal.style.cssText = 'width: min(920px, 95vw); max-height: 85vh; overflow:auto; background: var(--bg-primary); border: 1px solid var(--border-light); border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); padding: 1rem;';
        modal.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap: 0.75rem; margin-bottom: 0.75rem;">
        <div style="font-weight: 800; font-size: 1rem; color: var(--text-strong);">영어 프롬프트 수정</div>
        <button type="button" class="close-prompt-edit-modal" style="border:none; background: rgba(0,0,0,0.06); color: var(--text-strong); border-radius: 10px; padding: 0.5rem 0.75rem; cursor:pointer;">닫기</button>
      </div>
      <div style="margin-bottom: 0.5rem; color: var(--text-muted); font-size: 0.85rem;">소제목: <span style="color: var(--text-strong); font-weight: 700;">${escapeHtml(title)}</span></div>
      <textarea class="prompt-edit-textarea" style="width: 100%; min-height: 180px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; font-size: 0.9rem; line-height: 1.5; padding: 0.75rem; border-radius: 10px; border: 1px solid var(--border-light); background: var(--bg-secondary); color: var(--text-strong);"></textarea>
      <div style="display:flex; gap: 0.5rem; justify-content:flex-end; margin-top: 0.75rem; flex-wrap: wrap;">
        <button type="button" class="reset-prompt-edit-modal" style="padding: 0.6rem 0.9rem; border-radius: 10px; border: 1px solid rgba(239,68,68,0.35); background: rgba(239,68,68,0.12); color: var(--text-strong); cursor:pointer; font-weight: 700;">자동값으로 초기화</button>
        <button type="button" class="save-prompt-edit-modal" style="padding: 0.6rem 0.9rem; border-radius: 10px; border: 1px solid rgba(59,130,246,0.45); background: rgba(59,130,246,0.2); color: var(--text-strong); cursor:pointer; font-weight: 800;">저장</button>
      </div>
    `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const textarea = modal.querySelector('.prompt-edit-textarea') as HTMLTextAreaElement | null;
        if (textarea) textarea.value = String(currentPrompt || '');

        const close = () => {
            try {
                overlay.remove();
            } catch (e) {
                console.warn('[PromptEditModal] catch ignored:', e);
            }
        };

        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) close();
        });

        const closeBtn = modal.querySelector('.close-prompt-edit-modal') as HTMLButtonElement | null;
        if (closeBtn) closeBtn.addEventListener('click', close);

        const resetBtn = modal.querySelector('.reset-prompt-edit-modal') as HTMLButtonElement | null;
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                clearManualEnglishPromptOverrideForHeading(title);
                const autoPrompt = generateEnglishPromptForHeadingSync(title);
                if (textarea) textarea.value = autoPrompt;
            });
        }

        const saveBtn = modal.querySelector('.save-prompt-edit-modal') as HTMLButtonElement | null;
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const v = String(textarea?.value || '').trim();
                if (!v) {
                    toastManager.warning('프롬프트가 비어있습니다.');
                    return;
                }
                setManualEnglishPromptOverrideForHeading(title, v);
                try {
                    const hp = (window as any)._headingPrompts || [];
                    hp[idx] = v;
                    (window as any)._headingPrompts = hp;
                } catch (e) {
                    console.warn('[PromptEditModal] catch ignored:', e);
                }
                const promptEl = document.querySelector(`.prompt-item[data-index="${idx + 1}"] .prompt-text`) as HTMLElement | null;
                if (promptEl) {
                    promptEl.textContent = v;
                }
                toastManager.success('영어 프롬프트를 저장했습니다.');
                close();
            });
        }

        textarea?.focus();
    } catch (error) {
        console.error('[PromptEdit] failed:', error);
        toastManager.error(`프롬프트 편집창을 열 수 없습니다: ${(error as Error).message}`);
    }
}

// 전역 노출 (하위 호환성)
(window as any).showHeadingPromptEditModal = showHeadingPromptEditModal;

console.log('[PromptEditModal] 📦 모듈 로드됨!');
