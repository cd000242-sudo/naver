/**
 * ✅ [2026-02-26 모듈화] 이미지 관리 탭 모듈
 * - renderer.ts에서 분리됨
 * - 이미지 관리 탭 UI 초기화, 이미지 목록 표시/관리
 * - 의존: appendLog (자체 정의), window.api, DOM
 */

import { toastManager } from '../utils/uiManagers.js';

// renderer.ts 전역 함수/변수 참조 (런타임에 존재)
declare function showLocalImageManagementModal(): Promise<void>;
declare function displayGeneratedImages(images: any[]): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare let generatedImages: any[];

// appendLog 유틸 (renderer.ts에서 분리)
function appendLog(message: string, logOutputId?: string): void {
  const logEl = document.getElementById(logOutputId || 'log-output');
  if (logEl) {
    logEl.innerHTML += message + '<br>';
    logEl.scrollTop = logEl.scrollHeight;
  }
  console.log('[Log]', message.replace(/<[^>]*>/g, ''));
}

/**
 * ✅ [2026-03-16] ImageFX Google 계정 변경 버튼 생성/표시/숨김 헬퍼
 * - change 이벤트 핸들러와 초기화 코드 양쪽에서 호출
 * - DOM에 버튼이 없으면 생성 후 삽입, 있으면 표시/숨김만 토글
 */
function ensureImageFxSwitchButton(imageSourceSelect: HTMLSelectElement, show: boolean): void {
  let switchAccountBtn = document.getElementById('imagefx-switch-account-btn') as HTMLButtonElement | null;

  if (show) {
    if (!switchAccountBtn) {
      switchAccountBtn = document.createElement('button');
      switchAccountBtn.id = 'imagefx-switch-account-btn';
      switchAccountBtn.type = 'button';
      switchAccountBtn.innerHTML = '🔄 Google 계정 변경';
      switchAccountBtn.style.cssText = `
        margin-top: 8px; padding: 8px 16px;
        background: linear-gradient(135deg, #10b981, #059669);
        color: #fff; border: none; border-radius: 8px;
        cursor: pointer; font-weight: 600; font-size: 0.85rem;
        display: inline-flex; align-items: center; gap: 6px;
        transition: all 0.2s ease; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
      `;
      switchAccountBtn.addEventListener('mouseenter', () => {
        switchAccountBtn!.style.transform = 'translateY(-1px)';
        switchAccountBtn!.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.5)';
      });
      switchAccountBtn.addEventListener('mouseleave', () => {
        switchAccountBtn!.style.transform = '';
        switchAccountBtn!.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
      });
      switchAccountBtn.addEventListener('click', async () => {
        if (switchAccountBtn!.disabled) return;
        const confirmed = confirm(
          '🔄 Google 계정을 변경하시겠습니까?\n\n' +
          '현재 로그인된 계정의 세션이 초기화되고,\n' +
          '브라우저가 열려 새 계정으로 로그인할 수 있습니다.\n\n' +
          '(최대 5분간 로그인을 기다립니다)'
        );
        if (!confirmed) return;

        switchAccountBtn!.disabled = true;
        switchAccountBtn!.innerHTML = '⏳ 계정 변경 중...';
        switchAccountBtn!.style.opacity = '0.7';
        appendLog('🔄 [ImageFX] Google 계정 변경을 시작합니다...', 'images-log-output');

        try {
          const result = await (window as any).api.switchImageFxGoogleAccount();
          if (result.success) {
            toastManager.success(`✅ Google 계정 변경 완료: ${result.userName || 'Google 사용자'}`);
            appendLog(`✅ [ImageFX] ${result.message}`, 'images-log-output');
          } else {
            toastManager.error(`❌ ${result.message}`);
            appendLog(`❌ [ImageFX] ${result.message}`, 'images-log-output');
          }
        } catch (err: any) {
          toastManager.error(`❌ 계정 변경 실패: ${err.message}`);
          appendLog(`❌ [ImageFX] 계정 변경 오류: ${err.message}`, 'images-log-output');
        } finally {
          switchAccountBtn!.disabled = false;
          switchAccountBtn!.innerHTML = '🔄 Google 계정 변경';
          switchAccountBtn!.style.opacity = '1';
        }
      });

      // 드롭다운의 flex 컨테이너 바로 아래(별도 줄)에 버튼 삽입
      const flexContainer = imageSourceSelect.parentElement;
      if (flexContainer?.parentElement) {
        flexContainer.parentElement.insertBefore(switchAccountBtn, flexContainer.nextSibling);
      }
    }
    switchAccountBtn.style.display = 'inline-flex';
  } else {
    if (switchAccountBtn) switchAccountBtn.style.display = 'none';
  }
}

export function initImageManagementTab(): void {
  // ✅ AI 영상 목록 토글 기능
  const toggleHeader = document.getElementById('toggle-mp4-list-header');
  const mp4ListContainer = document.getElementById('mp4-files-list');
  const toggleIcon = document.getElementById('mp4-list-toggle-icon');

  if (toggleHeader && mp4ListContainer && toggleIcon) {
    toggleHeader.addEventListener('click', () => {
      const isHidden = mp4ListContainer.style.display === 'none';
      mp4ListContainer.style.display = isHidden ? 'block' : 'none';
      toggleIcon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';

      // 상태 저장 (선택 사항)
      localStorage.setItem('mp4-list-collapsed', (!isHidden).toString());
    });

    // 초기 상태 로드
    const isCollapsed = localStorage.getItem('mp4-list-collapsed') === 'true';
    if (isCollapsed) {
      mp4ListContainer.style.display = 'none';
      toggleIcon.style.transform = 'rotate(-90deg)';
    }
  }

  // 이미지 소스 선택 버튼 이벤트
  const imageSourceBtns = document.querySelectorAll('.image-source-btn') as NodeListOf<HTMLButtonElement>;
  const imageTitleInput = document.getElementById('image-title') as HTMLInputElement;

  imageSourceBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      // 나노 바나나 프로 버튼 클릭 시 정보 모달 표시 (Pollinations는 무료이므로 제외)
      if (btn.dataset.source === 'nano-banana-pro') {
        const modalHtml = `
          <div id="nano-banana-pro-modal" style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;">
            <div style="background: var(--bg-primary, #1e293b); border-radius: 16px; padding: 2rem; max-width: 480px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); border: 1px solid var(--border-medium, #334155);">
              <div style="text-align: center; margin-bottom: 1.5rem;">
                <span style="font-size: 3rem;">🍌</span>
                <h2 style="color: var(--text-strong, #f1f5f9); margin: 1rem 0 0.5rem; font-size: 1.4rem;">나노 바나나 프로</h2>
                <p style="color: var(--text-muted, #94a3b8); font-size: 0.9rem;">Gemini API를 활용한 AI 이미지 생성</p>
              </div>
              
              <div style="background: rgba(234, 179, 8, 0.1); border-radius: 12px; padding: 1rem; margin-bottom: 1rem; border: 1px solid rgba(234, 179, 8, 0.3);">
                <h4 style="color: #eab308; margin-bottom: 0.5rem; font-size: 0.9rem;">✨ 주요 특징</h4>
                <ul style="color: var(--text-muted, #94a3b8); font-size: 0.85rem; margin: 0; padding-left: 1.2rem; line-height: 1.8;">
                  <li>텍스트 없는 깔끔한 이미지 생성</li>
                  <li>Gemini 3 모델 기반 고품질 출력</li>
                  <li>블로그/광고용에 최적화</li>
                  <li>무료 쿼터 내 사용 가능</li>
                </ul>
              </div>
              
              <div style="background: rgba(239, 68, 68, 0.1); border-radius: 12px; padding: 1rem; margin-bottom: 1rem; border: 1px solid rgba(239, 68, 68, 0.3);">
                <h4 style="color: #ef4444; margin-bottom: 0.5rem; font-size: 0.9rem;">⚠️ 과금 안내</h4>
                <p style="color: var(--text-muted, #94a3b8); font-size: 0.85rem; margin: 0; line-height: 1.6;">
                  Gemini API 키를 사용하며, Google 정책 및 계정 설정에 따라 <strong style="color: #f87171;">과금될 수 있습니다</strong>.<br>
                  사용 전 Google AI Studio에서 청구 설정을 확인하세요.
                </p>
              </div>
              
              <button type="button" id="nano-banana-pro-modal-get-key" style="width: 100%; padding: 0.75rem 1rem; background: linear-gradient(135deg, #3b82f6, #2563eb); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                🔑 Gemini API 키 발급받기 (외부 브라우저)
              </button>
              
              <button type="button" id="nano-banana-pro-modal-check-usage" style="width: 100%; padding: 0.75rem 1rem; background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; margin-bottom: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                📊 사용량/과금 확인하러가기 (외부 브라우저)
              </button>
              
              <div style="display: flex; gap: 0.75rem;">
                <button type="button" id="nano-banana-pro-modal-cancel" style="flex: 1; padding: 0.75rem 1rem; background: var(--bg-secondary, #334155); color: var(--text-strong, #f1f5f9); border: 1px solid var(--border-medium, #475569); border-radius: 8px; cursor: pointer; font-weight: 600;">취소</button>
                <button type="button" id="nano-banana-pro-modal-confirm" style="flex: 1; padding: 0.75rem 1rem; background: linear-gradient(135deg, #eab308, #ca8a04); color: #000; border: none; border-radius: 8px; cursor: pointer; font-weight: 700;">확인 후 사용</button>
              </div>
            </div>
          </div>
        `;

        document.getElementById('nano-banana-pro-modal')?.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const modal = document.getElementById('nano-banana-pro-modal');
        const cancelBtn = document.getElementById('nano-banana-pro-modal-cancel');
        const confirmBtn = document.getElementById('nano-banana-pro-modal-confirm');
        const getKeyBtn = document.getElementById('nano-banana-pro-modal-get-key');
        const checkUsageBtn = document.getElementById('nano-banana-pro-modal-check-usage');

        getKeyBtn?.addEventListener('click', () => {
          const geminiApiUrl = 'https://aistudio.google.com/app/apikey';
          if ((window as any).api?.openUrl) {
            (window as any).api.openUrl(geminiApiUrl);
          } else if ((window as any).api?.openExternal) {
            (window as any).api.openExternal(geminiApiUrl);
          } else {
            window.open(geminiApiUrl, '_blank');
          }
          appendLog('🔑 Gemini API 키 발급 페이지를 외부 브라우저에서 열었습니다.');
        });

        checkUsageBtn?.addEventListener('click', () => {
          const usageUrl = 'https://aistudio.google.com/app/usage?timeRange=last-28-days&tab=billing&project=gen-lang-client-0528067248';
          if ((window as any).api?.openUrl) {
            (window as any).api.openUrl(usageUrl);
          } else if ((window as any).api?.openExternal) {
            (window as any).api.openExternal(usageUrl);
          } else {
            window.open(usageUrl, '_blank');
          }
          appendLog('📊 Gemini API 사용량/과금 확인 페이지를 외부 브라우저에서 열었습니다.');
        });

        cancelBtn?.addEventListener('click', () => {
          modal?.remove();
          appendLog('⚠️ 나노 바나나 프로 사용이 취소되었습니다.');
        });

        confirmBtn?.addEventListener('click', () => {
          modal?.remove();

          imageSourceBtns.forEach(b => {
            b.classList.remove('selected');
            b.style.background = 'var(--bg-primary)';
            b.style.color = 'var(--text-strong)';
            b.style.borderColor = 'var(--border-medium)';
            b.style.boxShadow = 'none';
          });

          btn.classList.add('selected');
          btn.style.background = 'linear-gradient(135deg, #eab308, #ca8a04)';
          btn.style.color = '#000';
          btn.style.borderColor = '#eab308';
          btn.style.boxShadow = '0 4px 15px rgba(234, 179, 8, 0.4)';

          const stabilityModelContainer = document.getElementById('stability-model-selection-container');
          if (stabilityModelContainer) stabilityModelContainer.style.display = 'none';

          appendLog('✅ 나노 바나나 프로가 선택되었습니다. (Gemini API 사용)');
        });

        modal?.addEventListener('click', (e) => {
          if (e.target === modal) modal.remove();
        });

        // ESC 키로 닫기
        const handleEsc = (e: KeyboardEvent) => {
          if (e.key === 'Escape') { modal?.remove(); document.removeEventListener('keydown', handleEsc); }
        };
        document.addEventListener('keydown', handleEsc);

        return;
      }

      // "저장된 이미지" 버튼 클릭 시 저작권 경고 표시
      if (btn.dataset.source === 'local' || btn.dataset.source === 'saved') {
        const confirmed = window.confirm(
          '⚠️ 저작권 경고\n\n' +
          '저장된 이미지를 사용할 경우, 해당 이미지의 저작권 및 초상권 문제는 전적으로 사용자 본인이 책임져야 합니다.\n\n' +
          '이미지 사용으로 인해 발생하는 모든 법적 책임은 사용자에게 있으며, 본 프로그램 제작자는 어떠한 책임도 지지 않습니다.\n\n' +
          '위 내용을 충분히 숙지하셨습니까?'
        );

        if (!confirmed) {
          appendLog('⚠️ 저장된 이미지 사용이 취소되었습니다.');
          return;
        }

        imageSourceBtns.forEach(b => {
          b.classList.remove('selected');
          b.style.background = 'var(--bg-primary)';
          b.style.color = 'var(--text-strong)';
          b.style.borderColor = 'var(--border-medium)';
          b.style.boxShadow = 'none';
        });

        btn.classList.add('selected');
        btn.style.background = 'linear-gradient(135deg, #8b5cf6, #7c3aed)';
        btn.style.color = 'white';
        btn.style.borderColor = '#8b5cf6';
        btn.style.boxShadow = '0 4px 15px rgba(139, 92, 246, 0.4)';

        await showLocalImageManagementModal();
        return;
      }

      // ✅ Pollinations 버튼 클릭 시 모달 없이 바로 선택 (무료)
      if (btn.dataset.source === 'pollinations') {
        imageSourceBtns.forEach(b => {
          b.classList.remove('selected');
          b.style.background = 'var(--bg-primary)';
          b.style.color = 'var(--text-strong)';
          b.style.borderColor = 'var(--border-medium)';
          b.style.boxShadow = 'none';
        });

        btn.classList.add('selected');
        btn.style.background = 'linear-gradient(135deg, #ec4899, #db2777)';
        btn.style.color = '#fff';
        btn.style.borderColor = '#ec4899';
        btn.style.boxShadow = '0 4px 15px rgba(236, 72, 153, 0.4)';

        const stabilityModelContainer = document.getElementById('stability-model-selection-container');
        if (stabilityModelContainer) stabilityModelContainer.style.display = 'none';

        appendLog('✅ Pollinations(FLUX, 무료)가 선택되었습니다.');
        return;
      }

      // 일반 소스 선택
      imageSourceBtns.forEach(b => {
        b.classList.remove('selected');
        b.style.opacity = '0.65';
        b.style.borderColor = 'var(--border-medium)';
        b.style.boxShadow = 'none';
      });

      btn.classList.add('selected');
      btn.style.opacity = '1';
      btn.style.borderColor = '#8b5cf6';
      btn.style.boxShadow = '0 4px 15px rgba(139, 92, 246, 0.4)';

      const stabilityModelContainer = document.getElementById('stability-model-selection-container');
      if (stabilityModelContainer) {
        if (btn.dataset.source === 'stability') {
          stabilityModelContainer.style.display = 'block';
          stabilityModelContainer.style.animation = 'fadeIn 0.3s ease-out';
        } else {
          stabilityModelContainer.style.display = 'none';
        }
      }
    });
  });

  // ✅ [2026-01-27] 드롭다운 이미지 소스 선택 핸들러
  const imageSourceSelect = document.getElementById('image-source-select') as HTMLSelectElement;
  const imageSourceInfoBadge = document.getElementById('image-source-info-badge');

  if (imageSourceSelect) {
    imageSourceSelect.addEventListener('change', async () => {
      const selectedSource = imageSourceSelect.value;
      const selectedOption = imageSourceSelect.options[imageSourceSelect.selectedIndex];

      console.log(`[ImageSource] 드롭다운 선택: ${selectedSource}`);

      // 나노 바나나 프로 선택 시 (Gemini API 과금 안내 필요)
      // 드롭다운에서는 간단한 confirm으로 대체
      if (selectedSource === 'nano-banana-pro') {
        appendLog('✅ 나노 바나나 프로(Gemini 3)가 선택되었습니다. (Gemini API 사용)');
      } else if (selectedSource === 'saved') {
        const confirmed = window.confirm(
          '⚠️ 저작권 경고\n\n' +
          '저장된 이미지를 사용할 경우, 해당 이미지의 저작권 및 초상권 문제는 전적으로 사용자 본인이 책임져야 합니다.\n\n' +
          '이미지 사용으로 인해 발생하는 모든 법적 책임은 사용자에게 있습니다.\n\n' +
          '위 내용을 충분히 숙지하셨습니까?'
        );

        if (!confirmed) {
          // 이전 선택으로 되돌리기 (나노 바나나 프로로)
          imageSourceSelect.value = 'nano-banana-pro';
          appendLog('⚠️ 저장된 이미지 사용이 취소되었습니다.');
          return;
        }
        await showLocalImageManagementModal();
        appendLog('✅ 저장된 이미지 모드가 선택되었습니다.');
      } else if (selectedSource === 'deepinfra') {
        appendLog('✅ DeepInfra(FLUX-2, $0.01/장)가 선택되었습니다.');
      } else if (selectedSource === 'pollinations') {
        appendLog('✅ Pollinations(FLUX, 무료)가 선택되었습니다.');
      } else if (selectedSource === 'falai') {
        appendLog('✅ Fal.ai(FLUX Schnell)가 선택되었습니다.');
      } else if (selectedSource === 'prodia') {
        appendLog('✅ Prodia($0.0025/장)가 선택되었습니다.');
      } else if (selectedSource === 'stability') {
        appendLog('✅ Stability AI(고품질)가 선택되었습니다.');
      } else if (selectedSource === 'openai-image') {
        appendLog('✅ OpenAI DALL-E(gpt-image-1)가 선택되었습니다. API 키가 필요합니다.');
      } else if (selectedSource === 'leonardoai') {
        appendLog('✅ Leonardo AI가 선택되었습니다. API 키가 필요합니다.');
      } else if (selectedSource === 'imagefx') {
        appendLog('✅ ImageFX (Google 무료)가 선택되었습니다. 첫 사용 시 Google 로그인이 필요합니다.');
      } else if (selectedSource === 'local-folder') {
        // ✅ [2026-03-22] 내 폴더 선택 시 폴더 선택 다이얼로그
        try {
          const result = await (window as any).api.selectFolder();
          if (result && result.filePaths && result.filePaths.length > 0) {
            const folderPath = result.filePaths[0];
            localStorage.setItem('localFolderPath', folderPath);
            appendLog(`✅ 📂 내 폴더가 선택되었습니다: ${folderPath}`);
          } else {
            appendLog('⚠️ 폴더 선택이 취소되었습니다. AI 이미지가 사용됩니다.');
            imageSourceSelect.value = localStorage.getItem('fullAutoImageSource') || 'imagefx';
            return;
          }
        } catch (e: any) {
          appendLog(`❌ 폴더 선택 오류: ${e.message}`);
          imageSourceSelect.value = localStorage.getItem('fullAutoImageSource') || 'imagefx';
          return;
        }
      }
      // ✅ [2026-03-16] ImageFX 선택 시 Google 계정 변경 버튼 표시/숨기기
      ensureImageFxSwitchButton(imageSourceSelect, selectedSource === 'imagefx');

      // ✅ [2026-02-13 ROOT CAUSE FIX] globalImageSource/fullAutoImageSource에는 AI 엔진만 저장
      // 'saved'는 AI 엔진이 아님 → 별도 키에 저장하고, AI 엔진 설정은 오염시키지 않음
      (window as any).globalImageSource = selectedSource;
      if (selectedSource !== 'saved') {
        localStorage.setItem('globalImageSource', selectedSource);
        // ✅ [2026-02-13 FIX] fullAutoImageSource도 항상 동기화
        // 이전: 미설정일 때만 동기화 → 이전에 deepinfra로 설정된 후 nano-banana-pro로 변경해도 반영 안 됨
        // 변경: AI 엔진 변경 시 항상 fullAutoImageSource도 함께 업데이트
        localStorage.setItem('fullAutoImageSource', selectedSource);
        console.log(`[Renderer] 🔄 fullAutoImageSource 동기화: "${selectedSource}"`);
      } else {
        // ✅ [2026-03-10 CLEANUP] imageSourceMode dead write 제거 — getItem 없음
        console.log(`[Renderer] 📁 저장된 이미지 모드 활성화 (AI 엔진 설정 유지: "${localStorage.getItem('globalImageSource') || 'imagefx'}")`);
      }

      // Stability AI 모델 선택 UI 표시/숨김
      const stabilityModelContainer = document.getElementById('stability-model-selection-container');
      if (stabilityModelContainer) {
        if (selectedSource === 'stability') {
          stabilityModelContainer.style.display = 'block';
          stabilityModelContainer.style.animation = 'fadeIn 0.3s ease-out';
        } else {
          stabilityModelContainer.style.display = 'none';
        }
      }

      // Leonardo AI 모델 선택 UI 표시/숨김
      const leonardoModelContainer = document.getElementById('leonardoai-model-selection-container');
      if (leonardoModelContainer) {
        if (selectedSource === 'leonardoai') {
          leonardoModelContainer.style.display = 'block';
          leonardoModelContainer.style.animation = 'fadeIn 0.3s ease-out';
        } else {
          leonardoModelContainer.style.display = 'none';
        }
      }

      // 배지 업데이트 - 소스별 색상
      if (imageSourceInfoBadge) {
        const colorMap: Record<string, string> = {
          'nano-banana-pro': 'linear-gradient(135deg, #03c75a, #02a94f)',
          'deepinfra': 'linear-gradient(135deg, #fb923c, #f97316)',
          'falai': 'linear-gradient(135deg, #ec4899, #db2777)',
          'pollinations': 'linear-gradient(135deg, #f472b6, #ec4899)',
          'prodia': 'linear-gradient(135deg, #a855f7, #8b5cf6)',
          'stability': 'linear-gradient(135deg, #3b82f6, #2563eb)',
          'openai-image': 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
          'leonardoai': 'linear-gradient(135deg, #ea580c, #dc2626)',
          'imagefx': 'linear-gradient(135deg, #10b981, #059669)',
          'local-folder': 'linear-gradient(135deg, #4338ca, #6366f1)',
          'saved': 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
        };
        imageSourceInfoBadge.style.background = colorMap[selectedSource] || colorMap['nano-banana-pro'];
      }
    });

    // 초기화: 저장된 설정 복원 (풀오토 설정 우선)
    // ✅ [2026-03-02 FIX] fullAutoImageSource 우선 읽기 → 풀오토 이미지 설정이 이미지 관리 탭에도 반영
    const savedSource = localStorage.getItem('fullAutoImageSource') || localStorage.getItem('globalImageSource');
    if (savedSource && imageSourceSelect.querySelector(`option[value="${savedSource}"]`)) {
      imageSourceSelect.value = savedSource;
      (window as any).globalImageSource = savedSource;

      // Stability 모델 선택 UI 초기 표시 여부
      const stabilityModelContainer = document.getElementById('stability-model-selection-container');
      if (stabilityModelContainer) {
        stabilityModelContainer.style.display = savedSource === 'stability' ? 'block' : 'none';
      }

      // Leonardo AI 모델 선택 UI 초기 표시 여부
      const leonardoModelContainer = document.getElementById('leonardoai-model-selection-container');
      if (leonardoModelContainer) {
        leonardoModelContainer.style.display = savedSource === 'leonardoai' ? 'block' : 'none';
      }
    }

    // ✅ [2026-03-16 FIX] ImageFX 기본값 — 초기화 시점에 직접 버튼 생성 (change 이벤트 의존 제거)
    // change 이벤트 디스패치 방식은 formUtilities.ts 등 중복 핸들러 간섭으로 불안정
    // → 초기화 시점에 직접 ensureImageFxSwitchButton 호출하여 확실하게 버튼 표시
    const currentSource = imageSourceSelect.value;
    if (currentSource === 'imagefx') {
      (window as any).globalImageSource = 'imagefx';
      localStorage.setItem('globalImageSource', 'imagefx');
      localStorage.setItem('fullAutoImageSource', 'imagefx');
      ensureImageFxSwitchButton(imageSourceSelect, true);
    }
  }

  // ✅ [Fix] 이미지 관리 탭 초기 진입 시 기존 이미지 그리드 즉시 렌더링

  // 페이지 로드 시점이나 탭 전환 시점에 실행됨
  setTimeout(() => {
    const existingImages = (window as any).imageManagementGeneratedImages || generatedImages || [];
    if (Array.isArray(existingImages) && existingImages.length > 0) {
      console.log('[ImageManager] 초기 이미지 그리드 자동 렌더링:', existingImages.length);
      displayGeneratedImages(existingImages);
      // 영어 프롬프트용 데이터도 업데이트
      updatePromptItemsWithImages(existingImages);
    }
  }, 1000);

  // ✅ [New] 쇼핑 커넥트 일괄 링크 적용
  const batchLinkApplyBtn = document.getElementById('batch-link-apply-btn');
  if (batchLinkApplyBtn) {
    batchLinkApplyBtn.addEventListener('click', () => {
      const batchInput = document.getElementById('batch-link-input') as HTMLInputElement;
      const linkUrl = batchInput?.value?.trim();

      if (!linkUrl) {
        alert('적용할 링크 URL을 입력해주세요. (예: https://coupa.ng/...)');
        batchInput?.focus();
        return;
      }

      // 간단한 URL 검증
      if (!/^https?:\/\//i.test(linkUrl)) {
        if (!confirm('링크가 http:// 또는 https:// 로 시작하지 않습니다.\n정말 적용하시겠습니까?')) {
          batchInput?.focus();
          return;
        }
      }

      if (!confirm(`현재 목록의 모든 이미지에 아래 링크를 적용하시겠습니까?\n\n🔗 ${linkUrl}\n\n⚠️ 기존 링크는 덮어씌워집니다.`)) {
        return;
      }

      try {
        // 전역 이미지 배열 사용 (ImageManager.getAllImages() 대신)
        const allImages = (window as any).imageManagementGeneratedImages || generatedImages || [];
        if (!allImages || allImages.length === 0) {
          alert('적용할 이미지가 없습니다.');
          return;
        }

        let count = 0;
        allImages.forEach((img: any) => {
          img.link = linkUrl;
          count++;
        });

        // 전역 상태 업데이트
        (window as any).imageManagementGeneratedImages = allImages;
        generatedImages = allImages;

        // 그리드 갱신
        displayGeneratedImages(allImages);

        toastManager.success(`✅ 총 ${count}개 이미지에 링크가 일괄 적용되었습니다!`);
        appendLog(`🔗 [일괄 적용] 모든 이미지 링크 변경됨: ${linkUrl}`);

        // 입력창 초기화 (선택사항)
        // batchInput.value = ''; 

      } catch (error) {
        console.error('Batch link processing error:', error);
        alert(`❌ 일괄 적용 중 오류가 발생했습니다: ${(error as Error).message}`);
      }
    });
  }
}
