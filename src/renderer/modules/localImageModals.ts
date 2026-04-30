// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 로컬 이미지 모달 모듈
// renderer.ts에서 추출된 로컬 이미지 관리/선택/배치 모달 함수들
// ═══════════════════════════════════════════════════════════════════

// ✅ renderer.ts의 전역 변수/함수 참조 (인라인 빌드에서 동일 스코프)
declare const currentStructuredContent: any;
declare const generatedImages: any[];
declare const ImageManager: any;
declare const toastManager: any;
declare const UnifiedDOMCache: any;
declare function appendLog(msg: string): void;
declare function escapeHtml(str: string): string;
declare function loadGeneratedPosts(): any[];
declare function getRequiredImageBasePath(): Promise<string>;
declare function updateUnifiedImagePreview(headings: any[], images: any[]): void;
declare function displayGeneratedImages(images: any[]): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare function syncGlobalImagesFromImageManager(): void;
declare function syncHeadingVideoInPromptItems(): void;
declare function syncHeadingVideoSlotsInUnifiedPreview(): void;
declare function refreshGeneratedPostsList(): void;
declare function toFileUrlMaybe(path: string): string;

// ✅ 폴더에서 이미지 불러오기 (IPC 사용)
export async function loadImagesFromFolder(postId: string): Promise<any[]> {
  try {
    // ✅ IPC를 통해 파일 시스템 접근
    if (!window.api.getUserHomeDir || !window.api.readDir || !window.api.checkFileExists) {
      console.error('[Image Folder] 파일 시스템 API가 없습니다.');
      return [];
    }

    const basePath = await getRequiredImageBasePath();

    const folderPath = `${basePath}/${postId}`.replace(/\\/g, '/');

    // 폴더 존재 확인
    const exists = await window.api.checkFileExists(folderPath);
    if (!exists) {
      console.log(`폴더가 존재하지 않습니다: ${folderPath}`);
      return [];
    }

    // 폴더 내 파일 목록 읽기
    const files = await window.api.readDir(folderPath);
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

    const images = imageFiles.map((file, index) => {
      const filePath = `${folderPath}/${file}`.replace(/\\/g, '/');
      const ext = file.split('.').pop()?.toLowerCase() || 'jpg';
      const heading = file.replace(/\.[^/.]+$/, ''); // 파일명에서 확장자 제거
      const fileUrl = `file:///${filePath}`;

      return {
        heading,
        filePath,
        previewDataUrl: fileUrl,
        provider: 'local',
        savedToLocal: true,
        url: fileUrl,
        // ✅ prompt 필드 추가 (영어 프롬프트 미리보기용)
        prompt: heading || `이미지 ${index + 1}`
      };
    });

    return images;
  } catch (error) {
    console.error('폴더에서 이미지 불러오기 실패:', error);
    return [];
  }
}

// ✅ 모든 글의 이미지 폴더에서 이미지 목록 가져오기 (최신순 정렬!)
export async function getAllGeneratedImagesFromFolders(): Promise<Array<{ postId: string; postTitle: string; images: any[]; mtime?: number }>> {
  try {
    // ✅ window.api를 통해 파일 시스템 접근
    if (!window.api.checkFileExists || !window.api.readDir) {
      console.error('[Image Folders] 파일 시스템 API가 없습니다.');
      return [];
    }

    const basePath = await getRequiredImageBasePath();

    try {
      // 폴더 존재 확인
      const baseExists = await window.api.checkFileExists(basePath);
      if (!baseExists) {
        console.log('[Image Folders] 이미지 폴더가 없습니다:', basePath);
        return [];
      }

      // ✅ 폴더 목록 읽기 (수정 시간 포함) - 최신순 정렬용
      let folders: string[] = [];
      const folderStats: Map<string, number> = new Map(); // 폴더명 → mtime

      if (window.api.readDirWithStats) {
        // ✅ 수정 시간과 함께 읽기
        const dirEntries = await window.api.readDirWithStats(basePath);
        if (dirEntries && dirEntries.length > 0) {
          // 디렉토리만 필터링하고 mtime으로 정렬 (최신순)
          const sortedDirs = dirEntries
            .filter(entry => entry.isDirectory)
            .sort((a, b) => b.mtime - a.mtime); // 최신이 먼저!

          folders = sortedDirs.map(entry => entry.name);
          sortedDirs.forEach(entry => folderStats.set(entry.name, entry.mtime));

          console.log('[Image Folders] ✅ 최신순 정렬 완료 (폴더 수:', folders.length, ')');
        }
      } else {
        // 폴백: 일반 readDir
        folders = await window.api.readDir(basePath);
      }

      if (!folders || folders.length === 0) {
        console.log('[Image Folders] 이미지 폴더가 비어있습니다.');
        return [];
      }

      const allImages: Array<{ postId: string; postTitle: string; images: any[]; mtime?: number }> = [];

      // 글 목록에서 제목 가져오기
      const posts = loadGeneratedPosts();

      for (const folderName of folders) {
        const folderPath = `${basePath}/${folderName}`.replace(/\\/g, '/');
        try {
          // 폴더 내 파일 목록 읽기
          const files = await window.api.readDir(folderPath);
          if (!files || files.length === 0) continue;

          const imageFiles = files.filter((f: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

          if (imageFiles.length > 0) {
            const post = posts.find(p => p.id === folderName);
            const images: any[] = [];

            for (const file of imageFiles) {
              const filePath = `${folderPath}/${file}`.replace(/\\/g, '/');
              try {
                // 파일 존재 확인
                const fileExists = await window.api.checkFileExists(filePath);
                if (!fileExists) continue;

                // 이미지를 Data URL로 변환 (브라우저에서 읽기 위해)
                const ext = file.split('.').pop()?.toLowerCase() || 'jpg';
                const previewDataUrl = `file:///${filePath}`;

                images.push({
                  heading: file.replace(/\.[^/.]+$/, ''),
                  filePath,
                  previewDataUrl,
                  provider: 'local',
                  savedToLocal: true,
                  url: filePath
                });
              } catch (err) {
                console.warn(`[Image Folders] 이미지 읽기 실패: ${file}`, err);
              }
            }

            if (images.length > 0) {
              allImages.push({
                postId: folderName,
                postTitle: post?.title || folderName,
                images,
                mtime: folderStats.get(folderName) || 0 // ✅ 수정 시간 저장
              });
            }
          }
        } catch (err) {
          console.warn(`[Image Folders] 폴더 읽기 실패: ${folderName}`, err);
        }
      }

      console.log(`[Image Folders] 총 ${allImages.length}개 폴더에서 이미지 발견`);
      return allImages;
    } catch (err) {
      console.error('[Image Folders] 폴더 스캔 실패:', err);
      return [];
    }
  } catch (error) {
    console.error('이미지 폴더 스캔 실패:', error);
    return [];
  }
}

// ✅ 저장된 이미지 관리 모달 (폴더 열기 + 이미지 불러오기)
export async function showLocalImageManagementModal(): Promise<void> {
  try {
    // 소제목 분석 여부 확인
    const headings = currentStructuredContent?.headings || [];
    const hasHeadings = headings.length > 0;

    // 모달 생성
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.8); z-index: 10000; display: flex;
      align-items: center; justify-content: center; padding: 2rem;
    `;

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border: 3px solid var(--primary); border-radius: 16px; padding: 2rem; max-width: 600px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
        <h2 style="color: var(--text-gold); margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 2rem;">💾</span>
          <span>저장된 이미지 관리</span>
        </h2>
        
        <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(6, 182, 212, 0.05)); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem;">
          <p style="color: var(--text-muted); margin-bottom: 1rem; line-height: 1.6;">
            이미지를 저장하거나 불러올 수 있습니다.
          </p>
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <button type="button" id="open-folder-btn" style="padding: 1rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              <span style="font-size: 1.25rem;">📂</span>
              <span>이미지 저장하러 가기 (새 폴더 생성)</span>
            </button>
            
            <button type="button" id="open-existing-folder-btn" style="padding: 1rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
              <span style="font-size: 1.25rem;">💾</span>
              <span>기존 폴더에 저장하기</span>
            </button>
            
            <button type="button" id="load-images-btn" ${!hasHeadings ? 'disabled' : ''} style="padding: 1rem; background: ${hasHeadings ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'var(--bg-tertiary)'}; color: ${hasHeadings ? 'white' : 'var(--text-muted)'}; border: none; border-radius: 8px; cursor: ${hasHeadings ? 'pointer' : 'not-allowed'}; font-weight: 600; font-size: 1rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; opacity: ${hasHeadings ? '1' : '0.5'};">
              <span style="font-size: 1.25rem;">🖼️</span>
              <span>이미지 불러오기</span>
            </button>
          </div>
          
          ${!hasHeadings ? `
            <div style="margin-top: 1rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); border: 2px solid rgba(239, 68, 68, 0.3); border-radius: 8px; color: var(--text-muted); font-size: 0.875rem;">
              ⚠️ 이미지를 불러오려면 먼저 소제목 분석을 완료해주세요.
            </div>
          ` : ''}
        </div>
        
        <div style="display: flex; gap: 1rem;">
          <button type="button" class="close-modal-btn" style="flex: 1; padding: 0.75rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">닫기</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 폴더 열기 버튼 (새 폴더 생성)
    const openFolderBtn = modal.querySelector('#open-folder-btn');
    if (openFolderBtn) {
      openFolderBtn.addEventListener('click', async () => {
        await openGeneratedImagesFolder();
      });
    }

    // 기존 폴더에 저장하기 버튼
    const openExistingFolderBtn = modal.querySelector('#open-existing-folder-btn');
    if (openExistingFolderBtn) {
      openExistingFolderBtn.addEventListener('click', async () => {
        await openExistingImageFolder();
      });
    }

    // 이미지 불러오기 버튼
    const loadImagesBtn = modal.querySelector('#load-images-btn');
    if (loadImagesBtn && hasHeadings) {
      loadImagesBtn.addEventListener('click', async () => {
        modal.remove();
        await showFolderSelectionModal();
      });
    }

    // 닫기 버튼
    const closeBtn = modal.querySelector('.close-modal-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.remove());
    }

    // 배경 클릭 시 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // ESC 키로 닫기
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', handleEsc); }
    };
    document.addEventListener('keydown', handleEsc);

  } catch (error) {
    console.error('[Local Image Modal] 모달 표시 실패:', error);
    alert(`모달을 표시할 수 없습니다: ${(error as Error).message}`);
  }
}

// ✅ 생성된 이미지 폴더 열기 (공통 함수) - 제목별 폴더 생성 확인
export async function openGeneratedImagesFolder(): Promise<void> {
  try {
    if (!window.api.openPath || !window.api.checkFileExists) {
      alert('파일 시스템 API가 없습니다.');
      return;
    }

    // 현재 글 제목 가져오기
    const titleInput = document.getElementById('image-title') as HTMLInputElement;
    const currentTitle = titleInput?.value?.trim() || currentStructuredContent?.selectedTitle || '';

    if (!currentTitle) {
      alert('먼저 글 제목을 입력하거나 콘텐츠를 생성해주세요.');
      return;
    }

    const basePath = await getRequiredImageBasePath();

    // 제목을 안전한 폴더명으로 변환
    const safeTitleFolder = currentTitle.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50).trim() || 'untitled';
    const imageFolderPath = `${basePath}/${safeTitleFolder}`.replace(/\\/g, '/');

    // ✅ 폴더 존재 확인
    const folderExists = await window.api.checkFileExists(imageFolderPath);

    if (!folderExists) {
      // 폴더가 없으면 생성 확인
      const confirmed = window.confirm(
        `"${safeTitleFolder}" 폴더가 없습니다.\n\n폴더를 생성하시겠습니까?\n\n경로: ${imageFolderPath}`
      );

      if (!confirmed) {
        appendLog('⚠️ 폴더 생성이 취소되었습니다.');
        return;
      }
    }

    // ✅ 폴더 열기 (없으면 자동 생성됨)
    const result = await window.api.openPath(imageFolderPath);

    if (result.success) {
      if (!folderExists) {
        toastManager.success(`✅ 폴더를 생성하고 열었습니다: ${safeTitleFolder}`);
        appendLog(`📂 폴더 생성 완료: ${imageFolderPath}`);
      } else {
        toastManager.success(`✅ 이미지 폴더를 열었습니다: ${safeTitleFolder}`);
        appendLog(`📂 이미지 폴더: ${imageFolderPath}`);
      }
    } else {
      // 폴백: 경로를 클립보드에 복사
      await navigator.clipboard.writeText(imageFolderPath);
      alert(`폴더 경로가 클립보드에 복사되었습니다:\n\n${imageFolderPath}\n\n탐색기에서 이 경로를 붙여넣고 폴더를 만들어주세요.`);
      appendLog(`📋 폴더 경로 복사: ${imageFolderPath}`);
    }
  } catch (error) {
    console.error('폴더 열기 실패:', error);
    alert(`폴더를 열 수 없습니다: ${(error as Error).message}`);
  }
}

// ✅ 기존 폴더에 저장하기 (AI 이미지 생성/수집으로 만들어진 폴더 열기)
export async function openExistingImageFolder(): Promise<void> {
  try {
    if (!window.api.openPath) {
      alert('파일 시스템 API가 없습니다.');
      return;
    }

    const basePath = await getRequiredImageBasePath();

    // 기존 폴더 목록 가져오기
    const dirEntries = await window.api.readDirWithStats?.(basePath);

    if (!dirEntries || dirEntries.length === 0) {
      alert('저장된 이미지 폴더가 없습니다.\n\n먼저 "이미지 저장하러 가기"를 눌러 이미지를 저장해주세요.');
      return;
    }

    // 폴더만 필터링
    const folders = dirEntries.filter((entry) => entry.isDirectory);

    if (folders.length === 0) {
      alert('저장된 이미지 폴더가 없습니다.\n\n먼저 "이미지 저장하러 가기"를 눌러 이미지를 저장해주세요.');
      return;
    }

    // 최신 폴더 찾기 (수정 시간 기준)
    const sortedFolders = folders.sort((a, b) => {
      return (b.mtime || 0) - (a.mtime || 0);
    });

    const latestFolder = sortedFolders[0];
    const folderPath = `${basePath}/${latestFolder.name}`.replace(/\\/g, '/');

    // 폴더 열기
    const result = await window.api.openPath(folderPath);

    if (result.success) {
      toastManager.success(`✅ 기존 폴더를 열었습니다: ${latestFolder.name}`);
      appendLog(`📂 기존 폴더 열기: ${folderPath}`);
    } else {
      alert(`폴더를 열 수 없습니다: ${result.message || '알 수 없는 오류'}`);
    }
  } catch (error) {
    console.error('기존 폴더 열기 실패:', error);
    alert(`폴더를 열 수 없습니다: ${(error as Error).message}`);
  }
}

// ✅ 폴더 선택 모달 (1단계)
export async function showFolderSelectionModal(options?: { onFolderSelected?: (folderName: string) => Promise<void> }): Promise<void> {
  try {
    if (!window.api.readDir || !window.api.checkFileExists) {
      alert('파일 시스템 API를 사용할 수 없습니다.');
      return;
    }

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.8); z-index: 10000; display: flex;
      align-items: center; justify-content: center; padding: 2rem;
    `;

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 16px; padding: 2rem; max-width: 900px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5); position: relative; display: flex; flex-direction: column;">
        <button type="button" class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s; z-index: 1;">✕</button>
        <h2 style="margin: 0 0 1rem 0; color: var(--text-gold); font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.75rem;">📁</span>
          <span>폴더 선택</span>
          <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 400; margin-left: auto;">불러오는 중...</span>
        </h2>
        <div style="flex: 1; display:flex; align-items:center; justify-content:center; color: var(--text-muted); font-weight: 600;">
          ⏳ 폴더 목록을 불러오는 중...
        </div>
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--border-light); display: flex; justify-content: flex-end;">
          <button type="button" class="close-modal-btn" style="padding: 0.6rem 1.25rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">닫기</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelectorAll('.close-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => modal.remove());
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    let basePath = '';
    try {
      basePath = await getRequiredImageBasePath();
    } catch (error) {
      const msg = (error as Error).message || '환경설정에서 이미지 저장 폴더를 먼저 선택해주세요.';
      modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 16px; padding: 2rem; max-width: 900px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5); position: relative; display: flex; flex-direction: column;">
          <button type="button" class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s; z-index: 1;">✕</button>
          <h2 style="margin: 0 0 1rem 0; color: var(--text-gold); font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.75rem;">📁</span>
            <span>폴더 선택</span>
          </h2>
          <div style="flex: 1; display:flex; align-items:center; justify-content:center; color: var(--text-muted); font-weight: 700; line-height: 1.6; text-align:center; padding: 2rem;">
            ${escapeHtml(msg)}
          </div>
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--border-light); display: flex; justify-content: flex-end;">
            <button type="button" class="close-modal-btn" style="padding: 0.6rem 1.25rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">닫기</button>
          </div>
        </div>
      `;
      modal.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
      });
      return;
    }

    appendLog(`📁 폴더 목록 확인 중: ${basePath}`);

    // 기본 경로 존재 확인
    const basePathExists = await window.api.checkFileExists(basePath);
    if (!basePathExists) {
      modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 16px; padding: 2rem; max-width: 900px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5); position: relative; display: flex; flex-direction: column;">
          <button type="button" class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s; z-index: 1;">✕</button>
          <h2 style="margin: 0 0 1rem 0; color: var(--text-gold); font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.75rem;">📁</span>
            <span>폴더 선택</span>
          </h2>
          <div style="flex: 1; display:flex; align-items:center; justify-content:center; color: var(--text-muted); font-weight: 700; line-height: 1.6; text-align:center; padding: 2rem;">
            이미지 폴더가 없습니다.<br/><br/>
            먼저 "이미지 저장하러 가기"를 눌러 폴더를 생성해주세요.<br/><br/>
            <span style="font-size: 0.85rem; color: var(--text-muted);">경로: ${escapeHtml(basePath)}</span>
          </div>
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--border-light); display: flex; justify-content: flex-end;">
            <button type="button" class="close-modal-btn" style="padding: 0.6rem 1.25rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">닫기</button>
          </div>
        </div>
      `;
      modal.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
      });
      return;
    }

    // 폴더 목록 읽기 (✅ 최신순 보장: readDirWithStats 우선)
    let folderList: string[] = [];
    try {
      if (typeof (window.api as any).readDirWithStats === 'function') {
        const dirEntries = await (window.api as any).readDirWithStats(basePath);
        if (Array.isArray(dirEntries) && dirEntries.length > 0) {
          folderList = dirEntries
            .filter((entry: any) => entry && entry.isDirectory)
            .sort((a: any, b: any) => (Number(b?.mtime || 0) - Number(a?.mtime || 0)))
            .map((entry: any) => String(entry?.name || '').trim())
            .filter((n: string) => n.length > 0);
        }
      }
    } catch {
      // ignore (fallback below)
    }

    if (folderList.length === 0) {
      const folders = await window.api.readDir(basePath);
      folderList = (folders || []).filter((item: string) => {
        // 파일은 제외하고 폴더만 (확장자가 없는 것들)
        return !/\.(jpg|jpeg|png|gif|webp|txt|json)$/i.test(item);
      });
    }

    if (folderList.length === 0) {
      modal.innerHTML = `
        <div style="background: var(--bg-primary); border-radius: 16px; padding: 2rem; max-width: 900px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5); position: relative; display: flex; flex-direction: column;">
          <button type="button" class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s; z-index: 1;">✕</button>
          <h2 style="margin: 0 0 1rem 0; color: var(--text-gold); font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.75rem;">📁</span>
            <span>폴더 선택</span>
          </h2>
          <div style="flex: 1; display:flex; align-items:center; justify-content:center; color: var(--text-muted); font-weight: 700; line-height: 1.6; text-align:center; padding: 2rem;">
            저장된 이미지 폴더가 없습니다.<br/><br/>
            먼저 "이미지 저장하러 가기"를 눌러 이미지를 저장해주세요.
          </div>
          <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--border-light); display: flex; justify-content: flex-end;">
            <button type="button" class="close-modal-btn" style="padding: 0.6rem 1.25rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">닫기</button>
          </div>
        </div>
      `;
      modal.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => modal.remove());
      });
      return;
    }

    // ✅ fallback 최신순 정렬 (날짜 형식 YYYY-MM-DD 기준 역순)
    // readDirWithStats를 못 쓰는 환경에서만 의미 있음
    if (!(typeof (window.api as any).readDirWithStats === 'function')) {
      folderList.sort((a: string, b: string) => {
        const dateA = a.match(/(\d{4}-\d{2}-\d{2})/);
        const dateB = b.match(/(\d{4}-\d{2}-\d{2})/);
        if (dateA && dateB) return dateB[1].localeCompare(dateA[1]);
        if (dateA) return -1;
        if (dateB) return 1;
        return b.localeCompare(a);
      });
    }

    appendLog(`✅ ${folderList.length}개의 폴더를 찾았습니다. (최신순 정렬)`);

    const renderFolderItem = (folder: string) => {
      const dateMatch = folder.match(/(\d{4}-\d{2}-\d{2})/);
      const dateLabel = dateMatch ? dateMatch[1] : '';
      const folderTitle = folder.replace(/^\d{4}-\d{2}-\d{2}_?/, '').trim() || folder;
      return `
        <div class="folder-item-wrapper" data-folder-name="${escapeHtml(folder)}" style="display: flex; align-items: center; gap: 0.5rem;">
          <button type="button" class="folder-item" data-folder-name="${escapeHtml(folder)}" style="flex: 1; min-width: 0; padding: 0.9rem 1rem; background: linear-gradient(135deg, var(--bg-secondary), var(--bg-tertiary)); border: 2px solid var(--border-light); border-radius: 12px; cursor: pointer; transition: all 0.2s; text-align: left; display: flex; align-items: center; gap: 0.75rem;">
            <span style="font-size: 1.5rem; line-height: 1;">📂</span>
            <div style="min-width:0; flex: 1;">
              <div style="display:flex; align-items:center; gap: 0.5rem;">
                ${dateLabel ? `<span style="background: rgba(99, 102, 241, 0.2); color: var(--primary); padding: 2px 6px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; white-space: nowrap;">${dateLabel}</span>` : ''}
                <span style="color: var(--text-strong); font-weight: 800; font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(folderTitle)}</span>
              </div>
              <div style="margin-top: 0.25rem; color: var(--text-muted); font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(folder)}</div>
            </div>
            <span style="color: var(--text-muted); font-weight: 900;">→</span>
          </button>
          <button type="button" class="folder-delete-btn" data-folder-name="${escapeHtml(folder)}" title="폴더 삭제" style="flex-shrink: 0; width: 36px; height: 36px; background: rgba(239, 68, 68, 0.15); border: 2px solid rgba(239, 68, 68, 0.3); border-radius: 10px; cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s; color: #ef4444;" onmouseover="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.color='white'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(239, 68, 68, 0.15)'; this.style.color='#ef4444'; this.style.transform='scale(1)';">🗑️</button>
        </div>
      `;
    };

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 16px; padding: 2rem; max-width: 900px; width: 90%; max-height: 85vh; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5); position: relative; display: flex; flex-direction: column;">
        <button type="button" class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s; z-index: 1;" onmouseover="this.style.background='rgba(220, 38, 38, 1)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)';">✕</button>
        <h2 style="margin: 0 0 1rem 0; color: var(--text-gold); font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.75rem;">📁</span>
          <span>폴더 선택</span>
          <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 400; margin-left: auto;">⬇️ 최신순</span>
        </h2>
        
        <!-- 검색창 -->
        <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; align-items: center;">
          <div style="flex: 1; position: relative;">
            <input type="text" id="folder-search-input" placeholder="폴더명 검색 (예: 바디프랜드, 2025-12-05)" style="width: 100%; padding: 0.6rem 0.75rem 0.6rem 2.25rem; background: var(--bg-tertiary); border: 2px solid var(--border-light); border-radius: 8px; color: var(--text-strong); font-size: 0.9rem;"/>
            <span style="position: absolute; left: 0.6rem; top: 50%; transform: translateY(-50%); font-size: 1rem;">🔍</span>
          </div>
          <span id="folder-count-label" style="color: var(--text-muted); font-size: 0.8rem; white-space: nowrap;">${folderList.length}개</span>
        </div>
        
        <div id="folder-grid" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.6rem; padding: 0.25rem;">
          ${folderList.map((f: string) => renderFolderItem(f)).join('')}
        </div>
        
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 2px solid var(--border-light); display: flex; justify-content: flex-end;">
          <button type="button" class="close-modal-btn" style="padding: 0.6rem 1.25rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600;">닫기</button>
        </div>
      </div>
    `;

    // 폴더 이벤트 등록 함수
    const attachFolderEvents = () => {
      modal.querySelectorAll('.folder-item').forEach(item => {
        item.addEventListener('click', async () => {
          const folderName = (item as HTMLElement).dataset.folderName;
          if (folderName) {
            modal.remove();
            if (typeof options?.onFolderSelected === 'function') {
              await options.onFolderSelected(folderName);
              return;
            }
            await showLocalImageSelectionModal(folderName);
          }
        });
        item.addEventListener('mouseenter', () => {
          (item as HTMLElement).style.borderColor = 'var(--primary)';
          (item as HTMLElement).style.transform = 'translateY(-2px)';
          (item as HTMLElement).style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.3)';
        });
        item.addEventListener('mouseleave', () => {
          (item as HTMLElement).style.borderColor = 'var(--border-light)';
          (item as HTMLElement).style.transform = 'translateY(0)';
          (item as HTMLElement).style.boxShadow = 'none';
        });
      });

      // ✅ [2026-03-14] 폴더 삭제 버튼 이벤트
      modal.querySelectorAll('.folder-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation(); // 부모 클릭 이벤트 전파 방지
          const folderName = (btn as HTMLElement).dataset.folderName;
          if (!folderName) return;

          const confirmed = confirm(`"${folderName}" 폴더를 삭제하시겠습니까?\n\n⚠️ 폴더 내 모든 이미지가 함께 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`);
          if (!confirmed) return;

          try {
            const separator = basePath.includes('/') ? '/' : '\\';
            const fullPath = basePath + separator + folderName;
            const success = await window.api.deleteFolder!(fullPath);
            if (success) {
              // DOM에서 해당 항목 제거
              const wrapper = (btn as HTMLElement).closest('.folder-item-wrapper');
              if (wrapper) {
                wrapper.remove();
              }
              // folderList에서도 제거
              const idx = folderList.indexOf(folderName);
              if (idx !== -1) folderList.splice(idx, 1);
              // 카운트 업데이트
              const countEl = modal.querySelector('#folder-count-label') as HTMLSpanElement;
              if (countEl) countEl.textContent = `${folderList.length}개`;
              appendLog(`✅ "${folderName}" 폴더가 삭제되었습니다.`);
            } else {
              alert(`폴더 삭제에 실패했습니다: ${folderName}`);
            }
          } catch (err) {
            alert(`폴더 삭제 중 오류가 발생했습니다: ${(err as Error).message}`);
          }
        });
      });
    };

    // 초기 이벤트 등록
    attachFolderEvents();

    // ✅ 검색 기능
    const searchInput = modal.querySelector('#folder-search-input') as HTMLInputElement;
    const folderGrid = modal.querySelector('#folder-grid') as HTMLDivElement;
    const countLabel = modal.querySelector('#folder-count-label') as HTMLSpanElement;

    searchInput?.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      const filtered = query === '' ? folderList : folderList.filter((f: string) => f.toLowerCase().includes(query));
      folderGrid.innerHTML = filtered.map((f: string) => renderFolderItem(f)).join('');
      countLabel.textContent = `${filtered.length}개`;
      attachFolderEvents();
    });

    // ESC 키로 닫기
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', handleEsc); }
    };
    document.addEventListener('keydown', handleEsc);
    setTimeout(() => searchInput?.focus(), 100);

    // 닫기 버튼
    modal.querySelectorAll('.close-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => modal.remove());
    });

  } catch (error) {
    console.error('폴더 선택 모달 오류:', error);
    alert(`폴더 목록을 불러올 수 없습니다: ${(error as Error).message}`);
  }
}

// ✅ 저장된 이미지 선택 모달 (2단계 - 소제목별 배치)
export async function showLocalImageSelectionModal(folderName?: string): Promise<void> {
  try {
    // 글 제목별 폴더 경로
    if (!window.api.getUserHomeDir || !window.api.readDir || !window.api.checkFileExists) {
      appendLog('⚠️ 파일 시스템 API를 사용할 수 없습니다.');
      alert('파일 시스템 API를 사용할 수 없습니다.');
      return;
    }

    const basePath = await getRequiredImageBasePath();

    // 폴더명이 제공되지 않으면 현재 글 제목 사용 (하위 호환성)
    let safeTitleFolder: string;
    if (folderName) {
      safeTitleFolder = folderName;
    } else {
      const titleInput = document.getElementById('image-title') as HTMLInputElement;
      const currentTitle = titleInput?.value?.trim() || currentStructuredContent?.selectedTitle || '제목 없음';
      safeTitleFolder = currentTitle.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50).trim() || 'untitled';
    }

    const folderPath = `${basePath}/${safeTitleFolder}`.replace(/\\/g, '/');

    appendLog(`📁 폴더 확인 중: ${safeTitleFolder}`);

    // 폴더 존재 확인
    const folderExists = await window.api.checkFileExists(folderPath);
    if (!folderExists) {
      appendLog('⚠️ 이미지 폴더가 존재하지 않습니다.');
      alert(`"${safeTitleFolder}" 폴더에 이미지가 없습니다.\n\n먼저 "이미지 저장하러 가기" 버튼을 눌러 이미지를 저장해주세요.`);
      return;
    }

    // 폴더 내 이미지 파일 읽기
    const files = await window.api.readDir(folderPath);
    const imageFiles = files.filter((f: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

    if (imageFiles.length === 0) {
      alert(`"${safeTitleFolder}" 폴더에 이미지가 없습니다.\n\n이미지를 폴더에 저장한 후 다시 시도해주세요.`);
      if (window.api.openPath) {
        await window.api.openPath(folderPath);
      }
      return;
    }

    appendLog(`✅ ${imageFiles.length}개의 이미지를 찾았습니다.`);

    // 소제목 목록 가져오기
    const headings = currentStructuredContent?.headings || [];
    if (headings.length === 0) {
      alert('먼저 소제목을 분석해주세요.');
      return;
    }

    // 모달 생성
    const modal = document.createElement('div');
    modal.setAttribute('data-modal-type', 'local-image-selection');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7); z-index: 10000; display: flex;
      align-items: center; justify-content: center; padding: 2rem;
    `;

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 12px; padding: 2rem; max-width: 1200px; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.3); position: relative;">
        <button type="button" class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s;" onmouseover="this.style.background='rgba(220, 38, 38, 1)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)';">✕</button>
        <h2 style="margin: 0 0 1rem 0; color: var(--text-strong); font-size: 1.5rem;">💾 저장된 이미지 선택</h2>
        <div style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1.5rem;">
          폴더: ${safeTitleFolder} (${imageFiles.length}개 이미지)
        </div>
        
        <!-- 모드 전환 버튼 -->
        <div style="margin-bottom: 1.5rem; padding: 1rem; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05)); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 12px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem;">
            <div style="flex: 1;">
              <div id="mode-status-text" style="font-size: 0.9rem; color: var(--text-muted); font-weight: 500;">일반 모드 - 이미지를 클릭하고 소제목을 선택하세요</div>
            </div>
            <button type="button" id="mode-toggle-btn" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; white-space: nowrap; transition: all 0.2s;">
              🚀 순서대로 배치 모드
            </button>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;">
            💡 <strong>순서대로 배치 모드:</strong> 이미지를 클릭한 순서대로 소제목 1, 2, 3... 에 자동 배치됩니다! (재클릭 시 취소)
          </div>
          <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--accent); line-height: 1.4;">
            🎨 <strong>하이브리드 모드:</strong> 일부만 선택하고 나머지는 AI/Pexels 이미지 자동 생성됩니다!
          </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
          ${imageFiles.map((file: string, index: number) => {
      const filePath = `${folderPath}/${file}`.replace(/\\/g, '/');
      return `
              <div class="local-image-item" data-file-path="${filePath}" data-file-name="${file}" style="border: 2px solid var(--border-light); border-radius: 8px; overflow: hidden; cursor: pointer; transition: all 0.2s; background: var(--bg-secondary); position: relative;">
                <div style="aspect-ratio: 1; background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center; overflow: hidden;">
                  <img src="file:///${filePath}" alt="${file}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='<span style=\\'color: var(--text-muted); font-size: 2rem;\\'>🖼️</span>';">
                </div>
                <div style="padding: 0.5rem; font-size: 0.75rem; color: var(--text-muted); text-align: center; word-break: break-all;">${file}</div>
              </div>
            `;
    }).join('')}
        </div>
        
        <div style="border-top: 2px solid var(--border-light); padding-top: 1.5rem;">
          <h3 style="margin: 0 0 0.5rem 0; color: var(--text-strong); font-size: 1.1rem;">소제목 선택 (일반 모드용)</h3>
          <p style="margin: 0 0 1rem 0; font-size: 0.85rem; color: var(--text-muted);">💡 이미지를 선택한 후 소제목을 클릭하세요. 이미 배치된 이미지는 교체됩니다.</p>
          <div id="heading-selection-list" style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${headings.map((heading: any, index: number) => {
      const headingTitle = heading.title || heading;
      const hasImage = ImageManager.hasImage(headingTitle);
      const buttonStyle = hasImage
        ? 'padding: 0.75rem 1rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: 2px solid #10b981; border-radius: 8px; cursor: pointer; text-align: left; transition: all 0.2s; font-size: 0.9rem; font-weight: 600;'
        : 'padding: 0.75rem 1rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; text-align: left; cursor: pointer; transition: all 0.2s; font-weight: 500;';
      const iconPrefix = hasImage ? '✅ ' : '';
      return `
              <button type="button" class="heading-select-btn" data-heading-index="${index}" style="${buttonStyle}">
                ${iconPrefix}${index + 1}. ${headingTitle}
              </button>
            `;
    }).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // ✅ 순서대로 클릭 모드 변수
    let clickOrderMode = false;
    let clickedImages: Array<{ path: string; name: string }> = [];
    let nextHeadingIndex = 0;

    // ✅ 모드 전환 버튼
    const modeToggleBtn = modal.querySelector('#mode-toggle-btn');
    const modeStatusText = modal.querySelector('#mode-status-text');

    if (modeToggleBtn) {
      modeToggleBtn.addEventListener('click', () => {
        clickOrderMode = !clickOrderMode;
        clickedImages = [];
        nextHeadingIndex = 0;

        // UI 업데이트
        if (modeStatusText) {
          if (clickOrderMode) {
            modeStatusText.textContent = '✅ 순서 모드 활성화 - 이미지를 순서대로 클릭하세요!';
            (modeStatusText as HTMLElement).style.color = '#10b981';
            (modeToggleBtn as HTMLElement).textContent = '🔄 일반 모드로 전환';
            (modeToggleBtn as HTMLElement).style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
          } else {
            modeStatusText.textContent = '일반 모드 - 이미지를 클릭하고 소제목을 선택하세요';
            (modeStatusText as HTMLElement).style.color = 'var(--text-muted)';
            (modeToggleBtn as HTMLElement).textContent = '🚀 순서대로 배치 모드';
            (modeToggleBtn as HTMLElement).style.background = 'linear-gradient(135deg, #10b981, #059669)';
          }
        }

        // 모든 이미지 선택 해제
        modal.querySelectorAll('.local-image-item').forEach(i => {
          (i as HTMLElement).style.borderColor = 'var(--border-light)';
          (i as HTMLElement).style.borderWidth = '2px';
          const badge = (i as HTMLElement).querySelector('.order-badge');
          if (badge) badge.remove();
        });
      });
    }

    // 이벤트 리스너
    let selectedImagePath: string | null = null;
    let selectedImageName: string | null = null;

    // 이미지 선택
    modal.querySelectorAll('.local-image-item').forEach(item => {
      item.addEventListener('click', async () => {
        // ✅ 순서 모드인 경우
        if (clickOrderMode) {
          if (nextHeadingIndex >= headings.length) {
            alert(`모든 소제목(${headings.length}개)에 이미지가 배치되었습니다!`);
            return;
          }

          const imagePath = (item as HTMLElement).dataset.filePath;
          const imageName = (item as HTMLElement).dataset.fileName;

          if (!imagePath || !imageName) return;

          // 이미 클릭된 이미지인지 확인 (취소 가능)
          const existingIndex = clickedImages.findIndex(img => img.path === imagePath);

          if (existingIndex >= 0) {
            // 이미 선택된 이미지 → 취소
            clickedImages.splice(existingIndex, 1);

            // 배지 제거
            const badge = (item as HTMLElement).querySelector('.order-badge');
            if (badge) badge.remove();

            // 테두리 초기화
            (item as HTMLElement).style.borderColor = 'var(--border-light)';
            (item as HTMLElement).style.borderWidth = '2px';
            (item as HTMLElement).style.boxShadow = 'none';

            // 순서 재정렬
            modal.querySelectorAll('.order-badge').forEach((b, idx) => {
              (b as HTMLElement).textContent = (idx + 1).toString();
            });

            nextHeadingIndex = clickedImages.length;

            toastManager.info(`❌ 선택 취소: ${imageName}`);
            appendLog(`❌ 이미지 선택 취소: "${imageName}"`);
            return;
          }

          // 새로 선택
          clickedImages.push({ path: imagePath, name: imageName });

          // 순서 배지 추가
          const badge = document.createElement('div');
          badge.className = 'order-badge';
          badge.style.cssText = `
            position: absolute; top: 0.5rem; right: 0.5rem;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white; border-radius: 50%; width: 32px; height: 32px;
            display: flex; align-items: center; justify-content: center;
            font-weight: bold; font-size: 1rem; z-index: 10;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          `;
          badge.textContent = (nextHeadingIndex + 1).toString();
          (item as HTMLElement).appendChild(badge);

          // 테두리 강조
          (item as HTMLElement).style.borderColor = '#10b981';
          (item as HTMLElement).style.borderWidth = '3px';
          (item as HTMLElement).style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.3)';

          // 소제목에 배치
          const heading = headings[nextHeadingIndex];
          const headingTitle = typeof heading === 'string' ? heading : (heading.title || '');

          const newImage = {
            heading: headingTitle,
            filePath: imagePath,
            previewDataUrl: `file:///${imagePath}`,
            provider: 'local' as any,
            savedToLocal: true,
            url: `file:///${imagePath}`
          };

          try {
            // ✅ 순서 모드에서도 소제목당 여러 장 누적 지원
            ImageManager.addImage(headingTitle, newImage);

            try {
              syncGlobalImagesFromImageManager();
            } catch (e) {
              console.warn('[localImageModals] catch ignored:', e);
            }

            appendLog(`✅ [${nextHeadingIndex + 1}/${headings.length}] "${imageName}" → "${headingTitle}"`);
            toastManager.success(`✅ ${nextHeadingIndex + 1}번 소제목에 배치 완료!`);

            nextHeadingIndex++;

            // 모든 소제목에 배치 완료
            if (nextHeadingIndex >= headings.length) {
              const allImages = (() => {
                try {
                  return ImageManager.getAllImages();
                } catch {
                  return (window as any).imageManagementGeneratedImages || generatedImages || [];
                }
              })();
              displayGeneratedImages(allImages);
              updatePromptItemsWithImages(allImages);

              alert(`🎉 모든 소제목에 이미지 배치 완료!\n\n총 ${headings.length}개 이미지가 배치되었습니다.`);
              modal.remove();
            }
          } catch (e) {
            // ✅ [2026-03-22 FIX] addImage 실패 시 완전 롤백 → 재시도 가능
            console.error('[localImageModals] 순서 모드 이미지 배치 실패:', e);
            appendLog(`❌ 이미지 배치 실패: ${(e as Error).message}`);
            toastManager.error('이미지 배치에 실패했습니다. 다시 클릭해주세요.');

            // 배지 제거
            const addedBadge = (item as HTMLElement).querySelector('.order-badge');
            if (addedBadge) addedBadge.remove();

            // 테두리 초기화
            (item as HTMLElement).style.borderColor = 'var(--border-light)';
            (item as HTMLElement).style.borderWidth = '2px';
            (item as HTMLElement).style.boxShadow = 'none';

            // clickedImages 롤백
            clickedImages.pop();
          }

          return;
        }

        // ✅ 일반 모드인 경우
        // 이전 선택 해제
        modal.querySelectorAll('.local-image-item').forEach(i => {
          (i as HTMLElement).style.borderColor = 'var(--border-light)';
          (i as HTMLElement).style.borderWidth = '2px';
        });

        // 현재 선택
        (item as HTMLElement).style.borderColor = 'var(--primary)';
        (item as HTMLElement).style.borderWidth = '3px';
        selectedImagePath = (item as HTMLElement).dataset.filePath || null;
        selectedImageName = (item as HTMLElement).dataset.fileName || null;
      });
    });

    // 소제목 선택 (이미지 배치) - 일반 모드용
    modal.querySelectorAll('.heading-select-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (clickOrderMode) {
          alert('순서 모드에서는 이미지를 클릭하면 자동으로 배치됩니다!');
          return;
        }

        const headingIndex = parseInt((btn as HTMLElement).dataset.headingIndex || '0');
        const heading = headings[headingIndex];
        const headingTitle = typeof heading === 'string' ? heading : (heading.title || '');

        // ✅ 이미 배치된 소제목인지 확인 (ImageManager 사용)
        const isAlreadyPlaced = ImageManager.hasImage(headingTitle);

        // ✅ 이미 배치된 소제목을 다시 클릭하면 취소 처리
        if (isAlreadyPlaced) {
          // 배치된 소제목 클릭 → 취소
          const existingImage = ImageManager.getImage(headingTitle);
          const removedImageName = existingImage?.filePath?.split('/').pop() || '이미지';

          ImageManager.removeImage(headingTitle);
          appendLog(`❌ ${headingIndex + 1}번 소제목 "${headingTitle}"의 이미지 배치 취소: "${removedImageName}"`);

          toastManager.success(`❌ ${headingIndex + 1}번 소제목 이미지 배치 취소 완료!`);

          // ✅ 이미지가 선택되어 있으면 취소 후 바로 새 이미지 배치
          if (selectedImagePath && selectedImageName) {
            // 잠시 후 새 이미지 배치 (UI 업데이트 후)
            const imagePath = selectedImagePath; // 타입 단언을 위한 변수
            const imageName = selectedImageName;
            setTimeout(() => {
              try {
                const newImage = {
                  heading: headingTitle,
                  filePath: imagePath,
                  previewDataUrl: `file:///${imagePath}`,
                  provider: 'local' as any,
                  savedToLocal: true,
                  url: `file:///${imagePath}`
                };

                // ✅ [2026-03-22 FIX] 기존 대표 이미지 보존: addImage로 추가
                if (ImageManager.hasImage(headingTitle)) {
                  ImageManager.addImage(headingTitle, newImage);
                } else {
                  ImageManager.setImage(headingTitle, newImage);
                }
                appendLog(`✅ "${imageName}"을(를) ${headingIndex + 1}번 소제목 "${headingTitle}"에 배치했습니다.`);
                toastManager.success(`✅ ${headingIndex + 1}번 소제목에 새 이미지 배치 완료!`);
              } catch (err) {
                console.error('[localImageModals] 이미지 재배치 실패:', err);
                appendLog(`❌ 이미지 재배치 실패: ${(err as Error).message}`);
                toastManager.error('이미지 배치에 실패했습니다. 다시 시도해주세요.');
              } finally {
                // ✅ 성공/실패 관계없이 선택 상태 초기화 → 재시도 가능
                modal.querySelectorAll('.local-image-item').forEach(i => {
                  (i as HTMLElement).style.borderColor = 'var(--border-light)';
                  (i as HTMLElement).style.borderWidth = '2px';
                });
                selectedImagePath = null;
                selectedImageName = null;
              }
            }, 100);
          }
          return;
        }

        // 이미지가 선택되지 않았으면 경고
        if (!selectedImagePath || !selectedImageName) {
          alert('먼저 이미지를 선택해주세요.');
          return;
        }

        // 새 이미지 객체 생성
        const newImage = {
          heading: headingTitle,
          filePath: selectedImagePath,
          previewDataUrl: `file:///${selectedImagePath}`,
          provider: 'local' as any,
          savedToLocal: true,
          url: `file:///${selectedImagePath}`
        };

        // ✅ ImageManager를 통해 이미지 추가 또는 설정
        const existingImage = ImageManager.getImage(headingTitle);
        const isAdding = existingImage !== null;

        if (isAdding) {
          appendLog(`➕ ${headingIndex + 1}번 소제목에 이미지 추가: "${selectedImageName}" (대표 이미지 유지)`);
        } else {
          appendLog(`✅ "${selectedImageName}"을(를) ${headingIndex + 1}번 소제목 "${headingTitle}"에 배치했습니다.`);
        }

        try {
          // ✅ [2026-03-22 FIX] 기존 대표 이미지 보존: addImage로 추가
          if (ImageManager.hasImage(headingTitle)) {
            ImageManager.addImage(headingTitle, newImage);
          } else {
            ImageManager.setImage(headingTitle, newImage);
          }

          syncGlobalImagesFromImageManager();

          // 소제목 번호
          const headingNumber = headingIndex + 1;

          // ✅ 시각적 알림
          if (isAdding) {
            toastManager.success(`➕ ${headingNumber}번 소제목에 이미지 추가 완료!`);
            alert(`➕ 이미지 추가 완료!\n\n📍 위치: ${headingNumber}번 소제목\n📝 제목: ${headingTitle}\n🖼️ 추가 이미지: ${selectedImageName}\n💡 대표 이미지는 유지됩니다.`);
          } else {
            toastManager.success(`✅ ${headingNumber}번 소제목에 이미지 배치 완료!`);
            alert(`✅ 이미지 배치 완료!\n\n📍 위치: ${headingNumber}번 소제목\n📝 제목: ${headingTitle}\n🖼️ 이미지: ${selectedImageName}`);
          }
        } catch (err) {
          console.error('[localImageModals] 이미지 배치 실패:', err);
          appendLog(`❌ 이미지 배치 실패: ${(err as Error).message}`);
          toastManager.error('이미지 배치에 실패했습니다. 다시 시도해주세요.');
        } finally {
          // ✅ 성공/실패 관계없이 선택 상태 초기화 → 재시도 가능
          modal.querySelectorAll('.local-image-item').forEach(i => {
            (i as HTMLElement).style.borderColor = 'var(--border-light)';
            (i as HTMLElement).style.borderWidth = '2px';
          });
          selectedImagePath = null;
          selectedImageName = null;
        }
      });
    });

    // 닫기 버튼
    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // 배경 클릭 시 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // ESC 키로 닫기
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { document.body.removeChild(modal); document.removeEventListener('keydown', handleEsc); }
    };
    document.addEventListener('keydown', handleEsc);

  } catch (error) {
    console.error('저장된 이미지 선택 실패:', error);
    alert(`이미지 선택 중 오류가 발생했습니다: ${(error as Error).message}`);
  }
}

// ✅ 생성된 이미지 폴더에서 이미지 불러오기 모달 (개선 버전: 최신순 정렬, 날짜별 그룹화, 검색)
export async function showLoadImagesFromFoldersModal(): Promise<void> {
  try {
    appendLog('📁 생성된 이미지 폴더를 스캔 중...');
    let allImages: any[] = [];
    try {
      allImages = await getAllGeneratedImagesFromFolders();
    } catch (e) {
      const msg = (e as Error).message || '환경설정에서 이미지 저장 폴더를 먼저 선택해주세요.';
      toastManager.error(msg);
      appendLog(`❌ 이미지 폴더 스캔 실패: ${msg}`);
      return;
    }

    // ✅ 폴더가 없으면 안내 후 폴더 선택 다이얼로그 열기 (설정 변경 안함)
    if (allImages.length === 0) {
      const basePath = await getRequiredImageBasePath();
      toastManager.warning('설정된 이미지 폴더에 저장된 이미지가 없습니다. 먼저 이미지를 저장한 뒤 다시 시도하세요.');
      appendLog(`⚠️ 이미지 폴더가 비어있습니다: ${basePath}`);
      return;
    }

    // ✅ 최신순 정렬 (mtime -> createdAt -> postId)
    const sortedImages = [...allImages].sort((a: any, b: any) => {
      const mA = Number(a?.mtime || 0);
      const mB = Number(b?.mtime || 0);
      if (mA !== mB) return mB - mA;
      const cA = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cB = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (cA !== cB) return cB - cA;
      const pA = parseInt(String(a?.postId || '0'), 10) || 0;
      const pB = parseInt(String(b?.postId || '0'), 10) || 0;
      return pB - pA;
    });

    // ✅ 날짜별 그룹화
    const groupedByDate: { [key: string]: any[] } = {};
    sortedImages.forEach((item: any) => {
      let dateKey = '기타';
      if (item.createdAt) {
        const date = new Date(item.createdAt);
        dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      } else if (item.postId) {
        // postId에서 날짜 추출 시도 (타임스탬프 형식인 경우)
        const timestamp = parseInt(item.postId);
        if (timestamp > 1600000000000) { // 2020년 이후 타임스탬프
          const date = new Date(timestamp);
          dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }
      }
      if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
      groupedByDate[dateKey].push(item);
    });

    // 날짜 키 정렬 (최신순)
    const sortedDateKeys = Object.keys(groupedByDate).sort((a, b) => {
      if (a === '기타') return 1;
      if (b === '기타') return -1;
      return b.localeCompare(a);
    });

    const totalImages = sortedImages.reduce((sum, item) => sum + item.images.length, 0);

    // 폴더 아이템 HTML 생성 함수 (✅ HTML 이스케이프 적용)
    const renderFolderItem = (item: any) => {
      const safeTitle = escapeHtml(item.postTitle || '');
      // ✅ 모든 특수문자 이스케이프 (< > " ' &)
      const safeTitleLower = escapeHtml((item.postTitle || '').toLowerCase());
      const safePostId = escapeHtml(item.postId || '');
      return `
      <div class="folder-item" data-post-id="${safePostId}" data-title="${safeTitleLower}" style="padding: 1rem; background: var(--bg-secondary); border-radius: 8px; border: 2px solid var(--border-light); transition: all 0.2s; cursor: pointer;" onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='translateY(-2px)';" onmouseout="this.style.borderColor='var(--border-light)'; this.style.transform='translateY(0)';">
        <div style="display: flex; align-items: start; justify-content: space-between; margin-bottom: 0.75rem;">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${safeTitle}">${safeTitle}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${item.images.length}개 이미지</div>
          </div>
          <button type="button" class="load-folder-images-btn" data-post-id="${safePostId}" style="padding: 0.5rem 1rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.8rem; white-space: nowrap; font-weight: 600;">불러오기</button>
        </div>
        <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;">
          ${item.images.slice(0, 6).filter((img: any) => img).map((img: any) => `
            <div style="aspect-ratio: 1; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
              <img src="${toFileUrlMaybe(img.previewDataUrl || img.filePath || img.url || '')}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'; this.parentElement.innerHTML='🖼️';">
            </div>
          `).join('')}
          ${item.images.length > 6 ? `<div style="aspect-ratio: 1; background: var(--bg-tertiary); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; color: var(--text-muted);">+${item.images.length - 6}</div>` : ''}
        </div>
      </div>
    `;
    };

    // 모달 생성
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.8); z-index: 10000; display: flex;
      align-items: center; justify-content: center; padding: 1rem;
    `;

    modal.innerHTML = `
      <div style="background: var(--bg-primary); border-radius: 16px; padding: 1.5rem; max-width: 800px; width: 95%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.4); position: relative;">
        <button type="button" class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: all 0.2s; z-index: 10;" onmouseover="this.style.background='rgba(220, 38, 38, 1)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(239, 68, 68, 0.9)'; this.style.transform='scale(1)';">✕</button>
        
        <h2 style="margin: 0 0 0.5rem 0; color: var(--text-strong); font-size: 1.3rem; display: flex; align-items: center; gap: 0.5rem;">
          📁 폴더 선택
        </h2>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
          이미지를 불러올 폴더를 선택하세요 (${sortedImages.length}개 폴더)
        </div>
        
        <!-- 검색 바 + 폴더 경로 변경 버튼 -->
        <div style="margin-bottom: 1rem; display: flex; gap: 0.5rem; align-items: center;">
          <div style="flex: 1; position: relative;">
            <input type="text" id="folder-search-input" placeholder="🔍 폴더 제목 검색..." style="width: 100%; padding: 0.75rem 1rem 0.75rem 2.5rem; background: var(--bg-secondary); border: 2px solid var(--border-light); border-radius: 10px; color: var(--text-strong); font-size: 0.9rem; transition: border-color 0.2s;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border-light)'">
            <span style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); font-size: 1rem;">🔍</span>
          </div>
          <button type="button" id="change-folder-path-btn" style="padding: 0.75rem 1rem; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 0.85rem; white-space: nowrap; display: flex; align-items: center; gap: 0.4rem;">📂 경로 변경</button>
        </div>
        
        <!-- 폴더 목록 (날짜별 그룹) -->
        <div id="folders-container" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 1.5rem;">
          ${sortedDateKeys.map(dateKey => `
            <div class="date-group" data-date="${dateKey}">
              <div style="font-weight: 700; color: var(--primary); font-size: 0.9rem; margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(59, 130, 246, 0.1); border-radius: 8px; display: inline-block;">
                📅 ${dateKey === '기타' ? '기타' : dateKey}
                <span style="font-weight: 400; color: var(--text-muted); margin-left: 0.5rem;">(${groupedByDate[dateKey].length}개)</span>
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 0.75rem;">
                ${groupedByDate[dateKey].map(item => renderFolderItem(item)).join('')}
              </div>
            </div>
          `).join('')}
        </div>
        
        <!-- 하단 정보 -->
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-light); display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 0.8rem; color: var(--text-muted);">
            총 ${totalImages}개의 이미지
          </div>
          <button type="button" class="close-modal-btn" style="padding: 0.6rem 1.5rem; background: var(--bg-tertiary); color: var(--text-strong); border: 1px solid var(--border-light); border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 0.85rem;">닫기</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 검색 기능
    const searchInput = modal.querySelector('#folder-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      const folderItems = modal.querySelectorAll('.folder-item');
      const dateGroups = modal.querySelectorAll('.date-group');

      folderItems.forEach(item => {
        const title = item.getAttribute('data-title') || '';
        const matches = query === '' || title.includes(query);
        (item as HTMLElement).style.display = matches ? 'block' : 'none';
      });

      // 빈 그룹 숨기기
      dateGroups.forEach(group => {
        const visibleItems = group.querySelectorAll('.folder-item[style*="display: block"], .folder-item:not([style*="display: none"])');
        const hasVisible = Array.from(group.querySelectorAll('.folder-item')).some(item => {
          const style = (item as HTMLElement).style.display;
          return style !== 'none';
        });
        (group as HTMLElement).style.display = hasVisible ? 'block' : 'none';
      });
    });

    // 닫기 버튼
    modal.querySelectorAll('.close-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => modal.remove());
    });

    // ✅ 폴더 경로 변경 버튼
    const changeFolderPathBtn = modal.querySelector('#change-folder-path-btn');
    if (changeFolderPathBtn) {
      changeFolderPathBtn.addEventListener('click', async () => {
        // ✅ [v2.7.60] 사용자 보고 — 변경 클릭 시 다이얼로그 안 뜸
        //   원인 후보: modal z-index 위에 다이얼로그 가려짐 / mainWindow 포커스 잃음
        //   조치: 진단 로그 + 메인 dialog handler에 focus() 강제
        console.log('[ChangeFolderPath] 🖱️ 클릭 감지 — showOpenDialog 호출 직전');
        try {
          if (!window.api.showOpenDialog) {
            console.error('[ChangeFolderPath] ❌ window.api.showOpenDialog 미정의');
            alert('폴더 선택 기능을 사용할 수 없습니다.');
            return;
          }

          const result = await window.api.showOpenDialog({
            properties: ['openDirectory', 'createDirectory'],
            title: '이미지 저장 폴더 선택',
            buttonLabel: '선택'
          });
          console.log('[ChangeFolderPath] ✅ 다이얼로그 응답:', result);

          if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0].replace(/\\/g, '/');

            // 설정에 저장
            try {
              const config = await window.api.getConfig();
              config.customImageSavePath = selectedPath;
              await window.api.saveConfig(config);

              toastManager.success(`✅ 이미지 경로가 변경되었습니다: ${selectedPath}`);
              appendLog(`📁 이미지 저장 경로 변경: ${selectedPath}`);

              // 모달 닫고 다시 열기 (새 경로로 스캔)
              modal.remove();
              await showLoadImagesFromFoldersModal();
            } catch (saveError) {
              console.error('설정 저장 실패:', saveError);
              toastManager.error('경로 설정 저장에 실패했습니다.');
            }
          }
        } catch (error) {
          console.error('폴더 경로 변경 오류:', error);
          alert(`폴더 경로 변경 중 오류가 발생했습니다: ${(error as Error).message}`);
        }
      });
    }

    // 폴더 이미지 불러오기 버튼 → 클릭 순서대로 배치 모달 열기
    modal.querySelectorAll('.load-folder-images-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const postId = (e.target as HTMLElement).getAttribute('data-post-id');
        if (postId) {
          const folderImages = await loadImagesFromFolder(postId);
          if (folderImages.length > 0) {
            modal.remove(); // 폴더 선택 모달 닫기
            // ✅ 클릭 순서대로 배치하는 모달 열기
            await showImagePlacementModal(folderImages);
          } else {
            toastManager.error('이 폴더에서 이미지를 찾을 수 없습니다.');
          }
        }
      });
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // ESC 키로 닫기
    const handleEscLoad = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', handleEscLoad); }
    };
    document.addEventListener('keydown', handleEscLoad);

    appendLog(`📁 ${sortedImages.length}개의 글 폴더에서 ${totalImages}개의 이미지를 찾았습니다.`);
  } catch (error) {
    console.error('이미지 폴더 모달 표시 실패:', error);
    appendLog(`❌ 이미지 폴더 스캔 실패: ${(error as Error).message}`);
    toastManager.error(`이미지 폴더를 불러오는 중 오류가 발생했습니다.`);
  }
}

/**
 * ✅ 클릭 순서대로 소제목에 이미지 배치하는 모달
 * - 이미지 클릭 → 순서대로 소제목 배치
 * - 다시 클릭 → 배치 취소
 * - 하단 소제목별 배치 현황 표시
 * - 소제목 클릭 → 배치 취소
 * - 영어 프롬프트 미리보기 & 생성 이미지 연동
 */
export async function showImagePlacementModal(folderImages: any[]): Promise<void> {
  // 현재 소제목 목록 가져오기
  const headings = currentStructuredContent?.headings || [];
  if (headings.length === 0) {
    toastManager.error('먼저 소제목 분석을 해주세요.');
    return;
  }

  // 배치 상태 관리 (소제목 인덱스 → 이미지 인덱스)
  const placements: Map<number, number> = new Map();
  // 이미지 사용 상태 (이미지 인덱스 → 소제목 인덱스)
  const imageUsage: Map<number, number> = new Map();
  // 다음 배치할 소제목 인덱스
  let nextHeadingIndex = 0;

  // 모달 생성
  const modal = document.createElement('div');
  modal.id = 'image-placement-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.85); z-index: 10001; display: flex;
    align-items: center; justify-content: center; padding: 1rem;
  `;

  // 다음 배치할 소제목 찾기
  const getNextAvailableHeadingIndex = () => {
    for (let i = 0; i < headings.length; i++) {
      if (!placements.has(i)) return i;
    }
    return -1; // 모든 소제목에 이미지 배치됨
  };

  // 배치 현황 렌더링 (✅ HTML 이스케이프 적용)
  const renderPlacementStatus = () => {
    const statusContainer = modal.querySelector('#placement-status');
    if (!statusContainer) return;

    statusContainer.innerHTML = headings.map((h: any, idx: number) => {
      const imgIdx = placements.get(idx);
      const hasImage = imgIdx !== undefined;
      const img = hasImage ? folderImages[imgIdx] : null;
      const safeTitle = escapeHtml(h.title || '소제목');
      const displayTitle = safeTitle.length > 25 ? safeTitle.substring(0, 25) + '...' : safeTitle;

      return `
        <div class="placement-item" data-heading-idx="${idx}" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: ${hasImage ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary)'}; border-radius: 8px; border: 2px solid ${hasImage ? '#10b981' : 'var(--border-light)'}; cursor: ${hasImage ? 'pointer' : 'default'}; transition: all 0.2s;">
          <div style="width: 50px; height: 50px; background: var(--bg-tertiary); border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
            ${hasImage && img ? `<img src="${toFileUrlMaybe(img.previewDataUrl || img.filePath || img.url || '')}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span style="font-size: 1.5rem; opacity: 0.3;">🖼️</span>`}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${idx + 1}. ${displayTitle}</div>
            <div style="font-size: 0.75rem; color: ${hasImage ? '#10b981' : 'var(--text-muted)'};">${hasImage ? '✅ 배치됨 (클릭하여 취소)' : '⏳ 대기 중'}</div>
          </div>
          ${hasImage ? `<span style="font-size: 1.2rem; color: #ef4444; cursor: pointer;" title="배치 취소">❌</span>` : ''}
        </div>
      `;
    }).join('');

    // 소제목 클릭하여 배치 취소
    statusContainer.querySelectorAll('.placement-item').forEach(item => {
      item.addEventListener('click', () => {
        const headingIdx = parseInt(item.getAttribute('data-heading-idx') || '-1');
        if (headingIdx >= 0 && placements.has(headingIdx)) {
          const imgIdx = placements.get(headingIdx)!;
          placements.delete(headingIdx);
          imageUsage.delete(imgIdx);

          // 이미지 선택 상태 업데이트
          updateImageSelectionUI();
          renderPlacementStatus();

          toastManager.info(`"${headings[headingIdx].title?.substring(0, 20)}..." 배치 취소됨`);
        }
      });
    });
  };

  // 이미지 선택 상태 UI 업데이트
  const updateImageSelectionUI = () => {
    const imagesContainer = modal.querySelector('#images-grid');
    if (!imagesContainer) return;

    imagesContainer.querySelectorAll('.placement-image').forEach((imgEl, imgIdx) => {
      const headingIdx = imageUsage.get(imgIdx);
      const isUsed = headingIdx !== undefined;

      (imgEl as HTMLElement).style.border = isUsed ? '4px solid #10b981' : '2px solid var(--border-light)';
      (imgEl as HTMLElement).style.opacity = isUsed ? '1' : '0.8';

      const badge = imgEl.querySelector('.placement-badge');
      if (badge) {
        (badge as HTMLElement).style.display = isUsed ? 'flex' : 'none';
        (badge as HTMLElement).textContent = isUsed ? `${headingIdx! + 1}` : '';
      }
    });

    // 다음 배치할 소제목 표시 업데이트 (✅ HTML 이스케이프 적용)
    nextHeadingIndex = getNextAvailableHeadingIndex();
    const nextLabel = modal.querySelector('#next-heading-label');
    if (nextLabel) {
      if (nextHeadingIndex >= 0) {
        const safeNextTitle = escapeHtml((headings[nextHeadingIndex].title || '소제목').substring(0, 30));
        nextLabel.textContent = `다음 배치: ${nextHeadingIndex + 1}번 - "${safeNextTitle}..."`;
      } else {
        nextLabel.textContent = '✅ 모든 소제목에 이미지 배치 완료!';
      }
    }
  };

  modal.innerHTML = `
    <div style="background: var(--bg-primary); border-radius: 16px; padding: 1.5rem; max-width: 1000px; width: 95%; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.4); position: relative;">
      <button type="button" class="close-modal-btn" style="position: absolute; top: 1rem; right: 1rem; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; font-weight: bold; z-index: 10;">✕</button>
      
      <h2 style="margin: 0 0 0.5rem 0; color: var(--text-strong); font-size: 1.3rem;">
        🖼️ 이미지를 클릭하여 소제목에 배치
      </h2>
      <div id="next-heading-label" style="font-size: 0.9rem; color: var(--primary); margin-bottom: 1rem; font-weight: 600;">
        다음 배치: 1번 - "${escapeHtml((headings[0]?.title || '소제목').substring(0, 30))}..."
      </div>
      
      <!-- 이미지 그리드 -->
      <div id="images-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; max-height: 320px; overflow-y: auto; padding: 12px; background: var(--bg-secondary); border-radius: 12px; margin-bottom: 1rem;">
        ${folderImages.filter(img => img && typeof img === 'object' && (img.previewDataUrl || img.filePath || img.url)).map((img, idx) => {
    // ✅ 이미지 URL 안전하게 추출
    const imageUrl = (img.previewDataUrl || img.filePath || img.url || '').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    return `
          <div class="placement-image" data-img-idx="${idx}" style="width: 100%; height: 100px; border-radius: 8px; overflow: hidden; cursor: pointer; border: 2px solid var(--border-light); transition: all 0.2s; opacity: 0.85; position: relative;">
            <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.style.display='none';">
            <div class="placement-badge" style="display: none; position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; background: #10b981; color: white; border-radius: 50%; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700;"></div>
          </div>
        `;
  }).join('')}
      </div>
      
      <!-- 소제목별 배치 현황 -->
      <div style="margin-bottom: 1rem;">
        <div style="font-weight: 600; color: var(--text-strong); margin-bottom: 0.5rem; font-size: 0.9rem;">📋 소제목별 배치 현황 (클릭하여 취소)</div>
        <div id="placement-status" style="display: grid; gap: 0.5rem; max-height: 200px; overflow-y: auto;">
          <!-- 동적 생성 -->
        </div>
      </div>
      
      <!-- 버튼 -->
      <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
        <button type="button" class="reset-placement-btn" style="padding: 0.75rem 1.5rem; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">🔄 초기화</button>
        <button type="button" class="apply-placement-btn" style="padding: 0.75rem 1.5rem; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">✅ 적용하기</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 초기 배치 현황 렌더링
  renderPlacementStatus();

  // 이미지 클릭 이벤트
  modal.querySelectorAll('.placement-image').forEach((imgEl, imgIdx) => {
    imgEl.addEventListener('click', () => {
      // 이미 사용된 이미지면 취소
      if (imageUsage.has(imgIdx)) {
        const headingIdx = imageUsage.get(imgIdx)!;
        placements.delete(headingIdx);
        imageUsage.delete(imgIdx);
        toastManager.info(`배치 취소됨`);
      } else {
        // 새로 배치
        nextHeadingIndex = getNextAvailableHeadingIndex();
        if (nextHeadingIndex < 0) {
          toastManager.warning('모든 소제목에 이미지가 배치되었습니다.');
          return;
        }

        placements.set(nextHeadingIndex, imgIdx);
        imageUsage.set(imgIdx, nextHeadingIndex);
        toastManager.success(`${nextHeadingIndex + 1}번 소제목에 배치됨`);
      }

      updateImageSelectionUI();
      renderPlacementStatus();
    });

    // 호버 효과
    imgEl.addEventListener('mouseenter', () => {
      (imgEl as HTMLElement).style.transform = 'scale(1.05)';
      (imgEl as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });
    imgEl.addEventListener('mouseleave', () => {
      (imgEl as HTMLElement).style.transform = 'scale(1)';
      (imgEl as HTMLElement).style.boxShadow = 'none';
    });
  });

  // 초기화 버튼
  modal.querySelector('.reset-placement-btn')?.addEventListener('click', () => {
    placements.clear();
    imageUsage.clear();
    updateImageSelectionUI();
    renderPlacementStatus();
    toastManager.info('배치가 초기화되었습니다.');
  });

  // 적용 버튼
  modal.querySelector('.apply-placement-btn')?.addEventListener('click', () => {
    if (placements.size === 0) {
      toastManager.warning('배치된 이미지가 없습니다.');
      return;
    }

    // ImageManager에 배치 적용
    let appliedCount = 0;
    try {
      placements.forEach((imgIdx, headingIdx) => {
        const img = folderImages[imgIdx];
        const heading = headings[headingIdx];
        if (img && heading) {
          const headingTitle = typeof heading === 'string' ? String(heading || '').trim() : String((heading as any)?.title || heading || '').trim();
          if (!headingTitle) return;
          const newImg = {
            heading: headingTitle,
            filePath: img.filePath || img.url,
            previewDataUrl: img.previewDataUrl || img.filePath || img.url,
            provider: 'local',
            savedToLocal: !!img.filePath,
          };
          // ✅ [2026-03-22 FIX] public API 사용 (undo 히스토리 보존 + 캡슐화 유지)
          if (ImageManager.hasImage(headingTitle)) {
            ImageManager.addImage(headingTitle, newImg);
          } else {
            ImageManager.setImage(headingTitle, newImg);
          }
          appliedCount++;
        }
      });

      // ✅ 단일 소스(ImageManager)에서 전역 배열 + 모든 미리보기 동기화
      ImageManager.syncGeneratedImagesArray();
      const allImagesAfter = ImageManager.getAllImages();
      (window as any).imageManagementGeneratedImages = allImagesAfter;

      // UI 업데이트 (영어 프롬프트 미리보기 & 생성 이미지 & 통합 미리보기 연동)
      updateUnifiedImagePreview(headings, allImagesAfter);
      displayGeneratedImages(allImagesAfter);
      updatePromptItemsWithImages(allImagesAfter);
      ImageManager.syncAllPreviews();

      appendLog(`✅ ${appliedCount}개의 이미지가 소제목에 배치되었습니다.`);
      toastManager.success(`✅ ${appliedCount}개의 이미지가 소제목에 배치되었습니다!`);
      modal.remove();
    } catch (err) {
      console.error('[localImageModals] 배치 적용 실패:', err);
      appendLog(`❌ 이미지 배치 적용 실패 (${appliedCount}개 적용됨): ${(err as Error).message}`);
      toastManager.error(`이미지 배치 중 오류 발생 (${appliedCount}개 적용됨). 초기화 후 다시 시도해주세요.`);
      // ✅ 부분 적용된 경우에도 sync 시도 → 일관성 유지
      try {
        ImageManager.syncGeneratedImagesArray();
        ImageManager.syncAllPreviews();
      } catch { /* ignore */ }
    }
  });

  // 닫기 버튼
  modal.querySelector('.close-modal-btn')?.addEventListener('click', () => modal.remove());

  // 배경 클릭 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  // ESC 키로 닫기
  const handleEscPlacement = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', handleEscPlacement); }
  };
  document.addEventListener('keydown', handleEscPlacement);
}
