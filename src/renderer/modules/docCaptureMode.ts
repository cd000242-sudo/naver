// src/renderer/modules/docCaptureMode.ts
// 공식문서 캡처 모드 (경제·지원금 글) — 체크박스 옵트인 UI + 실행 오케스트레이션.
// 체크 ON → AI 자동 수집 버튼이 공식 페이지 캡처를 먼저 돌리고, 캡처를 못 채운
// 소제목만 기존 이슈 수집이 이어서 채운다 (배선은 headingImageGen.ts).
// Inline bundle = single scope → top-level identifiers prefixed docCapture*.

import { ensureIssueCopyrightConsent } from './issueCollectConsent.js';

declare function getCurrentImageHeadings(): any[];
declare function displayGeneratedImages(images: any[]): void;
declare function updatePromptItemsWithImages(images: any[]): void;
declare function updateReserveImagesThumbnails(): void;

const DOC_CAPTURE_CHECKBOX_ID = 'doc-capture-mode-checkbox';
const DOC_CAPTURE_STORAGE_KEY = 'docCaptureModeEnabled';
const DOC_LOG = '[DocCapture]';

export function isDocCaptureModeEnabled(): boolean {
    const checkbox = document.getElementById(DOC_CAPTURE_CHECKBOX_ID) as HTMLInputElement | null;
    return checkbox?.checked ?? false;
}

/** AI 자동 수집 버튼 옆에 공식문서 캡처 체크박스 주입 (localStorage 영속). */
export function injectDocCaptureModeUI(): void {
    if (document.getElementById(DOC_CAPTURE_CHECKBOX_ID)) return;
    const collectBtn = document.getElementById('ai-auto-collect-save-btn');
    if (!collectBtn || !collectBtn.parentElement) return;

    const container = document.createElement('div');
    container.id = `${DOC_CAPTURE_CHECKBOX_ID}-container`;
    container.style.cssText = [
        'background: linear-gradient(135deg, rgba(37, 99, 235, 0.10), rgba(29, 78, 216, 0.05))',
        'border: 1px solid rgba(37, 99, 235, 0.35)',
        'border-radius: 8px', 'padding: 0.7rem', 'margin-top: 0.5rem',
        'display: flex', 'align-items: center', 'gap: 0.5rem',
    ].join(';');

    const savedState = localStorage.getItem(DOC_CAPTURE_STORAGE_KEY) === 'true';
    container.innerHTML = `
    <input type="checkbox" id="${DOC_CAPTURE_CHECKBOX_ID}" ${savedState ? 'checked' : ''}
      style="width: 18px; height: 18px; cursor: pointer; accent-color: #2563eb; flex-shrink: 0;">
    <label for="${DOC_CAPTURE_CHECKBOX_ID}" style="cursor: pointer; font-size: 0.85rem; color: var(--text-strong); display: flex; flex-direction: column; gap: 0.15rem;">
      <span style="font-weight: 600;">🏛️ 공식문서 캡처 (경제·지원금 글)</span>
      <span style="font-size: 0.75rem; color: var(--text-muted);">정부 공식 페이지(go.kr·korea.kr)를 찾아 캡처 → 소제목에 맞게 배치 · 출처 자동 기록 · 남는 소제목은 일반 수집</span>
    </label>`;

    collectBtn.parentElement.insertBefore(container, collectBtn.nextSibling);
    const checkbox = document.getElementById(DOC_CAPTURE_CHECKBOX_ID) as HTMLInputElement;
    checkbox?.addEventListener('change', () => {
        localStorage.setItem(DOC_CAPTURE_STORAGE_KEY, String(checkbox.checked));
    });
    console.log(`${DOC_LOG} ✅ 체크박스 주입 (초기값: ${savedState})`);
}

function docCaptureBuildHeadingInputs(headingTitles: string[]): Array<{ title: string; body?: string }> {
    const sc = (window as any).currentStructuredContent;
    const scHeadings: any[] = Array.isArray(sc?.headings) ? sc.headings : [];
    return headingTitles.map((title) => {
        const match = scHeadings.find((h: any) => String(h?.title || '').trim() === title.trim());
        const body = String(match?.content || match?.body || '').trim();
        return { title, body: body || undefined };
    });
}

/**
 * 공식문서 캡처 실행 + 배치. 배치된 캡처 수를 반환한다.
 * 진행 모달은 이슈 수집과 동일한 aiProgressModal을 사용.
 */
export async function runDocCaptureCollect(
    searchKeyword: string,
    appendLogFn: (msg: string) => void,
): Promise<number> {
    const consent = await ensureIssueCopyrightConsent();
    if (!consent) {
        appendLogFn('⛔ 동의가 없어 공식문서 캡처를 중단했습니다.');
        return 0;
    }

    const currentHeadings = getCurrentImageHeadings();
    const headingTitles: string[] = currentHeadings.map(
        (h: any, i: number) => String(h?.title || '').trim() || `소제목 ${i + 1}`,
    );
    if (headingTitles.length === 0) {
        appendLogFn('⚠️ 소제목이 없습니다. 글 생성 또는 소제목 분석 후 다시 시도하세요.');
        return 0;
    }

    const headingInputs = docCaptureBuildHeadingInputs(headingTitles);
    appendLogFn(`🏛️ 공식문서 캡처 시작: ${headingTitles.length}개 소제목`);

    const progressModal = (window as any).aiProgressModal || null;
    let unsubscribe: (() => void) | undefined;
    try {
        progressModal?.show?.('🏛️ 공식문서 캡처', {
            icon: '🏛️',
            initialLog: '정부 공식 페이지를 찾아 소제목에 맞는 문서 화면을 캡처합니다. (1~3분)',
        });
        progressModal?.update?.(2, '🚀 캡처 파이프라인 시동 중...');
        unsubscribe = (window as any).api?.onDocCaptureProgress?.((info: any) => {
            try {
                if (typeof info?.percent === 'number' && info?.message) {
                    progressModal?.update?.(info.percent, info.message);
                    progressModal?.addLog?.(info.message);
                }
            } catch { /* modal only */ }
        });
    } catch { /* progress UI optional */ }

    let result: any;
    try {
        result = await (window as any).api.captureOfficialDocs({
            title: searchKeyword,
            headings: headingInputs,
            mainKeyword: searchKeyword,
        });
    } catch (ipcError: any) {
        try {
            progressModal?.complete?.(false, { failureTitle: '공식문서 캡처 실패', failureIcon: '❌', failureLog: ipcError?.message || String(ipcError) });
        } catch { /* ignore */ }
        throw ipcError;
    } finally {
        try { unsubscribe?.(); } catch { /* ignore */ }
    }

    if (!result?.success) {
        appendLogFn(`❌ 공식문서 캡처 실패: ${result?.message || '알 수 없는 오류'}`);
        try {
            progressModal?.complete?.(false, { failureTitle: '공식문서 캡처 실패', failureIcon: '❌', failureLog: result?.message || '알 수 없는 오류' });
        } catch { /* ignore */ }
        return 0;
    }

    const captures: any[] = Array.isArray(result.captures) ? result.captures : [];
    const stats = result.stats || {};
    appendLogFn(`📊 공식 페이지 ${stats.pagesVisited ?? 0}개 방문 · ${stats.segmentsCaptured ?? 0}컷 캡처 · ${captures.length}개 소제목 매칭`);

    const ImageManager = (window as any).ImageManager;
    const placedForUI: any[] = [];
    for (const cap of captures) {
        const entry = {
            url: cap.filePath,
            filePath: cap.filePath,
            previewDataUrl: cap.previewDataUrl,
            heading: cap.heading,
            prompt: `공식문서 캡처 — 출처: ${cap.sourceUrl}`,
            timestamp: Date.now(),
            isCollected: true,
            savedToLocal: cap.filePath,
            source: 'official-doc',
            sourceUrl: cap.sourceUrl,
        };
        ImageManager?.addImage?.(cap.heading, entry);
        placedForUI.push({ ...entry });
        appendLogFn(`🏛️ "${cap.heading}" ← ${cap.summary || '공식문서'} (출처: ${cap.sourceUrl.slice(0, 60)})`);
    }

    if (placedForUI.length > 0) {
        try {
            (window as any).generatedImages = placedForUI;
            (window as any).imageManagementGeneratedImages = placedForUI;
            try { displayGeneratedImages(placedForUI); } catch { /* grid not mounted */ }
            try { updatePromptItemsWithImages(placedForUI); } catch { /* cards not mounted */ }
            try { updateReserveImagesThumbnails(); } catch { /* reserve UI not mounted */ }
        } catch (e: any) {
            console.warn(`${DOC_LOG} UI 갱신 실패 (배치는 정상): ${e?.message}`);
        }
    }

    try {
        progressModal?.complete?.(true, {
            successTitle: '공식문서 캡처 완료',
            successIcon: '🏛️',
            successLog: `${captures.length}개 소제목에 공식 캡처 배치 · 잔여 소제목은 일반 수집으로 이어집니다`,
        });
    } catch { /* ignore */ }
    return captures.length;
}
