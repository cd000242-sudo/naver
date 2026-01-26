
// ============================================
// ✅ 이미지 화질/모델 설정 UI 관리
// ============================================

async function initImageQualitySettings(): Promise<void> {
    const toggleBtn = document.getElementById('toggle-image-quality-settings');
    const panel = document.getElementById('image-quality-settings-panel');
    const arrow = document.getElementById('image-quality-arrow');

    if (!toggleBtn || !panel || !arrow) return;

    console.log('[ImageQuality] UI 초기화 시작');

    // 1. 토글 기능
    toggleBtn.addEventListener('click', () => {
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    });

    // 2. 초기 설정 로드
    try {
        // configManager에서 설정 가져오기 (비동기)
        const config = await window.api.getConfig();
        console.log('[ImageQuality] 로드된 설정:', config);

        const defaults = {
            imageQualityMode: 'balanced',
            thumbnailImageModel: 'gemini-3-pro',  // ✅ [2026-01-21] 기본값 1K로 변경 (안정성 향상)
            otherImagesModel: 'gemini-3-pro',  // ✅ [2026-01-21] 본문 이미지도 1K 기본
            lockThumbnailTo4K: false  // ✅ 4K 고정 해제
        };

        const settings = { ...defaults, ...config };

        // 화질 모드 라디오 버튼 설정
        const modeRadio = document.querySelector(`input[name="imageQualityMode"][value="${settings.imageQualityMode}"]`) as HTMLInputElement;
        if (modeRadio) modeRadio.checked = true;

        // 상세 설정 드롭다운 값 설정
        const thumbSelect = document.getElementById('thumbnail-model-select') as HTMLSelectElement;
        const bodySelect = document.getElementById('body-image-model-select') as HTMLSelectElement;
        if (thumbSelect) thumbSelect.value = settings.thumbnailImageModel || 'gemini-3-pro';  // ✅ 기본값 1K
        if (bodySelect) bodySelect.value = settings.otherImagesModel || 'gemini-2.5-flash';

        // 썸네일 고정 체크박스
        const lockCheckbox = document.getElementById('lock-thumbnail-4k') as HTMLInputElement;
        if (lockCheckbox) lockCheckbox.checked = settings.lockThumbnailTo4K !== false; // 기본값 false

        // 초기 UI 상태 업데이트 (커스텀 상세 설정 표시 여부 등)
        updateQualityUISubState(settings.imageQualityMode);

    } catch (e) {
        console.warn('[ImageQuality] 설정 로드 실패:', e);
    }

    // 3. UI 변경 이벤트 리스너 (설정 저장)

    // 화질 모드 변경
    document.querySelectorAll('input[name="imageQualityMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const mode = (e.target as HTMLInputElement).value;
            updateQualityUISubState(mode);
            saveImageQualitySettings();
        });
    });

    // 상세 모델 변경
    document.getElementById('thumbnail-model-select')?.addEventListener('change', saveImageQualitySettings);
    document.getElementById('body-image-model-select')?.addEventListener('change', saveImageQualitySettings);
    document.getElementById('lock-thumbnail-4k')?.addEventListener('change', saveImageQualitySettings);
}

// UI 상태 업데이트 헬퍼
function updateQualityUISubState(mode: string): void {
    const customSettings = document.getElementById('custom-quality-settings');
    if (customSettings) {
        customSettings.style.display = mode === 'custom' ? 'block' : 'none';
    }

    // 패널이 닫혀있다면 모드가 변경되었을 때 자동으로 열기 (사용자 피드백)
    const panel = document.getElementById('image-quality-settings-panel');
    const arrow = document.getElementById('image-quality-arrow');
    if (panel && panel.style.display === 'none' && mode === 'custom') {
        panel.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    }
}

// 설정 저장 헬퍼
async function saveImageQualitySettings(): Promise<void> {
    const mode = (document.querySelector('input[name="imageQualityMode"]:checked') as HTMLInputElement)?.value || 'balanced';
    const thumbModel = (document.getElementById('thumbnail-model-select') as HTMLSelectElement)?.value;
    const bodyModel = (document.getElementById('body-image-model-select') as HTMLSelectElement)?.value;
    const lockThumb = (document.getElementById('lock-thumbnail-4k') as HTMLInputElement)?.checked;

    const newSettings = {
        imageQualityMode: mode,
        thumbnailImageModel: thumbModel,
        otherImagesModel: bodyModel,
        lockThumbnailTo4K: lockThumb
    };

    console.log('[ImageQuality] 설정 저장 중...', newSettings);

    try {
        await window.api.saveConfig(newSettings);
        // 토스트 메시지는 너무 빈번할 수 있으므로 생략하거나 console 로그만 남김
        console.log('[ImageQuality] 설정 저장 완료');
    } catch (e) {
        console.error('[ImageQuality] 설정 저장 실패:', e);
    }
}

// 초기화 실행
document.addEventListener('DOMContentLoaded', initImageQualitySettings);
