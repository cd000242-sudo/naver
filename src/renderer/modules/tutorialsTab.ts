// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 사용법 영상 탭 모듈
// renderer.ts에서 추출 — 영상 업로드/삭제/목록 + 관리자 모드
// ═══════════════════════════════════════════════════════════════════

// TutorialVideo 타입 (types/index.ts에 정의됨)
interface TutorialVideo {
    id: string;
    title: string;
    description: string;
    filePath: string;
    uploadedAt: string;
}

declare const window: Window & { api: any };

// 관리자 모드 확인 (비밀 키 조합: Ctrl + Shift + A)
let isAdminMode = false;

export function initTutorialsTab(): void {
    console.log('[Tutorials] 사용법 탭 초기화');

    // index.html에 동일 id가 2군데(tab-tutorials / tools-tab-tutorials) 존재할 수 있어서
    // 반드시 컨테이너를 기준으로 querySelector를 수행합니다.
    const roots = [
        document.getElementById('tab-tutorials'),
        document.getElementById('tools-tab-tutorials'),
    ].filter(Boolean) as HTMLElement[];

    const toggleAdminSections = (enabled: boolean) => {
        roots.forEach((root) => {
            const section = root.querySelector('#admin-video-upload') as HTMLElement | null;
            if (section) section.style.display = enabled ? 'block' : 'none';
        });
    };

    // 관리자 모드 토글
    // - Shift + Z → Shift + X
    // - Ctrl + Shift + A
    let adminKeySequence: string[] = [];
    const ADMIN_KEY_SEQUENCE = ['z', 'x'];

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
            isAdminMode = !isAdminMode;
            toggleAdminSections(isAdminMode);

            // ✅ 관리자 모드 변경 시 영상 목록 리렌더링 (삭제 버튼 갱신)
            loadTutorialVideos();

            console.log(`[Tutorials] 관리자 모드: ${isAdminMode ? '활성화' : '비활성화'}`);
            if (isAdminMode) {
                alert('🔐 관리자 모드가 활성화되었습니다.\n영상 업로드가 가능합니다.');
            }
            adminKeySequence = [];
            return;
        }

        // Shift 키가 눌린 상태에서 Z, X 순서로 입력
        if (e.shiftKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'x')) {
            adminKeySequence.push(e.key.toLowerCase());

            // 시퀀스가 너무 길어지면 초기화
            if (adminKeySequence.length > 2) {
                adminKeySequence = [e.key.toLowerCase()];
            }

            // Z, X 순서로 입력되면 관리자 모드 토글
            if (adminKeySequence.length === 2 &&
                adminKeySequence[0] === 'z' &&
                adminKeySequence[1] === 'x') {
                isAdminMode = !isAdminMode;
                toggleAdminSections(isAdminMode);

                // ✅ 관리자 모드 변경 시 영상 목록 리렌더링 (삭제 버튼 갱신)
                loadTutorialVideos();

                console.log(`[Tutorials] 관리자 모드: ${isAdminMode ? '활성화' : '비활성화'}`);

                if (isAdminMode) {
                    alert('🔐 관리자 모드가 활성화되었습니다.\n영상 업로드가 가능합니다.');
                }

                adminKeySequence = []; // 시퀀스 초기화
            }

            // 2초 후 시퀀스 초기화
            setTimeout(() => {
                adminKeySequence = [];
            }, 2000);
        }
    });

    // 영상 업로드 버튼 (각 탭/패널별로 연결)
    roots.forEach((root) => {
        const uploadVideoBtn = root.querySelector('#upload-video-btn') as HTMLButtonElement | null;
        const videoTitleInput = root.querySelector('#video-title-input') as HTMLInputElement | null;
        const videoDescriptionInput = root.querySelector('#video-description-input') as HTMLInputElement | null;

        if (!uploadVideoBtn) return;
        if (uploadVideoBtn.hasAttribute('data-listener-added')) return;
        uploadVideoBtn.setAttribute('data-listener-added', 'true');

        uploadVideoBtn.addEventListener('click', async () => {
            if (!isAdminMode) {
                alert('⚠️ 관리자 권한이 필요합니다.');
                return;
            }

            const title = String(videoTitleInput?.value || '').trim();
            if (!title) {
                alert('영상 제목을 입력해주세요.');
                return;
            }

            try {
                // 파일 선택 다이얼로그
                if (!window.api.selectVideoFile) {
                    alert('영상 파일 선택 기능을 사용할 수 없습니다.');
                    return;
                }
                const result = await window.api.selectVideoFile();
                if (result && result.filePath) {
                    const video: TutorialVideo = {
                        id: `video_${Date.now()}`,
                        title: title,
                        description: String(videoDescriptionInput?.value || '').trim(),
                        filePath: result.filePath,
                        uploadedAt: new Date().toISOString(),
                    };

                    await saveTutorialVideo(video);
                    await loadTutorialVideos();

                    if (videoTitleInput) videoTitleInput.value = '';
                    if (videoDescriptionInput) videoDescriptionInput.value = '';

                    alert(`✅ "${title}" 영상이 등록되었습니다!`);
                }
            } catch (error) {
                console.error('[Tutorials] 영상 업로드 실패:', error);
                alert('영상 업로드에 실패했습니다.');
            }
        });
    });

    // 저장된 영상 목록 로드
    loadTutorialVideos();
}

// 영상 저장
async function saveTutorialVideo(video: TutorialVideo): Promise<void> {
    try {
        const existingVideos = await loadTutorialVideosData();
        existingVideos.push(video);

        if (window.api && window.api.saveConfig) {
            const config = await window.api.getConfig();
            (config as any).tutorialVideos = existingVideos;
            await window.api.saveConfig(config);
        }
    } catch (error) {
        console.error('[Tutorials] 영상 저장 실패:', error);
    }
}

// 영상 목록 데이터 로드
async function loadTutorialVideosData(): Promise<TutorialVideo[]> {
    try {
        console.log('[Tutorials] loadTutorialVideosData 호출됨');

        // ✅ getConfig API 사용 (안정적)
        if (window.api && window.api.getConfig) {
            console.log('[Tutorials] getConfig API 호출');
            const config = await window.api.getConfig();
            const videos = (config as any).tutorialVideos || [];
            console.log('[Tutorials] 영상 수:', videos.length);
            return videos;
        }
        console.log('[Tutorials] window.api 없음');
        return [];
    } catch (error) {
        console.error('[Tutorials] 영상 데이터 로드 실패:', error);
        return [];
    }
}

// 영상 목록 UI 로드
export async function loadTutorialVideos(): Promise<void> {
    console.log('[Tutorials] ========== loadTutorialVideos 시작 ==========');
    const tutorialsContainer = document.getElementById('tutorials-list-container');
    const noTutorialsMessage = document.getElementById('no-tutorials-message');

    console.log('[Tutorials] 컨테이너:', tutorialsContainer ? '찾음' : '없음');
    console.log('[Tutorials] 메시지 요소:', noTutorialsMessage ? '찾음' : '없음');

    if (!tutorialsContainer) {
        console.error('[Tutorials] tutorials-list-container를 찾을 수 없음');
        return;
    }

    try {
        console.log('[Tutorials] loadTutorialVideosData 호출 전');
        const videos = await loadTutorialVideosData();
        console.log('[Tutorials] loadTutorialVideosData 완료, 영상 수:', videos.length);
        console.log('[Tutorials] 영상 데이터:', JSON.stringify(videos.slice(0, 2)));

        if (videos.length === 0) {
            if (noTutorialsMessage) noTutorialsMessage.style.display = 'block';
            return;
        }

        if (noTutorialsMessage) noTutorialsMessage.style.display = 'none';

        // 기존 영상 카드 제거 (메시지 제외)
        const existingCards = tutorialsContainer.querySelectorAll('.tutorial-video-card');
        existingCards.forEach(card => card.remove());

        // 영상 카드 생성
        videos.forEach((video, index) => {
            const card = document.createElement('div');
            card.className = 'tutorial-video-card';
            card.style.cssText = `
        background: var(--bg-secondary);
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid var(--border-light);
        transition: all 0.3s;
      `;

            const uploadDate = new Date(video.uploadedAt).toLocaleDateString('ko-KR');

            card.innerHTML = `
        <div style="position: relative; aspect-ratio: 16/9; background: #000;">
          <video 
            id="tutorial-video-${index}" 
            style="width: 100%; height: 100%; object-fit: contain;"
            controls
            preload="metadata"
          >
            <source src="file:///${video.filePath.replace(/\\/g, '/').replace(/^\/+/, '')}" type="video/mp4">
            브라우저가 비디오를 지원하지 않습니다.
          </video>
        </div>
        <div style="padding: 1rem;">
          <div style="font-weight: 700; color: var(--text-strong); font-size: 1.1rem; margin-bottom: 0.5rem;">${video.title}</div>
          ${video.description ? `<div style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.75rem; line-height: 1.5;">${video.description}</div>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 0.8rem; color: var(--text-muted);">📅 ${uploadDate}</div>
            ${isAdminMode ? `
              <button type="button" class="delete-tutorial-btn" data-video-id="${video.id}" style="padding: 0.4rem 0.8rem; background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; font-size: 0.8rem; cursor: pointer;">
                🗑️ 삭제
              </button>
            ` : ''}
          </div>
        </div>
      `;

            // 호버 효과
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-4px)';
                card.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.15)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = 'none';
            });

            tutorialsContainer.appendChild(card);
        });

        // 삭제 버튼 이벤트 연결 (관리자 모드에서만)
        if (isAdminMode) {
            document.querySelectorAll('.delete-tutorial-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const videoId = (e.currentTarget as HTMLElement).getAttribute('data-video-id');
                    if (videoId && confirm('정말 이 영상을 삭제하시겠습니까?')) {
                        await deleteTutorialVideo(videoId);
                        loadTutorialVideos();
                    }
                });
            });
        }

    } catch (error) {
        console.error('[Tutorials] 영상 목록 로드 실패:', error);
    }
}

// 영상 삭제
async function deleteTutorialVideo(videoId: string): Promise<void> {
    try {
        const videos = await loadTutorialVideosData();
        const filteredVideos = videos.filter(v => v.id !== videoId);

        if (window.api && window.api.saveConfig) {
            const config = await window.api.getConfig();
            (config as any).tutorialVideos = filteredVideos;
            await window.api.saveConfig(config);
        }
    } catch (error) {
        console.error('[Tutorials] 영상 삭제 실패:', error);
    }
}

// DOMContentLoaded에서 사용법 탭 초기화 호출
document.addEventListener('DOMContentLoaded', () => {
    initTutorialsTab();
});
