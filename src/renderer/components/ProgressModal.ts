/**
 * ✅ [2026-01-25 모듈화] 진행상황 모달 관리 클래스
 * - renderer.ts에서 분리됨
 * - 의존성: onStopRequest 콜백으로 주입
 */

export interface ProgressModalOptions {
    onStopRequest?: () => Promise<void>;
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
    private isCancelled: boolean = false;
    private onStopRequest: (() => Promise<void>) | null = null;

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

    setStopRequestHandler(handler: () => Promise<void>) {
        this.onStopRequest = handler;
    }

    show(title: string = 'AI 콘텐츠 생성 중', subtitle: string = '최고의 콘텐츠를 위해 AI가 작업하고 있습니다...') {
        if (!this.modal) this.init();

        this.isCancelled = false;
        this.startTime = Date.now();
        this.reset();

        if (this.progressTitle) this.progressTitle.textContent = title;
        if (this.progressSubtitle) this.progressSubtitle.textContent = subtitle;

        const timeText = document.getElementById('progress-time-text');
        if (timeText) timeText.textContent = '⏳ 예상 소요 시간 계산 중...';

        if (this.modal) {
            this.modal.style.display = 'flex';
        }
    }

    hide() {
        if (this.modal) this.modal.style.display = 'none';
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
    }

    setProgress(percent: number, stepText?: string) {
        if (this.progressBar) this.progressBar.style.width = `${percent}%`;
        if (this.progressPercent) this.progressPercent.textContent = `${Math.round(percent)}%`;
        if (stepText && this.progressStepText) this.progressStepText.textContent = stepText;

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

        logLine.innerHTML = `<span style="color: rgba(255,255,255,0.3); font-size: 0.75rem; margin-right: 8px;">[${timestamp}]</span> <span style="color: ${color}">${message}</span>`;

        this.progressLog.appendChild(logLine);
        this.progressLog.scrollTop = this.progressLog.scrollHeight;
    }

    showSuccess(title: string = '발행 완료!', subtitle: string = '성공적으로 블로그 글이 발행되었습니다.') {
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
    }

    get cancelled(): boolean {
        return this.isCancelled;
    }
}
