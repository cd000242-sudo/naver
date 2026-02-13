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
    private imageGridContainer: HTMLElement | null = null;  // ✅ 이미지 그리드 컨테이너
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

        // ✅ [2026-02-01] 이미지 그리드 컨테이너 생성 (progress-log 아래에 삽입)
        this.createImageGridContainer();

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
                grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
                gap: 8px;
                max-height: 200px;
                overflow-y: auto;
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

    // ✅ [2026-02-02] 이미지 그리드 표시 + 메인 미리보기 업데이트
    showImages(images: Array<{ url?: string; filePath?: string; heading?: string }>, title: string = '수집된 이미지') {
        if (!this.imageGridContainer) return;

        const grid = document.getElementById('progress-image-grid');
        const countEl = document.getElementById('progress-image-count');
        const titleEl = document.getElementById('progress-image-title');
        const mainPreview = document.getElementById('progress-main-preview');

        if (!grid) return;

        // 제목 업데이트
        if (titleEl) titleEl.textContent = title;
        if (countEl) countEl.textContent = `${images.length}개`;

        // ✅ [2026-02-02] 메인 미리보기 헬퍼 함수
        const updateMainPreview = (src: string, heading: string, isPlaceholder: boolean) => {
            if (!mainPreview) return;
            if (isPlaceholder) {
                mainPreview.innerHTML = `
                    <div style="color: #60a5fa; text-align: center;">
                        <div style="font-size: 2.5rem; animation: pulse 1.5s infinite;">⏳</div>
                        <div style="font-size: 11px; margin-top: 4px;">${heading.substring(0, 15) || '생성 중...'}</div>
                    </div>
                `;
            } else {
                mainPreview.innerHTML = `<img src="${src}" alt="${heading}" style="width: 100%; height: 100%; object-fit: cover;">`;
            }
        };

        // 그리드 초기화 후 이미지 추가
        grid.innerHTML = '';

        // 첫 번째 이미지/플레이스홀더로 메인 미리보기 설정
        if (images.length > 0) {
            const firstImg = images[0];
            const firstSrc = firstImg.url || firstImg.filePath || '';
            const isFirstPlaceholder = !firstSrc || (firstImg as any).isPlaceholder;
            updateMainPreview(firstSrc, firstImg.heading || '썸네일', isFirstPlaceholder);
        }

        images.forEach((img, idx) => {
            const src = img.url || img.filePath || '';
            const isPlaceholder = !src || (img as any).isPlaceholder;

            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                position: relative;
                aspect-ratio: 1;
                border-radius: 6px;
                overflow: hidden;
                border: 2px solid ${isPlaceholder ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'};
                background: ${isPlaceholder ? 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)' : 'rgba(0, 0, 0, 0.3)'};
                cursor: pointer;
                transition: all 0.2s;
            `;
            wrapper.title = img.heading || `이미지 ${idx + 1}`;

            // ✅ 클릭 시 메인 미리보기 업데이트
            wrapper.onclick = () => {
                if (!isPlaceholder) {
                    updateMainPreview(src, img.heading || `이미지 ${idx + 1}`, false);
                }
            };

            // 호버 효과
            wrapper.onmouseenter = () => {
                wrapper.style.borderColor = '#3b82f6';
                wrapper.style.transform = 'scale(1.05)';
            };
            wrapper.onmouseleave = () => {
                wrapper.style.borderColor = isPlaceholder ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)';
                wrapper.style.transform = 'scale(1)';
            };

            if (isPlaceholder) {
                // ✅ 플레이스홀더: 로딩 스피너 표시
                wrapper.innerHTML = `
                    <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #60a5fa;">
                        <div style="font-size: 1rem; animation: pulse 1.5s infinite;">⏳</div>
                    </div>
                `;
            } else {
                const imgEl = document.createElement('img');
                imgEl.src = src;
                imgEl.alt = img.heading || `이미지 ${idx + 1}`;
                imgEl.style.cssText = `width: 100%; height: 100%; object-fit: cover;`;
                imgEl.onerror = () => {
                    imgEl.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23333" width="100" height="100"/><text x="50" y="50" text-anchor="middle" fill="%23666" font-size="20">❌</text></svg>';
                };

                // 인덱스 표시 (0 = 썸네일 표시)
                const badge = document.createElement('div');
                badge.style.cssText = `
                    position: absolute; top: 2px; left: 2px;
                    background: ${idx === 0 ? '#3b82f6' : 'rgba(0, 0, 0, 0.7)'};
                    color: white; font-size: 8px; font-weight: 600;
                    padding: 1px 4px; border-radius: 3px;
                `;
                badge.textContent = idx === 0 ? '대표' : `${idx}`;

                wrapper.appendChild(imgEl);
                wrapper.appendChild(badge);
            }

            grid.appendChild(wrapper);
        });

        // 컨테이너 표시
        this.imageGridContainer.style.display = images.length > 0 ? 'block' : 'none';
    }

    // ✅ [2026-02-01] 이미지 그리드 숨기기
    clearImages() {
        if (!this.imageGridContainer) return;
        this.imageGridContainer.style.display = 'none';
        const grid = document.getElementById('progress-image-grid');
        if (grid) grid.innerHTML = '';
    }

    get cancelled(): boolean {
        return this.isCancelled;
    }
}
