// @ts-nocheck
// ============================================
// 연속 발행 모듈 (Continuous Publishing)
// modules/continuousPublishing.ts
// ============================================
// 외부유입 탭 전환 함수
export function switchExternalLinksTab(tabName: string) {
  console.log('[Tab] 외부유입 탭 전환:', tabName);

  // 모든 탭 버튼에서 active 제거
  const tabButtons = document.querySelectorAll('.external-links-tabs .tab-btn');
  tabButtons.forEach(btn => {
    btn.classList.remove('active');
    (btn as HTMLElement).style.background = 'var(--bg-tertiary)';
    (btn as HTMLElement).style.color = 'var(--text-strong)';
    (btn as HTMLElement).style.borderBottom = 'none';
  });

  // 선택된 탭 버튼 활성화
  const activeButton = document.querySelector(`.tab-btn[data-tab="${tabName}"]`) as HTMLElement;
  if (activeButton) {
    activeButton.classList.add('active');
    activeButton.style.background = 'var(--primary)';
    activeButton.style.color = 'white';
  }

  // 모든 탭 내용 숨김
  const tabContents = document.querySelectorAll('.links-container .tab-content');
  tabContents.forEach(content => {
    (content as HTMLElement).style.display = 'none';
  });

  // 선택된 탭 내용 표시
  const activeContent = document.getElementById(`${tabName}-content`) as HTMLElement;
  if (activeContent) {
    activeContent.style.display = 'block';
    console.log('[Tab] 탭 내용 표시됨:', tabName);
  }
}

// 연속 발행 기능 함수들
export function startContinuousMode(urls: string[]): void {
  console.log('[Continuous] startContinuousMode 호출됨');
  console.log('[Continuous] 입력받은 URL들:', urls);

  if (urls.length === 0) {
    console.log('[Continuous] URL이 없어서 중단');
    appendLog('❌ 연속 발행할 URL이 없습니다.');
    return;
  }

  console.log('[Continuous] 연속 발행 모드 시작 준비');
  isContinuousMode = true;
  // ✅ [2026-03-11 FIX] 새 연속발행 시작 시 이전 중지 플래그 초기화
  (window as any).stopFullAutoPublish = false;
  (window as any).stopBatchPublish = false;
  continuousQueue = [...urls];
  console.log('[Continuous] 큐에 저장된 URL들:', continuousQueue);
  appendLog(`🚀 연속 발행 모드 시작: ${urls.length}개 포스팅`);

  // ✅ [2026-01-20] 연속발행 프리셋 썸네일 적용
  const continuousPreset = applyPresetThumbnailIfExists('continuous');
  if (continuousPreset.applied) {
    // 전역 변수에 프리셋 썸네일 저장 (발행 시 사용)
    (window as any).continuousPresetThumbnail = continuousPreset.forHeading;
    (window as any).continuousPresetThumbnailPath = continuousPreset.forThumbnail;
    appendLog('🎨 미리 세팅된 썸네일이 연속발행에 적용됩니다!');
  }

  console.log('[Continuous] processNextInQueue 호출');
  processNextInQueue();
}

function processNextInQueue(): void {
  if (!isContinuousMode) return;

  let item: any = continuousQueueV2.find(i => i.status === 'pending');
  if (!item && continuousQueue.length > 0) {
    // ✅ 현재 UI에서 선택된 발행 모드 가져오기 (버그 수정: 'publish' 하드코딩 → 실제 선택값)
    const currentPublishMode = (document.getElementById('unified-publish-mode') as HTMLInputElement)?.value || 'publish';
    console.log('[ContinuousPublishing] 🔍 발행 모드 읽기:', currentPublishMode);
    // ✅ [2026-02-07 FIX] getScheduleDateFromInput 사용 (T→space 변환)
    const currentScheduleDate = getScheduleDateFromInput('unified-schedule-date');
    item = {
      type: 'url',
      value: continuousQueue[0],
      status: 'pending',
      imageSource: getFullAutoImageSource(), // ✅ [2026-02-11 FIX] V1 레거시 큐에도 imageSource 추가
      publishMode: currentPublishMode,
      scheduleDate: currentPublishMode === 'schedule' ? currentScheduleDate : undefined
    };
  }

  if (!item) {
    console.log('[Continuous] 모든 포스팅 완료');
    appendLog('✅ 모든 포스팅 발행 완료!');
    stopContinuousMode('complete');
    return;
  }

  // V1 처리용 (큐에서 제거)
  if (continuousQueue.length > 0 && item.value === continuousQueue[0]) {
    continuousQueue.shift();
  } else {
    // V2 처리용 (상태 변경)
    item.status = 'processing';
    renderQueueListV2();
  }

  const nextUrl = item.value;
  console.log('[Continuous] 다음 포스팅 처리 시작:', nextUrl, `(${item.publishMode})`);
  appendLog(`📝 다음 포스팅 처리: ${nextUrl} (${item.publishMode})`);

  // ✅ UI 동기화 (발행 모드 및 예약 설정)
  try {
    // 1. URL 입력
    const urlInputs = document.querySelectorAll('.unified-url-input') as NodeListOf<HTMLInputElement>;
    urlInputs.forEach(input => {
      input.value = nextUrl;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 2. 발행 모드 동기화
    const modeBtn = document.querySelector(`.publish-mode-btn[data-mode="${item.publishMode}"]`) as HTMLElement;
    if (modeBtn) {
      modeBtn.click();
    }

    // 3. 예약 날짜/시간 동기화
    if (item.publishMode === 'schedule' && item.scheduleDate) {
      const dateInput = document.getElementById('unified-schedule-date') as HTMLInputElement;
      if (dateInput) {
        dateInput.value = item.scheduleDate;
        dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const scheduleTypeInput = document.getElementById('unified-schedule-type') as HTMLInputElement;
      if (scheduleTypeInput) scheduleTypeInput.value = item.scheduleType || 'naver-server';
    }

    // 4. 이미지 소스 동기화 (있는 경우)
    // ✅ [2026-02-11 FIX] localStorage('fullAutoImageSource')도 반드시 동기화
    // UnifiedDOMCache.getImageSource()가 localStorage를 우선 읽으므로 select만 바꾸면 무시됨
    if (item.imageSource) {
      // ✅ [2026-02-13 FIX] 'saved'는 AI 엔진이 아니므로 fullAutoImageSource에 저장하지 않음
      const INVALID_AI_SOURCES = ['saved', 'skip'];
      if (!INVALID_AI_SOURCES.includes(item.imageSource)) {
        // ✅ [2026-02-18 FIX] null/undefined 방지 — item.imageSource가 null이면 "null" 문자열이 저장되는 버그
        if (item.imageSource && item.imageSource !== 'null' && item.imageSource !== 'undefined') {
          localStorage.setItem('fullAutoImageSource', item.imageSource);
          console.log(`[Continuous] ✅ fullAutoImageSource localStorage 동기화: "${item.imageSource}"`);
        } else {
          console.warn(`[Continuous] ⚠️ item.imageSource가 유효하지 않음("${item.imageSource}") → fullAutoImageSource 변경 안 함`);
        }        // ✅ [2026-02-11 FIX] dispatchEvent('change') 제거!
        // select의 change 이벤트 → 버튼 click 핸들러 → localStorage.setItem('fullAutoImageSource', 'nano-banana-pro')
        // 이 연쇄 반응으로 위에서 올바르게 설정한 localStorage 값이 덮어써지는 버그 발생
        // select는 UI 표시용으로만 업데이트하고, 이벤트는 발생시키지 않음
        const imgSourceSelect = document.getElementById('unified-image-source') as HTMLSelectElement;
        if (imgSourceSelect) {
          const hasOption = Array.from(imgSourceSelect.options).some(opt => opt.value === item.imageSource);
          if (hasOption) {
            imgSourceSelect.value = item.imageSource;
          }
        }
      } else {
        console.log(`[Continuous] ⚠️ imageSource="${item.imageSource}"는 AI 엔진이 아님 → fullAutoImageSource 변경 안 함`);
      }
    }
  } catch (e) {
    console.warn('[Continuous] UI 동기화 중 오류 (무시 가능):', e);
  }

  // 풀오토 발행 자동 시작 (약간의 지연)
  console.log('[Continuous] 1.5초 후 풀오토 발행 시작');
  setTimeout(() => {
    // ✅ [2026-03-11 FIX] 대기 중 취소 플래그 체크 (경쟁 조건 방지)
    if (!isContinuousMode || (window as any).stopFullAutoPublish === true) {
      console.log('[Continuous] 발행 시작 전 취소 감지 → 건너뜀');
      return;
    }
    const fullAutoPublishBtn = document.getElementById('full-auto-publish-btn') as HTMLButtonElement | null;
    if (fullAutoPublishBtn) {
      const finalEngine = localStorage.getItem('fullAutoImageSource');
      console.log(`[Continuous] 🎨 발행 직전 이미지 엔진 확인: "${finalEngine}" (localStorage.fullAutoImageSource)`);
      console.log('[Continuous] 풀오토 발행 실행 버튼 클릭!');
      fullAutoPublishBtn.click();
    } else {
      console.log('[Continuous] 풀오토 발행 실행 버튼을 찾을 수 없음');
      toastManager.error('발행 버튼을 찾을 수 없어 중단되었습니다.');
      stopContinuousMode();
    }
  }, 1500);
}

export function stopContinuousMode(reason: 'manual' | 'complete' = 'manual'): void {
  console.log(`[Continuous] stopContinuousMode 호출됨 (사유: ${reason})`);

  // ✅ [2026-01-21] 이미지 생성 락 즉시 해제 - 중단 후 재시작 시 락 충돌 방지
  clearImageGenerationLocks();

  isContinuousMode = false;

  // ✅ [FIX] 전역 중지 플래그 설정 - 진행 중인 모든 발행 중지
  (window as any).stopFullAutoPublish = true;
  (window as any).stopBatchPublish = true;

  // ✅ [FIX] 현재 진행 중인 자동화 작업 취소
  try {
    window.api.cancelAutomation().catch((err: any) => {
      console.warn('[Continuous] 자동화 취소 중 오류 (무시 가능):', err);
    });
  } catch (e) {
    console.warn('[Continuous] cancelAutomation 호출 실패:', e);
  }

  // ✅ [FIX] 중지 시 큐를 초기화하지 않음 - 대기 중인 항목은 유지
  // continuousQueue = [];
  // continuousQueueV2 = [];

  // ✅ [FIX] 진행 중(processing)이던 항목을 'cancelled' 상태로 변경
  continuousQueueV2.forEach(item => {
    if (item.status === 'processing') {
      item.status = 'cancelled'; // cancelled 상태로 변경
    }
  });

  currentQueuePageV2 = 0;

  // UI 요소 복구
  const startBtn = document.getElementById('continuous-start-btn');
  const stopBtn = document.getElementById('continuous-stop-btn');
  const statusIndicator = document.getElementById('continuous-status-indicator');
  const statusText = document.getElementById('continuous-status-text');

  if (startBtn) (startBtn as HTMLElement).style.display = 'flex';
  if (stopBtn) (stopBtn as HTMLElement).style.display = 'none';

  // ✅ 상태 표시 업데이트
  if (statusIndicator) {
    statusIndicator.style.background = reason === 'complete' ? '#22c55e' : 'var(--text-muted)';
  }
  if (statusText) {
    statusText.textContent = reason === 'complete' ? '발행 완료' : '중지됨';
  }

  // 진행 모달 닫기
  const progressModal = document.getElementById('continuous-progress-modal');
  if (progressModal) progressModal.style.display = 'none';

  if (continuousInterval) {
    clearInterval(continuousInterval);
    continuousInterval = null;
  }
  continuousCountdown = 0;

  const countdownElement = document.getElementById('continuous-countdown');
  if (countdownElement) {
    countdownElement.style.display = 'none';
  }

  if (reason === 'complete') {
    appendLog('✅ 모든 연속 발행 작업이 완료되었습니다.');
    toastManager.success('✅ 모든 발행이 완료되었습니다!');
  } else {
    appendLog('⏹️ 연속 발행 모드 중단됨');
    toastManager.info('🛑 연속 발행이 중지되었습니다.');
  }

  // ✅ [2026-03-11 FIX] 발행 "완료" 시에만 상태 초기화 — 수동 중지 시에는 중지 플래그 유지
  if (reason === 'complete') {
    if (typeof (window as any).resetAfterPublish === 'function') {
      (window as any).resetAfterPublish();
      console.log('[Continuous] ✅ 발행 완료 → 상태 초기화 완료');
    }
  } else {
    console.log('[Continuous] 🛑 수동 중지 → resetAfterPublish 생략 (중지 플래그 유지)');
  }

  renderQueueListV2(); // 큐 리스트 갱신
}

export function scheduleNextPosting(): void {
  console.log('[Continuous] scheduleNextPosting 호출됨');
  if (!isContinuousMode) {
    console.log('[Continuous] 연속 모드가 아니어서 중단');
    return;
  }

  // ✅ 사용자 설정 시간 가져오기 (기본값 15초)
  const intervalInput = document.getElementById('continuous-interval-seconds') as HTMLInputElement;
  const userInterval = intervalInput ? parseInt(intervalInput.value) || 15 : 15;
  continuousCountdown = Math.max(5, Math.min(3600, userInterval)); // 5초 ~ 1시간 범위 제한

  console.log(`[Continuous] ${continuousCountdown}초 카운트다운 시작 (사용자 설정)`);
  appendLog(`⏰ 다음 포스팅까지 ${continuousCountdown}초 대기...`);

  const countdownElement = document.getElementById('continuous-countdown');
  console.log('[Continuous] 카운트다운 엘리먼트 찾음:', countdownElement ? '있음' : '없음');

  if (countdownElement) {
    countdownElement.style.display = 'block';
    countdownElement.textContent = `다음 포스팅까지 ${continuousCountdown}초 남음`;
    console.log('[Continuous] 카운트다운 표시 시작');
  }

  if (continuousInterval) {
    console.log('[Continuous] 기존 인터벌 정리');
    clearInterval(continuousInterval);
  }

  continuousInterval = setInterval(() => {
    continuousCountdown--;
    console.log('[Continuous] 카운트다운:', continuousCountdown);

    if (countdownElement) {
      countdownElement.textContent = `다음 포스팅까지 ${continuousCountdown}초 남음`;
    }

    if (continuousCountdown <= 0) {
      console.log('[Continuous] 카운트다운 완료, 다음 포스팅 처리');
      if (continuousInterval) {
        clearInterval(continuousInterval);
        continuousInterval = null;
      }
      if (countdownElement) {
        countdownElement.style.display = 'none';
        console.log('[Continuous] 카운트다운 표시 숨김');
      }
      processNextInQueue();
    }
  }, 1000);
}

// 연속 발행 URL 입력 모달 토글
export function toggleContinuousModeModal(): void {
  console.log('[Continuous] toggleContinuousModeModal 호출됨');
  let modal = document.getElementById('continuous-mode-modal') as HTMLDivElement;
  console.log('[Continuous] 모달 엘리먼트 찾음:', modal ? '있음' : '없음');

  if (!modal) {
    console.log('[Continuous] 모달 엘리먼트를 찾을 수 없음');
    return;
  }

  // ✅ 모달을 body 직속으로 이동 (position:fixed 정상 작동을 위해)
  if (modal.parentElement !== document.body) {
    console.log('[Continuous] 모달을 body로 이동 (현재 부모:', modal.parentElement?.id || modal.parentElement?.tagName, ')');
    document.body.appendChild(modal);
  }

  const currentDisplay = modal.style.display;
  const isOpening = currentDisplay === 'none' || currentDisplay === '';
  console.log('[Continuous] 모달 표시 상태 변경:', currentDisplay, '->', isOpening ? 'flex' : 'none');

  if (isOpening) {
    // ✅ 모달 열기 - 모든 필수 스타일 명시적 설정
    modal.style.cssText = `
      display: flex !important;
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.85) !important;
      z-index: 10006 !important;
      justify-content: center !important;
      align-items: center !important;
      visibility: visible !important;
      opacity: 1 !important;
    `;
    modal.setAttribute('aria-hidden', 'false');
    console.log('[Continuous] 모달 열림, V2 초기화');
    console.log('[Continuous] 모달 cssText:', modal.style.cssText);

    // ✅ 닫기 버튼 이벤트 직접 연결 (body로 이동되면서 기존 위임 끊어짐)
    const closeBtn = modal.querySelector('.modal-close, [data-close-continuous]') as HTMLButtonElement;
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Continuous] 닫기 버튼 클릭');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      };
    }

    // ✅ 배경 클릭 시 닫기
    modal.onclick = (e) => {
      if (e.target === modal) {
        console.log('[Continuous] 배경 클릭 - 모달 닫기');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
      }
    };

    // ✅ 상세 설정 버튼 클릭 이벤트 직접 연결
    const openSettingsBtn = modal.querySelector('#continuous-open-settings-modal-btn, [id*="settings-modal-btn"]') as HTMLButtonElement;
    if (openSettingsBtn) {
      openSettingsBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Continuous] 상세 설정 버튼 클릭');
        const settingsModal = document.getElementById('continuous-settings-modal');
        if (settingsModal) {
          // settings 모달도 body로 이동
          if (settingsModal.parentElement !== document.body) {
            document.body.appendChild(settingsModal);
          }
          settingsModal.style.cssText = `
            display: flex !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(0, 0, 0, 0.9) !important;
            z-index: 10007 !important;
            justify-content: center !important;
            align-items: center !important;
          `;
          settingsModal.setAttribute('aria-hidden', 'false');
        }
      };
    }

    initContinuousPublishingV2();
  } else {
    // ✅ 모달 닫기
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
}


// 연속 발행 URL 필드 관리
function initContinuousUrlFields(): void {
  const addBtn = document.getElementById('continuous-add-url-field-btn') as HTMLButtonElement;
  const container = document.getElementById('continuous-url-fields-container') as HTMLDivElement;

  if (addBtn && container) {
    addBtn.addEventListener('click', () => {
      const urlItems = container.querySelectorAll('.continuous-url-field-item');
      const newIndex = urlItems.length;

      const newItem = document.createElement('div');
      newItem.className = 'continuous-url-field-item';
      newItem.style.cssText = 'display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;';
      newItem.innerHTML = `
        <input type="url" class="continuous-url-field-input" placeholder="https://example.com/article${newIndex + 1}" style="flex: 1; background: var(--bg-secondary); border: 1px solid var(--border-medium); border-radius: 8px; color: var(--text-strong); padding: 0.75rem;" data-url-index="${newIndex}">
        <button type="button" class="continuous-url-field-remove" style="padding: 0.25rem 0.5rem; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;" title="삭제">×</button>
      `;

      container.appendChild(newItem);
      updateContinuousUrlFieldRemoveButtons();

      // 새로 추가된 입력 필드에 포커스
      const newInput = newItem.querySelector('.continuous-url-field-input') as HTMLInputElement;
      if (newInput) {
        setTimeout(() => newInput.focus(), 100);
      }
    });
  }

  // 이벤트 위임으로 삭제 버튼 처리
  container.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('continuous-url-field-remove')) {
      const urlItems = container.querySelectorAll('.continuous-url-field-item');
      if (urlItems.length > 1) {
        target.closest('.continuous-url-field-item')?.remove();
        updateContinuousUrlFieldRemoveButtons();
      }
    }
  });

  // ✅ 연속발행 예약 발행 모드 이벤트 처리
  initContinuousScheduleEvents();

  // ✅ 키워드 필드 추가 버튼
  initContinuousKeywordFields();
}

// ✅ 연속발행 키워드 필드 관리
function initContinuousKeywordFields(): void {
  const addBtn = document.getElementById('continuous-add-keyword-field-btn') as HTMLButtonElement;
  const container = document.getElementById('continuous-keyword-fields-container') as HTMLDivElement;

  if (addBtn && container) {
    addBtn.addEventListener('click', () => {
      const keywordItems = container.querySelectorAll('.continuous-keyword-field-item');
      const newIndex = keywordItems.length;

      const newItem = document.createElement('div');
      newItem.className = 'continuous-keyword-field-item';
      newItem.style.cssText = 'display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem;';
      newItem.innerHTML = `
        <input type="text" class="continuous-keyword-field-input" placeholder="키워드 입력 ${newIndex + 1}" style="flex: 1; background: var(--bg-secondary); border: 1px solid var(--border-medium); border-radius: 8px; color: var(--text-strong); padding: 0.75rem;" data-keyword-index="${newIndex}">
        <button type="button" class="continuous-keyword-field-remove" style="padding: 0.25rem 0.5rem; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;" title="삭제">×</button>
      `;

      container.appendChild(newItem);
      updateContinuousKeywordFieldRemoveButtons();

      const newInput = newItem.querySelector('.continuous-keyword-field-input') as HTMLInputElement;
      if (newInput) {
        setTimeout(() => newInput.focus(), 100);
      }
    });
  }

  // 이벤트 위임으로 삭제 버튼 처리
  if (container) {
    container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('continuous-keyword-field-remove')) {
        const keywordItems = container.querySelectorAll('.continuous-keyword-field-item');
        if (keywordItems.length > 1) {
          target.closest('.continuous-keyword-field-item')?.remove();
          updateContinuousKeywordFieldRemoveButtons();
        }
      }
    });
  }
}

function updateContinuousKeywordFieldRemoveButtons(): void {
  const container = document.getElementById('continuous-keyword-fields-container') as HTMLDivElement;
  const keywordItems = container?.querySelectorAll('.continuous-keyword-field-item');

  if (keywordItems) {
    keywordItems.forEach((item, index) => {
      const removeBtn = item.querySelector('.continuous-keyword-field-remove') as HTMLButtonElement;
      if (removeBtn) {
        removeBtn.style.display = index === 0 ? 'none' : 'inline-block';
      }
    });
  }
}

// ✅ 연속발행 제목 필드 관리
function initContinuousTitleFields(): void {
  return;
}

function updateContinuousTitleFieldRemoveButtons(): void {
  return;
}

// ✅ 연속발행 예약 발행 이벤트 초기화
function initContinuousScheduleEvents(): void {
  const publishModeRadios = document.querySelectorAll('input[name="continuous-publish-mode"]') as NodeListOf<HTMLInputElement>;
  const scheduleContainer = document.getElementById('continuous-schedule-container');
  const scheduleInput = document.getElementById('continuous-schedule-date') as HTMLInputElement;
  const schedulePreview = document.getElementById('continuous-schedule-preview');
  const confirmBtn = document.getElementById('continuous-schedule-confirm-btn') as HTMLButtonElement;

  // 발행 모드 변경 시 예약 컨테이너 표시/숨김
  publishModeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (scheduleContainer) {
        if (radio.value === 'schedule' && radio.checked) {
          scheduleContainer.style.display = 'block';

          // 최소 예약 시간 설정 (현재 시간 + 5분)
          if (scheduleInput) {
            const now = new Date();
            const minDate = new Date(now.getTime() + 5 * 60000); // 5분 후
            const year = minDate.getFullYear();
            const month = String(minDate.getMonth() + 1).padStart(2, '0');
            const day = String(minDate.getDate()).padStart(2, '0');
            const hours = String(minDate.getHours()).padStart(2, '0');
            const minutes = String(Math.ceil(minDate.getMinutes() / 10) * 10 % 60).padStart(2, '0'); // 10분 단위 올림
            const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
            scheduleInput.min = formattedDateTime;
            scheduleInput.value = formattedDateTime;

            // 달력 자동 열기
            setTimeout(() => {
              scheduleInput.showPicker?.();
            }, 200);
          }
        } else if (radio.value !== 'schedule') {
          scheduleContainer.style.display = 'none';
        }
      }
    });
  });

  // 날짜/시간 선택 시 미리보기 및 확인 버튼 활성화
  if (scheduleInput) {
    scheduleInput.addEventListener('change', () => {
      if (scheduleInput.value) {
        const selectedDate = new Date(scheduleInput.value);
        const formattedDate = selectedDate.toLocaleString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        // 미리보기 표시
        if (schedulePreview) {
          schedulePreview.innerHTML = `📅 첫 글: <strong>${formattedDate}</strong><br>💡 이후 글은 30분 간격`;
          schedulePreview.style.display = 'block';
        }

        // 확인 버튼 활성화
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          confirmBtn.style.cursor = 'pointer';
          confirmBtn.innerHTML = `
            <span style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              <span>✅</span>
              <span>예약 설정 완료</span>
            </span>
          `;
        }

        // ✅ [2026-02-14] 자동 확인 제거 — 사용자가 시간까지 설정한 후 직접 확인 버튼 클릭
        // (이전: 0.5초 후 confirmBtn.click() → 시간 설정 전에 발행으로 넘어가는 버그)
      } else {
        // 값이 없으면 비활성화
        if (schedulePreview) {
          schedulePreview.style.display = 'none';
        }
        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.style.background = 'linear-gradient(135deg, #9ca3af, #6b7280)';
          confirmBtn.style.cursor = 'not-allowed';
          confirmBtn.innerHTML = `
            <span style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              <span>⏰</span>
              <span>날짜와 시간을 선택하세요</span>
            </span>
          `;
        }
      }
    });
  }

  // 확인 버튼 클릭 시
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      if (scheduleInput?.value) {
        const selectedDate = new Date(scheduleInput.value);
        const formattedDate = selectedDate.toLocaleString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        toastManager.success(`✅ 예약 설정 완료! 첫 글: ${formattedDate}`);

        // 버튼 상태 변경 (설정 완료 표시)
        confirmBtn.innerHTML = `
          <span style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
            <span>🎉</span>
            <span>예약 완료! (${selectedDate.getMonth() + 1}/${selectedDate.getDate()} ${String(selectedDate.getHours()).padStart(2, '0')}:${String(selectedDate.getMinutes()).padStart(2, '0')})</span>
          </span>
        `;
        confirmBtn.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
      }
    });
  }
}

function updateContinuousUrlFieldRemoveButtons(): void {
  const container = document.getElementById('continuous-url-fields-container') as HTMLDivElement;
  const urlItems = container?.querySelectorAll('.continuous-url-field-item');

  if (urlItems) {
    urlItems.forEach((item, index) => {
      const removeBtn = item.querySelector('.continuous-url-field-remove') as HTMLButtonElement;
      if (removeBtn) {
        // 첫 번째 항목은 삭제 불가, 나머지는 삭제 가능
        removeBtn.style.display = index === 0 ? 'none' : 'inline-block';
      }
    });
  }
}

function getContinuousUrls(): string[] {
  const container = document.getElementById('continuous-url-fields-container') as HTMLDivElement;
  if (!container) return [];

  const urlInputs = container.querySelectorAll('.continuous-url-field-input') as NodeListOf<HTMLInputElement>;
  return Array.from(urlInputs)
    .map(input => input.value.trim())
    .filter(url => url.length > 0 && /^https?:\/\//i.test(url));
}

// 연속 발행 시작
export function startContinuousPublishing(): void {
  console.log('[Continuous] startContinuousPublishing 시작');
  startContinuousPublishingV2().catch((error) => {
    appendLog(`❌ 연속 발행 시작 실패: ${(error as Error).message}`);
  });
}

// ✅ 연속 발행 키워드 수집 (개별 필드 방식)
function getContinuousKeywords(): string[] {
  const container = document.getElementById('continuous-keyword-fields-container') as HTMLDivElement;
  if (!container) return [];

  const keywordInputs = container.querySelectorAll('.continuous-keyword-field-input') as NodeListOf<HTMLInputElement>;
  return Array.from(keywordInputs)
    .map(input => input.value.trim())
    .filter(keyword => keyword.length > 0);
}

// ✅ 연속 발행 제목 수집 (개별 필드 방식)
function getContinuousTitles(): string[] {
  return [];
}



export let continuousQueueV2: ContinuousQueueItem[] = [];
let continuousPublishQueue: Array<{ type: 'url' | 'keyword'; value: string; publishMode: string; scheduleDate?: string; toneStyle?: string }> = [];


export function applyKeywordPrefixToTitleContinuous(title: string, keyword: string): string {
  return applyKeywordPrefixToTitle(title, keyword);
}

// ✅ [2026-02-13] 키워드 제목 옵션 체크박스 상호 배타 헬퍼
export function setupMutualExclusiveCheckboxes(id1: string, id2: string): void {
  const cb1 = document.getElementById(id1) as HTMLInputElement;
  const cb2 = document.getElementById(id2) as HTMLInputElement;
  if (cb1 && !cb1.hasAttribute('data-mutual-exclusive')) {
    cb1.setAttribute('data-mutual-exclusive', 'true');
    cb1.addEventListener('change', () => { if (cb1.checked && cb2) cb2.checked = false; });
  }
  if (cb2 && !cb2.hasAttribute('data-mutual-exclusive')) {
    cb2.setAttribute('data-mutual-exclusive', 'true');
    cb2.addEventListener('change', () => { if (cb2.checked && cb1) cb1.checked = false; });
  }
}

// ✅ [2026-02-13] 키워드 제목 옵션을 window._keywordTitleOptions에 세팅하는 헬퍼
export function setKeywordTitleOptionsFromItem(keyword: string, keywordAsTitle?: boolean, keywordTitlePrefix?: boolean): void {
  if (keywordAsTitle || keywordTitlePrefix) {
    (window as any)._keywordTitleOptions = {
      useKeywordAsTitle: keywordAsTitle || false,
      useKeywordTitlePrefix: keywordTitlePrefix || false,
      keyword
    };
    console.log('[KeywordTitleOpts] 세팅:', { keyword: keyword.substring(0, 30), keywordAsTitle, keywordTitlePrefix });
  } else {
    (window as any)._keywordTitleOptions = null;
  }
}

function applyContinuousTitleOverrides(item: ContinuousQueueItem, structuredContent: any): void {
  if (!structuredContent) return;

  const keyword = (item.customKeyword || '').trim();
  const requestedTitle = (item.customTitle || '').trim();
  
  // ✅ [2026-03-10 FIX] selectedTitle이 URL이면 빈 문자열로 대체하여 URL이 제목으로 사용되는 것을 방지
  const _rawCurrentTitle = String(structuredContent.selectedTitle || structuredContent.title || '').trim();
  let currentTitle = /^https?:\/\//i.test(_rawCurrentTitle) ? '' : _rawCurrentTitle;
  
  if (_rawCurrentTitle && !currentTitle) {
    console.warn(`[ContinuousTitle] ⚠️ selectedTitle이 URL이므로 제거됨: "${_rawCurrentTitle.substring(0, 60)}"`);
  }

  // ✅ [2026-03-13 FIX] 제목이 비어있을 경우 폴백 적용 (URL이 제거되었거나 AI가 제목을 생성하지 못한 경우)
  if (!currentTitle) {
    appendLog(`⚠️ 제목이 없거나 URL입니다. 글 내용에서 대체 제목을 찾습니다...`);
    // 1순위: titleCandidates
    if (Array.isArray(structuredContent.titleCandidates) && structuredContent.titleCandidates.length > 0 && structuredContent.titleCandidates[0]?.text) {
      currentTitle = structuredContent.titleCandidates[0].text;
    }
    // 2순위: titleAlternatives
    else if (Array.isArray(structuredContent.titleAlternatives) && structuredContent.titleAlternatives.length > 0 && structuredContent.titleAlternatives[0]) {
      currentTitle = structuredContent.titleAlternatives[0];
    }
    // 3순위: 첫 번째 소제목
    else if (Array.isArray(structuredContent.headings) && structuredContent.headings.length > 0 && structuredContent.headings[0]?.title) {
      currentTitle = structuredContent.headings[0].title;
    }
    // 4순위: 최후의 보루
    else {
      const today = new Date();
      currentTitle = `정보성 포스팅 - ${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;
    }
    
    // 만약 폴백으로 가져온 제목도 URL이라면 다시 초기화
    if (/^https?:\/\//i.test(currentTitle)) {
      const today = new Date();
      currentTitle = `정보성 포스팅 - ${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;
    }
    
    appendLog(`✅ 대체 제목 적용: "${currentTitle}"`);
  }

  let finalTitle = currentTitle;

  if (requestedTitle) {
    finalTitle = requestedTitle;
  }

  if (keyword) {
    // ✅ [2026-02-08 FIX] 강화된 중복 방지: 키워드의 모든 토큰(2자 이상)이 이미 제목에 포함되어 있으면 건너뜀
    // startsWith만으로는 키워드가 제목 중간에 있을 때 중복이 발생하므로 includes로 강화
    const keywordTokens = keyword.split(/\s+/).filter((t: string) => t.length >= 2);
    const titleLower = finalTitle.toLowerCase();
    const allTokensPresent = keywordTokens.length > 0 && keywordTokens.every((t: string) => titleLower.includes(t.toLowerCase()));
    if (!allTokensPresent) {
      finalTitle = applyKeywordPrefixToTitleContinuous(finalTitle, keyword);
      console.log('[ContinuousTitle] 키워드 접두사 적용:', { keyword, finalTitle });
    } else {
      console.log('[ContinuousTitle] 키워드 토큰 모두 포함됨, 건너뜀:', { keyword, finalTitle });
    }
  }

  // ✅ [2026-03-10 FIX] 최종 방어선: finalTitle이 여전히 URL이면 적용하지 않음
  if (/^https?:\/\//i.test(finalTitle)) {
    console.warn(`[ContinuousTitle] ⚠️ finalTitle이 여전히 URL입니다. 최후 폴백을 적용합니다: "${finalTitle.substring(0, 60)}"`);
    // ✅ [2026-03-13 FIX] 여기서 return해버리면 selectedTitle이 비어있어 발행 실패로 이어지므로 최후 폴백 적용
    const today = new Date();
    finalTitle = keyword || requestedTitle || `정보성 포스팅 - ${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;
  }

  if (!finalTitle) {
    // 이론상 도달 불가능한 최후의 방어선
    const today = new Date();
    finalTitle = `정보성 포스팅 - ${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}`;
  }

  structuredContent.selectedTitle = finalTitle;
  if (Array.isArray(structuredContent.titleAlternatives) && structuredContent.titleAlternatives.length > 0) {
    structuredContent.titleAlternatives = structuredContent.titleAlternatives.map((t: string) => applyKeywordPrefixToTitleContinuous(String(t || ''), keyword || '')).filter(Boolean);
  }
  if (Array.isArray(structuredContent.titleCandidates) && structuredContent.titleCandidates.length > 0) {
    structuredContent.titleCandidates = structuredContent.titleCandidates.map((c: any) => ({
      ...c,
      text: applyKeywordPrefixToTitleContinuous(String(c?.text || ''), keyword || ''),
    }));
  }

  const titleInput = document.getElementById('unified-generated-title') as HTMLInputElement;
  if (titleInput) {
    titleInput.value = finalTitle;
    titleInput.readOnly = false;
  }

  (window as any).currentStructuredContent = structuredContent;
  updateUnifiedPreview(structuredContent);
}

// ✅ 연속 발행 V2 초기화
export function initContinuousPublishingV2(): void {
  if (__continuousV2Initialized) {
    console.log('[Continuous] V2 이미 초기화됨, 건너뜀');
    return;
  }
  __continuousV2Initialized = true;
  console.log('[Continuous] V2 초기화 시작');
  // 탭 전환 이벤트
  const tabs = document.querySelectorAll('.continuous-input-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab;

      // 모든 탭 비활성화
      tabs.forEach(t => {
        (t as HTMLElement).style.background = 'transparent';
        (t as HTMLElement).style.color = 'var(--text-muted)';
        t.classList.remove('active');
      });

      // 선택한 탭 활성화
      (tab as HTMLElement).style.background = 'var(--primary)';
      (tab as HTMLElement).style.color = 'white';
      tab.classList.add('active');

      // 입력 섹션 전환
      document.querySelectorAll('.continuous-input-section').forEach(section => {
        (section as HTMLElement).style.display = 'none';
      });
      const activeSection = document.getElementById(`continuous-${tabName}-input-section`);
      if (activeSection) activeSection.style.display = 'block';
    });
  });

  // ✅ 상세 설정 모달 열기 버튼
  const openSettingsModalBtn = document.getElementById('continuous-open-settings-modal-btn');
  const settingsModal = document.getElementById('continuous-settings-modal');

  if (openSettingsModalBtn && settingsModal) {
    // 모달 열기
    // ✅ [NEW] 연속발행 설정 동기화 함수
    function syncContinuousSettings(source: 'main' | 'modal') {
      const fields = [
        { main: 'continuous-content-mode-select', modal: 'continuous-modal-content-mode' },
        { main: 'continuous-tone-style-select', modal: 'continuous-modal-tone-style' },
        { main: 'continuous-image-source-select', modal: 'continuous-modal-image-source' },
        { main: 'continuous-cta-type', modal: 'continuous-modal-cta-type' },
        { main: 'continuous-cta-url', modal: 'continuous-modal-cta-url' },
        { main: 'continuous-cta-text', modal: 'continuous-modal-cta-text' },
        { main: 'continuous-interval-value', modal: 'continuous-modal-interval-value' },
        { main: 'continuous-interval-unit', modal: 'continuous-modal-interval-unit' },
        { main: 'continuous-include-thumbnail-text', modal: 'continuous-modal-include-thumbnail-text' },
        // ✅ [2026-02-19] 쇼핑커넥트 필드 동기화 (서브탭 ↔ 메인)
        { main: 'continuous-affiliate-link', modal: 'continuous-modal-shopping-affiliate-link' },
        { main: 'continuous-video-option', modal: 'continuous-modal-shopping-video-option' }
      ];

      fields.forEach(f => {
        const mainEl = document.getElementById(f.main) as any;
        const modalEl = document.getElementById(f.modal) as any;
        if (!mainEl || !modalEl) return;

        if (source === 'main') {
          if (mainEl.type === 'checkbox') modalEl.checked = mainEl.checked;
          else modalEl.value = mainEl.value;
        } else {
          if (mainEl.type === 'checkbox') mainEl.checked = modalEl.checked;
          else mainEl.value = modalEl.value;
        }
      });

      // 카테고리 동기화 (Hidden input 및 텍스트)
      const mainCatInput = document.getElementById('continuous-category-select') as HTMLInputElement;
      const modalCatInput = document.getElementById('continuous-modal-category-select') as HTMLInputElement;
      const mainCatText = document.getElementById('continuous-category-text');
      const modalCatText = document.getElementById('continuous-modal-category-text');

      if (source === 'main' && mainCatInput && modalCatInput) {
        modalCatInput.value = mainCatInput.value;
        if (modalCatText) modalCatText.textContent = mainCatText?.textContent || '일반';
      } else if (source === 'modal' && mainCatInput && modalCatInput) {
        mainCatInput.value = modalCatInput.value;
        if (mainCatText) mainCatText.textContent = modalCatText?.textContent || '일반';
      }

      // 실제 블로그 카테고리 동기화
      const mainRealCat = document.getElementById('continuous-real-category-select') as HTMLSelectElement;
      const modalRealCat = document.getElementById('continuous-modal-real-category') as HTMLSelectElement;
      if (source === 'main' && mainRealCat && modalRealCat) {
        modalRealCat.innerHTML = mainRealCat.innerHTML;
        modalRealCat.value = mainRealCat.value;
        const container = document.getElementById('continuous-modal-real-category-container');
        if (container) container.style.display = mainRealCat.value ? 'block' : 'none';
      } else if (source === 'modal' && mainRealCat && modalRealCat) {
        mainRealCat.innerHTML = modalRealCat.innerHTML;
        mainRealCat.value = modalRealCat.value;
      }

      // 발행 모드 (라디오 버튼)
      if (source === 'main') {
        const checked = document.querySelector('input[name="continuous-publish-mode"]:checked') as HTMLInputElement;
        if (checked) {
          const modalRadio = document.querySelector(`input[name="continuous-modal-publish-mode"][value="${checked.value}"]`) as HTMLInputElement;
          if (modalRadio) modalRadio.checked = true;
          const modalSchedule = document.getElementById('continuous-modal-schedule-container');
          if (modalSchedule) modalSchedule.style.display = checked.value === 'schedule' ? 'block' : 'none';
        }
      } else {
        const checked = document.querySelector('input[name="continuous-modal-publish-mode"]:checked') as HTMLInputElement;
        if (checked) {
          const mainRadio = document.querySelector(`input[name="continuous-publish-mode"][value="${checked.value}"]`) as HTMLInputElement;
          if (mainRadio) mainRadio.checked = true;
        }
      }
    }

    // ✅ 메인 UI 이벤트 리스너 등록 (변경 시 모달로 동기화)
    ['continuous-content-mode-select', 'continuous-tone-style-select', 'continuous-image-source-select',
      'continuous-cta-type', 'continuous-cta-url', 'continuous-cta-text',
      'continuous-interval-value', 'continuous-interval-unit', 'continuous-include-thumbnail-text',
      'continuous-category-select'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => syncContinuousSettings('main'));
      });
    document.querySelectorAll('input[name="continuous-publish-mode"]').forEach(el => {
      el.addEventListener('change', () => syncContinuousSettings('main'));
    });

    // 메인 UI 카테고리 버튼 리스너
    document.getElementById('continuous-category-btn')?.addEventListener('click', () => {
      (window as any).openCategoryModalInContinuousMode?.('main');
    });

    // ✅ [2026-01-19] 배너 커스터마이징 바로가기 버튼들 - 이벤트 위임 방식 (동적 버튼 지원)
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('#continuous-open-banner-settings-btn, #fullauto-open-banner-settings-btn, #ma-open-banner-settings-btn, #ma-shopping-goto-banner-btn') as HTMLElement;

      if (!btn) return;

      const btnId = btn.id;
      console.log('[BannerNav] 배너 버튼 클릭됨:', btnId);

      // ✅ [2026-01-21] 모든 관련 모달 강제 닫기 (display + aria-hidden)
      // ✅ [2026-01-27] ma-fullauto-setting-modal, multi-account-modal 추가
      const modalsToClose = ['continuous-mode-modal', 'ma-publish-modal', 'continuous-settings-modal', 'ma-account-edit-modal', 'ma-fullauto-setting-modal', 'multi-account-modal'];
      modalsToClose.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
          modal.style.display = 'none';
          modal.setAttribute('aria-hidden', 'true');
        }
      });

      // 썸네일/배너 생성기 탭으로 이동
      const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement;
      console.log('[BannerNav] imageToolsTab 찾기:', !!imageToolsTab);
      if (imageToolsTab) {
        imageToolsTab.click();

        // 쇼핑커넥트 배너 서브탭으로 이동
        setTimeout(() => {
          const bannerSubtab = document.querySelector('[data-subtab="shopping-banner"]') as HTMLElement;
          console.log('[BannerNav] bannerSubtab 찾기:', !!bannerSubtab);
          if (bannerSubtab) {
            bannerSubtab.click();
            toastManager.info('🎨 배너 설정 화면입니다.');
          }
        }, 150);
      }
    });

    // ✅ [2026-01-20] 수동 썸네일 커스터마이징 버튼들 - 이벤트 위임 방식
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('#continuous-goto-thumbnail-btn, #continuous-modal-goto-thumbnail-btn, #ma-shopping-goto-thumbnail-btn, #fullauto-open-thumbnail-settings-btn, #ma-setting-goto-thumbnail-btn') as HTMLElement;

      if (!btn) return;

      const btnId = btn.id;
      console.log('[ThumbnailNav] 썸네일 버튼 클릭됨:', btnId);

      // ✅ [2026-01-21] 모든 관련 모달 강제 닫기 (display + aria-hidden)
      // ✅ [2026-01-27] ma-fullauto-setting-modal, multi-account-modal 추가
      const modalsToClose = ['continuous-mode-modal', 'ma-publish-modal', 'continuous-settings-modal', 'ma-account-edit-modal', 'ma-fullauto-setting-modal', 'multi-account-modal'];
      console.log('[ThumbnailNav] 모달들 닫기 시작:', modalsToClose);
      modalsToClose.forEach(modalId => {
        const modal = document.getElementById(modalId);
        console.log(`[ThumbnailNav] 모달 "${modalId}" 찾기:`, !!modal, modal?.style?.display);
        if (modal) {
          modal.style.display = 'none';
          modal.setAttribute('aria-hidden', 'true');
          console.log(`[ThumbnailNav] 모달 "${modalId}" 닫힘 완료`);
        }
      });

      // 썸네일/배너 생성기 탭으로 이동
      const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement;
      console.log('[ThumbnailNav] imageToolsTab 찾기:', !!imageToolsTab);
      if (imageToolsTab) {
        imageToolsTab.click();

        // 썸네일 서브탭으로 이동 (기본 서브탭)
        setTimeout(() => {
          const thumbnailSubtab = document.querySelector('[data-subtab="thumbnail-generator"]') as HTMLElement;
          console.log('[ThumbnailNav] thumbnailSubtab 찾기:', !!thumbnailSubtab);
          if (thumbnailSubtab) {
            thumbnailSubtab.click();
            toastManager.info('🎨 썸네일 생성기 화면입니다.');
          }
        }, 150);
      }
    });

    openSettingsModalBtn.addEventListener('click', () => {
      // 편집 인덱스 초기화 (-1 = 새 항목용)
      const editingIndexInput = document.getElementById('continuous-settings-editing-index') as HTMLInputElement;
      if (editingIndexInput) editingIndexInput.value = '-1';

      const modal = document.getElementById('continuous-settings-modal');
      if (modal) {
        // 모달 제목 및 버튼 텍스트 원복
        const titleEl = modal.querySelector('h3');
        if (titleEl) titleEl.innerHTML = '⚙️ 상세 설정 (연속 발행)';
        const saveBtn = document.getElementById('continuous-settings-modal-save');
        if (saveBtn) saveBtn.innerHTML = '💾 설정 저장 및 닫기';
      }

      // ✅ 예약 날짜 기본값 설정 (오늘 날짜로)
      const scheduleDateInput = document.getElementById('continuous-modal-schedule-date') as HTMLInputElement;
      if (scheduleDateInput && !scheduleDateInput.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        scheduleDateInput.value = `${yyyy}-${mm}-${dd}`;
      }

      // 열 때 현재 메인 UI 값을 모달에 반영
      syncContinuousSettings('main');

      settingsModal.style.display = 'flex';
      settingsModal.setAttribute('aria-hidden', 'false');
    });

    // ✅ 발행 모드 라디오 버튼 변경 시 예약 컨테이너 토글
    document.querySelectorAll('input[name="continuous-modal-publish-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        const scheduleContainer = document.getElementById('continuous-modal-schedule-container');
        if (scheduleContainer) {
          scheduleContainer.style.display = target.value === 'schedule' ? 'block' : 'none';
        }
      });
    });

    // ✅ [2026-01-20] 서브탭 전환 이벤트 핸들러
    document.querySelectorAll('.continuous-modal-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const subtab = (btn as HTMLElement).dataset.subtab;
        if (!subtab) return;

        // 모든 버튼 비활성화
        document.querySelectorAll('.continuous-modal-subtab-btn').forEach(b => {
          (b as HTMLElement).style.borderBottomColor = 'transparent';
          (b as HTMLElement).style.color = 'var(--text-muted)';
          b.classList.remove('active');
        });

        // 클릭한 버튼 활성화
        (btn as HTMLElement).style.borderBottomColor = 'var(--primary)';
        (btn as HTMLElement).style.color = 'var(--primary)';
        btn.classList.add('active');

        // 모든 서브탭 콘텐츠 숨기기
        document.querySelectorAll('.continuous-modal-subtab-content').forEach(c => {
          (c as HTMLElement).style.display = 'none';
        });

        // 선택한 서브탭 콘텐츠 표시
        const content = document.getElementById(`continuous-modal-subtab-${subtab}-content`);
        if (content) content.style.display = 'block';

        // ✅ [2026-02-19] 쇼핑커넥트 서브탭 클릭 시 → 콘텐츠 모드 자동 전환
        if (subtab === 'shopping' && !(window as any)._syncingShoppingTab) {
          (window as any)._syncingShoppingTab = true;
          const modalContentMode = document.getElementById('continuous-modal-content-mode') as HTMLSelectElement;
          if (modalContentMode) {
            // affiliate 옵션 표시
            const affiliateOption = document.getElementById('continuous-modal-affiliate-option') as HTMLOptionElement;
            if (affiliateOption) affiliateOption.style.display = '';
            modalContentMode.value = 'affiliate';
            modalContentMode.dispatchEvent(new Event('change'));
            console.log('[연속발행모달] 🛒 쇼핑커넥트 서브탭 클릭 → contentMode 자동 전환: affiliate');
          }
          // 메인 콘텐츠 모드도 동기화
          const mainContentMode = document.getElementById('continuous-content-mode-select') as HTMLSelectElement;
          if (mainContentMode) {
            mainContentMode.value = 'affiliate';
            mainContentMode.dispatchEvent(new Event('change'));
          }

          // ✅ [2026-02-19] localStorage → 서브탭 UI 복원
          const scSubSrc = localStorage.getItem('scSubImageSource') || 'nano-banana-pro';
          document.querySelectorAll('input[name="continuous-modal-shopping-subimage-source"]').forEach(r => {
            (r as HTMLInputElement).checked = (r as HTMLInputElement).value === scSubSrc;
          });
          const autoThumb = document.getElementById('continuous-modal-shopping-auto-thumbnail') as HTMLInputElement;
          if (autoThumb) autoThumb.checked = localStorage.getItem('scAutoThumbnailSetting') === 'true';
          const subAutoBanner = document.getElementById('continuous-modal-shopping-auto-random-banner') as HTMLInputElement;
          const mainBannerEl = document.getElementById('continuous-auto-banner-generate') as HTMLInputElement;
          if (subAutoBanner && mainBannerEl) subAutoBanner.checked = mainBannerEl.checked;

          (window as any)._syncingShoppingTab = false;
        }

        console.log(`[연속발행모달] 서브탭 전환: ${subtab}`);
      });
    });

    // ✅ [2026-01-20] 썸네일 커스터마이징 버튼 → 썸네일 생성기 탭으로 이동
    document.getElementById('continuous-modal-goto-thumbnail-btn')?.addEventListener('click', () => {
      const modal = document.getElementById('continuous-settings-modal');
      if (modal) modal.style.display = 'none';

      // 이미지 도구 탭으로 이동
      const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement;
      if (imageToolsTab) {
        imageToolsTab.click();
        setTimeout(() => {
          const thumbnailSubtab = document.querySelector('[data-subtab="thumbnail"]') as HTMLElement;
          if (thumbnailSubtab) {
            thumbnailSubtab.click();
            toastManager.info('🎨 썸네일 커스터마이징 화면입니다. 설정 후 연속발행으로 돌아가세요.');
          }
        }, 150);
      }
    });

    // ✅ [2026-01-27] 연속발행/다중계정 이미지 설정 버튼 → 자동완성 이미지 설정 모달 열기 (이벤트 위임)
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('#continuous-open-image-settings-btn, #continuous-modal-open-image-settings-btn, #ma-open-image-settings-btn') as HTMLElement;

      if (!btn) return;

      console.log('[ImageSettings] 이미지 설정 버튼 클릭됨:', btn.id);

      // ✅ [2026-02-02] 기존 모달들을 숨김 처리하여 z-index 충돌 방지
      const modalsToHide = ['continuous-settings-modal', 'continuous-mode-modal', 'ma-fullauto-setting-modal', 'ma-publish-modal', 'multi-account-modal'];
      modalsToHide.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal && modal.style.display !== 'none') {
          modal.setAttribute('data-was-visible', 'true');
          modal.style.visibility = 'hidden';
          console.log(`[ImageSettings] 임시 숨김: ${modalId}`);
        }
      });

      // openHeadingImageModal 함수 호출 (./components/HeadingImageSettings.js에서 import됨)
      if (typeof openHeadingImageModal === 'function') {
        openHeadingImageModal();
        console.log('[ImageSettings] ✅ 자동완성 이미지 설정 모달 열기 완료');
      } else {
        console.warn('[ImageSettings] ⚠️ openHeadingImageModal 함수를 찾을 수 없습니다');
        toastManager.warning('이미지 설정 모달을 열 수 없습니다. 앱을 새로고침해주세요.');
      }
    });


    // ✅ [2026-01-27] 배너 커스터마이징 버튼들 → 배너 생성기 탭으로 이동 (이벤트 위임)
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('#continuous-modal-goto-banner-btn, #ma-shopping-goto-banner-btn') as HTMLElement;

      if (!btn) return;

      console.log('[BannerNav] 배너 버튼 클릭됨:', btn.id);

      // ✅ [2026-01-27] 모든 관련 모달 강제 닫기 (multi-account-modal 추가)
      const modalsToClose = ['continuous-settings-modal', 'continuous-mode-modal', 'ma-fullauto-setting-modal', 'ma-publish-modal', 'multi-account-modal'];
      modalsToClose.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
          modal.style.display = 'none';
          modal.setAttribute('aria-hidden', 'true');
        }
      });

      const imageToolsTab = document.querySelector('[data-tab="image-tools"]') as HTMLElement;
      if (imageToolsTab) {
        imageToolsTab.click();
        setTimeout(() => {
          const bannerSubtab = document.querySelector('[data-subtab="shopping-banner"]') as HTMLElement;
          if (bannerSubtab) {
            bannerSubtab.click();
            toastManager.info('🎨 배너 커스터마이징 화면입니다.');
          }
        }, 150);
      }
    });

    // ✅ [2026-02-07] 예약 설정 서브탭 - 랜덤 예약 배분 모달 열기
    document.getElementById('open-random-schedule-modal-btn')?.addEventListener('click', () => {
      showRandomScheduleModal();
    });

    // ✅ [2026-02-07] 예약 설정 서브탭 - 개별 예약 설정 모달 열기
    document.getElementById('open-individual-schedule-modal-btn')?.addEventListener('click', () => {
      showIndividualScheduleModal();
    });

    // 예약 상태 요약 업데이트
    updateScheduleStatusSummary();

    // 모달 닫기 버튼
    document.getElementById('continuous-settings-modal-close')?.addEventListener('click', () => {
      settingsModal.style.display = 'none';
      settingsModal.setAttribute('aria-hidden', 'true');
    });

    document.getElementById('continuous-settings-modal-cancel')?.addEventListener('click', () => {
      settingsModal.style.display = 'none';
      settingsModal.setAttribute('aria-hidden', 'true');
    });

    // 모달 저장 버튼
    document.getElementById('continuous-settings-modal-save')?.addEventListener('click', () => {
      const editingIndexInput = document.getElementById('continuous-settings-editing-index') as HTMLInputElement;
      const editingIndex = parseInt(editingIndexInput?.value || '-1', 10);

      // 모달에서 설정값 읽기
      const categorySelect = document.getElementById('continuous-modal-category-select') as HTMLInputElement;
      const contentModeSelect = document.getElementById('continuous-modal-content-mode') as HTMLSelectElement;
      const toneStyleSelect = document.getElementById('continuous-modal-tone-style') as HTMLSelectElement;
      const imageSourceSelect = document.getElementById('continuous-modal-image-source') as HTMLSelectElement;
      const ctaTypeSelect = document.getElementById('continuous-modal-cta-type') as HTMLSelectElement;
      const ctaUrlInput = document.getElementById('continuous-modal-cta-url') as HTMLInputElement;
      const ctaTextInput = document.getElementById('continuous-modal-cta-text') as HTMLInputElement;
      const intervalValueInput = document.getElementById('continuous-modal-interval-value') as HTMLInputElement;
      const intervalUnitSelect = document.getElementById('continuous-modal-interval-unit') as HTMLSelectElement;
      const publishModeRadio = document.querySelector('input[name="continuous-modal-publish-mode"]:checked') as HTMLInputElement;
      const includeThumbnailTextCheck = document.getElementById('continuous-modal-include-thumbnail-text') as HTMLInputElement;
      const useAiImageCheck = document.getElementById('continuous-modal-use-ai-image') as HTMLInputElement;
      const createThumbnailCheck = document.getElementById('continuous-modal-create-product-thumbnail') as HTMLInputElement;

      if (editingIndex >= 0) {
        // ✅ [항목 수정 모드] 큐 항목 업데이트
        const item = continuousQueueV2[editingIndex];
        if (item) {
          const realCategorySelect = document.getElementById('continuous-modal-real-category') as HTMLSelectElement;
          const realCategory = realCategorySelect?.value || '';
          const realCategoryName = (realCategorySelect?.selectedIndex >= 0) ? realCategorySelect.options[realCategorySelect.selectedIndex].text : '';

          // 예약 날짜/시간
          let scheduleDate = item.scheduleDate;
          if (publishModeRadio?.value === 'schedule') {
            const dateVal = (document.getElementById('continuous-modal-schedule-date') as HTMLInputElement).value;
            const timeVal = (document.getElementById('continuous-modal-schedule-time') as HTMLInputElement).value;
            if (dateVal && timeVal) scheduleDate = `${dateVal}T${timeVal}`;
          }

          continuousQueueV2[editingIndex] = {
            ...item,
            category: categorySelect?.value || 'entertainment',
            contentMode: (contentModeSelect?.value || 'seo') as any,
            toneStyle: toneStyleSelect?.value || 'professional',
            imageSource: imageSourceSelect?.value || getFullAutoImageSource(),
            ctaType: ctaTypeSelect?.value || 'none',
            ctaUrl: ctaUrlInput?.value || '',
            ctaText: ctaTextInput?.value || '',
            publishMode: (publishModeRadio?.value || 'publish') as any,
            interval: parseInt(intervalValueInput?.value || '30') * parseInt(intervalUnitSelect?.value || '1'),
            realCategory,
            realCategoryName,
            scheduleDate,
            // ✅ [2026-01-28 FIX] localStorage 설정 우선 적용
            includeThumbnailText: localStorage.getItem('thumbnailTextInclude') === 'true' || includeThumbnailTextCheck?.checked || false,
            useAiImage: useAiImageCheck?.checked ?? true,
            createProductThumbnail: createThumbnailCheck?.checked ?? false
          };
          renderQueueListV2();
          toastManager.success('✅ 항목이 수정되었습니다.');
        }
      } else {
        // ✅ [일반 설정 저장 모드] 메인 UI로 동기화
        syncContinuousSettings('modal');
        toastManager.success('✅ 설정이 저장되었습니다.');
      }

      settingsModal.style.display = 'none';
      settingsModal.setAttribute('aria-hidden', 'true');
    });

    // 발행 간격 프리셋 버튼
    document.querySelectorAll('.continuous-modal-interval-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = (btn as HTMLButtonElement).dataset.value || '30';
        const unit = (btn as HTMLButtonElement).dataset.unit || '1';
        const valueInput = document.getElementById('continuous-modal-interval-value') as HTMLInputElement;
        const unitSelect = document.getElementById('continuous-modal-interval-unit') as HTMLSelectElement;
        if (valueInput) valueInput.value = value;
        if (unitSelect) unitSelect.value = unit;
      });
    });

    // ✅ 일괄 예약 자동 시간 세팅 버튼
    document.getElementById('continuous-modal-auto-schedule-btn')?.addEventListener('click', () => {
      const startDateInput = document.getElementById('continuous-modal-schedule-date') as HTMLInputElement;
      const startTimeInput = document.getElementById('continuous-modal-schedule-time') as HTMLInputElement;
      const intervalInput = document.getElementById('continuous-modal-schedule-interval') as HTMLInputElement;
      const intervalUnitSelect = document.getElementById('continuous-modal-schedule-interval-unit') as HTMLSelectElement;

      // 큐에 있는 항목 개수 확인
      const queue = continuousQueueV2;
      const queueCount = queue.length;

      if (queueCount === 0) {
        toastManager.warning('⚠️ 먼저 발행 대기열에 항목을 추가해주세요.');
        return;
      }

      if (!startDateInput?.value || !startTimeInput?.value) {
        toastManager.warning('⚠️ 시작 날짜와 시간을 선택해주세요.');
        return;
      }

      // 시작 시간 파싱
      const startDate = new Date(`${startDateInput.value}T${startTimeInput.value}`);
      const avgIntervalMinutes = parseInt(intervalInput?.value || '1') * parseInt(intervalUnitSelect?.value || '60');

      console.log(`[AutoSchedule] 자동 예약 시간 생성: ${queueCount}개 항목, 평균 간격 ${avgIntervalMinutes}분`);

      // ✅ [2026-03-17 MOD] scheduleDistributor 모듈로 위임 (70줄 → 10줄)
      const distributed = (window as any).distributeByInterval(queueCount, {
        baseDate: startDateInput.value,
        baseTime: startTimeInput.value,
        intervalMinutes: avgIntervalMinutes,
        firstItemRandomOffset: true, // ✅ [2026-03-17] 원래 동작 보존: 첫 항목에 랜덤 오프셋
      });

      // 각 큐 항목에 예약 시간 적용
      queue.forEach((item, index) => {
        item.scheduleDate = distributed[index].date;
        item.scheduleTime = distributed[index].time;
        item.publishMode = 'schedule';
        item.scheduleUserModified = undefined; // 자동 생성 시 수동 플래그 초기화
        console.log(`[AutoSchedule] ${index + 1}번 항목: ${item.scheduleDate} ${item.scheduleTime}`);
      });

      // UI 업데이트
      (window as any).renderContinuousQueue?.();

      // 성공 메시지
      const firstSlot = distributed[0];
      const lastSlot = distributed[distributed.length - 1];
      toastManager.success(`✅ ${queueCount}개 항목에 랜덤 예약 시간 설정 완료!\n${firstSlot.time} ~ ${lastSlot.time}`);
    });
    document.getElementById('continuous-modal-category-btn')?.addEventListener('click', () => {
      (window as any).openCategoryModalInContinuousMode?.('continuous-settings');
    });

    // ✅ 모달 블로그 카테고리 분석 버튼 이벤트
    document.getElementById('continuous-modal-analyze-category-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('continuous-modal-analyze-category-btn') as HTMLButtonElement;
      if (!btn) return;

      try {
        btn.disabled = true;
        btn.innerHTML = '⏳ 분석중...';

        // 스마트 자동발행 탭에서 선택된 계정 정보 가져오기
        const naverIdInput = document.getElementById('naver-id') as HTMLInputElement;
        const naverPasswordInput = document.getElementById('naver-password') as HTMLInputElement;

        let naverId = naverIdInput?.value?.trim() || '';
        let naverPassword = naverPasswordInput?.value?.trim() || '';

        if (!naverId || !naverPassword) {
          const config = await window.api.getConfig();
          if (!naverId && (config as any)?.savedNaverId) {
            naverId = (config as any).savedNaverId;
          }
          if (!naverPassword && (config as any)?.savedNaverPassword) {
            naverPassword = (config as any).savedNaverPassword;
          }
        }

        if (!naverId) {
          toastManager.warning('스마트 자동발행 탭에서 네이버 계정을 먼저 설정해주세요.');
          return;
        }

        const response = await (window.api as any).fetchBlogCategories({
          naverId,
          naverPassword
        });

        if (response.success && response.categories && response.categories.length > 0) {
          const realCatContainer = document.getElementById('continuous-modal-real-category-container');
          const realCatSelect = document.getElementById('continuous-modal-real-category') as HTMLSelectElement;

          if (realCatContainer && realCatSelect) {
            realCatSelect.innerHTML = response.categories.map((cat: any) =>
              `<option value="${cat.categoryNo || cat.id}">${cat.categoryName || cat.name}</option>`
            ).join('');
            realCatContainer.style.display = 'block';
          }

          toastManager.success(`✅ ${response.categories.length}개의 블로그 카테고리 분석 완료`);
        } else {
          toastManager.error(response.message || '카테고리 분석 실패');
        }
      } catch (err) {
        console.error('카테고리 분석 오류:', err);
        toastManager.error('분석 중 오류 발생');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span style="font-size: 1rem;">🔍</span> <span>블로그 카테고리 분석하기</span>';
      }
    });
  }

  // ✅ [2026-01-22] 리뷰형 글쓰기가 가능한 카테고리 목록 (쇼핑커넥트 모드 활성화)
  // 모든 상품 리뷰/추천이 가능한 카테고리를 포함하도록 확장
  const AFFILIATE_ENABLED_CATEGORIES = [
    // ===== 기존 카테고리 =====
    'it_computer',        // IT/컴퓨터 (가전, 디지털)
    'shopping_review',    // 상품리뷰
    'fashion',            // 패션/뷰티
    'food_recipe',        // 요리/레시피
    'tasty_restaurant',   // 맛집
    'parenting',          // 육아/결혼 (유아용품)
    'interior',           // 인테리어/DIY (가구, 소품)
    'pet',                // 반려동물 (펫용품)
    'car',                // 자동차 (자동차용품)
    'game',               // 게임 (게임기, 주변기기)
    'hobby',              // 취미 (취미용품)
    'travel_domestic',    // 국내여행 (여행용품)
    'travel_world',       // 세계여행 (여행용품)

    // ===== 추가 카테고리 (2026-01-22) =====
    'health',             // 건강/의학 (건강식품, 운동기구)
    'sports',             // 스포츠 (스포츠용품)
    'gardening',          // 원예/재배 (원예용품)
    'photo',              // 사진 (카메라, 촬영장비)
    'business_economy',   // 비즈니스/경제 (사무용품, 책)
    'education_scholarship', // 교육/학문 (교재, 학습기기)
    'language',           // 어학/외국어 (어학교재)
    'realestate',         // 부동산 (인테리어, 가구)
    'self_dev',           // 자기계발 (도서, 강의)
    'general',            // 일상/생각 (일상용품)
    'literature',         // 문학/책 (도서)
    'movie',              // 영화 (영화용품, DVD)
    'art_design',         // 미술/디자인 (미술용품)
    'music',              // 음악 (악기, 음향기기)
    'good_writing',       // 좋은글/이미지 (인테리어소품)
    'cartoon',            // 만화/애니 (피규어, 굿즈)
  ];

  // 카테고리에 따라 쇼핑커넥트 옵션 표시/숨김
  function updateAffiliateOptionVisibility(categoryValue: string, modeSelectId: string) {
    const affiliateOption = document.querySelector(`#${modeSelectId} option[value="affiliate"]`) as HTMLOptionElement;
    if (affiliateOption) {
      const isAffiliateEnabled = AFFILIATE_ENABLED_CATEGORIES.includes(categoryValue);
      affiliateOption.style.display = isAffiliateEnabled ? 'block' : 'none';
      // 쇼핑커넥트가 선택된 상태에서 비활성화되면 SEO로 변경
      const modeSelect = document.getElementById(modeSelectId) as HTMLSelectElement;
      if (modeSelect && modeSelect.value === 'affiliate' && !isAffiliateEnabled) {
        modeSelect.value = 'seo';
      }
    }
  }

  // 전역에 함수 등록
  (window as any).updateAffiliateOptionVisibility = updateAffiliateOptionVisibility;
  (window as any).AFFILIATE_ENABLED_CATEGORIES = AFFILIATE_ENABLED_CATEGORIES;

  // ✅ 연속발행 콘텐츠 모드 변경 시 쇼핑 커넥트 설정 UI 토글
  const continuousContentModeSelect = document.getElementById('continuous-content-mode-select') as HTMLSelectElement;
  if (continuousContentModeSelect) {
    continuousContentModeSelect.addEventListener('change', () => {
      const isAffiliateMode = continuousContentModeSelect.value === 'affiliate';
      const shoppingConnectSettings = document.getElementById('continuous-shopping-connect-settings');
      if (shoppingConnectSettings) {
        shoppingConnectSettings.style.display = isAffiliateMode ? 'block' : 'none';
      }
    });
  }

  // ✅ [2026-02-19] 상세 설정 모달의 콘텐츠 모드 변경 시 쇼핑커넥트 서브탭 자동 이동
  const continuousModalContentModeSelect = document.getElementById('continuous-modal-content-mode') as HTMLSelectElement;
  if (continuousModalContentModeSelect) {
    continuousModalContentModeSelect.addEventListener('change', () => {
      const isAffiliateMode = continuousModalContentModeSelect.value === 'affiliate';
      // ✅ [2026-02-19] 쇼핑커넥트 모드 선택 시 → 쇼핑커넥트 서브탭으로 자동 이동
      if (isAffiliateMode && !(window as any)._syncingShoppingTab) {
        (window as any)._syncingShoppingTab = true;
        const shoppingTabBtn = document.querySelector('.continuous-modal-subtab-btn[data-subtab="shopping"]') as HTMLElement;
        if (shoppingTabBtn) {
          shoppingTabBtn.click();
          console.log('[연속발행모달] 🛒 콘텐츠 모드 affiliate 선택 → 쇼핑커넥트 서브탭 자동 이동');
        }
        (window as any)._syncingShoppingTab = false;
      }
    });
  }

  // ✅ [2026-02-19] 쇼핑커넥트 서브탭 필드 → 메인 UI 필드 동기화
  const modalShoppingAffiliateLink = document.getElementById('continuous-modal-shopping-affiliate-link') as HTMLInputElement;
  if (modalShoppingAffiliateLink) {
    modalShoppingAffiliateLink.addEventListener('input', () => {
      const mainAffiliateLink = document.getElementById('continuous-affiliate-link') as HTMLInputElement;
      if (mainAffiliateLink) {
        mainAffiliateLink.value = modalShoppingAffiliateLink.value;
        console.log('[연속발행모달] 🔗 서브탭 제휴링크 → 메인 필드 동기화:', modalShoppingAffiliateLink.value);
      }
    });
  }

  // ✅ [2026-02-19] 쇼핑커넥트 서브탭 → localStorage/메인UI 동기화 (Bug 1, 3 수정)
  // (1) 소제목 이미지 소스 라디오 → localStorage
  document.querySelectorAll('input[name="continuous-modal-shopping-subimage-source"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const value = (e.target as HTMLInputElement).value;
      localStorage.setItem('scSubImageSource', value);
      console.log('[쇼핑커넥트 서브탭] 📷 이미지 소스 → localStorage:', value);
    });
  });

  // (2) 자동 썸네일 체크박스 → localStorage
  const modalAutoThumbnail = document.getElementById('continuous-modal-shopping-auto-thumbnail') as HTMLInputElement;
  if (modalAutoThumbnail) {
    modalAutoThumbnail.addEventListener('change', () => {
      localStorage.setItem('scAutoThumbnailSetting', String(modalAutoThumbnail.checked));
      console.log('[쇼핑커넥트 서브탭] 🖼️ 자동 썸네일 → localStorage:', modalAutoThumbnail.checked);
    });
  }

  // (3) 배너 자동 랜덤 체크박스 → 메인 UI 체크박스 양방향 동기화
  const modalAutoBanner = document.getElementById('continuous-modal-shopping-auto-random-banner') as HTMLInputElement;
  if (modalAutoBanner) {
    modalAutoBanner.addEventListener('change', () => {
      const mainBanner = document.getElementById('continuous-auto-banner-generate') as HTMLInputElement;
      if (mainBanner) {
        mainBanner.checked = modalAutoBanner.checked;
        console.log('[쇼핑커넥트 서브탭] 🎲 배너 자동 생성 → 메인 동기화:', modalAutoBanner.checked);
      }
    });
  }

  // ✅ 풀오토 다중계정 세팅 모달의 콘텐츠 모드 변경 시 쇼핑 커넥트 이미지 옵션 토글
  const maContentModeSelect = document.getElementById('ma-setting-content-mode') as HTMLSelectElement;
  if (maContentModeSelect) {
    maContentModeSelect.addEventListener('change', () => {
      const isAffiliateMode = maContentModeSelect.value === 'affiliate';
      // 수집 이미지 기반 AI 생성 옵션 (쇼핑커넥트 전용)
      const maImageOptions = document.getElementById('ma-shopping-connect-image-options');
      if (maImageOptions) {
        maImageOptions.style.display = isAffiliateMode ? 'grid' : 'none';
      }
      // 쇼핑 커넥트 설정 섹션 (제휴 링크 등)
      const maShoppingConnectSettings = document.getElementById('ma-shopping-connect-settings');
      if (maShoppingConnectSettings) {
        maShoppingConnectSettings.style.display = isAffiliateMode ? 'block' : 'none';
      }
    });
  }

  // ✅ 이전글 선택 모달 표시 함수
  function showContinuousPrevPostModal(): void {
    try {
      // 생성된 포스트 목록 로드
      const posts = loadGeneratedPosts();
      const publishedPosts = posts.filter((p: any) => p.publishedUrl && p.publishedUrl.trim() !== '');

      if (publishedPosts.length === 0) {
        toastManager.warning('발행된 이전 글이 없습니다. 먼저 글을 발행한 뒤 다시 시도하세요.');
        return;
      }

      // 포스트 선택 모달 생성
      const modalHtml = `
        <div id="prev-post-selection-modal" class="modal-backdrop" style="display: flex; z-index: 30000; backdrop-filter: blur(8px);">
          <div class="modal-panel" style="max-width: 600px; width: 95%; max-height: 80vh; overflow: hidden; background: var(--bg-primary); border-radius: 16px; border: 2px solid rgba(59, 130, 246, 0.4);">
            <div style="padding: 1.25rem; border-bottom: 1px solid var(--border-light); background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(0,0,0,0)); display: flex; align-items: center; justify-content: space-between;">
              <h3 style="margin: 0; color: #3b82f6; font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 1.3rem;">📋</span> 이전글 선택
              </h3>
              <button type="button" id="prev-post-modal-close" style="font-size: 1.5rem; border: none; background: transparent; color: var(--text-muted); cursor: pointer;">&times;</button>
            </div>
            <div style="padding: 1rem; max-height: 50vh; overflow-y: auto;">
              ${publishedPosts.map((post: any) => `
                <div class="prev-post-item" data-url="${post.publishedUrl}" data-title="${escapeHtml(post.title || '무제')}" 
                  style="padding: 0.75rem; margin-bottom: 0.5rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; transition: all 0.2s;"
                  onmouseover="this.style.borderColor='#3b82f6'; this.style.background='rgba(59, 130, 246, 0.1)';"
                  onmouseout="this.style.borderColor='var(--border-light)'; this.style.background='rgba(255,255,255,0.03)';">
                  <div style="font-weight: 600; color: var(--text-strong); font-size: 0.9rem; margin-bottom: 0.25rem;">
                    📄 ${escapeHtml(post.title || '무제')}
                  </div>
                  <div style="font-size: 0.75rem; color: var(--text-muted);">
                    ${post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('ko-KR') : '발행일 없음'} | ${categoryNames[post.category] || post.category || '일반'}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      // 모달 추가
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modal = document.getElementById('prev-post-selection-modal');
      if (!modal) return;

      // 닫기 버튼
      document.getElementById('prev-post-modal-close')?.addEventListener('click', () => {
        modal.remove();
      });

      // 배경 클릭으로 닫기
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });

      // 포스트 선택
      modal.querySelectorAll('.prev-post-item').forEach(item => {
        item.addEventListener('click', () => {
          const url = (item as HTMLElement).dataset.url || '';
          const title = (item as HTMLElement).dataset.title || '';

          // 모달 상태에 따라 다른 입력 필드에 값 설정
          const modalCtaUrl = document.getElementById('continuous-modal-cta-url') as HTMLInputElement;
          const modalCtaText = document.getElementById('continuous-modal-cta-text') as HTMLInputElement;
          const mainCtaUrl = document.getElementById('continuous-cta-url') as HTMLInputElement;
          const mainCtaText = document.getElementById('continuous-cta-text') as HTMLInputElement;

          if (modalCtaUrl) modalCtaUrl.value = url;
          if (modalCtaText) modalCtaText.value = `📖 ${title}`;
          if (mainCtaUrl) mainCtaUrl.value = url;
          if (mainCtaText) mainCtaText.value = `📖 ${title}`;

          toastManager.success(`✅ "${title}" 이전글이 선택되었습니다.`);
          modal.remove();
        });
      });

    } catch (error) {
      console.error('[showContinuousPrevPostModal] 오류:', error);
      toastManager.error('포스팅 목록을 불러오지 못했습니다.');
    }
  }

  // 이전 글 선택 버튼 (메인 설정)
  const prevPostBtn = document.getElementById('continuous-select-prevpost-btn');
  if (prevPostBtn) {
    prevPostBtn.addEventListener('click', showContinuousPrevPostModal);
  }

  // 이전 글 선택 버튼 (모달 상세 설정)
  const modalPrevPostBtn = document.getElementById('continuous-modal-select-prevpost-btn');
  if (modalPrevPostBtn) {
    modalPrevPostBtn.addEventListener('click', showContinuousPrevPostModal);
  }

  // 큐에 추가 버튼
  const addBtn = document.getElementById('continuous-add-to-queue-btn');
  if (addBtn) {
    addBtn.addEventListener('click', addItemToQueueV2);
  }

  // 전체 삭제 버튼
  const clearBtn = document.getElementById('continuous-clear-queue-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('대기열의 모든 항목을 삭제하시겠습니까?')) {
        continuousQueueV2.splice(0, continuousQueueV2.length);
        currentQueuePageV2 = 0;
        renderQueueListV2();
      }
    });
  }

  // ✅ [NEW] 페이지네이션 이벤트
  document.getElementById('queue-page-prev')?.addEventListener('click', () => {
    if (currentQueuePageV2 > 0) {
      currentQueuePageV2--;
      renderQueueListV2();
    }
  });

  document.getElementById('queue-page-next')?.addEventListener('click', () => {
    const totalPages = Math.ceil(continuousQueueV2.length / QUEUE_PAGE_SIZE);
    if (currentQueuePageV2 < totalPages - 1) {
      currentQueuePageV2++;
      renderQueueListV2();
    }
  });

  // ✅ [NEW] 전체 보기 모달
  document.getElementById('continuous-queue-fullview-btn')?.addEventListener('click', showQueueFullViewModal);

  // 전체 보기 모달 내 전체 삭제 버튼
  document.getElementById('continuous-clear-queue-fullview-btn')?.addEventListener('click', () => {
    if (confirm('대기열의 모든 항목을 삭제하시겠습니까?')) {
      continuousQueueV2 = [];
      showQueueFullViewModal();
      renderQueueListV2();
    }
  });

  // ✅ 브라우저 세션 종료 버튼 이벤트 리스너 추가
  document.getElementById('close-browser-session-btn')?.addEventListener('click', async () => {
    if (confirm('현재 열려 있는 모든 브라우저 세션을 종료하시겠습니까?')) {
      try {
        const result = await (window as any).api.closeBrowser();
        if (result && result.success) {
          if ((window as any).showToast) {
            (window as any).showToast('🛑 브라우저 세션이 성공적으로 종료되었습니다.', 'success');
          } else {
            alert('브라우저 세션이 종료되었습니다.');
          }
        } else {
          alert('브라우저 종료 실패: ' + (result?.message || '알 수 없는 오류'));
        }
      } catch (error) {
        console.error('브라우저 종료 버튼 클릭 오류:', error);
        alert('오류 발생: ' + (error as Error).message);
      }
    }
  });

  // ✅ LEWORD 황금키워드 실행 버튼 이벤트 리스너는 DOMContentLoaded에서 전역 등록 (아래 참조)

  // 모달 닫기 버튼들 (data-close-fullview 속성)
  document.querySelectorAll('[data-close-fullview]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('continuous-queue-fullview-modal');
      if (modal) modal.style.display = 'none';
    });
  });
}


// ✅ 이전 글 선택 모달
async function showContinuousPrevPostModal(): Promise<void> {
  try {
    const modal = document.createElement('div');
    modal.className = 'unified-modal-overlay';
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100 %; height: 100 %; background: rgba(0, 0, 0, 0.7); z - index: 20000; display: flex; align - items: center; justify - content: center; `;

    modal.innerHTML = `
                < div style = "background: var(--bg-primary); border-radius: 12px; padding: 1.5rem; max-width: 600px; width: 95%; max-height: 80vh; overflow-y: auto;" >
                  <h3 style="margin: 0 0 1rem 0; color: var(--text-strong);" >🔗 이전 글에서 CTA 데이터 가져오기 </h3>
                    < p style = "font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;" > 현재 선택된 계정의 최근 글 목록입니다.링크를 가져올 글을 선택하세요.</p>
                      < div id = "prev-post-list-container" style = "min-height: 200px; display: flex; align-items: center; justify-content: center;" >
                        <div class="loader-small" > </div>
                          </div>
                          < div style = "margin-top: 1.5rem; display: flex; justify-content: flex-end;" >
                            <button type="button" id = "prev-post-modal-cancel" style = "padding: 0.6rem 1.2rem; background: var(--bg-tertiary); color: var(--text-muted); border: 1px solid var(--border-light); border-radius: 6px; cursor: pointer;" > 취소 </button>
                              </div>
                              </div>
                                `;

    document.body.appendChild(modal);

    const closeModal = () => {
      document.body.removeChild(modal);
    };

    modal.querySelector('#prev-post-modal-cancel')?.addEventListener('click', closeModal);

    // ✅ 로컬에 저장된 생성된 글 목록에서 이전글 가져오기 (계정 무관)
    const listContainer = modal.querySelector('#prev-post-list-container')!;
    listContainer.innerHTML = '<div style="color: var(--text-muted);">저장된 글 목록을 불러오는 중...</div>';

    // loadGeneratedPosts()로 로컬 저장된 글 가져오기
    const allPosts = loadGeneratedPosts();
    // 발행된 글만 필터링 (publishedUrl이 있는 글)
    const publishedPosts = allPosts.filter((p: any) => p.publishedUrl && p.publishedUrl.trim());

    if (publishedPosts.length === 0) {
      // 발행된 글이 없으면 모든 글 표시
      if (allPosts.length === 0) {
        listContainer.innerHTML = '<div style="color: var(--text-muted);">저장된 글이 없습니다. 먼저 글을 생성해주세요.</div>';
        return;
      }
      listContainer.innerHTML = '<div style="color: #f59e0b;">⚠️ 발행된 글이 없습니다. 아래에서 생성된 글을 선택하세요.</div>';
    }

    // 발행된 글 우선, 없으면 전체 글 표시
    const postsToShow = publishedPosts.length > 0 ? publishedPosts : allPosts;

    listContainer.innerHTML = `
                              < div style = "width: 100%;" >
                                <div style="padding: 0.5rem; background: var(--bg-tertiary); border-radius: 6px; margin-bottom: 0.75rem; font-size: 0.85rem; color: var(--text-muted);" >
              📝 총 ${allPosts.length}개 글(발행됨: ${publishedPosts.length}개)
                </div>
            ${postsToShow.slice(0, 20).map((p: any) => `
                <div style="padding: 0.75rem; border-bottom: 1px solid var(--border-light); cursor: pointer; transition: background 0.2s;" class="prev-post-row" data-url="${p.publishedUrl || ''}" data-title="${(p.title || '').replace(/"/g, '&quot;')}">
                    <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-strong);">${p.title || '(제목 없음)'}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                      ${p.publishedUrl ? '✅ 발행됨' : '⏳ 미발행'} | ${new Date(p.createdAt || Date.now()).toLocaleDateString('ko-KR')}
                    </div>
                    ${p.publishedUrl ? `<div style="font-size: 0.7rem; color: var(--primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.publishedUrl}</div>` : ''}
                </div>
            `).join('')
      }
              </div>
                `;

    modal.querySelectorAll('.prev-post-row').forEach(row => {
      row.addEventListener('click', () => {
        const url = (row as HTMLElement).dataset.url || '';
        const title = (row as HTMLElement).dataset.title || '';

        const ctaUrlInput = document.getElementById('continuous-cta-url') as HTMLInputElement;
        const ctaTextInput = document.getElementById('continuous-cta-text') as HTMLInputElement;
        const ctaTypeSelect = document.getElementById('continuous-cta-type') as HTMLSelectElement;

        if (ctaUrlInput) ctaUrlInput.value = url;
        if (ctaTextInput) ctaTextInput.value = `이전 글: ${title} `;
        if (ctaTypeSelect) ctaTypeSelect.value = 'previous-post';

        toastManager.success('이전 글 링크가 CTA 설정에 반영되었습니다.');
        closeModal();
      });
    });

  } catch (error) {
    console.error('showContinuousPrevPostModal Error:', error);
    toastManager.error('포스팅 목록을 불러오는데 실패했습니다.');
  }
}

// ✅ 큐에 항목 추가
function addItemToQueueV2(): void {
  const activeTab = document.querySelector('.continuous-input-tab.active') as HTMLElement;
  const tabType = activeTab?.dataset.tab || 'url';

  let rawInputValue = '';

  if (tabType === 'url') {
    rawInputValue = (document.getElementById('continuous-url-input') as HTMLInputElement)?.value?.trim() || '';
  } else if (tabType === 'keyword') {
    rawInputValue = (document.getElementById('continuous-keyword-input') as HTMLInputElement)?.value?.trim() || '';
  }

  if (!rawInputValue) {
    toastManager.warning('입력값을 입력해주세요.');
    return;
  }

  // ✅ 줄바꿈(\n)으로만 입력값 분리 (벌크 추가 지원) - 콤마는 키워드에 포함될 수 있으므로 제외
  const inputValues = rawInputValue.split(/\n+/).map((v: string) => v.trim()).filter((v: string) => v.length > 0);

  if (inputValues.length === 0) {
    toastManager.warning('유효한 입력값이 없습니다.');
    return;
  }

  // ✅ [2026-03-07 FIX] 텍스트만 발행 설정 시 이미지 소스를 'skip'으로 설정
  const textOnlyPublish = localStorage.getItem('textOnlyPublish') === 'true';
  const imageSource = textOnlyPublish ? 'skip' : getFullAutoImageSource();
  const intervalValue = parseInt((document.getElementById('continuous-interval-value') as HTMLInputElement)?.value || '30');
  const intervalUnit = parseInt((document.getElementById('continuous-interval-unit') as HTMLSelectElement)?.value || '1');
  const interval = intervalValue * intervalUnit;
  const publishModeRadio = document.querySelector('input[name="continuous-publish-mode"]:checked') as HTMLInputElement;
  const publishMode = (publishModeRadio?.value || 'publish') as 'publish' | 'draft' | 'schedule';

  // CTA 정보 수집
  const ctaType = (document.getElementById('continuous-cta-type') as HTMLSelectElement)?.value || 'none';
  const ctaUrl = (document.getElementById('continuous-cta-url') as HTMLInputElement)?.value?.trim() || '';
  const ctaText = (document.getElementById('continuous-cta-text') as HTMLInputElement)?.value?.trim() || '';

  // ✅ 카테고리 및 콘텐츠 모드 수집
  // [FIX] 카테고리는 상세설정 모달의 hidden input에서 가져오기 (continuous-category-select는 존재하지 않음)
  const category = (document.getElementById('continuous-modal-category-select') as HTMLInputElement)?.value ||
    (document.getElementById('continuous-category-select') as HTMLInputElement)?.value ||
    'entertainment';
  // ✅ [FIX] select 요소에서 콘텐츠 모드 가져오기 (라디오 버튼이 아닌 select 사용)
  const contentModeSelect = document.getElementById('continuous-content-mode-select') as HTMLSelectElement;
  const contentMode = (contentModeSelect?.value || 'seo') as 'seo' | 'homefeed' | 'affiliate' | 'custom';

  // [FIX] 실제 블로그 카테고리는 메인 폼 또는 모달에서 가져오기
  const realCatSelect = document.getElementById('continuous-real-category-select') as HTMLSelectElement ||
    document.getElementById('continuous-modal-real-category') as HTMLSelectElement;
  const realCategory = realCatSelect?.value || '';
  const realCategoryName = (realCatSelect?.options && realCatSelect.selectedIndex >= 0)
    ? realCatSelect.options[realCatSelect.selectedIndex]?.text || ''
    : '';

  let addedCount = 0;

  // ✅ 예약 발행 모드인 경우 시작 시간 가져오기
  let nextScheduleDate: Date | null = null;
  if (publishMode === 'schedule') {
    const modalDateInput = document.getElementById('continuous-modal-schedule-date') as HTMLInputElement;
    const modalTimeInput = document.getElementById('continuous-modal-schedule-time') as HTMLInputElement;

    if (modalDateInput?.value && modalTimeInput?.value) {
      nextScheduleDate = new Date(`${modalDateInput.value}T${modalTimeInput.value}`);
    } else if (modalDateInput?.value) {
      nextScheduleDate = new Date(`${modalDateInput.value}T09:00`);
    } else {
      nextScheduleDate = new Date(Date.now() + 10 * 60000); // 기본 10분 후
    }

    // 이미 큐에 예약된 항목이 있다면 그 이후부터 예약
    const lastScheduledItem = [...continuousQueueV2].reverse().find(i => i.publishMode === 'schedule' && i.scheduleDate);
    if (lastScheduledItem && lastScheduledItem.scheduleDate) {
      // ✅ [2026-03-11 FIX] scheduleTime도 합쳐서 파싱 — 날짜만 파싱하면 midnight UTC로 시간 누락
      const lastDateStr = lastScheduledItem.scheduleTime
        ? `${lastScheduledItem.scheduleDate!.split(/[T ]/)[0]}T${lastScheduledItem.scheduleTime}`
        : lastScheduledItem.scheduleDate!;
      const lastDate = new Date(lastDateStr);
      if (!isNaN(lastDate.getTime())) {
        nextScheduleDate = new Date(lastDate.getTime() + 30 * 60000); // 30분 간격
      }
    }
  }

  for (const val of inputValues) {
    let itemScheduleDate: string | undefined = undefined;
    let itemScheduleTime: string | undefined = undefined;
    if (publishMode === 'schedule' && nextScheduleDate) {
      // YYYY-MM-DD 형식으로 날짜 저장
      const yyyy = nextScheduleDate.getFullYear();
      const mm = String(nextScheduleDate.getMonth() + 1).padStart(2, '0');
      const dd = String(nextScheduleDate.getDate()).padStart(2, '0');
      const hh = String(nextScheduleDate.getHours()).padStart(2, '0');
      const mi = String(nextScheduleDate.getMinutes()).padStart(2, '0');
      itemScheduleDate = `${yyyy}-${mm}-${dd}`;
      itemScheduleTime = `${hh}:${mi}`;
      // 다음 항목을 위해 30분 추가
      nextScheduleDate = new Date(nextScheduleDate.getTime() + 30 * 60000);
    }

    const newItem: ContinuousQueueItem = {
      id: `item - ${Date.now()} -${Math.random().toString(36).substr(2, 9)} `,
      type: tabType as 'url' | 'keyword',
      value: val,
      customTitle: undefined,
      customKeyword: (tabType === 'keyword') ? val : undefined,
      imageSource,
      interval: Math.max(5, Math.min(86400, interval)), // 최대 24시간 확장
      publishMode,
      scheduleDate: itemScheduleDate,
      scheduleTime: itemScheduleTime,  // ✅ 예약 시간 별도 저장
      scheduleType: 'naver-server', // 연속 발행 예약은 네이버 서버 예약이 기본
      status: 'pending',
      ctaType,
      ctaUrl,
      ctaText,
      category,       // ✅ 카테고리 추가
      contentMode,    // ✅ 콘텐츠 모드 추가
      toneStyle: (document.getElementById('continuous-tone-style-select') as HTMLSelectElement)?.value || 'professional', // ✅ 글톤 추가
      realCategory,   // ✅ 실제 블로그 카테고리 추가
      realCategoryName, // ✅ 실제 블로그 카테고리 이름 추가
      includeThumbnailText: (document.getElementById('continuous-modal-include-thumbnail-text') as HTMLInputElement)?.checked || false,
      // ✅ [2026-02-19] 제휴링크 자동 감지: URL 입력이 제휴 URL이면 별도 필드 없이도 자동 적용
      affiliateLink: resolveAffiliateLink(
        contentMode === 'affiliate' ? ((document.getElementById('continuous-affiliate-link') as HTMLInputElement)?.value?.trim() || '') : undefined,
        tabType === 'url' ? val : undefined
      ),
      videoOption: contentMode === 'affiliate' ? ((document.getElementById('continuous-video-option') as HTMLInputElement)?.checked || false) : undefined,
      // ✅ [2026-02-13] 키워드 제목 옵션
      keywordAsTitle: (tabType === 'keyword') ? ((document.getElementById('continuous-keyword-as-title') as HTMLInputElement)?.checked || false) : undefined,
      keywordTitlePrefix: (tabType === 'keyword') ? ((document.getElementById('continuous-keyword-title-prefix') as HTMLInputElement)?.checked || false) : undefined
    };
    // ✅ [2026-02-19] 제휴 URL 자동 감지 시 contentMode 자동 전환
    if (newItem.affiliateLink && newItem.contentMode !== 'affiliate') {
      newItem.contentMode = 'affiliate';
      console.log(`[연속발행] 🔗 제휴 URL 감지 → contentMode 자동 전환: affiliate`);
    }
    continuousQueueV2.push(newItem);
    addedCount++;
  }

  renderQueueListV2();

  // 입력 필드 초기화 (제목/키워드는 유지할지 말지 고민되나, 일단 값만 초기화)
  if (tabType === 'url') {
    (document.getElementById('continuous-url-input') as HTMLInputElement).value = '';
    // 키워드/제목은 대량 등록 시 공유할 수 있으므로 명시적으로 초기화하지 않음 (사용자 편의)
  } else if (tabType === 'keyword') {
    (document.getElementById('continuous-keyword-input') as HTMLInputElement).value = '';
  }

  toastManager.success(`${addedCount}개 항목이 큐에 추가되었습니다. (총 ${continuousQueueV2.length}개)`);
}

let currentQueuePageV2 = 0;
const QUEUE_PAGE_SIZE = 5;

const imageSourceNames: Record<string, string> = {
  'nano-banana-pro': '🍌 나노바나나 프로 (Gemini)',
  'naver': '🔍 네이버 검색',
  'prodia': '⚡ Prodia',
  'stability': '🚀 Stability AI',
  'deepinfra': '🚀 DeepInfra FLUX-2',
  'deepinfra-flux': '🚀 DeepInfra FLUX-2',
  'falai': '🎨 Fal.ai FLUX',
  'pollinations': '🌸 Pollinations (무료)',
  'leonardoai': '🎨 Leonardo AI',
  'openai-image': '🟣 DALL-E (OpenAI)',
  'skip': '🚫 없음'
};

/**
 * ✅ [2026-02-02] 생성된 이미지를 그리드 형식으로 표시하는 모달
 */
function showImageGridModal(images: any[], sourceLabel: string): void {
  // 기존 모달 제거
  const existingModal = document.getElementById('image-grid-result-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'image-grid-result-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    animation: fadeIn 0.3s ease;
  `;

  const validImages = images.filter((img: any) => img && (img.previewDataUrl || img.filePath || img.url));

  modal.innerHTML = `
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; max-width: 900px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 24px; box-shadow: 0 25px 50px rgba(0,0,0,0.5);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1);">
        <div>
          <h2 style="margin: 0; font-size: 1.5rem; color: #fff;">🎨 이미지 생성 완료</h2>
          <p style="margin: 8px 0 0 0; font-size: 0.9rem; color: rgba(255,255,255,0.6);">
            ${sourceLabel}으로 ${validImages.length}개 이미지 생성됨
          </p>
        </div>
        <button id="close-image-grid-modal" style="background: rgba(255,255,255,0.1); border: none; width: 40px; height: 40px; border-radius: 10px; cursor: pointer; font-size: 1.5rem; color: #fff; transition: all 0.2s;">×</button>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;">
        ${validImages.map((img: any, idx: number) => {
    const imgUrl = img.previewDataUrl || img.filePath || img.url || '';
    const heading = img.heading || `이미지 ${idx + 1}`;
    return `
            <div style="background: rgba(255,255,255,0.05); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); transition: all 0.2s;">
              <div style="position: relative; padding-top: 100%; background: #0a0a0a;">
                <img src="${imgUrl}" alt="${heading}" 
                     style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover;"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2212%22>로드 실패</text></svg>'">
                <div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;">
                  #${idx + 1}
                </div>
              </div>
              <div style="padding: 12px;">
                <p style="margin: 0; font-size: 0.85rem; color: #fff; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${heading}">
                  ${heading.length > 25 ? heading.substring(0, 25) + '...' : heading}
                </p>
              </div>
            </div>
          `;
  }).join('')}
      </div>
      
      <div style="margin-top: 20px; text-align: center;">
        <button id="confirm-image-grid-modal" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); border: none; padding: 12px 32px; border-radius: 10px; color: white; font-weight: 600; cursor: pointer; font-size: 1rem; transition: all 0.2s;">
          ✅ 확인
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 닫기 이벤트
  const closeBtn = document.getElementById('close-image-grid-modal');
  const confirmBtn = document.getElementById('confirm-image-grid-modal');

  const closeModal = () => modal.remove();

  closeBtn?.addEventListener('click', closeModal);
  confirmBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

const typeIcons: Record<string, string> = {
  'url': '🔗',
  'keyword': '🏷️'
};

const publishModeNames: Record<string, string> = {
  'publish': '🚀 즉시',
  'draft': '📝 임시',
  'schedule': '📅 예약'
};

const statusColors: Record<string, string> = {
  'pending': 'var(--text-muted)',
  'processing': '#f59e0b',
  'completed': '#10b981',
  'failed': '#ef4444',
  'cancelled': '#f97316'  // 주황색 - 중지됨
};

const toneStyleNames: Record<string, string> = {
  'friendly': '😊 친근한',
  'professional': '💼 전문적',
  'casual': '🎒 캐주얼',
  'formal': '🎩 격식체',
  'humorous': '😄 유머',
  'community_fan': '🔥 찐팬',
  'mom_cafe': '👩‍👧 맘카페'
};

const contentModeNames: Record<string, string> = {
  'seo': '🔍 SEO',
  'homefeed': '🏠 홈판',
  'affiliate': '💰 제휴',
  'custom': '✏️ 커스텀'
};

// ✅ 카테고리 이름 맵핑 (영어 → 한국어)
const categoryNames: Record<string, string> = {
  'general': '일반',
  'entertainment': '연예/이슈',
  'celebrity': '스타·연예인',
  'broadcast': '방송',
  'drama': '드라마',
  'health': '건강/의학',
  'finance': '경제/금융',
  'it_computer': 'IT/컴퓨터',
  'it_review': 'IT 리뷰',
  'shopping_review': '상품리뷰',
  'fashion': '패션/미용',
  'food_recipe': '요리/레시피',
  'tasty_restaurant': '맛집',
  'travel_domestic': '국내여행',
  'travel_world': '세계여행',
  'parenting': '육아/결혼',
  'pet': '반려동물',
  'interior': '인테리어/DIY',
  'car': '자동차',
  'game': '게임',
  'sports': '스포츠',
  'hobby': '취미',
  'movie': '영화',
  'music': '음악',
  'literature': '문학/책',
  'art_design': '미술/디자인',
  'performance': '공연/전시',
  'cartoon': '만화/애니',
  'tips': '생활 꿀팁',
  'good_writing': '좋은글/이미지',
  'gardening': '원예/재배',
  'photo': '사진',
  'society_politics': '사회/정치',
  'business_economy': '비즈니스/경제',
  'language': '어학/외국어',
  'education_scholarship': '교육/학문',
  'realestate': '부동산',
  'self_dev': '자기계발'
};

// ✅ window에 노출 (renderQueueListV2에서 사용)
(window as any).categoryNames = categoryNames;

// ✅ 큐 리스트 렌더링
function renderQueueListV2(): void {
  const container = document.getElementById('continuous-queue-list');
  if (!container) return;
  const totalItems = continuousQueueV2.length;
  const totalPages = Math.ceil(totalItems / QUEUE_PAGE_SIZE) || 1;

  // 페이지 범위 보정
  if (currentQueuePageV2 >= totalPages) currentQueuePageV2 = totalPages - 1;
  if (currentQueuePageV2 < 0) currentQueuePageV2 = 0;

  const startIdx = currentQueuePageV2 * QUEUE_PAGE_SIZE;
  const pageItems = continuousQueueV2.slice(startIdx, startIdx + QUEUE_PAGE_SIZE);

  // 페이지네이션 UI 업데이트
  const paginationEl = document.getElementById('continuous-queue-pagination');
  const pageInfoEl = document.getElementById('queue-page-info');
  const prevBtn = document.getElementById('queue-page-prev') as HTMLButtonElement;
  const nextBtn = document.getElementById('queue-page-next') as HTMLButtonElement;

  const clearBtn = document.getElementById('continuous-clear-queue-btn');

  if (paginationEl) paginationEl.style.display = totalItems > 0 ? 'block' : 'none';
  if (pageInfoEl) pageInfoEl.textContent = `${currentQueuePageV2 + 1} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = currentQueuePageV2 === 0;
  if (nextBtn) nextBtn.disabled = currentQueuePageV2 === totalPages - 1;
  if (clearBtn) clearBtn.style.display = totalItems > 0 ? 'block' : 'none';

  container.innerHTML = pageItems.map((item, localIdx) => {
    const globalIndex = startIdx + localIdx;
    return `
    <div class="continuous-queue-item" data-id="${item.id}" style="background: var(--bg-primary); border-radius: 8px; padding: 0.75rem; margin-bottom: 0.5rem; border-left: 3px solid ${statusColors[item.status]};">
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
        <span style="font-size: 0.9rem;">${typeIcons[item.type]}</span>
        <span style="flex: 1; font-size: 0.85rem; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${item.value}">${item.value.length > 30 ? item.value.substring(0, 30) + '...' : item.value}</span>
        <span style="font-size: 0.7rem; color: var(--text-muted);">#${globalIndex + 1}</span>
      </div>
      <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem; line-height: 1.4;">
        ${(item.customTitle || item.customKeyword) ? `
          <div style="margin-bottom: 2px;">
            ${item.customKeyword ? `<span style="color: var(--text-strong);">🔑 ${item.customKeyword}</span>` : ''}
            ${item.customKeyword && item.customTitle ? ' • ' : ''}
            ${item.customTitle ? `<span>✍️ ${item.customTitle}</span>` : ''}
          </div>
        ` : ''}
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 4px; align-items: center;">
           <span style="color: #3b82f6; font-weight: 700; background: rgba(59, 130, 246, 0.1); padding: 1px 4px; border-radius: 4px;">📂 ${categoryNames[item.category || 'general'] || item.category || '일반'}</span>
           ${item.realCategoryName ? `<span style="color: #10b981; font-weight: 600; font-size: 0.7rem; border-left: 1px solid var(--border-light); padding-left: 4px;">🏷️ ${item.realCategoryName}</span>` : ''}
           <span style="color: #8b5cf6;">🎯 ${contentModeNames[item.contentMode || 'homefeed'] || '홈판'}</span>
           <span style="color: #f59e0b;">✍️ ${toneStyleNames[item.toneStyle || 'professional'] || '전문적'}</span>
        </div>
        ${item.ctaType && item.ctaType !== 'none' ? `
          <div style="color: #60a5fa;">📢 CTA: ${item.ctaType === 'previous-post' ? '이전글' : '커스텀'}</div>
        ` : ''}
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-muted);">
        <span style="color: ${item.publishMode === 'schedule' ? 'var(--primary)' : 'inherit'}; font-weight: ${item.publishMode === 'schedule' ? '600' : '400'};">
          ${publishModeNames[item.publishMode] || '🚀 즉시'}
          ${item.publishMode === 'schedule' && (item.scheduleDate || item.scheduleTime) ? ` (${item.scheduleTime || (item.scheduleDate?.includes('T') ? item.scheduleDate.split('T')[1]?.substring(0, 5) : '')})` : ''}
        </span>
        <span>•</span>
        <span>${imageSourceNames[item.imageSource] || item.imageSource}</span>
        <span>•</span>
        <span>${item.interval >= 3600 ? Math.floor(item.interval / 3600) + '시간' : (item.interval >= 60 ? Math.floor(item.interval / 60) + '분' : item.interval + '초')}</span>
        ${item.status === 'pending' ? `
          <div style="margin-left: auto; display: flex; gap: 0.25rem;">
            ${item.type === 'url' ? `<button type="button" class="queue-addurl-btn" data-id="${item.id}" style="padding: 0.25rem 0.5rem; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 4px; color: #22c55e; cursor: pointer; font-size: 0.7rem;" title="추가 URL 입력">+URL${item.additionalUrls && item.additionalUrls.length > 0 ? ` (${item.additionalUrls.length})` : ''}</button>` : ''}
            <button type="button" class="queue-schedule-btn" data-id="${item.id}" style="padding: 0.25rem 0.5rem; background: ${item.publishMode === 'schedule' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.1)'}; border: 1px solid ${item.publishMode === 'schedule' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(245, 158, 11, 0.3)'}; border-radius: 4px; color: ${item.publishMode === 'schedule' ? '#60a5fa' : '#f59e0b'}; cursor: pointer; font-size: 0.7rem;" title="예약 시간 설정">⏰</button>
            <button type="button" class="queue-edit-btn" data-id="${item.id}" style="padding: 0.25rem 0.5rem; background: var(--bg-tertiary); border: 1px solid var(--border-light); border-radius: 4px; color: var(--text-muted); cursor: pointer; font-size: 0.7rem;">✏️</button>
            <button type="button" class="queue-delete-btn" data-id="${item.id}" style="padding: 0.25rem 0.5rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; color: #ef4444; cursor: pointer; font-size: 0.7rem;">🗑️</button>
          </div>
        ` : `
          <span style="margin-left: auto; font-size: 0.7rem; color: ${statusColors[item.status]};">
            ${item.status === 'processing' ? '⏳ 발행 중' : item.status === 'completed' ? '✅ 완료' : item.status === 'cancelled' ? '🛑 중지됨' : '❌ 실패'}
          </span>
        `}
      </div>
    </div>
  `;
  }).join('');

  // 삭제 버튼 이벤트
  container.querySelectorAll('.queue-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      const idx = continuousQueueV2.findIndex(item => item.id === id);
      if (idx !== -1) continuousQueueV2.splice(idx, 1);
      renderQueueListV2();
    });
  });

  // 수정 버튼 이벤트
  container.querySelectorAll('.queue-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      const item = continuousQueueV2.find(i => i.id === id);
      if (item) showEditQueueItemModal(item);
    });
  });

  // ✅ [2026-02-07] 개별 예약 시간 설정 버튼 이벤트
  container.querySelectorAll('.queue-schedule-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      const item = continuousQueueV2.find(i => i.id === id);
      if (item) showItemScheduleModal(item);
    });
  });

  // ✅ [2026-01-21] URL 추가 버튼 이벤트 (다중 소스 지원)
  container.querySelectorAll('.queue-addurl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      const item = continuousQueueV2.find(i => i.id === id);
      if (!item) return;

      // 기존 추가 URL 목록 표시
      const existingUrls = item.additionalUrls || [];
      const existingList = existingUrls.length > 0
        ? `\n\n현재 추가된 URL (${existingUrls.length}개):\n${existingUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`
        : '';

      const newUrl = prompt(`추가할 URL을 입력하세요:\n(여러 개를 한 번에 추가하려면 줄바꿈으로 구분)${existingList}`);

      if (newUrl && newUrl.trim()) {
        // 줄바꿈으로 구분된 여러 URL 처리
        const urls = newUrl.split('\n')
          .map(u => u.trim())
          .filter(u => u.length > 0 && /^https?:\/\//i.test(u));

        if (urls.length > 0) {
          if (!item.additionalUrls) item.additionalUrls = [];
          item.additionalUrls.push(...urls);
          console.log(`[Continuous] ✅ ${urls.length}개 URL 추가됨 (총 ${item.additionalUrls.length}개)`);
          toastManager.success(`✅ ${urls.length}개 URL이 추가되었습니다!`);
          renderQueueListV2();
        } else {
          toastManager.warning('⚠️ 유효한 URL이 없습니다. http:// 또는 https://로 시작해야 합니다.');
        }
      }
    });
  });
}

// ✅ [2026-02-07] 개별 큐 아이템 예약 시간 설정 모달
function showItemScheduleModal(item: any): void {
  // 기존 모달 제거
  document.getElementById('item-schedule-modal-overlay')?.remove();

  // 현재 설정된 값 파싱
  let currentDate = '';
  let currentTime = '';
  if (item.scheduleDate) {
    // ✅ [2026-03-11 FIX] 모든 포맷 대응: 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DD HH:mm'
    currentDate = item.scheduleDate.split(/[T ]/)[0];
    const embeddedTime = item.scheduleDate.includes('T')
      ? item.scheduleDate.split('T')[1]?.substring(0, 5)
      : item.scheduleDate.includes(' ')
        ? item.scheduleDate.split(' ')[1]?.substring(0, 5)
        : '';
    currentTime = item.scheduleTime || embeddedTime || '';
  }

  const overlay = document.createElement('div');
  overlay.id = 'item-schedule-modal-overlay';
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 50000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px);';

  overlay.innerHTML = `
    <div style="background: var(--bg-primary, #1a1a2e); border: 2px solid rgba(59, 130, 246, 0.4); border-radius: 16px; padding: 1.5rem; max-width: 420px; width: 90%; box-shadow: 0 25px 50px rgba(0,0,0,0.5);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
        <h3 style="margin: 0; color: #60a5fa; font-size: 1.1rem; font-weight: 700;">⏰ 예약 시간 설정</h3>
        <button type="button" id="item-schedule-close" style="background: none; border: none; color: var(--text-muted, #999); font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
      </div>
      
      <div style="margin-bottom: 1rem; padding: 0.6rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        <div style="font-size: 0.75rem; color: var(--text-muted, #999); margin-bottom: 0.25rem;">📄 대상 항목</div>
        <div style="font-size: 0.85rem; color: var(--text-strong, #fff); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.value}</div>
      </div>

      <div style="margin-bottom: 0.5rem; padding: 0.5rem; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 6px;">
        <span style="font-size: 0.7rem; color: #f59e0b;">⚠️ 현재 시간 기준 15분 이후부터 예약 가능합니다</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1rem;">
        <div>
          <label style="font-size: 0.75rem; color: var(--text-muted, #999); display: block; margin-bottom: 0.25rem;">📅 날짜</label>
          <input type="date" id="item-schedule-date" value="${currentDate}" min="${new Date().toISOString().split('T')[0]}"
            style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark;">
        </div>
        <div>
          <label style="font-size: 0.75rem; color: var(--text-muted, #999); display: block; margin-bottom: 0.25rem;">🕐 시간</label>
          <input type="time" id="item-schedule-time" value="${currentTime || '09:00'}" step="600"
            style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark;">
        </div>
      </div>

      ${currentDate ? `<div style="margin-bottom: 1rem; text-align: center;">
        <button type="button" id="item-schedule-clear" style="padding: 0.5rem 1rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; color: #ef4444; cursor: pointer; font-size: 0.8rem; font-weight: 600;">🗑️ 예약 해제 (즉시 발행으로 변경)</button>
      </div>` : ''}

      <div style="display: flex; gap: 0.5rem;">
        <button type="button" id="item-schedule-cancel" style="flex: 1; padding: 0.7rem; background: var(--bg-tertiary, #333); color: var(--text-muted, #999); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.85rem;">취소</button>
        <button type="button" id="item-schedule-save" style="flex: 2; padding: 0.7rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">📅 예약 설정</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 닫기
  const closeModal = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.getElementById('item-schedule-close')?.addEventListener('click', closeModal);
  document.getElementById('item-schedule-cancel')?.addEventListener('click', closeModal);

  // 예약 해제 버튼
  document.getElementById('item-schedule-clear')?.addEventListener('click', () => {
    item.publishMode = 'publish';
    item.scheduleDate = undefined;
    item.scheduleTime = undefined;
    item.scheduleUserModified = undefined; // ✅ [2026-03-17] 예약 해제 시 수동 플래그 초기화
    toastManager.info('🚀 즉시 발행으로 변경되었습니다.');
    renderQueueListV2();
    closeModal();
  });

  // 저장
  document.getElementById('item-schedule-save')?.addEventListener('click', () => {
    const dateVal = (document.getElementById('item-schedule-date') as HTMLInputElement)?.value;
    const timeVal = (document.getElementById('item-schedule-time') as HTMLInputElement)?.value || '09:00';

    if (!dateVal) {
      toastManager.warning('📅 예약 날짜를 선택해주세요.');
      return;
    }

    // ✅ 15분 미래 검증
    const scheduledTime = new Date(`${dateVal}T${timeVal}`);
    const minAllowed = new Date(Date.now() + 15 * 60 * 1000);
    if (scheduledTime.getTime() < minAllowed.getTime()) {
      toastManager.error('❌ 현재 시간 기준 15분 이후부터 예약 가능합니다!');
      return;
    }

    item.publishMode = 'schedule';
    item.scheduleDate = dateVal;        // ✅ [2026-03-11 FIX] 'YYYY-MM-DD' 날짜만 저장 (기존: 'YYYY-MM-DDTHH:mm'으로 중복 저장 → 실행 시 이중 합성 버그)
    item.scheduleTime = timeVal;        // 'HH:mm' 시간만 저장
    item.scheduleUserModified = true;   // ✅ [2026-03-17] 사용자 수동 설정 플래그
    // ✅ [2026-02-08 FIX] item.interval = 600 제거 — 사용자 설정 간격 유지
    // 기존: 예약 전환 시 강제 10분(600초) 덮어쓰기 → 사용자 설정 무시됨
    toastManager.success(`✅ 예약 설정 완료: ${dateVal} ${timeVal}`);
    renderQueueListV2();
    closeModal();
  });

  // ESC 키
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

// ✅ [2026-02-07] 예약 상태 요약 업데이트
function updateScheduleStatusSummary(): void {
  const statusText = document.getElementById('schedule-status-text');
  if (!statusText) return;

  if (!continuousQueueV2 || continuousQueueV2.length === 0) {
    statusText.textContent = '📭 대기열이 비어있습니다.';
    return;
  }

  const scheduledCount = continuousQueueV2.filter((item: any) => item.publishMode === 'schedule' && item.scheduleDate).length;
  const total = continuousQueueV2.length;

  if (scheduledCount === 0) {
    statusText.innerHTML = `총 <strong style="color: #60a5fa;">${total}</strong>개 항목 | 예약 설정된 항목 없음`;
  } else {
    statusText.innerHTML = `총 <strong style="color: #60a5fa;">${total}</strong>개 항목 | <strong style="color: #10b981;">${scheduledCount}</strong>개 예약 설정됨`;
  }
}

// ✅ [2026-02-07] 랜덤 예약 배분 모달
function showRandomScheduleModal(): void {
  document.getElementById('random-schedule-modal-overlay')?.remove();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // ✅ [2026-02-08 FIX] 현재 시간 기준 기본값 설정 — 10분 단위 올림 (네이버 서버 예약 10분 단위 제한)
  const startDefault = new Date(Date.now() + 20 * 60 * 1000); // 현재 + 20분
  const roundedStartMin = Math.ceil(startDefault.getMinutes() / 10) * 10;
  startDefault.setMinutes(roundedStartMin, 0, 0);
  if (roundedStartMin >= 60) { startDefault.setMinutes(0); startDefault.setHours(startDefault.getHours() + 1); }
  const startHH = String(startDefault.getHours()).padStart(2, '0');
  const startMM = String(startDefault.getMinutes()).padStart(2, '0');
  const defaultStartTime = `${startHH}:${startMM}`;

  // 마감 시간: 시작시간 + 9시간 (자정 넘으면 다음날)
  const endDefault = new Date(startDefault.getTime() + 9 * 60 * 60 * 1000);
  const endDateStr2 = `${endDefault.getFullYear()}-${String(endDefault.getMonth() + 1).padStart(2, '0')}-${String(endDefault.getDate()).padStart(2, '0')}`;
  const endHH = String(endDefault.getHours()).padStart(2, '0');
  const endMM = String(endDefault.getMinutes()).padStart(2, '0');
  const defaultEndTime = `${endHH}:${endMM}`;

  const overlay = document.createElement('div');
  overlay.id = 'random-schedule-modal-overlay';
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 50000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px);';

  overlay.innerHTML = `
    <div style="background: var(--bg-primary, #1a1a2e); border: 2px solid rgba(59, 130, 246, 0.4); border-radius: 16px; padding: 1.5rem; max-width: 480px; width: 92%; box-shadow: 0 25px 50px rgba(0,0,0,0.5); max-height: 85vh; overflow-y: auto;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
        <h3 style="margin: 0; color: #60a5fa; font-size: 1.1rem; font-weight: 700;">🎲 랜덤 예약 배분</h3>
        <button type="button" id="random-schedule-close" style="background: none; border: none; color: var(--text-muted, #999); font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
      </div>

      <p style="margin: 0 0 1rem 0; font-size: 0.8rem; color: var(--text-muted); line-height: 1.5;">
        시작~마감 시간 범위 내에서 대기열 항목들에 <strong style="color: #10b981;">랜덤 예약 시간</strong>을 자동 배분합니다.
      </p>

      <!-- 시작 시간 -->
      <div style="margin-bottom: 1rem;">
        <label style="color: #10b981; font-size: 0.85rem; font-weight: 700; display: block; margin-bottom: 0.5rem;">🟢 시작 시간</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
          <div>
            <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">날짜 (비워두면 오늘)</label>
            <input type="date" id="rnd-schedule-start-date" value="${todayStr}"
              style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark;">
          </div>
          <div>
            <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">시간</label>
            <input type="time" id="rnd-schedule-start-time" value="${defaultStartTime}" step="600"
              style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark;">
          </div>
        </div>
      </div>

      <!-- 마감 시간 -->
      <div style="margin-bottom: 1rem;">
        <label style="color: #ef4444; font-size: 0.85rem; font-weight: 700; display: block; margin-bottom: 0.5rem;">🔴 마감 시간</label>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
          <div>
            <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">날짜 (비워두면 시작일과 동일)</label>
            <input type="date" id="rnd-schedule-end-date" value="${endDateStr2}"
              style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark;">
          </div>
          <div>
            <label style="font-size: 0.7rem; color: var(--text-muted); display: block; margin-bottom: 0.25rem;">시간</label>
            <input type="time" id="rnd-schedule-end-time" value="${defaultEndTime}" step="600"
              style="width: 100%; padding: 0.6rem; border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.4); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.85rem; color-scheme: dark;">
          </div>
        </div>
      </div>

      <!-- 빠른 프리셋 -->
      <div style="margin-bottom: 1rem;">
        <label style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 0.5rem;">⚡ 빠른 시간대 설정</label>
        <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
          <button type="button" class="rnd-preset" data-start="09:00" data-end="18:00" style="padding: 0.4rem 0.6rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; color: #60a5fa; cursor: pointer; font-size: 0.75rem; font-weight: 600;">🌅 9-18시</button>
          <button type="button" class="rnd-preset" data-start="08:00" data-end="22:00" style="padding: 0.4rem 0.6rem; background: rgba(139, 92, 246, 0.1); border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 6px; color: #a78bfa; cursor: pointer; font-size: 0.75rem; font-weight: 600;">📅 8-22시</button>
          <button type="button" class="rnd-preset" data-start="10:00" data-end="14:00" style="padding: 0.4rem 0.6rem; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; color: #f59e0b; cursor: pointer; font-size: 0.75rem; font-weight: 600;">☀️ 10-14시</button>
          <button type="button" class="rnd-preset" data-start="18:00" data-end="23:00" style="padding: 0.4rem 0.6rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 6px; color: #10b981; cursor: pointer; font-size: 0.75rem; font-weight: 600;">🌙 18-23시</button>
        </div>
      </div>

      <!-- 미리보기 영역 -->
      <div id="rnd-schedule-preview" style="display: none; margin-bottom: 1rem; padding: 0.75rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; max-height: 150px; overflow-y: auto;">
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem; font-weight: 600;">📊 배분 미리보기</div>
        <div id="rnd-schedule-preview-content" style="font-size: 0.75rem; color: var(--text-strong); line-height: 1.6; font-family: monospace;"></div>
      </div>

      <div style="display: flex; gap: 0.5rem;">
        <button type="button" id="rnd-schedule-cancel" style="flex: 1; padding: 0.7rem; background: var(--bg-tertiary, #333); color: var(--text-muted, #999); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.85rem;">취소</button>
        <button type="button" id="rnd-schedule-apply" style="flex: 2; padding: 0.7rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);">🎲 랜덤 예약 적용</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 프리셋 버튼
  overlay.querySelectorAll('.rnd-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = (btn as HTMLElement).dataset.start || '09:00';
      const e = (btn as HTMLElement).dataset.end || '18:00';
      (document.getElementById('rnd-schedule-start-time') as HTMLInputElement).value = s;
      (document.getElementById('rnd-schedule-end-time') as HTMLInputElement).value = e;
      toastManager.info(`⏰ ${s} ~ ${e} 시간대가 설정되었습니다.`);
    });
  });

  // 닫기
  const closeModal = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.getElementById('random-schedule-close')?.addEventListener('click', closeModal);
  document.getElementById('rnd-schedule-cancel')?.addEventListener('click', closeModal);

  // 적용
  document.getElementById('rnd-schedule-apply')?.addEventListener('click', () => {
    const today = new Date();
    const todayStr2 = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const startDateStr = (document.getElementById('rnd-schedule-start-date') as HTMLInputElement)?.value || todayStr2;
    const startTimeStr = (document.getElementById('rnd-schedule-start-time') as HTMLInputElement)?.value || '09:00';
    const endDateStr = (document.getElementById('rnd-schedule-end-date') as HTMLInputElement)?.value || startDateStr;
    const endTimeStr = (document.getElementById('rnd-schedule-end-time') as HTMLInputElement)?.value || '18:00';

    const startTime = new Date(`${startDateStr}T${startTimeStr}`);
    const endTime = new Date(`${endDateStr}T${endTimeStr}`);

    // ✅ 15분 미래 검증
    const minAllowed = new Date(Date.now() + 15 * 60 * 1000);
    if (startTime.getTime() < minAllowed.getTime()) {
      toastManager.error('❌ 시작 시간은 현재 시간 기준 15분 이후여야 합니다!');
      return;
    }

    if (endTime.getTime() <= startTime.getTime()) {
      toastManager.error('❌ 마감 시간이 시작 시간보다 이후여야 합니다!');
      return;
    }

    const rangeMs = endTime.getTime() - startTime.getTime();
    if (rangeMs < 600000) {
      toastManager.error('❌ 시작~마감 시간 범위가 최소 10분 이상이어야 합니다.');
      return;
    }

    if (!continuousQueueV2 || continuousQueueV2.length === 0) {
      toastManager.warning('📋 대기열에 항목이 없습니다.');
      return;
    }

    const itemCount = continuousQueueV2.length;
    const randomTimes: Date[] = [];
    for (let i = 0; i < itemCount; i++) {
      const raw = new Date(startTime.getTime() + Math.floor(Math.random() * rangeMs));
      // ✅ [2026-02-08 FIX] 10분 단위 반올림 (네이버 서버 예약 10분 단위 제한)
      const mins = raw.getMinutes();
      const rounded = Math.round(mins / 10) * 10;
      raw.setMinutes(rounded, 0, 0);
      if (rounded >= 60) { raw.setMinutes(0); raw.setHours(raw.getHours() + 1); }
      randomTimes.push(raw);
    }
    randomTimes.sort((a, b) => a.getTime() - b.getTime());

    continuousQueueV2.forEach((item: any, i: number) => {
      const t = randomTimes[i];
      const yyyy = t.getFullYear();
      const mo = String(t.getMonth() + 1).padStart(2, '0');
      const dd = String(t.getDate()).padStart(2, '0');
      const hh = String(t.getHours()).padStart(2, '0');
      const mi = String(t.getMinutes()).padStart(2, '0');
      item.scheduleDate = `${yyyy}-${mo}-${dd}`;  // ✅ [2026-03-11 FIX] 'YYYY-MM-DD' 날짜만 저장 (기존: 'YYYY-MM-DDThh:mm'으로 scheduleTime 불일치)
      item.scheduleTime = `${hh}:${mi}`;           // ✅ 시간은 별도 저장
      item.publishMode = 'schedule';
      // ✅ [2026-02-08 FIX] item.interval = 600 제거 — 사용자 설정 간격 유지
    });

    // 미리보기
    const previewEl = document.getElementById('rnd-schedule-preview');
    const previewContent = document.getElementById('rnd-schedule-preview-content');
    if (previewEl && previewContent) {
      previewEl.style.display = 'block';
      previewContent.innerHTML = continuousQueueV2.map((item: any, i: number) => {
        const dateStr = item.scheduleDate?.split(/[T ]/)[0] || '';
        const timeStr = item.scheduleTime || item.scheduleDate?.split('T')[1] || '';
        return `<div style="display: flex; gap: 0.5rem; padding: 2px 0;">
          <span style="color: #60a5fa; min-width: 25px;">#${i + 1}</span>
          <span style="color: #10b981; font-weight: 600;">${dateStr} ${timeStr}</span>
          <span style="color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.value?.substring(0, 20) || ''}...</span>
        </div>`;
      }).join('');
    }

    toastManager.success(`✅ ${itemCount}개 항목에 랜덤 예약 적용! (${startTimeStr}~${endTimeStr})`);
    renderQueueListV2?.();
    updateScheduleStatusSummary();
  });

  // ESC
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handleEsc); }
  };
  document.addEventListener('keydown', handleEsc);
}

// ✅ [2026-02-07] 개별 예약 설정 모달 (대기열 전체 + 체크박스 + 날짜/시간)
function showIndividualScheduleModal(): void {
  document.getElementById('individual-schedule-modal-overlay')?.remove();

  if (!continuousQueueV2 || continuousQueueV2.length === 0) {
    toastManager.warning('📋 대기열에 항목이 없습니다. 먼저 항목을 추가해주세요.');
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'individual-schedule-modal-overlay';
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 50000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px);';

  const itemRows = continuousQueueV2.map((item: any, i: number) => {
    let curDate = '';
    let curTime = '';
    if (item.scheduleDate) {
      curDate = item.scheduleDate.split(/[T ]/)[0];
      curTime = item.scheduleTime || item.scheduleDate.split('T')[1]?.substring(0, 5) || '';
    }
    const isScheduled = item.publishMode === 'schedule' && curDate;
    const label = item.value || `항목 ${i + 1}`;
    const shortLabel = label.length > 22 ? label.substring(0, 22) + '...' : label;

    return `
      <div style="display: grid; grid-template-columns: 30px 1fr auto auto; gap: 0.5rem; align-items: center; padding: 0.5rem 0.6rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;" data-idx="${i}">
        <input type="checkbox" class="indv-check" data-idx="${i}" ${isScheduled ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: #10b981; cursor: pointer;">
        <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.8rem; color: var(--text-strong, #fff);" title="${label}">${shortLabel}</div>
        <input type="date" class="indv-date" data-idx="${i}" value="${curDate}" style="padding: 0.35rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.8rem; color-scheme: dark; width: 130px;">
        <input type="time" class="indv-time" data-idx="${i}" value="${curTime || '09:00'}" step="600" style="padding: 0.35rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.8rem; color-scheme: dark; width: 100px;">
      </div>`;
  }).join('');

  overlay.innerHTML = `
    <div style="background: var(--bg-primary, #1a1a2e); border: 2px solid rgba(16, 185, 129, 0.4); border-radius: 16px; max-width: 620px; width: 95%; box-shadow: 0 25px 50px rgba(0,0,0,0.5); max-height: 85vh; display: flex; flex-direction: column; overflow: hidden;">
      <!-- 헤더 -->
      <div style="padding: 1rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
        <h3 style="margin: 0; color: #34d399; font-size: 1.1rem; font-weight: 700;">📋 개별 예약 설정</h3>
        <button type="button" id="indv-schedule-close" style="background: none; border: none; color: var(--text-muted, #999); font-size: 1.5rem; cursor: pointer; line-height: 1;">&times;</button>
      </div>

      <!-- 전체 선택/해제 + 일괄 설정 -->
      <div style="padding: 0.75rem 1.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
        <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.8rem; color: var(--text-muted);">
          <input type="checkbox" id="indv-select-all" style="width: 16px; height: 16px; accent-color: #10b981;">
          <span>전체 선택</span>
        </label>
        <div style="margin-left: auto; display: flex; align-items: center; gap: 0.4rem;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">선택 항목 일괄:</span>
          <input type="date" id="indv-bulk-date" style="padding: 0.3rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.75rem; color-scheme: dark;">
          <input type="time" id="indv-bulk-time" value="09:00" step="600" style="padding: 0.3rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.75rem; color-scheme: dark;">
          <button type="button" id="indv-bulk-apply" style="padding: 0.3rem 0.6rem; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 6px; color: #60a5fa; cursor: pointer; font-size: 0.75rem; font-weight: 600;">적용</button>
        </div>
      </div>

      <!-- 헤더 라벨 -->
      <div style="padding: 0.4rem 1.5rem; display: grid; grid-template-columns: 30px 1fr auto auto; gap: 0.5rem; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <span></span>
        <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">대기열 항목</span>
        <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; width: 130px; text-align: center;">날짜</span>
        <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; width: 100px; text-align: center;">시간</span>
      </div>

      <!-- 아이템 리스트 (스크롤) -->
      <div style="flex: 1; overflow-y: auto; padding: 0.75rem 1.5rem; display: flex; flex-direction: column; gap: 0.4rem;">
        ${itemRows}
      </div>

      <!-- 푸터 -->
      <div style="padding: 0.75rem 1.5rem; border-top: 1px solid rgba(255,255,255,0.08); display: flex; gap: 0.5rem;">
        <button type="button" id="indv-schedule-cancel" style="flex: 1; padding: 0.7rem; background: var(--bg-tertiary, #333); color: var(--text-muted, #999); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.85rem;">취소</button>
        <button type="button" id="indv-schedule-save" style="flex: 2; padding: 0.7rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 0.85rem; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">💾 예약 저장</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 전체 선택
  document.getElementById('indv-select-all')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    overlay.querySelectorAll('.indv-check').forEach(cb => {
      (cb as HTMLInputElement).checked = checked;
    });
  });

  // 일괄 적용
  document.getElementById('indv-bulk-apply')?.addEventListener('click', () => {
    const bulkDate = (document.getElementById('indv-bulk-date') as HTMLInputElement)?.value;
    const bulkTime = (document.getElementById('indv-bulk-time') as HTMLInputElement)?.value || '09:00';
    if (!bulkDate) {
      toastManager.warning('📅 일괄 적용할 날짜를 선택해주세요.');
      return;
    }
    let appliedCount = 0;
    overlay.querySelectorAll('.indv-check').forEach(cb => {
      if ((cb as HTMLInputElement).checked) {
        const idx = (cb as HTMLElement).dataset.idx;
        const dateInput = overlay.querySelector(`.indv-date[data-idx="${idx}"]`) as HTMLInputElement;
        const timeInput = overlay.querySelector(`.indv-time[data-idx="${idx}"]`) as HTMLInputElement;
        if (dateInput) dateInput.value = bulkDate;
        if (timeInput) timeInput.value = bulkTime;
        appliedCount++;
      }
    });
    if (appliedCount > 0) {
      toastManager.info(`✅ ${appliedCount}개 항목에 ${bulkDate} ${bulkTime} 일괄 적용됨`);
    } else {
      toastManager.warning('⚠️ 체크된 항목이 없습니다.');
    }
  });

  // 닫기
  const closeModal = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.getElementById('indv-schedule-close')?.addEventListener('click', closeModal);
  document.getElementById('indv-schedule-cancel')?.addEventListener('click', closeModal);

  // 저장
  document.getElementById('indv-schedule-save')?.addEventListener('click', () => {
    let savedCount = 0;
    overlay.querySelectorAll('.indv-check').forEach(cb => {
      const idx = parseInt((cb as HTMLElement).dataset.idx || '0');
      const checked = (cb as HTMLInputElement).checked;
      const dateInput = overlay.querySelector(`.indv-date[data-idx="${idx}"]`) as HTMLInputElement;
      const timeInput = overlay.querySelector(`.indv-time[data-idx="${idx}"]`) as HTMLInputElement;
      const item = continuousQueueV2[idx];
      if (!item) return;

      if (checked && dateInput?.value) {
        const timeVal = timeInput?.value || '09:00';
        // ✅ 15분 미래 검증
        const scheduledTime = new Date(`${dateInput.value}T${timeVal}`);
        const minAllowed = new Date(Date.now() + 15 * 60 * 1000);
        if (scheduledTime.getTime() < minAllowed.getTime()) {
          const label = item.value?.substring(0, 15) || `#${idx + 1}`;
          toastManager.error(`❌ "${label}..." 예약 시간이 현재 기준 15분 이후여야 합니다!`);
          return;
        }
        item.publishMode = 'schedule';
        item.scheduleDate = dateInput.value;  // ✅ [2026-03-11 FIX] 'YYYY-MM-DD' 날짜만 저장 (기존: 'YYYY-MM-DDTHH:mm'으로 중복 저장 → 실행 시 이중 합성 버그)
        item.scheduleTime = timeVal;          // 'HH:mm' 시간만 저장
        // ✅ [2026-02-08 FIX] item.interval = 600 제거 — 사용자 설정 간격 유지
        savedCount++;
      } else if (!checked) {
        item.publishMode = 'publish';
        item.scheduleDate = undefined;
        item.scheduleTime = undefined;
      }
    });

    toastManager.success(`✅ ${savedCount}개 항목 예약 저장 완료!`);
    renderQueueListV2?.();
    updateScheduleStatusSummary();
    closeModal();
  });

  // ESC
  const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handleEsc); }
  };
  document.addEventListener('keydown', handleEsc);
}

// ✅ 전체 보기 모달
function showQueueFullViewModal(): void {
  const modal = document.getElementById('continuous-queue-fullview-modal') as HTMLElement;
  const container = document.getElementById('fullview-queue-container') as HTMLElement;
  if (!modal || !container) return;

  if (continuousQueueV2.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
        <div>큐가 비어있습니다</div>
      </div>
    `;
  } else {
    container.innerHTML = continuousQueueV2.map((item, index) => {
      const intervalText = item.interval >= 3600
        ? Math.floor(item.interval / 3600) + '시간'
        : (item.interval >= 60 ? Math.floor(item.interval / 60) + '분' : item.interval + '초');

      return `
        <div class="fullview-queue-item" style="background: var(--bg-secondary); border-radius: 12px; padding: 1.25rem; border-left: 5px solid ${statusColors[item.status]}; display: flex; align-items: center; gap: 1.25rem; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
          <div style="font-weight: 800; color: var(--text-muted); width: 40px; font-size: 1.1rem; text-align: center;">#${index + 1}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <span style="font-size: 1.1rem;">${typeIcons[item.type]}</span>
              <div style="font-weight: 700; color: var(--text-strong); font-size: 1rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.value}</div>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
              <span style="background: rgba(139, 92, 246, 0.15); color: #a78bfa; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">${imageSourceNames[item.imageSource] || item.imageSource}</span>
              <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">${publishModeNames[item.publishMode] || '🚀 즉시'}</span>
              <span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">📂 ${(window as any).categoryNames?.[item.category || 'general'] || item.category || '일반'}</span>
              ${item.realCategoryName ? `<span style="background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">🏷️ ${item.realCategoryName}</span>` : ''}
              <span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">🎯 ${contentModeNames[item.contentMode || 'homefeed'] || '홈판'}</span>
              <span style="background: rgba(139, 92, 246, 0.1); color: #a78bfa; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600;">✍️ ${toneStyleNames[item.toneStyle || 'professional'] || '전문적'}</span>
              <span>•</span>
              <span>⏱️ ${intervalText}</span>
              <span>•</span>
              <span style="color: ${statusColors[item.status]}; font-weight: 700;">
                ${item.status === 'pending' ? '⏳ 대기 중' : item.status === 'processing' ? '🔄 진행 중' : item.status === 'completed' ? '✅ 완료' : item.status === 'cancelled' ? '🛑 중지됨' : '⚠️ 실패'}
              </span>
            </div>
            ${(item.ctaType && item.ctaType !== 'none') ? `
              <div style="margin-top: 0.5rem; font-size: 0.8rem; color: #60a5fa; display: flex; align-items: center; gap: 0.5rem;">
                <span>📢 CTA: ${item.ctaType === 'previous-post' ? '이전글' : '커스텀'}</span>
                <span style="opacity: 0.6;">|</span>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.ctaUrl}</span>
              </div>
            ` : ''}
          </div>
          <div style="display: flex; gap: 0.5rem;">
            ${item.status === 'pending' ? `
              <button type="button" class="fullview-edit-btn" data-id="${item.id}" style="padding: 0.6rem 1rem; background: var(--bg-tertiary); border: 2px solid var(--border-light); border-radius: 8px; color: var(--text-strong); cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: all 0.2s;">✏️ 수정</button>
              <button type="button" class="fullview-delete-btn" data-id="${item.id}" style="padding: 0.6rem 1rem; background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3); border-radius: 8px; color: #ef4444; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: all 0.2s;">🗑️ 삭제</button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // 삭제 버튼 이벤트
  container.querySelectorAll('.fullview-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      if (confirm('이 항목을 삭제하시겠습니까?')) {
        const idx = continuousQueueV2.findIndex(item => item.id === id);
        if (idx !== -1) continuousQueueV2.splice(idx, 1);
        showQueueFullViewModal();
        renderQueueListV2();
      }
    });
  });

  // 수정 버튼 이벤트
  container.querySelectorAll('.fullview-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.id;
      const item = continuousQueueV2.find(i => i.id === id);
      if (item) {
        // 수정 모달을 띄울 때 전체 보기 모달은 숨기지 않고 위에 띄움
        // fromFullView 옵션을 주어 갱신 가능하게 함
        showEditQueueItemModal(item, { fromFullView: true });
      }
    });
  });

  modal.style.display = 'flex';
}

// ✅ 항목 수정 모달 (상세 설정 모달과 동일한 UI)
// ✅ 통합 항목 수정 모달 (기존 상세 설정 모달 재사용)
function showEditQueueItemModal(item: ContinuousQueueItem, options?: { fromFullView?: boolean }): void {
  const modal = document.getElementById('continuous-settings-modal');
  if (!modal) return;

  // 인덱스 찾기
  const idx = continuousQueueV2.findIndex(i => i.id === item.id);
  if (idx === -1) return;

  (window as any).editingIndex = idx;
  const editingIndexInput = document.getElementById('continuous-settings-editing-index') as HTMLInputElement;
  if (editingIndexInput) editingIndexInput.value = String(idx);

  // 모달 제목 및 버튼 변경
  const titleEl = modal.querySelector('h3');
  if (titleEl) titleEl.innerHTML = `✏️ 항목 수정 (#${idx + 1})`;
  const saveBtn = document.getElementById('continuous-settings-modal-save');
  if (saveBtn) saveBtn.innerHTML = '💾 수정사항 적용';

  // 항목 데이터로 모달 필드 채우기 (null 체크 추가)
  const contentModeEl = document.getElementById('continuous-modal-content-mode') as HTMLSelectElement | null;
  if (contentModeEl) contentModeEl.value = item.contentMode || 'seo';

  const toneStyleEl = document.getElementById('continuous-modal-tone-style') as HTMLSelectElement | null;
  if (toneStyleEl) toneStyleEl.value = item.toneStyle || 'professional';

  const imageSourceEl = document.getElementById('continuous-modal-image-source') as HTMLSelectElement | null;
  if (imageSourceEl) imageSourceEl.value = item.imageSource || getFullAutoImageSource();

  const radio = modal.querySelector(`input[name="continuous-modal-publish-mode"][value="${item.publishMode}"]`) as HTMLInputElement;
  if (radio) {
    radio.checked = true;
    const scheduleContainer = document.getElementById('continuous-modal-schedule-container');
    if (scheduleContainer) scheduleContainer.style.display = item.publishMode === 'schedule' ? 'block' : 'none';
  }

  if (item.scheduleDate) {
    const datePart = item.scheduleDate.split(/[T ]/)[0];
    const timePart = item.scheduleTime || item.scheduleDate.split('T')[1]?.substring(0, 5) || '09:00';
    const scheduleDateEl = document.getElementById('continuous-modal-schedule-date') as HTMLInputElement | null;
    if (scheduleDateEl) scheduleDateEl.value = datePart || '';
    const scheduleTimeEl = document.getElementById('continuous-modal-schedule-time') as HTMLInputElement | null;
    if (scheduleTimeEl) scheduleTimeEl.value = timePart;
  }

  // 카테고리
  const modalCatInput = document.getElementById('continuous-modal-category-select') as HTMLInputElement;
  const modalCatText = document.getElementById('continuous-modal-category-text');
  if (modalCatInput) modalCatInput.value = item.category || 'general';
  if (modalCatText) modalCatText.textContent = categoryNames[item.category || 'general'] || item.category || '일반';

  // 실제 블로그 카테고리
  const modalRealCat = document.getElementById('continuous-modal-real-category') as HTMLSelectElement;
  if (modalRealCat) {
    if (item.realCategory) {
      modalRealCat.innerHTML = `<option value="${item.realCategory}" selected>${item.realCategoryName || item.realCategory}</option>`;
    } else {
      modalRealCat.innerHTML = '';
    }
  }

  // CTA 및 기타 (null 체크 추가)
  const ctaTypeEl = document.getElementById('continuous-modal-cta-type') as HTMLSelectElement | null;
  if (ctaTypeEl) ctaTypeEl.value = item.ctaType || 'none';

  const ctaUrlEl = document.getElementById('continuous-modal-cta-url') as HTMLInputElement | null;
  if (ctaUrlEl) ctaUrlEl.value = item.ctaUrl || '';

  const ctaTextEl = document.getElementById('continuous-modal-cta-text') as HTMLInputElement | null;
  if (ctaTextEl) ctaTextEl.value = item.ctaText || '';

  const thumbnailTextEl = document.getElementById('continuous-modal-include-thumbnail-text') as HTMLInputElement | null;
  if (thumbnailTextEl) thumbnailTextEl.checked = !!item.includeThumbnailText;

  // AI 이미지 생성 옵션 (신규)
  const useAiImageCheck = document.getElementById('continuous-modal-use-ai-image') as HTMLInputElement | null;
  if (useAiImageCheck) useAiImageCheck.checked = item.useAiImage ?? true;

  const createThumbnailCheck = document.getElementById('continuous-modal-create-product-thumbnail') as HTMLInputElement | null;
  if (createThumbnailCheck) createThumbnailCheck.checked = !!item.createProductThumbnail;

  const intervalValueEl = document.getElementById('continuous-modal-interval-value') as HTMLInputElement | null;
  if (intervalValueEl) intervalValueEl.value = String(item.interval < 60 ? item.interval : (item.interval < 3600 ? Math.floor(item.interval / 60) : Math.floor(item.interval / 3600)));

  const intervalUnitEl = document.getElementById('continuous-modal-interval-unit') as HTMLSelectElement | null;
  if (intervalUnitEl) intervalUnitEl.value = String(item.interval < 60 ? 1 : (item.interval < 3600 ? 60 : 3600));

  modal.style.display = 'flex';
}

// ✅ 진행 모달 업데이트 헬퍼
export function updateContinuousProgressModal(data: {
  title?: string;
  step?: string;
  percentage?: number;
  total?: number;
  success?: number;
  fail?: number;
  log?: string;
}) {
  const modal = document.getElementById('continuous-progress-modal');
  if (!modal) return;

  if (data.title !== undefined) {
    const el = document.getElementById('cp-current-item-info');
    if (el) el.textContent = data.title;
  }
  if (data.step !== undefined) {
    const el = document.getElementById('cp-step-text');
    if (el) el.textContent = data.step;
  }
  if (data.percentage !== undefined) {
    const elP = document.getElementById('cp-percentage');
    const elB = document.getElementById('cp-progress-bar');
    if (elP) elP.textContent = `${Math.round(data.percentage)}%`;
    if (elB) elB.style.width = `${data.percentage}%`;
  }
  if (data.total !== undefined) {
    const el = document.getElementById('cp-total-count');
    if (el) el.textContent = String(data.total);
  }
  if (data.success !== undefined) {
    const el = document.getElementById('cp-success-count');
    if (el) el.textContent = String(data.success);
  }
  if (data.fail !== undefined) {
    const el = document.getElementById('cp-fail-count');
    if (el) el.textContent = String(data.fail);
  }
  if (data.log !== undefined) {
    const el = document.getElementById('cp-detail-log');
    if (el) {
      const now = new Date();
      const timeStr = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
      // ✅ [2026-03-07] 컬러 코딩 + XSS 방지
      let logColor = '#cbd5e1';
      if (data.log.includes('✅') || data.log.includes('완료') || data.log.includes('성공')) logColor = '#10b981';
      else if (data.log.includes('❌') || data.log.includes('실패') || data.log.includes('오류')) logColor = '#ef4444';
      else if (data.log.includes('⚠️') || data.log.includes('건너뛰기')) logColor = '#f59e0b';
      else if (data.log.includes('🤖') || data.log.includes('AI')) logColor = '#8b5cf6';
      else if (data.log.includes('🚀')) logColor = '#3b82f6';
      const safeLog = data.log.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const newLog = document.createElement('p');
      newLog.style.cssText = 'margin: 0 0 0.5rem 0; font-size: 0.85rem; border-left: 2px solid rgba(59, 130, 246, 0.4); padding-left: 0.5rem;';
      newLog.innerHTML = `<span style="color: #60a5fa; font-weight: 600; margin-right: 0.5rem;">${timeStr}</span> <span style="color: ${logColor}">${safeLog}</span>`;
      el.appendChild(newLog);
      // ✅ [2026-02-15] cp-detail-log DOM 노드 150개 제한 — 무한 성장 방지 (UI 깜빡임 원인)
      while (el.children.length > 150) {
        el.removeChild(el.firstChild!);
      }
      // ✅ [2026-02-15] scrollTop은 rAF로 배치하여 layout thrashing 방지
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }
}

// ✅ 연속 발행 모달 숨기기 (발행은 백그라운드에서 계속 진행)
function hideContinuousProgressModal(): void {
  const modal = document.getElementById('continuous-progress-modal');
  if (modal) {
    modal.style.display = 'none';
    toastManager.info('📂 발행이 백그라운드에서 진행 중입니다. 메인 하단 인디케이터에서 상황을 확인할 수 있습니다.', 4000);
  }
}
(window as any).hideContinuousProgressModal = hideContinuousProgressModal;

// ✅ 인터럽트 가능한 대기 함수
async function waitWithInterrupt(seconds: number): Promise<boolean> {
  const start = Date.now();
  const ms = seconds * 1000;
  while (Date.now() - start < ms) {
    if (!isContinuousMode) return false; // 중지됨

    // 모달 로그 업데이트 (카운트다운 시각화)
    const remaining = Math.max(0, Math.ceil((ms - (Date.now() - start)) / 1000));
    updateContinuousProgressModal({
      step: '다음 항목 대기 중...',
      log: `⏰ ${remaining}초 후 다음 발행을 시작합니다.`
    });

    await new Promise(resolve => setTimeout(resolve, 500)); // 0.5초마다 체크
  }
  return true;
}

// ✅ 연속 발행 V2 시작
async function startContinuousPublishingV2(): Promise<void> {
  if (continuousQueueV2.length === 0) {
    toastManager.warning('발행할 항목이 없습니다. 먼저 항목을 추가해주세요.');
    return;
  }

  const pendingItems = continuousQueueV2.filter(i => i.status === 'pending');
  if (pendingItems.length === 0) {
    toastManager.warning('발행 대기 중인 항목이 없습니다.');
    return;
  }

  isContinuousMode = true;

  // ✅ [2026-03-11 FIX] 새 연속발행 시작 시 이전 중지 플래그 초기화
  // resetAfterPublish()에서 리셋을 제거했으므로, 새 발행 시작 지점에서 명시적으로 리셋
  // 이전 중지 후 stopFullAutoPublish=true가 남아있으면 즉시 중단되는 버그 방지
  (window as any).stopFullAutoPublish = false;
  (window as any).stopBatchPublish = false;

  // ✅ [2026-01-21] 연속 발행 시작 시 락 강제 해제 (이전 세션 잔여 락 제거)
  clearImageGenerationLocks();
  console.log('[Continuous] 🔓 이미지 생성 락 초기화 완료');

  // ✅ 진행 모달 표시
  const progressModal = document.getElementById('continuous-progress-modal');
  if (progressModal) progressModal.style.display = 'flex';

  // 초기화
  let successCount = 0;
  let failCount = 0;
  const totalCount = pendingItems.length;

  updateContinuousProgressModal({
    total: totalCount,
    success: 0,
    fail: 0,
    percentage: 0,
    step: '준비 중...',
    log: '발행 프로세스를 시작합니다.'
  });

  // UI 업데이트 (기존 인디케이터 등)
  const startBtn = document.getElementById('continuous-start-btn');
  const stopBtn = document.getElementById('continuous-stop-btn');
  const statusIndicator = document.getElementById('continuous-status-indicator');
  const statusText = document.getElementById('continuous-status-text');

  if (startBtn) (startBtn as HTMLElement).style.display = 'none';
  if (stopBtn) (stopBtn as HTMLElement).style.display = 'flex';
  if (statusIndicator) statusIndicator.style.background = '#f59e0b';

  appendLog(`🚀 연속 발행 시작: ${pendingItems.length}개 항목`);

  const publishModeLabels: Record<string, string> = {
    'publish': '즉시발행',
    'draft': '임시저장',
    'schedule': '네이버 예약발행'
  };

  // ✅ [2026-01-28 FIX] localStorage 설정 최우선 적용
  const includeThumbnailTextEl = document.getElementById('continuous-include-thumbnail-text') as HTMLInputElement | null;
  const includeThumbnailText = localStorage.getItem('thumbnailTextInclude') === 'true' ||
    includeThumbnailTextEl?.checked || false;
  console.log(`[Continuous] 🖼️ 썸네일 텍스트 포함: ${includeThumbnailText} (localStorage 또는 체크박스)`);

  // ✅ [2026-01-21] 배너 자동 생성 체크박스 읽기
  const autoBannerGenerateEl = document.getElementById('continuous-auto-banner-generate') as HTMLInputElement | null;
  const autoBannerGenerate = autoBannerGenerateEl?.checked || false;
  console.log(`[Continuous] 🎨 배너 자동 생성 옵션: ${autoBannerGenerate ? '활성화' : '비활성화'}`);

  // ✅ 카테고리 정보 수집
  const selectedCategory = (document.getElementById('real-blog-category-select') as HTMLSelectElement)?.value || undefined;

  // ✅ [2026-02-09 v2] 연속발행 제목 히스토리 (중복 방지)
  const previousTitles: string[] = [];
  (window as any)._previousTitles = previousTitles;

  for (let i = 0; i < continuousQueueV2.length; i++) {
    const item = continuousQueueV2[i];
    if (!isContinuousMode) break;
    if (item.status !== 'pending') continue;

    const currentIdx = successCount + failCount + 1;
    const progress = ((currentIdx - 0.5) / totalCount) * 100;

    item.status = 'processing';
    // ✅ [2026-02-15] rAF로 배치하여 발행 루프 중 UI 깜빡임 방지
    requestAnimationFrame(() => renderQueueListV2());

    updateContinuousProgressModal({
      title: `${item.value.substring(0, 30)}${item.value.length > 30 ? '...' : ''}`,
      step: '콘텐츠 생성 중...',
      log: `[${currentIdx}/${totalCount}] AI가 콘텐츠를 생성하고 있습니다.`,
      percentage: progress
    });

    // ✅ [2026-03-07 FIX] 전역 상태 완전 초기화 — resetAfterPublish()와 동일 수준
    // 이전 발행 데이터 잔존으로 인한 상품 불일치/이미지 오염/콘텐츠 타입 오류 방지
    try {
      // ImageManager 초기화 — clearAll 없으면 clear 폴백
      if (typeof ImageManager !== 'undefined') {
        if (typeof ImageManager.clearAll === 'function') ImageManager.clearAll();
        else if (typeof ImageManager.clear === 'function') ImageManager.clear();
      }
      // 이미지 전역 변수 초기화
      (window as any).generatedImages = [];
      (window as any).imageManagementGeneratedImages = [];
      (window as any).collectedImages = [];
      (window as any).crawledImages = [];
      (window as any).headingImageMap = new Map();
      (window as any).selectedThumbnail = null;
      (window as any).manualThumbnailPath = null;
      // 콘텐츠 전역 변수 초기화
      (window as any).currentStructuredContent = null;
      currentStructuredContent = null;
      currentPostId = null;
      (window as any).currentHeadings = [];
      (window as any).currentKeyword = '';
      (window as any).currentTitle = '';
      (window as any).currentSourceUrl = '';
      // 콘텐츠 생성에 영향을 주는 전역 옵션 초기화
      (window as any)._keywordTitleOptions = null;
      (window as any)._toneOverride = null;
      (window as any).selectedContentType = null;
      // 배너/썸네일 프리셋 초기화
      (window as any).customBannerPath = null;
      (window as any).continuousPresetThumbnail = null;
      (window as any).continuousPresetThumbnailPath = null;
      // ✅ [2026-03-11 FIX] stopFullAutoPublish 리셋 제거
      // 기존: 매 항목마다 false로 리셋 → 중지 버튼 클릭 후에도 플래그 무효화
      // 수정: 리셋하지 않음. fullAutoFlow.ts L278에서 연속발행 모드가 아닐 때만 리셋함.
      // (window as any).stopFullAutoPublish = false; // ❌ 삭제: 중지 버튼 무효화 방지
      console.log(`[Continuous] 🧹 항목 #${currentIdx} 전역 상태 초기화 완료 (20+개 변수)`);
    } catch (e) {
      console.warn('[Continuous] 상태 초기화 중 오류 (무시 가능):', e);
    }


    try {
      const modeLabel = publishModeLabels[item.publishMode] || '즉시발행';
      appendLog(`📝 처리 중: ${item.value.substring(0, 40)}... (${modeLabel})`);

      if (statusText) statusText.textContent = `발행 중... (${currentIdx}/${totalCount})`;

      // ✅ [2026-03-07 FIX] 콘텐츠 모드 UI 동기화 — isShoppingConnectModeActive()가 DOM을 읽으므로
      // 항목별 contentMode를 UI에 반영해야 올바른 SEO 제목/리뷰형 분기 동작
      try {
        const contentModeEl = document.getElementById('unified-content-mode') as HTMLInputElement;
        if (contentModeEl) contentModeEl.value = item.contentMode || 'seo';
        const continuousContentModeEl = document.getElementById('continuous-content-mode-select') as HTMLSelectElement;
        if (continuousContentModeEl) continuousContentModeEl.value = item.contentMode || 'seo';
      } catch (e) { /* DOM sync 실패 무시 */ }

      // 콘텐츠 생성
      if (item.type === 'url') {
        const customKeyword = item.customKeyword || '';
        // ✅ [2026-01-21] 다중 URL 지원: 메인 URL + additionalUrls 합치기
        let combinedUrls = item.value;
        if (item.additionalUrls && item.additionalUrls.length > 0) {
          combinedUrls = [item.value, ...item.additionalUrls].join('\n');
          console.log(`[Continuous] 📚 다중 URL 사용: ${1 + item.additionalUrls.length}개 소스`);
        }
        await generateContentFromUrl(combinedUrls, customKeyword, item.toneStyle, true, item.contentMode, item.category);
      } else {
        // ✅ [2026-02-13] V2 큐: 키워드 제목 옵션 적용
        setKeywordTitleOptionsFromItem(item.value, item.keywordAsTitle, item.keywordTitlePrefix);
        await generateContentFromKeywords(item.customTitle || '', item.value, item.toneStyle, true, item.contentMode, item.category);
      }

      if (!isContinuousMode) break;

      // 발행 실행
      const structuredContent = (window as any).currentStructuredContent;
      // ✅ [2026-03-07 FIX] 콘텐츠 유효성 검증 — 이전 항목 잔존 데이터 방지
      if (structuredContent && structuredContent.selectedTitle) {
        // ✅ [2026-03-15 FIX] URL이 keyword로 사용되는 것을 방지
        // item.value가 URL이면 keyword로 사용하지 않음 (제목/이미지에 URL이 각인되는 버그 수정)
        const rawExpectedKeyword = item.customKeyword || item.value || '';
        const expectedKeyword = /^https?:\/\//i.test(rawExpectedKeyword) ? '' : rawExpectedKeyword;
        const generatedTitle = String(structuredContent.selectedTitle || '');
        if (expectedKeyword && expectedKeyword.length >= 2) {
          const tokens = expectedKeyword.split(/[\s,]+/).filter((t: string) => t.length >= 2);
          const titleLower = generatedTitle.toLowerCase();
          const hasMatch = tokens.length === 0 || tokens.some((t: string) => titleLower.includes(t.toLowerCase()));
          if (!hasMatch) {
            console.warn(`[Continuous] ⚠️ 상품 혼선 감지: expected="${expectedKeyword}", got="${generatedTitle}"`);
            appendLog(`⚠️ 상품 불일치 감지 — "${expectedKeyword.substring(0, 20)}" 요청, "${generatedTitle.substring(0, 30)}" 생성됨. 재생성 시도...`);
            try {
              // ✅ [2026-03-11 FIX] 콘텐츠 재생성 전 중지 체크
              if (!isContinuousMode) {
                appendLog('⏹️ 콘텐츠 재생성 전 중지 요청 감지');
                break;
              }
              (window as any).currentStructuredContent = null;
              currentStructuredContent = null;
              (window as any)._keywordTitleOptions = null;
              if (item.type === 'url') {
                await generateContentFromUrl(item.value, expectedKeyword, item.toneStyle, true, item.contentMode, item.category);
              } else {
                setKeywordTitleOptionsFromItem(item.value, item.keywordAsTitle, item.keywordTitlePrefix);
                await generateContentFromKeywords(item.customTitle || '', item.value, item.toneStyle, true, item.contentMode, item.category);
              }
              const retried = (window as any).currentStructuredContent;
              if (retried && retried.selectedTitle) {
                appendLog(`✅ 재생성 완료: "${retried.selectedTitle.substring(0, 30)}..."`);
              }
            } catch (retryErr) {
              appendLog(`⚠️ 재생성 실패 — 원본으로 진행: ${(retryErr as Error).message}`);
            }
          }
        }
      }
      // 재생성 후 최신 structuredContent 다시 참조
      const finalStructuredContent = (window as any).currentStructuredContent;
      if (finalStructuredContent) {
        updateContinuousProgressModal({
          step: '블로그 발행 중...',
          log: '네이버 블로그에 포스팅을 전송하고 있습니다.',
          percentage: (currentIdx / totalCount) * 100 - 5
        });

        // ✅ 연속발행: 사용자 지정 제목/키워드가 있으면 최종 제목을 강제 세팅
        applyContinuousTitleOverrides(item, finalStructuredContent);

        // ✅ [2026-02-09 v2] 생성된 제목을 히스토리에 추가 (다음 발행 시 중복 방지)
        if (finalStructuredContent.selectedTitle) {
          previousTitles.push(finalStructuredContent.selectedTitle);
          (window as any)._previousTitles = previousTitles;
          console.log(`[Continuous] 📝 제목 히스토리 누적: ${previousTitles.length}개`);
        }

        // ✅ [2026-03-07 FIX] 이미지 건너뛰기 조건 확장
        // 'skip': 이미지 없이 발행, 'saved': 저장된 이미지 사용 (AI 생성 불필요)
        const skipImages = item.imageSource === 'skip'
          || item.imageSource === 'saved'
          || localStorage.getItem('textOnlyPublish') === 'true';
        if (!skipImages) {
          updateContinuousProgressModal({
            step: '이미지 생성 중...',
            log: `[${currentIdx}/${totalCount}] 이미지를 생성/수집하고 있습니다.`,
            percentage: (currentIdx / totalCount) * 100 - 15
          });

          try {
            // ✅ [2026-02-24 FIX] 서론이 있으면 썸네일 섹션을 맨 앞에 별도 추가
            // 썸네일(index 0)은 소제목이 아닌 별도 항목 → odd/even 필터링이 정확히 동작
            const rawHeadings = finalStructuredContent.headings || [];
            const headings = finalStructuredContent.introduction
              ? [{ title: finalStructuredContent.selectedTitle || '🖼️ 썸네일', content: finalStructuredContent.introduction, isThumbnail: true, isIntro: true }, ...rawHeadings]
              : rawHeadings;

            // ✅ [2026-01-21] 연속 발행: 이미지 생성 전 락 강제 해제 (이전 글 락 잔여 방지)
            clearImageGenerationLocks();

            // ✅ [2026-01-28] 이미지 설정 전역 적용 (localStorage에서 읽음)
            const scSubImageSource = localStorage.getItem('scSubImageSource') || 'ai';
            const isCollectedMode = item.contentMode === 'affiliate' && scSubImageSource === 'collected';

            // ✅ [2026-03-07 FIX] 쇼핑커넥트 수집 이미지 모드일 때 AI 이미지 생성 완전 스킵
            // executeFullAutoFlow의 isCollectedMode 로직(L332-440)이 수집 이미지를 직접 처리함
            let generatedImgs: any[] = [];
            if (isCollectedMode) {
              appendLog('📷 쇼핑커넥트 수집 이미지 모드 — AI 이미지 생성을 건너뜁니다.');
              console.log('[Continuous] 📷 수집 이미지 모드: generateImagesForAutomation 스킵 → executeFullAutoFlow에서 처리');
              updateContinuousProgressModal({
                step: '수집 이미지 사용 중...',
                log: `[${currentIdx}/${totalCount}] 수집된 상품 이미지를 사용합니다.`,
              });
            } else {
              // ✅ [2026-03-12 FIX] thumbnailOnly / headingImageMode=none 체크
              // 이 모드들에서는 generateImagesForAutomation을 건너뛰고
              // fullAutoFlow의 전용 썸네일/thumbnailOnly 로직에 위임
              const _thumbnailOnly = localStorage.getItem('thumbnailOnly') === 'true';
              const _headingImageMode = localStorage.getItem('headingImageMode') || 'all';
              
              if (_thumbnailOnly) {
                appendLog('📷 썸네일만 생성 모드 — 소제목 이미지 생성을 건너뜁니다.');
                console.log('[Continuous] 📷 thumbnailOnly=true: generateImagesForAutomation 스킵 → fullAutoFlow 전용 썸네일에 위임');
              } else if (_headingImageMode === 'none') {
                appendLog('🚫 이미지 없이 모드 — 이미지 생성을 건너뜁니다.');
                console.log('[Continuous] 🚫 headingImageMode=none: generateImagesForAutomation 스킵');
              } else {
                // ✅ [2026-02-20 FIX] structuredContent에서 수집 이미지 우선 참조
                // 전역 배열은 line 6780에서 초기화되므로 비어있음 → structuredContent.collectedImages 우선
                const collectedImgs = (finalStructuredContent?.collectedImages?.length > 0
                  ? finalStructuredContent.collectedImages
                  : (window as any).imageManagementGeneratedImages || (window as any).generatedImages || []);

                generatedImgs = await generateImagesForAutomation(
                  item.imageSource,
                  headings,
                  finalStructuredContent.selectedTitle,
                  {
                    stopCheck: () => !isContinuousMode,
                    onProgress: (msg) => {
                      appendLog(msg);
                      // 진행 모달에 로그 업데이트 (너무 빈번하면 생략 가능)
                      const modalLog = document.getElementById('continuous-progress-log');
                      if (modalLog) modalLog.textContent = msg;
                    },
                    allowThumbnailText: includeThumbnailText, // ✅ 썸네일 텍스트 포함 옵션 전달
                    collectedImages: undefined
                  }
                );
              }
            }

            if (!isContinuousMode) break;

            // 전역 변수 설정 (executeUnifiedAutomation에서 사용)
            (window as any).generatedImages = generatedImgs;

            // ImageManager에도 동기화 (필요시)
            try {
              if (typeof ImageManager !== 'undefined') {
                ImageManager.clear();
                if (headings.length > 0) ImageManager.setHeadings(headings);

                generatedImgs.forEach((img: any) => {
                  const h = img.heading || finalStructuredContent.selectedTitle;
                  if (h) ImageManager.addImage(h, img);
                });
                // ✅ [2026-02-12 P1 FIX #7] syncGlobalImagesFromImageManager 호출
                syncGlobalImagesFromImageManager();
              }
            } catch (e) {
              console.warn('[Continuous] ImageManager 동기화 실패:', e);
            }

          } catch (imgErr) {
            console.error('[Continuous] 이미지 생성 실패:', imgErr);
            appendLog(`❌ 이미지 생성 실패: ${(imgErr as Error).message}`);
            // ✅ [2026-03-09 FIX] 이미지 생성 실패 시 해당 항목 실패 처리
            // 기존: 에러 삼키고 이미지 없이 발행 → '파일 전송 오류' 발생
            updateContinuousProgressModal({
              log: `❌ 이미지 생성 실패로 이 항목을 건너뜁니다: ${(imgErr as Error).message}`
            });
            throw new Error(`이미지 생성 실패: ${(imgErr as Error).message}`);
          }
        }

        // ✅ [2026-01-23 FIX] 생성된 글 목록에 저장 (다중계정 발행과 동일한 방식으로 통일)
        // 이미지 생성 후에 저장해야 이미지도 함께 저장됨
        const generatedImgsForSave = (window as any).generatedImages || [];
        const savedPostId = saveGeneratedPostFromData(finalStructuredContent, generatedImgsForSave, {
          category: item.category || selectedCategory,
          toneStyle: item.toneStyle,
          ctaText: item.ctaText || '',
          ctaLink: item.ctaUrl || '',
        });
        if (savedPostId) {
          currentPostId = savedPostId;
          console.log(`[Continuous] 💾 글 저장 완료 (postId: ${savedPostId}, 이미지: ${generatedImgsForSave.length}개)`);
        }

        const formData = {
          mode: 'full-auto',
          generator: UnifiedDOMCache.getGenerator(),
          structuredContent: finalStructuredContent,
          imageSource: skipImages ? 'skip' : item.imageSource,
          skipImages,
          publishMode: item.publishMode,
          // ✅ [2026-03-11 FIX] scheduleDate + scheduleTime → 'YYYY-MM-DD HH:mm' 정규화
          // 방어 로직: scheduleDate에 T나 공백으로 시간이 포함되어 있어도 날짜만 추출 후 scheduleTime과 합성
          scheduleDate: item.publishMode === 'schedule' && item.scheduleDate
            ? (() => {
                const datePart = item.scheduleDate!.split(/[T ]/)[0]; // 'YYYY-MM-DD'
                const timePart = item.scheduleTime
                  || item.scheduleDate!.split(/[T ]/)[1]  // scheduleDate에 포함된 시간 폴백
                  || '09:00';                                // 최종 기본값
                return `${datePart} ${timePart}`;
              })()
            : undefined,
          scheduleType: item.scheduleType || 'naver-server',
          includeThumbnailText,
          keywords: item.customKeyword,
          // ✅ [2026-02-03 FIX] CTA 필드명 불일치 수정 - PostCyclePayload 스키마에 맞게 변환
          ctaLink: item.ctaUrl, // ctaUrl → ctaLink로 매핑
          ctaText: item.ctaText,
          // ✅ ctaType에 따른 skipCta 및 ctas 설정
          skipCta: item.ctaType === 'none',
          ctas: item.ctaType === 'custom' && item.ctaUrl ? [{
            link: item.ctaUrl,
            text: item.ctaText || '자세히 보러가기',
            position: 'bottom'
          }] : undefined,
          category: item.category || selectedCategory, // ✅ [2026-01-22 FIX] 연속발행 항목의 콘텐츠 카테고리 우선 사용 (CTA 이전글 찾기용)
          categoryName: item.realCategoryName, // ✅ [2026-02-03 FIX] 네이버 블로그 카테고리 이름 전달
          contentMode: item.contentMode, // ✅ 콘텐츠 모드 추가
          affiliateLink: item.affiliateLink, // ✅ 제휴 링크 추가
          keepBrowserOpen: true, // ✅ 연속발행 시 항상 브라우저 세션 유지
          autoBannerGenerate, // ✅ [2026-01-21] 배너 자동 생성 옵션
          customBannerPath: (window as any).customBannerPath || undefined, // ✅ [2026-02-19] 커스텀 배너 경로 추가
          // ✅ [2026-02-09 FIX] ctaType 전달 — 이전글 자동 검색 조건에 필수
          // executeFullAutoFlow L23996: isPreviousPostMode = formData.ctaType === 'previous-post'
          ctaType: item.ctaType || 'none',
          // ✅ [2026-02-09 FIX] 이전글 정보 (executeFullAutoFlow에서 동적으로 찾지만 초기값도 전달)
          previousPostUrl: item.previousPostUrl || undefined,
          previousPostTitle: item.previousPostTitle || undefined,
          // ✅ [2026-03-12 FIX] thumbnailOnly 설정 전달 (localStorage에서 읽어 fullAutoFlow에 전달)
          thumbnailOnly: localStorage.getItem('thumbnailOnly') === 'true',
        };

        // ✅ [2026-03-11 FIX] 발행 실행 직전 최종 중지 체크 — 어떤 발행 모드든 반드시 적용
        if (!isContinuousMode || (window as any).stopFullAutoPublish) {
          appendLog('⏹️ 발행 전 중지 요청 감지 — 이 항목을 건너뜁니다.');
          throw new Error('사용자가 작업을 취소했습니다.');
        }

        await executeUnifiedAutomation(formData);
      }

      item.status = 'completed';
      successCount++;
      appendLog(`✅ 완료: ${item.value.substring(0, 30)}... (${modeLabel})`);

      updateContinuousProgressModal({
        success: successCount,
        step: '발행 완료',
        log: '성공적으로 발행되었습니다.',
        percentage: (currentIdx / totalCount) * 100
      });

    } catch (error) {
      item.status = 'failed';
      failCount++;
      appendLog(`❌ 실패: ${(error as Error).message}`);

      updateContinuousProgressModal({
        fail: failCount,
        step: '발행 실패',
        log: `오류: ${(error as Error).message}`,
        percentage: (currentIdx / totalCount) * 100
      });
    }

    // ✅ [2026-02-15] rAF로 배치하여 발행 루프 중 UI 깜빡임 방지
    requestAnimationFrame(() => renderQueueListV2());

    // 다음 항목 대기
    const nextPending = continuousQueueV2.find(it => it.status === 'pending');
    if (nextPending && isContinuousMode) {
      const waitOk = await waitWithInterrupt(item.interval);
      if (!waitOk) break;
    }
  }

  // 완료 처리
  if (isContinuousMode) {
    isContinuousMode = false;
    if (startBtn) (startBtn as HTMLElement).style.display = 'flex';
    if (stopBtn) (stopBtn as HTMLElement).style.display = 'none';
    if (statusIndicator) statusIndicator.style.background = '#10b981';
    if (statusText) statusText.textContent = '발행 완료';

    updateContinuousProgressModal({
      step: '🎉 모든 작업 완료',
      log: `총 ${totalCount}개 중 ${successCount}개 성공, ${failCount}개 실패`,
      percentage: 100
    });

    appendLog('✅ 모든 연속 발행 완료!');
    toastManager.success(`모든 발행이 완료되었습니다! (성공: ${successCount}, 실패: ${failCount})`);

    // ✅ [2026-01-29 개선] 발행 완료 후 전체 상태 초기화
    try {
      console.log('[Continuous] 🧹 발행 완료 → 전체 상태 초기화...');

      // ✅ 통합 초기화 함수 호출
      if (typeof (window as any).resetAfterPublish === 'function') {
        (window as any).resetAfterPublish();
      }

      // 추가 정리: 연속발행 특화 상태
      (window as any).imageManagementGeneratedImages = [];
      (window as any).continuousPresetThumbnail = null;
      (window as any).continuousPresetThumbnailPath = null;

      // ImageManager 초기화
      if (typeof ImageManager !== 'undefined') {
        ImageManager.clear();
      }

      console.log('[Continuous] ✅ 전체 상태 초기화 완료 → 새 발행 준비 완료');
    } catch (memErr) {
      console.warn('[Continuous] 상태 초기화 중 오류:', memErr);
    }

    // 3초 후 모달 자동 닫기 (사용자가 결과를 볼 수 있게)
    setTimeout(() => {
      const modal = document.getElementById('continuous-progress-modal');
      if (modal) modal.style.display = 'none';
    }, 4000);
  }
}
(window as any).startContinuousPublishingV2 = startContinuousPublishingV2;

// ✅ 다음 5개 건너뛰기
function skipNextFiveItemsV2(): void {
  if (continuousQueueV2.length === 0) {
    toastManager.warning('대기열이 비어있습니다.');
    return;
  }

  // pending 상태인 항목 중 앞에서 5개 제거
  let removedCount = 0;
  for (let i = 0; i < continuousQueueV2.length && removedCount < 5; i++) {
    if (continuousQueueV2[i].status === 'pending') {
      continuousQueueV2.splice(i, 1);
      i--; // 인덱스 조정
      removedCount++;
    }
  }

  if (removedCount > 0) {
    toastManager.success(`${removedCount}개 항목을 건너뛰었습니다.`);
    renderQueueListV2();
  } else {
    toastManager.warning('건너뛸 대기 중인 항목이 없습니다.');
  }
}
(window as any).skipNextFiveItemsV2 = skipNextFiveItemsV2;
(window as any).stopContinuousMode = stopContinuousMode;

export function startContinuousModeEnhanced(queue: typeof continuousPublishQueue): void {
  continuousPublishQueue = [...queue];
  isContinuousMode = true;
  // ✅ [2026-03-11 FIX] 새 연속발행 시작 시 이전 중지 플래그 초기화
  (window as any).stopFullAutoPublish = false;
  (window as any).stopBatchPublish = false;
  processNextInQueueEnhanced();
}

async function processNextInQueueEnhanced(): Promise<void> {
  if (!isContinuousMode || continuousPublishQueue.length === 0) {
    if (continuousPublishQueue.length === 0) {
      appendLog('✅ 모든 연속 발행 완료!');
      stopContinuousMode('complete');
    }
    return;
  }

  const item = continuousPublishQueue.shift();
  if (!item) return;

  const remaining = continuousPublishQueue.length;
  appendLog(`📝 [${remaining + 1}개 남음] ${item.type === 'url' ? 'URL' : '키워드'}: ${item.value.substring(0, 50)}...`);

  try {
    if (item.type === 'url') {
      // URL 기반 발행 (suppressModal: true)
      await generateContentFromUrl(item.value, undefined, item.toneStyle, true);
    } else if (item.type === 'keyword') {
      // 키워드 기반 발행 (suppressModal: true)
      // ✅ [2026-02-13] Enhanced 큐: 연속발행 체크박스에서 직접 읽기 (하위 호환)
      const enhancedKeywordAsTitle = (document.getElementById('continuous-keyword-as-title') as HTMLInputElement)?.checked || false;
      const enhancedKeywordTitlePrefix = (document.getElementById('continuous-keyword-title-prefix') as HTMLInputElement)?.checked || false;
      setKeywordTitleOptionsFromItem(item.value, enhancedKeywordAsTitle, enhancedKeywordTitlePrefix);
      await generateContentFromKeywords('', item.value, item.toneStyle, true);
    }

    // 콘텐츠 생성 후 발행
    const structuredContent = (window as any).currentStructuredContent;
    if (structuredContent) {
      await executeContinuousPublish(structuredContent, item.publishMode, item.scheduleDate);
    }

    appendLog(`✅ 발행 완료: ${item.value.substring(0, 30)}...`);
  } catch (error) {
    appendLog(`❌ 발행 실패: ${(error as Error).message}`);
  }

  // 다음 항목 처리 (사용자 설정 시간 대기)
  if (continuousPublishQueue.length > 0) {
    const intervalInput = document.getElementById('continuous-interval-seconds') as HTMLInputElement;
    const userInterval = intervalInput ? parseInt(intervalInput.value) || 30 : 30;
    const waitTime = Math.max(5, Math.min(3600, userInterval));
    appendLog(`⏰ ${waitTime}초 후 다음 발행 시작...`);
    setTimeout(() => processNextInQueueEnhanced(), waitTime * 1000);
  } else {
    appendLog('✅ 모든 연속 발행 완료!');
    stopContinuousMode('complete');
  }
}

// ✅ 연속 발행 실행 (발행 모드 지원)
export async function executeContinuousPublish(structuredContent: any, publishMode: string, scheduleDate?: string): Promise<void> {
  // ✅ 사용자 설정 이미지 소스 가져오기 (리뉴얼 모달: select 우선, 구형 UI: radio fallback)
  const imageSourceSelect = document.getElementById('continuous-image-source-select') as HTMLSelectElement | null;
  const imageSourceRadio = document.querySelector('input[name="continuous-image-source"]:checked') as HTMLInputElement | null;
  const imageSource = imageSourceSelect?.value || imageSourceRadio?.value || getFullAutoImageSource();
  // ✅ [2026-03-07 FIX] 이미지 건너뛰기 조건 확장
  const skipImages = imageSource === 'skip'
    || imageSource === 'saved'
    || localStorage.getItem('textOnlyPublish') === 'true';

  // ✅ 연속발행: 썸네일 텍스트 포함 옵션
  const includeThumbnailTextEl = document.getElementById('continuous-include-thumbnail-text') as HTMLInputElement | null;
  const includeThumbnailText = includeThumbnailTextEl?.checked || false;

  console.log(`[Continuous] 이미지 소스: ${imageSource}, 이미지 건너뛰기: ${skipImages}, 썸네일 텍스트 포함: ${includeThumbnailText}`);

  const formData = {
    mode: 'full-auto',
    generator: UnifiedDOMCache.getGenerator(), // ✅ [2026-02-22 FIX] perplexity 지원
    toneStyle: (document.getElementById('unified-tone-style') as HTMLInputElement)?.value || 'friendly',
    structuredContent,
    imageSource: skipImages ? getFullAutoImageSource() : imageSource,
    skipImages,
    publishMode, // publish, draft, schedule
    scheduleDate,
    includeThumbnailText,
    categoryName: UnifiedDOMCache.getRealCategoryName(), // ✅ [2026-02-11 FIX] 카테고리 이름(text) 전달 — value(번호) 아닌 name으로 발행 모달에서 매칭
  };

  await executeUnifiedAutomation(formData);
}

// API 키 및 풀오토 발행 테스트 함수들
export async function testApiKeysAndFullAuto() {
  console.log('[Test] API 키 및 풀오토 발행 테스트 시작');

  try {
    // 1. 현재 설정된 API 키들 확인
    const config = await window.api.getConfig();
    console.log('[Test] 현재 설정:', {
      'gemini-api-key': config['gemini-api-key'] ? config['gemini-api-key'].substring(0, 20) + '...' : '없음',
      'openai-api-key': config['openai-api-key'] ? config['openai-api-key'].substring(0, 20) + '...' : '없음',
      'claude-api-key': config['claude-api-key'] ? config['claude-api-key'].substring(0, 20) + '...' : '없음',
      'pexels-api-key': config['pexels-api-key'] ? config['pexels-api-key'].substring(0, 20) + '...' : '없음'
    });

    appendLog('🔑 API 키 상태 확인 중...');
    appendLog(`🤖 Gemini API: ${config['gemini-api-key'] ? '설정됨' : '미설정'}`);
    appendLog(`🧠 OpenAI API: ${config['openai-api-key'] ? '설정됨' : '미설정'}`);
    appendLog(`🦾 Claude API: ${config['claude-api-key'] ? '설정됨' : '미설정'}`);
    appendLog(`📷 Pexels API: ${config['pexels-api-key'] ? '설정됨' : '미설정'}`);

    // 2. API 키 유효성 간단 테스트 (실제 호출은 하지 않음)
    appendLog('🧪 API 키 유효성 테스트 시작...');

    if (config['gemini-api-key']) {
      appendLog('✅ Gemini API 키가 설정되어 있습니다');
    }
    if (config['openai-api-key']) {
      appendLog('✅ OpenAI API 키가 설정되어 있습니다');
    }
    if (config['claude-api-key']) {
      appendLog('✅ Claude API 키가 설정되어 있습니다');
    }
    if (config['pexels-api-key']) {
      appendLog('✅ Pexels API 키가 설정되어 있습니다');
    }

    // 3. 풀오토 발행 테스트용 데이터 준비
    appendLog('🚀 풀오토 발행 테스트 준비 중...');

    // 테스트용 URL (실제로는 사용자가 입력한 값 사용)
    const testUrls = ['https://example.com/test-article'];
    const testTitle = 'API 테스트용 제목';
    const testKeywords = '테스트, API, 자동화';

    // 4. 풀오토 발행 시뮬레이션 (실제로는 handleFullAutoPublish 호출)
    appendLog('📝 풀오토 발행 시뮬레이션 시작...');

    // 콘텐츠 생성 단계
    appendLog('🔄 콘텐츠 생성 단계...');
    try {
      // 실제로는 generateContentFromUrl 호출
      appendLog('📡 URL에서 콘텐츠 생성 시도...');
      // await generateContentFromUrl(testUrls[0]); // 실제 호출하려면 주석 해제

      appendLog('✅ 콘텐츠 생성 완료 (시뮬레이션)');
    } catch (error) {
      appendLog(`❌ 콘텐츠 생성 실패: ${(error as Error).message}`);
    }

    // 이미지 생성 단계
    appendLog('🎨 이미지 생성 단계...');
    try {
      // 실제로는 이미지 생성 API 호출
      appendLog('🖼️ 이미지 생성 시도...');
      appendLog('✅ 이미지 생성 완료 (시뮬레이션)');
    } catch (error) {
      appendLog(`❌ 이미지 생성 실패: ${(error as Error).message}`);
    }

    // 발행 단계
    appendLog('📤 블로그 발행 단계...');
    try {
      // 실제로는 executeBlogPublishing 호출
      appendLog('📝 블로그 발행 시도...');
      appendLog('✅ 블로그 발행 완료 (시뮬레이션)');
    } catch (error) {
      appendLog(`❌ 블로그 발행 실패: ${(error as Error).message}`);
    }

    appendLog('🎉 API 키 및 풀오토 발행 테스트 완료!');

  } catch (error) {
    console.error('[Test] 테스트 실패:', error);
    appendLog(`❌ 테스트 실패: ${(error as Error).message}`);
  }
}

// 실제 풀오토 발행 테스트 (실제 API 호출)
export async function runRealFullAutoTest() {
  console.log('[RealTest] 실제 풀오토 발행 테스트 시작');

  try {
    appendLog('🔥 실제 풀오토 발행 테스트 시작...');

    // 테스트용 데이터
    const testFormData = {
      mode: 'full-auto',
      generator: 'gemini',
      targetAge: 'all',
      toneStyle: 'professional',
      imageSource: 'pollinations',
      skipImages: false,
      publishMode: 'publish',
      scheduleDate: undefined,
      title: 'API 테스트 - 자동화 시스템 확인',
      keywords: '테스트, API, 자동화, 네이버 블로그',
      urls: [] // URL 없이 키워드 기반으로 테스트
    };

    appendLog('📝 테스트용 콘텐츠 생성 시작...');

    // 실제 콘텐츠 생성 호출
    await generateContentFromKeywords(
      testFormData.title,
      testFormData.keywords
    );

    // 생성된 콘텐츠 확인 (전역 변수에서 가져옴)
    const structuredContent = (window as any).currentStructuredContent;

    if (structuredContent) {
      appendLog('✅ 콘텐츠 생성 성공!');
      appendLog(`📄 제목: ${structuredContent.selectedTitle}`);
      appendLog(`📝 본문 길이: ${structuredContent.bodyPlain?.length || 0}자`);
      appendLog(`🏷️ 해시태그: ${structuredContent.hashtags?.join(', ') || '없음'}`);

      // 실제 이미지 생성 테스트 (생략 가능)
      appendLog('🎨 이미지 생성 단계 (테스트에서는 생략)...');

      // 실제 발행 테스트 (주의: 실제로 발행됨)
      const confirmPublish = confirm('⚠️ 실제로 블로그에 발행하시겠습니까? (테스트용)');
      if (confirmPublish) {
        appendLog('📤 실제 블로그 발행 시작...');

        // 실제 발행 실행
        await executeUnifiedAutomation({
          ...testFormData,
          structuredContent
        });

        appendLog('🎉 실제 발행 테스트 완료!');
      } else {
        appendLog('ℹ️ 발행 테스트를 취소했습니다.');
      }
    } else {
      appendLog('❌ 콘텐츠 생성 실패 - 생성된 콘텐츠를 찾을 수 없습니다');
    }

  } catch (error) {
    console.error('[RealTest] 실제 테스트 실패:', error);
    appendLog(`❌ 실제 테스트 실패: ${(error as Error).message}`);
  }
}

// 전역 함수로 등록
(window as any).switchExternalLinksTab = switchExternalLinksTab;
(window as any).toggleContinuousModeModal = toggleContinuousModeModal;
(window as any).startContinuousPublishing = startContinuousPublishing;
(window as any).stopContinuousMode = stopContinuousMode;
(window as any).testApiKeysAndFullAuto = testApiKeysAndFullAuto;
(window as any).runRealFullAutoTest = runRealFullAutoTest;
(window as any).showImageModal = showImageModal; // ✅ 이미지 크게 보기
(window as any).showHeadingImagesModal = showHeadingImagesModal;
