// src/automation/imageIdentity.ts
// [2026-09-10] "이 사진을 이미 넣었는가"를 판정하는 순수 신원 비교기.
//
// 왜 필요한가 (2026-09-09 발행 로그로 확정): 같은 사진이 파이프라인 안에서 **두 개의
// 문자열 공간**으로 갈라진다.
//   - 서론 대표사진: resolved.thumbnailPath = data: URL (로그 `thumbnailPath=data:(5033643자)`)
//   - 본문 사진:     ImageManager 가 준 data URL 사본, 또는 저장된 .jpg 파일 경로
// 기존 중복 제거는 `filePath || url` 한 개 키만 Set 과 비교해, 공간이 다르면 같은 사진이
// 그대로 통과했다 — 썸네일이 1번 소제목에 또 박히던 원인이다.
//
// 그래서 신원을 한 개 문자열이 아니라 **그 이미지가 가진 모든 키의 집합**으로 본다.
// 하나라도 겹치면 같은 사진이다. 반대로 키가 하나도 없으면 막지 않는다 — 근거 없이
// 걸러내면 글에서 사진이 통째로 사라진다(실측 사고 이력).

/** 한 이미지의 신원이 될 수 있는 필드들. 순서는 구체적인 것부터. */
const IDENTITY_FIELDS = ['filePath', 'url', 'savedToLocal', 'previewDataUrl'] as const;

/** 이 이미지가 가진 신원 키들(빈 값·중복 제거). */
export function imageIdentityKeys(image: unknown): string[] {
  if (!image || typeof image !== 'object') return [];
  const record = image as Record<string, unknown>;
  const keys: string[] = [];
  for (const field of IDENTITY_FIELDS) {
    const value = String(record[field] ?? '').trim();
    if (value && !keys.includes(value)) keys.push(value);
  }
  return keys;
}

/** 이미 삽입한 사진인가. 신원 키가 하나도 없으면 false — 근거 없이 버리지 않는다. */
export function isImageAlreadyUsed(used: Set<string>, image: unknown): boolean {
  return imageIdentityKeys(image).some((key) => used.has(key));
}

/** 이 사진을 "썼다"고 등록한다. 나중에 어느 공간으로 다시 나타나도 잡히도록 전부 넣는다. */
export function registerUsedImage(used: Set<string>, image: unknown): void {
  for (const key of imageIdentityKeys(image)) used.add(key);
}

/**
 * 서론에 들어갈 대표사진의 신원을 미리 등록한다.
 *
 * 대표사진은 본문 목록과 다른 공간(data URL)으로 넘어오므로, 본문 삽입이 시작되기 전에
 * 양쪽 공간의 키를 모두 넣어 둬야 1번 소제목에서 같은 사진이 다시 잡히지 않는다.
 * 대표사진이 본문에 없는 전용 파일이면 겹치는 키가 없어 아무 것도 걸러지지 않는다.
 */
export function seedThumbnailIdentity(used: Set<string>, resolved: unknown): void {
  if (!resolved || typeof resolved !== 'object') return;
  const record = resolved as Record<string, unknown>;

  const thumbnailPath = String(record.thumbnailPath ?? '').trim();
  if (thumbnailPath) used.add(thumbnailPath);

  const images = Array.isArray(record.images) ? record.images : [];
  for (const image of images) {
    if (!image || typeof image !== 'object') continue;
    if ((image as Record<string, unknown>).isThumbnail !== true) continue;
    registerUsedImage(used, image);
  }
}
