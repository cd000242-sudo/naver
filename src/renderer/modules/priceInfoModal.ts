/**
 * ✅ [2026-02-26 모듈화] 가격 정보 모달 모듈
 * - renderer.ts에서 분리됨
 * - 이미지/비디오 가격 정보 모달 UI, 계산, 표시
 * - 의존: appendLog (자체 정의), window.api, DOM
 */

import { toastManager } from '../utils/uiManagers.js';

// renderer.ts 전역 함수/변수 참조 (런타임에 존재)
declare function initMultiAccountManager(): Promise<void>;
declare function testLicenseCode(code: string): Promise<void>;
declare const apiClient: { call: (method: string, args: any[], opts?: any) => Promise<any> };

// appendLog 유틸 (renderer.ts에서 분리)
function appendLog(message: string, logOutputId?: string): void {
  const logEl = document.getElementById(logOutputId || 'log-output');
  if (logEl) {
    logEl.innerHTML += message + '<br>';
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log('[Log]', message.replace(/<[^>]*>/g, ''));
}

export async function initPriceInfoModal(): Promise<void> {
  // ✅ 가격 정보 모달 열기/닫기 로직 추가
  const openPriceInfoBtn = document.getElementById('open-price-info-btn');
  const priceInfoModal = document.getElementById('price-info-modal');
  const closePriceModalBtn = document.getElementById('close-price-modal-btn');
  const confirmPriceBtn = document.getElementById('confirm-price-btn');

  if (openPriceInfoBtn && priceInfoModal) {
    // 열기
    openPriceInfoBtn.addEventListener('click', () => {
      priceInfoModal.style.display = 'flex';
      priceInfoModal.setAttribute('aria-hidden', 'false');
    });

    // 닫기 함수
    const closePriceModal = () => {
      priceInfoModal.style.display = 'none';
      priceInfoModal.setAttribute('aria-hidden', 'true');
    };

    if (closePriceModalBtn) closePriceModalBtn.addEventListener('click', closePriceModal);
    if (confirmPriceBtn) confirmPriceBtn.addEventListener('click', closePriceModal);

    // 배경 클릭 닫기
    priceInfoModal.addEventListener('click', (e) => {
      if (e.target === priceInfoModal) closePriceModal();
    });
  }

  // ✅ 이미지 경로 설정 버튼 이벤트
  const browseImagePathBtn = document.getElementById('browse-image-path-btn') as HTMLButtonElement;
  const resetImagePathBtn = document.getElementById('reset-image-path-btn') as HTMLButtonElement;
  const customImageSavePathInput = document.getElementById('custom-image-save-path') as HTMLInputElement;

  // 폴더 선택 버튼
  if (browseImagePathBtn) {
    browseImagePathBtn.addEventListener('click', async () => {
      try {
        if (!window.api.showOpenDialog) {
          alert('폴더 선택 기능을 사용할 수 없습니다.');
          return;
        }

        const result = await window.api.showOpenDialog({
          properties: ['openDirectory', 'createDirectory'],
          title: '이미지 저장 폴더 선택',
          buttonLabel: '선택'
        });

        if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
          const selectedPath = result.filePaths[0].replace(/\\/g, '/');
          customImageSavePathInput.value = selectedPath;
          appendLog(`📁 이미지 저장 경로 선택: ${selectedPath}`);
          toastManager.success('폴더가 선택되었습니다!');
        }
      } catch (error) {
        console.error('폴더 선택 오류:', error);
        alert(`폴더 선택 중 오류가 발생했습니다: ${(error as Error).message}`);
      }
    });
  }

  // 기본값으로 재설정 버튼
  if (resetImagePathBtn) {
    resetImagePathBtn.addEventListener('click', async () => {
      customImageSavePathInput.value = '';

      alert('이미지 저장 경로가 초기화되었습니다.\n\n환경설정에서 이미지 저장 폴더를 다시 선택해주세요.');
      appendLog('📁 이미지 저장 경로 초기화 (재설정 필요)');
    });
  }

  const geminiApiKey = document.getElementById('gemini-api-key') as HTMLInputElement;
  const unsplashApiKey = document.getElementById('unsplash-api-key') as HTMLInputElement;
  const pixabayApiKey = document.getElementById('pixabay-api-key') as HTMLInputElement;
  // (prodiaTokenInput removed - deprecated provider)
  const naverClientId = document.getElementById('naver-client-id') as HTMLInputElement; // ✅ 네이버 API
  const naverClientSecret = document.getElementById('naver-client-secret') as HTMLInputElement; // ✅ 네이버 API
  const dailyPostLimit = document.getElementById('daily-post-limit') as HTMLInputElement;
  const freeQuotaPublish = document.getElementById('free-quota-publish') as HTMLInputElement;
  const freeQuotaContent = document.getElementById('free-quota-content') as HTMLInputElement;
  const freeQuotaMedia = document.getElementById('free-quota-media') as HTMLInputElement;
  const externalApiCostConsent = document.getElementById('external-api-cost-consent') as HTMLInputElement;
  const externalApiPerRunImageLimit = document.getElementById('external-api-per-run-image-limit') as HTMLInputElement;
  const externalApiDailyImageLimit = document.getElementById('external-api-daily-image-limit') as HTMLInputElement;
  const externalApiUsageText = document.getElementById('external-api-usage-text') as HTMLParagraphElement;
  const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;

  // 설정 로드
  try {
    console.log('[Settings] 설정 로드 시작...');
    const config = await window.api.getConfig();
    console.log('[Settings] 설정 로드 성공:', Object.keys(config || {}).length, '개 항목');

    if (!config) {
      console.warn('[Settings] ⚠️ 설정이 null 또는 undefined입니다.');
      throw new Error('설정을 불러올 수 없습니다 (null/undefined)');
    }

    const isPackaged = await window.api.isPackaged();
    console.log('[Settings] 배포 모드:', isPackaged);

    // 사용자 프로필 필드
    const userDisplayName = document.getElementById('user-display-name') as HTMLInputElement;
    const userEmail = document.getElementById('user-email') as HTMLInputElement;
    const userTimezone = document.getElementById('user-timezone') as HTMLSelectElement;

    // 고급 설정 필드
    const enableDebugMode = document.getElementById('enable-debug-mode') as HTMLInputElement;
    const autoSaveDrafts = document.getElementById('auto-save-drafts') as HTMLInputElement;
    const backupFrequency = document.getElementById('backup-frequency') as HTMLSelectElement;

    // 배포용 vs 개발용 모드 처리
    if (isPackaged) {
      // 배포용: 개발자 전용 기능 숨김
      document.querySelectorAll('.dev-only').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    } else {
      // 개발용: 모든 설정 표시 (개발자 전용 기능 포함)
      document.querySelectorAll('.dev-only').forEach(el => {
        (el as HTMLElement).style.display = 'block';
      });
    }

    // 패키지 환경에서도 API 키를 로드하고 표시 (입력 가능하도록)
    if (geminiApiKey) {
      geminiApiKey.value = config.geminiApiKey || '';
      if (config.geminiApiKey) {
        console.log('[Settings] Gemini API 키 로드됨:', config.geminiApiKey.substring(0, 10) + '...');
      }
    }

    // ✅ [2026-02-23] OpenAI Image API 키는 OpenAI API 키와 통합됨 (별도 입력 필드 제거)

    // ✅ [2026-02-22] Leonardo AI API 키 로드
    const leonardoaiApiKeyInput = document.getElementById('leonardoai-api-key') as HTMLInputElement;
    if (leonardoaiApiKeyInput) {
      leonardoaiApiKeyInput.value = (config as any).leonardoaiApiKey || '';
      if ((config as any).leonardoaiApiKey) {
        console.log('[Settings] Leonardo AI API 키 로드됨:', (config as any).leonardoaiApiKey.substring(0, 10) + '...');
      }
    }



    // ✅ [2026-01-26] DeepInfra API 키 로드
    const deepinfraApiKeyInput = document.getElementById('deepinfra-api-key') as HTMLInputElement;
    if (deepinfraApiKeyInput) {
      deepinfraApiKeyInput.value = config.deepinfraApiKey || '';
      if (config.deepinfraApiKey) {
        console.log('[Settings] DeepInfra API 키 로드됨:', config.deepinfraApiKey.substring(0, 10) + '...');
      }
    }

    // ✅ [2026-02-22] OpenAI API 키 로드
    const openaiApiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
    if (openaiApiKeyInput) {
      openaiApiKeyInput.value = config.openaiApiKey || '';
      if (config.openaiApiKey) {
        console.log('[Settings] OpenAI API 키 로드됨:', config.openaiApiKey.substring(0, 10) + '...');
      }
    }

    // ✅ [2026-02-22] Claude API 키 로드
    const claudeApiKeyInput = document.getElementById('claude-api-key') as HTMLInputElement;
    if (claudeApiKeyInput) {
      claudeApiKeyInput.value = config.claudeApiKey || '';
      if (config.claudeApiKey) {
        console.log('[Settings] Claude API 키 로드됨:', config.claudeApiKey.substring(0, 10) + '...');
      }
    }

    // ✅ Gemini 모델 선택 로드
    const geminiModelSelect = document.getElementById('gemini-model-select') as HTMLSelectElement;
    if (geminiModelSelect) {
      geminiModelSelect.value = config.geminiModel || 'gemini-1.5-flash';
      console.log('[Settings] Gemini 모델 로드됨:', config.geminiModel || 'gemini-1.5-flash (기본)');
    }

    // ✅ Gemini 텍스트 주력 모델 라디오 버튼 로드
    if (config.primaryGeminiTextModel) {
      const modelRadios = document.getElementsByName('primaryGeminiTextModel') as NodeListOf<HTMLInputElement>;
      modelRadios.forEach(radio => {
        if (radio.value === config.primaryGeminiTextModel) {
          radio.checked = true;
        }
      });
      console.log('[Settings] Gemini 텍스트 주력 모델 로드됨:', config.primaryGeminiTextModel);

      // ✅ [2026-02-22 FIX] 로드 시 nav-text-engine-status UI 업데이트
      const navStatusEl = document.getElementById('nav-text-engine-status');
      if (navStatusEl) {
        const modelNames: Record<string, string> = {
          'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
          'gemini-3-pro-preview': 'Gemini 3 Pro',
          'gemini-3-flash-preview': 'Gemini 3 Flash',
          'gemini-2.5-flash': 'Gemini 2.5 Flash',
          'perplexity-sonar': '🔮 Perplexity AI',
        };
        navStatusEl.textContent = `현재: ${modelNames[config.primaryGeminiTextModel] || config.primaryGeminiTextModel}`;
      }
    }

    // ✅ Gemini 이미지 플랜 라디오 버튼 로드
    const planType = config.geminiPlanType || 'paid'; // 기본값: paid
    const planRadios = document.getElementsByName('geminiPlanType') as NodeListOf<HTMLInputElement>;
    planRadios.forEach(radio => {
      if (radio.value === planType) {
        radio.checked = true;
      }
    });
    console.log('[Settings] Gemini 이미지 플랜 로드됨:', planType);

    try {
      const unifiedGeminiModel = document.getElementById('unified-gemini-model') as HTMLSelectElement | null;
      if (unifiedGeminiModel) {
        unifiedGeminiModel.value = config.geminiModel || 'gemini-1.5-flash';
      }
    } catch (e) {
      console.warn('[priceInfoModal] catch ignored:', e);
    }

    // ✅ [2026-02-22 FIX] 앱 시작 시 defaultAiProvider → unified-generator 동기화
    // 환경설정에서 Perplexity 선택 시에도 hidden input이 gemini로 고정되던 버그 수정
    try {
      const unifiedGenerator = document.getElementById('unified-generator') as HTMLInputElement | null;
      const aiProvider = config.defaultAiProvider || 'gemini';
      if (unifiedGenerator && unifiedGenerator.value !== aiProvider) {
        unifiedGenerator.value = aiProvider;
        console.log(`[Settings] ✅ unified-generator 초기 동기화: ${aiProvider}`);
      }
    } catch (e) {
      console.warn('[priceInfoModal] catch ignored:', e);
    }
    if (unsplashApiKey) unsplashApiKey.value = config.unsplashApiKey || '';
    if (pixabayApiKey) pixabayApiKey.value = config.pixabayApiKey || '';
    // (prodiaTokenInput removed - deprecated provider)
    if (naverClientId) {
      naverClientId.value = config.naverClientId || config.naverDatalabClientId || '';
      if (config.naverClientId || config.naverDatalabClientId) {
        console.log('[Settings] 네이버 Client ID 로드됨:', (config.naverClientId || config.naverDatalabClientId).substring(0, 10) + '...');
      }
    }
    if (naverClientSecret) {
      naverClientSecret.value = config.naverClientSecret || config.naverDatalabClientSecret || '';
      if (config.naverClientSecret || config.naverDatalabClientSecret) {
        console.log('[Settings] 네이버 Client Secret 로드됨:', (config.naverClientSecret || config.naverDatalabClientSecret).substring(0, 10) + '...');
      }
    }
    // ✅ 네이버 광고 API 키 로드
    const naverAdApiKey = document.getElementById('naver-ad-api-key') as HTMLInputElement;
    const naverAdSecretKey = document.getElementById('naver-ad-secret-key') as HTMLInputElement;
    const naverAdCustomerId = document.getElementById('naver-ad-customer-id') as HTMLInputElement;
    if (naverAdApiKey) {
      naverAdApiKey.value = config.naverAdApiKey || '';
      if (config.naverAdApiKey) {
        console.log('[Settings] 네이버 광고 API Key 로드됨:', config.naverAdApiKey.substring(0, 10) + '...');
      }
    }
    if (naverAdSecretKey) {
      naverAdSecretKey.value = config.naverAdSecretKey || '';
      if (config.naverAdSecretKey) {
        console.log('[Settings] 네이버 광고 Secret Key 로드됨:', config.naverAdSecretKey.substring(0, 10) + '...');
      }
    }
    if (naverAdCustomerId) {
      naverAdCustomerId.value = config.naverAdCustomerId || '';
      if (config.naverAdCustomerId) {
        console.log('[Settings] 네이버 광고 Customer ID 로드됨:', config.naverAdCustomerId);
      }
    }
    if (dailyPostLimit) dailyPostLimit.value = String(config.dailyPostLimit || 3);
    if (freeQuotaPublish) freeQuotaPublish.value = String((config as any).freeQuotaPublish ?? 2);
    if (freeQuotaContent) freeQuotaContent.value = String((config as any).freeQuotaContent ?? 5);
    if (freeQuotaMedia) freeQuotaMedia.value = String((config as any).freeQuotaMedia ?? 30);
    if (customImageSavePathInput) customImageSavePathInput.value = config.customImageSavePath || '';

    try {
      if (externalApiCostConsent) externalApiCostConsent.checked = config.externalApiCostConsent === true;
      if (externalApiPerRunImageLimit) externalApiPerRunImageLimit.value = String((config as any).externalApiPerRunImageLimit ?? 10);
      if (externalApiDailyImageLimit) externalApiDailyImageLimit.value = String((config as any).externalApiDailyImageLimit ?? 30);

      if (externalApiUsageText) {
        const today = (() => {
          const d = new Date();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        })();
        const used = (config as any).externalApiDailyImageDate === today ? Number((config as any).externalApiDailyImageCount ?? 0) : 0;
        const dailyLimit = Number((config as any).externalApiDailyImageLimit ?? 30);
        externalApiUsageText.textContent = `오늘 사용량: ${used} / ${dailyLimit}장`;
      }
    } catch (e) {
      console.warn('[priceInfoModal] catch ignored:', e);
    }

    // ✅ [2026-01-16] 이미지 모델 고급 설정 로드
    try {
      const falaiModelSelect = document.getElementById('falai-model-select') as HTMLSelectElement;
      const stabilityModelSelect = document.getElementById('stability-model-select') as HTMLSelectElement;
      const nanoBananaMainModel = document.getElementById('nano-banana-main-model') as HTMLSelectElement;
      const nanoBananaSubModel = document.getElementById('nano-banana-sub-model') as HTMLSelectElement;
      // nanoBananaThumbnailModel 제거됨 (대표 이미지와 통합)
      const pollinationsModelSelect = document.getElementById('pollinations-model-select') as HTMLSelectElement;

      if (falaiModelSelect) falaiModelSelect.value = (config as any).falaiModel || 'flux-realism';
      if (stabilityModelSelect) stabilityModelSelect.value = (config as any).stabilityModel || 'sd35-large-turbo';
      if (nanoBananaMainModel) nanoBananaMainModel.value = (config as any).nanoBananaMainModel || 'gemini-3-1-flash';  // ✅ [2026-03-11] 기본값 나노바나나2로 통일
      if (nanoBananaSubModel) nanoBananaSubModel.value = (config as any).nanoBananaSubModel || 'gemini-3-1-flash';  // ✅ [2026-03-11] 기본값 나노바나나2로 통일
      if (pollinationsModelSelect) pollinationsModelSelect.value = (config as any).pollinationsModel || 'default';

      console.log('[Settings] 이미지 모델 고급 설정 로드됨:', {
        falaiModel: (config as any).falaiModel,
        stabilityModel: (config as any).stabilityModel,
        nanoBananaMainModel: (config as any).nanoBananaMainModel,
        nanoBananaSubModel: (config as any).nanoBananaSubModel,
        nanoBananaThumbnailModel: (config as any).nanoBananaThumbnailModel
      });

      // ✅ 비용표 토글 버튼 이벤트
      const togglePriceTableBtn = document.getElementById('toggle-price-table-btn');
      const priceTablePanel = document.getElementById('image-price-table-panel');
      if (togglePriceTableBtn && priceTablePanel) {
        togglePriceTableBtn.onclick = () => {
          const isVisible = priceTablePanel.style.display !== 'none';
          priceTablePanel.style.display = isVisible ? 'none' : 'block';
          togglePriceTableBtn.textContent = isVisible ? '💰 비용표 보기' : '💰 비용표 숨기기';
        };
      }

      const presetBudgetBtn = document.getElementById('preset-budget-btn');
      const imagePresetInput = document.getElementById('image-preset-input') as HTMLInputElement;
      if (presetBudgetBtn) {
        presetBudgetBtn.onclick = () => {
          if (falaiModelSelect) falaiModelSelect.value = 'flux-schnell';
          if (stabilityModelSelect) stabilityModelSelect.value = 'sdxl-1.0';
          if (nanoBananaMainModel) nanoBananaMainModel.value = 'gemini-3-1-flash';  // ✅ [2026-03-11] 가성비 = 나노바나나2 (₩97/장)
          if (nanoBananaSubModel) nanoBananaSubModel.value = 'gemini-3-1-flash';
          if (imagePresetInput) imagePresetInput.value = 'budget';
          console.log('[Settings] 💰 가성비 조합 프리셋 적용됨');
          toastManager.success('💰 가성비 조합이 적용되었습니다. 저장 버튼을 눌러주세요!');
        };
      }

      const presetPremiumBtn = document.getElementById('preset-premium-btn');
      if (presetPremiumBtn) {
        presetPremiumBtn.onclick = () => {
          if (falaiModelSelect) falaiModelSelect.value = 'flux-1.1-pro';
          if (stabilityModelSelect) stabilityModelSelect.value = 'stable-image-ultra';
          if (nanoBananaMainModel) nanoBananaMainModel.value = 'gemini-3-pro-4k';  // ✅ 고퀄리티 = 4K 유지
          if (nanoBananaSubModel) nanoBananaSubModel.value = 'gemini-3-1-flash';  // ✅ [2026-03-11] 서브는 나노바나나2로 변경
          if (imagePresetInput) imagePresetInput.value = 'premium';
          console.log('[Settings] 🏆 고퀄리티 조합 프리셋 적용됨');
          toastManager.success('🏆 고퀄리티 조합이 적용되었습니다. 저장 버튼을 눌러주세요!');
        };
      }
    } catch (e) {
      console.warn('[Settings] 이미지 모델 고급 설정 로드 중 오류 (무시 가능):', e);
    }

    // ✅ 로드 완료 로그
    console.log('[Settings] 모든 설정 필드 로드 완료');


    // 사용자 프로필 설정 (개발 모드에서만 표시)
    if (!isPackaged) {
      if (userDisplayName) userDisplayName.value = config.userDisplayName || '';
      if (userEmail) userEmail.value = config.userEmail || '';
      if (userTimezone) userTimezone.value = config.userTimezone || 'Asia/Seoul';

      // 고급 설정
      if (enableDebugMode) enableDebugMode.checked = config.enableDebugMode || false;
      if (autoSaveDrafts) autoSaveDrafts.checked = config.autoSaveDrafts || false;
      if (backupFrequency) backupFrequency.value = config.backupFrequency || 'never';
    }
  } catch (error) {
    console.error('[Settings] ❌ 설정 로드 실패:', error);
    console.error('[Settings] 오류 상세:', {
      message: (error as Error).message,
      stack: (error as Error).stack,
      name: (error as Error).name
    });

    // 사용자에게 알림
    const errorMessage = (error as Error).message || '알 수 없는 오류';
    alert(`⚠️ 환경설정을 불러올 수 없습니다.\n\n오류: ${errorMessage}\n\n콘솔을 확인해주세요.`);

    // 기본값으로 설정 필드 초기화
    if (geminiApiKey) geminiApiKey.value = '';
    if (dailyPostLimit) dailyPostLimit.value = '3';
    if (freeQuotaPublish) freeQuotaPublish.value = '2';
    if (freeQuotaContent) freeQuotaContent.value = '5';
    if (freeQuotaMedia) freeQuotaMedia.value = '30';
  }

  // 전역 설정 저장 핸들러 정의 (중복 등록 방지를 제거하고 덮어씀)
  (window as any).saveSettingsHandler = async function (): Promise<void> {
    try {

        const isPackaged = await window.api.isPackaged();

        // 사용자 프로필 필드
        const userDisplayName = document.getElementById('user-display-name') as HTMLInputElement;
        const userEmail = document.getElementById('user-email') as HTMLInputElement;
        const userTimezone = document.getElementById('user-timezone') as HTMLSelectElement;

        // 고급 설정 필드
        const enableDebugMode = document.getElementById('enable-debug-mode') as HTMLInputElement;
        const autoSaveDrafts = document.getElementById('auto-save-drafts') as HTMLInputElement;
        const backupFrequency = document.getElementById('backup-frequency') as HTMLSelectElement;

        // 패키지 환경에서도 모든 설정을 저장할 수 있도록 수정
        const customImageSavePathInput = document.getElementById('custom-image-save-path') as HTMLInputElement;

        // ✅ 저장 시점에 다시 요소 찾기 (스코프 문제 해결)
        const naverClientIdInput = document.getElementById('naver-client-id') as HTMLInputElement;
        const naverClientSecretInput = document.getElementById('naver-client-secret') as HTMLInputElement;
        // ✅ 네이버 광고 API 키 필드
        const naverAdApiKeyInput = document.getElementById('naver-ad-api-key') as HTMLInputElement;
        const naverAdSecretKeyInput = document.getElementById('naver-ad-secret-key') as HTMLInputElement;
        const naverAdCustomerIdInput = document.getElementById('naver-ad-customer-id') as HTMLInputElement;

        // 디버깅 로그
        console.log('[Settings] 네이버 Client ID 입력값:', naverClientIdInput?.value?.substring(0, 10) + '...');
        console.log('[Settings] 네이버 Client Secret 입력값:', naverClientSecretInput?.value ? '***' : '없음');
        console.log('[Settings] 네이버 광고 API Key 입력값:', naverAdApiKeyInput?.value?.substring(0, 10) + '...');

        // ✅ [2026-02-22] 이미지 생성 필드 (deprecated: prodia, stability, falai 제거)
        const prodiaTokenInput = undefined; // deprecated
        const stabilityApiKeyInput = undefined; // deprecated

        let config: any = {
          dailyPostLimit: parseInt(dailyPostLimit?.value || '3'),
          freeQuotaPublish: parseInt(freeQuotaPublish?.value || '2'),
          freeQuotaContent: parseInt(freeQuotaContent?.value || '5'),
          freeQuotaMedia: parseInt(freeQuotaMedia?.value || '30'),
          geminiApiKey: geminiApiKey?.value.trim() || undefined,
          unsplashApiKey: unsplashApiKey?.value.trim() || undefined,
          pixabayApiKey: pixabayApiKey?.value.trim() || undefined,
          naverClientId: naverClientIdInput?.value.trim() || undefined, // ✅ 네이버 검색 API 호환용
          naverClientSecret: naverClientSecretInput?.value.trim() || undefined, // ✅ 네이버 검색 API 호환용
          naverDatalabClientId: naverClientIdInput?.value.trim() || undefined, // ✅ 네이버 검색 API
          naverDatalabClientSecret: naverClientSecretInput?.value.trim() || undefined, // ✅ 네이버 검색 API
          naverAdApiKey: naverAdApiKeyInput?.value.trim() || undefined, // ✅ 네이버 광고 API
          naverAdSecretKey: naverAdSecretKeyInput?.value.trim() || undefined, // ✅ 네이버 광고 API
          naverAdCustomerId: naverAdCustomerIdInput?.value.trim() || undefined, // ✅ 네이버 광고 API
          // ✅ [2026-02-22] 새 이미지 프로바이더 API 키
          openaiImageApiKey: (document.getElementById('openai-api-key') as HTMLInputElement)?.value.trim() || undefined, // ✅ [2026-02-23] OpenAI API 키와 통합
          leonardoaiApiKey: (document.getElementById('leonardoai-api-key') as HTMLInputElement)?.value.trim() || undefined,

          leonardoaiModel: (document.getElementById('leonardoai-model-select') as HTMLSelectElement)?.value || 'seedream-4.5',
          deepinfraApiKey: (document.getElementById('deepinfra-api-key') as HTMLInputElement)?.value.trim() || undefined, // ✅ [2026-01-26] DeepInfra API
          customImageSavePath: customImageSavePathInput?.value.trim() || undefined,
          primaryGeminiTextModel: (document.querySelector('input[name="primaryGeminiTextModel"]:checked') as HTMLInputElement)?.value || 'gemini-2.5-flash', // ✅ Gemini 텍스트 주력 모델
          geminiPlanType: (document.querySelector('input[name="geminiPlanType"]:checked') as HTMLInputElement)?.value as 'free' | 'paid' || 'paid', // ✅ Gemini 이미지 플랜
          imagePreset: (document.getElementById('image-preset-input') as HTMLInputElement)?.value as 'budget' | 'premium' | 'custom' || 'custom',
          // ✅ [2026-02-22 FIX] primaryGeminiTextModel에서 defaultAiProvider 자동 파생
          openaiApiKey: (document.getElementById('openai-api-key') as HTMLInputElement)?.value.trim() || undefined, // ✅ [2026-02-22] OpenAI API
          claudeApiKey: (document.getElementById('claude-api-key') as HTMLInputElement)?.value.trim() || undefined, // ✅ [2026-02-22] Claude API
          defaultAiProvider: (() => { const m = (document.querySelector('input[name="primaryGeminiTextModel"]:checked') as HTMLInputElement)?.value; return m === 'perplexity-sonar' ? 'perplexity' : m === 'openai-gpt4o' ? 'openai' : m === 'claude-sonnet' ? 'claude' : 'gemini'; })(),
        };


        try {
          if (externalApiCostConsent) {
            const consent = externalApiCostConsent.checked === true;
            config.externalApiCostConsent = consent;
            if (consent) {
              config.externalApiCostConsentAt = new Date().toISOString();
            }
          }
          if (externalApiPerRunImageLimit) {
            const v = Math.max(1, Math.floor(Number(externalApiPerRunImageLimit.value || 10)));
            config.externalApiPerRunImageLimit = v;
          }
          if (externalApiDailyImageLimit) {
            const v = Math.max(1, Math.floor(Number(externalApiDailyImageLimit.value || 30)));
            config.externalApiDailyImageLimit = v;
          }
        } catch (e) {
          console.warn('[priceInfoModal] catch ignored:', e);
        }

        // 디버깅: 최종 config 확인
        console.log('[Settings] 저장할 config 네이버 키:', {
          naverDatalabClientId: config.naverDatalabClientId?.substring(0, 10) + '...',
          naverDatalabClientSecret: config.naverDatalabClientSecret ? '***' : '없음'
        });

        // 개발 모드에서만 사용자 프로필 및 고급 설정 저장
        if (!isPackaged) {
          config = {
            ...config,
            userDisplayName: userDisplayName?.value.trim() || undefined,
            userEmail: userEmail?.value.trim() || undefined,
            userTimezone: userTimezone?.value || 'Asia/Seoul',
            enableDebugMode: enableDebugMode?.checked || false,
            autoSaveDrafts: autoSaveDrafts?.checked || false,
            backupFrequency: backupFrequency?.value || 'never',
          };
        }

        const saveResult = await apiClient.call('saveConfig', [config], {
          retryCount: 2,
          timeout: 10000
        });

        if (saveResult.success) {
          // ✅ 저장 성공 로그
          console.log('[Settings] 설정 저장 완료:', Object.keys(config).length, '개 항목');

          // API 키 저장 확인 로그
          if (config.geminiApiKey) {
            appendLog(`✅ Gemini API 키 저장됨 (길이: ${config.geminiApiKey.length}자, 형식: 올바름)`);
          }

          appendLog('⚙️ 설정이 저장되었습니다.');
          toastManager.success('✅ 설정이 저장되었습니다. 앱을 껐다 켜도 유지됩니다!');

          try {
            const unifiedGeminiModel = document.getElementById('unified-gemini-model') as HTMLSelectElement | null;
            if (unifiedGeminiModel) {
              unifiedGeminiModel.value = config.geminiModel || 'gemini-2.5-flash';
            }
            // ✅ [2026-02-22 FIX] 저장 후 unified-generator 즉시 동기화
            const unifiedGeneratorEl = document.getElementById('unified-generator') as HTMLInputElement | null;
            if (unifiedGeneratorEl && config.defaultAiProvider) {
              unifiedGeneratorEl.value = config.defaultAiProvider;
              console.log(`[Settings] ✅ unified-generator 동기화: ${config.defaultAiProvider}`);
            }
            // ✅ [2026-02-22 FIX] nav-text-engine-status UI 업데이트
            const statusEl = document.getElementById('nav-text-engine-status');
            if (statusEl && config.primaryGeminiTextModel) {
              const names: Record<string, string> = {
                'gemini-3.1-pro-preview': 'Gemini 3.1 Pro',
                'gemini-3-pro-preview': 'Gemini 3 Pro',
                'gemini-3-flash-preview': 'Gemini 3 Flash',
                'gemini-2.5-flash': 'Gemini 2.5 Flash',
                'perplexity-sonar': '🔮 Perplexity AI',
              };
              statusEl.textContent = `현재: ${names[config.primaryGeminiTextModel] || config.primaryGeminiTextModel}`;
            }
          } catch (e) {
            console.warn('[priceInfoModal] catch ignored:', e);
          }
        } else {
          toastManager.error(`❌ 설정 저장 실패: ${saveResult.error}`);
          return;
        }
        const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
        if (settingsModal) {
          settingsModal.setAttribute('aria-hidden', 'true');
          settingsModal.style.display = 'none';
        }
      } catch (error) {
        alert(`❌ 설정 저장 실패: ${(error as Error).message}`);
      }
  };

  // ✅ [2026-01-27] API 키 섹션 저장 버튼 - 기존 저장 로직 트리거
  const apiKeysSaveBtn = document.getElementById('api-keys-save-btn');
  if (apiKeysSaveBtn) {
    apiKeysSaveBtn.addEventListener('click', () => {
      console.log('[Settings] API 키 저장 버튼 클릭 - 전역 저장 로직 트리거');
      if (typeof (window as any).saveSettingsHandler === 'function') (window as any).saveSettingsHandler();
    });
  }

  // ✅ [2026-01-27] AI 텍스트 엔진 저장 버튼
  const textEngineSaveBtn = document.getElementById('text-engine-save-btn');
  if (textEngineSaveBtn) {
    textEngineSaveBtn.addEventListener('click', () => {
      console.log('[Settings] AI 텍스트 엔진 저장 버튼 클릭 - 전역 저장 로직 트리거');
      if (typeof (window as any).saveSettingsHandler === 'function') (window as any).saveSettingsHandler();
    });
  }

  // ✅ [2026-01-27] 이미지 모델 저장 버튼
  const imageModelSaveBtn = document.getElementById('image-model-save-btn');
  if (imageModelSaveBtn) {
    imageModelSaveBtn.addEventListener('click', () => {
      console.log('[Settings] 이미지 모델 저장 버튼 클릭 - 전역 저장 로직 트리거');
      if (typeof (window as any).saveSettingsHandler === 'function') (window as any).saveSettingsHandler();
    });
  }

  // ✅ [2026-01-27] 이미지 경로 저장 버튼
  const imagePathSaveBtn = document.getElementById('image-path-save-btn');
  if (imagePathSaveBtn) {
    imagePathSaveBtn.addEventListener('click', () => {
      console.log('[Settings] 이미지 경로 저장 버튼 클릭 - 전역 저장 로직 트리거');
      if (typeof (window as any).saveSettingsHandler === 'function') (window as any).saveSettingsHandler();
    });
  }

  // ✅ 다계정 관리 기능 초기화
  await initMultiAccountManager();

  // ✅ 환경설정에서 다계정 관리 버튼 클릭
  const openMultiAccountFromSettings = document.getElementById('open-multi-account-from-settings');
  if (openMultiAccountFromSettings) {
    openMultiAccountFromSettings.addEventListener('click', () => {
      // 환경설정 모달 닫기
      const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
      if (settingsModal) {
        settingsModal.style.display = 'none';
      }
      // 다계정 관리 모달 열기
      const multiAccountBtn = document.getElementById('multi-account-btn');
      multiAccountBtn?.click();
    });
  }

  // ✅ 환경설정에서 가이드/분석 버튼 클릭
  const openGuideFromSettings = document.getElementById('open-guide-from-settings');
  if (openGuideFromSettings) {
    openGuideFromSettings.addEventListener('click', () => {
      // 환경설정 모달 닫기
      const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
      if (settingsModal) {
        settingsModal.style.display = 'none';
      }
      // 가이드/분석 모달 열기
      const toolsHubModal = document.getElementById('tools-hub-modal');
      if (toolsHubModal) {
        toolsHubModal.style.display = 'flex';
      }
    });
  }

  // 라이선스 코드 테스트
  const testLicenseCodeBtn = document.getElementById('test-license-code-btn') as HTMLButtonElement;
  const testLicenseCodeInput = document.getElementById('test-license-code') as HTMLInputElement;
  if (testLicenseCodeBtn && testLicenseCodeInput) {
    testLicenseCodeBtn.addEventListener('click', async () => {
      const code = testLicenseCodeInput.value.trim();
      if (!code) {
        alert('테스트할 라이선스 코드를 입력해주세요.');
        return;
      }
      await testLicenseCode(code);
    });
  }

  // 외부 유입 라이선스 등록
  const registerExternalInflowBtn = document.getElementById('register-external-inflow-btn') as HTMLButtonElement;
  if (registerExternalInflowBtn) {
    registerExternalInflowBtn.addEventListener('click', async () => {
      if (confirm('외부 유입 90일 라이선스를 등록하시겠습니까?\n\n등록 후 90일 동안 외부 유입 기능을 사용할 수 있습니다.')) {
        try {
          registerExternalInflowBtn.disabled = true;
          registerExternalInflowBtn.textContent = '등록 중...';

          const result = await window.api.registerExternalInflowLicense();

          if (result.success) {
            // 만료일 정확한 표시
            const expiresAt = result.expiresAt ? new Date(result.expiresAt) : null;
            const formattedDate = expiresAt ?
              `${expiresAt.getFullYear()}년 ${expiresAt.getMonth() + 1}월 ${expiresAt.getDate()}일` :
              '알 수 없음';

            alert(`✅ ${result.message}\n\n만료일: ${formattedDate}`);
            toastManager.success('외부 유입 라이선스가 등록되었습니다!');
          } else {
            alert(`❌ ${result.message}`);
          }
        } catch (error) {
          console.error('외부 유입 라이선스 등록 오류:', error);
          alert(`❌ 라이선스 등록 중 오류가 발생했습니다: ${(error as Error).message}`);
        } finally {
          registerExternalInflowBtn.disabled = false;
          registerExternalInflowBtn.textContent = '🎯 외부 유입 90일 라이선스 등록';
        }
      }
    });
  }

  // ✅ 네트워크 진단 버튼 이벤트 리스너
  const networkDiagnosticsBtn = document.getElementById('network-diagnostics-btn') as HTMLButtonElement;
  if (networkDiagnosticsBtn && !networkDiagnosticsBtn.hasAttribute('data-listener-added')) {
    networkDiagnosticsBtn.setAttribute('data-listener-added', 'true');
    networkDiagnosticsBtn.addEventListener('click', async () => {
      networkDiagnosticsBtn.disabled = true;
      networkDiagnosticsBtn.textContent = '🔄 진단 중...';

      let diagnosticResults: string[] = [];
      diagnosticResults.push('===== 네트워크 진단 결과 =====\n');

      try {
        // 1. 라이선스 서버 연결 테스트
        diagnosticResults.push('📡 라이선스 서버 연결 테스트...');
        try {
          const licenseResult = await window.api.testLicenseServer();
          if (licenseResult.success) {
            diagnosticResults.push(`✅ 라이선스 서버: 연결 성공`);
          } else {
            diagnosticResults.push(`❌ 라이선스 서버: ${licenseResult.message}`);
          }
        } catch (e) {
          diagnosticResults.push(`❌ 라이선스 서버: 연결 실패 - ${(e as Error).message}`);
        }

        // 2. OpenAI API 연결 테스트
        diagnosticResults.push('\n📡 OpenAI API 연결 테스트...');
        try {
          const openaiResponse = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer test' },
            signal: AbortSignal.timeout(10000)
          });
          diagnosticResults.push(`✅ OpenAI API: 도달 가능 (상태: ${openaiResponse.status})`);
        } catch (e) {
          const errMsg = (e as Error).message;
          if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
            diagnosticResults.push(`⚠️ OpenAI API: 응답 지연 (10초 초과)`);
          } else {
            diagnosticResults.push(`❌ OpenAI API: ${errMsg}`);
          }
        }

        // 3. Google/Gemini API 연결 테스트
        diagnosticResults.push('\n📡 Google API (Gemini) 연결 테스트...');
        try {
          const googleResponse = await fetch('https://generativelanguage.googleapis.com/', {
            method: 'GET',
            signal: AbortSignal.timeout(10000)
          });
          diagnosticResults.push(`✅ Google API: 도달 가능 (상태: ${googleResponse.status})`);
        } catch (e) {
          const errMsg = (e as Error).message;
          if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
            diagnosticResults.push(`⚠️ Google API: 응답 지연 (10초 초과)`);
          } else {
            diagnosticResults.push(`❌ Google API: ${errMsg}`);
          }
        }

        // 4. Anthropic (Claude) API 연결 테스트
        diagnosticResults.push('\n📡 Anthropic (Claude) API 연결 테스트...');
        try {
          const anthropicResponse = await fetch('https://api.anthropic.com/', {
            method: 'GET',
            signal: AbortSignal.timeout(10000)
          });
          diagnosticResults.push(`✅ Anthropic API: 도달 가능 (상태: ${anthropicResponse.status})`);
        } catch (e) {
          const errMsg = (e as Error).message;
          if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
            diagnosticResults.push(`⚠️ Anthropic API: 응답 지연 (10초 초과)`);
          } else {
            diagnosticResults.push(`❌ Anthropic API: ${errMsg}`);
          }
        }

        // 5. 네이버 API 연결 테스트
        diagnosticResults.push('\n📡 네이버 API 연결 테스트...');
        try {
          const naverResponse = await fetch('https://openapi.naver.com/', {
            method: 'GET',
            signal: AbortSignal.timeout(10000)
          });
          diagnosticResults.push(`✅ 네이버 API: 도달 가능 (상태: ${naverResponse.status})`);
        } catch (e) {
          const errMsg = (e as Error).message;
          if (errMsg.includes('timeout') || errMsg.includes('Timeout')) {
            diagnosticResults.push(`⚠️ 네이버 API: 응답 지연 (10초 초과)`);
          } else {
            diagnosticResults.push(`❌ 네이버 API: ${errMsg}`);
          }
        }

        // 6. API 키 설정 상태 확인
        diagnosticResults.push('\n🔑 API 키 설정 상태...');
        try {
          const config = await window.api.getConfig();
          const geminiKey = config.geminiApiKey?.trim();
          const openaiKey = config.openaiApiKey?.trim();
          const claudeKey = config.claudeApiKey?.trim();

          if (geminiKey && geminiKey.length > 10) {
            diagnosticResults.push(`✅ Gemini API 키: 설정됨 (${geminiKey.length}자)`);
          } else {
            diagnosticResults.push(`❌ Gemini API 키: 미설정 ← 반드시 설정 필요!`);
          }

          if (openaiKey && openaiKey.length > 10) {
            diagnosticResults.push(`✅ OpenAI API 키: 설정됨 (${openaiKey.length}자)`);
          } else {
            diagnosticResults.push(`⚠️ OpenAI API 키: 미설정`);
          }

          if (claudeKey && claudeKey.length > 10) {
            diagnosticResults.push(`✅ Claude API 키: 설정됨 (${claudeKey.length}자)`);
          } else {
            diagnosticResults.push(`⚠️ Claude API 키: 미설정`);
          }
        } catch (e) {
          diagnosticResults.push(`❌ 설정 로드 실패: ${(e as Error).message}`);
        }

        // 문제 자동 진단 및 해결책 제시
        diagnosticResults.push('\n===== 📋 진단 결과 및 해결 방법 =====\n');

        const hasApiKeyIssue = diagnosticResults.some(r => r.includes('Gemini API 키: 미설정'));
        const hasNetworkIssue = diagnosticResults.some(r => r.includes('❌') && !r.includes('API 키'));
        const hasSlowNetwork = diagnosticResults.some(r => r.includes('응답 지연'));

        if (hasApiKeyIssue) {
          diagnosticResults.push('🚨 문제: Gemini API 키가 설정되지 않았습니다!');
          diagnosticResults.push('');
          diagnosticResults.push('📌 해결 방법:');
          diagnosticResults.push('1. Google AI Studio 접속: https://aistudio.google.com');
          diagnosticResults.push('2. "Get API Key" 클릭 → API 키 생성');
          diagnosticResults.push('3. 환경설정(⚙️) → Gemini API 키에 붙여넣기');
          diagnosticResults.push('4. 저장 버튼 클릭');
          diagnosticResults.push('5. 앱 재시작 또는 다시 시도');
        } else if (hasNetworkIssue) {
          diagnosticResults.push('🚨 문제: 네트워크 연결에 문제가 있습니다!');
          diagnosticResults.push('');
          diagnosticResults.push('📌 해결 방법:');
          diagnosticResults.push('1. 인터넷 연결 확인');
          diagnosticResults.push('2. VPN 사용 중이면 끄기');
          diagnosticResults.push('3. 방화벽에서 앱 허용');
          diagnosticResults.push('4. 회사/학교 네트워크면 다른 네트워크 사용');
        } else if (hasSlowNetwork) {
          diagnosticResults.push('⚠️ 주의: 네트워크가 느립니다!');
          diagnosticResults.push('');
          diagnosticResults.push('📌 해결 방법:');
          diagnosticResults.push('1. WiFi 신호 확인 (라우터 가까이)');
          diagnosticResults.push('2. 다른 프로그램의 인터넷 사용 줄이기');
          diagnosticResults.push('3. 유선 연결 권장');
          diagnosticResults.push('4. 잠시 후 다시 시도');
        } else {
          diagnosticResults.push('✅ 모든 연결이 정상입니다!');
          diagnosticResults.push('');
          diagnosticResults.push('💡 그래도 안 되면:');
          diagnosticResults.push('1. 앱 완전히 종료 후 재시작');
          diagnosticResults.push('2. 환경설정에서 API 키 다시 저장');
          diagnosticResults.push('3. 컴퓨터 재부팅');
        }

        alert(diagnosticResults.join('\n'));
        appendLog('🔍 네트워크 진단 완료 - 결과를 확인해주세요');

      } catch (error) {
        alert(`네트워크 진단 중 오류가 발생했습니다:\n${(error as Error).message}`);
      } finally {
        networkDiagnosticsBtn.disabled = false;
        networkDiagnosticsBtn.textContent = '🔍 네트워크 진단 실행';
      }
    });
  }

  // ✅ 원클릭 네트워크 최적화 버튼 이벤트 리스너
  const networkOptimizeBtn = document.getElementById('network-optimize-btn') as HTMLButtonElement;
  if (networkOptimizeBtn && !networkOptimizeBtn.hasAttribute('data-listener-added')) {
    networkOptimizeBtn.setAttribute('data-listener-added', 'true');
    networkOptimizeBtn.addEventListener('click', async () => {
      // 경고 메시지 표시
      const confirmed = confirm(
        '⚡ 원클릭 네트워크 최적화\n\n' +
        '다음 작업을 수행합니다:\n' +
        '• DNS 캐시 갱신 (관리자 권한 필요)\n' +
        '• API 서버 연결 테스트\n' +
        '• 최적 연결 상태 확인\n\n' +
        '계속하시겠습니까?'
      );

      if (!confirmed) return;

      networkOptimizeBtn.disabled = true;
      networkOptimizeBtn.textContent = '⚡ 최적화 중...';
      appendLog('🔄 네트워크 최적화 시작...');

      try {
        const result = await window.api.networkOptimize();

        // 결과 표시
        alert(result.results.join('\n'));

        if (result.success) {
          appendLog('✅ 네트워크 최적화 완료!');
          toastManager.success('네트워크 최적화가 완료되었습니다!');
        } else {
          appendLog('⚠️ 네트워크 최적화 완료 (일부 문제 발견)');
          toastManager.warning('네트워크에 일부 문제가 있습니다. 결과를 확인하세요.');
        }

      } catch (error) {
        alert(`네트워크 최적화 중 오류가 발생했습니다:\n${(error as Error).message}`);
        appendLog(`❌ 네트워크 최적화 실패: ${(error as Error).message}`);
      } finally {
        networkOptimizeBtn.disabled = false;
        networkOptimizeBtn.textContent = '⚡ 원클릭 네트워크 최적화';
      }
    });
  }
}
