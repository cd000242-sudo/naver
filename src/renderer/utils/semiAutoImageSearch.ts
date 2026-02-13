/**
 * ✅ [2026-02-12] 반자동 전용 이미지 자동 수집 모듈
 * 
 * 반자동 발행 모드에서 글 생성 시 소제목별 이미지를 자동 검색(네이버→구글 폴백)
 * 체크박스 ON일 때만 실행되며, 다른 발행 모드와 절대 충돌하지 않음
 * 
 * 격리 원칙:
 * - 풀오토/연속발행/멀티계정: 실행 안 함 (suppressModal===true)
 * - 쇼핑커넥트: 실행 안 함 (기존 수집 로직 존중)
 * - 체크박스 미체크: 실행 안 함
 */

import { isShoppingConnectModeActive } from './shoppingConnectUtils.js';

// ─── 상수 ─────────────────────────────────────────────

const CHECKBOX_ID = 'semi-auto-collect-images-on-generate';
const STORAGE_KEY = 'semiAutoCollectImagesOnGenerate';
const LOG_PREFIX = '[SemiAutoImageCollect]';

// ─── 가드 함수 ─────────────────────────────────────────

/**
 * 이미지 자동 수집을 실행해야 하는지 판단
 * 
 * @param suppressModal true이면 풀오토/연속발행 → 실행 안 함
 * @returns true이면 실행, false이면 스킵
 */
export function shouldRunAutoImageSearch(suppressModal?: boolean): boolean {
    // 1. 풀오토/연속/멀티계정은 suppressModal=true → 절대 실행 안 함
    if (suppressModal === true) {
        console.log(`${LOG_PREFIX} ⛔ suppressModal=true → 풀오토/연속발행 모드, 실행 안 함`);
        return false;
    }

    // 2. 체크박스 확인 (핵심 가드)
    const checkbox = document.getElementById(CHECKBOX_ID) as HTMLInputElement | null;
    const isChecked = checkbox?.checked ?? false;
    if (!isChecked) {
        console.log(`${LOG_PREFIX} ⛔ 체크박스 미체크 → 이미지 수집 건너뜀`);
        return false;
    }

    // 3. 쇼핑커넥트 모드이면 기존 수집 로직 존중
    if (isShoppingConnectModeActive()) {
        console.log(`${LOG_PREFIX} ⛔ 쇼핑커넥트 모드 → 기존 이미지 수집 로직 사용`);
        return false;
    }

    // 4. skipImages 체크 시 실행 안 함
    const skipImages = (document.getElementById('unified-skip-images') as HTMLInputElement)?.checked;
    if (skipImages) {
        console.log(`${LOG_PREFIX} ⛔ skipImages=true → 이미지 수집 건너뜀`);
        return false;
    }

    console.log(`${LOG_PREFIX} ✅ 가드 통과 → 이미지 자동 수집 실행`);
    return true;
}

// ─── 핵심 실행 함수 ─────────────────────────────────────

/**
 * 소제목별 이미지 자동 검색 + ImageManager 배치
 * 반드시 shouldRunAutoImageSearch()를 먼저 호출하여 가드를 통과한 후에만 실행
 * 
 * @param structuredContent 생성된 콘텐츠 (headings 포함)
 * @param mainKeyword 메인 키워드
 * @param appendLog 로그 출력 함수
 * @param ImageManager 이미지 매니저 인스턴스
 * @param syncFn 글로벌 이미지 동기화 함수
 */
export async function runAutoImageSearch(
    structuredContent: any,
    mainKeyword: string,
    appendLog: (msg: string) => void,
    ImageManager: any,
    syncFn: () => void
): Promise<{ added: number; total: number }> {
    const result = { added: 0, total: 0 };

    // 소제목 추출
    const headings: string[] = (structuredContent?.headings || [])
        .map((h: any) => typeof h === 'string' ? h : (h?.title || ''))
        .map((t: string) => String(t || '').trim())
        .filter((t: string) => t.length > 0);

    if (headings.length === 0) {
        console.log(`${LOG_PREFIX} 소제목이 없어 이미지 검색 건너뜀`);
        return result;
    }

    const keyword = String(mainKeyword || '').trim();
    if (!keyword) {
        console.log(`${LOG_PREFIX} 메인 키워드가 없어 이미지 검색 건너뜀`);
        return result;
    }

    console.log(`${LOG_PREFIX} 🔍 ${headings.length}개 소제목 이미지 검색 (키워드: ${keyword})`);
    appendLog(`🔍 소제목 ${headings.length}개에 대한 이미지 자동 수집 시작...`);

    // IPC 호출
    const searchResult = await (window as any).api.searchImagesForHeadings({
        headings,
        mainKeyword: keyword,
    });

    if (!searchResult?.success || !searchResult.images) {
        console.warn(`${LOG_PREFIX} ⚠️ 이미지 검색 실패:`, searchResult?.message);
        appendLog(`⚠️ 이미지 자동 수집 실패: ${searchResult?.message || '알 수 없는 오류'}`);
        return result;
    }

    const imageMap: Record<string, string[]> = searchResult.images;
    result.total = Object.values(imageMap).reduce((sum, urls) => sum + urls.length, 0);
    console.log(`${LOG_PREFIX} ✅ ${Object.keys(imageMap).length}개 소제목에 ${result.total}개 이미지 매칭`);

    if (result.total === 0) {
        appendLog('⚠️ 검색 결과 이미지가 없습니다.');
        return result;
    }

    // ImageManager에 이미지 배치 (기존 이미지가 없는 소제목에만)
    for (const [heading, urls] of Object.entries(imageMap)) {
        if (!urls || urls.length === 0) continue;

        // ✅ [2026-02-12 P2 FIX #10] resolveHeadingKey 활용 → getImages/addImage
        const existing = ImageManager.getImages(heading);
        if (existing && existing.length > 0) {
            console.log(`${LOG_PREFIX} 소제목 "${heading}" 이미 이미지 있음, 건너뜀`);
            continue;
        }

        const imageEntries = urls.slice(0, 2).map((url: string, idx: number) => ({
            url,
            heading,
            prompt: heading,
            timestamp: Date.now() + idx,
            isCollected: true,
            source: 'auto-search',
        }));

        imageEntries.forEach((entry: any) => ImageManager.addImage(heading, entry));
        result.added += imageEntries.length;
    }

    if (result.added > 0) {
        appendLog(`✅ 이미지 자동 수집 완료: ${result.added}개 이미지 배치됨`);
        try { syncFn(); } catch { /* ignore */ }
    } else {
        appendLog('ℹ️ 모든 소제목에 이미 이미지가 있어 추가 배치 없음');
    }

    return result;
}

// ─── UI: 체크박스 삽입 ──────────────────────────────────

/**
 * "글 생성 시 이미지 수집" 체크박스를 풀오토 이미지 소스 영역에 추가
 * - 쇼핑커넥트 모드에서는 자동 숨김
 * - localStorage로 상태 영속화
 */
export function injectAutoCollectCheckboxUI(): void {
    // 이미 존재하면 스킵
    if (document.getElementById(CHECKBOX_ID)) return;

    // 기존 이미지 소스 버튼 영역 찾기
    const imgSourceSection =
        document.querySelector('.unified-img-source-btn')
            ?.closest('.form-group, .option-group, .field, div[style*="margin"]');

    if (!imgSourceSection) {
        console.log(`${LOG_PREFIX} 이미지 소스 영역을 찾지 못함`);
        return;
    }

    const container = document.createElement('div');
    container.id = `${CHECKBOX_ID}-container`;
    container.style.cssText = `
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05));
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 8px;
    padding: 0.75rem;
    margin-top: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  `;

    // localStorage에서 이전 상태 복원
    const savedState = localStorage.getItem(STORAGE_KEY) === 'true';

    container.innerHTML = `
    <input type="checkbox" id="${CHECKBOX_ID}" 
      ${savedState ? 'checked' : ''}
      style="width: 18px; height: 18px; cursor: pointer; accent-color: #10b981; flex-shrink: 0;">
    <label for="${CHECKBOX_ID}" style="cursor: pointer; font-size: 0.85rem; color: var(--text-strong); display: flex; flex-direction: column; gap: 0.15rem;">
      <span style="font-weight: 600;">🔍 글 생성 시 이미지 수집도 같이하기</span>
      <span style="font-size: 0.75rem; color: var(--text-muted);">소제목별 네이버/구글 이미지 자동 수집 (반자동 전용)</span>
    </label>
  `;

    imgSourceSection.appendChild(container);

    // 체크박스 상태 변경 시 localStorage 저장
    const checkbox = document.getElementById(CHECKBOX_ID) as HTMLInputElement;
    checkbox?.addEventListener('change', () => {
        localStorage.setItem(STORAGE_KEY, String(checkbox.checked));
        console.log(`${LOG_PREFIX} 체크박스 변경: ${checkbox.checked}`);
    });

    // 쇼핑커넥트 모드에서는 숨김 (기존 수집 로직 존재)
    const updateVisibility = () => {
        const isShoppingConnect = isShoppingConnectModeActive();
        container.style.display = isShoppingConnect ? 'none' : 'flex';
    };

    updateVisibility();

    // 쇼핑커넥트 설정 변경 감지
    const scSettings = document.getElementById('shopping-connect-settings');
    if (scSettings) {
        const observer = new MutationObserver(updateVisibility);
        observer.observe(scSettings, { attributes: true, attributeFilter: ['style'] });
    }

    const contentModeSelect = document.getElementById('unified-content-mode');
    if (contentModeSelect) {
        contentModeSelect.addEventListener('change', updateVisibility);
    }

    console.log(`${LOG_PREFIX} ✅ 체크박스 UI 추가됨 (초기값: ${savedState})`);
}
