// ✅ [2026-02-24 모듈화] Dashboard UI + Tab Switching
// renderer.ts에서 추출된 대시보드 초기화, 탭 전환, 빠른 액션 함수들

// 빠른 액션 함수들
export function switchToUnifiedTab() {
    const tabButton = document.querySelector('[data-tab="unified"]') as HTMLButtonElement;
    if (tabButton) {
        tabButton.click();
    }
}

export function switchToImageTab() {
    const tabButton = document.querySelector('[data-tab="images"]') as HTMLButtonElement;
    if (tabButton) {
        tabButton.click();
    }
}

export function switchToScheduleTab() {
    const tabButton = document.querySelector('[data-tab="schedule"]') as HTMLButtonElement;
    if (tabButton) {
        tabButton.click();
    }
}

let clockIntervalId: ReturnType<typeof setInterval> | null = null;

// 메인 대시보드 초기화
export function initDashboard() {
    // 시계 업데이트
    updateClock();
    if (clockIntervalId) clearInterval(clockIntervalId);
    clockIntervalId = setInterval(updateClock, 1000);

    // 대시보드 통계 업데이트
    updateDashboardStats();

    // 최근 활동 초기화
    initRecentActivity();

    // 달력 초기화
    initDashboardCalendar();

    // ✅ 썸네일 텍스트 옵션 동기화 초기화
    initThumbnailTextSync();
}

/**
 * ✅ 썸네일 텍스트 옵션 체크박스 동기화
 */
function initThumbnailTextSync(): void {
    const syncGroup = [
        'thumbnail-text-option', // 스마트 자동발행 탭
        'continuous-include-thumbnail-text' // 연속 발행 탭
    ];

    syncGroup.forEach(id => {
        const el = document.getElementById(id) as HTMLInputElement;
        if (!el) return;

        el.addEventListener('change', () => {
            const isChecked = el.checked;
            syncGroup.forEach(targetId => {
                const targetEl = document.getElementById(targetId) as HTMLInputElement;
                if (targetEl && targetEl !== el) {
                    targetEl.checked = isChecked;
                }
            });
            console.log(`[ThumbnailSync] 옵션 변경: ${isChecked ? 'ON' : 'OFF'}`);
        });
    });
}

// 시계 업데이트
function updateClock() {
    const now = new Date();
    const timeElement = document.getElementById('current-time');
    const dateElement = document.getElementById('current-date');

    if (timeElement) {
        timeElement.textContent = now.toLocaleTimeString('ko-KR', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    if (dateElement) {
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];

        dateElement.textContent = `${year}년 ${month}월 ${day}일 ${dayOfWeek}요일`;
    }
}

// 대시보드 통계 업데이트
function updateDashboardStats() {
    // 오늘의 통계 (임시 데이터)
    const todayPosts = document.getElementById('today-posts');
    const todayImages = document.getElementById('today-images');
    const todayViews = document.getElementById('today-views');

    if (todayPosts) todayPosts.textContent = '0';
    if (todayImages) todayImages.textContent = '0';
    if (todayViews) todayViews.textContent = '0';

    // 실제로는 localStorage나 config에서 데이터를 가져와야 함
}

// 최근 활동 초기화
function initRecentActivity() {
    const activityList = document.getElementById('recent-activity');
    if (!activityList) return;

    // 초기 활동 추가
    addRecentActivity('🚀 앱이 시작되었습니다', '방금 전');
}

// 최근 활동 추가
export function addRecentActivity(title: string, time: string) {
    const activityList = document.getElementById('recent-activity');
    if (!activityList) return;

    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    activityItem.innerHTML = `
    <div class="activity-icon">📝</div>
    <div class="activity-content">
      <div class="activity-title">${title}</div>
      <div class="activity-time">${time}</div>
    </div>
  `;

    // 기존 활동들을 아래로 밀고 새 활동을 위에 추가
    const firstChild = activityList.firstChild;
    activityList.insertBefore(activityItem, firstChild);

    // 최대 10개까지만 유지
    while (activityList.children.length > 10) {
        activityList.removeChild(activityList.lastChild!);
    }
}

// 대시보드 달력 초기화
function initDashboardCalendar() {
    // 달력 위젯은 기존 코드에서 이미 초기화됨
}

// 탭 전환 초기화
export function initTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const appContainer = document.querySelector('.app-container') as HTMLElement | null;

    // ✅ 내부 탭 (app-container 안에 있음) vs 외부 탭 (app-container 밖에 있음)
    const internalTabs = ['main', 'unified'];
    const externalTabs = ['image-tools', 'images', 'schedule', 'analytics'];

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            if (!targetTab) return;

            // 모든 탭 버튼에서 active 클래스 제거
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            });

            // 클릭된 버튼에 active 클래스 추가
            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');

            // 모든 탭 패널 숨기기
            const tabPanels = document.querySelectorAll('.tab-panel');
            tabPanels.forEach(panel => {
                panel.classList.remove('active');
                (panel as HTMLElement).style.display = 'none';
            });

            // 대상 탭 패널 표시
            const targetPanel = document.getElementById(`tab-${targetTab}`);
            if (targetPanel) {
                targetPanel.classList.add('active');
                (targetPanel as HTMLElement).style.display = 'block';
            }

            // ✅ unified 탭 전용 섹션 토글 (조건부 표시 섹션은 제외)
            const unifiedOnlySections = document.querySelectorAll('[id^="unified-only-"]');
            const excludedSections = ['unified-only-progress-container', 'unified-only-preview-section', 'unified-only-semi-auto-section'];
            unifiedOnlySections.forEach(section => {
                const sectionId = section.id;
                // 조건부 표시 섹션은 자동으로 표시하지 않음
                if (excludedSections.includes(sectionId)) return;
                (section as HTMLElement).style.display = targetTab === 'unified' ? 'block' : 'none';
            });

            // ✅ app-container의 min-height 조절 (외부 탭 전환 시 빈 공간 제거)
            // display:none 대신 min-height만 0으로 설정하여 헤더/탭버튼은 유지
            if (appContainer) {
                const isExternalTab = externalTabs.includes(targetTab);
                if (isExternalTab) {
                    // 외부 탭: min-height를 0으로 설정 (빈 공간 제거)
                    appContainer.style.minHeight = '0';
                    appContainer.style.height = 'auto';
                } else {
                    // 내부 탭: 원래 min-height 복원
                    appContainer.style.minHeight = '';
                    appContainer.style.height = '';
                }
            }

            // 페이지 스크롤을 맨 위로
            window.scrollTo(0, 0);
        });
    });

    // ✅ 페이지 로드 시 현재 active 탭에 맞게 unified-only 섹션 및 app-container 토글
    const activeTab = document.querySelector('.tab-button.active')?.getAttribute('data-tab');
    const unifiedOnlySectionsInit = document.querySelectorAll('[id^="unified-only-"]');
    const excludedSectionsInit = ['unified-only-progress-container', 'unified-only-preview-section', 'unified-only-semi-auto-section'];
    unifiedOnlySectionsInit.forEach(section => {
        const sectionId = section.id;
        // 조건부 표시 섹션은 자동으로 표시하지 않음
        if (excludedSectionsInit.includes(sectionId)) return;
        (section as HTMLElement).style.display = activeTab === 'unified' ? 'block' : 'none';
    });

    // 초기 로드 시 외부 탭이면 app-container min-height 조절
    if (appContainer && activeTab && externalTabs.includes(activeTab)) {
        appContainer.style.minHeight = '0';
        appContainer.style.height = 'auto';
    }
}
