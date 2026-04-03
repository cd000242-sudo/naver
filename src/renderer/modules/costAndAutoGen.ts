// ============================================
// costAndAutoGen.ts — renderer.ts에서 추출한 비용 안전 + 자동 이미지 생성
// Phase 5B-6: ensureExternalApiCostConsent, reserveExternalApiImageQuota,
//             generateImagesWithCostSafety, autoSearchAndPopulateImages,
//             runUiActionLockedCompat, ensurePromptCardRemoveHandler
// ============================================

// 전역 스코프 의존성
declare let generatedImages: any[];
declare let currentStructuredContent: any;
declare let currentPostId: string | null;
declare function appendLog(message: string, logOutputId?: string): void;
declare function runUiActionLocked(...args: any[]): any;
declare function isCostRiskImageProvider(provider: string): boolean;
declare function getCostRiskProviderLabel(provider: string): string;
declare function getTodayKey(): string;
declare function getGlobalImageSettings(): any;
declare function escapeHtml(str: string): string;
declare function hydrateImageManagerFromImages(structuredContent: any, images: any[]): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function pushImageHistorySnapshot(reason: string): void;
declare function saveGeneratedPost(structuredContent: any, isUpdate?: boolean, overrides?: any): string | null;
declare function updatePostImages(postId: string, images: any[]): void;
declare function refreshGeneratedPostsList(): void;
declare const ImageManager: any;
declare const toastManager: any;
declare const UnifiedDOMCache: any;
declare let progressModal: any;
declare function shouldRunAutoImageSearch(...args: any[]): boolean;
declare function runAutoImageSearch(...args: any[]): Promise<void>;
declare function isShoppingConnectModeActive(): boolean;
declare function getSafeHeadingTitle(heading: any): string;
declare function getHeadingSelectedImageKey(...args: any[]): string;
declare function getStableImageKey(heading: any): string;
declare function toFileUrlMaybe(p: string): string;

async function autoSearchAndPopulateImages(
  structuredContent: any,
  mainKeyword: string,
  suppressModal?: boolean
): Promise<void> {
  // 가드: 체크박스 미체크, 풀오토, 쇼핑커넥트 등이면 실행 안 함
  if (!shouldRunAutoImageSearch(suppressModal)) return;

  try {
    await runAutoImageSearch(
      structuredContent,
      mainKeyword,
      appendLog,
      ImageManager,
      syncGlobalImagesFromImageManager
    );
  } catch (error) {
    console.error('[AutoImageSearch] ❌ 오류:', error);
    appendLog(`⚠️ 이미지 자동 수집 중 오류: ${(error as Error).message}`);
  }
}



// ✅ [Phase 5B-5] saveGeneratedPostFromData → postManager.ts로 이동 완료

// toastManager 호환을 위한 래퍼 (기존 코드와의 호환성 유지)
async function runUiActionLockedCompat<T>(key: string, message: string, fn: () => Promise<T>): Promise<T | null> {
  return runUiActionLocked(key, message, fn, toastManager);
}




async function ensureExternalApiCostConsent(provider: string): Promise<boolean> {
  if (!window.api || typeof window.api.getConfig !== 'function' || typeof window.api.saveConfig !== 'function') {
    return true;
  }

  // ✅ [2026-02-02 FIX] IPC 호출에 타임아웃 추가 (무한 대기 방지)
  let config: any = {};
  try {
    config = await Promise.race([
      window.api.getConfig(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getConfig timeout')), 10000))
    ]) || {};
  } catch (e) {
    console.warn('[CostConsent] ⚠️ getConfig 호출 실패/타임아웃, 기본값 사용:', e);
    config = {};
  }

  // ✅ 나노 바나나 프로 / Fal.ai (FLUX) 전용 플랜 선택 로직
  if (provider === 'nano-banana-pro' || provider === 'falai') {
    // 플랜이 이미 설정되어 있으면 통과
    if (config.geminiPlanType) {
      return true;
    }

    // ✅ 보안 강화: 라이선스 타입 확인 (IPC로 main process에 요청)
    let isFreeLicense = false;
    try {
      const result = await window.api.getLicense();
      isFreeLicense = result?.license?.licenseType === 'free';
    } catch {
      // 라이선스 확인 실패 시 안전하게 free로 간주
      isFreeLicense = true;
    }

    // 무료 라이선스면 팝업 없이 바로 'free'로 설정
    if (isFreeLicense) {
      await window.api.saveConfig({
        ...config,
        geminiPlanType: 'free',
        geminiImageDailyCount: 0,
        geminiImageLastReset: new Date().toISOString().split('T')[0]
      });
      console.log('[Security] 무료 라이선스 감지 → geminiPlanType을 자동으로 "free"로 설정');
      return true;
    }

    // 모달 생성 및 사용자 응답 대기 (유료 라이선스 사용자만 여기 도달)
    return new Promise<boolean>((resolve) => {
      // 오버레이
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed; inset:0; z-index: 999999; background: rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; padding: 1rem; backdrop-filter: blur(4px);';

      const modal = document.createElement('div');
      modal.style.cssText = 'width: min(500px, 90vw); background: var(--bg-primary); border: 1px solid var(--border-light); border-radius: 16px; box-shadow: 0 25px 50px rgba(0,0,0,0.25); overflow:hidden; animation: modal-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);';

      modal.innerHTML = `
        <div style="background: linear-gradient(135deg, #FFC107 0%, #FF9800 100%); padding: 1.5rem; text-align: center;">
          <div style="font-size: 3rem; margin-bottom: 0.5rem;">🍌</div>
          <h2 style="margin: 0; color: #fff; font-size: 1.5rem; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">나노 바나나 프로<br>사용자 플랜 확인</h2>
        </div>
        <div style="padding: 1.5rem;">
          <p style="margin: 0 0 1.5rem; color: var(--text-strong); font-size: 1.05rem; line-height: 1.6; text-align: center;">
            <b style="color: #FF9800;">Gemini API</b>를 사용하여 고품질 이미지를 생성합니다.<br>
            사용 중인 API 키의 <b>요금제(플랜)</b>를 선택해주세요.
          </p>
          
          <div style="background: var(--bg-secondary); border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; font-size: 0.9rem; color: var(--text-muted);">
            <ul style="margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.5rem;">
              <li><b>무료 사용자:</b> 하루 사용량이 제한됩니다. (약 45장)</li>
              <li><b>유료 사용자:</b> 제한 없이 계속 사용할 수 있습니다.</li>
            </ul>
          </div>

          <div style="display: flex; gap: 0.75rem; flex-direction: column;">
            <button id="btn-paid-plan" style="padding: 1rem; border: 2px solid #ddd; border-radius: 12px; background: white; color: #333; cursor: pointer; font-weight: 700; font-size: 1rem; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              <span>💳</span> 저는 <b>유료 플랜</b> 사용자입니다
            </button>
            <button id="btn-free-plan" style="padding: 1rem; border: none; border-radius: 12px; background: #FF9800; color: white; cursor: pointer; font-weight: 700; font-size: 1rem; transition: all 0.2s; box-shadow: 0 4px 6px rgba(255, 152, 0, 0.25);">
              <span>🆓</span> 저는 <b>무료 사용자</b>입니다
            </button>
          </div>
          <div style="margin-top: 1rem; text-align: center;">
           <button id="btn-cancel" style="background: none; border: none; color: var(--text-muted); text-decoration: underline; cursor: pointer; font-size: 0.9rem;">취소하고 다른 생성기 사용하기</button>
          </div>
        </div>
      `;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      // 스타일 애니메이션 추가
      const style = document.createElement('style');
      style.innerHTML = `
        @keyframes modal-pop { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        #btn-paid-plan:hover { border-color: #4CAF50; color: #4CAF50; background: #f0fdf4; transform: translateY(-2px); }
        #btn-free-plan:hover { background: #f57c00; transform: translateY(-2px); box-shadow: 0 6px 12px rgba(255, 152, 0, 0.3); }
      `;
      document.head.appendChild(style);

      // 핸들러
      const saveAndClose = async (type: 'free' | 'paid') => {
        try {
          await window.api.saveConfig({
            ...config,
            geminiPlanType: type,
            // 날짜/카운트 초기화
            geminiImageDailyCount: 0,
            geminiImageLastReset: new Date().toISOString().split('T')[0]
          });
          toastManager.success(`플랜이 [${type === 'free' ? '무료' : '유료'}]로 설정되었습니다.`);
          resolve(true); // 성공
        } catch (e) {
          console.error(e);
          resolve(false);
        } finally {
          overlay.remove();
          style.remove();
        }
      };

      document.getElementById('btn-paid-plan')?.addEventListener('click', () => saveAndClose('paid'));
      document.getElementById('btn-free-plan')?.addEventListener('click', () => saveAndClose('free'));
      document.getElementById('btn-cancel')?.addEventListener('click', () => {
        overlay.remove();
        style.remove();
        resolve(false); // 취소
      });
    });
  }

  // ✅ [2026-02-24] 비용/할당량 경고 다이얼로그 제거 - 자동 동의 처리
  if (config.externalApiCostConsent === true) return true;

  // 자동 동의 저장 (팝업 없이)
  await window.api.saveConfig({
    ...config,
    externalApiCostConsent: true,
    externalApiCostConsentAt: new Date().toISOString(),
  });
  return true;
}

async function reserveExternalApiImageQuota(provider: string, requestCount: number): Promise<{ ok: true; rollback: () => Promise<void> } | { ok: false; message: string }> {
  if (!window.api || typeof window.api.getConfig !== 'function' || typeof window.api.saveConfig !== 'function') {
    return { ok: true, rollback: async () => undefined };
  }

  void provider;
  void requestCount;
  return { ok: true, rollback: async () => undefined };
}




async function generateImagesWithCostSafety(options: any): Promise<any> {
  // ✅ [2026-02-11 FIX] provider 결정 우선순위: 전달값 → fullAutoImageSource → globalImageSource → 'nano-banana-pro'
  console.log(`[generateImagesWithCostSafety] 📥 전달받은 provider: "${String(options?.provider || '').trim()}"`);
  const provider = String(options?.provider || '').trim();

  // ✅ [2026-01-24 FIX] headingImageMode 자동 주입 - 다중계정 발행에서도 홀수/짝수 필터링 적용
  if (!options.headingImageMode) {
    const savedMode = localStorage.getItem('headingImageMode') as 'all' | 'thumbnail-only' | 'odd-only' | 'even-only' | 'none' | null;
    if (savedMode) {
      options.headingImageMode = savedMode;
      console.log(`[Renderer] 🖼️ headingImageMode 자동 주입: "${savedMode}"`);
    }
  }

  // ✅ [2026-02-11 FIX] 이미지 소스 자동 주입 - fullAutoImageSource를 globalImageSource보다 우선 참조
  if (!options.provider) {
    const fullAutoSource = localStorage.getItem('fullAutoImageSource');
    const globalSource = localStorage.getItem('globalImageSource');
    const resolvedSource = fullAutoSource || globalSource;
    if (resolvedSource) {
      options.provider = resolvedSource;
      console.log(`[Renderer] 🎨 이미지 소스 자동 주입: "${resolvedSource}" (fullAuto: ${fullAutoSource || 'null'}, global: ${globalSource || 'null'})`);
    }
  }
  if (!options.imageStyle) {
    const savedStyle = localStorage.getItem('imageStyle');
    if (savedStyle) {
      options.imageStyle = savedStyle;
      console.log(`[Renderer] ✨ 이미지 스타일 자동 주입: "${savedStyle}"`);
    }
  }
  if (!options.imageRatio) {
    const savedRatio = localStorage.getItem('imageRatio');
    if (savedRatio) {
      options.imageRatio = savedRatio;
      console.log(`[Renderer] 📐 이미지 비율 자동 주입: "${savedRatio}"`);
    }
  }

  // ✅ [2026-02-12] 카테고리 자동 주입 → DeepInfra 카테고리별 스타일 적용 (NO PEOPLE 등)
  if (!options.category) {
    const cachedCategory = UnifiedDOMCache?.getRealCategory?.() || '';
    if (cachedCategory) {
      options.category = cachedCategory;
      console.log(`[Renderer] 📂 카테고리 자동 주입: "${cachedCategory}" → DeepInfra 스타일 매칭에 사용`);
    }
  }

  // ✅ [2026-01-27] 썸네일/소제목 분리 비율 주입
  if (!(options as any).thumbnailImageRatio) {
    const savedThumbnailRatio = localStorage.getItem('thumbnailImageRatio') || localStorage.getItem('imageRatio') || '1:1';
    (options as any).thumbnailImageRatio = savedThumbnailRatio;
    console.log(`[Renderer] 📐 썸네일 비율 자동 주입: "${savedThumbnailRatio}"`);
  }
  if (!(options as any).subheadingImageRatio) {
    const savedSubheadingRatio = localStorage.getItem('subheadingImageRatio') || localStorage.getItem('imageRatio') || '1:1';
    (options as any).subheadingImageRatio = savedSubheadingRatio;
    console.log(`[Renderer] 📐 소제목 비율 자동 주입: "${savedSubheadingRatio}"`);
  }

  // ✅ [2026-03-16] thumbnailTextInclude 자동 주입 — 풀오토 등 모든 발행 모드에서 텍스트 오버레이 적용
  if (options.thumbnailTextInclude === undefined) {
    const savedThumbnailText = localStorage.getItem('thumbnailTextInclude') === 'true';
    options.thumbnailTextInclude = savedThumbnailText;
    console.log(`[Renderer] 🔤 thumbnailTextInclude 자동 주입: ${savedThumbnailText}`);
  }

  // ✅ [핵심 수정] 호출자가 isShoppingConnect를 명시적으로 전달했으면 그 값 사용
  // 전달되지 않았으면 UI 상태(체크박스) 확인
  const isShoppingConnect = options.isShoppingConnect === true || isShoppingConnectModeActive();
  options.isShoppingConnect = isShoppingConnect; // 메인 프로세스에도 전달

  console.log(`[Renderer] 🛒 isShoppingConnect 결정: ${isShoppingConnect} (전달값: ${options.isShoppingConnect}, UI: ${isShoppingConnectModeActive()})`);

  if (isShoppingConnect) {
    // ✅ [FIX] 빈 배열도 체크: collectedImages가 없거나 빈 배열이면 currentStructuredContent.images 사용
    const hasCollectedImages = options.collectedImages && Array.isArray(options.collectedImages) && options.collectedImages.length > 0;
    const hasStructuredImages = currentStructuredContent?.images && Array.isArray(currentStructuredContent.images) && currentStructuredContent.images.length > 0;

    if (!hasCollectedImages && hasStructuredImages) {
      options.collectedImages = (currentStructuredContent as any).images;
      console.log(`[Renderer] 🛒 쇼핑커넥트: ${(currentStructuredContent as any).images.length}개 수집 이미지 자동 주입`);
    } else if (hasCollectedImages) {
      console.log(`[Renderer] 🛒 쇼핑커넥트: ${options.collectedImages.length}개 수집 이미지 전달됨`);
    } else {
      // ✅ [2026-02-02 FIX] 수집된 이미지 없어도 AI 이미지 생성으로 정상 진행
      // 이 로그 이후 AI 이미지 생성이 정상적으로 호출되어야 함
      console.log(`[Renderer] ⚠️ 쇼핑커넥트: 수집된 이미지 없음 → AI 이미지 생성으로 진행`);
    }

    // ✅ [2026-02-23 FIX] 제품 가격 정보를 options에 주입 → 스펙 표에 정확한 가격 반영
    const productInfo = (currentStructuredContent as any)?.productInfo || (window as any).crawledProductInfo;
    if (productInfo) {
      options.productData = {
        name: productInfo.name || productInfo.productName || '',
        price: productInfo.price || productInfo.lprice || productInfo.hprice || '',
        brand: productInfo.brand || productInfo.maker || '',
        category: productInfo.category || '',
      };
      console.log(`[Renderer] 💰 제품 가격 정보 주입: ${JSON.stringify(options.productData)}`);
    }

  } else {
    // ✅ [수정] 일반 모드에서도 collectedImages가 있으면 참조 이미지로 사용 (제품 이미지 기반 생성 지원)
    // 더 이상 delete하지 않음 - 수집된 이미지가 있으면 참조로 활용
    if (options.collectedImages && options.collectedImages.length > 0) {
      console.log(`[Renderer] 🔍 일반 모드: 수집 이미지 ${(options.collectedImages as any[]).length}개를 참조 이미지로 사용합니다.`);
    }
  }

  if (!isCostRiskImageProvider(provider)) {
    return window.api.generateImages(options);
  }

  const locked = await runUiActionLocked(
    `cost-risk-image:${provider}`,
    '이미지 생성이 이미 진행 중입니다. 잠시만 기다려주세요.',
    async () => {
      const consentOk = await ensureExternalApiCostConsent(provider);
      if (!consentOk) {
        throw new Error('사용자가 과금/쿼터 안내에 동의하지 않았습니다.');
      }

      const items = Array.isArray(options?.items) ? options.items : [];
      const reserve = await reserveExternalApiImageQuota(provider, items.length || 1);
      if (!reserve.ok) {
        throw new Error(reserve.message);
      }

      // ✅ [2026-02-13 SPEED] 리스너를 try 밖에 선언 (catch에서도 접근 가능)
      let cleanupImageListener: (() => void) | null = null;

      try {
        // ✅ [2026-03-11 FIX] 이미지 생성 API 타임아웃 8분→12분 (원래 엔진 재시도 3회 + 폴백 엔진 여유)
        // 개별 API 90초 × 이미지 5개 / 병렬 2개 = ~225초 + 재시도 3회 여유 = ~12분
        const IMAGE_API_TIMEOUT = 12 * 60 * 1000; // 12분
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`이미지 생성 타임아웃 (${IMAGE_API_TIMEOUT / 1000}초)`));
          }, IMAGE_API_TIMEOUT);
        });
        try {
          if (window.api && typeof (window.api as any).onImageGenerated === 'function') {
            cleanupImageListener = (window.api as any).onImageGenerated((data: { image: any; index: number; total: number }) => {
              const { index, total, image } = data;
              console.log(`[Renderer] 🖼️ 이미지 실시간 수신 (${index + 1}/${total}): ${image?.heading || '이미지'}`);
              // ProgressModal에 실시간 진행 메시지 표시
              try {
                // ✅ [2026-02-13 FIX] 실제 ProgressModal DOM ID 사용 (#progress-step-text)
                const progressStepText = document.getElementById('progress-step-text');
                if (progressStepText) {
                  progressStepText.textContent = `🖼️ 이미지 생성 중... (${index + 1}/${total} 완료)`;
                }
                // 퍼센트 바도 업데이트 (이미지 생성은 40~65% 구간)
                const progressBar = document.getElementById('progress-bar');
                const progressPercent = document.getElementById('progress-percent');
                if (progressBar && progressPercent) {
                  const pct = Math.round(40 + (25 * (index + 1) / total));
                  progressBar.style.width = `${pct}%`;
                  progressPercent.textContent = `${pct}%`;
                }

                // ✅ [2026-02-27 NEW] 실시간 이미지 그리드 업데이트 — 플레이스홀더를 실제 이미지로 교체
                if (image && progressModal && typeof progressModal.updateSingleImage === 'function') {
                  const imgSrc = image.filePath || image.url || image.previewDataUrl || '';
                  if (imgSrc) {
                    progressModal.updateSingleImage(index, {
                      url: imgSrc,
                      filePath: image.filePath || '',
                      heading: image.heading || `이미지 ${index + 1}`,
                    }, total);
                  }
                }

                // ✅ [2026-02-28 NEW] liveImagePreview DOM 직접 업데이트 (headingImageGen.ts 로컬 객체 접근 불가 → DOM 기반)
                const livePanel = document.getElementById('live-image-preview-panel');
                if (livePanel && image) {
                  const liveSrc = image.filePath || image.url || image.previewDataUrl || '';
                  // 1) 그리드 아이템 업데이트 — 플레이스홀더를 실제 이미지로 교체
                  const gridItem = livePanel.querySelector(`.live-grid-item[data-index="${index}"]`) as HTMLElement;
                  if (gridItem && liveSrc) {
                    gridItem.style.border = '2px solid #22c55e';
                    gridItem.innerHTML = `
                      <img src="${liveSrc}" style="width: 100%; height: 100%; object-fit: cover;">
                      <span style="position: absolute; bottom: 2px; right: 2px; background: #22c55e; color: white; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 0.6rem;">✓</span>
                    `;
                  }
                  // 2) 첫 번째 완료 이미지 → 메인 미리보기 자동 표시
                  if (liveSrc && index === 0) {
                    const mainContainer = document.getElementById('live-main-preview-container');
                    if (mainContainer) {
                      mainContainer.innerHTML = `<img src="${liveSrc}" alt="${image.heading || ''}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px;">`;
                    }
                  }
                  // 3) 로그 추가
                  const logArea = livePanel.querySelector('#live-preview-log');
                  if (logArea) {
                    const logEntry = document.createElement('div');
                    logEntry.style.marginBottom = '4px';
                    logEntry.textContent = `✅ [${index + 1}/${total}] ${String(image.heading || '').substring(0, 25)}... 완료`;
                    logArea.appendChild(logEntry);
                    logArea.scrollTop = logArea.scrollHeight;
                  }
                  // 4) 진행률 제목 업데이트
                  const liveTitle = livePanel.querySelector('#live-preview-title');
                  if (liveTitle) {
                    liveTitle.textContent = `🎨 이미지 생성 중... (${index + 1}/${total})`;
                  }
                }
              } catch { } // DOM 업데이트 실패 무시
            });
          }
        } catch (listenerErr) {
          console.warn('[Renderer] ⚠️ onImageGenerated 리스너 등록 실패:', listenerErr);
        }

        const result = await Promise.race([
          window.api.generateImages(options),
          timeoutPromise
        ]);

        // ✅ [2026-02-13 SPEED] 리스너 정리
        if (cleanupImageListener) { try { cleanupImageListener(); } catch { } }

        return result;
      } catch (e) {
        // ✅ [2026-02-13 SPEED] 에러/타임아웃 시에도 리스너 반드시 정리 (좀비 리스너 방지)
        if (cleanupImageListener) { try { cleanupImageListener(); } catch { } }
        await reserve.rollback();
        console.error('[Renderer] ❌ 이미지 생성 실패/타임아웃:', (e as Error).message);

        // ✅ [2026-02-13 FIX] 타임아웃 시 main process에 abort 신호 전달 (orphan 작업 방지)
        if ((e as Error).message?.includes('타임아웃')) {
          try {
            if (window.api && typeof (window.api as any).abortImageGeneration === 'function') {
              (window.api as any).abortImageGeneration();
              console.log('[Renderer] 🛑 타임아웃 → main process에 이미지 생성 중단 신호 전달');
            }
          } catch (abortErr) {
            console.warn('[Renderer] ⚠️ abort 신호 전달 실패:', abortErr);
          }
        }

        throw e;
      }
    }
  );

  if (locked === null) {
    throw new Error('이미지 생성이 이미 진행 중입니다.');
  }
  return locked;
}


function ensurePromptCardRemoveHandler(): void {
  const promptsContainer = document.getElementById('prompts-container') as HTMLDivElement | null;
  if (!promptsContainer) return;
  if ((promptsContainer as any)._imageButtonsHandler) return;

  const existing = (promptsContainer as any)._promptCardRemoveHandler;
  if (existing) return;

  const handler = (e: Event) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.remove-image-from-preview-btn') as HTMLElement | null;
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const index = parseInt(btn.getAttribute('data-image-index') || '0', 10);
    const promptItem = promptsContainer.querySelector(`.prompt-item[data-index="${index + 1}"]`) as HTMLDivElement | null;
    // ✅ [2026-03-16 FIX] getSafeHeadingTitle로 배지 오염 방지
    const headingTitle = (getSafeHeadingTitle(promptItem) || `소제목 ${index + 1}`).trim();

    if (!headingTitle) return;
    if (!confirm('이 이미지를 제거하시겠습니까?')) return;

    try {
      pushImageHistorySnapshot('prompt-card-remove-image');
    } catch (e) {
      console.warn('[renderer] catch ignored:', e);
    }

    try {
      const titleKey = ImageManager.resolveHeadingKey(headingTitle);
      const imagesForHeading = ImageManager.getImages(titleKey);

      let targetIdx = -1;
      const selectedKey = (() => {
        try {
          return String(getHeadingSelectedImageKey(titleKey) || '').trim();
        } catch {
          return '';
        }
      })();
      if (selectedKey) {
        targetIdx = imagesForHeading.findIndex((img: any) => getStableImageKey(img) === selectedKey);
      }
      const currentImgEl = (promptItem?.querySelector('.generated-image img') || promptItem?.querySelector('.images-grid img')) as HTMLImageElement | null;
      if (currentImgEl && currentImgEl.src) {
        const normalizedRemoved = toFileUrlMaybe(String(currentImgEl.src || '').trim());
        if (targetIdx < 0) targetIdx = imagesForHeading.findIndex((img: any) => {
          const raw = img?.url || img?.filePath || img?.previewDataUrl || '';
          const norm = toFileUrlMaybe(String(raw || '').trim());
          return norm === normalizedRemoved;
        });
      }
      if (targetIdx < 0) targetIdx = 0;

      if (targetIdx >= 0 && targetIdx < imagesForHeading.length) {
        ImageManager.removeImageAtIndex(titleKey, targetIdx);
      }
    } catch (err) {
      console.error('[ImageManager] prompt-card remove handler failed:', err);
    }

    syncGlobalImagesFromImageManager();

    // ✅ [2026-03-16 FIX] 삭제 후 프롬프트 영역 UI 갱신
    try {
      const allImagesAfterRemove = ImageManager.getAllImages();
      updatePromptItemsWithImages(allImagesAfterRemove);
    } catch (e) {
      console.warn('[renderer] 삭제 후 UI 갱신 실패:', e);
    }
  };

  (promptsContainer as any)._promptCardRemoveHandler = handler;
  promptsContainer.addEventListener('click', handler);
}

export { autoSearchAndPopulateImages, runUiActionLockedCompat, ensureExternalApiCostConsent, reserveExternalApiImageQuota, generateImagesWithCostSafety, ensurePromptCardRemoveHandler };
