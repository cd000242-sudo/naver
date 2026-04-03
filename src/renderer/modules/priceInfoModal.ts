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

// appendLog는 rendererUtils.ts에서 전역 스코프로 제공됨
declare function appendLog(message: string, logOutputId?: string): void;

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
      // ✅ [2026-03-19] 모달 열릴 때 통합 대시보드 자동 갱신
      refreshApiCostDashboard();
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

  // ✅ [2026-03-19] 통합 API 비용 대시보드 초기화
  initApiCostDashboard();


  // ✅ [2026-03-18] Gemini API 할당량 확인 버튼 이벤트 (정확한 공식 데이터 기반)
  const geminiQuotaCheckBtn = document.getElementById('gemini-quota-check-btn');
  const geminiQuotaResult = document.getElementById('gemini-quota-result');
  if (geminiQuotaCheckBtn && geminiQuotaResult) {
    geminiQuotaCheckBtn.addEventListener('click', async () => {
      const apiKeyInput = document.getElementById('gemini-api-key') as HTMLInputElement;
      const apiKey = apiKeyInput?.value?.trim();

      if (!apiKey) {
        geminiQuotaResult.style.display = 'block';
        geminiQuotaResult.innerHTML = '⚠️ <b>API 키를 먼저 입력해주세요.</b>';
        return;
      }

      geminiQuotaResult.style.display = 'block';
      geminiQuotaResult.innerHTML = '⏳ <b>할당량 확인 중...</b>';
      (geminiQuotaCheckBtn as HTMLButtonElement).disabled = true;

      try {
        const result = await window.api.checkGeminiQuota(apiKey);

        if (!result.success) {
          const msg = (result.message || '확인 실패').replace(/\\n/g, '<br>');
          geminiQuotaResult.innerHTML = `❌ <b>${msg}</b>`;
          return;
        }

        const d = result.data;
        if (!d) { geminiQuotaResult.innerHTML = `❌ <b>데이터 없음</b>`; return; }

        // ✅ [2026-03-19] 100점 UX 개선 — 중복 제거, 단일 라인, AI Studio 링크
        const tracker = d.usageTracker || { totalInputTokens: 0, totalOutputTokens: 0, totalCalls: 0, estimatedCostUSD: 0 };
        const budget = d.creditBudget || 300;
        const usedCost = tracker.estimatedCostUSD || 0;
        const isFree = d.userPlanType === 'free';
        const pct = isFree ? 0 : Math.min(100, (usedCost / budget) * 100);
        const barColor = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e';

        // 토큰 포맷 헬퍼 (1,234,567 → 1.2M | 45,678 → 45.7K)
        const fmtTokens = (n: number) => n >= 1_000_000 ? (n/1_000_000).toFixed(1)+'M' : n >= 1_000 ? (n/1_000).toFixed(1)+'K' : String(n);

        // ✅ [2026-03-19] 다크 배경 강제 적용으로 텍스트 가독성 보장
        let html = `<div style="background:rgba(15,17,25,0.95);border-radius:12px;padding:16px;color:#e2e8f0;">`;
        html += `<div style="text-align:center;margin-bottom:12px;">`;

        if (isFree) {
          // 무료 플랜: 비용 없음 표시
          html += `<div style="font-size:1.5rem;font-weight:700;color:#22c55e;">🆓 무료 플랜</div>`;
          html += `<div style="font-size:0.75rem;color:#94a3b8;">비용이 발생하지 않습니다 (분당 15회 제한)</div>`;
        } else {
          // 유료 플랜: "$X / $Y 예산" 단일 라인 (중복 제거)
          html += `<div style="font-size:2rem;font-weight:800;color:${barColor};letter-spacing:-1px;">`;
          html += `$${usedCost.toFixed(2)} <span style="color:#94a3b8;font-weight:400;">/ $${budget} 예산</span></div>`;
          html += `<div style="font-size:0.72rem;color:#94a3b8;">${pct.toFixed(1)}% 사용</div>`;
        }
        html += `</div>`;

        // 진행률 바 (유료만)
        if (!isFree) {
          html += `<div style="background:rgba(255,255,255,0.1);border-radius:6px;height:8px;margin-bottom:10px;overflow:hidden;">`;
          html += `<div style="background:${barColor};height:100%;width:${pct.toFixed(1)}%;border-radius:6px;transition:width 0.5s;"></div></div>`;
        }

        // 상세 정보 (토큰은 K/M 단위로 가독성 향상)
        html += `<div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px;font-size:0.78rem;margin-bottom:10px;color:#cbd5e1;">`;
        html += `📊 API 호출 <b>${tracker.totalCalls.toLocaleString()}회</b> | 입력 <b>${fmtTokens(tracker.totalInputTokens)}</b> | 출력 <b>${fmtTokens(tracker.totalOutputTokens)}</b> 토큰`;
        if (tracker.firstTracked) {
          html += `<br>🕐 ${new Date(tracker.firstTracked).toLocaleDateString('ko-KR')} ~ ${tracker.lastUpdated ? new Date(tracker.lastUpdated).toLocaleDateString('ko-KR') : '현재'} 추적 중`;
        }
        html += `</div>`;

        // API 키 상태 + 모델 정보
        html += `<div style="font-size:0.78rem;color:#94a3b8;margin-bottom:10px;">`;
        html += `✅ API 키 유효 | ${d.planLabel} | 모델 ${d.totalModels}개`;
        if (d.testCallResult?.error) html += `<br>⚠️ ${d.testCallResult.error}`;
        html += `</div>`;

        // 예산 설정 + 초기화 (유료만)
        if (!isFree) {
          html += `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">`;
          html += `<label style="font-size:0.75rem;color:#94a3b8;">예산($):</label>`;
          html += `<input type="number" id="gemini-budget-input" value="${budget}" min="1" max="99999" step="10" style="width:80px;padding:3px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#e2e8f0;font-size:0.8rem;">`;
          html += `<button id="gemini-budget-save-btn" style="padding:3px 10px;border-radius:4px;border:1px solid rgba(59,130,246,0.4);background:rgba(59,130,246,0.15);color:#93c5fd;font-size:0.75rem;cursor:pointer;">저장</button>`;
          html += `<button id="gemini-usage-reset-btn" style="padding:3px 10px;border-radius:4px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);color:#fca5a5;font-size:0.75rem;cursor:pointer;">🔄 초기화</button>`;
          html += `</div>`;
        }

        // 안내 문구 (추정치 이유 설명 + AI Studio 링크)
        html += `<div style="font-size:0.7rem;color:#64748b;line-height:1.5;">`;
        html += `⚠️ 앱에서 추적 가능한 호출만 집계된 <b>추정치</b>입니다.<br>`;
        html += `정확한 청구 금액은 <a href="#" id="aistudio-billing-link" style="color:#93c5fd;text-decoration:underline;">Google AI Studio</a>에서 확인하세요.`;
        html += `</div>`;
        html += `</div>`; // 다크 배경 래퍼 닫기

        geminiQuotaResult.innerHTML = html;

        // 이벤트 바인딩 (예산 저장 / 초기화 / 링크)
        document.getElementById('gemini-budget-save-btn')?.addEventListener('click', async () => {
          const v = Math.max(1, Number((document.getElementById('gemini-budget-input') as HTMLInputElement)?.value) || 300);
          try { await (window.api as any).setGeminiCreditBudget(v); toastManager.success(`💰 예산 $${v} 설정!`); } catch { toastManager.error('예산 설정 실패'); }
        });
        document.getElementById('gemini-usage-reset-btn')?.addEventListener('click', async () => {
          if (!confirm('사용량 추적을 초기화하시겠습니까?')) return;
          try { await (window.api as any).resetGeminiUsageTracker(); toastManager.success('🔄 초기화 완료!'); geminiQuotaCheckBtn.click(); } catch { toastManager.error('초기화 실패'); }
        });
        document.getElementById('aistudio-billing-link')?.addEventListener('click', (e) => { e.preventDefault(); window.api.openExternalUrl('https://aistudio.google.com/apikey'); });

      } catch (err: any) {
        geminiQuotaResult.innerHTML = `❌ <b>오류:</b> ${err?.message || '알 수 없는 오류'}`;
      } finally {
        (geminiQuotaCheckBtn as HTMLButtonElement).disabled = false;
      }
    });
  }

  // ✅ [2026-03-18] API 키 표시/숨김 (👁 눈 아이콘) 토글 - 범용 헬퍼
  function setupApiKeyToggle(inputId: string, toggleId: string): void {
    const input = document.getElementById(inputId) as HTMLInputElement;
    const toggle = document.getElementById(toggleId) as HTMLButtonElement;
    if (input && toggle) {
      toggle.addEventListener('click', () => {
        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        toggle.textContent = isPassword ? '🙈' : '👁';
        toggle.title = isPassword ? 'API 키 숨기기' : 'API 키 표시/숨기기';
      });
    }
  }
  setupApiKeyToggle('gemini-api-key', 'gemini-api-key-toggle');
  setupApiKeyToggle('leonardoai-api-key', 'leonardoai-api-key-toggle');
  setupApiKeyToggle('perplexity-api-key', 'perplexity-api-key-toggle');
  setupApiKeyToggle('openai-api-key', 'openai-api-key-toggle');
  setupApiKeyToggle('claude-api-key', 'claude-api-key-toggle');
  setupApiKeyToggle('deepinfra-api-key', 'deepinfra-api-key-toggle');

  // ✅ [2026-03-18] 범용 API 키 유효성 검증 헬퍼
  function setupApiKeyValidation(
    provider: string,
    inputId: string,
    btnId: string,
    resultId: string,
    displayName: string
  ): void {
    const btn = document.getElementById(btnId) as HTMLButtonElement;
    const resultEl = document.getElementById(resultId);
    if (!btn || !resultEl) return;

    btn.addEventListener('click', async () => {
      const input = document.getElementById(inputId) as HTMLInputElement;
      const apiKey = input?.value?.trim();

      if (!apiKey) {
        resultEl.style.display = 'block';
        resultEl.innerHTML = `⚠️ <b>${displayName} API 키를 먼저 입력해주세요.</b>`;
        return;
      }

      resultEl.style.display = 'block';
      resultEl.innerHTML = `⏳ <b>${displayName} API 키 확인 중...</b>`;
      btn.disabled = true;

      try {
        const result = await window.api.validateApiKey(provider, apiKey);

        if (result.success) {
          let html = `✅ <b>${displayName} API 키 유효!</b><br>`;
          if (result.details) html += `📋 ${result.details}`;

          // ✅ [2026-03-19] 잔액/사용량 카드 렌더링
          if (result.balance) {
            const b = result.balance;
            const hasRemaining = b.remaining && b.remaining !== '';
            const hasTotal = b.total && b.total !== '';
            const hasTokens = (b.totalInputTokens || 0) > 0 || (b.totalOutputTokens || 0) > 0;
            const hasImages = (b.totalImages || 0) > 0;

            // 추적 기간 계산
            let periodText = '';
            if (b.firstTracked) {
              const first = new Date(b.firstTracked);
              const now = new Date();
              const days = Math.max(1, Math.ceil((now.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)));
              periodText = `${days}일간`;
            }

            html += `<div style="margin-top:10px;padding:12px 14px;background:rgba(15,23,42,0.85);border-radius:10px;border:1px solid rgba(99,102,241,0.25);color:#e2e8f0;font-size:12.5px;line-height:1.7;">`;

            // 잔액/충전금액 (있으면 강조 표시)
            if (hasRemaining) {
              html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">`;
              html += `<span style="color:#94a3b8;">💰 잔액</span>`;
              html += `<span style="color:#22d3ee;font-weight:700;font-size:15px;">${b.remaining}</span>`;
              html += `</div>`;
            }
            if (hasTotal) {
              html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">`;
              html += `<span style="color:#94a3b8;">💳 충전</span>`;
              html += `<span style="color:#a78bfa;font-weight:600;">${b.total}</span>`;
              html += `</div>`;
            }
            if (hasRemaining || hasTotal) {
              html += `<hr style="border:none;border-top:1px solid rgba(99,102,241,0.15);margin:6px 0;">`;
            }

            // 앱 내 누적 사용량
            html += `<div style="color:#94a3b8;font-size:11px;margin-bottom:4px;">📊 앱 내 누적 사용량 ${periodText ? `(${periodText})` : ''}</div>`;
            html += `<div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">비용</span><span style="color:#fbbf24;font-weight:600;">${b.usedCost}</span></div>`;
            html += `<div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">호출</span><span>${b.totalCalls.toLocaleString()}회</span></div>`;
            if (hasTokens) {
              html += `<div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">토큰</span><span>${(b.totalInputTokens + b.totalOutputTokens).toLocaleString()}</span></div>`;
            }
            if (hasImages) {
              html += `<div style="display:flex;justify-content:space-between;"><span style="color:#cbd5e1;">이미지</span><span>${b.totalImages.toLocaleString()}장</span></div>`;
            }

            // 대시보드 링크 + 잔액 미표시 시 안내
            if (b.dashboardUrl) {
              if (!hasRemaining) {
                // 잔액 조회 불가 시 — 눈에 띄는 버튼 스타일 링크
                html += `<div style="margin-top:10px;text-align:center;">`;
                html += `<div style="font-size:10.5px;color:#64748b;margin-bottom:6px;">⚠️ 이 제공자는 API로 잔액 조회를 지원하지 않습니다</div>`;
                html += `<a href="#" onclick="window.api?.openExternalUrl?.('${b.dashboardUrl}');return false;" style="display:inline-block;padding:6px 16px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:6px;color:#a5b4fc;text-decoration:none;font-size:12px;font-weight:600;transition:all 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.25)'" onmouseout="this.style.background='rgba(99,102,241,0.15)'" >🔗 대시보드에서 잔액 확인</a>`;
                html += `</div>`;
              } else {
                html += `<div style="margin-top:8px;text-align:center;">`;
                html += `<a href="#" onclick="window.api?.openExternalUrl?.('${b.dashboardUrl}');return false;" style="color:#818cf8;text-decoration:none;font-size:11.5px;">🔗 대시보드에서 상세 확인 →</a>`;
                html += `</div>`;
              }
            }

            html += `</div>`;
          }

          resultEl.innerHTML = html;
          resultEl.style.borderColor = 'rgba(34, 197, 94, 0.4)';
          resultEl.style.background = 'rgba(34, 197, 94, 0.08)';
        } else {
          resultEl.innerHTML = `❌ <b>${result.message || '유효하지 않은 API 키입니다.'}</b>`;
          resultEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
          resultEl.style.background = 'rgba(239, 68, 68, 0.08)';
        }
      } catch (err: any) {
        resultEl.innerHTML = `❌ <b>오류:</b> ${err?.message || '알 수 없는 오류'}`;
        resultEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        resultEl.style.background = 'rgba(239, 68, 68, 0.08)';
      } finally {
        btn.disabled = false;
      }
    });
  }

  setupApiKeyValidation('leonardoai', 'leonardoai-api-key', 'leonardoai-validate-btn', 'leonardoai-validate-result', 'Leonardo AI');
  setupApiKeyValidation('perplexity', 'perplexity-api-key', 'perplexity-validate-btn', 'perplexity-validate-result', 'Perplexity');
  setupApiKeyValidation('openai', 'openai-api-key', 'openai-validate-btn', 'openai-validate-result', 'OpenAI');
  setupApiKeyValidation('claude', 'claude-api-key', 'claude-validate-btn', 'claude-validate-result', 'Claude');
  setupApiKeyValidation('deepinfra', 'deepinfra-api-key', 'deepinfra-validate-btn', 'deepinfra-validate-result', 'DeepInfra');

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

    // ✅ [2026-03-30] Perplexity API 키 로드 (누락 수정)
    const perplexityApiKeyInput = document.getElementById('perplexity-api-key') as HTMLInputElement;
    if (perplexityApiKeyInput) {
      perplexityApiKeyInput.value = config.perplexityApiKey || '';
      if (config.perplexityApiKey) {
        console.log('[Settings] Perplexity API 키 로드됨:', config.perplexityApiKey.substring(0, 10) + '...');
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
          'openai-gpt41': '⚖️ GPT-4.1',
          'claude-sonnet': '📜 Claude Sonnet 4.6',
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
          perplexityApiKey: (document.getElementById('perplexity-api-key') as HTMLInputElement)?.value.trim() || undefined, // ✅ [2026-03-30] Perplexity API 키 저장 누락 수정
          defaultAiProvider: (() => { const m = (document.querySelector('input[name="primaryGeminiTextModel"]:checked') as HTMLInputElement)?.value; return m === 'perplexity-sonar' ? 'perplexity' : (m === 'openai-gpt4o' || m === 'openai-gpt4o-mini' || m === 'openai-gpt41') ? 'openai' : (m === 'claude-haiku' || m === 'claude-sonnet' || m === 'claude-opus') ? 'claude' : 'gemini'; })(),
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
                'openai-gpt41': '⚖️ GPT-4.1',
                'claude-sonnet': '📜 Claude Sonnet 4.6',
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

// ==================== ✅ [2026-03-19] 통합 API 비용 대시보드 ====================

const PROVIDER_META: Record<string, { label: string; icon: string; color: string; type: 'text' | 'image' }> = {
  gemini:        { label: 'Gemini',        icon: '💎', color: '#4285f4', type: 'text' },
  openai:        { label: 'OpenAI (텍스트)', icon: '🤖', color: '#10a37f', type: 'text' },
  'openai-image': { label: 'OpenAI (이미지)', icon: '🎨', color: '#10a37f', type: 'image' },
  claude:        { label: 'Claude',        icon: '🧠', color: '#d97706', type: 'text' },
  perplexity:    { label: 'Perplexity',    icon: '🔮', color: '#7c3aed', type: 'text' },
  deepinfra:     { label: 'DeepInfra',     icon: '⚡', color: '#ef4444', type: 'image' },
  leonardoai:    { label: 'Leonardo AI',   icon: '🖌️', color: '#ec4899', type: 'image' },
};

const DASHBOARD_CONTAINER_ID = 'api-cost-dashboard-container';

function initApiCostDashboard(): void {
  // 대시보드 삽입 위치: gemini-quota-result 아래
  const anchor = document.getElementById('gemini-quota-result');
  if (!anchor || document.getElementById(DASHBOARD_CONTAINER_ID)) return;

  const container = document.createElement('div');
  container.id = DASHBOARD_CONTAINER_ID;
  container.style.cssText = 'margin-top:16px; display:none;'; // 데이터 로드 전 숨김
  anchor.parentElement?.insertBefore(container, anchor.nextSibling);
}

async function refreshApiCostDashboard(): Promise<void> {
  const container = document.getElementById(DASHBOARD_CONTAINER_ID);
  if (!container) return;

  container.style.display = 'block';
  container.innerHTML = '<div style="text-align:center;padding:12px;color:#94a3b8;font-size:0.82rem;background:rgba(15,17,25,0.95);border-radius:12px;">⏳ 통합 API 사용량 로딩 중...</div>';

  try {
    const result = await (window.api as any).getAllApiUsageSnapshots();
    if (!result.success || !result.data) {
      container.innerHTML = `<div style="text-align:center;padding:12px;color:#fca5a5;font-size:0.82rem;">❌ 사용량 조회 실패: ${result.message || '알 수 없는 오류'}</div>`;
      return;
    }

    const data: Record<string, any> = result.data;

    // 총 비용 계산
    let totalCost = 0;
    let totalCalls = 0;
    const activeProviders: Array<{ key: string; meta: typeof PROVIDER_META[string]; usage: any }> = [];

    for (const [key, meta] of Object.entries(PROVIDER_META)) {
      const usage = data[key];
      if (!usage) continue;
      totalCost += usage.estimatedCostUSD || 0;
      totalCalls += usage.totalCalls || 0;
      if (usage.totalCalls > 0) {
        activeProviders.push({ key, meta, usage });
      }
    }

    // 비활성 제공자 (호출 0건)도 포함
    for (const [key, meta] of Object.entries(PROVIDER_META)) {
      const usage = data[key];
      if (!usage || usage.totalCalls > 0) continue;
      activeProviders.push({ key, meta, usage });
    }

    // 토큰/비용 포맷 헬퍼
    const fmtTokens = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1_000 ? (n / 1_000).toFixed(1) + 'K' : String(n);
    const fmtCost = (n: number) => n >= 0.01 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : '$0.00';

    let html = '';

    // 헤더: 총 비용 요약
    html += `<div style="background:linear-gradient(135deg,rgba(30,34,55,0.98),rgba(25,20,50,0.98));border:1px solid rgba(147,51,234,0.3);border-radius:12px;padding:14px 16px;margin-bottom:12px;">`;
    html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">`;
    html += `<span style="font-size:0.85rem;font-weight:700;color:#e2e8f0;">📊 통합 API 비용 대시보드</span>`;
    html += `<button id="api-cost-refresh-btn" style="padding:2px 8px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.08);color:#94a3b8;font-size:0.7rem;cursor:pointer;" title="새로고침">🔄</button>`;
    html += `</div>`;
    html += `<div style="text-align:center;">`;
    const costColor = totalCost > 10 ? '#ef4444' : totalCost > 5 ? '#f59e0b' : '#22c55e';
    html += `<div style="font-size:1.8rem;font-weight:800;color:${costColor};letter-spacing:-1px;">${fmtCost(totalCost)}</div>`;
    html += `<div style="font-size:0.72rem;color:#94a3b8;">총 ${totalCalls.toLocaleString()}회 호출 | ${activeProviders.filter(p => p.usage.totalCalls > 0).length}개 제공자 활성</div>`;
    html += `</div>`;
    html += `</div>`;

    // 제공자별 카드
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">`;

    for (const { key, meta, usage } of activeProviders) {
      const cost = usage.estimatedCostUSD || 0;
      const calls = usage.totalCalls || 0;
      const opacity = calls > 0 ? '1' : '0.4';
      const borderCol = calls > 0 ? `${meta.color}44` : 'rgba(255,255,255,0.08)';

      html += `<div style="background:rgba(255,255,255,0.04);border:1px solid ${borderCol};border-radius:8px;padding:8px 10px;opacity:${opacity};">`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">`;
      html += `<span style="font-size:0.75rem;font-weight:600;color:${meta.color};">${meta.icon} ${meta.label}</span>`;
      html += `<span style="font-size:0.82rem;font-weight:700;color:#e2e8f0;">${fmtCost(cost)}</span>`;
      html += `</div>`;

      // 상세 정보
      html += `<div style="font-size:0.68rem;color:#94a3b8;line-height:1.4;">`;
      if (calls > 0) {
        html += `${calls.toLocaleString()}회 호출`;
        if (meta.type === 'text') {
          html += ` | ${fmtTokens(usage.totalInputTokens || 0)}in/${fmtTokens(usage.totalOutputTokens || 0)}out`;
        } else {
          html += ` | 이미지 ${(usage.totalImages || 0).toLocaleString()}장`;
        }
      } else {
        html += `사용 기록 없음`;
      }
      html += `</div>`;
      html += `</div>`;
    }

    html += `</div>`;

    // 하단: 안내 + 전체 초기화
    html += `<div style="display:flex;justify-content:space-between;align-items:center;">`;
    html += `<div style="font-size:0.68rem;color:#64748b;line-height:1.4;">⚠️ 앱 실행 중 추적된 <b>추정치</b>입니다.</div>`;
    html += `<button id="api-cost-reset-all-btn" style="padding:2px 10px;border-radius:4px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.1);color:#fca5a5;font-size:0.7rem;cursor:pointer;">🔄 전체 초기화</button>`;
    html += `</div>`;

    container.innerHTML = html;

    // 이벤트 바인딩
    document.getElementById('api-cost-refresh-btn')?.addEventListener('click', () => refreshApiCostDashboard());
    document.getElementById('api-cost-reset-all-btn')?.addEventListener('click', async () => {
      if (!confirm('전체 API 사용량 추적을 초기화하시겠습니까?\n(실제 청구에는 영향 없음)')) return;
      try {
        await (window.api as any).resetApiUsage();
        toastManager.success('🔄 전체 API 사용량 초기화 완료!');
        refreshApiCostDashboard();
      } catch { toastManager.error('초기화 실패'); }
    });
  } catch (err: any) {
    container.innerHTML = `<div style="text-align:center;padding:12px;color:#fca5a5;font-size:0.82rem;">❌ 오류: ${err?.message || '알 수 없는 오류'}</div>`;
  }
}
