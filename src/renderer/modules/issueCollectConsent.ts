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

/**
 * [2026-11-03] The "관련 사진 찾기" engine stores its agreement (same notice text) in the main config. Honour it here so
 * the URL / issue collection paths do not ask a second time. Version 1 = the notice below; a newer notice raises it.
 */
const ISSUE_CONSENT_CONFIG_MIN_VERSION = 1;
async function issueConsentRecordedInConfig(): Promise<boolean> {
    try {
        const record = (await (window as any).api?.getConfig?.())?.imageCollectConsent;
        return !!record && typeof record.version === 'number' && record.version >= ISSUE_CONSENT_CONFIG_MIN_VERSION
            && typeof record.agreedAt === 'string' && record.agreedAt.length > 0;
    } catch {
        return false;
    }
}

function issueConsentBuildOverlay(): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.id = ISSUE_CONSENT_OVERLAY_ID;
    // Colors live in the theme classes (theme-naver-components.css section 2); only the stacking order stays inline.
    overlay.className = 'nv-scrim';
    overlay.style.zIndex = '100000';

    overlay.innerHTML = `
    <div class="nv-modal nv-modal--warn">
      <div class="nv-modal__title">⚠️ 이슈 이미지 수집 — 저작권 안내</div>
      <div class="nv-modal__text">
        이 기능은 웹에 공개된 이미지를 검색·수집합니다.<br>
        <b>워터마크가 없는 이미지라도 저작권이 있을 수 있으며,
        수집한 이미지의 사용에 대한 모든 법적 책임은 사용자 본인에게 있습니다.</b><br>
        본 기능은 사용자의 편의를 위한 도구일 뿐, 이미지 사용 권한을 부여하지 않습니다.
      </div>
      <label class="nv-check nv-check--top">
        <input type="checkbox" id="issue-consent-check">
        <span>위 내용을 확인했으며, 수집 이미지 사용에 대한 책임이 본인에게 있음에 동의합니다.</span>
      </label>
      <div class="nv-modal__actions">
        <button id="issue-consent-cancel" class="nv-btn">취소</button>
        <button id="issue-consent-agree" class="nv-btn nv-btn--primary" disabled>동의하고 시작</button>
      </div>
    </div>`;
    return overlay;
}

/**
 * Resolve true only after explicit agreement (checkbox + button).
 * Already-agreed users pass through instantly.
 */
export async function ensureIssueCopyrightConsent(): Promise<boolean> {
    if (hasIssueCopyrightConsent() || await issueConsentRecordedInConfig()) return true;
    if (document.getElementById(ISSUE_CONSENT_OVERLAY_ID)) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
        const overlay = issueConsentBuildOverlay();
        document.body.appendChild(overlay);

        const check = overlay.querySelector('#issue-consent-check') as HTMLInputElement;
        const agreeBtn = overlay.querySelector('#issue-consent-agree') as HTMLButtonElement;
        const cancelBtn = overlay.querySelector('#issue-consent-cancel') as HTMLButtonElement;

        check?.addEventListener('change', () => {
            agreeBtn.disabled = !check.checked;
        });
        agreeBtn?.addEventListener('click', () => {
            try { localStorage.setItem(ISSUE_CONSENT_STORAGE_KEY, 'agreed'); } catch { /* ignore */ }
            // [2026-11-03] Also record it in the main config so 관련 사진 찾기 / unattended flows do not ask again.
            try { void (window as any).api?.saveConfig?.({ imageCollectConsent: { version: ISSUE_CONSENT_CONFIG_MIN_VERSION, agreedAt: new Date().toISOString() } }); } catch { /* ignore */ }
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
        overlay.className = 'nv-scrim';
        overlay.style.zIndex = '100000';
        overlay.innerHTML = `
    <div class="nv-modal nv-modal--info">
      <div class="nv-modal__title">🖼️ 이미지 검사 방식</div>
      <div class="nv-modal__text">
        <b>무료</b>: 사진 캡션·출처 글자로 관련성만 판정합니다. 워터마크·자막·구도는 못 봅니다.<br>
        <b>AI 검사(유료)</b>: 고른 엔진과 같은 벤더의 최저가 비전 모델이 사진을 직접 봅니다.
        워터마크·자막·동명이인을 거릅니다. 한 편에 검토 100장 안팎 — API 사용량에 소액이 청구됩니다.
      </div>
      <label class="nv-check" style="margin-bottom: 1rem;">
        <input type="checkbox" id="issue-vision-remember">
        <span>이번 실행 동안 다시 묻지 않기</span>
      </label>
      <div class="nv-modal__actions">
        <button id="issue-vision-cancel" class="nv-btn">취소</button>
        <button id="issue-vision-paid" class="nv-btn">AI 검사 켜기 (유료)</button>
        <button id="issue-vision-free" class="nv-btn nv-btn--primary">무료로 수집</button>
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
