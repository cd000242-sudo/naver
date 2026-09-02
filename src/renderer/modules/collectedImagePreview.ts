/**
 * Shapes collected shopping images for the progress modal preview grid.
 *
 * [2026-09-02 사장님 화면] 수집 8장인데 모달은 "1개" + "Image preview unavailable".
 * collectedImages 원소는 객체({url, filePath, heading, …})다(publishingHandlers 수집 직후, types/index.ts).
 * 모달에 넘기던 자리가 원소를 문자열로 취급해 { url: <객체> } 로 감쌌다 — 주소가 전부
 * "[object Object]" 가 되어 중복 제거가 8→1 로 뭉갰고, 그 하나도 불러오지 못했다.
 * 형태를 보고 감싼다: 문자열이면 url, 객체면 url/filePath 를 그대로 넘긴다.
 * 첫 장은 대표 이미지다 — 썸네일 자리를 그것이 맡는다.
 */
export interface CollectedImagePreviewEntry {
  readonly url: string;
  readonly filePath?: string;
  readonly heading: string;
}

function collectedImagePreviewLabel(index: number): string {
  return index === 0 ? '대표 이미지' : `이미지 ${index}`;
}

export function toCollectedImagePreview(entry: unknown, index: number): CollectedImagePreviewEntry | null {
  const heading = collectedImagePreviewLabel(index);
  if (typeof entry === 'string') {
    const url = entry.trim();
    return url ? { url, heading } : null;
  }
  if (entry && typeof entry === 'object') {
    const record = entry as Record<string, unknown>;
    const url = String(record.url || record.thumbnailUrl || '').trim();
    const filePath = String(record.filePath || record.savedToLocal || '').trim();
    if (!url && !filePath) return null;
    return filePath ? { url, filePath, heading } : { url, heading };
  }
  return null;
}

export function toCollectedImagePreviews(entries: readonly unknown[] | null | undefined, limit: number = 10): CollectedImagePreviewEntry[] {
  return (entries || [])
    .slice(0, Math.max(0, limit))
    .map((entry, index) => toCollectedImagePreview(entry, index))
    .filter((entry): entry is CollectedImagePreviewEntry => entry !== null);
}
