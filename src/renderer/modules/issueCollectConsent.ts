// src/renderer/modules/issueCollectConsent.ts
// Copyright self-responsibility consent gate for the issue endgame collector.
// Blocking modal, shown once; agreement persists in localStorage.
// NOTE: inline bundle = single scope. Every top-level identifier here is
// prefixed with issueConsent* to avoid collisions (see memory: identifier clash).

const ISSUE_CONSENT_STORAGE_KEY = 'issueCollectCopyrightConsentV1';
const ISSUE_CONSENT_OVERLAY_ID = 'issue-consent-overlay';

export function hasIssueCopyrightConsent(): boolean {
    try {
        return localStorage.getItem(ISSUE_CONSENT_STORAGE_KEY) === 'agreed';
    } catch {
        return false;
    }
}

function issueConsentBuildOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.id = ISSUE_CONSENT_OVERLAY_ID;
    overlay.style.cssText = [
        'position: fixed', 'inset: 0', 'z-index: 100000',
        'background: rgba(0, 0, 0, 0.65)',
        'display: flex', 'align-items: center', 'justify-content: center',
    ].join(';');

    overlay.innerHTML = `
    <div style="max-width: 480px; width: 92%; background: var(--bg-card, #1e293b); border: 1px solid rgba(245, 158, 11, 0.5); border-radius: 14px; padding: 1.5rem; box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
      <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-strong, #f1f5f9); margin-bottom: 0.75rem;">
        ⚠️ 이슈 이미지 수집 — 저작권 안내
      </div>
      <div style="font-size: 0.85rem; line-height: 1.6; color: var(--text-muted, #94a3b8); margin-bottom: 1rem;">
        이 기능은 웹에 공개된 이미지를 검색·수집합니다.<br>
        <b style="color: var(--text-strong, #e2e8f0);">워터마크가 없는 이미지라도 저작권이 있을 수 있으며,
        수집한 이미지의 사용에 대한 모든 법적 책임은 사용자 본인에게 있습니다.</b><br>
        본 기능은 사용자의 편의를 위한 도구일 뿐, 이미지 사용 권한을 부여하지 않습니다.
      </div>
      <label style="display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.82rem; color: var(--text-strong, #e2e8f0); cursor: pointer; margin-bottom: 1rem;">
        <input type="checkbox" id="issue-consent-check" style="width: 16px; height: 16px; margin-top: 2px; accent-color: #f59e0b; flex-shrink: 0;">
        <span>위 내용을 확인했으며, 수집 이미지 사용에 대한 책임이 본인에게 있음에 동의합니다.</span>
      </label>
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
        <button id="issue-consent-cancel" style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid rgba(148,163,184,0.35); background: transparent; color: var(--text-muted, #94a3b8); cursor: pointer;">취소</button>
        <button id="issue-consent-agree" disabled style="padding: 0.5rem 1.25rem; border-radius: 8px; border: none; background: #f59e0b; color: #1c1917; font-weight: 700; cursor: pointer; opacity: 0.45;">동의하고 시작</button>
      </div>
    </div>`;
    return overlay;
}

/**
 * Resolve true only after explicit agreement (checkbox + button).
 * Already-agreed users pass through instantly.
 */
export function ensureIssueCopyrightConsent(): Promise<boolean> {
    if (hasIssueCopyrightConsent()) return Promise.resolve(true);
    if (document.getElementById(ISSUE_CONSENT_OVERLAY_ID)) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
        const overlay = issueConsentBuildOverlay();
        document.body.appendChild(overlay);

        const check = overlay.querySelector('#issue-consent-check') as HTMLInputElement;
        const agreeBtn = overlay.querySelector('#issue-consent-agree') as HTMLButtonElement;
        const cancelBtn = overlay.querySelector('#issue-consent-cancel') as HTMLButtonElement;

        check?.addEventListener('change', () => {
            agreeBtn.disabled = !check.checked;
            agreeBtn.style.opacity = check.checked ? '1' : '0.45';
        });
        agreeBtn?.addEventListener('click', () => {
            try { localStorage.setItem(ISSUE_CONSENT_STORAGE_KEY, 'agreed'); } catch { /* ignore */ }
            overlay.remove();
            resolve(true);
        });
        cancelBtn?.addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
    });
}

/*
 * [2026-09-17 사장님] "검사비용은 제일 싼 걸로 해주고 … 수집하는데 돈이 들면 생성하고 말지 누가 쓰니."
 *
 * 유료(API 키) 비전 검사는 기본 OFF 다. 수집을 시작할 때 무료(캡션 판정)와 유료(AI 검사, 같은 벤더 최저가
 * 모델) 중 고른다. 구독(에이전트) 엔진이면 검사도 구독으로 돌아 과금이 없으니 묻지 않는다.
 * 선택은 이번 실행 동안만 기억한다(체크 시) — 앱을 다시 켜면 다시 묻는다. 조용히 과금되는 일이 없게.
 */
const ISSUE_VISION_CHOICE_OVERLAY_ID = 'issue-vision-choice-overlay';
let issueVisionChoiceRemembered: { paid: boolean } | null = null;

async function issueVisionChoiceEngineIsSubscription(): Promise<boolean> {
    try {
        const api = (window as any).api;
        if (!api || typeof api.getConfig !== 'function') return false;
        const config = await api.getConfig();
        return String(config?.primaryGeminiTextModel || '').startsWith('agent-');
    } catch {
        return false;
    }
}

/**
 * Resolve { paid } after the user picks, or the remembered choice. null = cancelled.
 */
export async function ensureIssueVisionChoice(): Promise<{ paid: boolean } | null> {
    if (issueVisionChoiceRemembered) return issueVisionChoiceRemembered;
    if (await issueVisionChoiceEngineIsSubscription()) return { paid: false };
    if (document.getElementById(ISSUE_VISION_CHOICE_OVERLAY_ID)) return null;

    return new Promise<{ paid: boolean } | null>((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = ISSUE_VISION_CHOICE_OVERLAY_ID;
        overlay.style.cssText = [
            'position: fixed', 'inset: 0', 'z-index: 100000',
            'background: rgba(0, 0, 0, 0.65)',
            'display: flex', 'align-items: center', 'justify-content: center',
        ].join(';');
        overlay.innerHTML = `
    <div style="max-width: 480px; width: 92%; background: var(--bg-card, #1e293b); border: 1px solid rgba(59, 130, 246, 0.5); border-radius: 14px; padding: 1.5rem;">
      <div style="font-size: 1.05rem; font-weight: 700; color: var(--text-strong, #f1f5f9); margin-bottom: 0.75rem;">
        🖼️ 이미지 검사 방식
      </div>
      <div style="font-size: 0.85rem; line-height: 1.6; color: var(--text-muted, #94a3b8); margin-bottom: 1rem;">
        <b style="color: var(--text-strong, #e2e8f0);">무료</b>: 사진 캡션·출처 글자로 관련성만 판정합니다. 워터마크·자막·구도는 못 봅니다.<br>
        <b style="color: var(--text-strong, #e2e8f0);">AI 검사(유료)</b>: 고른 엔진과 같은 벤더의 최저가 비전 모델이 사진을 직접 봅니다.
        워터마크·자막·동명이인을 거릅니다. 한 편에 검토 100장 안팎 — API 사용량에 소액이 청구됩니다.
      </div>
      <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--text-strong, #e2e8f0); cursor: pointer; margin-bottom: 1rem;">
        <input type="checkbox" id="issue-vision-remember" style="width: 16px; height: 16px; accent-color: #3b82f6;">
        <span>이번 실행 동안 다시 묻지 않기</span>
      </label>
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap;">
        <button id="issue-vision-cancel" style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid rgba(148,163,184,0.35); background: transparent; color: var(--text-muted, #94a3b8); cursor: pointer;">취소</button>
        <button id="issue-vision-paid" style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid rgba(59,130,246,0.6); background: transparent; color: #93c5fd; cursor: pointer;">AI 검사 켜기 (유료)</button>
        <button id="issue-vision-free" style="padding: 0.5rem 1.25rem; border-radius: 8px; border: none; background: #3b82f6; color: white; font-weight: 700; cursor: pointer;">무료로 수집</button>
      </div>
    </div>`;
        document.body.appendChild(overlay);
        const remember = overlay.querySelector('#issue-vision-remember') as HTMLInputElement | null;
        const finish = (choice: { paid: boolean } | null) => {
            if (choice && remember?.checked) issueVisionChoiceRemembered = choice;
            overlay.remove();
            resolve(choice);
        };
        overlay.querySelector('#issue-vision-free')?.addEventListener('click', () => finish({ paid: false }));
        overlay.querySelector('#issue-vision-paid')?.addEventListener('click', () => finish({ paid: true }));
        overlay.querySelector('#issue-vision-cancel')?.addEventListener('click', () => finish(null));
    });
}
