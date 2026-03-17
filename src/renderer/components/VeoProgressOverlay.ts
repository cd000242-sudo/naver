/**
 * ✅ [2026-01-25 모듈화] Veo Progress Overlay
 * - renderer.ts에서 분리됨
 * - AI 영상 생성 진행 상태 표시
 */

type VeoProgressOverlay = {
    overlay: HTMLDivElement;
    titleEl: HTMLElement;
    messageEl: HTMLElement;
    barEl: HTMLDivElement;
    percentEl: HTMLElement;
    startedAt: number;
    lastPercent: number;
};

let veoProgressOverlay: VeoProgressOverlay | null = null;

function ensureVeoProgressOverlayStyles(): void {
    if (document.getElementById('veo-progress-overlay-style')) return;
    const style = document.createElement('style');
    style.id = 'veo-progress-overlay-style';
    style.textContent = `
    @keyframes veoSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .veo-progress-spinner { width: 34px; height: 34px; border-radius: 999px; border: 3px solid rgba(255,255,255,0.25); border-top-color: rgba(255,255,255,0.9); animation: veoSpin 0.9s linear infinite; }
  `;
    document.head.appendChild(style);
}

export function showVeoProgressOverlay(title: string): void {
    ensureVeoProgressOverlayStyles();

    if (veoProgressOverlay?.overlay) {
        veoProgressOverlay.overlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.id = 'veo-progress-overlay';
    overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.72);
    z-index: 10005;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
  `;

    const box = document.createElement('div');
    box.style.cssText = `
    width: min(560px, 92vw);
    background: rgba(15, 23, 42, 0.96);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 14px;
    box-shadow: 0 24px 70px rgba(0,0,0,0.45);
    padding: 1.05rem 1.1rem;
    color: rgba(255,255,255,0.92);
  `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:0.9rem;';

    const spinner = document.createElement('div');
    spinner.className = 'veo-progress-spinner';

    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'min-width:0; flex:1;';
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-weight:900; letter-spacing:-0.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
    titleEl.textContent = `AI 영상 생성 중: ${title}`;
    const messageEl = document.createElement('div');
    messageEl.style.cssText = 'margin-top:0.25rem; color: rgba(255,255,255,0.75); font-size: 0.9rem; line-height: 1.35;';
    messageEl.textContent = '준비 중...';
    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(messageEl);

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display:flex; align-items:center; gap:0.9rem; min-width:0; flex:1;';
    headerLeft.appendChild(spinner);
    headerLeft.appendChild(titleWrap);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'border:none; background:transparent; color:rgba(255,255,255,0.7); cursor:pointer; font-size:1rem; padding:0.15rem 0.4rem; border-radius:999px;';
    closeBtn.onmouseenter = () => {
        closeBtn.style.backgroundColor = 'rgba(148,163,184,0.25)';
        closeBtn.style.color = 'rgba(255,255,255,0.9)';
    };
    closeBtn.onmouseleave = () => {
        closeBtn.style.backgroundColor = 'transparent';
        closeBtn.style.color = 'rgba(255,255,255,0.7)';
    };
    closeBtn.addEventListener('click', () => {
        // 사용자가 진행 모달을 닫더라도 생성은 백그라운드에서 계속 진행됨
        hideVeoProgressOverlay();
    });

    header.appendChild(headerLeft);
    header.appendChild(closeBtn);

    const progressRow = document.createElement('div');
    progressRow.style.cssText = 'display:flex; align-items:center; gap:0.6rem; margin-top: 0.9rem;';

    const progressOuter = document.createElement('div');
    progressOuter.style.cssText = 'flex:1; height: 10px; background: rgba(255,255,255,0.10); border-radius: 999px; overflow:hidden;';
    const barEl = document.createElement('div');
    barEl.style.cssText = 'height:100%; width: 0%; background: linear-gradient(90deg, #22c55e, #60a5fa); border-radius: 999px; transition: width 260ms ease;';
    progressOuter.appendChild(barEl);

    const percentEl = document.createElement('div');
    percentEl.style.cssText = 'min-width: 48px; text-align:right; font-weight: 800; color: rgba(255,255,255,0.85);';
    percentEl.textContent = '0%';

    progressRow.appendChild(progressOuter);
    progressRow.appendChild(percentEl);

    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top: 0.75rem; font-size: 0.82rem; color: rgba(255,255,255,0.55);';
    hint.textContent = '이 창을 닫아도 AI 영상 생성은 계속 진행됩니다. 완료되면 AI 영상 목록에 자동으로 추가됩니다.';

    box.appendChild(header);
    box.appendChild(progressRow);
    box.appendChild(hint);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    veoProgressOverlay = {
        overlay,
        titleEl,
        messageEl,
        barEl,
        percentEl,
        startedAt: Date.now(),
        lastPercent: 0,
    };
}

export function setVeoProgressOverlay(message: string, percent?: number): void {
    if (!veoProgressOverlay) return;
    if (message) veoProgressOverlay.messageEl.textContent = message;

    if (typeof percent === 'number' && Number.isFinite(percent)) {
        const p = Math.max(0, Math.min(100, percent));
        const next = Math.max(veoProgressOverlay.lastPercent, p);
        veoProgressOverlay.lastPercent = next;
        veoProgressOverlay.barEl.style.width = `${next}%`;
        veoProgressOverlay.percentEl.textContent = `${Math.round(next)}%`;
    }
}

export function hideVeoProgressOverlay(delayMs: number = 0): void {
    const current = veoProgressOverlay;
    if (!current) return;
    const doHide = () => {
        try {
            current.overlay.remove();
        } catch (e) {
            console.warn('[VeoProgressOverlay] catch ignored:', e);
        }
        if (veoProgressOverlay === current) {
            veoProgressOverlay = null;
        }
    };
    if (delayMs > 0) {
        setTimeout(doHide, delayMs);
    } else {
        doHide();
    }
}

export function handleVeoLogForOverlay(message: string): void {
    if (!veoProgressOverlay) return;
    const msg = String(message || '').trim();
    if (!msg) return;

    if (msg.includes('Veo') || msg.includes('AI 영상')) {
        if (msg.includes('생성 요청 전송 중')) {
            setVeoProgressOverlay('생성 요청 전송 중...', 5);
            return;
        }
        if (msg.includes('영상 생성 중') || msg.includes('완료될 때까지')) {
            setVeoProgressOverlay('영상 생성 중...', 12);
            return;
        }
        if (msg.includes('다운로드 중')) {
            setVeoProgressOverlay('생성된 영상 다운로드 중...', 95);
            return;
        }
        if (msg.includes('영상 생성 완료')) {
            setVeoProgressOverlay('완료! 정리 중...', 100);
            hideVeoProgressOverlay(900);
            return;
        }
    }

    const m = msg.match(/Veo\s*생성\s*진행\s*중\.\.\.\s*(\d+)\s*초\s*경과/i);
    if (m?.[1]) {
        const elapsed = Math.max(0, Number(m[1]) || 0);
        const timeoutSec = 12 * 60;
        const percent = Math.min(94, 12 + (elapsed / timeoutSec) * 82);
        setVeoProgressOverlay(`영상 생성 중... ${elapsed}초 경과`, percent);
        return;
    }

    if (msg.startsWith('❌') && (msg.includes('Veo') || msg.includes('AI 영상'))) {
        setVeoProgressOverlay(msg.replace(/^❌\s*/, ''), veoProgressOverlay.lastPercent || 10);
    }
}

// 전역 노출 (하위 호환성)
(window as any).showVeoProgressOverlay = showVeoProgressOverlay;
(window as any).setVeoProgressOverlay = setVeoProgressOverlay;
(window as any).hideVeoProgressOverlay = hideVeoProgressOverlay;
(window as any).handleVeoLogForOverlay = handleVeoLogForOverlay;

console.log('[VeoProgressOverlay] 📦 모듈 로드됨!');
