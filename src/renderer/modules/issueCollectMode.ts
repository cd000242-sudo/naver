// src/renderer/modules/issueCollectMode.ts
// 이슈 끝판왕 수집 mode: checkbox UI + renderer-side orchestration.
// Branches off the 이미지 관리탭 "AI 자동 수집" button; the legacy keyword/URL
// flows stay untouched when the checkbox is off.
// Inline bundle = single scope → all top-level identifiers prefixed issueCollect*.

import { ensureIssueCopyrightConsent } from './issueCollectConsent.js';

// Globals provided by other inlined modules (single-scope bundle).
declare function getCurrentImageHeadings(): any[];
declare function displayGeneratedImages(images: any[]): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare function updateReserveImagesThumbnails(): void;

// [2026-08-16] 사용자 요청으로 체크박스 옵트인 제거 — 키워드 모드는 항상 이슈 하네스가
// 기본 동작이다 (URL 입력 시에만 기존 URL 수집 유지, 분기는 headingImageGen.ts).
const ISSUE_COLLECT_LOG = '[IssueCollect]';
const ISSUE_DISK_SAVE_CAP_PER_HEADING = 15;

/** Match each heading title to its body paragraph from structuredContent. */
function issueCollectBuildHeadingInputs(headingTitles: string[]): Array<{ title: string; body?: string }> {
    const sc = (window as any).currentStructuredContent;
    const scHeadings: any[] = Array.isArray(sc?.headings) ? sc.headings : [];
    return headingTitles.map((title) => {
        const match = scHeadings.find((h: any) => String(h?.title || '').trim() === title.trim());
        const body = String(match?.content || match?.body || '').trim();
        return { title, body: body || undefined };
    });
}

/**
 * Run the issue endgame collection and place/save results.
 * Returns the number of placed images.
 */
export async function runIssueEndgameCollect(
    searchKeyword: string,
    appendLogFn: (msg: string) => void,
    opts?: { onlyEmptyHeadings?: boolean },
): Promise<number> {
    const consent = await ensureIssueCopyrightConsent();
    if (!consent) {
        appendLogFn('⛔ 저작권 동의가 없어 이슈 수집을 중단했습니다.');
        return 0;
    }

    const currentHeadings = getCurrentImageHeadings();
    let headingTitles: string[] = currentHeadings.map(
        (h: any, i: number) => String(h?.title || '').trim() || `소제목 ${i + 1}`,
    );
    // [2026-08-17] 공식문서 캡처 모드의 잔여 채움 — 캡처가 이미 배치된 소제목은
    // 검색 수집을 건너뛴다 (시간·API 절약, 캡처 우선 원칙).
    if (opts?.onlyEmptyHeadings) {
        const ImageManagerRef = (window as any).ImageManager;
        const before = headingTitles.length;
        headingTitles = headingTitles.filter((h) => {
            try { return !(ImageManagerRef?.getImages?.(h)?.length > 0); } catch { return true; }
        });
        if (headingTitles.length < before) {
            appendLogFn(`ℹ️ 이미 이미지가 있는 소제목 ${before - headingTitles.length}개는 수집 생략`);
        }
        if (headingTitles.length === 0) {
            appendLogFn('✅ 모든 소제목에 이미지가 이미 배치되어 추가 수집이 필요 없습니다.');
            return 0;
        }
    }
    if (headingTitles.length === 0) {
        appendLogFn('⚠️ 소제목이 없습니다. 글 생성 또는 소제목 분석 후 다시 시도하세요.');
        return 0;
    }

    const headingInputs = issueCollectBuildHeadingInputs(headingTitles);
    const bodiesFound = headingInputs.filter((h) => h.body).length;
    appendLogFn(`🏆 이슈 끝판왕 수집 시작: ${headingTitles.length}개 소제목 (본문 확보 ${bodiesFound}개)`);
    appendLogFn('🧠 AI 본문 분석 → 쿼리 팬아웃 → 다소스 추적 수집 중... (1~3분 소요)');

    // [2026-08-16] 중앙 진행 모달 + 메인 프로세스 실시간 진행 이벤트 (사용자 요청:
    // "수집할 때 작업하는 화면이라도 띄우면 좋겠다"). 모달 실패는 수집에 영향 없음.
    const progressModal = (window as any).aiProgressModal || null;
    let unsubscribeProgress: (() => void) | undefined;
    try {
        progressModal?.show?.('🏆 이슈 끝판왕 이미지 수집', {
            icon: '🏆',
            initialLog: `${headingTitles.length}개 소제목 · 9개 소스 추적 수집을 시작합니다. (1~3분)`,
        });
        progressModal?.update?.(2, '🚀 수집 파이프라인 시동 중...');
        unsubscribeProgress = (window as any).api?.onIssueCollectProgress?.((info: any) => {
            try {
                if (typeof info?.percent === 'number' && info?.message) {
                    progressModal?.update?.(info.percent, info.message);
                    progressModal?.addLog?.(info.message);
                }
            } catch { /* modal update only */ }
        });
    } catch { /* progress UI is optional */ }

    let result: any;
    try {
        result = await (window as any).api.collectIssueImages({
            title: searchKeyword,
            headings: headingInputs,
            mainKeyword: searchKeyword,
        });
    } catch (ipcError: any) {
        // Thrown (not returned) failure — close the modal before rethrowing,
        // otherwise it stays stuck at the last percent.
        try {
            progressModal?.complete?.(false, {
                failureTitle: '이슈 수집 실패',
                failureIcon: '❌',
                failureLog: ipcError?.message || String(ipcError),
            });
        } catch { /* ignore */ }
        throw ipcError;
    } finally {
        try { unsubscribeProgress?.(); } catch { /* ignore */ }
    }

    if (!result?.success) {
        appendLogFn(`❌ 이슈 수집 실패: ${result?.message || '알 수 없는 오류'}`);
        try {
            progressModal?.complete?.(false, {
                failureTitle: '이슈 수집 실패',
                failureIcon: '❌',
                failureLog: result?.message || '알 수 없는 오류',
            });
        } catch { /* ignore */ }
        return 0;
    }

    const imageMap: Record<string, string[]> = result.images || {};
    const candidateMap: Record<string, any[]> = result.candidates || {};
    const stats = result.stats || {};
    appendLogFn(`📊 후보 ${stats.totalCandidates ?? '?'}장 → 필터 ${stats.afterFilter ?? '?'}장 → 클린 ${stats.cleanTotal ?? '?'}장 (AI플랜: ${stats.aiPlanUsed ? 'ON' : '휴리스틱'})`);
    if (stats.visionUsed) {
        appendLogFn(`👁️ Vision 게이트: ${stats.visionInspected ?? 0}장 검사, 지각 중복 ${stats.perceptualDuplicates ?? 0}장 통합`);
    } else {
        appendLogFn('⚠️ Gemini 키가 없어 Vision 워터마크/텍스트 검증이 생략되었습니다.');
    }

    const ImageManager = (window as any).ImageManager;
    const postTitle = String(
        (window as any).currentStructuredContent?.selectedTitle
        || (window as any).currentStructuredContent?.title
        || searchKeyword,
    ).trim();
    const postId = `issue-${Date.now()}`;

    let placedCount = 0;
    let savedToDisk = 0;
    const placedForUI: any[] = [];
    try { progressModal?.update?.(96, '💾 수집 이미지를 디스크에 저장하고 배치하는 중...'); } catch { /* ignore */ }

    for (const heading of headingTitles) {
        const placedUrls = imageMap[heading] || [];
        const candidates = candidateMap[heading] || [];

        // Save the surviving candidate pool to disk (manual replacement pool).
        const toSave = candidates.slice(0, ISSUE_DISK_SAVE_CAP_PER_HEADING);
        const savedByUrl: Record<string, { filePath?: string; previewDataUrl?: string }> = {};
        for (let idx = 0; idx < toSave.length; idx++) {
            try {
                const dl = await (window as any).api?.downloadAndSaveImage?.(toSave[idx].url, heading, postTitle, postId);
                if (dl?.success && dl.filePath) {
                    savedToDisk++;
                    if (placedUrls.includes(toSave[idx].url)) {
                        savedByUrl[toSave[idx].url] = { filePath: dl.filePath, previewDataUrl: dl.previewDataUrl };
                    }
                }
            } catch { /* per-image save failure is non-fatal */ }
        }

        if (placedUrls.length === 0) {
            appendLogFn(`ℹ️ "${heading}" → 깨끗한 이미지 없음, 빈 슬롯 유지 (AI 생성 안 함)`);
            continue;
        }

        const existing = ImageManager?.getImages?.(heading);
        if (existing && existing.length > 0) {
            appendLogFn(`ℹ️ "${heading}" 이미 이미지 있음 — UI 배치 생략 (디스크 저장은 완료)`);
            continue;
        }

        // [2026-08-17] 소제목당 다중 배치 — 클린 상위 N장을 전부 ImageManager에 넣는다.
        placedUrls.forEach((placedUrl, idx) => {
            const saved = savedByUrl[placedUrl] || {};
            const entry = {
                url: placedUrl,
                filePath: saved.filePath,
                previewDataUrl: saved.previewDataUrl || placedUrl,
                heading,
                prompt: heading,
                timestamp: Date.now() + idx,
                isCollected: true,
                savedToLocal: saved.filePath,
                source: 'issue-endgame',
            };
            ImageManager?.addImage?.(heading, entry);
            if (idx === 0) placedForUI.push({ ...entry });
            placedCount++;
        });
    }

    if (placedForUI.length > 0) {
        try {
            (window as any).generatedImages = placedForUI;
            (window as any).imageManagementGeneratedImages = placedForUI;
            try { displayGeneratedImages(placedForUI); } catch { /* grid not mounted */ }
            try { updatePromptItemsWithImages(placedForUI); } catch { /* cards not mounted */ }
            try { updateReserveImagesThumbnails(); } catch { /* reserve UI not mounted */ }
        } catch (e: any) {
            console.warn(`${ISSUE_COLLECT_LOG} UI 갱신 실패 (저장은 정상): ${e?.message}`);
        }
    }

    appendLogFn(`✅ 이슈 끝판왕 수집 완료: ${placedCount}개 배치 / ${savedToDisk}개 디스크 저장`);
    if (savedToDisk > 0) appendLogFn(`📁 저장 위치: Downloads/naver-blog-images/${postTitle}/`);
    try {
        progressModal?.complete?.(true, {
            successTitle: '이슈 수집 완료',
            successIcon: '🏆',
            successLog: `${placedCount}개 배치 · ${savedToDisk}개 디스크 저장${savedToDisk > 0 ? ` (Downloads/naver-blog-images/${postTitle}/)` : ''}`,
        });
    } catch { /* ignore */ }
    try {
        window.dispatchEvent(new CustomEvent('image-collection-completed', { detail: { savedToDisk, postTitle } }));
    } catch { /* ignore */ }
    return placedCount;
}
