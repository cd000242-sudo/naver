/**
 * ✅ [2026-02-26 모듈화] 이미지 관리 탭 모듈
 * - renderer.ts에서 분리됨
 * - 이미지 관리 탭 UI 초기화, 이미지 목록 표시/관리
 * - 의존: appendLog (자체 정의), window.api, DOM
 */

import { toastManager } from '../utils/uiManagers.js';
import { readRawPipelineSettings } from './pipelineConfig.js';
// ✅ [v2.10.288] subImageMode import 제거 — esbuild 회귀 차단. window 통해 호출.
type SubImageMode = 'ai' | 'collected';
function setSubImageMode(mode: SubImageMode): void {
  try {
    const w = (typeof window !== 'undefined' ? (window as any) : null);
    if (w && typeof w.setSubImageMode === 'function') {
      w.setSubImageMode(mode);
      return;
    }
    localStorage.setItem('scSubImageMode', mode);
    localStorage.setItem('scSubImageSource', mode);
  } catch { /* ignore */ }
}

// renderer.ts 전역 함수/변수 참조 (런타임에 존재)
declare function showLocalImageManagementModal(): Promise<void>;
declare function displayGeneratedImages(images: any[]): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare let generatedImages: any[];

// appendLog는 rendererUtils.ts에서 전역 스코프로 제공됨
declare function appendLog(message: string, logOutputId?: string): void;

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

export async function initImageManagementTab(): Promise<void> {
  // 2026-06-14: Flow/Prodia are selectable again for existing users.
  // ImageFX remains hidden; only stale ImageFX selections migrate to dropshot.
  try {
    const rawPipeline = readRawPipelineSettings();
    const savedByKey: Record<string, string | null> = {
      fullAutoImageSource: rawPipeline.fullAutoImageSource,
      globalImageSource: rawPipeline.globalImageSource,
      scAIImageEngine: rawPipeline.scAIImageEngine,
    };
    for (const key of ['fullAutoImageSource', 'globalImageSource', 'scAIImageEngine']) {
      const saved = savedByKey[key];
      if (saved === 'imagefx') {
        localStorage.setItem(key, 'dropshot');
        console.log(`[ImageEngine] 🔁 ${key}: ${saved} → dropshot (불안정 엔진 제거 — 리더스 나노바나나로 이관)`);
      }
    }
    if ((window as any).globalImageSource === 'imagefx') {
      (window as any).globalImageSource = 'dropshot';
    }
  } catch { /* localStorage unavailable — nothing to migrate */ }

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
          if ((window as any).api?.openExternalUrl) {
            (window as any).api.openExternalUrl(geminiApiUrl);
          } else {
            window.open(geminiApiUrl, '_blank');
          }
          appendLog('🔑 Gemini API 키 발급 페이지를 외부 브라우저에서 열었습니다.');
        });

        checkUsageBtn?.addEventListener('click', () => {
          const usageUrl = 'https://aistudio.google.com/app/usage?timeRange=last-28-days&tab=billing&project=gen-lang-client-0528067248';
          if ((window as any).api?.openExternalUrl) {
            (window as any).api.openExternalUrl(usageUrl);
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

        // [v2.10.110] 배경 클릭 경로에도 keydown listener 정리 추가 (누수 차단)
        const handleEsc = (e: KeyboardEvent) => {
          if (e.key === 'Escape') { document.removeEventListener('keydown', handleEsc); modal?.remove(); }
        };
        modal?.addEventListener('click', (e) => {
          if (e.target === modal) {
            document.removeEventListener('keydown', handleEsc);
            modal.remove();
          }
        });
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

      if (selectedSource === 'nano-banana-2') {
        appendLog('✅ 🍌 나노바나나2(Gemini 3.1 Flash Image)가 선택되었습니다. — Gemini API 키 필요, 장당 ₩97 | 한글 가능');
      } else if (selectedSource === 'nano-banana-pro') {
        appendLog('✅ 🍌 나노바나나 프로(Gemini 3 Pro Image)가 선택되었습니다. — Gemini API 키 필요, 장당 ₩185 | 한글 최강');
      } else if (selectedSource === 'nano-banana') {
        appendLog('✅ 🍌 나노바나나(Gemini 2.5 Flash Image)가 선택되었습니다. — Gemini API 키 필요, 장당 ₩54 | 한글 텍스트 깨짐 주의');
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
        appendLog('✅ 🦆 덕트테이프(OpenAI gpt-image-1.5/2, 기본 1.5)가 선택되었습니다. — OpenAI API 키 필요, 장당 ₩25~₩280');
      } else if (selectedSource === 'leonardoai') {
        appendLog('✅ Leonardo AI가 선택되었습니다. API 키가 필요합니다.');
      } else if (selectedSource === 'flow') {
        appendLog('✅ Flow가 선택되었습니다. Google 로그인 기반 UI 자동화로 순차 생성됩니다.');
      } else if (selectedSource === 'imagefx') {
        appendLog('⚠️ ImageFX (Google Labs)가 선택되었습니다. Google 로그인 후에도 계정/IP/지역에 따라 403 접근 거부가 날 수 있습니다. 대량 발행은 Flow, 리더스 나노바나나프로, OpenAI Image, DeepInfra를 권장합니다.');
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
            imageSourceSelect.value = localStorage.getItem('fullAutoImageSource') || 'dropshot';
            return;
          }
        } catch (e: any) {
          appendLog(`❌ 폴더 선택 오류: ${e.message}`);
          imageSourceSelect.value = localStorage.getItem('fullAutoImageSource') || 'dropshot';
          return;
        }
      }
      // ✅ [2026-03-16] ImageFX 선택 시 Google 계정 변경 버튼 표시/숨기기
      ensureImageFxSwitchButton(imageSourceSelect, selectedSource === 'imagefx');

      // ✅ [2026-02-13 ROOT CAUSE FIX] globalImageSource/fullAutoImageSource에는 AI 엔진만 저장
      // 'saved'는 AI 엔진이 아님 → 별도 키에 저장하고, AI 엔진 설정은 오염시키지 않음
      const normalizedSource = selectedSource;
      (window as any).globalImageSource = normalizedSource;
      if (normalizedSource !== 'saved') {
        localStorage.setItem('globalImageSource', normalizedSource);
        // ✅ [2026-02-13 FIX] fullAutoImageSource도 항상 동기화
        localStorage.setItem('fullAutoImageSource', normalizedSource);
        console.log(`[Renderer] 🔄 fullAutoImageSource 동기화: "${normalizedSource}"${normalizedSource !== selectedSource ? ` (정규화: "${selectedSource}" → "${normalizedSource}")` : ''}`);
        // [v1.6.3] 쇼핑 커넥트 AI 엔진(nano-banana-pro|openai-image)이면 scAIImageEngine + 라디오도 sync
        if (selectedSource === 'nano-banana-2' || selectedSource === 'openai-image' || selectedSource === 'dropshot') {
          localStorage.setItem('scAIImageEngine', selectedSource);
          // ✅ [2026-05-18] 엔진 이름을 scSubImageSource에 쓰지 않는다. mode='ai'만 저장.
          setSubImageMode('ai');
          // 연속발행 모달 라디오 반영
          const contRadio = document.querySelector(`input[name="continuous-modal-shopping-subimage-source"][value="${selectedSource}"]`) as HTMLInputElement | null;
          if (contRadio && !contRadio.checked) contRadio.checked = true;
          // 다중계정 모달 라디오 반영
          const maRadio = document.querySelector(`input[name="ma-shopping-subimage-source"][value="${selectedSource}"]`) as HTMLInputElement | null;
          if (maRadio && !maRadio.checked) maRadio.checked = true;
          console.log(`[Renderer] 🛒 쇼핑커넥트 AI 엔진 sync: "${selectedSource}"`);
        }
      } else {
        // ✅ [2026-03-10 CLEANUP] imageSourceMode dead write 제거 — getItem 없음
        console.log(`[Renderer] 📁 저장된 이미지 모드 활성화 (AI 엔진 설정 유지: "${localStorage.getItem('globalImageSource') || 'dropshot'}")`);
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

      // ✅ OpenAI 이미지 모델·품질 선택 UI 표시/숨김
      const openaiModelContainer = document.getElementById('openai-image-model-selection-container');
      if (openaiModelContainer) {
        openaiModelContainer.style.display = selectedSource === 'openai-image' ? 'block' : 'none';
      }

      // 배지 업데이트 - 소스별 색상
      if (imageSourceInfoBadge) {
        const colorMap: Record<string, string> = {
          'nano-banana-2': 'linear-gradient(135deg, #f59e0b, #d97706)',
          'nano-banana-pro': 'linear-gradient(135deg, #03c75a, #02a94f)',
          'nano-banana': 'linear-gradient(135deg, #fbbf24, #f59e0b)',
          'deepinfra': 'linear-gradient(135deg, #fb923c, #f97316)',
          'falai': 'linear-gradient(135deg, #ec4899, #db2777)',
          'pollinations': 'linear-gradient(135deg, #f472b6, #ec4899)',
          'prodia': 'linear-gradient(135deg, #a855f7, #8b5cf6)',
          'stability': 'linear-gradient(135deg, #3b82f6, #2563eb)',
          'openai-image': 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
          'leonardoai': 'linear-gradient(135deg, #ea580c, #dc2626)',
          'imagefx': 'linear-gradient(135deg, #10b981, #059669)',
          'flow': 'linear-gradient(135deg, #22c55e, #16a34a)',
          'local-folder': 'linear-gradient(135deg, #4338ca, #6366f1)',
          'saved': 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
        };
        imageSourceInfoBadge.style.background = colorMap[selectedSource] || colorMap['nano-banana-pro'];
      }
    });

    // [v2.11.x] 내 폴더 / 저장된 이미지 — AI 엔진 드롭다운에서 분리한 별도 버튼.
    // 기존 드롭다운 'local-folder'/'saved' 분기의 소스 상태 설정을 그대로 복제.
    const localFolderBtn = document.getElementById('image-source-local-folder-btn');
    if (localFolderBtn && !localFolderBtn.hasAttribute('data-listener-added')) {
      localFolderBtn.setAttribute('data-listener-added', 'true');
      localFolderBtn.addEventListener('click', async () => {
        try {
          const result = await (window as any).api.selectFolder();
          if (result && result.filePaths && result.filePaths.length > 0) {
            const folderPath = result.filePaths[0];
            localStorage.setItem('localFolderPath', folderPath);
            (window as any).globalImageSource = 'local-folder';
            localStorage.setItem('globalImageSource', 'local-folder');
            localStorage.setItem('fullAutoImageSource', 'local-folder');
            appendLog(`✅ 📂 내 폴더가 선택되었습니다: ${folderPath}`);
          } else {
            appendLog('⚠️ 폴더 선택이 취소되었습니다.');
          }
        } catch (e: any) {
          appendLog(`❌ 폴더 선택 오류: ${e.message}`);
        }
      });
    }
    const savedImagesBtn = document.getElementById('image-source-saved-btn');
    if (savedImagesBtn && !savedImagesBtn.hasAttribute('data-listener-added')) {
      savedImagesBtn.setAttribute('data-listener-added', 'true');
      savedImagesBtn.addEventListener('click', async () => {
        const confirmed = window.confirm(
          '⚠️ 저작권 경고\n\n' +
          '저장된 이미지를 사용할 경우, 해당 이미지의 저작권 및 초상권 문제는 전적으로 사용자 본인이 책임져야 합니다.\n\n' +
          '이미지 사용으로 인해 발생하는 모든 법적 책임은 사용자에게 있습니다.\n\n' +
          '위 내용을 충분히 숙지하셨습니까?'
        );
        if (!confirmed) {
          appendLog('⚠️ 저장된 이미지 사용이 취소되었습니다.');
          return;
        }
        (window as any).globalImageSource = 'saved';
        await showLocalImageManagementModal();
        appendLog('✅ 저장된 이미지 모드가 선택되었습니다.');
      });
    }

    // 초기화: 저장된 설정 복원 (풀오토 설정 우선)
    // ✅ [2026-03-02 FIX] fullAutoImageSource 우선 읽기 → 풀오토 이미지 설정이 이미지 관리 탭에도 반영
    let savedSource = localStorage.getItem('fullAutoImageSource') || localStorage.getItem('globalImageSource');
    // [Stage 5] nano-banana-2 is now an independent engine — no migration needed
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

      // OpenAI 모델 선택 UI 초기 표시 여부
      const openaiModelContainer = document.getElementById('openai-image-model-selection-container');
      if (openaiModelContainer) {
        openaiModelContainer.style.display = savedSource === 'openai-image' ? 'block' : 'none';
      }
    }

    // ✅ [v1.4.80 FIX] 과거 "ImageFX만 됐던 버그" 재발 원인 제거
    // 이전: UI select.value가 imagefx면 이미지 관리 탭 진입마다 풀오토/전역 설정을 imagefx로 강제 덮어씀
    //       → 사용자가 Flow 선택해도 이미지 관리 탭 한 번 여는 순간 imagefx로 되돌아감
    // 수정: localStorage 쓰기 완전 제거 — 버튼 표시만 수행 (사용자 선택값 보존)
    const currentSource = imageSourceSelect.value;
    if (currentSource === 'imagefx') {
      ensureImageFxSwitchButton(imageSourceSelect, true);
    }
  }

  // ✅ [v2.7.61] AI 이미지 관련성 검증 체크박스 — config 양방향 sync
  const relevanceCheckbox = document.getElementById('image-relevance-check') as HTMLInputElement | null;
  if (relevanceCheckbox) {
    try {
      const cfg = await (window as any).api?.getConfig?.();
      relevanceCheckbox.checked = cfg?.imageRelevanceCheck === true;
    } catch { /* 무시 */ }
    relevanceCheckbox.addEventListener('change', async () => {
      try {
        const cfg = await (window as any).api?.getConfig?.();
        // ✅ [v2.7.63 B안] Perplexity 사용자에게는 Gemini Flash 폴백 동의 받기
        if (relevanceCheckbox.checked) {
          const textModel = cfg?.primaryGeminiTextModel || '';
          if (textModel === 'perplexity-sonar') {
            const ok = window.confirm(
              '⚠️ Perplexity는 Vision(이미지 분석) API를 지원하지 않습니다.\n\n' +
              '대신 Gemini 2.5 Flash로 자동 폴백되어 이미지 관련성을 평가합니다.\n' +
              '(Gemini API 키 필요, 무료 쿼터 내 사용 가능)\n\n' +
              '이대로 진행하시겠습니까?'
            );
            if (!ok) {
              relevanceCheckbox.checked = false;
              appendLog('🔕 AI 관련성 검증 취소됨 (Perplexity 폴백 미동의)');
              return;
            }
          }
        }
        await (window as any).api?.saveConfig?.({ ...cfg, imageRelevanceCheck: relevanceCheckbox.checked });
        appendLog(relevanceCheckbox.checked
          ? '🤖 AI 이미지 관련성 검증 ON — 글 생성 AI와 동일 vendor로 평가 (글당 약 ₩1.2~₩10)'
          : '🔕 AI 이미지 관련성 검증 OFF — 키워드 기반 수집만 사용');
      } catch (e: any) {
        console.warn('[ImageRelevance] 설정 저장 실패:', e);
      }
    });
  }

  // ✅ OpenAI 이미지 모델·품질 라디오 — config 양방향 sync + 실시간 비용 표시
  const openaiModelRadios = document.querySelectorAll('input[name="openai-image-model"]');
  const openaiQualityRadios = document.querySelectorAll('input[name="openai-image-quality"]');
  const openaiCostDisplay = document.getElementById('openai-image-cost-display');
  if (openaiModelRadios.length > 0 && openaiQualityRadios.length > 0) {
    let openaiUsdRate = 1400;
    const getOpenAISel = (name: string, fallback: string): string =>
      (document.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement)?.value || fallback;
    const refreshOpenAICost = () => {
      if (!openaiCostDisplay) return;
      const fmt = (window as any).formatOpenAIImageCostLabel;
      if (typeof fmt === 'function') {
        openaiCostDisplay.textContent = fmt(
          getOpenAISel('openai-image-model', 'gpt-image-1.5'),
          getOpenAISel('openai-image-quality', 'medium'),
          openaiUsdRate,
        );
      }
    };
    // 초기 복원: config의 모델/품질/환율 반영 (없으면 HTML 기본값 gpt-image-1.5/medium 유지)
    try {
      const cfg = await (window as any).api?.getConfig?.();
      if (cfg) {
        openaiUsdRate = (typeof cfg.usdToKrwRate === 'number' && cfg.usdToKrwRate > 0) ? cfg.usdToKrwRate : 1400;
        const savedModel = cfg.openaiImageModel === 'gpt-image-2' ? 'gpt-image-2' : 'gpt-image-1.5';
        const savedQuality = ['low', 'medium', 'high'].includes(cfg.openaiImageQuality) ? cfg.openaiImageQuality : 'medium';
        const mr = document.querySelector(`input[name="openai-image-model"][value="${savedModel}"]`) as HTMLInputElement | null;
        const qr = document.querySelector(`input[name="openai-image-quality"][value="${savedQuality}"]`) as HTMLInputElement | null;
        if (mr) mr.checked = true;
        if (qr) qr.checked = true;
      }
    } catch { /* config 미존재 — HTML 기본값 유지 */ }
    refreshOpenAICost();
    // 변경 시 config 저장 + 비용 갱신
    const persistOpenAISelection = async () => {
      refreshOpenAICost();
      try {
        const cfg = await (window as any).api?.getConfig?.();
        const model = getOpenAISel('openai-image-model', 'gpt-image-1.5');
        const quality = getOpenAISel('openai-image-quality', 'medium');
        await (window as any).api?.saveConfig?.({ ...cfg, openaiImageModel: model, openaiImageQuality: quality });
        appendLog(`🦆 OpenAI 이미지 설정 저장: ${model} / ${quality}`);
      } catch (e: any) {
        console.warn('[OpenAIImageSettings] 설정 저장 실패:', e);
      }
    };
    openaiModelRadios.forEach((r) => r.addEventListener('change', persistOpenAISelection));
    openaiQualityRadios.forEach((r) => r.addEventListener('change', persistOpenAISelection));
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
