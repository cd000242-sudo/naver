/**
 * openaiImageGuard — OpenAI 이미지 엔진 사전 차단 가드
 *
 * 정책:
 *   - dall-e-3: 2026-05-12 OpenAI 폐기 → 5/12 이후 호출 차단, 5/12 이전은 1회성 D-Day 안내
 *   - openai-image (덕트테이프, gpt-image-2): OpenAI Org Verification 필요 →
 *     첫 사용 시 인증 가이드 모달, 사용자가 '인증 완료' 확인하면 이후 스킵
 *
 * 사용자 원칙: 폴백 금지. 사용자가 선택한 엔진이 사용 불가하면 발행 전체를 중단하고
 * 사용자가 직접 다른 엔진을 선택하게 함. silent 전환 절대 금지.
 */

// ✅ [v2.10.16] DALL-E 3 옵션 제거 — D-Day 상수/함수 미사용
const OPENAI_IMAGE_VERIFY_ACK_KEY = 'openai_image_verification_acknowledged_v1';
const IMAGEFX_PROBE_OK_KEY = 'imagefx_generation_probe_ok_v1';
const IMAGEFX_PROBE_TTL_MS = 2 * 60 * 60 * 1000;

export interface GuardResult {
    block: boolean;
    reason?: string;
}

function escapeGuardHtml(value: string): string {
    return String(value || '').replace(/[<>&"']/g, (ch) => {
        switch (ch) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '"': return '&quot;';
            case "'": return '&#39;';
            default: return ch;
        }
    });
}

function hasFreshImageFxProbe(): boolean {
    try {
        const raw = localStorage.getItem(IMAGEFX_PROBE_OK_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed?.ok === true && Date.now() - Number(parsed.checkedAt || 0) < IMAGEFX_PROBE_TTL_MS;
    } catch {
        return false;
    }
}

function saveFreshImageFxProbe(message: string): void {
    try {
        localStorage.setItem(IMAGEFX_PROBE_OK_KEY, JSON.stringify({
            ok: true,
            checkedAt: Date.now(),
            message,
        }));
    } catch {
        // ignore storage errors
    }
}

function showModal(opts: {
    icon: string;
    title: string;
    bodyHtml: string;
    primary: { label: string; danger?: boolean };
    secondary?: { label: string };
    extraButton?: { label: string; href?: string };
}): Promise<'primary' | 'secondary' | 'extra'> {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.65);
            display: flex; align-items: center; justify-content: center;
            z-index: 99999; backdrop-filter: blur(4px);
        `;
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #1a1a2e; color: #e0e0e0;
            border: 1px solid #4a4a6a; border-radius: 12px;
            max-width: 560px; width: 92%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6);
            font-family: -apple-system, 'Segoe UI', system-ui, sans-serif;
        `;
        const safeBtnLabel = (s: string) => s.replace(/[<>&"']/g, '');
        modal.innerHTML = `
            <div style="padding: 1.5rem 1.75rem 0.75rem;">
                <div style="font-size: 2rem; line-height: 1;">${opts.icon}</div>
                <h2 style="margin: 0.6rem 0 0.4rem; font-size: 1.25rem; font-weight: 700;">${opts.title.replace(/[<>]/g, '')}</h2>
            </div>
            <div style="padding: 0 1.75rem 1.25rem; font-size: 0.95rem; line-height: 1.6;">
                ${opts.bodyHtml}
            </div>
            <div style="display: flex; gap: 0.5rem; padding: 1rem 1.5rem 1.25rem; justify-content: flex-end; border-top: 1px solid #2a2a44;">
                ${opts.extraButton ? `<button id="__guard_extra" style="padding: 0.55rem 1rem; background: transparent; color: #8b9dc3; border: 1px solid #4a4a6a; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">${safeBtnLabel(opts.extraButton.label)}</button>` : ''}
                ${opts.secondary ? `<button id="__guard_secondary" style="padding: 0.55rem 1rem; background: transparent; color: #aaa; border: 1px solid #4a4a6a; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">${safeBtnLabel(opts.secondary.label)}</button>` : ''}
                <button id="__guard_primary" style="padding: 0.55rem 1.25rem; background: ${opts.primary.danger ? '#dc3545' : '#5b8def'}; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 0.9rem;">${safeBtnLabel(opts.primary.label)}</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = (result: 'primary' | 'secondary' | 'extra') => {
            try { document.body.removeChild(overlay); } catch { /* ignore */ }
            resolve(result);
        };
        modal.querySelector('#__guard_primary')?.addEventListener('click', () => close('primary'));
        modal.querySelector('#__guard_secondary')?.addEventListener('click', () => close('secondary'));
        modal.querySelector('#__guard_extra')?.addEventListener('click', () => {
            if (opts.extraButton?.href) {
                try { (window as any).api?.openExternalUrl?.(opts.extraButton.href) || window.open(opts.extraButton.href, '_blank'); }
                catch { /* ignore */ }
            }
            close('extra');
        });
    });
}

/**
 * dall-e-3 D-Day 가드.
 *   - 5/12 이후: 차단 (block=true)
 *   - 5/12 이전: 1회성 안내 (block=false, 사용자 진행 가능)
 */
export async function checkDallE3Deadline(imageSource: string): Promise<GuardResult> {
    if (imageSource !== 'dall-e-3') return { block: false };

    // ✅ [v2.10.16] DALL-E 3 즉시 제거 — 5/12 D-Day 무관, 사용자 요청 즉시 차단
    //   배경: OpenAI가 5/12 폐기 예정. 사용자가 미리 정리 요청 → UI 옵션 제거 + 가드 즉시 발효.
    //   saved settings에 dall-e-3이 남아있는 사용자 환경 보호 — 차단 모달 + 대안 안내.
    await showModal({
        icon: '🛑',
        title: '기존 OpenAI 이미지 옵션 전환 필요',
        bodyHtml: `
            <p style="margin: 0 0 0.75rem;">기존 OpenAI 이미지 설정은 현재 <strong>GPT 이미지 시리즈</strong>로 전환해서 사용해야 합니다.</p>
            <p style="margin: 0 0 0.75rem; color: #f8b400;">⚠️ 다른 이미지 엔진을 선택해주세요.</p>
            <ul style="margin: 0.5rem 0 0; padding-left: 1.2rem; color: #b8b8d4; font-size: 0.88rem;">
                <li><strong>덕트테이프(gpt-image-2)</strong> — OpenAI Org 인증 필요, 한글 최강</li>
                <li><strong>나노바나나 프로</strong> — Gemini API, 한글 강</li>
                <li><strong>Flow</strong> — Google AI Pro 무료 쿼터</li>
                <li><strong>DeepInfra FLUX-2</strong> — 가성비 ($0.01/장)</li>
                <li><strong>Leonardo AI</strong> — 일러스트 강</li>
                <li><strong>ImageFX</strong> — Google Labs 실험적 무료, 계정/IP 접근 제한 가능</li>
            </ul>
            <p style="margin: 0.75rem 0 0; color: #b8b8d4; font-size: 0.8rem;">참고: 5/12 이후 OpenAI 이미지 라인은 덕트테이프(gpt-image-2)만 남습니다.</p>
        `,
        primary: { label: '확인 (다른 엔진 선택)', danger: true },
    });
    return { block: true, reason: '레거시 OpenAI 이미지 옵션 전환 필요' };
}

/**
 * 덕트테이프(gpt-image-2) Org Verification 가이드.
 *   - 첫 선택 시 인증 가이드 모달
 *   - 사용자가 '인증 완료' 클릭하면 이후 스킵
 *   - '아직 인증 안 함' 선택 시 차단 (폴백 금지)
 */
export async function checkOpenAIVerification(imageSource: string): Promise<GuardResult> {
    if (imageSource !== 'openai-image') return { block: false };
    if (localStorage.getItem(OPENAI_IMAGE_VERIFY_ACK_KEY) === '1') return { block: false };

    const choice = await showModal({
        icon: '🦆',
        title: '덕트테이프(gpt-image-2) — Org 인증 필수',
        bodyHtml: `
            <p style="margin: 0 0 0.75rem;">OpenAI <strong>gpt-image-2</strong> 모델은 <strong>Organization Verification</strong>이 완료된 계정만 호출 가능합니다.</p>
            <p style="margin: 0 0 0.5rem; font-weight: 600; color: #f8b400;">인증 절차</p>
            <ol style="margin: 0 0 0.75rem; padding-left: 1.2rem; color: #b8b8d4; font-size: 0.88rem; line-height: 1.7;">
                <li>OpenAI Platform 로그인 → Settings → Organization → General</li>
                <li>"Verify Organization" 클릭 → 신분증 + 결제수단 + 사용 사례 제출</li>
                <li>심사 1~수일 (영업일 기준)</li>
                <li>승인 메일 수신 후 gpt-image-2 호출 가능</li>
            </ol>
            <p style="margin: 0; color: #ff6b6b; font-size: 0.85rem;">⚠️ 인증 안 된 상태로 호출하면 OpenAI 측에서 403 에러 반환 → 발행 실패</p>
        `,
        primary: { label: '인증 완료 — 진행' },
        secondary: { label: '아직 안 함 — 중단' },
        extraButton: { label: '인증 페이지 열기', href: 'https://platform.openai.com/settings/organization/general' },
    });

    if (choice === 'primary') {
        try { localStorage.setItem(OPENAI_IMAGE_VERIFY_ACK_KEY, '1'); } catch { /* ignore */ }
        return { block: false };
    }
    return { block: true, reason: 'OpenAI Org Verification 미완료 — 사용자가 발행 중단 선택' };
}

export async function checkImageFxGenerationReady(imageSource: string): Promise<GuardResult> {
    if (imageSource !== 'imagefx') return { block: false };
    if (hasFreshImageFxProbe()) return { block: false };

    try {
        (window as any).toastManager?.info?.('ImageFX 실제 생성 테스트 중입니다. 테스트 이미지 1장을 생성해 접근 권한을 확인합니다.');
    } catch {
        // ignore toast errors
    }

    try {
        const result = await (window as any).api?.testImageFxConnection?.();
        if (result?.ok) {
            saveFreshImageFxProbe(result.message || 'ImageFX probe ok');
            try { (window as any).toastManager?.success?.('ImageFX 실제 생성 테스트 통과'); } catch { /* ignore */ }
            return { block: false };
        }

        const message = String(result?.message || 'ImageFX 실제 생성 테스트가 실패했습니다.');
        await showModal({
            icon: '⛔',
            title: 'ImageFX 실제 생성 테스트 실패',
            bodyHtml: `
                <p style="margin: 0 0 0.75rem;">로그인 확인만으로는 부족해서, 발행 전에 ImageFX 테스트 이미지 1장을 실제 생성해봤습니다.</p>
                <p style="margin: 0 0 0.75rem; color: #ffb4b4; font-weight: 700;">${escapeGuardHtml(message)}</p>
                <p style="margin: 0; color: #b8b8d4; font-size: 0.88rem;">현재 계정/IP/지역 조합에서는 대량 발행 중 실패할 가능성이 높습니다. Flow, 리더스 나노바나나프로, OpenAI Image, DeepInfra처럼 실제 테스트가 통과한 엔진으로 바꾼 뒤 다시 시작해주세요.</p>
            `,
            primary: { label: '다른 엔진 선택 후 다시 시작', danger: true },
        });
        return { block: true, reason: 'ImageFX 실제 생성 테스트 실패' };
    } catch (error) {
        const message = (error as Error)?.message || '알 수 없는 ImageFX 테스트 오류';
        await showModal({
            icon: '⛔',
            title: 'ImageFX 실제 생성 테스트 오류',
            bodyHtml: `
                <p style="margin: 0 0 0.75rem;">발행 전에 ImageFX 생성 접근성을 확인하는 중 오류가 발생했습니다.</p>
                <p style="margin: 0; color: #ffb4b4; font-weight: 700;">${escapeGuardHtml(message)}</p>
            `,
            primary: { label: '발행 중단', danger: true },
        });
        return { block: true, reason: 'ImageFX 실제 생성 테스트 오류' };
    }
}

/**
 * 풀오토/연속/다계정 발행 직전 통합 가드.
 * 차단 시 toastManager로 알리고 false 반환 → 호출자가 발행 중단.
 */
export async function runOpenAIImageGuard(imageSource: string): Promise<boolean> {
    const dalle = await checkDallE3Deadline(imageSource);
    if (dalle.block) {
        try { (window as any).toastManager?.error?.(`발행 중단: ${dalle.reason}`); } catch { /* ignore */ }
        return false;
    }
    const verify = await checkOpenAIVerification(imageSource);
    if (verify.block) {
        try { (window as any).toastManager?.error?.(`발행 중단: ${verify.reason}`); } catch { /* ignore */ }
        return false;
    }
    const imageFx = await checkImageFxGenerationReady(imageSource);
    if (imageFx.block) {
        try { (window as any).toastManager?.error?.(`발행 중단: ${imageFx.reason}`); } catch { /* ignore */ }
        return false;
    }
    return true;
}
