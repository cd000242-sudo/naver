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

const DALLE3_DEADLINE_ISO = '2026-05-12T00:00:00Z';
const DALLE3_NOTICE_KEY = 'openai_dalle3_deadline_notified_v1';
const OPENAI_IMAGE_VERIFY_ACK_KEY = 'openai_image_verification_acknowledged_v1';

export interface GuardResult {
    block: boolean;
    reason?: string;
}

function isAfterDeadline(): boolean {
    return Date.now() >= Date.parse(DALLE3_DEADLINE_ISO);
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
                try { (window as any).api?.openExternal?.(opts.extraButton.href) || window.open(opts.extraButton.href, '_blank'); }
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

    if (isAfterDeadline()) {
        await showModal({
            icon: '🛑',
            title: 'DALL-E 3 API 폐기됨',
            bodyHtml: `
                <p style="margin: 0 0 0.75rem;">OpenAI가 <strong>2026년 5월 12일</strong>부로 DALL-E 3 API를 폐기했습니다.</p>
                <p style="margin: 0 0 0.75rem; color: #f8b400;">⚠️ 발행을 진행할 수 없습니다. 다른 이미지 엔진을 선택해주세요.</p>
                <ul style="margin: 0.5rem 0 0; padding-left: 1.2rem; color: #b8b8d4; font-size: 0.88rem;">
                    <li><strong>덕트테이프(gpt-image-2)</strong> — OpenAI Org 인증 필요, 한글 최강</li>
                    <li><strong>나노바나나 프로</strong> — Gemini API, 한글 강</li>
                    <li><strong>Flow</strong> — Google AI Pro 무료 쿼터</li>
                    <li><strong>DeepInfra FLUX-2</strong> — 가성비 ($0.01/장)</li>
                    <li><strong>Leonardo AI</strong> — 일러스트 강</li>
                </ul>
            `,
            primary: { label: '확인 (발행 중단)', danger: true },
        });
        return { block: true, reason: 'dall-e-3 API 폐기 (2026-05-12)' };
    }

    // 5/12 이전 — 1회성 D-Day 안내
    if (localStorage.getItem(DALLE3_NOTICE_KEY) !== '1') {
        const daysLeft = Math.max(0, Math.ceil((Date.parse(DALLE3_DEADLINE_ISO) - Date.now()) / 86400000));
        const choice = await showModal({
            icon: '⏰',
            title: `DALL-E 3 폐기 D-${daysLeft}`,
            bodyHtml: `
                <p style="margin: 0 0 0.75rem;">OpenAI가 <strong>2026년 5월 12일</strong>부로 DALL-E 3 API를 폐기합니다.</p>
                <p style="margin: 0 0 0.75rem;">남은 기간: <strong style="color: #f8b400;">${daysLeft}일</strong></p>
                <p style="margin: 0 0 0.5rem; color: #b8b8d4; font-size: 0.88rem;">5/12 이후 달리 선택 시 발행이 중단됩니다. 미리 다른 엔진으로 옮기는 것을 권장합니다.</p>
                <p style="margin: 0; color: #b8b8d4; font-size: 0.85rem;">이 안내는 1회만 표시됩니다.</p>
            `,
            primary: { label: '알겠음 (계속 진행)' },
            secondary: { label: '발행 중단' },
        });
        try { localStorage.setItem(DALLE3_NOTICE_KEY, '1'); } catch { /* ignore */ }
        if (choice === 'secondary') return { block: true, reason: '사용자가 D-Day 안내 후 발행 중단 선택' };
    }
    return { block: false };
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
    return true;
}
