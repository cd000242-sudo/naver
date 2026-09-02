/**
 * Tracks where a renderer-driven "one image per IPC call" loop currently is, so the shared
 * image-preview bridge can place each incoming image on its own tile.
 *
 * [2026-09-02 사장님] 이미지 관리 탭 "프롬프트대로 이미지 생성" 은 소제목마다 IPC 를 한 번씩 부른다
 * (headingImageGen → regenerateSingleImageForHeading). main 은 호출마다 index 0 / total 1 을 보내고,
 * 브리지는 그대로 updateSingleImage(0, …) 을 불러 1번 타일만 계속 바뀌었다 — "1번 이미지가
 * 생성된 이미지를 하나씩 똑같이 보여준다". IPC 는 루프의 자리를 모른다. 루프가 알려준다.
 *
 * 배치 안에서 한 장짜리 이벤트(total 1)만 자리를 옮긴다. 여러 장 이벤트는 자기 index 를 안다.
 * 배치를 끝내지 못한 채 죽어도 오래된 배치는 무시한다.
 */
interface ImagePreviewBatchState {
  readonly total: number;
  readonly slot: number;
  readonly startedAt: number;
}

const IMAGE_PREVIEW_BATCH_MAX_AGE_MS = 30 * 60 * 1000;

let activeImagePreviewBatch: ImagePreviewBatchState | null = null;

export function beginImagePreviewBatch(total: number): void {
  activeImagePreviewBatch = total > 1 ? { total, slot: 0, startedAt: Date.now() } : null;
}

export function setImagePreviewBatchSlot(slot: number): void {
  if (!activeImagePreviewBatch) return;
  activeImagePreviewBatch = { ...activeImagePreviewBatch, slot: Math.max(0, Math.floor(slot)) };
}

export function endImagePreviewBatch(): void {
  activeImagePreviewBatch = null;
}

export function resolveImagePreviewPosition(index: number, total: number): { readonly index: number; readonly total: number } {
  const batch = activeImagePreviewBatch;
  if (!batch) return { index, total };
  if (Date.now() - batch.startedAt > IMAGE_PREVIEW_BATCH_MAX_AGE_MS) {
    activeImagePreviewBatch = null;
    return { index, total };
  }
  if (total > 1) return { index, total };
  return { index: batch.slot, total: batch.total };
}
