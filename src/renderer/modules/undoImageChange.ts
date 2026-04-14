// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 이미지 변경 취소(Undo) 모듈
// renderer.ts에서 추출된 undoLastImageChange 함수
// ═══════════════════════════════════════════════════════════════════

// ✅ renderer.ts의 전역 변수/함수 참조 (실제 사용되는 것만)
declare const ImageManager: any;
declare const toastManager: any;
declare function appendLog(msg: string, ...args: any[]): void;
declare function syncGlobalImagesFromImageManager(): void;
declare const imageHistoryStack: any[];

export function undoLastImageChange(): void {
  if (imageHistoryStack.length === 0) {
    if (typeof (toastManager as any)?.warning === 'function') {
      (toastManager as any).warning('되돌릴 이미지 변경 내역이 없습니다.');
    }
    return;
  }

  const snapshot = imageHistoryStack.pop()!;
  try {
    ImageManager.imageMap.clear();
    snapshot.forEach((entry: any) => {
      const clonedImages = entry.images.map((img: any) => ({ ...img }));
      ImageManager.imageMap.set(entry.heading, clonedImages);
    });

    syncGlobalImagesFromImageManager();
    ImageManager.syncAllPreviews();

    if (typeof (toastManager as any)?.success === 'function') {
      (toastManager as any).success('마지막 이미지 변경을 되돌렸습니다.');
    }
    appendLog('↩️ 마지막 이미지 변경을 되돌렸습니다.', 'images-log-output');
  } catch (error) {
    console.error('[ImageHistory] undo 실패:', error);
    if (typeof (toastManager as any)?.error === 'function') {
      (toastManager as any).error('이미지 되돌리기 중 오류가 발생했습니다.');
    }
  }
}
