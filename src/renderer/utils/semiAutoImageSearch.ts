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

// ✅ [v2.10.25] copy-static.mjs가 모든 모듈을 단일 renderer.js에 인라인하므로
//   글로벌 이름(declare function)으로 직접 호출 가능. window 우회는 const 인라인된 함수에 안 닿음.
declare function displayGeneratedImages(images: any[]): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare function updateReserveImagesThumbnails(): void;

// ─── 상수 ─────────────────────────────────────────────

const CHECKBOX_ID = 'semi-auto-collect-images-on-generate';
const SEMI_AUTO_IMAGE_STORAGE_KEY = 'semiAutoCollectImagesOnGenerate';
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
    syncFn: () => void,
    // ✅ [v2.7.77] 풀오토/연속/다계정에서 호출 시 사용자 명시 옵션 주입
    forceOptions?: {
        sourceUrl?: string;
        fillGapWithAI?: boolean;
        skipGuards?: boolean; // suppressModal 가드 우회
    }
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

    // ✅ [v2.7.77] forceOptions 우선 — 풀오토/연속/다계정에서 명시 주입한 값 사용
    let sourceUrl = '';
    let fillGapWithAI = false;
    if (forceOptions?.sourceUrl !== undefined) {
        sourceUrl = String(forceOptions.sourceUrl || '').trim();
        fillGapWithAI = !!forceOptions.fillGapWithAI;
        console.log(`${LOG_PREFIX} 🎯 force 모드 (풀오토/연속/다계정): sourceUrl="${sourceUrl.slice(0,60)}", fillgap=${fillGapWithAI}`);
    } else {
        // 반자동 흐름: DOM 우선순위 3단계
        try {
            const contentUrlInput = document.getElementById('content-url-collect') as HTMLInputElement | null;
            sourceUrl = contentUrlInput?.value?.trim() || '';
            const fillGapCheckbox = document.getElementById('content-url-fillgap-ai') as HTMLInputElement | null;
            fillGapWithAI = !!fillGapCheckbox?.checked;
            if (!sourceUrl) {
                sourceUrl = String((structuredContent as any)?.sourceUrl || '').trim();
            }
            if (!sourceUrl) {
                const urlInput = document.getElementById('unified-source-url') as HTMLInputElement | null;
                sourceUrl = urlInput?.value?.trim() || '';
            }
            sourceUrl = sourceUrl.split(/[\n,]/)[0].trim();
            if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) sourceUrl = '';
        } catch { sourceUrl = ''; }
    }
    if (sourceUrl) {
        console.log(`${LOG_PREFIX} 🔗 원본 URL 우선 크롤링: ${sourceUrl.slice(0, 80)}`);
        appendLog(`🔗 원본 URL의 이미지를 우선 수집 중: ${sourceUrl.slice(0, 60)}...`);
    }
    if (fillGapWithAI) {
        console.log(`${LOG_PREFIX} 🎨 부족분 AI 생성 ON`);
        appendLog(`🎨 부족분 AI 생성 옵션 ON — URL 이미지 부족 시 빈 소제목에 AI 이미지 생성`);
    }

    // IPC 호출
    const searchResult = await (window as any).api.searchImagesForHeadings({
        headings,
        mainKeyword: keyword,
        sourceUrl: sourceUrl || undefined,
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

    // ✅ [v2.7.72] 수집한 URL 이미지를 즉시 디스크에 저장 (Downloads/naver-blog-images/{글제목}/)
    //   사용자 요청: "스마트 AI 이미지 수집으로 모은 URL 이미지 폴더생성해서 저장되게해줘야지"
    const postTitle = String((structuredContent as any)?.title || (structuredContent as any)?.postTitle || '').trim() || keyword;
    const postId = String((structuredContent as any)?.id || (structuredContent as any)?.postId || '').trim() || `post-${Date.now()}`;
    let savedToDisk = 0;
    appendLog(`💾 수집 이미지를 디스크에 저장 중... (${postTitle})`);

    // ✅ [v2.10.46] 사용자 보고: '수집한 이미지를 전부 저장해야 정상' (이전엔 헤딩당 1장만 저장됨)
    //   기존: ImageManager existing 체크로 디스크 저장도 skip → 폴더 자체 안 생성
    //   기존: 헤딩당 1장만 디스크 저장 → 검색 결과 30장이어도 1장만 저장됨
    //   변경: 디스크 저장은 모든 urls(cap=10) 항상 실행, ImageManager 배치는 1장만 유지
    for (const [heading, urls] of Object.entries(imageMap)) {
        if (!urls || urls.length === 0) continue;

        // ✅ [v2.10.46] 디스크 저장 — 검색된 모든 URL을 헤딩 폴더에 저장 (cap=10)
        //   첫 1장의 결과는 ImageManager 배치에 사용, 나머지는 폴더 보관용
        const DISK_SAVE_CAP = 10;
        const urlsToSave = urls.slice(0, DISK_SAVE_CAP);
        let firstSaved: { filePath?: string; previewDataUrl?: string } = {};
        for (let idx = 0; idx < urlsToSave.length; idx++) {
            const url = urlsToSave[idx];
            try {
                const dl = await (window as any).api?.downloadAndSaveImage?.(
                    url,
                    heading,
                    postTitle,
                    postId,
                );
                if (dl?.success && dl.filePath) {
                    savedToDisk++;
                    if (idx === 0) firstSaved = { filePath: dl.filePath, previewDataUrl: dl.previewDataUrl };
                    console.log(`${LOG_PREFIX} 💾 저장: ${dl.filePath}`);
                } else {
                    console.warn(`${LOG_PREFIX} ⚠️ 저장 실패: ${dl?.message || 'unknown'}`);
                }
            } catch (e: any) {
                console.warn(`${LOG_PREFIX} ⚠️ 다운로드 오류: ${e?.message}`);
            }
        }

        // ✅ ImageManager 배치 — 기존 이미지 있으면 skip (UI 중복 방지). 디스크는 위에서 이미 저장됨
        const existing = ImageManager.getImages(heading);
        if (existing && existing.length > 0) {
            console.log(`${LOG_PREFIX} 소제목 "${heading}" 이미 ImageManager 배치됨, UI 배치 skip (디스크는 저장됨)`);
            continue;
        }

        // ✅ [v2.7.83] 소제목당 1장만 ImageManager 배치 (이전 2장 → 중복 호소)
        const imageEntries: any[] = [];
        for (let idx = 0; idx < Math.min(urls.length, 1); idx++) {
            const url = urls[idx];
            const filePath = firstSaved.filePath;
            const previewDataUrl = firstSaved.previewDataUrl;

            imageEntries.push({
                url,
                filePath,
                previewDataUrl,
                heading,
                prompt: heading,
                timestamp: Date.now() + idx,
                isCollected: true,
                savedToLocal: filePath,
                source: 'auto-search',
            });
        }

        imageEntries.forEach((entry: any) => ImageManager.addImage(heading, entry));
        result.added += imageEntries.length;
    }

    if (result.added > 0) {
        appendLog(`✅ 이미지 자동 수집 완료: ${result.added}개 배치 / ${savedToDisk}개 디스크 저장됨`);
        if (savedToDisk > 0) {
            appendLog(`📁 저장 위치: Downloads/naver-blog-images/${postTitle}/`);
        }
        try { syncFn(); } catch { /* ignore */ }

        // ✅ [v2.10.45] 폴더 모달이 열려있으면 즉시 갱신 트리거 (사용자 보고: '수집해도 모달에 안 뜬다')
        try {
            window.dispatchEvent(new CustomEvent('image-collection-completed', {
                detail: { savedToDisk, postTitle }
            }));
        } catch { /* ignore */ }

        // ✅ [v2.10.25] UI 갱신을 글로벌 이름으로 직접 호출 (v2.10.24 window 우회는 const 인라인 함수에
        //   닿지 않아 항상 false였음). copy-static.mjs가 단일 renderer.js로 인라인하므로 직접 호출 가능.
        try {
            const collectedForUI: any[] = [];
            for (const heading of headings) {
                const imgs = ImageManager.getImages(heading);
                if (imgs && imgs.length > 0) {
                    const last = imgs[imgs.length - 1];
                    collectedForUI.push({ ...last, heading });
                }
            }
            if (collectedForUI.length > 0) {
                (window as any).generatedImages = collectedForUI;
                (window as any).imageManagementGeneratedImages = collectedForUI;
                try { displayGeneratedImages(collectedForUI); } catch (e: any) { console.warn(`${LOG_PREFIX} displayGeneratedImages 실패: ${e?.message}`); }
                try { updatePromptItemsWithImages(collectedForUI); } catch (e: any) { console.warn(`${LOG_PREFIX} updatePromptItemsWithImages 실패: ${e?.message}`); }
                try { updateReserveImagesThumbnails(); } catch (e: any) { console.warn(`${LOG_PREFIX} updateReserveImagesThumbnails 실패: ${e?.message}`); }
                console.log(`${LOG_PREFIX} ✅ UI 갱신: ${collectedForUI.length}개 이미지 그리드/프롬프트 카드 반영`);
            }
        } catch (uiErr: any) {
            console.warn(`${LOG_PREFIX} ⚠️ UI 갱신 실패 (디스크 저장은 정상): ${uiErr?.message}`);
        }
    } else {
        appendLog('ℹ️ 모든 소제목에 이미 이미지가 있어 추가 배치 없음');
    }

    // ✅ [v2.7.74] 부족분 처리:
    //   - 기본(fillGapWithAI=false): 빈 소제목 그대로 유지 — 이미지 안 넣음
    //   - 체크박스 ON: 빈 소제목 추출 후 generate-images-btn 클릭 트리거 (사용자 의도 명시)
    const emptyHeadings = headings.filter(h => {
        const existing = ImageManager.getImages(h);
        return !existing || existing.length === 0;
    });
    if (emptyHeadings.length > 0) {
        if (fillGapWithAI) {
            appendLog(`🎨 부족분 AI 생성: ${emptyHeadings.length}개 소제목 (${emptyHeadings.slice(0, 3).join(', ')}${emptyHeadings.length > 3 ? '...' : ''})`);
            // generate-remaining-images-btn 클릭 트리거 (이미 빈 자리만 채우는 기존 버튼 활용)
            const remainBtn = document.getElementById('generate-remaining-images-btn') as HTMLButtonElement | null;
            if (remainBtn && !remainBtn.disabled) {
                appendLog(`▶️ "비어있는 소제목만 이미지 생성" 자동 클릭`);
                remainBtn.click();
            } else {
                appendLog(`⚠️ AI 생성 버튼을 찾지 못해 자동 트리거 실패 (수동으로 [비어있는 소제목만 이미지 생성] 클릭)`);
            }
        } else {
            appendLog(`ℹ️ 빈 소제목 ${emptyHeadings.length}개 → AI 생성 건너뜀 (부족분 AI 생성 체크박스 OFF)`);
        }
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
    const savedState = localStorage.getItem(SEMI_AUTO_IMAGE_STORAGE_KEY) === 'true';

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
        localStorage.setItem(SEMI_AUTO_IMAGE_STORAGE_KEY, String(checkbox.checked));
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
