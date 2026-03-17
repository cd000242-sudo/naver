// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 페이월 시스템 모듈
// renderer.ts에서 추출 — 무료 사용량 초과 시 UI 차단 + 결제 유도
// ✅ [2026-03-05 강화] 강력한 구매 유도 CTA + 카카오톡 1:1 오픈채팅 연결
// ═══════════════════════════════════════════════════════════════════

import type { PaywallResponse } from '../types/index.js';

// ══════ 상태 변수 ══════
let paywallActive = false;
let paywallQuotaSnapshot: any = null;
let paywallOriginalApi: any = null;
let paywallMessageSnapshot: string | null = null;

// ══════ 타입 가드 ══════
export const isPaywallPayload = (v: any): v is PaywallResponse =>
    !!v && typeof v === 'object' && (v as any).code === 'PAYWALL';

// ══════ 상수 ══════
const PAYWALL_PRICE_IMAGE_SRC = '가격표.jpg';
const PAYWALL_OPEN_CHAT_URL = 'https://open.kakao.com/o/sPcaslwh';
const PAYWALL_PAID_GROUP_CHAT_URL = 'https://open.kakao.com/o/g4NRKlwh';
const PAYWALL_PAID_GROUP_CHAT_PASSWORD = '1645';

// ══════ 가격 이미지 모달 ══════
function showPriceImageModal(): void {
    let priceModal = document.getElementById('price-image-modal') as HTMLDivElement | null;
    if (!priceModal) {
        priceModal = document.createElement('div');
        priceModal.id = 'price-image-modal';
        priceModal.style.position = 'fixed';
        priceModal.style.left = '0';
        priceModal.style.top = '0';
        priceModal.style.right = '0';
        priceModal.style.bottom = '0';
        priceModal.style.background = 'rgba(0,0,0,0.9)';
        priceModal.style.zIndex = '100020';
        priceModal.style.display = 'none';
        priceModal.style.alignItems = 'center';
        priceModal.style.justifyContent = 'center';
        priceModal.style.padding = '20px';
        priceModal.style.cursor = 'pointer';

        const img = document.createElement('img');
        img.src = PAYWALL_PRICE_IMAGE_SRC;
        img.alt = '가격표';
        img.style.maxWidth = '90vw';
        img.style.maxHeight = '85vh';
        img.style.borderRadius = '16px';
        img.style.boxShadow = '0 20px 60px rgba(0,0,0,0.5)';
        img.style.border = '3px solid rgba(212, 175, 55, 0.5)';

        const closeHint = document.createElement('div');
        closeHint.textContent = '화면을 클릭하면 닫힙니다';
        closeHint.style.position = 'absolute';
        closeHint.style.bottom = '20px';
        closeHint.style.left = '50%';
        closeHint.style.transform = 'translateX(-50%)';
        closeHint.style.color = 'rgba(255,255,255,0.6)';
        closeHint.style.fontSize = '14px';

        priceModal.appendChild(img);
        priceModal.appendChild(closeHint);
        document.body.appendChild(priceModal);

        priceModal.addEventListener('click', () => {
            priceModal!.style.display = 'none';
        });
    }
    priceModal.style.display = 'flex';
}

// ══════ 페이월 DOM 생성 (✅ 2026-03-05 강화) ══════
function ensurePaywallDom(): {
    overlay: HTMLDivElement;
    payButton: HTMLButtonElement;
    modalBackdrop: HTMLDivElement;
    modal: HTMLDivElement;
    openLink: HTMLAnchorElement;
    quotaText: HTMLDivElement;
} {
    let overlay = document.getElementById('global-paywall-overlay') as HTMLDivElement | null;
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'global-paywall-overlay';
        overlay.style.position = 'fixed';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.background = 'rgba(0,0,0,0.55)';
        overlay.style.backdropFilter = 'blur(2px)';
        overlay.style.zIndex = '99990';
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'auto';
        document.body.appendChild(overlay);
    }

    let payButton = document.getElementById('global-paywall-pay-button') as HTMLButtonElement | null;
    if (!payButton) {
        payButton = document.createElement('button');
        payButton.id = 'global-paywall-pay-button';
        payButton.textContent = '🚀 프로 버전 문의';
        payButton.style.position = 'fixed';
        payButton.style.top = '14px';
        payButton.style.left = '50%';
        payButton.style.transform = 'translateX(-50%)';
        payButton.style.zIndex = '100000';
        payButton.style.padding = '12px 22px';
        payButton.style.borderRadius = '12px';
        payButton.style.border = '2px solid rgba(212, 175, 55, 0.8)';
        payButton.style.background = 'linear-gradient(135deg, #D4AF37 0%, #FFD700 50%, #F4D03F 100%)';
        payButton.style.color = '#0F0F0F';
        payButton.style.fontWeight = '800';
        payButton.style.fontSize = '14px';
        payButton.style.cursor = 'pointer';
        payButton.style.boxShadow = '0 10px 40px rgba(0,0,0,0.55), 0 0 20px rgba(212, 175, 55, 0.3)';
        payButton.style.display = 'none';
        payButton.style.transition = 'all 0.3s ease';
        payButton.onmouseover = () => { payButton!.style.transform = 'translateX(-50%) scale(1.05)'; };
        payButton.onmouseout = () => { payButton!.style.transform = 'translateX(-50%) scale(1)'; };
        document.body.appendChild(payButton);
    }

    let modalBackdrop = document.getElementById('global-paywall-modal-backdrop') as HTMLDivElement | null;
    let modal = document.getElementById('global-paywall-modal') as HTMLDivElement | null;
    let openLink = document.getElementById('global-paywall-open-chat-link') as HTMLAnchorElement | null;
    let quotaText = document.getElementById('global-paywall-quota-text') as HTMLDivElement | null;

    if (!modalBackdrop) {
        modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'global-paywall-modal-backdrop';
        modalBackdrop.style.position = 'fixed';
        modalBackdrop.style.left = '0';
        modalBackdrop.style.top = '0';
        modalBackdrop.style.right = '0';
        modalBackdrop.style.bottom = '0';
        modalBackdrop.style.background = 'rgba(0,0,0,0.92)';
        modalBackdrop.style.zIndex = '100010';
        modalBackdrop.style.display = 'none';
        modalBackdrop.style.alignItems = 'center';
        modalBackdrop.style.justifyContent = 'center';
        modalBackdrop.style.padding = '24px';
        document.body.appendChild(modalBackdrop);

        modal = document.createElement('div');
        modal.id = 'global-paywall-modal';
        modal.style.width = 'min(520px, 95vw)';
        modal.style.maxHeight = '92vh';
        modal.style.overflow = 'auto';
        modal.style.background = 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)';
        modal.style.border = '2px solid rgba(212, 175, 55, 0.4)';
        modal.style.borderRadius = '24px';
        modal.style.boxShadow = '0 30px 80px rgba(0,0,0,0.8), 0 0 80px rgba(212, 175, 55, 0.1)';
        modal.style.padding = '36px 32px';
        modal.style.textAlign = 'center';
        modal.style.position = 'relative';

        // ✅ [2026-03-05] 한정 특가 뱃지
        const badge = document.createElement('div');
        badge.innerHTML = '🔥 오늘만 특별 혜택';
        badge.style.cssText = `
            position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, #ef4444, #dc2626);
            color: white; font-size: 12px; font-weight: 800;
            padding: 6px 20px; border-radius: 20px;
            box-shadow: 0 4px 15px rgba(239, 68, 68, 0.5);
            animation: badgePulse 2s ease-in-out infinite;
            letter-spacing: 0.5px;
        `;
        modal.appendChild(badge);

        // ⚠️ 타이틀 영역
        const titleRow = document.createElement('div');
        titleRow.style.marginBottom = '20px';
        titleRow.style.marginTop = '8px';

        const warningIcon = document.createElement('div');
        warningIcon.textContent = '🔒';
        warningIcon.style.fontSize = '48px';
        warningIcon.style.marginBottom = '12px';

        const title = document.createElement('div');
        title.textContent = '오늘의 블로그 성장이 멈췄습니다';
        title.style.color = '#fbbf24';
        title.style.fontWeight = '900';
        title.style.fontSize = '22px';
        title.style.letterSpacing = '0.3px';
        title.style.textShadow = '0 0 20px rgba(251, 191, 36, 0.3)';

        titleRow.appendChild(warningIcon);
        titleRow.appendChild(title);

        // ✅ 사용량 프로그레스 바
        const progressWrapper = document.createElement('div');
        progressWrapper.style.cssText = `
            margin: 16px 0 24px; padding: 16px 20px;
            background: rgba(239, 68, 68, 0.08);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 14px;
        `;

        const progressLabel = document.createElement('div');
        progressLabel.style.cssText = `
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 10px; font-size: 14px; color: rgba(255,255,255,0.8);
        `;
        progressLabel.innerHTML = `
            <span>오늘 사용량</span>
            <span style="color: #ef4444; font-weight: 800; font-size: 16px;">2 / 2 사용 완료</span>
        `;

        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            width: 100%; height: 10px;
            background: rgba(255,255,255,0.1);
            border-radius: 5px; overflow: hidden;
        `;

        const progressFill = document.createElement('div');
        progressFill.style.cssText = `
            width: 100%; height: 100%;
            background: linear-gradient(90deg, #ef4444, #dc2626);
            border-radius: 5px;
            animation: progressGlow 2s ease-in-out infinite;
        `;
        progressBar.appendChild(progressFill);

        progressWrapper.appendChild(progressLabel);
        progressWrapper.appendChild(progressBar);

        // ✅ 본문 - 설득 문구
        quotaText = document.createElement('div');
        quotaText.id = 'global-paywall-quota-text';
        quotaText.style.cssText = `
            padding: 20px; margin-bottom: 24px;
            background: rgba(34, 197, 94, 0.06);
            border: 1px solid rgba(34, 197, 94, 0.15);
            border-radius: 14px;
            color: rgba(255,255,255,0.95);
            font-size: 15px; line-height: 1.8;
            text-align: left;
        `;
        quotaText.innerHTML = `
            <div style="font-size:16px;font-weight:700;color:#22c55e;margin-bottom:14px;text-align:center;">
              ✨ Pro 사용자는 이런 혜택을 누리고 있습니다
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;">♾️</span>
                <span><b style="color:#fff;">무제한 발행</b> — 하루에 몇 편이든 자유롭게</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;">🎨</span>
                <span><b style="color:#fff;">AI 이미지 무제한</b> — 고퀄리티 이미지 자동 생성</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;">📅</span>
                <span><b style="color:#fff;">예약발행 + 연속발행</b> — 자동으로 매일 발행</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;">🚀</span>
                <span><b style="color:#fff;">다계정 동시 발행</b> — 여러 블로그 한 번에 관리</span>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;">👥</span>
                <span><b style="color:#fff;">유료 커뮤니티</b> — Pro 사용자 전용 단톡방 입장</span>
              </div>
            </div>
            <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
              <span style="color:#fbbf24;font-weight:700;font-size:15px;">
                💡 지금 문의하시면 특별 할인을 안내해 드립니다!
              </span>
            </div>
        `;

        // 버튼 컨테이너
        const btnContainer = document.createElement('div');
        btnContainer.style.display = 'flex';
        btnContainer.style.flexDirection = 'column';
        btnContainer.style.gap = '12px';
        btnContainer.style.width = '100%';

        // 🚀 메인 CTA 버튼 — 카카오톡 1:1 상담
        openLink = document.createElement('a') as HTMLAnchorElement;
        openLink.id = 'global-paywall-open-chat-link';
        openLink.href = PAYWALL_OPEN_CHAT_URL;
        openLink.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
                <span style="font-size:24px;">💬</span>
                <div>
                    <div style="font-size:18px;font-weight:900;">1:1 카카오톡 상담 받기</div>
                    <div style="font-size:12px;opacity:0.85;font-weight:500;margin-top:2px;">지금 바로 특별 할인 안내 받으세요</div>
                </div>
            </div>
        `;
        openLink.target = '_blank';
        openLink.rel = 'noreferrer';
        openLink.style.cssText = `
            display: block; padding: 18px 20px; text-align: center;
            border-radius: 16px;
            background: linear-gradient(135deg, #FEE500 0%, #F5D100 100%);
            color: #3C1E1E; font-weight: 900; font-size: 18px;
            text-decoration: none;
            box-shadow: 0 8px 30px rgba(254, 229, 0, 0.3), 0 0 20px rgba(254, 229, 0, 0.15);
            transition: all 0.2s ease;
            border: 2px solid rgba(254, 229, 0, 0.6);
        `;
        openLink.onmouseover = () => {
            openLink!.style.transform = 'translateY(-3px)';
            openLink!.style.boxShadow = '0 12px 40px rgba(254, 229, 0, 0.45), 0 0 30px rgba(254, 229, 0, 0.2)';
        };
        openLink.onmouseout = () => {
            openLink!.style.transform = 'translateY(0)';
            openLink!.style.boxShadow = '0 8px 30px rgba(254, 229, 0, 0.3), 0 0 20px rgba(254, 229, 0, 0.15)';
        };
        openLink.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                if ((window as any).api?.openExternalUrl) {
                    (window as any).api.openExternalUrl(PAYWALL_OPEN_CHAT_URL);
                } else {
                    window.open(PAYWALL_OPEN_CHAT_URL, '_blank');
                }
            } catch {
                window.open(PAYWALL_OPEN_CHAT_URL, '_blank');
            }
        });

        // 👥 유료 단톡방 입장 CTA
        const groupChatBtn = document.createElement('a') as HTMLAnchorElement;
        groupChatBtn.href = PAYWALL_PAID_GROUP_CHAT_URL;
        groupChatBtn.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
                <span style="font-size:20px;">👥</span>
                <div>
                    <div style="font-size:15px;font-weight:700;">Pro 전용 커뮤니티 입장</div>
                    <div style="font-size:11px;opacity:0.7;margin-top:2px;">비밀번호: ${PAYWALL_PAID_GROUP_CHAT_PASSWORD}</div>
                </div>
            </div>
        `;
        groupChatBtn.target = '_blank';
        groupChatBtn.rel = 'noreferrer';
        groupChatBtn.style.cssText = `
            display: block; padding: 14px 16px; text-align: center;
            border-radius: 14px;
            background: linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%);
            color: #fff; font-weight: 700; font-size: 15px;
            text-decoration: none;
            box-shadow: 0 6px 20px rgba(124, 58, 237, 0.3);
            transition: all 0.2s ease;
            border: 1px solid rgba(124, 58, 237, 0.5);
        `;
        groupChatBtn.onmouseover = () => {
            groupChatBtn.style.transform = 'translateY(-2px)';
            groupChatBtn.style.boxShadow = '0 8px 30px rgba(124, 58, 237, 0.45)';
        };
        groupChatBtn.onmouseout = () => {
            groupChatBtn.style.transform = 'translateY(0)';
            groupChatBtn.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.3)';
        };
        groupChatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                if ((window as any).api?.openExternalUrl) {
                    (window as any).api.openExternalUrl(PAYWALL_PAID_GROUP_CHAT_URL);
                } else {
                    window.open(PAYWALL_PAID_GROUP_CHAT_URL, '_blank');
                }
            } catch {
                window.open(PAYWALL_PAID_GROUP_CHAT_URL, '_blank');
            }
        });

        // 💰 서브 CTA — 가격 확인
        const priceBtn = document.createElement('button');
        priceBtn.innerHTML = '💰 가격표 확인하기';
        priceBtn.style.cssText = `
            padding: 14px; border-radius: 12px;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.15);
            color: rgba(255,255,255,0.8); font-size: 15px;
            font-weight: 600; cursor: pointer;
            transition: all 0.2s;
        `;
        priceBtn.onmouseover = () => {
            priceBtn.style.background = 'rgba(255,255,255,0.1)';
            priceBtn.style.color = '#fff';
        };
        priceBtn.onmouseout = () => {
            priceBtn.style.background = 'rgba(255,255,255,0.06)';
            priceBtn.style.color = 'rgba(255,255,255,0.8)';
        };
        priceBtn.addEventListener('click', () => {
            showPriceImageModal();
        });

        // 닫기 버튼 (최소화, 죄책감 유발)
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '오늘은 여기까지... 내일 다시 올게요 😢';
        closeBtn.style.cssText = `
            padding: 10px; border-radius: 8px;
            background: transparent; border: none;
            color: rgba(255,255,255,0.2); font-size: 12px;
            font-weight: 400; cursor: pointer;
            transition: all 0.2s; margin-top: 4px;
        `;
        closeBtn.onmouseover = () => { closeBtn.style.color = 'rgba(255,255,255,0.35)'; };
        closeBtn.onmouseout = () => { closeBtn.style.color = 'rgba(255,255,255,0.2)'; };

        btnContainer.appendChild(openLink);
        btnContainer.appendChild(groupChatBtn);
        btnContainer.appendChild(priceBtn);
        btnContainer.appendChild(closeBtn);

        modal.appendChild(titleRow);
        modal.appendChild(progressWrapper);
        modal.appendChild(quotaText);
        modal.appendChild(btnContainer);
        modalBackdrop.appendChild(modal);

        // ✅ CSS 애니메이션 추가
        const style = document.createElement('style');
        style.textContent = `
            @keyframes badgePulse {
                0%, 100% { transform: translateX(-50%) scale(1); }
                50% { transform: translateX(-50%) scale(1.05); }
            }
            @keyframes progressGlow {
                0%, 100% { box-shadow: 0 0 5px rgba(239, 68, 68, 0.3); }
                50% { box-shadow: 0 0 15px rgba(239, 68, 68, 0.6); }
            }
        `;
        document.head.appendChild(style);

        const hideModal = () => {
            modalBackdrop!.style.display = 'none';
        };
        closeBtn.addEventListener('click', hideModal);
        modalBackdrop.addEventListener('click', (e) => {
            if (e.target === modalBackdrop) {
                hideModal();
            }
        });
    }

    return {
        overlay: overlay!,
        payButton: payButton!,
        modalBackdrop: modalBackdrop!,
        modal: modal!,
        openLink: openLink!,
        quotaText: quotaText!,
    };
}

// ══════ UI 차단/해제 ══════
function setUiBlockedByPaywall(blocked: boolean): void {
    const { overlay, payButton, modalBackdrop } = ensurePaywallDom();
    overlay.style.display = blocked ? 'block' : 'none';
    payButton.style.display = blocked ? 'block' : 'none';

    // ✅ 글로벌 버튼 클릭 가로채기 - 클릭하면 모달 표시
    if (blocked) {
        // 모든 버튼 클릭을 가로채는 이벤트 리스너 추가
        if (!(document as any)._paywallClickHandler) {
            (document as any)._paywallClickHandler = (e: MouseEvent) => {
                const target = e.target as HTMLElement;

                // 페이월 모달 내부 요소는 제외
                if (modalBackdrop && modalBackdrop.contains(target)) return;
                if (target.id === 'global-paywall-pay-button') return;
                if (target.closest('#global-paywall-modal-backdrop')) return;
                if (target.closest('#price-image-modal')) return;

                // 버튼, 링크, 클릭 가능한 요소 체크
                const clickable = target.closest('button, a, [role="button"], .btn, input[type="submit"], input[type="button"]');
                if (clickable) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    // 페이월 모달 표시
                    modalBackdrop.style.display = 'flex';
                    return false;
                }
            };
            document.addEventListener('click', (document as any)._paywallClickHandler, true);
        }
    } else {
        // 페이월 해제 시 이벤트 리스너 제거
        if ((document as any)._paywallClickHandler) {
            document.removeEventListener('click', (document as any)._paywallClickHandler, true);
            (document as any)._paywallClickHandler = null;
        }
    }

    // UI 시각적 힌트 (희미하게 표시)
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('button, input, select, textarea, a'));
    for (const el of nodes) {
        if (el.id === 'global-paywall-pay-button') continue;
        if (modalBackdrop && modalBackdrop.contains(el)) continue;

        if (blocked) {
            el.style.opacity = '0.6';
            el.style.filter = 'grayscale(0.2)';
        } else {
            el.style.opacity = '';
            el.style.filter = '';
        }
    }
}

// ══════ 페이월 활성화 ══════
export function activatePaywall(payload?: PaywallResponse | any): void {
    if (paywallActive) {
        if (payload?.quota) {
            paywallQuotaSnapshot = payload.quota;
        }
        if (typeof payload?.message === 'string' && payload.message.trim()) {
            paywallMessageSnapshot = String(payload.message || '').trim();
        }
        return;
    }
    paywallActive = true;
    if (payload?.quota) {
        paywallQuotaSnapshot = payload.quota;
    }
    if (typeof payload?.message === 'string' && payload.message.trim()) {
        paywallMessageSnapshot = String(payload.message || '').trim();
    }

    const { payButton, modalBackdrop } = ensurePaywallDom();
    setUiBlockedByPaywall(true);

    payButton.onclick = () => {
        modalBackdrop.style.display = 'flex';
    };

    modalBackdrop.style.display = 'flex';
}

// ══════ API 래핑 (페이월 응답 자동 감지) ══════
function wrapApiForPaywall(): void {
    if (paywallOriginalApi) return;
    const api: any = (window as any).api;
    if (!api) return;
    paywallOriginalApi = api;

    const wrapped: any = {};
    for (const key of Object.keys(api)) {
        const v = api[key];
        if (typeof v === 'function') {
            wrapped[key] = async (...args: any[]) => {
                const res = await v(...args);
                if (res && typeof res === 'object' && (res as any).code === 'PAYWALL') {
                    activatePaywall(res as PaywallResponse);
                }
                return res;
            };
        } else {
            wrapped[key] = v;
        }
    }

    (window as any).api = wrapped;
}

// ══════ 초기화 ══════
export async function initPaywallSystem(): Promise<void> {
    try {
        wrapApiForPaywall();
        if (typeof (window as any).api?.getQuotaStatus === 'function') {
            const status = await (window as any).api.getQuotaStatus();
            if (status?.success && status?.isFree && status?.quota?.isPaywalled) {
                activatePaywall({ success: false, code: 'PAYWALL', quota: status.quota } as any);
            }
        }
    } catch {
    }
}
