/**
 * ✅ [2026-01-25 모듈화] 진행상황 모달 관리 클래스
 * - renderer.ts에서 분리됨
 * - 의존성: onStopRequest 콜백으로 주입
 * ✅ [2026-02-13 RENEWAL] 이미지 미리보기 확대 + 에러 상세 표시 기능 추가
 */

export interface ProgressModalOptions {
    onStopRequest?: () => Promise<void>;
}

export interface ErrorDetail {
    errorType: string;     // "할당량 초과" | "API 오류" | "네트워크 오류" | "인증 실패" | "타임아웃"
    errorCode?: string;    // "429", "500", "QUOTA_EXCEEDED"
    engine?: string;       // "nano-banana-pro", "deepinfra", "gemini"
    rawMessage?: string;   // 원본 에러 메시지
    suggestion?: string;   // "다른 이미지 엔진으로 변경해보세요"
}

// ✅ [2026-03-10 FIX] 로컬 파일 경로를 file:/// URL로 변환하는 헬퍼
function toFileUrlSafe(p: string): string {
    const raw = String(p || '').trim();
    if (!raw) return '';
    if (/^(https?:\/\/|data:|blob:|file:\/\/)/i.test(raw)) return raw;
    // window.toFileUrlMaybe가 있으면 사용, 없으면 인라인 변환
    if (typeof (window as any)?.toFileUrlMaybe === 'function') {
        return (window as any).toFileUrlMaybe(raw);
    }
    const normalized = raw.replace(/\\/g, '/');
    const trimmed = normalized.replace(/^\/+/, '');
    return `file:///${trimmed.replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

export class ProgressModal {
    private modal: HTMLElement | null = null;
    private progressBar: HTMLElement | null = null;
    private progressPercent: HTMLElement | null = null;
    private progressStepText: HTMLElement | null = null;
    private progressLog: HTMLElement | null = null;
    private progressIcon: HTMLElement | null = null;
    private progressTitle: HTMLElement | null = null;
    private progressSubtitle: HTMLElement | null = null;
    private progressHeader: HTMLElement | null = null;
    private imageGridContainer: HTMLElement | null = null;  // ✅ 이미지 그리드 컨테이너
    private isCancelled: boolean = false;
    private onStopRequest: (() => Promise<void>) | null = null;

    // ✅ [2026-03-09] 플로팅 복원 버튼 (FAB)
    private restoreFab: HTMLElement | null = null;
    private currentPercent: number = 0;
    private isWorkInProgress: boolean = false;

    // ✅ [2026-03-22] 에러 자동 닫기 타이머 (클래스 멤버 → 누수 방지)
    private autoCloseTimerId: ReturnType<typeof setTimeout> | null = null;

    // ✅ [2026-02-13] 캐러셀 네비게이션 상태
    private currentImageIndex: number = 0;
    private currentImages: Array<{ url?: string; filePath?: string; heading?: string }> = [];

    private steps = [
        { id: 1, name: '글 생성', icon: '📝' },
        { id: 2, name: '이미지 생성', icon: '🎨' },
        { id: 3, name: '네이버 로그인', icon: '🔐' },
        { id: 4, name: '타이핑', icon: '⌨️' },
        { id: 5, name: '발행 완료', icon: '✅' }
    ];

    private startTime: number = 0;

    constructor(options?: ProgressModalOptions) {
        if (options?.onStopRequest) {
            this.onStopRequest = options.onStopRequest;
        }
        this.init();
    }

    private init() {
        this.modal = document.getElementById('progress-modal');
        this.progressBar = document.getElementById('progress-bar');
        this.progressPercent = document.getElementById('progress-percent');
        this.progressStepText = document.getElementById('progress-step-text');
        this.progressLog = document.getElementById('progress-log');
        this.progressIcon = document.getElementById('progress-icon');
        this.progressTitle = document.getElementById('progress-title');
        this.progressSubtitle = document.getElementById('progress-subtitle');
        this.progressHeader = document.getElementById('progress-header');

        // ✅ [2026-02-26] 캐러셀 애니메이션 CSS 주입
        this.injectCarouselStyles();

        // ✅ [2026-02-01] 이미지 그리드 컨테이너 생성 (progress-log 아래에 삽입)
        this.createImageGridContainer();

        // ✅ [2026-03-09] 플로팅 복원 버튼 생성
        this.createRestoreFab();

        const requestStop = async () => {
            this.isCancelled = true;
            if (this.onStopRequest) {
                await this.onStopRequest();
            }
            this.hide();
        };

        // 취소 버튼 이벤트
        document.getElementById('progress-cancel-btn')?.addEventListener('click', () => {
            void requestStop();
        });

        // 닫기 버튼 이벤트 - 모달만 닫고 발행은 백그라운드에서 계속 진행
        document.getElementById('progress-close-btn')?.addEventListener('click', () => {
            this.hide();
        });
    }

    // ✅ [2026-02-26 NEW] 캐러셀 전환 애니메이션 CSS 주입
    private injectCarouselStyles() {
        if (document.getElementById('progress-carousel-styles')) return;
        const style = document.createElement('style');
        style.id = 'progress-carousel-styles';
        style.textContent = `
            @keyframes carouselFadeIn {
                from { opacity: 0; transform: translateX(var(--slide-dir, 20px)); }
                to { opacity: 1; transform: translateX(0); }
            }
            @keyframes gridItemFadeIn {
                from { opacity: 0; transform: scale(0.85); }
                to { opacity: 1; transform: scale(1); }
            }
            @keyframes imagePopIn {
                0% { opacity: 0; transform: scale(0.5); }
                60% { opacity: 1; transform: scale(1.08); }
                100% { opacity: 1; transform: scale(1); }
            }
            @keyframes borderGlow {
                0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { box-shadow: 0 0 12px 4px rgba(16, 185, 129, 0.3); }
                100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }
            .carousel-fade-in {
                animation: carouselFadeIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            }
            .carousel-fade-in-reverse {
                --slide-dir: -20px;
                animation: carouselFadeIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            }
            .grid-item-fade-in {
                animation: gridItemFadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            }
            .image-pop-in {
                animation: imagePopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                           borderGlow 1s ease-out forwards;
            }
        `;
        document.head.appendChild(style);
    }

    // ✅ [2026-02-02] 이미지 미리보기 영역 초기화 (HTML에 이미 존재하는 요소 참조)
    private createImageGridContainer() {
        // ✅ [2026-02-02 NEW] HTML에 이미 추가된 progress-image-preview-section 사용
        const previewSection = document.getElementById('progress-image-preview-section');
        if (previewSection) {
            this.imageGridContainer = previewSection;
            console.log('[ProgressModal] ✅ HTML의 progress-image-preview-section 참조 완료');
            return;
        }

        // 폴백: 기존 로직 (동적 생성)
        if (document.getElementById('progress-image-grid-container')) {
            this.imageGridContainer = document.getElementById('progress-image-grid-container');
            return;
        }

        const container = document.createElement('div');
        container.id = 'progress-image-grid-container';
        container.style.cssText = `
            display: none;
            margin-top: 16px;
            padding: 16px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;

        container.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                <span style="font-size: 14px;">🖼️</span>
                <span id="progress-image-title" style="font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.9);">수집된 이미지</span>
                <span id="progress-image-count" style="font-size: 11px; color: #3b82f6; background: rgba(59, 130, 246, 0.2); padding: 2px 8px; border-radius: 10px;">0개</span>
            </div>
            <div id="progress-image-grid" style="
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 6px;
            "></div>
        `;

        // progress-log 다음에 삽입
        if (this.progressLog && this.progressLog.parentElement) {
            this.progressLog.parentElement.insertBefore(container, this.progressLog.nextSibling);
        } else {
            const modalBody = document.getElementById('progress-modal-body') ||
                document.querySelector('#progress-modal .modal-body') ||
                this.modal;
            if (modalBody) {
                modalBody.appendChild(container);
            }
        }

        this.imageGridContainer = container;
    }


    setStopRequestHandler(handler: () => Promise<void>) {
        this.onStopRequest = handler;
    }

    show(title: string = 'AI 콘텐츠 생성 중', subtitle: string = '최고의 콘텐츠를 위해 AI가 작업하고 있습니다...') {
        if (!this.modal) this.init();

        this.isCancelled = false;
        this.isWorkInProgress = true;
        this.startTime = Date.now();
        this.reset();

        // ✅ [2026-03-22 FIX] 이전 에러의 자동 닫기 타이머 + 확인 버튼 정리
        this.clearAutoCloseTimer();
        document.getElementById('progress-dismiss-btn')?.remove();

        if (this.progressTitle) this.progressTitle.textContent = title;
        if (this.progressSubtitle) this.progressSubtitle.textContent = subtitle;

        const timeText = document.getElementById('progress-time-text');
        if (timeText) timeText.textContent = '⏳ 예상 소요 시간 계산 중...';

        if (this.modal) {
            this.modal.style.display = 'flex';
        }

        // ✅ [2026-03-09] 모달 표시 시 FAB 숨김
        this.hideRestoreFab();
    }

    hide() {
        if (this.modal) this.modal.style.display = 'none';

        // ✅ [2026-03-09] 작업 진행 중이면 FAB 표시 (완료/취소 시에는 표시 안 함)
        if (this.isWorkInProgress && !this.isCancelled && this.currentPercent < 100) {
            this.showRestoreFab();
        }
    }

    reset() {
        if (this.progressBar) this.progressBar.style.width = '0%';
        if (this.progressPercent) this.progressPercent.textContent = '0%';
        if (this.progressStepText) this.progressStepText.textContent = '단계 분석 중...';
        if (this.progressLog) {
            this.progressLog.innerHTML = `<div style="color: #3b82f6;">[SYSTEM] 작업 엔진 초기화 중...</div>`;
        }
        if (this.progressIcon) this.progressIcon.textContent = '🚀';
        if (this.progressHeader) {
            this.progressHeader.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
        }

        // 모든 단계 초기화
        document.querySelectorAll('.progress-step').forEach(step => {
            step.classList.remove('active', 'completed', 'error');
            const circle = step.querySelector('.step-circle') as HTMLElement;
            if (circle) {
                circle.style.background = 'var(--bg-tertiary)';
                circle.style.borderColor = 'var(--bg-primary)';
                circle.style.color = 'var(--text-strong)';
                const stepNum = step.getAttribute('data-step');
                if (circle) circle.textContent = stepNum;
            }
        });

        // ✅ [2026-02-13] 에러 상세 패널 숨기기
        this.hideErrorDetails();
    }

    setProgress(percent: number, stepText?: string) {
        this.currentPercent = percent;
        if (this.progressBar) this.progressBar.style.width = `${percent}%`;
        if (this.progressPercent) this.progressPercent.textContent = `${Math.round(percent)}%`;
        if (stepText && this.progressStepText) this.progressStepText.textContent = stepText;

        // ✅ [2026-03-09] FAB 진행률 실시간 업데이트
        this.updateRestoreFabPercent(percent, stepText);

        if (percent > 0 && percent < 100) {
            const elapsed = (Date.now() - this.startTime) / 1000;
            const totalEstimated = elapsed / (percent / 100);
            const remaining = Math.max(0, Math.round(totalEstimated - elapsed));

            const timeText = document.getElementById('progress-time-text');
            if (timeText) {
                timeText.textContent = `⏳ 남은 시간: 약 ${remaining}초`;
            }
        } else if (percent >= 100) {
            const timeText = document.getElementById('progress-time-text');
            if (timeText) timeText.textContent = '✨ 작업 완료!';
        }
    }

    setStep(stepNumber: number, status: 'active' | 'completed' | 'error' = 'active', statusText?: string) {
        const stepEl = document.querySelector(`.progress-step[data-step="${stepNumber}"]`);
        if (!stepEl) return;

        for (let i = 1; i < stepNumber; i++) {
            const prevStep = document.querySelector(`.progress-step[data-step="${i}"]`);
            if (prevStep && !prevStep.classList.contains('completed') && !prevStep.classList.contains('error')) {
                this.updateStepUI(prevStep as HTMLElement, 'completed');
            }
        }

        this.updateStepUI(stepEl as HTMLElement, status, statusText);

        if (status === 'active') {
            const step = this.steps.find(s => s.id === stepNumber);
            if (step && this.progressIcon) {
                this.progressIcon.textContent = step.icon;
                if (this.progressStepText) this.progressStepText.textContent = step.name;
            }
        }
    }

    private updateStepUI(el: HTMLElement, status: 'active' | 'completed' | 'error', statusText?: string) {
        el.classList.remove('active', 'completed', 'error');
        el.classList.add(status);

        const circle = el.querySelector('.step-circle') as HTMLElement;
        if (!circle) return;

        if (status === 'active') {
            circle.style.background = '#3b82f6';
            circle.style.borderColor = 'rgba(59, 130, 246, 0.3)';
            circle.style.color = 'white';
        } else if (status === 'completed') {
            circle.style.background = '#10b981';
            circle.style.borderColor = 'var(--bg-primary)';
            circle.style.color = 'white';
            circle.textContent = '✓';
        } else if (status === 'error') {
            circle.style.background = '#ef4444';
            circle.style.borderColor = 'var(--bg-primary)';
            circle.style.color = 'white';
            circle.textContent = '!';
        }
    }

    addLog(message: string) {
        if (!this.progressLog) return;
        const logLine = document.createElement('div');
        logLine.style.marginBottom = '4px';
        const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        let color = 'inherit';
        if (message.includes('✅')) color = '#10b981';
        else if (message.includes('❌') || message.includes('실패')) color = '#ef4444';
        else if (message.includes('⚠️')) color = '#f59e0b';
        else if (message.includes('🤖') || message.includes('AI')) color = '#8b5cf6';
        else if (message.includes('🚀') || message.includes('시작')) color = '#3b82f6';
        else if (message.includes('🖼️') || message.includes('📷')) color = '#60a5fa';
        else if (message.includes('🔧') || message.includes('♻️')) color = '#a78bfa';
        else if (message.includes('📝')) color = '#fbbf24';

        // ✅ [2026-03-07] HTML 이스케이프 (XSS 방지)
        const safe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        logLine.innerHTML = `<span style="color: rgba(255,255,255,0.3); font-size: 0.75rem; margin-right: 8px;">[${timestamp}]</span> <span style="color: ${color}">${safe}</span>`;

        this.progressLog.appendChild(logLine);

        // ✅ [2026-03-07] 로그 엔트리 200개 제한 (메모리/DOM 비대 방지)
        while (this.progressLog.childElementCount > 200) {
            this.progressLog.removeChild(this.progressLog.firstElementChild as Element);
        }

        this.progressLog.scrollTop = this.progressLog.scrollHeight;
    }

    showSuccess(title: string = '발행 완료!', subtitle: string = '성공적으로 블로그 글이 발행되었습니다.') {
        this.isWorkInProgress = false;  // ✅ [2026-03-09] 작업 완료 → FAB 표시 방지
        this.hideRestoreFab();

        if (this.progressHeader) {
            this.progressHeader.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        }
        if (this.progressIcon) {
            this.progressIcon.textContent = '✨';
        }
        if (this.progressTitle) this.progressTitle.textContent = title;
        if (this.progressSubtitle) this.progressSubtitle.textContent = subtitle;

        this.setProgress(100, '모든 작업 완료');
        [1, 2, 3, 4, 5].forEach(id => this.setStep(id, 'completed'));

        setTimeout(() => this.hide(), 4000);
    }

    showError(title: string = '작업 중단됨', subtitle: string = '오류가 발생하여 작업이 중단되었습니다.', failedStep?: number) {
        this.isWorkInProgress = false;  // ✅ [2026-03-09] 에러 → FAB 표시 방지
        this.hideRestoreFab();

        if (this.progressHeader) {
            this.progressHeader.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        }
        if (this.progressIcon) {
            this.progressIcon.textContent = '❌';
        }
        if (this.progressTitle) this.progressTitle.textContent = title;
        if (this.progressSubtitle) this.progressSubtitle.textContent = subtitle;

        if (failedStep) {
            this.setStep(failedStep, 'error', '실패');
        }

        // ✅ [2026-02-13] 자동으로 에러 메시지에서 상세 정보 추출하여 표시
        const detail = this.parseErrorMessage(subtitle);
        if (detail) {
            this.showErrorDetails(detail);
        }

        // ✅ [2026-03-22 FIX] 이전 타이머 정리 후 8초 자동 닫기 (클래스 멤버로 누수 방지)
        this.clearAutoCloseTimer();
        this.autoCloseTimerId = setTimeout(() => {
            this.autoCloseTimerId = null;
            // 에러 상태에서 hide() → isWorkInProgress=false이므로 FAB 뜨지 않음 (안전)
            this.hide();
        }, 8000);

        // ✅ [2026-03-22 FIX] "확인" 버튼 추가 (즉시 닫기)
        const cancelBtn = document.getElementById('progress-cancel-btn');
        if (cancelBtn && cancelBtn.parentElement) {
            document.getElementById('progress-dismiss-btn')?.remove();

            const dismissBtn = document.createElement('button');
            dismissBtn.id = 'progress-dismiss-btn';
            dismissBtn.textContent = '✔ 확인';
            dismissBtn.style.cssText = `
                padding: 8px 20px; border: none; border-radius: 8px;
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                color: white; font-size: 13px; font-weight: 600;
                cursor: pointer; transition: all 0.2s;
                margin-left: 8px;
            `;
            dismissBtn.onmouseenter = () => { dismissBtn.style.transform = 'scale(1.05)'; };
            dismissBtn.onmouseleave = () => { dismissBtn.style.transform = 'scale(1)'; };
            dismissBtn.onclick = () => {
                this.clearAutoCloseTimer();
                this.hide();
                dismissBtn.remove();
            };
            cancelBtn.parentElement.appendChild(dismissBtn);
        }
    }

    // ✅ [2026-03-22] 자동 닫기 타이머 안전 정리
    private clearAutoCloseTimer(): void {
        if (this.autoCloseTimerId !== null) {
            clearTimeout(this.autoCloseTimerId);
            this.autoCloseTimerId = null;
        }
    }

    // ✅ [2026-02-13 NEW] 에러 메시지에서 상세 정보를 자동 추출
    private parseErrorMessage(message: string): ErrorDetail | null {
        if (!message || message.length < 5) return null;

        const detail: ErrorDetail = {
            errorType: '알 수 없는 오류',
            rawMessage: message
        };

        const msgLower = message.toLowerCase();

        // 할당량/Rate Limit 감지 (✅ [2026-02-13] 정밀 조건: 'exceeded' 단독은 오탐 유발하므로 제거)
        if (msgLower.includes('quota') || msgLower.includes('할당량') || msgLower.includes('rate limit') ||
            msgLower.includes('429') || msgLower.includes('too many requests') ||
            msgLower.includes('resource exhausted') || msgLower.includes('사용량 초과')) {
            detail.errorType = '🔴 API 할당량 초과';
            detail.errorCode = '429 / QUOTA_EXCEEDED';
            detail.suggestion = '잠시 후 다시 시도하거나, 설정에서 다른 이미지 생성 엔진으로 변경해보세요.';
        }
        // 인증 오류
        else if (msgLower.includes('401') || msgLower.includes('403') || msgLower.includes('unauthorized') ||
            msgLower.includes('forbidden') || msgLower.includes('api key') || msgLower.includes('인증')) {
            detail.errorType = '🔑 인증 오류';
            detail.errorCode = '401 / 403';
            detail.suggestion = 'API 키가 올바른지 확인하세요. 설정 → API 키 관리에서 키를 다시 입력해보세요.';
        }
        // 서버 오류
        else if (msgLower.includes('500') || msgLower.includes('502') || msgLower.includes('503') ||
            msgLower.includes('server error') || msgLower.includes('internal')) {
            detail.errorType = '🔧 서버 오류';
            detail.errorCode = '500 / 502 / 503';
            detail.suggestion = '외부 API 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.';
        }
        // 타임아웃
        else if (msgLower.includes('timeout') || msgLower.includes('타임아웃') || msgLower.includes('timed out') ||
            msgLower.includes('시간 초과')) {
            detail.errorType = '⏱️ 타임아웃';
            detail.suggestion = '네트워크 연결을 확인하고, 잠시 후 다시 시도해주세요.';
        }
        // 네트워크 오류
        else if (msgLower.includes('network') || msgLower.includes('fetch') || msgLower.includes('econnrefused') ||
            msgLower.includes('enotfound') || msgLower.includes('네트워크')) {
            detail.errorType = '🌐 네트워크 오류';
            detail.suggestion = '인터넷 연결을 확인해주세요.';
        }
        // 콘텐츠 생성 실패
        else if (msgLower.includes('콘텐츠') || msgLower.includes('글 생성') || msgLower.includes('content')) {
            detail.errorType = '📝 콘텐츠 생성 실패';
            detail.suggestion = '다른 키워드나 URL을 사용하거나, AI 엔진을 변경해보세요.';
        }
        // 이미지 생성 실패
        else if (msgLower.includes('이미지') || msgLower.includes('image') || msgLower.includes('generation')) {
            detail.errorType = '🎨 이미지 생성 실패';
            detail.suggestion = '이미지 생성 엔진을 변경하거나, "이미지 건너뛰기" 옵션을 사용해보세요.';
        }
        // 캡차
        else if (msgLower.includes('captcha') || msgLower.includes('캡차')) {
            detail.errorType = '🤖 캡차 인증 필요';
            detail.suggestion = '네이버에서 캡차 인증을 요구합니다. 수동으로 인증 후 다시 시도해주세요.';
        }
        // 로그인 실패
        else if (msgLower.includes('로그인') || msgLower.includes('login')) {
            detail.errorType = '🔐 로그인 실패';
            detail.suggestion = '네이버 로그인 정보를 확인하고, 2단계 인증이 필요한지 확인해주세요.';
        }
        // 일반 오류
        else {
            detail.errorType = '⚠️ 오류 발생';
            detail.suggestion = '문제가 계속되면 관리자에게 이 오류 메시지를 전달해주세요.';
        }

        // 엔진 이름 추출 (메시지에서)
        const enginePatterns = [
            /(?:provider|엔진|engine)[:\s]*([a-zA-Z0-9-]+)/i,
            /(nano-banana-pro|deepinfra|gemini|fal|flux|dall-e)/i,
            /(NanoBananaPro|DeepInfra|Gemini|FAL|FLUX)/i,
        ];
        for (const pattern of enginePatterns) {
            const match = message.match(pattern);
            if (match) {
                detail.engine = match[1];
                break;
            }
        }

        // HTTP 에러코드 추출
        if (!detail.errorCode) {
            const codeMatch = message.match(/\b(4\d{2}|5\d{2})\b/);
            if (codeMatch) {
                detail.errorCode = `HTTP ${codeMatch[1]}`;
            }
        }

        return detail;
    }

    // ✅ [2026-02-13 NEW] 에러 상세 패널 표시
    showErrorDetails(detail: ErrorDetail) {
        const panel = document.getElementById('progress-error-detail');
        const typeEl = document.getElementById('progress-error-type');
        const codeEl = document.getElementById('progress-error-code');
        const engineEl = document.getElementById('progress-error-engine');
        const engineNameEl = document.getElementById('progress-error-engine-name');
        const msgEl = document.getElementById('progress-error-message');
        const suggestEl = document.getElementById('progress-error-suggestion');
        const suggestTextEl = document.getElementById('progress-error-suggestion-text');

        if (!panel) return;

        // 에러 유형
        if (typeEl) typeEl.textContent = detail.errorType;

        // 에러 코드
        if (codeEl) {
            if (detail.errorCode) {
                codeEl.textContent = detail.errorCode;
                codeEl.style.display = 'inline-block';
            } else {
                codeEl.style.display = 'none';
            }
        }

        // 엔진 이름
        if (engineEl && engineNameEl) {
            if (detail.engine) {
                engineNameEl.textContent = detail.engine;
                engineEl.style.display = 'block';
            } else {
                engineEl.style.display = 'none';
            }
        }

        // 원본 에러 메시지
        if (msgEl) {
            msgEl.textContent = detail.rawMessage || '';
        }

        // 해결 제안
        if (suggestEl && suggestTextEl) {
            if (detail.suggestion) {
                suggestTextEl.textContent = detail.suggestion;
                suggestEl.style.display = 'block';
            } else {
                suggestEl.style.display = 'none';
            }
        }

        // 패널 표시 (슬라이드 인 애니메이션)
        panel.style.display = 'block';
        panel.style.opacity = '0';
        panel.style.transform = 'translateY(8px)';
        requestAnimationFrame(() => {
            panel.style.transition = 'opacity 0.3s, transform 0.3s';
            panel.style.opacity = '1';
            panel.style.transform = 'translateY(0)';
        });
    }

    // ✅ [2026-02-13 NEW] 에러 상세 패널 숨기기
    hideErrorDetails() {
        const panel = document.getElementById('progress-error-detail');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    // ✅ [2026-02-13 RENEWAL] 이미지 그리드 표시 + 메인 미리보기 업데이트 (전폭 200px 레이아웃)
    showImages(images: Array<{ url?: string; filePath?: string; heading?: string }>, title: string = '수집된 이미지') {
        const grid = document.getElementById('progress-image-grid');
        const countEl = document.getElementById('progress-image-count');
        const titleEl = document.getElementById('progress-image-title');
        const mainPreview = document.getElementById('progress-main-preview');
        const imageInfo = document.getElementById('progress-image-info');

        if (!grid) return;

        // 제목 업데이트
        if (titleEl) titleEl.textContent = title;
        if (countEl) countEl.textContent = `${images.length}개`;

        // ✅ 이미지 카운트 영역 표시
        if (imageInfo) imageInfo.style.display = images.length > 0 ? 'flex' : 'none';

        // ✅ [2026-02-13] 캐러셀용 이미지 배열 저장
        this.currentImages = images;
        this.currentImageIndex = 0;

        // ✅ 메인 미리보기 헬퍼 함수 (200px 전폭 + 화살표 네비게이션)
        const updateMainPreview = (src: string, heading: string, isPlaceholder: boolean, imgIndex?: number) => {
            if (!mainPreview) return;
            if (typeof imgIndex === 'number') this.currentImageIndex = imgIndex;

            if (isPlaceholder) {
                mainPreview.innerHTML = `
                    <div style="color: #60a5fa; text-align: center;">
                        <div style="font-size: 2.5rem; animation: pulse 1.5s infinite;">⏳</div>
                        <div style="font-size: 0.8rem; margin-top: 6px; opacity: 0.8;">${heading || '이미지 생성 중...'}</div>
                    </div>
                `;
            } else {
                const totalCount = this.currentImages.length;
                const currentNum = (typeof imgIndex === 'number' ? imgIndex : this.currentImageIndex) + 1;

                // ✅ [2026-02-26] 부드러운 전환: 방향에 따른 slide 클래스 결정
                const slideDir = (typeof imgIndex === 'number' && imgIndex < this.currentImageIndex) ? 'carousel-fade-in-reverse' : 'carousel-fade-in';

                mainPreview.innerHTML = `
                    <div class="${slideDir}" style="width: 100%; height: 100%; position: relative;">
                        <img src="${toFileUrlSafe(src)}" alt="${heading}" style="width: 100%; height: 100%; object-fit: cover;">
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 12px; background: linear-gradient(transparent, rgba(0,0,0,0.7)); color: white; font-size: 0.75rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                            <span>${heading || ''}</span>
                            <span style="font-size: 0.65rem; opacity: 0.7; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px;">${currentNum} / ${totalCount}</span>
                        </div>
                    </div>
                    ${totalCount > 1 ? `
                    <button class="carousel-arrow carousel-prev" style="position: absolute; left: 6px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(0,0,0,0.5); color: white; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); transition: all 0.2s; z-index: 2;" onmouseenter="this.style.background='rgba(59,130,246,0.8)'" onmouseleave="this.style.background='rgba(0,0,0,0.5)'">‹</button>
                    <button class="carousel-arrow carousel-next" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(0,0,0,0.5); color: white; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); transition: all 0.2s; z-index: 2;" onmouseenter="this.style.background='rgba(59,130,246,0.8)'" onmouseleave="this.style.background='rgba(0,0,0,0.5)'">›</button>
                    ` : ''}
                `;
                mainPreview.style.position = 'relative';
                mainPreview.style.borderColor = '#3b82f6';

                // ✅ 화살표 이벤트 바인딩
                const prevBtn = mainPreview.querySelector('.carousel-prev');
                const nextBtn = mainPreview.querySelector('.carousel-next');
                prevBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.navigateCarousel(-1, updateMainPreview, grid);
                });
                nextBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.navigateCarousel(1, updateMainPreview, grid);
                });
            }
        };

        // 그리드 초기화 후 이미지 추가
        grid.innerHTML = '';

        // 첫 번째 이미지/플레이스홀더로 메인 미리보기 설정
        if (images.length > 0) {
            const firstImg = images[0];
            const firstSrc = firstImg.url || firstImg.filePath || '';
            const isFirstPlaceholder = !firstSrc || (firstImg as any).isPlaceholder;
            updateMainPreview(toFileUrlSafe(firstSrc), firstImg.heading || '썸네일', isFirstPlaceholder, 0);
        }

        images.forEach((img, idx) => {
            const src = img.url || img.filePath || '';
            const isPlaceholder = !src || (img as any).isPlaceholder;

            const wrapper = document.createElement('div');
            // ✅ [2026-02-26] 그리드 아이템 fadeIn 애니메이션
            wrapper.className = 'grid-item-fade-in';
            wrapper.style.cssText = `
                position: relative;
                aspect-ratio: 1;
                border-radius: 8px;
                overflow: hidden;
                border: 2px solid ${isPlaceholder ? '#3b82f6' : 'var(--border-light)'};
                background: ${isPlaceholder ? 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)' : 'var(--bg-tertiary)'};
                cursor: pointer;
                transition: all 0.2s;
                animation-delay: ${idx * 0.08}s;
                opacity: 0;
            `;
            wrapper.title = img.heading || `이미지 ${idx + 1}`;

            // ✅ 클릭 시 메인 미리보기 업데이트
            wrapper.onclick = () => {
                if (!isPlaceholder) {
                    updateMainPreview(toFileUrlSafe(src), img.heading || `이미지 ${idx + 1}`, false, idx);
                    // 선택된 그리드 아이템 하이라이트
                    grid.querySelectorAll('div').forEach(d => {
                        if ((d as HTMLElement).style.borderColor === 'rgb(59, 130, 246)' && d !== wrapper) {
                            (d as HTMLElement).style.borderColor = 'var(--border-light)';
                        }
                    });
                    wrapper.style.borderColor = '#3b82f6';
                }
            };

            // 호버 효과
            wrapper.onmouseenter = () => {
                wrapper.style.transform = 'scale(1.05)';
                wrapper.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
            };
            wrapper.onmouseleave = () => {
                wrapper.style.transform = 'scale(1)';
                wrapper.style.boxShadow = 'none';
            };

            if (isPlaceholder) {
                wrapper.innerHTML = `
                    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #60a5fa; gap: 4px;">
                        <div style="font-size: 1.2rem; animation: pulse 1.5s infinite;">⏳</div>
                        <div style="font-size: 0.6rem; opacity: 0.7; text-align: center; padding: 0 4px;">${(img.heading || '').substring(0, 8)}</div>
                    </div>
                `;
            } else {
                const imgEl = document.createElement('img');
                imgEl.src = toFileUrlSafe(src);
                imgEl.alt = img.heading || `이미지 ${idx + 1}`;
                imgEl.style.cssText = `width: 100%; height: 100%; object-fit: cover;`;
                imgEl.onerror = () => {
                    imgEl.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23333" width="100" height="100"/><text x="50" y="50" text-anchor="middle" fill="%23666" font-size="20">❌</text></svg>';
                };

                // 인덱스 배지 + 소제목 라벨
                const badge = document.createElement('div');
                badge.style.cssText = `
                    position: absolute; top: 3px; left: 3px;
                    background: ${idx === 0 ? '#3b82f6' : 'rgba(0, 0, 0, 0.65)'};
                    color: white; font-size: 9px; font-weight: 700;
                    padding: 1px 6px; border-radius: 4px; line-height: 1.5;
                `;
                badge.textContent = idx === 0 ? '대표' : `${idx}`;

                // ✅ [2026-02-13 NEW] 하단 소제목 오버레이
                const label = document.createElement('div');
                label.style.cssText = `
                    position: absolute; bottom: 0; left: 0; right: 0;
                    background: linear-gradient(transparent, rgba(0,0,0,0.75));
                    color: white; font-size: 8px; font-weight: 600;
                    padding: 12px 4px 3px 4px; text-align: center;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                `;
                label.textContent = (img.heading || '').substring(0, 12);

                wrapper.appendChild(imgEl);
                wrapper.appendChild(badge);
                if (img.heading) wrapper.appendChild(label);
            }

            grid.appendChild(wrapper);
        });

        // ✅ 서브 이미지 그리드 표시 (이미지 2개 이상일 때만)
        grid.style.display = images.length > 1 ? 'grid' : 'none';

        // ✅ 첫 번째 그리드 아이템 선택 하이라이트
        const firstGridItem = grid.querySelector('div') as HTMLElement;
        if (firstGridItem && images.length > 1) {
            firstGridItem.style.borderColor = '#3b82f6';
        }
    }

    // ✅ [2026-02-13 NEW] 캐러셀 네비게이션 (좌/우 순환)
    private navigateCarousel(
        direction: number,
        updateMainPreview: (src: string, heading: string, isPlaceholder: boolean, imgIndex?: number) => void,
        grid: HTMLElement | null
    ) {
        if (this.currentImages.length <= 1) return;

        // 순환 인덱스 계산
        let newIndex = this.currentImageIndex + direction;
        if (newIndex < 0) newIndex = this.currentImages.length - 1;
        if (newIndex >= this.currentImages.length) newIndex = 0;

        const img = this.currentImages[newIndex];
        const src = img.url || img.filePath || '';
        const isPlaceholder = !src || (img as any).isPlaceholder;

        // 플레이스홀더가 아닌 이미지만 이동
        if (isPlaceholder) {
            // 다음 유효한 이미지 탐색
            for (let i = 1; i < this.currentImages.length; i++) {
                const tryIdx = (newIndex + direction * i + this.currentImages.length) % this.currentImages.length;
                const tryImg = this.currentImages[tryIdx];
                const trySrc = tryImg.url || tryImg.filePath || '';
                if (trySrc && !(tryImg as any).isPlaceholder) {
                    newIndex = tryIdx;
                    updateMainPreview(toFileUrlSafe(trySrc), tryImg.heading || `이미지 ${tryIdx + 1}`, false, tryIdx);
                    break;
                }
            }
        } else {
            updateMainPreview(toFileUrlSafe(src), img.heading || `이미지 ${newIndex + 1}`, false, newIndex);
        }

        // 그리드 아이템 하이라이트 동기화
        if (grid) {
            const gridItems = grid.querySelectorAll(':scope > div');
            gridItems.forEach((item, idx) => {
                (item as HTMLElement).style.borderColor = idx === newIndex ? '#3b82f6' : 'var(--border-light)';
            });
        }
    }

    // ✅ [2026-02-27 NEW] 실시간 단일 이미지 업데이트 — 플레이스홀더를 실제 이미지로 교체
    updateSingleImage(index: number, image: { url?: string; filePath?: string; heading?: string }, total?: number) {
        const grid = document.getElementById('progress-image-grid');
        const countEl = document.getElementById('progress-image-count');
        const mainPreview = document.getElementById('progress-main-preview');
        const imageInfo = document.getElementById('progress-image-info');
        const titleEl = document.getElementById('progress-image-title');

        if (!grid) return;

        const src = image.url || image.filePath || '';
        if (!src) return;

        // ✅ 첫 호출 시 자동 플레이스홀더 초기화
        const existingItems = grid.querySelectorAll(':scope > div').length;
        const totalCount = total || Math.max(index + 1, existingItems);
        if (existingItems === 0 && totalCount > 0) {
            console.log(`[ProgressModal] 🎨 플레이스홀더 ${totalCount}개 자동 초기화`);
            this.currentImages = [];
            grid.innerHTML = '';
            grid.style.display = totalCount > 1 ? 'grid' : 'none';
            grid.style.gridTemplateColumns = totalCount <= 3 ? `repeat(${totalCount}, 1fr)` : 'repeat(auto-fill, minmax(60px, 1fr))';
            grid.style.gap = '6px';

            for (let i = 0; i < totalCount; i++) {
                const placeholder = document.createElement('div');
                placeholder.style.cssText = `
                    aspect-ratio: 1; border-radius: 8px; overflow: hidden;
                    border: 1px dashed var(--border-light); background: var(--bg-tertiary);
                    display: flex; align-items: center; justify-content: center;
                `;
                placeholder.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted);">
                        <div style="font-size: 1.2rem; animation: pulse 1.5s infinite;">⏳</div>
                        <div style="font-size: 7px; margin-top: 2px;">${i + 1}</div>
                    </div>
                `;
                grid.appendChild(placeholder);
                this.currentImages.push({ url: '', heading: `이미지 ${i + 1}`, isPlaceholder: true } as any);
            }

            // 제목, 카운트 초기화
            if (titleEl) titleEl.textContent = '이미지 생성 중';
            if (countEl) countEl.textContent = `0/${totalCount}개`;
            if (imageInfo) imageInfo.style.display = 'flex';

            // 메인 미리보기 초기화
            if (mainPreview) {
                mainPreview.innerHTML = `
                    <div style="color: #60a5fa; text-align: center;">
                        <div style="font-size: 2.5rem; animation: pulse 1.5s infinite;">🖼️</div>
                        <div style="font-size: 0.8rem; margin-top: 6px; opacity: 0.8;">이미지 생성 중...</div>
                    </div>
                `;
                mainPreview.style.borderColor = 'var(--border-light)';
            }
        }

        const gridItems = grid.querySelectorAll(':scope > div');
        const targetItem = gridItems[index] as HTMLElement | undefined;

        // ✅ 그리드 아이템 교체
        if (targetItem) {
            // 플레이스홀더 → 실제 이미지로 교체
            targetItem.className = 'image-pop-in';
            targetItem.style.cssText = `
                position: relative;
                aspect-ratio: 1;
                border-radius: 8px;
                overflow: hidden;
                border: 2px solid #10b981;
                background: var(--bg-tertiary);
                cursor: pointer;
                transition: border-color 0.3s, transform 0.2s;
            `;

            const imgEl = document.createElement('img');
            imgEl.src = toFileUrlSafe(src);
            imgEl.alt = image.heading || `이미지 ${index + 1}`;
            imgEl.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
            imgEl.onerror = () => {
                imgEl.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23333" width="100" height="100"/><text x="50" y="50" text-anchor="middle" fill="%23666" font-size="20">❌</text></svg>';
            };

            // 인덱스 배지
            const badge = document.createElement('div');
            badge.style.cssText = `
                position: absolute; top: 3px; left: 3px;
                background: ${index === 0 ? '#3b82f6' : 'rgba(0, 0, 0, 0.65)'};
                color: white; font-size: 9px; font-weight: 700;
                padding: 1px 6px; border-radius: 4px; line-height: 1.5;
            `;
            badge.textContent = index === 0 ? '대표' : `${index}`;

            // 하단 소제목 오버레이
            const label = document.createElement('div');
            label.style.cssText = `
                position: absolute; bottom: 0; left: 0; right: 0;
                background: linear-gradient(transparent, rgba(0,0,0,0.75));
                color: white; font-size: 8px; font-weight: 600;
                padding: 12px 4px 3px 4px; text-align: center;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            `;
            label.textContent = (image.heading || '').substring(0, 12);

            targetItem.innerHTML = '';
            targetItem.appendChild(imgEl);
            targetItem.appendChild(badge);
            if (image.heading) targetItem.appendChild(label);

            // 호버 효과
            targetItem.onmouseenter = () => {
                targetItem.style.transform = 'scale(1.05)';
                targetItem.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            };
            targetItem.onmouseleave = () => {
                targetItem.style.transform = 'scale(1)';
                targetItem.style.boxShadow = 'none';
            };

            // 클릭 시 메인 미리보기 업데이트
            targetItem.onclick = () => {
                this.updateMainPreviewDirect(src, image.heading || `이미지 ${index + 1}`, index);
                gridItems.forEach((item, idx) => {
                    (item as HTMLElement).style.borderColor = idx === index ? '#3b82f6' : 'var(--border-light)';
                });
            };

            // ✅ 2초 후 테두리 색상 정상화
            setTimeout(() => {
                if (targetItem) targetItem.style.borderColor = 'var(--border-light)';
            }, 2000);
        }

        // ✅ currentImages 업데이트
        if (index < this.currentImages.length) {
            this.currentImages[index] = image;
        } else {
            this.currentImages.push(image);
        }

        // ✅ 메인 미리보기를 최신 완료 이미지로 자동 업데이트
        this.updateMainPreviewDirect(src, image.heading || `이미지 ${index + 1}`, index);

        // ✅ 완료 카운트 업데이트
        const completedCount = this.currentImages.filter(img => {
            const s = img.url || img.filePath || '';
            return !!s && !(img as any).isPlaceholder;
        }).length;

        if (countEl) countEl.textContent = `${completedCount}/${this.currentImages.length}개`;
        if (imageInfo) imageInfo.style.display = 'flex';

        // 그리드 표시
        if (grid) grid.style.display = this.currentImages.length > 1 ? 'grid' : 'none';

        console.log(`[ProgressModal] 🖼️ 실시간 이미지 업데이트: [${index + 1}/${this.currentImages.length}] "${image.heading || ''}" 완료`);
    }

    // ✅ [2026-02-27 NEW] 메인 미리보기 직접 업데이트 (showImages 내부 헬퍼와 동일)
    private updateMainPreviewDirect(src: string, heading: string, imgIndex: number) {
        const mainPreview = document.getElementById('progress-main-preview');
        if (!mainPreview || !src) return;

        this.currentImageIndex = imgIndex;
        const totalCount = this.currentImages.length;
        const currentNum = imgIndex + 1;

        mainPreview.innerHTML = `
            <div class="carousel-fade-in" style="width: 100%; height: 100%; position: relative;">
                <img src="${toFileUrlSafe(src)}" alt="${heading}" style="width: 100%; height: 100%; object-fit: cover;">
                <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 12px; background: linear-gradient(transparent, rgba(0,0,0,0.7)); color: white; font-size: 0.75rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                    <span>${heading || ''}</span>
                    <span style="font-size: 0.65rem; opacity: 0.7; background: rgba(0,0,0,0.5); padding: 2px 6px; border-radius: 4px;">${currentNum} / ${totalCount}</span>
                </div>
            </div>
        `;
        mainPreview.style.position = 'relative';
        mainPreview.style.borderColor = '#10b981';

        // 2초 후 테두리 정상화
        setTimeout(() => {
            if (mainPreview) mainPreview.style.borderColor = '#3b82f6';
        }, 2000);
    }

    // ✅ [2026-02-13] 이미지 그리드 숨기기 + 메인 미리보기 초기화
    clearImages() {
        const grid = document.getElementById('progress-image-grid');
        const mainPreview = document.getElementById('progress-main-preview');
        const imageInfo = document.getElementById('progress-image-info');

        if (grid) {
            grid.innerHTML = '';
            grid.style.display = 'none';
        }
        if (mainPreview) {
            mainPreview.innerHTML = `
                <div style="color: var(--text-muted); text-align: center; font-size: 0.85rem;">
                    <div style="font-size: 2.5rem; margin-bottom: 6px;">🖼️</div>
                    <div>이미지 대기 중</div>
                </div>
            `;
            mainPreview.style.borderColor = 'var(--border-light)';
        }
        if (imageInfo) imageInfo.style.display = 'none';
    }

    get cancelled(): boolean {
        return this.isCancelled;
    }

    // ═══════════════════════════════════════════════
    // ✅ [2026-03-09] 플로팅 복원 버튼 (FAB) 관련 메서드
    // ═══════════════════════════════════════════════

    /** FAB DOM 요소 생성 (1회) */
    private createRestoreFab() {
        if (document.getElementById('progress-restore-fab')) {
            this.restoreFab = document.getElementById('progress-restore-fab');
            return;
        }

        const fab = document.createElement('div');
        fab.id = 'progress-restore-fab';
        fab.title = '진행 상황 보기';
        fab.style.cssText = `
            display: none;
            position: fixed;
            bottom: 24px;
            left: 24px;
            z-index: 99999;
            width: auto;
            min-width: 56px;
            height: 48px;
            border-radius: 24px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4), 0 0 0 0 rgba(59, 130, 246, 0.3);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-size: 14px;
            font-weight: 700;
            padding: 0 16px;
            align-items: center;
            justify-content: center;
            gap: 8px;
            user-select: none;
            animation: fabBounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            font-family: 'Pretendard', -apple-system, sans-serif;
        `;

        fab.innerHTML = `
            <span id="progress-fab-icon" style="font-size: 16px;">🚀</span>
            <span id="progress-fab-text" style="font-size: 13px; font-weight: 600;">0%</span>
        `;

        // hover 효과
        fab.addEventListener('mouseenter', () => {
            fab.style.transform = 'scale(1.08)';
            fab.style.boxShadow = '0 6px 28px rgba(59, 130, 246, 0.5), 0 0 0 4px rgba(59, 130, 246, 0.15)';
        });
        fab.addEventListener('mouseleave', () => {
            fab.style.transform = 'scale(1)';
            fab.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.4), 0 0 0 0 rgba(59, 130, 246, 0.3)';
        });

        // 클릭 → 모달 복원
        fab.addEventListener('click', () => {
            if (this.modal) {
                this.modal.style.display = 'flex';
            }
            this.hideRestoreFab();
            console.log('[ProgressModal] ✅ FAB 클릭 → 모달 복원');
        });

        // FAB 애니메이션 CSS 주입
        if (!document.getElementById('progress-fab-styles')) {
            const style = document.createElement('style');
            style.id = 'progress-fab-styles';
            style.textContent = `
                @keyframes fabBounceIn {
                    0% { opacity: 0; transform: scale(0.3) translateY(20px); }
                    60% { opacity: 1; transform: scale(1.1) translateY(-4px); }
                    100% { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes fabPulse {
                    0%, 100% { box-shadow: 0 4px 20px rgba(59,130,246,0.4), 0 0 0 0 rgba(59,130,246,0.3); }
                    50% { box-shadow: 0 4px 20px rgba(59,130,246,0.4), 0 0 0 6px rgba(59,130,246,0.1); }
                }
                #progress-restore-fab {
                    animation: fabBounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                               fabPulse 2s ease-in-out 0.5s infinite;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(fab);
        this.restoreFab = fab;
    }

    /** FAB 표시 */
    private showRestoreFab() {
        if (!this.restoreFab) this.createRestoreFab();
        if (this.restoreFab) {
            this.restoreFab.style.display = 'flex';
            // 현재 진행률 반영
            this.updateRestoreFabPercent(this.currentPercent);
            console.log(`[ProgressModal] 📌 FAB 표시 (${Math.round(this.currentPercent)}%)`);
        }
    }

    /** FAB 숨김 */
    private hideRestoreFab() {
        if (this.restoreFab) {
            this.restoreFab.style.display = 'none';
        }
    }

    /** FAB 진행률 업데이트 */
    private updateRestoreFabPercent(percent: number, stepText?: string) {
        if (!this.restoreFab || this.restoreFab.style.display === 'none') return;

        const fabText = document.getElementById('progress-fab-text');
        const fabIcon = document.getElementById('progress-fab-icon');
        if (fabText) {
            fabText.textContent = stepText ? `${Math.round(percent)}% · ${stepText}` : `${Math.round(percent)}%`;
        }

        // 진행률에 따른 아이콘 변경
        if (fabIcon) {
            if (percent >= 80) fabIcon.textContent = '✨';
            else if (percent >= 50) fabIcon.textContent = '⚡';
            else fabIcon.textContent = '🚀';
        }
    }
}
